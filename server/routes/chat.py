import asyncio
import logging
import os
import uuid
import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from prompts import CHAT_CONFIG
from state_machine import process_message, get_initial_message, load_default_flow
import dynamo as db
import compliance_store

log = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_anthropic = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


class StartRequest(BaseModel):
    audience: str


class MessageRequest(BaseModel):
    session_id: str
    user_message: str


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
    return {"greeting": cfg.get("greeting")}


# ---------------------------------------------------------------------------
# POST /api/chat/start
# ---------------------------------------------------------------------------

@router.post("/start")
def start_session(req: StartRequest):
    if req.audience not in ("advisor", "cpa"):
        raise HTTPException(status_code=400, detail="audience must be 'advisor' or 'cpa'")

    flow    = _get_flow(req.audience)
    initial = get_initial_message(flow)

    session_id = str(uuid.uuid4())
    db.create_session(session_id, req.audience)
    db.add_message(session_id, "bot", initial["bot_message"], "start")

    return {
        "session_id": session_id,
        "message":    initial["bot_message"],
        "options":    initial.get("bot_options"),
        "is_end":     False,
    }


# ---------------------------------------------------------------------------
# POST /api/chat/message
# ---------------------------------------------------------------------------

@router.post("/message")
async def send_message(req: MessageRequest):
    session = db.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("is_complete"):
        return {"session_id": session["session_id"], "message": "This conversation is complete.", "options": None, "is_end": True}

    flow = _get_flow(session["user_type"])

    # Save user message
    db.add_message(req.session_id, "user", req.user_message, session["current_state"])

    # Load audience LLM settings
    cfg           = _get_active_config()
    audience_cfg  = cfg.get(session["user_type"], {})
    defaults      = CHAT_CONFIG.get(session["user_type"], {})
    system_prompt      = audience_cfg.get("systemPrompt")     or defaults.get("systemPrompt", "")
    default_llm_prompt = audience_cfg.get("defaultLLMPrompt") or defaults.get("defaultLLMPrompt")

    # Build message history
    history_rows    = db.get_messages(req.session_id)
    message_history = [
        {"role": "assistant" if m["role"] in ("bot", "assistant") else "user", "content": m["content"]}
        for m in history_rows
    ]
    message_history.append({"role": "user", "content": req.user_message})

    # Run state machine
    result = await process_message(
        flow,
        session["current_state"],
        session.get("previous_state"),
        req.user_message,
        dict(session.get("collected_data") or {}),
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

    # Update session (always track last_activity_at)
    updates = {
        "previous_state":   session["current_state"],
        "current_state":    result["next_state_id"],
        "collected_data":   new_data,
        "last_activity_at": db.now_iso(),
    }
    if result["is_end"]:
        updates["is_complete"] = True
    db.update_session(req.session_id, **updates)

    # Save lead as soon as name + email collected
    has_lead = new_data.get("name") and new_data.get("email")
    if has_lead:
        updated_session = {**session, "collected_data": new_data}
        db.upsert_lead(updated_session)

    # Save bot message BEFORE compliance so the full conversation is captured
    db.add_message(req.session_id, "bot", result["bot_message"], result["next_state_id"])

    if has_lead:
        full_session = {**session, "collected_data": new_data,
                        "compliance_status": session.get("compliance_status", "none"),
                        "is_complete": result["is_end"]}
        if result["is_end"]:
            # Complete record — full conversation captured
            asyncio.create_task(_store_compliance(full_session, req.session_id, "complete"))
        elif session.get("compliance_status", "none") == "none":
            # First time name+email appear — store partial immediately
            asyncio.create_task(_store_compliance(full_session, req.session_id, "partial"))

    return {
        "session_id": req.session_id,
        "message":    result["bot_message"],
        "options":    result.get("bot_options"),
        "is_end":     result["is_end"],
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


@router.get("/history/{session_id}")
def get_history(session_id: str):
    messages = db.get_messages(session_id)
    return [{"role": m["role"], "content": m["content"], "created_at": m["created_at"]} for m in messages]
