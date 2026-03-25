"""
DynamoDB operations for compliance records and batches.
"""
import os
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
import boto3

_REGION  = os.getenv("AWS_REGION", "us-east-1")
_dynamo  = boto3.resource("dynamodb", region_name=_REGION)

RECORDS_TABLE = _dynamo.Table("ebam-compliance-records")
BATCHES_TABLE = _dynamo.Table("ebam-compliance-batches")


# ---------------------------------------------------------------------------
# Compliance Records
# ---------------------------------------------------------------------------

def get_last_record_hash(batch_id: str) -> str:
    """Return the record_hash of the latest record in this batch (for chaining)."""
    from compliance import GENESIS_HASH
    response = RECORDS_TABLE.query(
        IndexName="batch_id-index",
        KeyConditionExpression=Key("batch_id").eq(batch_id),
        ScanIndexForward=False,   # newest first
        Limit=1,
        ProjectionExpression="record_hash",
    )
    items = response.get("Items", [])
    return items[0]["record_hash"] if items else GENESIS_HASH


def save_compliance_record(record: dict):
    """Persist a compliance record to DynamoDB."""
    RECORDS_TABLE.put_item(Item=record)


def get_compliance_record(record_id: str) -> dict | None:
    resp = RECORDS_TABLE.get_item(Key={"record_id": record_id})
    return resp.get("Item")


def get_records_for_batch(batch_id: str) -> list[dict]:
    """Return all records for a given batch_id, ordered by timestamp."""
    response = RECORDS_TABLE.query(
        IndexName="batch_id-index",
        KeyConditionExpression=Key("batch_id").eq(batch_id),
        ScanIndexForward=True,
    )
    items = response.get("Items", [])
    # paginate if needed
    while "LastEvaluatedKey" in response:
        response = RECORDS_TABLE.query(
            IndexName="batch_id-index",
            KeyConditionExpression=Key("batch_id").eq(batch_id),
            ScanIndexForward=True,
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))
    return sorted(items, key=lambda r: r["timestamp"])


def update_record_merkle_proof(record_id: str, merkle_proof: list, merkle_index: int):
    """Back-fill Merkle proof after batch is sealed."""
    RECORDS_TABLE.update_item(
        Key={"record_id": record_id},
        UpdateExpression="SET merkle_proof = :p, merkle_index = :i",
        ExpressionAttributeValues={":p": merkle_proof, ":i": merkle_index},
    )


def list_recent_records(limit: int = 50) -> list[dict]:
    """Scan recent compliance records (for UI display)."""
    response = RECORDS_TABLE.scan(Limit=limit)
    return sorted(response.get("Items", []), key=lambda r: r["timestamp"], reverse=True)


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
