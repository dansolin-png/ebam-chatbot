"""
DynamoDB client and table helpers — replaces SQLAlchemy database.py + models.py
"""
import os
import uuid
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from dotenv import load_dotenv

# Only load .env locally — in Lambda, env vars are set directly in the function config.
# Loading .env in Lambda would inject AWS_PROFILE=ebam, breaking boto3 credential resolution.
_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))
if not _is_lambda:
    load_dotenv()

_TTL_DAYS = 30   # sessions/messages/leads auto-expire after 30 days


def _ttl_30d() -> int:
    from datetime import timedelta
    return int((datetime.now(timezone.utc) + timedelta(days=_TTL_DAYS)).timestamp())


# In Lambda, use IAM role (no profile). Locally, use AWS_PROFILE.
_session = boto3.Session(
    profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)
_dynamodb = _session.resource("dynamodb")

# Table references
tbl_sessions            = _dynamodb.Table("ebam-sessions")
tbl_messages            = _dynamodb.Table("ebam-messages")
tbl_leads               = _dynamodb.Table("ebam-leads")
tbl_flow_configs        = _dynamodb.Table("ebam-flow-configs")
tbl_chatbot_config      = _dynamodb.Table("ebam-chatbot-config")
tbl_admin_users         = _dynamodb.Table("ebam-admin-users")
tbl_config_history      = _dynamodb.Table("ebam-config-history")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def get_session(session_id: str) -> dict | None:
    r = tbl_sessions.get_item(Key={"session_id": session_id})
    return r.get("Item")


def create_session(session_id: str, user_type: str) -> dict:
    item = {
        "session_id":        session_id,
        "current_state":     "start",
        "previous_state":    None,
        "collected_data":    {},
        "user_type":         user_type,
        "is_complete":       False,
        "created_at":        now_iso(),
        "last_activity_at":  now_iso(),
        "compliance_status": "none",
        "ttl":               _ttl_30d(),
    }
    tbl_sessions.put_item(Item=item)
    return item


def get_idle_sessions(idle_minutes: int = 30) -> list[dict]:
    """Return sessions with name+email collected, incomplete, and idle > idle_minutes."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=idle_minutes)).isoformat()
    # Use Attr conditions to avoid reserved-word conflicts and handle missing compliance_status
    result = tbl_sessions.scan(
        FilterExpression=(
            Attr("is_complete").eq(False) &
            Attr("last_activity_at").lt(cutoff) &
            (Attr("compliance_status").not_exists() |
             (Attr("compliance_status").ne("complete") & Attr("compliance_status").ne("timeout")))
        )
    )
    # Only return sessions with name + email collected
    return [
        s for s in result.get("Items", [])
        if s.get("collected_data", {}).get("name")
        and s.get("collected_data", {}).get("email")
    ]


def update_session(session_id: str, **kwargs):
    if not kwargs:
        return
    exprs   = []
    names   = {}
    values  = {}
    for i, (k, v) in enumerate(kwargs.items()):
        placeholder = f"#f{i}"
        val_key     = f":v{i}"
        names[placeholder]  = k
        values[val_key]     = v
        exprs.append(f"{placeholder} = {val_key}")
    tbl_sessions.update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET " + ", ".join(exprs),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def add_message(session_id: str, role: str, content: str, state_id: str = None) -> dict:
    item = {
        "message_id": new_id(),
        "session_id": session_id,
        "role":       role,
        "content":    content,
        "state_id":   state_id or "",
        "created_at": now_iso(),
        "ttl":        _ttl_30d(),
    }
    tbl_messages.put_item(Item=item)
    return item


def get_messages(session_id: str) -> list[dict]:
    r = tbl_messages.query(
        IndexName="session_id-created_at-index",
        KeyConditionExpression=Key("session_id").eq(session_id),
        ScanIndexForward=True,
    )
    return r.get("Items", [])


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

def get_lead_by_session(session_id: str) -> dict | None:
    r = tbl_leads.query(
        IndexName="session_id-index",
        KeyConditionExpression=Key("session_id").eq(session_id),
        Limit=1,
    )
    items = r.get("Items", [])
    return items[0] if items else None


def upsert_lead(session: dict):
    existing = get_lead_by_session(session["session_id"])
    if existing:
        return
    data = {k: v for k, v in (session.get("collected_data") or {}).items() if not k.startswith("__")}
    item = {
        "lead_id":        new_id(),
        "session_id":     session["session_id"],
        "name":           data.get("name", ""),
        "email":          data.get("email", ""),
        "user_type":      session.get("user_type", ""),
        "collected_data": data,
        "created_at":     now_iso(),
        "ttl":            _ttl_30d(),
    }
    tbl_leads.put_item(Item=item)


def list_leads() -> list[dict]:
    items = []
    resp = tbl_leads.scan()
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = tbl_leads.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)


def delete_lead(lead_id: str):
    tbl_leads.delete_item(Key={"lead_id": lead_id})


def delete_all_data():
    for item in tbl_leads.scan().get("Items", []):
        tbl_leads.delete_item(Key={"lead_id": item["lead_id"]})
    for item in tbl_messages.scan().get("Items", []):
        tbl_messages.delete_item(Key={"message_id": item["message_id"]})
    for item in tbl_sessions.scan().get("Items", []):
        tbl_sessions.delete_item(Key={"session_id": item["session_id"]})


# ---------------------------------------------------------------------------
# Flow Configs
# ---------------------------------------------------------------------------

def get_flow_config(name: str) -> dict | None:
    r = tbl_flow_configs.get_item(Key={"name": name})
    item = r.get("Item")
    return item.get("flow_json") if item else None


def save_flow_config(name: str, flow_json: dict):
    tbl_flow_configs.put_item(Item={
        "name":       name,
        "flow_json":  flow_json,
        "updated_at": now_iso(),
    })


def delete_flow_config(name: str):
    tbl_flow_configs.delete_item(Key={"name": name})


# ---------------------------------------------------------------------------
# Chatbot Config
# ---------------------------------------------------------------------------

def get_chatbot_config() -> dict | None:
    r = tbl_chatbot_config.get_item(Key={"config_id": "active"})
    item = r.get("Item")
    return item.get("config_json") if item else None


def save_chatbot_config(config_json: dict):
    tbl_chatbot_config.put_item(Item={
        "config_id":   "active",
        "config_json": config_json,
        "updated_at":  now_iso(),
    })


def delete_chatbot_config():
    tbl_chatbot_config.delete_item(Key={"config_id": "active"})


# ---------------------------------------------------------------------------
# Admin Users
# ---------------------------------------------------------------------------

def get_admin_user(username: str) -> dict | None:
    r = tbl_admin_users.get_item(Key={"username": username})
    return r.get("Item")


def list_admin_users() -> list[dict]:
    resp = tbl_admin_users.scan()
    items = resp.get("Items", [])
    return sorted(items, key=lambda x: x.get("created_at", ""))


def create_admin_user(username: str, password_hash: str):
    tbl_admin_users.put_item(Item={
        "username":      username,
        "id":            new_id(),
        "password_hash": password_hash,
        "created_at":    now_iso(),
    })


def update_admin_user_password(username: str, password_hash: str):
    tbl_admin_users.update_item(
        Key={"username": username},
        UpdateExpression="SET password_hash = :h",
        ExpressionAttributeValues={":h": password_hash},
    )


def delete_admin_user(username: str):
    tbl_admin_users.delete_item(Key={"username": username})


# ---------------------------------------------------------------------------
# Config Change History
# Table: ebam-config-history
# PK: config_type  (e.g. "chatbot" | "flow:advisor" | "flow:cpa")
# SK: changed_at   (ISO timestamp — unique per save)
# ---------------------------------------------------------------------------

_HISTORY_LIMIT = 50  # keep last N versions per config type

def record_config_change(config_type: str, snapshot: dict, changed_by: str = "admin"):
    """Write a versioned snapshot to the history table."""
    ts = now_iso()
    tbl_config_history.put_item(Item={
        "config_type": config_type,
        "changed_at":  ts,
        "snapshot":    snapshot,
        "changed_by":  changed_by,
    })


def list_config_history(config_type: str, limit: int = _HISTORY_LIMIT) -> list[dict]:
    """Return recent history entries for a config type, newest first."""
    from boto3.dynamodb.conditions import Key as DKey
    resp = tbl_config_history.query(
        KeyConditionExpression=DKey("config_type").eq(config_type),
        ScanIndexForward=False,   # newest first
        Limit=limit,
    )
    items = resp.get("Items", [])
    # Strip the heavy snapshot from list view — caller fetches full item if needed
    return [
        {"config_type": i["config_type"], "changed_at": i["changed_at"], "changed_by": i.get("changed_by", "admin")}
        for i in items
    ]


def get_config_history_entry(config_type: str, changed_at: str) -> dict | None:
    """Return the full snapshot for a specific history entry."""
    r = tbl_config_history.get_item(Key={"config_type": config_type, "changed_at": changed_at})
    return r.get("Item")
