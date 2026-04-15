import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from mangum import Mangum
from routes import chat, admin, leads, auth, compliance, history

import sns_client as sns

log = logging.getLogger(__name__)

app = FastAPI(title="EBAM Chatbot API", version="1.0.0")


# ---------------------------------------------------------------------------
# Dynamic CORS — reads allowed_origins from DynamoDB config (same source as
# rate_limit.py) so adding an origin in the admin console is sufficient.
# Falls back to a safe default list if config is unavailable.
# ---------------------------------------------------------------------------

_CORS_FALLBACK = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://main.d142ap2pr34amq.amplifyapp.com",
    "https://ebam.buzzybrains.net",
]

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse
import rate_limit as rl

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")
        allowed = rl.get_allowed_origins_cached()
        # If no origins configured, fall back to hardcoded list
        effective = allowed if allowed else _CORS_FALLBACK
        origin_ok = rl.is_origin_allowed(origin, effective)

        if request.method == "OPTIONS":
            response = StarletteResponse(status_code=200)
        else:
            response = await call_next(request)

        if origin_ok and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Vary"] = "Origin"

        return response

app.add_middleware(DynamicCORSMiddleware)

app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(history.router, prefix="/api")


# ---------------------------------------------------------------------------
# Global exception handler — catches any unhandled exception in HTTP routes
# and fires an SNS alert before returning a 500.
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    path = request.url.path
    sns.publish_exception_alert(f"HTTP {request.method} {path}", exc)
    log.error(f"Unhandled exception on {request.method} {path}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def root():
    return {"status": "ok", "message": "EBAM Chatbot API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# Lambda handler — detects EventBridge scheduled events and routes directly,
# bypassing Mangum (which only handles API Gateway HTTP events).
# ---------------------------------------------------------------------------

_mangum = Mangum(app, lifespan="off")


def _is_eventbridge(event: dict) -> bool:
    """Return True if the Lambda event originated from EventBridge."""
    if event.get("source") == "aws.events":
        return True
    body = event.get("body") or ""
    if isinstance(body, str) and "aws.events" in body:
        return True
    return False


def _get_eb_path(event: dict) -> str:
    return (
        event.get("rawPath")
        or event.get("path")
        or ""
    )


def _get_eb_body(event: dict) -> dict:
    body = event.get("body") or "{}"
    try:
        return json.loads(body)
    except Exception:
        return {}


def _handle_compliance_batch(body: dict) -> dict:
    """
    Seal today's (or specified) compliance batch.
    Mirrors routes/compliance.py::seal_batch with full cross-day chaining.
    Idempotent: if already sealed, returns immediately.
    """
    import dynamo_compliance as dbc
    import compliance as comp
    import s3_compliance as s3c
    import kms_client as kms

    batch_id = body.get("batch_id") or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    existing = dbc.get_batch(batch_id)
    if existing and existing.get("status") == "sealed":
        log.info(f"Batch {batch_id} already sealed")
        return {"statusCode": 200, "body": f"Batch {batch_id} already sealed"}

    records = dbc.get_records_for_batch(batch_id)
    if not records:
        msg = f"No compliance records for batch {batch_id}"
        log.info(msg)
        sns.publish_alert(
            f"[EBAM WARNING] No records for compliance batch {batch_id}",
            f"The nightly compliance batch seal found no records for {batch_id}.\n"
            f"This may indicate no leads were collected today, or a data ingestion issue.",
        )
        return {"statusCode": 200, "body": msg}

    # Build Merkle tree
    leaf_hashes = [bytes.fromhex(r["record_hash"]) for r in records]
    tree        = comp.build_merkle_tree(leaf_hashes)
    merkle_root = comp.get_merkle_root(tree)

    # Cross-day chain: include previous day's merkle_root
    prev_date           = (datetime.strptime(batch_id, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_batch          = dbc.get_batch(prev_date)
    previous_batch_root = prev_batch["merkle_root"] if prev_batch else "0" * 64

    # KMS sign: previous_batch_root + merkle_root (backward-compat with old batches)
    sign_payload = previous_batch_root + merkle_root
    signature    = kms.sign_merkle_root(sign_payload)

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

    s3c.put_batch_object(batch_id, batch)
    dbc.save_batch(batch)

    for i, record in enumerate(records):
        proof = comp.get_merkle_proof(tree, i)
        dbc.update_record_merkle_proof(record["record_id"], proof, i)

    log.info(f"Batch {batch_id} sealed: {len(records)} records, root={merkle_root[:16]}...")
    return {"statusCode": 200, "body": f"Batch {batch_id} sealed with {len(records)} records"}


def _handle_scan_idle(body: dict) -> dict:
    """Scan for idle sessions and store timeout compliance records."""
    import dynamo as db
    import compliance_store

    idle_minutes  = body.get("idle_minutes", 30)
    idle_sessions = db.get_idle_sessions(idle_minutes=idle_minutes)
    processed, errors = 0, 0

    for session in idle_sessions:
        try:
            messages  = db.get_messages(session["session_id"])
            record_id = compliance_store.store_lead(session, messages, record_type="timeout")
            if record_id:
                processed += 1
                log.info(f"Timeout compliance stored: {session['session_id']} → {record_id}")
        except Exception as e:
            errors += 1
            log.error(f"Timeout compliance failed: {session.get('session_id')}: {e}")

    if errors:
        sns.publish_alert(
            f"[EBAM WARNING] Idle scan had {errors} error(s)",
            f"Idle session scan completed with errors.\n"
            f"Found: {len(idle_sessions)}  Processed: {processed}  Errors: {errors}\n"
            f"Check CloudWatch logs for details.",
        )

    log.info(f"Idle scan: found={len(idle_sessions)} processed={processed} errors={errors}")
    return {"statusCode": 200, "body": f"Idle scan: {processed}/{len(idle_sessions)} processed"}


def handler(event, context):
    if _is_eventbridge(event):
        path = _get_eb_path(event)
        body = _get_eb_body(event)
        log.info(f"EventBridge event: path={path} body={body}")

        try:
            if "/compliance/batch" in path:
                return _handle_compliance_batch(body)
            elif "/compliance/scan-idle" in path:
                return _handle_scan_idle(body)
            else:
                log.warning(f"Unknown EventBridge path: {path}")
                return {"statusCode": 400, "body": f"Unknown path: {path}"}

        except Exception as e:
            log.error(f"EventBridge handler error on {path}: {e}", exc_info=True)
            sns.publish_exception_alert(f"EventBridge {path}", e)
            return {"statusCode": 500, "body": str(e)}

    # Normal HTTP request — delegate to Mangum/FastAPI
    try:
        return _mangum(event, context)
    except Exception as e:
        log.error(f"Mangum handler error: {e}", exc_info=True)
        sns.publish_exception_alert("Lambda HTTP handler (Mangum)", e)
        raise
