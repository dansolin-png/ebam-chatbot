from fastapi import APIRouter, Depends, Header, HTTPException
from routes.auth import verify_token
import dynamo as db

router = APIRouter(prefix="/leads", tags=["leads"])


def require_auth(authorization: str | None = Header(default=None)):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.delete("/all")
def clear_all_data(_=Depends(require_auth)):
    db.delete_all_data()
    return {"message": "All data cleared."}


@router.get("/")
def list_leads(_=Depends(require_auth)):
    return db.list_leads()
