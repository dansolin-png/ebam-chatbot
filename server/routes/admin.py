from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from state_machine import load_default_flow
from prompts import CHAT_CONFIG as DEFAULT_CONFIG
from routes.auth import verify_token
import dynamo as db
import rate_limit as rl

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_AUDIENCES = {"advisor", "cpa"}


def require_auth(authorization: str | None = Header(default=None)):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------------------------------------------------------------------------
# Chatbot Config
# ---------------------------------------------------------------------------

@router.get("/chatbot-config")
def get_chatbot_config(_=Depends(require_auth)):
    return db.get_chatbot_config() or DEFAULT_CONFIG


class ChatbotConfigRequest(BaseModel):
    config: dict


@router.put("/chatbot-config")
def save_chatbot_config(req: ChatbotConfigRequest, _=Depends(require_auth)):
    db.save_chatbot_config(req.config)
    rl.invalidate_origins_cache()
    return {"message": "Saved."}


@router.post("/chatbot-config/reset")
def reset_chatbot_config(_=Depends(require_auth)):
    db.delete_chatbot_config()
    return {"message": "Reset to defaults."}


# ---------------------------------------------------------------------------
# Flow Config
# ---------------------------------------------------------------------------

class FlowRequest(BaseModel):
    flow: dict


@router.get("/flow/{audience}")
def get_flow(audience: str, _=Depends(require_auth)):
    if audience not in VALID_AUDIENCES:
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    return db.get_flow_config(audience) or load_default_flow(audience)


@router.put("/flow/{audience}")
def save_flow(audience: str, req: FlowRequest, _=Depends(require_auth)):
    if audience not in VALID_AUDIENCES:
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    db.save_flow_config(audience, req.flow)
    return {"message": f"Flow saved for {audience}."}


@router.post("/flow/{audience}/reset")
def reset_flow(audience: str, _=Depends(require_auth)):
    if audience not in VALID_AUDIENCES:
        raise HTTPException(status_code=400, detail=f"Unknown audience '{audience}'")
    db.delete_flow_config(audience)
    return {"message": f"Flow reset to defaults for {audience}."}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_stats(_=Depends(require_auth)):
    leads    = db.list_leads()
    sessions = db.tbl_sessions.scan(Select="COUNT")["Count"]
    messages = db.tbl_messages.scan(Select="COUNT")["Count"]
    return {
        "total_sessions":     sessions,
        "total_leads":        len(leads),
        "advisor_leads":      sum(1 for l in leads if l.get("user_type") == "advisor"),
        "cpa_leads":          sum(1 for l in leads if l.get("user_type") == "cpa"),
        "total_messages":     messages,
    }
