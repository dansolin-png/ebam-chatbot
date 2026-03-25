"""
Orchestrates writing a lead to the compliance S3 WORM bucket.
Supports three record types:
  - partial  : name+email collected, conversation still in progress
  - complete : conversation reached is_end=True
  - timeout  : session went idle with name+email but never completed
"""
import logging
from datetime import datetime, timezone

import compliance as comp
import dynamo_compliance as dbc
import dynamo as db
import s3_compliance as s3c

log = logging.getLogger(__name__)


def store_lead(session: dict, messages: list, record_type: str = "partial"):
    """
    Write lead + conversation to S3 WORM, compute chain hash, save to DynamoDB.
    record_type: 'partial' | 'complete' | 'timeout'
    Deduplicates: if a complete record already exists for this session, skip.
    """
    session_id        = session["session_id"]
    compliance_status = session.get("compliance_status", "none")

    # Never overwrite a complete record
    if compliance_status == "complete":
        log.info(f"Skipping compliance store for {session_id} — already complete")
        return None

    # Don't store a partial if one already exists (unless upgrading to complete/timeout)
    if compliance_status == "partial" and record_type == "partial":
        log.info(f"Skipping duplicate partial store for {session_id}")
        return None

    now       = datetime.now(timezone.utc)
    date_str  = now.strftime("%Y-%m-%d")
    timestamp = now.isoformat()
    record_id = comp.build_record_id(date_str)

    # Build S3 payload
    payload = comp.build_s3_object(session, messages, record_type=record_type)

    # Write to S3 WORM (key includes record_type to allow partial + complete for same session)
    s3_key, raw_bytes = s3c.put_lead_object(session_id, date_str, payload, suffix=record_type)

    # Compute hashes
    data_hash     = comp.compute_data_hash(raw_bytes)
    previous_hash = dbc.get_last_record_hash(date_str)
    record_hash   = comp.compute_record_hash(previous_hash, data_hash, timestamp, record_id)

    # Save to DynamoDB compliance table
    record = {
        "record_id":     record_id,
        "batch_id":      date_str,
        "session_id":    session_id,
        "record_type":   record_type,
        "s3_key":        s3_key,
        "data_hash":     data_hash,
        "previous_hash": previous_hash,
        "record_hash":   record_hash,
        "timestamp":     timestamp,
        "merkle_proof":  [],
        "merkle_index":  -1,
    }
    dbc.save_compliance_record(record)

    # Update session compliance_status
    db.update_session(session_id, compliance_status=record_type, last_activity_at=timestamp)

    log.info(f"Compliance [{record_type}] stored: {record_id} → {s3_key}")
    return record_id
