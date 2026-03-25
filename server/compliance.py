"""
EBAM Compliance Module
Merkle tree, chain hashing, and record integrity logic.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# Hashing helpers
# ---------------------------------------------------------------------------

def sha256_bytes(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_record_id(date_str: str) -> str:
    """Generate a unique record ID: REC-YYYY-MM-DD-<uuid4>"""
    return f"REC-{date_str}-{uuid.uuid4()}"


# ---------------------------------------------------------------------------
# Chain hashing
# ---------------------------------------------------------------------------

def compute_data_hash(s3_object_bytes: bytes) -> str:
    """SHA256 fingerprint of the raw S3 object content."""
    return sha256_hex(s3_object_bytes)


def compute_record_hash(previous_hash: str, data_hash: str, timestamp: str, record_id: str) -> str:
    """
    Chain-linked hash:
      record_hash = SHA256(previous_hash + data_hash + timestamp + record_id)
    Changing any field breaks all subsequent hashes.
    """
    chain_input = (previous_hash + data_hash + timestamp + record_id).encode("utf-8")
    return sha256_hex(chain_input)


GENESIS_HASH = "0" * 64   # sentinel for the very first record


# ---------------------------------------------------------------------------
# S3 object builder
# ---------------------------------------------------------------------------

def build_s3_object(session: dict, messages: list, record_type: str = "partial") -> dict:
    """Build the full compliance JSON to store in S3."""
    collected = session.get("collected_data") or {}
    return {
        "schema_version": "1.0",
        "record_type": record_type,
        "session_id": session["session_id"],
        "audience": session.get("user_type"),
        "created_at": session.get("created_at"),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "lead": {
            "name":  collected.get("name"),
            "email": collected.get("email"),
            "phone": collected.get("phone"),
        },
        "collected_data": collected,
        "conversation": [
            {
                "role":       m["role"],
                "content":    m["content"],
                "state":      m.get("state"),
                "created_at": m.get("created_at"),
            }
            for m in messages
        ],
        "metadata": {
            "message_count": len(messages),
            "is_complete": session.get("is_complete", False),
            "current_state": session.get("current_state"),
        },
    }


# ---------------------------------------------------------------------------
# Merkle tree
# ---------------------------------------------------------------------------

def _hash_pair(left: bytes, right: bytes) -> bytes:
    return sha256_bytes(left + right)


def build_merkle_tree(leaf_hashes: list[bytes]) -> list[list[bytes]]:
    """
    Build a full Merkle tree.
    Returns list of levels bottom-up: tree[0] = leaves, tree[-1] = [root].
    Odd-count levels duplicate the last leaf.
    """
    if not leaf_hashes:
        return [[sha256_bytes(b"empty")]]

    tree = [leaf_hashes[:]]
    while len(tree[-1]) > 1:
        level = tree[-1]
        if len(level) % 2 == 1:
            level = level + [level[-1]]   # duplicate last leaf
        next_level = [_hash_pair(level[i], level[i + 1]) for i in range(0, len(level), 2)]
        tree.append(next_level)
    return tree


def get_merkle_root(tree: list[list[bytes]]) -> str:
    return tree[-1][0].hex()


def get_merkle_proof(tree: list[list[bytes]], index: int) -> list[dict]:
    """
    Return the sibling hashes needed to verify leaf at `index`.
    Each entry: { "hash": hex_str, "position": "left"|"right" }
    """
    proof = []
    for level in tree[:-1]:
        # pad if odd
        if len(level) % 2 == 1:
            level = level + [level[-1]]
        sibling_index = index ^ 1
        if sibling_index < len(level):
            position = "right" if sibling_index > index else "left"
            proof.append({"hash": level[sibling_index].hex(), "position": position})
        index = index // 2
    return proof


def verify_merkle_proof(record_hash_hex: str, proof: list[dict], merkle_root_hex: str) -> bool:
    """
    Recompute root from a leaf + its proof and compare to stored root.
    """
    current = bytes.fromhex(record_hash_hex)
    for step in proof:
        sibling = bytes.fromhex(step["hash"])
        if step["position"] == "right":
            current = _hash_pair(current, sibling)
        else:
            current = _hash_pair(sibling, current)
    return current.hex() == merkle_root_hex


def verify_record_hash(record: dict, s3_bytes: bytes) -> bool:
    """Recompute and verify both data_hash and record_hash for a record."""
    data_hash = compute_data_hash(s3_bytes)
    if data_hash != record["data_hash"]:
        return False
    expected = compute_record_hash(
        record["previous_hash"],
        data_hash,
        record["timestamp"],
        record["record_id"],
    )
    return expected == record["record_hash"]
