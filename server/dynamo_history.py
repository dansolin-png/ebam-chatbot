"""
DynamoDB helpers for ebam-leads-history table.

Records are written when an admin fetches historical S3 data for a specific date.
They persist until explicitly deleted (no TTL — history is kept indefinitely).
"""
import os
import uuid
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from dotenv import load_dotenv

load_dotenv()

_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))
_session = boto3.Session(
    profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)
_dynamodb = _session.resource("dynamodb")

tbl_history = _dynamodb.Table("ebam-leads-history")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def save_history_record(record: dict):
    """Upsert one history record (idempotent on history_id)."""
    tbl_history.put_item(Item=record)


def batch_save_history_records(records: list[dict]):
    """Write a list of records in DynamoDB batch writes."""
    with tbl_history.batch_writer() as batch:
        for record in records:
            batch.put_item(Item=record)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_history_record(history_id: str) -> dict | None:
    r = tbl_history.get_item(Key={"history_id": history_id})
    return r.get("Item")


def get_records_for_date(fetch_date: str) -> list[dict]:
    """Return all history records for a given fetch_date (YYYY-MM-DD)."""
    r = tbl_history.query(
        IndexName="fetch_date-index",
        KeyConditionExpression=Key("fetch_date").eq(fetch_date),
    )
    items = r.get("Items", [])
    while "LastEvaluatedKey" in r:
        r = tbl_history.query(
            IndexName="fetch_date-index",
            KeyConditionExpression=Key("fetch_date").eq(fetch_date),
            ExclusiveStartKey=r["LastEvaluatedKey"],
        )
        items.extend(r.get("Items", []))
    return sorted(items, key=lambda x: x.get("original_created_at", ""))


def list_all_history_records() -> list[dict]:
    """Full scan — used for the overview table in UI."""
    items = []
    resp = tbl_history.scan()
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = tbl_history.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return sorted(items, key=lambda x: x.get("fetch_date", ""), reverse=True)


def list_fetched_dates() -> list[dict]:
    """Return distinct fetch_date values with count and most recent fetched_at."""
    items = list_all_history_records()
    seen: dict[str, dict] = {}
    for item in items:
        d = item.get("fetch_date")
        if not d:
            continue
        if d not in seen:
            seen[d] = {"count": 0, "fetched_at": ""}
        seen[d]["count"] += 1
        fa = item.get("fetched_at", "")
        if fa > seen[d]["fetched_at"]:
            seen[d]["fetched_at"] = fa
    return [
        {"date": d, "count": v["count"], "fetched_at": v["fetched_at"]}
        for d, v in sorted(seen.items(), reverse=True)
    ]


def date_already_fetched(fetch_date: str) -> bool:
    r = tbl_history.query(
        IndexName="fetch_date-index",
        KeyConditionExpression=Key("fetch_date").eq(fetch_date),
        Limit=1,
        Select="COUNT",
    )
    return r.get("Count", 0) > 0


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_records_for_date(fetch_date: str):
    """Delete all history records for a given date."""
    records = get_records_for_date(fetch_date)
    with tbl_history.batch_writer() as batch:
        for r in records:
            batch.delete_item(Key={"history_id": r["history_id"]})
    return len(records)


def delete_all_history():
    """Delete every record in the history table."""
    items = []
    resp = tbl_history.scan(ProjectionExpression="history_id")
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = tbl_history.scan(
            ProjectionExpression="history_id",
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))

    with tbl_history.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"history_id": item["history_id"]})
    return len(items)
