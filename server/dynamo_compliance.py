"""
DynamoDB operations for compliance records and batches.

Chain tip design
----------------
A sentinel item keyed `TIP#{batch_id}` lives in the records table (it has no
`batch_id` attribute, so it never appears in the batch_id-index GSI).  It
tracks the running hash tip for the day and is updated atomically alongside
every new compliance record via a DynamoDB Transaction — eliminating the
read-then-write race condition that existed previously.

Cross-day seeding
-----------------
When the first record of a new day is written, `get_chain_tip` finds no TIP
item and falls back to the previous day's sealed batch `end_hash`.  This makes
Day-N's first record cryptographically dependent on Day-(N-1)'s last record,
forming a continuous chain across day boundaries.
"""
import os
from datetime import datetime, timedelta, timezone
from boto3.dynamodb.conditions import Key, Attr
from boto3.dynamodb.types import TypeSerializer
import boto3

_REGION            = os.getenv("AWS_REGION", "us-east-1")
_dynamo            = boto3.resource("dynamodb", region_name=_REGION)
_dynamo_client     = boto3.client("dynamodb",  region_name=_REGION)
_serializer        = TypeSerializer()

RECORDS_TABLE_NAME = "ebam-compliance-records"
RECORDS_TABLE      = _dynamo.Table(RECORDS_TABLE_NAME)
BATCHES_TABLE      = _dynamo.Table("ebam-compliance-batches")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_dynamo(item: dict) -> dict:
    """Convert a plain Python dict to DynamoDB native wire format."""
    return {k: _serializer.serialize(v) for k, v in item.items()}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class ChainTipConflict(Exception):
    """
    Raised when a concurrent write updated the chain tip between our read and
    our transaction attempt.  The caller should retry with a fresh tip.
    """


# ---------------------------------------------------------------------------
# Chain tip — read
# ---------------------------------------------------------------------------

def get_chain_tip(batch_id: str) -> str:
    """
    Return the current chain tip hash for `batch_id`.

    Resolution order:
      1. TIP sentinel item for today (set atomically with each new record).
      2. Previous day's sealed batch `end_hash` (cross-day seed).
      3. GENESIS_HASH — first record ever written.
    """
    from compliance import GENESIS_HASH

    # 1. Today's running tip
    tip = RECORDS_TABLE.get_item(Key={"record_id": f"TIP#{batch_id}"}).get("Item")
    if tip:
        return tip["last_record_hash"]

    # 2. Seed from previous day's sealed batch
    prev_date  = (datetime.strptime(batch_id, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_batch = get_batch(prev_date)
    if prev_batch and prev_batch.get("end_hash"):
        return prev_batch["end_hash"]

    # 3. Genesis
    return GENESIS_HASH


# ---------------------------------------------------------------------------
# Compliance Records — atomic write
# ---------------------------------------------------------------------------

def write_compliance_record_atomic(record: dict, expected_previous_hash: str) -> None:
    """
    Atomically write a compliance record and advance the chain tip using a
    DynamoDB Transaction.

    The transaction performs two operations together:
      • Update TIP#{batch_id} — conditional on `last_record_hash` still
        equalling `expected_previous_hash` (optimistic lock).  Passes on a
        brand-new day when the TIP item does not yet exist.
      • Put the compliance record — conditional on it not already existing.

    Raises ChainTipConflict if a concurrent write updated the tip first.
    The caller is responsible for retrying with a fresh tip.
    """
    batch_id    = record["batch_id"]
    tip_key     = f"TIP#{batch_id}"
    record_hash = record["record_hash"]
    timestamp   = record["timestamp"]

    try:
        _dynamo_client.transact_write_items(
            TransactItems=[
                {
                    # Advance the chain tip — or create it for a new day.
                    # The condition covers two cases:
                    #   a) TIP does not exist yet (first record of the day)
                    #   b) TIP exists and its hash still matches what we read
                    "Update": {
                        "TableName": RECORDS_TABLE_NAME,
                        "Key":       {"record_id": {"S": tip_key}},
                        "UpdateExpression":
                            "SET last_record_hash = :new_hash, updated_at = :ts",
                        "ConditionExpression":
                            "attribute_not_exists(last_record_hash) "
                            "OR last_record_hash = :expected",
                        "ExpressionAttributeValues": {
                            ":new_hash": {"S": record_hash},
                            ":ts":       {"S": timestamp},
                            ":expected": {"S": expected_previous_hash},
                        },
                    }
                },
                {
                    # Insert the compliance record — must not already exist.
                    "Put": {
                        "TableName":           RECORDS_TABLE_NAME,
                        "Item":                _to_dynamo(record),
                        "ConditionExpression": "attribute_not_exists(record_id)",
                    }
                },
            ]
        )
    except _dynamo_client.exceptions.TransactionCanceledException as exc:
        raise ChainTipConflict(
            f"Chain tip conflict for batch {batch_id} — another write won the race"
        ) from exc


# ---------------------------------------------------------------------------
# Compliance Records — reads
# ---------------------------------------------------------------------------

def get_compliance_record(record_id: str) -> dict | None:
    resp = RECORDS_TABLE.get_item(Key={"record_id": record_id})
    return resp.get("Item")


def get_records_for_batch(batch_id: str) -> list[dict]:
    """
    Return all real compliance records for `batch_id`, ordered by timestamp.
    TIP sentinel items are excluded because they have no `batch_id` attribute
    and therefore never appear in the batch_id-index GSI.
    """
    response = RECORDS_TABLE.query(
        IndexName="batch_id-index",
        KeyConditionExpression=Key("batch_id").eq(batch_id),
        ScanIndexForward=True,
    )
    items = response.get("Items", [])
    while "LastEvaluatedKey" in response:
        response = RECORDS_TABLE.query(
            IndexName="batch_id-index",
            KeyConditionExpression=Key("batch_id").eq(batch_id),
            ScanIndexForward=True,
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))
    return sorted(items, key=lambda r: r["timestamp"])


def get_best_record_for_session(session_id: str) -> dict | None:
    """Find the best compliance record for a session (complete > timeout > partial)."""
    rank  = {"complete": 0, "timeout": 1, "partial": 2}
    items = []
    resp  = RECORDS_TABLE.scan(FilterExpression=Attr("session_id").eq(session_id))
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = RECORDS_TABLE.scan(
            FilterExpression=Attr("session_id").eq(session_id),
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))
    if not items:
        return None
    return min(items, key=lambda r: rank.get(r.get("record_type", "partial"), 9))


def get_record_by_s3_key(s3_key: str) -> dict | None:
    """Find a compliance record by its S3 key (full scan with filter)."""
    items = []
    resp  = RECORDS_TABLE.scan(FilterExpression=Attr("s3_key").eq(s3_key))
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = RECORDS_TABLE.scan(
            FilterExpression=Attr("s3_key").eq(s3_key),
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))
    return items[0] if items else None


def list_recent_records(limit: int = 50) -> list[dict]:
    """
    Scan recent compliance records for the UI.
    Filters to record_id starting with 'REC-' to exclude TIP sentinel items.
    """
    items = []
    resp  = RECORDS_TABLE.scan(FilterExpression=Attr("record_id").begins_with("REC-"))
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = RECORDS_TABLE.scan(
            FilterExpression=Attr("record_id").begins_with("REC-"),
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))
    return sorted(items, key=lambda r: r["timestamp"], reverse=True)[:limit]


def update_record_merkle_proof(record_id: str, merkle_proof: list, merkle_index: int):
    """Back-fill Merkle proof after batch is sealed."""
    RECORDS_TABLE.update_item(
        Key={"record_id": record_id},
        UpdateExpression="SET merkle_proof = :p, merkle_index = :i",
        ExpressionAttributeValues={":p": merkle_proof, ":i": merkle_index},
    )


# ---------------------------------------------------------------------------
# Compliance Batches
# ---------------------------------------------------------------------------

def save_batch(batch: dict):
    BATCHES_TABLE.put_item(Item=batch)


def get_batch(batch_id: str) -> dict | None:
    resp = BATCHES_TABLE.get_item(Key={"batch_id": batch_id})
    return resp.get("Item")


def list_batches(limit: int = 30) -> list[dict]:
    response = BATCHES_TABLE.scan(Limit=limit)
    return sorted(response.get("Items", []), key=lambda b: b["batch_id"], reverse=True)
