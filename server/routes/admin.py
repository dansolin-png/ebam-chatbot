from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from database import get_db
from models import FlowConfig, Session, Message, Lead, ChatbotConfig
from state_machine import load_default_flow
from prompts import CHAT_CONFIG as DEFAULT_CONFIG

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Chatbot Config — GET / PUT
# ---------------------------------------------------------------------------

def _get_config(db: DBSession) -> dict:
    """Return active DB config, or fall back to prompts.py defaults."""
    row = db.query(ChatbotConfig).filter(ChatbotConfig.id == "active").first()
    if row:
        return row.config_json
    return DEFAULT_CONFIG


@router.get("/chatbot-config")
def get_chatbot_config(db: DBSession = Depends(get_db)):
    return _get_config(db)


class ChatbotConfigRequest(BaseModel):
    config: dict


@router.put("/chatbot-config")
def save_chatbot_config(req: ChatbotConfigRequest, db: DBSession = Depends(get_db)):
    row = db.query(ChatbotConfig).filter(ChatbotConfig.id == "active").first()
    if row:
        row.config_json = req.config
    else:
        row = ChatbotConfig(id="active", config_json=req.config)
        db.add(row)
    db.commit()
    return {"message": "Saved."}


@router.post("/chatbot-config/reset")
def reset_chatbot_config(db: DBSession = Depends(get_db)):
    row = db.query(ChatbotConfig).filter(ChatbotConfig.id == "active").first()
    if row:
        db.delete(row)
        db.commit()
    return {"message": "Reset to defaults."}


# ---------------------------------------------------------------------------
# Flow Config — GET / PUT / RESET  (per audience)
# ---------------------------------------------------------------------------

VALID_AUDIENCES = {"advisor", "cpa"}


class FlowRequest(BaseModel):
    flow: dict


@router.get("/flow/{audience}")
def get_flow(audience: str, db: DBSession = Depends(get_db)):
    """Return the flow JSON for the given audience (DB override or default file)."""
    if audience not in VALID_AUDIENCES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    row = db.query(FlowConfig).filter(FlowConfig.name == audience).first()
    if row:
        return row.flow_json
    return load_default_flow(audience)


@router.put("/flow/{audience}")
def save_flow(audience: str, req: FlowRequest, db: DBSession = Depends(get_db)):
    if audience not in VALID_AUDIENCES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    row = db.query(FlowConfig).filter(FlowConfig.name == audience).first()
    if row:
        row.flow_json = req.flow
    else:
        row = FlowConfig(name=audience, flow_json=req.flow, is_active=True)
        db.add(row)
    db.commit()
    return {"message": f"Flow saved for {audience}."}


@router.post("/flow/{audience}/reset")
def reset_flow(audience: str, db: DBSession = Depends(get_db)):
    if audience not in VALID_AUDIENCES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    row = db.query(FlowConfig).filter(FlowConfig.name == audience).first()
    if row:
        db.delete(row)
        db.commit()
    return {"message": f"Flow reset to defaults for {audience}."}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_stats(db: DBSession = Depends(get_db)):
    total_sessions    = db.query(Session).count()
    completed_sessions = db.query(Session).filter(Session.is_complete == True).count()
    total_leads       = db.query(Lead).count()
    advisor_leads     = db.query(Lead).filter(Lead.user_type == "advisor").count()
    cpa_leads         = db.query(Lead).filter(Lead.user_type == "cpa").count()
    total_messages    = db.query(Message).count()

    return {
        "total_sessions":     total_sessions,
        "completed_sessions": completed_sessions,
        "total_leads":        total_leads,
        "advisor_leads":      advisor_leads,
        "cpa_leads":          cpa_leads,
        "total_messages":     total_messages,
    }
