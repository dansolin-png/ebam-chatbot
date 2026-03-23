from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Lead, Session, Message

router = APIRouter(prefix="/leads", tags=["leads"])


@router.delete("/all")
def clear_all_data(db: DBSession = Depends(get_db)):
    """Delete all leads, sessions, and messages (for dev/testing cleanup)."""
    db.query(Lead).delete()
    db.query(Message).delete()
    db.query(Session).delete()
    db.commit()
    return {"message": "All data cleared."}


@router.get("/")
def list_leads(db: DBSession = Depends(get_db)):
    leads = db.query(Lead).order_by(Lead.created_at.desc()).all()
    return [
        {
            "id": l.id,
            "session_id": l.session_id,
            "name": l.name,
            "email": l.email,
            "phone": l.phone,
            "user_type": l.user_type,
            "collected_data": l.collected_data,
            "created_at": l.created_at,
        }
        for l in leads
    ]
