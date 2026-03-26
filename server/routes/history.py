"""
Historical Leads API — fetch lead data older than 30 days from S3 WORM.

  GET  /api/history/available-days      — list S3 days that have lead objects
  POST /api/history/fetch/{date}        — load a specific day from S3 into history table
  GET  /api/history/dates               — list dates already fetched into history table
  GET  /api/history/leads               — all records in history table
  GET  /api/history/leads/{date}        — records for a specific date
  DELETE /api/history/leads/{date}      — delete all records for a specific date
  DELETE /api/history/leads             — delete ALL history records
"""
import base64
import decimal
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta

import boto3
from fastapi import APIRouter, HTTPException, Depends

import compliance as comp
import dynamo_compliance as dbc
import dynamo_history as dh
import kms_client as kms
import s3_compliance as s3c
import sns_client as sns
from routes.auth import require_auth as require_admin

log = logging.getLogger(__name__)
router = APIRouter(prefix="/history", tags=["history"])

_REGION = "us-east-1"
_BUCKET = "ebam-compliance-leads"

import os
_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))
_boto_session = boto3.Session(
    profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
    region_name=_REGION,
)
_s3 = _boto_session.client("s3")

_MIN_HISTORY_DAYS = 30   # data must be older than this to appear in history


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cutoff_date() -> str:
    """YYYY-MM-DD — data on or before this date is eligible for history retrieval."""
    return (datetime.now(timezone.utc) - timedelta(days=_MIN_HISTORY_DAYS)).strftime("%Y-%m-%d")


def _list_s3_days(prefix: str = "leads/") -> list[str]:
    """
    Walk S3 'leads/' prefix and collect unique day prefixes (YYYY-MM-DD strings).
    Keys look like: leads/YYYY/MM/DD/{session_id}_suffix.json
    """
    paginator = _s3.get_paginator("list_objects_v2")
    days = set()
    for page in paginator.paginate(Bucket=_BUCKET, Prefix=prefix, Delimiter="/"):
        for cp in page.get("CommonPrefixes", []):
            # cp["Prefix"] e.g. "leads/2026/"
            year_prefix = cp["Prefix"]
            for page2 in paginator.paginate(Bucket=_BUCKET, Prefix=year_prefix, Delimiter="/"):
                for cp2 in page2.get("CommonPrefixes", []):
                    month_prefix = cp2["Prefix"]
                    for page3 in paginator.paginate(Bucket=_BUCKET, Prefix=month_prefix, Delimiter="/"):
                        for cp3 in page3.get("CommonPrefixes", []):
                            # cp3["Prefix"] e.g. "leads/2026/01/15/"
                            parts = cp3["Prefix"].rstrip("/").split("/")
                            if len(parts) == 4:
                                _, year, month, day = parts
                                days.add(f"{year}-{month}-{day}")
    return sorted(days, reverse=True)


def _list_objects_for_date(date_str: str) -> list[str]:
    """Return all S3 keys under leads/YYYY/MM/DD/."""
    year, month, day = date_str.split("-")
    prefix = f"leads/{year}/{month}/{day}/"
    paginator = _s3.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


def _serialize(obj):
    """Convert DynamoDB Decimal / bytes to JSON-safe types."""
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, decimal.Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, bytes):
        import base64
        return base64.b64encode(obj).decode()
    return obj


def _best_record_per_session(records: list[dict]) -> list[dict]:
    """
    When a session has both partial and complete S3 objects, keep only the
    best one: complete > timeout > partial.
    """
    rank = {"complete": 0, "timeout": 1, "partial": 2}
    best = {}
    for r in records:
        sid = r.get("session_id", r["history_id"])
        rt  = r.get("record_type", "partial")
        if sid not in best or rank.get(rt, 9) < rank.get(best[sid].get("record_type", "partial"), 9):
            best[sid] = r
    return sorted(best.values(), key=lambda x: x.get("original_created_at", ""))


# ---------------------------------------------------------------------------
# GET /api/history/available-days
# ---------------------------------------------------------------------------

@router.get("/available-days")
def available_days(_=Depends(require_admin)):
    """
    List S3 day prefixes that have lead objects and are older than MIN_HISTORY_DAYS.
    Data within the last 30 days is accessible via the Leads section.
    """
    try:
        all_days = _list_s3_days()
    except Exception as e:
        sns.publish_exception_alert("history available_days S3 listing", e)
        raise HTTPException(status_code=500, detail=f"S3 listing failed: {e}")

    cutoff = _cutoff_date()
    fetched_dates = {fd["date"] for fd in dh.list_fetched_dates()}

    return [
        {
            "date":     d,
            "fetched":  d in fetched_dates,
        }
        for d in all_days
        if d <= cutoff   # only expose data older than 30 days
    ]


# ---------------------------------------------------------------------------
# POST /api/history/fetch/{date}
# ---------------------------------------------------------------------------

@router.post("/fetch/{date}")
def fetch_date(date: str, _=Depends(require_admin)):
    """
    Load all S3 lead objects for a given date into the history DynamoDB table.
    Idempotent — re-fetching overwrites existing records for that date first.
    """

    try:
        keys = _list_objects_for_date(date)
    except Exception as e:
        sns.publish_exception_alert(f"history fetch_date {date} S3 listing", e)
        raise HTTPException(status_code=500, detail=f"S3 listing failed: {e}")

    if not keys:
        return {"message": f"No lead objects found in S3 for {date}", "loaded": 0}

    # Clear existing records for this date before re-loading (idempotent)
    if dh.date_already_fetched(date):
        dh.delete_records_for_date(date)

    _RANK = {"complete": 0, "timeout": 1, "partial": 2, "unknown": 3}
    best   = {}   # session_id -> best record dict
    errors = 0
    fetched_at = datetime.now(timezone.utc).isoformat()

    for key in keys:
        try:
            resp     = _s3.get_object(Bucket=_BUCKET, Key=key)
            payload  = json.loads(resp["Body"].read())

            key_base    = key.rsplit("/", 1)[-1].replace(".json", "")
            suffix      = key_base.split("_")[-1] if "_" in key_base else "unknown"
            record_type = suffix if suffix in ("partial", "complete", "timeout") else "unknown"

            session_id = payload.get("session_id", key)   # fallback to key if missing
            lead       = payload.get("lead", {})
            collected  = payload.get("collected_data", {})

            candidate = {
                "history_id":          str(uuid.uuid4()),
                "fetch_date":          date,
                "session_id":          session_id,
                "s3_key":              key,
                "record_type":         record_type,
                "name":                lead.get("name") or collected.get("name", ""),
                "email":               lead.get("email") or collected.get("email", ""),
                "phone":               lead.get("phone") or collected.get("phone", ""),
                "user_type":           payload.get("audience", ""),
                "collected_data":      collected,
                "conversation":        payload.get("conversation", []),
                "original_created_at": payload.get("created_at", ""),
                "fetched_at":          fetched_at,
            }

            # Keep only the best record per session: complete > timeout > partial
            existing = best.get(session_id)
            if existing is None or _RANK.get(record_type, 9) < _RANK.get(existing["record_type"], 9):
                best[session_id] = candidate

        except Exception as e:
            log.error(f"Failed to load S3 key {key}: {e}")
            sns.publish_exception_alert(f"history fetch_date {date} key {key}", e)
            errors += 1

    records = list(best.values())
    if records:
        dh.batch_save_history_records(records)

    return {
        "message": f"Loaded {len(records)} records for {date}",
        "date":    date,
        "loaded":  len(records),
        "errors":  errors,
    }


# ---------------------------------------------------------------------------
# GET /api/history/dates
# ---------------------------------------------------------------------------

@router.get("/dates")
def list_dates(_=Depends(require_admin)):
    """List dates that have been fetched into the history table, with counts."""
    return dh.list_fetched_dates()


# ---------------------------------------------------------------------------
# GET /api/history/leads
# ---------------------------------------------------------------------------

@router.get("/leads")
def list_all_leads(_=Depends(require_admin)):
    records = dh.list_all_history_records()
    # Deduplicate: best record per session per date
    return [_serialize(r) for r in records]


# ---------------------------------------------------------------------------
# GET /api/history/leads/{date}
# ---------------------------------------------------------------------------

@router.get("/leads/{date}")
def list_leads_for_date(date: str, _=Depends(require_admin)):
    records = dh.get_records_for_date(date)
    deduped = _best_record_per_session(records)
    return [_serialize(r) for r in deduped]


# ---------------------------------------------------------------------------
# GET /api/history/verify/{history_id}
# ---------------------------------------------------------------------------

@router.get("/verify/{history_id}")
def verify_history_lead(history_id: str, _=Depends(require_admin)):
    """
    Verify a historical lead against the compliance record for its S3 object.
    Performs the same 4-step check as /api/compliance/verify/{record_id}.
    """
    hist = dh.get_history_record(history_id)
    if not hist:
        raise HTTPException(status_code=404, detail="History record not found")

    s3_key = hist.get("s3_key")
    if not s3_key:
        raise HTTPException(status_code=400, detail="History record has no S3 key")

    comp_record = dbc.get_record_by_s3_key(s3_key)
    if not comp_record:
        raise HTTPException(status_code=404, detail="No compliance record found for this lead")

    result = {
        "record_id": comp_record["record_id"],
        "batch_id":  comp_record.get("batch_id"),
        "s3_key":    s3_key,
        "checks": {
            "data_hash":     False,
            "record_hash":   False,
            "merkle_proof":  False,
            "kms_signature": False,
        },
        "valid":  False,
        "detail": "",
    }

    try:
        s3_bytes = s3c.get_lead_object_bytes(s3_key)
        ser_rec  = _serialize(comp_record)
        result["checks"]["data_hash"]   = comp.compute_data_hash(s3_bytes) == comp_record["data_hash"]
        result["checks"]["record_hash"] = comp.verify_record_hash(ser_rec, s3_bytes)

        batch = dbc.get_batch(comp_record["batch_id"])
        if batch and comp_record.get("merkle_proof"):
            result["checks"]["merkle_proof"]  = comp.verify_merkle_proof(
                comp_record["record_hash"],
                comp_record["merkle_proof"],
                batch["merkle_root"],
            )
            sign_payload = batch.get("previous_batch_root", "") + batch["merkle_root"]
            result["checks"]["kms_signature"] = kms.verify_merkle_signature(
                sign_payload, batch["signature"]
            )
        else:
            result["detail"] = "Batch not yet sealed — Merkle proof not available"

        result["valid"] = all(result["checks"].values())

    except Exception as e:
        sns.publish_exception_alert(f"verify_history_lead {history_id}", e)
        result["detail"] = str(e)

    return result


# ---------------------------------------------------------------------------
# DELETE /api/history/leads/{date}
# ---------------------------------------------------------------------------

@router.delete("/leads/{date}")
def delete_date(date: str, _=Depends(require_admin)):
    count = dh.delete_records_for_date(date)
    return {"message": f"Deleted {count} records for {date}", "date": date, "deleted": count}


# ---------------------------------------------------------------------------
# DELETE /api/history/leads
# ---------------------------------------------------------------------------

@router.delete("/leads")
def delete_all(_=Depends(require_admin)):
    count = dh.delete_all_history()
    return {"message": f"Deleted {count} history records", "deleted": count}
