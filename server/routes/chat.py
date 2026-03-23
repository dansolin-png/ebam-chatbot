import os
import uuid
import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from database import get_db
from models import Session, Message, Lead, ChatbotConfig, FlowConfig
from prompts import CHAT_CONFIG
from state_machine import process_message, get_initial_message, load_default_flow

router = APIRouter(prefix="/chat", tags=["chat"])

_anthropic = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class StartRequest(BaseModel):
    audience: str   # "advisor" | "cpa"


class MessageRequest(BaseModel):
    session_id: str
    user_message: str


class LLMMessageRequest(BaseModel):
    session_id: str
    user_message: str
    audience: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_active_config(db: DBSession) -> dict:
    row = db.query(ChatbotConfig).filter(ChatbotConfig.id == "active").first()
    return row.config_json if row else CHAT_CONFIG


def _get_flow(audience: str, db: DBSession) -> dict:
    row = db.query(FlowConfig).filter(FlowConfig.name == audience).first()
    return row.flow_json if row else load_default_flow(audience)


def _save_lead(session: Session, db: DBSession):
    existing = db.query(Lead).filter(Lead.session_id == session.id).first()
    if existing:
        return
    data = {k: v for k, v in session.collected_data.items() if not k.startswith("__")}
    lead = Lead(
        session_id=session.id,
        name=data.get("name"),
        email=data.get("email"),
        phone=data.get("phone"),
        user_type=session.user_type,
        collected_data=data,
    )
    db.add(lead)


# ---------------------------------------------------------------------------
# GET /api/chat/config  — served to widget for greeting text
# ---------------------------------------------------------------------------

@router.get("/config")
def get_chat_config(db: DBSession = Depends(get_db)):
    cfg = _get_active_config(db)
    return {"greeting": cfg.get("greeting")}


# ---------------------------------------------------------------------------
# POST /api/chat/start  — create session, return first flow message
# ---------------------------------------------------------------------------

@router.post("/start")
def start_session(req: StartRequest, db: DBSession = Depends(get_db)):
    if req.audience not in ("advisor", "cpa"):
        raise HTTPException(status_code=400, detail="audience must be 'advisor' or 'cpa'")

    flow = _get_flow(req.audience, db)
    initial = get_initial_message(flow)

    session = Session(
        id=str(uuid.uuid4()),
        current_state="start",
        previous_state=None,
        collected_data={},
        is_complete=False,
        user_type=req.audience,
    )
    db.add(session)

    # Save initial bot message
    db.add(Message(
        session_id=session.id,
        role="bot",
        content=initial["bot_message"],
        state_id="start",
    ))
    db.commit()

    return {
        "session_id": session.id,
        "message":    initial["bot_message"],
        "options":    initial.get("bot_options"),
        "is_end":     False,
    }


# ---------------------------------------------------------------------------
# POST /api/chat/message  — state machine driven
# ---------------------------------------------------------------------------

@router.post("/message")
async def send_message(req: MessageRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.is_complete:
        return {"session_id": session.id, "message": "This conversation is complete.", "options": None, "is_end": True}

    flow = _get_flow(session.user_type, db)

    # Save user message
    db.add(Message(session_id=session.id, role="user", content=req.user_message, state_id=session.current_state))
    db.flush()

    # Load audience-specific LLM settings
    cfg = _get_active_config(db)
    audience_cfg = cfg.get(session.user_type, {})
    defaults = CHAT_CONFIG.get(session.user_type, {})
    system_prompt      = audience_cfg.get("systemPrompt")      or defaults.get("systemPrompt", "")
    default_llm_prompt = audience_cfg.get("defaultLLMPrompt")  or defaults.get("defaultLLMPrompt")

    # Build message history for conversational LLM states (excludes current user msg — added below)
    history_rows = (
        db.query(Message)
        .filter(Message.session_id == req.session_id)
        .order_by(Message.created_at)
        .all()
    )
    message_history = [
        {"role": "assistant" if m.role in ("bot", "assistant") else "user", "content": m.content}
        for m in history_rows
    ]
    # Append the current user message (not yet saved)
    message_history.append({"role": "user", "content": req.user_message})

    # Run state machine
    result = await process_message(
        flow,
        session.current_state,
        session.previous_state,
        req.user_message,
        dict(session.collected_data or {}),
        system_prompt=system_prompt,
        message_history=message_history,
        default_llm_prompt=default_llm_prompt,
    )

    # Update session state
    session.previous_state = session.current_state
    session.current_state  = result["next_state_id"]

    # Merge captured data
    captured = result.get("captured") or {}
    new_data = dict(session.collected_data or {})
    for k, v in captured.items():
        if v is None:
            new_data.pop(k, None)
        else:
            new_data[k] = v
    session.collected_data = new_data

    # End state → mark complete and save lead
    if result["is_end"]:
        session.is_complete = True
        _save_lead(session, db)

    # Save bot message
    db.add(Message(session_id=session.id, role="bot", content=result["bot_message"], state_id=result["next_state_id"]))
    db.commit()

    return {
        "session_id": session.id,
        "message":    result["bot_message"],
        "options":    result.get("bot_options"),
        "is_end":     result["is_end"],
    }


# ---------------------------------------------------------------------------
# POST /api/chat/llm-message  — free-form LLM chat (kept for reference)
# ---------------------------------------------------------------------------

@router.post("/llm-message")
async def llm_message(req: LLMMessageRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.audience and not session.user_type:
        session.user_type = req.audience

    audience = session.user_type
    if not audience:
        raise HTTPException(status_code=400, detail="Audience not set")

    cfg = _get_active_config(db)
    audience_cfg = cfg.get(audience, {})
    system_prompt = audience_cfg.get("systemPrompt") or CHAT_CONFIG.get(audience, {}).get("systemPrompt", "")

    db.add(Message(session_id=session.id, role="user", content=req.user_message, state_id="llm"))
    db.flush()

    history = (
        db.query(Message)
        .filter(Message.session_id == req.session_id)
        .order_by(Message.created_at)
        .all()
    )
    api_messages = [
        {"role": "assistant" if m.role in ("bot", "assistant") else "user", "content": m.content}
        for m in history
    ]

    try:
        response = await _anthropic.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1000,
            system=system_prompt,
            messages=api_messages,
        )
        reply = response.content[0].text
    except Exception:
        reply = "I'm having a brief technical issue. Please try again in a moment."

    db.add(Message(session_id=session.id, role="assistant", content=reply, state_id="llm"))
    db.commit()

    return {"session_id": session.id, "message": reply}


# ---------------------------------------------------------------------------
# GET /api/chat/history/{session_id}
# ---------------------------------------------------------------------------

@router.get("/history/{session_id}")
def get_history(session_id: str, db: DBSession = Depends(get_db)):
    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at)
        .all()
    )
    return [{"role": m.role, "content": m.content, "created_at": m.created_at} for m in messages]
