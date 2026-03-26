"""
Orchestrates writing a lead to the compliance S3 WORM bucket.
Supports three record types:
  - partial  : name+email collected, conversation still in progress
  - complete : conversation reached is_end=True
  - timeout  : session went idle with name+email but never completed

Atomic chain write
------------------
Instead of a two-step read-then-write, the hash chain tip is advanced inside a
DynamoDB Transaction together with the new record insert (see
dynamo_compliance.write_compliance_record_atomic).  If two writes land at the
exact same moment and both read the same previous_hash, one transaction wins
and the other raises ChainTipConflict.  We retry up to _MAX_CHAIN_RETRIES
times with a fresh tip each attempt, giving us serialised ordering without any
additional infrastructure.
"""
import logging
from datetime import datetime, timezone

import compliance as comp
import dynamo_compliance as dbc
import dynamo as db
import s3_compliance as s3c
import sns_client as sns

log = logging.getLogger(__name__)

_MAX_CHAIN_RETRIES = 5


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

    # Never re-store a timeout record (idle scanner runs repeatedly)
    if compliance_status == "timeout" and record_type == "timeout":
        log.info(f"Skipping duplicate timeout store for {session_id}")
        return None

    # Don't store a partial if one already exists (unless upgrading to complete/timeout)
    if compliance_status == "partial" and record_type == "partial":
        log.info(f"Skipping duplicate partial store for {session_id}")
        return None

    now       = datetime.now(timezone.utc)
    date_str  = now.strftime("%Y-%m-%d")
    timestamp = now.isoformat()
    record_id = comp.build_record_id(date_str)

    # Build S3 payload and write to WORM first.
    # S3 write is outside the retry loop — the s3_key and data_hash are stable
    # across retries; only previous_hash and record_hash change.
    payload             = comp.build_s3_object(session, messages, record_type=record_type)
    s3_key, raw_bytes   = s3c.put_lead_object(session_id, date_str, payload, suffix=record_type)
    data_hash           = comp.compute_data_hash(raw_bytes)

    # Atomic chain write with optimistic-locking retry.
    # On a ChainTipConflict we re-read the tip (another write landed first)
    # and recompute record_hash before trying again.
    for attempt in range(_MAX_CHAIN_RETRIES):
        previous_hash = dbc.get_chain_tip(date_str)
        record_hash   = comp.compute_record_hash(previous_hash, data_hash, timestamp, record_id)

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

        try:
            dbc.write_compliance_record_atomic(record, previous_hash)
            break  # transaction succeeded
        except dbc.ChainTipConflict:
            if attempt == _MAX_CHAIN_RETRIES - 1:
                log.error(
                    f"Chain tip conflict unresolved after {_MAX_CHAIN_RETRIES} retries "
                    f"for session {session_id}"
                )
                sns.publish_alert(
                    f"[EBAM CRITICAL] Chain tip conflict unresolved for session {session_id}",
                    f"Compliance record could NOT be written for session {session_id}.\n"
                    f"All {_MAX_CHAIN_RETRIES} atomic write retries failed (ChainTipConflict).\n"
                    f"Record type: {record_type}\n"
                    f"Manual intervention may be required to store this lead.",
                )
                raise
            log.warning(
                f"Chain tip conflict for {session_id} — "
                f"retry {attempt + 1}/{_MAX_CHAIN_RETRIES}"
            )

    # Update session compliance_status
    db.update_session(session_id, compliance_status=record_type, last_activity_at=timestamp)

    log.info(f"Compliance [{record_type}] stored: {record_id} → {s3_key}")
    return record_id
