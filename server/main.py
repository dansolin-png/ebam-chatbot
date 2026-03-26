import json
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from routes import chat, admin, leads, auth, compliance, history

log = logging.getLogger(__name__)

app = FastAPI(title="EBAM Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://main.d142ap2pr34amq.amplifyapp.com",
        "https://ebam.buzzybrains.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(history.router, prefix="/api")


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
    # Native EventBridge format
    if event.get("source") == "aws.events":
        return True
    # Fake HTTP format used by our EventBridge targets (body contains source marker)
    body = event.get("body") or ""
    if isinstance(body, str) and "aws.events" in body:
        return True
    return False


def _get_eb_path(event: dict) -> str:
    """Extract the intended route path from an EventBridge event."""
    return (
        event.get("rawPath")          # HTTP API v2 format
        or event.get("path")          # REST API v1 format
        or ""
    )


def _get_eb_body(event: dict) -> dict:
    """Parse JSON body from an EventBridge event."""
    body = event.get("body") or "{}"
    try:
        return json.loads(body)
    except Exception:
        return {}


def handler(event, context):
    if _is_eventbridge(event):
        path = _get_eb_path(event)
        body = _get_eb_body(event)
        log.info(f"EventBridge event: path={path} body={body}")
        try:
            if "/compliance/batch" in path:
                from datetime import datetime, timezone
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
                    log.info(f"No compliance records for batch {batch_id}")
                    return {"statusCode": 200, "body": f"No records for {batch_id}"}

                leaf_hashes = [bytes.fromhex(r["record_hash"]) for r in records]
                tree        = comp.build_merkle_tree(leaf_hashes)
                merkle_root = comp.get_merkle_root(tree)
                signature   = kms.sign_merkle_root(merkle_root)

                year, month, day = batch_id.split("-")
                anchor_key = f"batches/{year}/{month}/{day}/batch.json"
                batch = {
                    "batch_id":        batch_id,
                    "merkle_root":     merkle_root,
                    "record_count":    len(records),
                    "start_record_id": records[0]["record_id"],
                    "end_record_id":   records[-1]["record_id"],
                    "start_hash":      records[0]["record_hash"],
                    "end_hash":        records[-1]["record_hash"],
                    "created_at":      datetime.now(timezone.utc).isoformat(),
                    "signature":       signature,
                    "anchor_s3_key":   anchor_key,
                    "status":          "sealed",
                }
                s3c.put_batch_object(batch_id, batch)
                dbc.save_batch(batch)
                for i, record in enumerate(records):
                    proof = comp.get_merkle_proof(tree, i)
                    dbc.update_record_merkle_proof(record["record_id"], proof, i)

                log.info(f"Batch {batch_id} sealed: {len(records)} records, root={merkle_root[:16]}...")
                return {"statusCode": 200, "body": f"Batch {batch_id} sealed with {len(records)} records"}

            elif "/compliance/scan-idle" in path:
                import dynamo as db
                import compliance_store

                idle_minutes = body.get("idle_minutes", 30)
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

                log.info(f"Idle scan: found={len(idle_sessions)} processed={processed} errors={errors}")
                return {"statusCode": 200, "body": f"Idle scan: {processed}/{len(idle_sessions)} processed"}

            else:
                log.warning(f"Unknown EventBridge path: {path}")
                return {"statusCode": 400, "body": f"Unknown path: {path}"}

        except Exception as e:
            log.error(f"EventBridge handler error: {e}", exc_info=True)
            return {"statusCode": 500, "body": str(e)}

    # Normal HTTP request — delegate to Mangum/FastAPI
    return _mangum(event, context)
