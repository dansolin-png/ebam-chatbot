"""
AWS Secrets Manager client for EBAM.

Secrets are loaded once at module import (Lambda cold start) and cached
for the lifetime of the execution environment — no per-request latency.

Secret name: ebam/app-secrets
Keys:        SECRET_KEY, ADMIN_PASSWORD
"""
import json
import logging
import os

import boto3

log = logging.getLogger(__name__)

_SECRET_NAME = os.getenv("APP_SECRET_NAME", "ebam/app-secrets")
_REGION      = os.getenv("AWS_REGION", "us-east-1")

_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))

# ---------------------------------------------------------------------------
# Internal — load once at import time
# ---------------------------------------------------------------------------

def _load() -> dict:
    try:
        session = boto3.Session(
            profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
            region_name=_REGION,
        )
        client = session.client("secretsmanager")
        resp   = client.get_secret_value(SecretId=_SECRET_NAME)
        return json.loads(resp["SecretString"])
    except Exception as e:
        # Fall back to env vars so local dev still works without AWS access.
        # In Lambda the IAM policy guarantees this succeeds; the fallback is
        # only here to keep local `uvicorn` startup from crashing.
        log.warning(f"Secrets Manager unavailable ({e}), falling back to env vars")
        return {}


_secrets: dict = _load()


# ---------------------------------------------------------------------------
# Public accessors
# ---------------------------------------------------------------------------

def get(key: str, fallback: str = "") -> str:
    """Return secret value, falling back to env var then fallback string."""
    return _secrets.get(key) or os.getenv(key, fallback)
