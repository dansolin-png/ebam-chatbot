"""
SNS alert publisher for EBAM.

publish_alert(subject, message)  — fire-and-forget; logs on failure, never raises.
"""
import logging
import os
import traceback

import boto3

log = logging.getLogger(__name__)

_REGION    = os.getenv("AWS_REGION", "us-east-1")
_TOPIC_ARN = os.getenv("ALERT_TOPIC_ARN", "arn:aws:sns:us-east-1:288763316615:ebam-alerts")

_is_lambda = bool(os.getenv("AWS_EXECUTION_ENV") or os.getenv("LAMBDA_TASK_ROOT"))
_boto_session = boto3.Session(
    profile_name=None if _is_lambda else os.getenv("AWS_PROFILE", "ebam"),
    region_name=_REGION,
)
_sns = _boto_session.client("sns")


def publish_alert(subject: str, message: str) -> None:
    """
    Publish an alert to the ebam-alerts SNS topic.
    Truncates subject to 100 chars (SNS limit: 100).
    Never raises — logs errors instead so callers are never disrupted.
    """
    try:
        _sns.publish(
            TopicArn=_TOPIC_ARN,
            Subject=subject[:100],
            Message=message,
        )
        log.info(f"SNS alert published: {subject}")
    except Exception as e:
        log.error(f"Failed to publish SNS alert '{subject}': {e}")


def publish_exception_alert(context: str, exc: Exception) -> None:
    """
    Publish a formatted exception alert.
    context: short description of where the exception occurred.
    """
    tb = traceback.format_exc()
    subject = f"[EBAM ERROR] {context}: {type(exc).__name__}"
    message = (
        f"Context: {context}\n"
        f"Exception: {type(exc).__name__}: {exc}\n\n"
        f"Traceback:\n{tb}"
    )
    publish_alert(subject, message)
