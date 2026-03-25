"""
S3 compliance storage — WORM writes with KMS encryption.
"""
import json
import os
import boto3

_REGION      = os.getenv("AWS_REGION", "us-east-1")
_BUCKET      = "ebam-compliance-leads"
_ENCRYPT_KEY = os.getenv("KMS_ENCRYPT_KEY_ID", "alias/ebam-s3-encryption")

_s3 = boto3.client("s3", region_name=_REGION)


def _lead_key(year: str, month: str, day: str, session_id: str, suffix: str = "") -> str:
    tag = f"_{suffix}" if suffix else ""
    return f"leads/{year}/{month}/{day}/{session_id}{tag}.json"


def _batch_key(year: str, month: str, day: str) -> str:
    return f"batches/{year}/{month}/{day}/batch.json"


def put_lead_object(session_id: str, date_str: str, payload: dict, suffix: str = "") -> tuple[str, bytes]:
    """
    Write lead JSON to S3 WORM bucket.
    Returns (s3_key, raw_bytes) — bytes used for hashing.
    suffix: 'partial' | 'complete' | 'timeout' — appended to filename.
    """
    year, month, day = date_str.split("-")
    key        = _lead_key(year, month, day, session_id, suffix)
    raw_bytes  = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")

    _s3.put_object(
        Bucket=_BUCKET,
        Key=key,
        Body=raw_bytes,
        ContentType="application/json",
        ServerSideEncryption="aws:kms",
        SSEKMSKeyId=_ENCRYPT_KEY,
        Metadata={
            "session-id": session_id,
            "batch-id":   date_str,
            "schema-version": "1.0",
        },
    )
    return key, raw_bytes


def put_batch_object(date_str: str, batch: dict) -> str:
    """Write the daily batch manifest to S3 WORM. Returns s3_key."""
    year, month, day = date_str.split("-")
    key       = _batch_key(year, month, day)
    raw_bytes = json.dumps(batch, ensure_ascii=False, sort_keys=True).encode("utf-8")

    _s3.put_object(
        Bucket=_BUCKET,
        Key=key,
        Body=raw_bytes,
        ContentType="application/json",
        ServerSideEncryption="aws:kms",
        SSEKMSKeyId=_ENCRYPT_KEY,
        Metadata={
            "batch-id":      date_str,
            "record-count":  str(batch.get("record_count", 0)),
            "merkle-root":   batch.get("merkle_root", ""),
        },
    )
    return key


def get_lead_object_bytes(s3_key: str) -> bytes:
    """Fetch raw bytes of a lead object from S3 for hash verification."""
    resp = _s3.get_object(Bucket=_BUCKET, Key=s3_key)
    return resp["Body"].read()


def get_batch_object(s3_key: str) -> dict:
    """Fetch and parse a batch manifest from S3."""
    resp = _s3.get_object(Bucket=_BUCKET, Key=s3_key)
    return json.loads(resp["Body"].read())
