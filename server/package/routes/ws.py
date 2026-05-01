"""
WebSocket route for real-time agent <-> user chat.

Connect URL (local):  ws://localhost:8000/ws?role=user&session_id=<id>
                      ws://localhost:8000/ws?role=agent&agent_id=<id>

Message types sent by clients:
  { "type": "sendMessage",  "text": "...", "session_id": "..." }
  { "type": "acceptChat",   "session_id": "..." }
  { "type": "endChat",      "session_id": "..." }
  { "type": "typing",       "is_typing": true,  "session_id": "..." }

Message types pushed to clients:
  { "type": "message",       "from": "user"|"agent", "text": "...", "sender_name": "..." }
  { "type": "agent_joined",  "agent_name": "..." }
  { "type": "agent_left" }
  { "type": "new_queue_item", "session": {...} }
  { "type": "chat_context",  "session": {...}, "history": [...] }
  { "type": "typing",        "is_typing": true }
  { "type": "queue_update",  "queue": [...] }
"""
import json
import logging
import uuid
from decimal import Decimal
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import agent_store as ags
import dynamo as db


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)

log = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _restore_queue_from_db():
    """Repopulate in-memory queue from DynamoDB after a server restart.
    Scans for incomplete sessions that have name+email collected (i.e. reached handoff).
    Only adds sessions not already tracked in memory.
    """
    try:
        from boto3.dynamodb.conditions import Attr
        result = db.tbl_sessions.scan(
            FilterExpression=Attr("is_complete").eq(False)
        )
        for s in result.get("Items", []):
            sid = s.get("session_id")
            if not sid or ags.get_queue_item(sid):
                continue
            cd = s.get("collected_data") or {}
            # Only restore sessions that are actually in the handoff state
            if cd.get("name") and cd.get("email") and s.get("current_state") == "handoff":
                ags.enqueue_session(
                    session_id=sid,
                    user_name=cd.get("name", ""),
                    user_email=cd.get("email", ""),
                    user_type=s.get("user_type", ""),
                )
    except Exception as e:
        log.warning(f"Queue restore from DB failed: {e}")


async def _push(ws: WebSocket, data: dict):
    try:
        await ws.send_text(json.dumps(data, cls=_DecimalEncoder))
    except Exception as e:
        log.warning(f"WebSocket push failed: {e}")


async def _broadcast_agents(data: dict):
    """Push a message to every connected agent."""
    for conn in ags.get_agent_connections():
        await _push(conn["ws"], data)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    params      = websocket.query_params
    role        = params.get("role")        # "user" | "agent"
    session_id  = params.get("session_id")
    agent_id    = params.get("agent_id")
    agent_name  = params.get("name", "")   # optional name for auto-registration

    if role not in ("user", "agent"):
        await websocket.close(code=4000)
        return

    connection_id = str(uuid.uuid4())
    ags.save_connection(connection_id, role, session_id, agent_id, websocket)
    log.info(f"WS connected: role={role} session={session_id} agent={agent_id} conn={connection_id}")

    # When an agent connects, ensure they are registered (handles server restarts)
    if role == "agent" and agent_id:
        if not ags.get_agent(agent_id) and agent_name:
            ags.register_agent(agent_id, agent_name)
        ags.heartbeat(agent_id)
        # Repopulate in-memory queue from DB on agent connect (handles server restarts)
        _restore_queue_from_db()
        queue = ags.list_queue()
        waiting = [q for q in queue if q["status"] == "waiting"]
        await _push(websocket, {"type": "queue_update", "queue": waiting})

    # When a user connects in waiting state, broadcast queue update to all agents
    if role == "user" and session_id:
        queue_item = ags.get_queue_item(session_id)
        if queue_item and queue_item["status"] == "waiting":
            waiting = [q for q in ags.list_queue() if q["status"] == "waiting"]
            await _broadcast_agents({"type": "queue_update", "queue": waiting})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = msg.get("type")

            # ------------------------------------------------------------------
            # User or agent sends a chat message
            # ------------------------------------------------------------------
            if msg_type == "sendMessage":
                text       = msg.get("text", "").strip()
                target_sid = msg.get("session_id") or session_id
                if not text:
                    continue

                if role == "user":
                    # Save to DB and forward to agent
                    db.add_message(target_sid, "user", text, "handoff")
                    queue_item = ags.get_queue_item(target_sid)
                    if queue_item and queue_item.get("agent_id"):
                        agent_conn = ags.get_agent_connection(queue_item["agent_id"])
                        if agent_conn:
                            await _push(agent_conn["ws"], {
                                "type":        "message",
                                "from":        "user",
                                "session_id":  target_sid,
                                "text":        text,
                                "sender_name": queue_item.get("user_name", "User"),
                            })

                elif role == "agent":
                    # Save to DB and forward to user
                    db.add_message(target_sid, "agent", text, "handoff")
                    agent_info = ags.get_agent(agent_id)
                    agent_name = agent_info["name"] if agent_info else "Agent"
                    user_conn  = ags.get_user_connection_for_session(target_sid)
                    if user_conn:
                        await _push(user_conn["ws"], {
                            "type":        "message",
                            "from":        "agent",
                            "text":        text,
                            "sender_name": agent_name,
                        })

            # ------------------------------------------------------------------
            # Agent accepts a queued session
            # ------------------------------------------------------------------
            elif msg_type == "acceptChat" and role == "agent":
                target_sid = msg.get("session_id")
                if not target_sid or not agent_id:
                    continue

                # If the queue item was lost (server restart), reconstruct it from DB
                if not ags.get_queue_item(target_sid):
                    session_from_db = db.get_session(target_sid)
                    if session_from_db and not session_from_db.get("is_complete"):
                        cd = session_from_db.get("collected_data") or {}
                        ags.enqueue_session(
                            session_id=target_sid,
                            user_name=cd.get("name", ""),
                            user_email=cd.get("email", ""),
                            user_type=session_from_db.get("user_type", ""),
                        )

                accepted = ags.accept_session(target_sid, agent_id)
                if not accepted:
                    await _push(websocket, {"type": "error", "message": "Session already taken or not found."})
                    continue

                # Send full conversation history + session data to agent
                session    = db.get_session(target_sid)
                queue_item = ags.get_queue_item(target_sid)
                history    = db.get_messages(target_sid)
                history_out = [
                    {"role": m["role"], "content": m["content"], "created_at": m.get("created_at", "")}
                    for m in history
                ]
                # Build session for agent — queue_item is the authoritative source for
                # name/email/type since it was captured at enqueue time from collected_data
                session_out = dict(session or {})
                if not session_out.get("collected_data"):
                    session_out["collected_data"] = {}
                cd = session_out["collected_data"]
                if queue_item:
                    # Always apply queue_item values — they come directly from state machine
                    if queue_item.get("user_name"):
                        cd["name"]  = queue_item["user_name"]
                    if queue_item.get("user_email"):
                        cd["email"] = queue_item["user_email"]
                    if queue_item.get("user_type") and not session_out.get("user_type"):
                        session_out["user_type"] = queue_item["user_type"]
                    session_out["queued_at"] = queue_item.get("queued_at", "")

                await _push(websocket, {
                    "type":    "chat_context",
                    "session": session_out,
                    "history": history_out,
                    "session_id": target_sid,
                })

                # Notify user that agent has joined
                agent_info = ags.get_agent(agent_id)
                agent_name = agent_info["name"] if agent_info else "An agent"
                user_conn  = ags.get_user_connection_for_session(target_sid)
                if user_conn:
                    await _push(user_conn["ws"], {
                        "type":       "agent_joined",
                        "agent_name": agent_name,
                    })

                # Update all agents with new queue state (item removed from waiting)
                waiting = [q for q in ags.list_queue() if q["status"] == "waiting"]
                await _broadcast_agents({"type": "queue_update", "queue": waiting})

            # ------------------------------------------------------------------
            # Agent ends the chat
            # ------------------------------------------------------------------
            elif msg_type == "endChat" and role == "agent":
                target_sid = msg.get("session_id")
                if not target_sid:
                    continue

                ags.close_session(target_sid)

                user_conn = ags.get_user_connection_for_session(target_sid)
                if user_conn:
                    await _push(user_conn["ws"], {"type": "agent_left"})

                # Confirm to agent
                await _push(websocket, {"type": "chat_closed", "session_id": target_sid})

                # Refresh queue for all agents
                waiting = [q for q in ags.list_queue() if q["status"] == "waiting"]
                await _broadcast_agents({"type": "queue_update", "queue": waiting})

            # ------------------------------------------------------------------
            # Typing indicator
            # ------------------------------------------------------------------
            elif msg_type == "typing":
                target_sid = msg.get("session_id") or session_id
                is_typing  = msg.get("is_typing", False)

                if role == "user":
                    queue_item = ags.get_queue_item(target_sid)
                    if queue_item and queue_item.get("agent_id"):
                        agent_conn = ags.get_agent_connection(queue_item["agent_id"])
                        if agent_conn:
                            await _push(agent_conn["ws"], {
                                "type":       "typing",
                                "is_typing":  is_typing,
                                "session_id": target_sid,
                            })
                elif role == "agent":
                    user_conn = ags.get_user_connection_for_session(target_sid)
                    if user_conn:
                        await _push(user_conn["ws"], {
                            "type":      "typing",
                            "is_typing": is_typing,
                        })

    except WebSocketDisconnect:
        pass
    finally:
        ags.remove_connection(connection_id)
        log.info(f"WS disconnected: conn={connection_id} role={role}")

        if role == "agent" and agent_id:
            ags.set_agent_offline(agent_id)
            # Notify any active chat users this agent had
            for item in ags.list_queue():
                if item.get("agent_id") == agent_id and item["status"] == "active":
                    user_conn = ags.get_user_connection_for_session(item["session_id"])
                    if user_conn:
                        await _push(user_conn["ws"], {
                            "type":    "agent_left",
                            "message": "The agent got disconnected. Please wait while we reconnect you.",
                        })

        if role == "user" and session_id:
            # Find if this user was in an active chat with an agent
            queue_item = ags.get_queue_item(session_id)
            if queue_item and queue_item["status"] == "active":
                assigned_agent_id = queue_item.get("agent_id")
                ags.close_session(session_id)
                if assigned_agent_id:
                    agent_conn = ags.get_agent_connection(assigned_agent_id)
                    if agent_conn:
                        await _push(agent_conn["ws"], {
                            "type":       "user_left",
                            "session_id": session_id,
                        })
                # Refresh queue for all agents
                waiting = [q for q in ags.list_queue() if q["status"] == "waiting"]
                await _broadcast_agents({"type": "queue_update", "queue": waiting})
