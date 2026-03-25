"""
KMS wrapper for signing and verifying Merkle roots.
Uses a separate asymmetric RSA_4096 key (alias/ebam-merkle-signing).
"""
import base64
import os
import boto3

_SIGNING_KEY = os.getenv("KMS_SIGNING_KEY_ID", "alias/ebam-merkle-signing")
_REGION      = os.getenv("AWS_REGION", "us-east-1")

_client = boto3.client("kms", region_name=_REGION)


def sign_merkle_root(merkle_root_hex: str) -> str:
    """
    Sign the Merkle root with the KMS asymmetric signing key.
    Returns base64-encoded DER signature.
    """
    message = merkle_root_hex.encode("utf-8")
    response = _client.sign(
        KeyId=_SIGNING_KEY,
        Message=message,
        MessageType="RAW",
        SigningAlgorithm="RSASSA_PKCS1_V1_5_SHA_256",
    )
    return base64.b64encode(response["Signature"]).decode("utf-8")


def verify_merkle_signature(merkle_root_hex: str, signature_b64: str) -> bool:
    """
    Verify the KMS signature against the Merkle root.
    Returns True if valid.
    """
    try:
        message   = merkle_root_hex.encode("utf-8")
        signature = base64.b64decode(signature_b64)
        response  = _client.verify(
            KeyId=_SIGNING_KEY,
            Message=message,
            MessageType="RAW",
            Signature=signature,
            SigningAlgorithm="RSASSA_PKCS1_V1_5_SHA_256",
        )
        return response.get("SignatureValid", False)
    except Exception:
        return False
