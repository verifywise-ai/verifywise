"""
Shared metric constants and helpers for LLM evaluation reporting.

Single source of truth for safety/inverted metric classification,
pass/fail logic, and metric name formatting.
"""

import re

SAFETY_METRICS = {"bias", "toxicity", "hallucination", "conversationsafety"}
INVERTED_METRICS = {"bias", "toxicity", "hallucination", "conversationsafety"}


def is_safety_metric(name: str) -> bool:
    return name.lower().replace("_", "").replace(" ", "") in SAFETY_METRICS


def is_inverted_metric(name: str) -> bool:
    return name.lower().replace("_", "").replace(" ", "") in INVERTED_METRICS


def did_pass(score: float, threshold: float, inverted: bool) -> bool:
    return (score <= threshold) if inverted else (score >= threshold)


def format_metric_name(key: str) -> str:
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', key)
    name = re.sub(r'_', ' ', name)
    return name.title()
