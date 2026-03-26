"""
DynamoDB-backed rate limiter and origin checker for the chat API.
"""
import logging
import os
import time
import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError
from dotenv import load_dotenv

log = logging.getLogger(__name__)

_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))
if not _is_lambda:
    load_dotenv()

_session   = boto3.Session(
    profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)
_tbl = _session.resource("dynamodb").Table("ebam-rate-limits")

RATE_LIMIT      = int(os.getenv("CHAT_RATE_LIMIT", "20"))   # messages per window
RATE_WINDOW_SEC = int(os.getenv("CHAT_RATE_WINDOW", "60"))  # seconds


def check_rate_limit(ip: str) -> tuple[bool, int]:
    """
    Increment message count for this IP in the current time window.
    Returns (allowed: bool, current_count: int).
    Window = 1 minute, limit = RATE_LIMIT messages.
    """
    window  = int(time.time()) // RATE_WINDOW_SEC
    key     = f"{ip}#{window}"
    ttl     = int(time.time()) + RATE_WINDOW_SEC * 2  # expire after 2 windows

    try:
        resp = _tbl.update_item(
            Key={"rate_key": key},
            UpdateExpression="SET #c = if_not_exists(#c, :zero) + :one, #ttl = :ttl",
            ExpressionAttributeNames={"#c": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={":zero": 0, ":one": 1, ":ttl": ttl},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"])
        return count <= RATE_LIMIT, count
    except Exception as e:
        log.error(f"Rate limit check failed for {ip}: {e}")
        return False, -1   # fail closed — block on DB error to prevent bypass


def is_origin_allowed(origin: str | None, allowed_origins: list[str]) -> bool:
    """
    Check if the request Origin is in the allowed list.
    - If allowed_origins is empty/None → block (fail closed).
    - "*" in the list → allow all (explicit opt-in wildcard).
    - Otherwise exact match (scheme + host + optional port).
    """
    if not allowed_origins:
        return False  # fail closed — misconfigured origins block requests
    if "*" in allowed_origins:
        return True
    if not origin:
        return False   # no origin header and list is set → block
    return origin.rstrip("/") in [o.rstrip("/") for o in allowed_origins]


# ---------------------------------------------------------------------------
# Cached allowed-origins loader (avoids a DB hit on every request)
# ---------------------------------------------------------------------------
_origins_cache: list[str] | None = None
_origins_cache_ts: float = 0.0
_ORIGINS_CACHE_TTL = 120   # seconds


def get_allowed_origins_cached() -> list[str]:
    """Return allowed_origins from chatbot config, cached for 60 seconds."""
    global _origins_cache, _origins_cache_ts
    now = time.time()
    if _origins_cache is not None and (now - _origins_cache_ts) < _ORIGINS_CACHE_TTL:
        return _origins_cache
    try:
        import dynamo as db
        cfg = db.get_chatbot_config() or {}
        origins = cfg.get("allowed_origins") or []
        _origins_cache    = origins
        _origins_cache_ts = now
        return origins
    except Exception as e:
        log.error(f"Failed to load allowed_origins from config: {e}")
        return _origins_cache or []   # return stale cache on error


def invalidate_origins_cache():
    """Call this when chatbot config is saved."""
    global _origins_cache, _origins_cache_ts
    _origins_cache    = None
    _origins_cache_ts = 0.0
