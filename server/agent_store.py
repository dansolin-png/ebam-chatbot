"""
In-memory agent store for local development.
Tracks: agents (online/busy/offline), the session queue, and WebSocket connections.

In production this would be backed by DynamoDB tables:
  ebam-agents, ebam-agent-queue, ebam-ws-connections
"""
import time
from datetime import datetime, timezone
from typing import Optional

# agent_id -> { id, name, status, last_heartbeat, active_sessions: [] }
_agents: dict[str, dict] = {}

# session_id -> { session_id, user_name, user_email, user_type, status, queued_at, agent_id }
_queue: dict[str, dict] = {}

# connection_id -> { connection_id, role, session_id, agent_id, ws }
# 'ws' holds the actual WebSocket object for local push
_connections: dict[str, dict] = {}

MAX_CONCURRENT = 3   # max simultaneous chats per agent


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

def register_agent(agent_id: str, name: str) -> dict:
    _agents[agent_id] = {
        "id":              agent_id,
        "name":            name,
        "status":          "online",
        "last_heartbeat":  time.time(),
        "active_sessions": [],
    }
    return _agents[agent_id]


def heartbeat(agent_id: str):
    if agent_id in _agents:
        _agents[agent_id]["last_heartbeat"] = time.time()
        if _agents[agent_id]["status"] == "offline":
            _agents[agent_id]["status"] = "online"


def set_agent_offline(agent_id: str):
    if agent_id in _agents:
        _agents[agent_id]["status"] = "offline"


def get_available_agent() -> Optional[dict]:
    """Return any agent that is online and under the concurrent chat cap."""
    for agent in _agents.values():
        if (
            agent["status"] == "online"
            and len(agent["active_sessions"]) < MAX_CONCURRENT
        ):
            return agent
    return None


def list_agents() -> list[dict]:
    return list(_agents.values())


def get_agent(agent_id: str) -> Optional[dict]:
    return _agents.get(agent_id)


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

def enqueue_session(session_id: str, user_name: str, user_email: str, user_type: str):
    if session_id in _queue:
        return  # already queued
    _queue[session_id] = {
        "session_id": session_id,
        "user_name":  user_name,
        "user_email": user_email,
        "user_type":  user_type,
        "status":     "waiting",
        "queued_at":  datetime.now(timezone.utc).isoformat(),
        "agent_id":   None,
    }


def get_queue_item(session_id: str) -> Optional[dict]:
    return _queue.get(session_id)


def list_queue() -> list[dict]:
    return list(_queue.values())


def accept_session(session_id: str, agent_id: str) -> bool:
    """Agent accepts a waiting session. Returns False if already taken."""
    item = _queue.get(session_id)
    if not item or item["status"] not in ("waiting", "active"):
        return False
    if item["status"] == "active" and item.get("agent_id") != agent_id:
        return False  # taken by someone else
    item["status"]   = "active"
    item["agent_id"] = agent_id
    agent = _agents.get(agent_id)
    if agent and session_id not in agent["active_sessions"]:
        agent["active_sessions"].append(session_id)
        if len(agent["active_sessions"]) >= MAX_CONCURRENT:
            agent["status"] = "busy"
    return True


def close_session(session_id: str):
    item = _queue.get(session_id)
    if not item:
        return
    item["status"] = "closed"
    agent_id = item.get("agent_id")
    if agent_id and agent_id in _agents:
        agent = _agents[agent_id]
        if session_id in agent["active_sessions"]:
            agent["active_sessions"].remove(session_id)
        if agent["status"] == "busy" and len(agent["active_sessions"]) < MAX_CONCURRENT:
            agent["status"] = "online"


# ---------------------------------------------------------------------------
# WebSocket connections  (local only — stores actual WS object)
# ---------------------------------------------------------------------------

def save_connection(connection_id: str, role: str, session_id: str, agent_id: str | None, ws):
    _connections[connection_id] = {
        "connection_id": connection_id,
        "role":          role,
        "session_id":    session_id,
        "agent_id":      agent_id,
        "ws":            ws,
    }


def remove_connection(connection_id: str):
    _connections.pop(connection_id, None)


def get_connection(connection_id: str) -> Optional[dict]:
    return _connections.get(connection_id)


def get_user_connection_for_session(session_id: str) -> Optional[dict]:
    for c in _connections.values():
        if c["role"] == "user" and c["session_id"] == session_id:
            return c
    return None


def get_agent_connections() -> list[dict]:
    return [c for c in _connections.values() if c["role"] == "agent"]


def get_agent_connection(agent_id: str) -> Optional[dict]:
    for c in _connections.values():
        if c["role"] == "agent" and c["agent_id"] == agent_id:
            return c
    return None
