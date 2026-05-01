"""
HTTP routes for agent management.

POST /api/agent/register   — create/register an agent (local dev, no auth needed)
POST /api/agent/heartbeat  — keep agent marked as online
GET  /api/agent/queue      — list all queue items (for polling fallback)
GET  /api/agent/list       — list all registered agents
"""
import logging
from fastapi import APIRouter
from pydantic import BaseModel
import agent_store as ags

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


class RegisterRequest(BaseModel):
    agent_id: str
    name: str


class HeartbeatRequest(BaseModel):
    agent_id: str


@router.post("/register")
def register_agent(req: RegisterRequest):
    agent = ags.register_agent(req.agent_id, req.name)
    return {"ok": True, "agent": agent}


@router.post("/heartbeat")
def heartbeat(req: HeartbeatRequest):
    ags.heartbeat(req.agent_id)
    return {"ok": True}


@router.get("/queue")
def get_queue():
    return {"queue": ags.list_queue()}


@router.get("/list")
def list_agents():
    return {"agents": ags.list_agents()}
