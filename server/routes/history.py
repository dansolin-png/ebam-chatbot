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
import decimal
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta

import boto3
from fastapi import APIRouter, HTTPException, Depends

import dynamo_history as dh
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
    List S3 day prefixes that have lead objects AND are older than 30 days.
    """
    cutoff = _cutoff_date()
    try:
        all_days = _list_s3_days()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 listing failed: {e}")

    eligible = [d for d in all_days if d <= cutoff]
    fetched_dates = {fd["date"] for fd in dh.list_fetched_dates()}

    return [
        {
            "date":     d,
            "fetched":  d in fetched_dates,
        }
        for d in eligible
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
    cutoff = _cutoff_date()
    if date > cutoff:
        raise HTTPException(
            status_code=400,
            detail=f"Date {date} is within the last 30 days. Only dates on or before {cutoff} are available as historical data.",
        )

    try:
        keys = _list_objects_for_date(date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 listing failed: {e}")

    if not keys:
        return {"message": f"No lead objects found in S3 for {date}", "loaded": 0}

    # Clear existing records for this date before re-loading (idempotent)
    if dh.date_already_fetched(date):
        dh.delete_records_for_date(date)

    records = []
    errors  = 0
    for key in keys:
        try:
            resp     = _s3.get_object(Bucket=_BUCKET, Key=key)
            payload  = json.loads(resp["Body"].read())

            # Extract record_type from the key suffix (_partial, _complete, _timeout)
            key_base = key.rsplit("/", 1)[-1].replace(".json", "")
            suffix   = key_base.split("_")[-1] if "_" in key_base else "unknown"
            record_type = suffix if suffix in ("partial", "complete", "timeout") else "unknown"

            lead     = payload.get("lead", {})
            collected = payload.get("collected_data", {})
            conversation = payload.get("conversation", [])

            records.append({
                "history_id":         str(uuid.uuid4()),
                "fetch_date":         date,
                "session_id":         payload.get("session_id", ""),
                "s3_key":             key,
                "record_type":        record_type,
                "name":               lead.get("name") or collected.get("name", ""),
                "email":              lead.get("email") or collected.get("email", ""),
                "phone":              lead.get("phone") or collected.get("phone", ""),
                "user_type":          payload.get("audience", ""),
                "collected_data":     collected,
                "conversation":       conversation,
                "original_created_at": payload.get("created_at", ""),
                "fetched_at":         datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            log.error(f"Failed to load S3 key {key}: {e}")
            errors += 1

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
