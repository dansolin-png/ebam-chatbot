from sqlalchemy import Column, String, Text, DateTime, JSON, Boolean
from sqlalchemy.sql import func
from database import Base
import uuid


def gen_id():
    return str(uuid.uuid4())


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_id)
    current_state = Column(String, default="start")
    previous_state = Column(String, nullable=True)
    collected_data = Column(JSON, default=dict)
    user_type = Column(String, nullable=True)   # "advisor" | "cpa"
    is_complete = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)       # "bot" | "user"
    content = Column(Text, nullable=False)
    state_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    user_type = Column(String, nullable=True)   # "advisor" | "cpa"
    collected_data = Column(JSON, default=dict) # all captured fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FlowConfig(Base):
    __tablename__ = "flow_configs"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False, unique=True)
    flow_json = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatbotConfig(Base):
    """
    Stores the editable chatbot configuration:
    greeting, per-audience welcome messages, quick replies, and system prompts.
    Only one row is ever active (id='active').
    """
    __tablename__ = "chatbot_configs"

    id = Column(String, primary_key=True, default=lambda: "active")
    config_json = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
