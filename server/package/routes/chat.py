import asyncio
import logging
import os
import uuid
import anthropic
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from prompts import CHAT_CONFIG
from state_machine import process_message, get_initial_message, load_default_flow
import dynamo as db
import compliance_store
import rate_limit as rl
import secrets_client as sc
from routes.auth import require_auth as require_admin

log = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_anthropic = anthropic.AsyncAnthropic(api_key=sc.get("ANTHROPIC_API_KEY"))


class StartRequest(BaseModel):
    audience: str


class MessageRequest(BaseModel):
    session_id: str
    user_message: str
    # Temporary client-side state — present until name+email are collected and session persisted to DB
    session_state: Optional[dict] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_active_config() -> dict:
    return db.get_chatbot_config() or CHAT_CONFIG


def _get_flow(audience: str) -> dict:
    return db.get_flow_config(audience) or load_default_flow(audience)


# ---------------------------------------------------------------------------
# GET /api/chat/config
# ---------------------------------------------------------------------------

@router.get("/config")
def get_chat_config():
    cfg = _get_active_config()
    return {
        "greeting":     cfg.get("greeting"),
        "disclaimer":   cfg.get("disclaimer", ""),
        "bot_icon":     cfg.get("bot_icon", "🎬"),
        "bot_name":     cfg.get("bot_name", "Avatar Marketing Assistant"),
        "bot_subtitle": cfg.get("bot_subtitle", "Evidence Based Advisor Marketing"),
        "bot_icon_url": cfg.get("bot_icon_url", ""),   # S3/CDN image URL — takes priority over bot_icon
    }


# ---------------------------------------------------------------------------
# POST /api/chat/start
# ---------------------------------------------------------------------------

@router.post("/start")
def start_session(req: StartRequest, request: Request):
    if req.audience not in ("advisor", "cpa"):
        raise HTTPException(status_code=400, detail="audience must be 'advisor' or 'cpa'")

    # Origin check
    origin = request.headers.get("origin")
    allowed = rl.get_allowed_origins_cached()
    if not rl.is_origin_allowed(origin, allowed):
        raise HTTPException(status_code=403, detail="Origin not allowed")

    flow    = _get_flow(req.audience)
    initial = get_initial_message(flow)

    session_id = str(uuid.uuid4())

    # Do NOT write to DB yet — session is persisted only when name+email are captured.
    # Return initial state for the client to hold temporarily.
    initial_state = {
        "current_state":  "start",
        "previous_state": None,
        "collected_data": {},
        "user_type":      req.audience,
        "is_complete":    False,
    }

    return {
        "session_id":    session_id,
        "message":       initial["bot_message"],
        "options":       initial.get("bot_options"),
        "is_end":        False,
        "session_state": initial_state,   # client holds this until session is persisted
    }


# ---------------------------------------------------------------------------
# POST /api/chat/message
# ---------------------------------------------------------------------------

@router.post("/message")
async def send_message(req: MessageRequest, request: Request):
    # Origin check
    origin = request.headers.get("origin")
    allowed = rl.get_allowed_origins_cached()
    if not rl.is_origin_allowed(origin, allowed):
        raise HTTPException(status_code=403, detail="Origin not allowed")

    # Rate limit: 20 messages per minute per IP
    # Use request.client.host (set by Mangum from API GW's sourceIp — trustworthy).
    # Fall back to the LAST value in X-Forwarded-For (appended by API GW, not client-supplied).
    # Never use the FIRST value — clients can inject arbitrary leading IPs to spoof the header.
    client_ip = (
        (request.client.host if request.client else None)
        or request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        or "unknown"
    )
    ok, count = rl.check_rate_limit(client_ip)
    if not ok:
        log.warning(f"Rate limit exceeded for IP {client_ip}: {count} messages in window")
        raise HTTPException(status_code=429, detail="Too many messages. Please wait a moment before continuing.")

    # Try DB first; fall back to client-provided session_state
    session = db.get_session(req.session_id)
    in_db   = session is not None

    if not in_db:
        if not req.session_state:
            raise HTTPException(status_code=404, detail="Session not found")
        # Reconstruct session from client-held state
        session = {
            "session_id":    req.session_id,
            "current_state": req.session_state.get("current_state", "start"),
            "previous_state":req.session_state.get("previous_state"),
            "collected_data":req.session_state.get("collected_data") or {},
            "user_type":     req.session_state.get("user_type", ""),
            "is_complete":   req.session_state.get("is_complete", False),
            "compliance_status": "none",
        }

    if session.get("is_complete"):
        return {"session_id": req.session_id, "message": "This conversation is complete.", "options": None, "is_end": True, "session_state": None}

    flow = _get_flow(session["user_type"])

    # Load audience LLM settings
    cfg           = _get_active_config()
    audience_cfg  = cfg.get(session["user_type"], {})
    defaults      = CHAT_CONFIG.get(session["user_type"], {})
    system_prompt      = audience_cfg.get("systemPrompt")     or defaults.get("systemPrompt", "")
    default_llm_prompt = audience_cfg.get("defaultLLMPrompt") or defaults.get("defaultLLMPrompt")

    # Build message history from DB (if persisted) or minimal history (if not yet)
    if in_db:
        history_rows = db.get_messages(req.session_id)
        message_history = [
            {"role": "assistant" if m["role"] in ("bot", "assistant") else "user", "content": m["content"]}
            for m in history_rows
        ]
    else:
        # Session not in DB yet — history comes from client session_state
        message_history = req.session_state.get("message_history") or []

    message_history.append({"role": "user", "content": req.user_message})

    # Run state machine — inject session_id so handoff state can enqueue
    _collected = dict(session.get("collected_data") or {})
    _collected["__session_id__"] = req.session_id
    _collected["user_type"] = session.get("user_type", "")
    result = await process_message(
        flow,
        session["current_state"],
        session.get("previous_state"),
        req.user_message,
        _collected,
        system_prompt=system_prompt,
        message_history=message_history,
        default_llm_prompt=default_llm_prompt,
    )

    # Merge captured data
    captured = result.get("captured") or {}
    new_data  = dict(session.get("collected_data") or {})
    for k, v in captured.items():
        if v is None:
            new_data.pop(k, None)
        else:
            new_data[k] = v

    has_lead = bool(new_data.get("name") and new_data.get("email"))

    # Persist to DB only when BOTH name AND email are captured for the first time
    if has_lead and not in_db:
        db.create_session(req.session_id, session["user_type"], collected_data=new_data)
        in_db = True

    if in_db:
        # Save user message + bot message to DB
        db.add_message(req.session_id, "user", req.user_message, session["current_state"])

        updates = {
            "previous_state":   session["current_state"],
            "current_state":    result["next_state_id"],
            "collected_data":   new_data,
            "last_activity_at": db.now_iso(),
        }
        if result["is_end"]:
            updates["is_complete"] = True
        db.update_session(req.session_id, **updates)

        if has_lead:
            updated_session = {**session, "collected_data": new_data}
            db.upsert_lead(updated_session)

        db.add_message(req.session_id, "bot", result["bot_message"], result["next_state_id"])

        # Compliance: store on conversation end (awaited so Lambda doesn't exit before it runs)
        if has_lead and result["is_end"]:
            full_session = {**session, "collected_data": new_data,
                            "compliance_status": session.get("compliance_status", "none"),
                            "is_complete": True}
            await _store_compliance(full_session, req.session_id, "complete")

        return_state = {
            "current_state":  result["next_state_id"],
            "previous_state": session["current_state"],
            "collected_data": new_data,
            "user_type":      session["user_type"],
            "is_complete":    result["is_end"],
        }
    else:
        # Not yet persisted — build updated state for client to hold
        message_history.append({"role": "assistant", "content": result["bot_message"]})
        return_state = {
            "current_state":   result["next_state_id"],
            "previous_state":  session["current_state"],
            "collected_data":  new_data,
            "user_type":       session["user_type"],
            "is_complete":     result["is_end"],
            "message_history": message_history,
        }

    return {
        "session_id":    req.session_id,
        "message":       result["bot_message"],
        "options":       result.get("bot_options"),
        "is_end":        result["is_end"],
        "is_handoff":    result.get("is_handoff", False),
        "session_state": return_state,
    }


# ---------------------------------------------------------------------------
# GET /api/chat/history/{session_id}
# ---------------------------------------------------------------------------

async def _store_compliance(session: dict, session_id: str, record_type: str = "partial"):
    try:
        messages = db.get_messages(session_id)
        await asyncio.get_event_loop().run_in_executor(
            None, compliance_store.store_lead, session, messages, record_type
        )
    except Exception as e:
        log.error(f"Compliance [{record_type}] storage failed for session {session_id}: {e}")
        import sns_client as sns
        sns.publish_exception_alert(f"compliance store [{record_type}] session {session_id}", e)


@router.get("/history/{session_id}")
def get_history(session_id: str, _=Depends(require_admin)):
    messages = db.get_messages(session_id)
    return [{"role": m["role"], "content": m["content"], "created_at": m["created_at"]} for m in messages]
