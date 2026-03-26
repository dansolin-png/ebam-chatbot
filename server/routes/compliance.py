"""
Compliance API routes.
  POST /api/compliance/batch          — seal today's batch (EventBridge trigger)
  GET  /api/compliance/records        — list compliance records (admin UI)
  GET  /api/compliance/batches        — list batches (admin UI)
  GET  /api/compliance/verify/{id}    — full verification of a single record
  GET  /api/compliance/batch/{id}     — batch detail
"""
import asyncio
import base64
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

import compliance as comp
import compliance_store
import dynamo as db
import dynamo_compliance as dbc
import s3_compliance as s3c
import kms_client as kms
import sns_client as sns
from routes.auth import require_auth as require_admin

log = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])


# ---------------------------------------------------------------------------
# POST /api/compliance/batch
# Called by EventBridge daily at 23:59 UTC, or manually from admin
# ---------------------------------------------------------------------------

class BatchRequest(BaseModel):
    batch_id: str | None = None   # defaults to today (UTC)
    source: str | None = None     # "aws.events" | "manual"


@router.post("/batch")
def seal_batch(req: BatchRequest = BatchRequest(), _=Depends(require_admin)):
    batch_id = req.batch_id or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        return _do_seal_batch(batch_id)
    except Exception as e:
        sns.publish_exception_alert(f"seal_batch {batch_id}", e)
        raise


def _do_seal_batch(batch_id: str) -> dict:
    # Check already sealed
    existing = dbc.get_batch(batch_id)
    if existing and existing.get("status") == "sealed":
        return {"message": f"Batch {batch_id} already sealed", "batch": existing}

    records = dbc.get_records_for_batch(batch_id)
    if not records:
        return {"message": f"No records for batch {batch_id}"}

    # Build Merkle tree from record_hashes
    leaf_hashes = [bytes.fromhex(r["record_hash"]) for r in records]
    tree        = comp.build_merkle_tree(leaf_hashes)
    merkle_root = comp.get_merkle_root(tree)

    # Cross-day chain: include the previous day's Merkle root so each batch is
    # cryptographically linked to the one before it.  A missing or dropped day
    # breaks the chain and is detectable during verification.
    prev_date           = (datetime.strptime(batch_id, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_batch          = dbc.get_batch(prev_date)
    previous_batch_root = prev_batch["merkle_root"] if prev_batch else "0" * 64

    # Sign previous_batch_root + merkle_root together so the cross-day link is
    # covered by the KMS signature.  Backward-compatible: old batches that have
    # no previous_batch_root field are verified with the original payload.
    sign_payload = previous_batch_root + merkle_root
    signature    = kms.sign_merkle_root(sign_payload)

    # Build batch manifest
    year, month, day = batch_id.split("-")
    anchor_key = f"batches/{year}/{month}/{day}/batch.json"

    batch = {
        "batch_id":            batch_id,
        "merkle_root":         merkle_root,
        "previous_batch_root": previous_batch_root,
        "record_count":        len(records),
        "start_record_id":     records[0]["record_id"],
        "end_record_id":       records[-1]["record_id"],
        "start_hash":          records[0]["record_hash"],
        "end_hash":            records[-1]["record_hash"],
        "created_at":          datetime.now(timezone.utc).isoformat(),
        "signature":           signature,
        "anchor_s3_key":       anchor_key,
        "status":              "sealed",
    }

    # Write to S3 WORM
    s3c.put_batch_object(batch_id, batch)

    # Save to DynamoDB
    dbc.save_batch(batch)

    # Back-fill Merkle proof into each record
    for i, record in enumerate(records):
        proof = comp.get_merkle_proof(tree, i)
        dbc.update_record_merkle_proof(record["record_id"], proof, i)

    return {"message": "Batch sealed", "batch_id": batch_id, "record_count": len(records), "merkle_root": merkle_root}


# ---------------------------------------------------------------------------
# GET /api/compliance/records
# ---------------------------------------------------------------------------

@router.get("/records")
def list_records(_=Depends(require_admin)):
    records = dbc.list_recent_records(limit=100)
    # Serialise Decimal fields
    return [_serialize(r) for r in records]


# ---------------------------------------------------------------------------
# GET /api/compliance/batches
# ---------------------------------------------------------------------------

@router.get("/batches")
def list_batches(_=Depends(require_admin)):
    batches = dbc.list_batches(limit=30)
    return [_serialize(b) for b in batches]


# ---------------------------------------------------------------------------
# GET /api/compliance/batch/{batch_id}
# ---------------------------------------------------------------------------

@router.get("/batch/{batch_id}")
def get_batch(batch_id: str, _=Depends(require_admin)):
    batch = dbc.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _serialize(batch)


# ---------------------------------------------------------------------------
# GET /api/compliance/verify/{record_id}
# ---------------------------------------------------------------------------

@router.get("/verify/{record_id}")
def verify_record(record_id: str, _=Depends(require_admin)):
    # 1. Fetch record from DynamoDB
    record = dbc.get_compliance_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    result = {
        "record_id":        record_id,
        "batch_id":         record.get("batch_id"),
        "s3_key":           record.get("s3_key"),
        "checks": {
            "data_hash":        False,
            "record_hash":      False,
            "merkle_proof":     False,
            "kms_signature":    False,
        },
        "valid": False,
        "detail": "",
    }

    try:
        # 2. Fetch S3 object and verify data_hash + record_hash
        s3_bytes = s3c.get_lead_object_bytes(record["s3_key"])
        chain_ok = comp.verify_record_hash(_serialize(record), s3_bytes)
        result["checks"]["data_hash"]   = comp.compute_data_hash(s3_bytes) == record["data_hash"]
        result["checks"]["record_hash"] = chain_ok

        # 3. Verify Merkle proof
        batch = dbc.get_batch(record["batch_id"])
        if batch and record.get("merkle_proof"):
            merkle_ok = comp.verify_merkle_proof(
                record["record_hash"],
                record["merkle_proof"],
                batch["merkle_root"],
            )
            result["checks"]["merkle_proof"] = merkle_ok

            # 4. Verify KMS signature.
            # New batches sign previous_batch_root + merkle_root together.
            # Old batches (no previous_batch_root field) signed merkle_root only
            # — represented here as "" + merkle_root = merkle_root (backward-compat).
            sign_payload = batch.get("previous_batch_root", "") + batch["merkle_root"]
            result["checks"]["kms_signature"] = kms.verify_merkle_signature(
                sign_payload, batch["signature"]
            )
        else:
            result["detail"] = "Batch not yet sealed — Merkle proof not available"

        result["valid"] = all(result["checks"].values())

    except Exception as e:
        sns.publish_exception_alert(f"verify_record {record_id}", e)
        result["detail"] = str(e)

    return result


# ---------------------------------------------------------------------------
# GET /api/compliance/verify-session/{session_id}
# ---------------------------------------------------------------------------

@router.get("/verify-session/{session_id}")
def verify_session(session_id: str, _=Depends(require_admin)):
    """
    Verify the best compliance record for a session (complete > timeout > partial).
    Same 4-step check as /verify/{record_id}.
    """
    comp_record = dbc.get_best_record_for_session(session_id)
    if not comp_record:
        raise HTTPException(status_code=404, detail="No compliance record found for this session")

    record_id = comp_record["record_id"]
    result = {
        "record_id": record_id,
        "batch_id":  comp_record.get("batch_id"),
        "s3_key":    comp_record.get("s3_key"),
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
        s3_bytes = s3c.get_lead_object_bytes(comp_record["s3_key"])
        chain_ok = comp.verify_record_hash(_serialize(comp_record), s3_bytes)
        result["checks"]["data_hash"]   = comp.compute_data_hash(s3_bytes) == comp_record["data_hash"]
        result["checks"]["record_hash"] = chain_ok

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
        sns.publish_exception_alert(f"verify_session {session_id}", e)
        result["detail"] = str(e)

    return result


# ---------------------------------------------------------------------------
# POST /api/compliance/scan-idle
# Called by EventBridge every 30 min, or manually from admin
# Scans for sessions with name+email collected but idle > 30 min
# ---------------------------------------------------------------------------

class ScanIdleRequest(BaseModel):
    idle_minutes: int = 30
    source: str | None = None   # "aws.events" | "manual"


@router.post("/scan-idle")
async def scan_idle(req: ScanIdleRequest = ScanIdleRequest(), _=Depends(require_admin)):
    idle_sessions = db.get_idle_sessions(idle_minutes=req.idle_minutes)
    if not idle_sessions:
        return {"message": "No idle sessions found", "processed": 0}

    processed = 0
    errors    = 0
    for session in idle_sessions:
        try:
            session_id = session["session_id"]
            messages   = db.get_messages(session_id)
            record_id  = compliance_store.store_lead(session, messages, record_type="timeout")
            if record_id:
                processed += 1
                log.info(f"Timeout compliance stored for session {session_id}: {record_id}")
        except Exception as e:
            errors += 1
            log.error(f"Timeout compliance failed for session {session.get('session_id')}: {e}")
            sns.publish_exception_alert(f"scan_idle session {session.get('session_id')}", e)

    return {
        "message": f"Idle scan complete",
        "idle_sessions_found": len(idle_sessions),
        "processed": processed,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _serialize(obj):
    """Convert DynamoDB Decimal / bytes to JSON-safe types."""
    import decimal
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, decimal.Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, bytes):
        return base64.b64encode(obj).decode()
    return obj
