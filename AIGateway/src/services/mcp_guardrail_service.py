"""
MCP Gateway guardrails — input scanning, prompt injection detection,
anomaly detection, and circuit breakers for MCP tool calls.
"""

import json
import logging
import re
import time
from typing import Optional

from sqlalchemy import text

from database.db import get_db
from services.guardrail_service import scan_text, ScanResult
from utils.redis import get_redis

logger = logging.getLogger("uvicorn")


# ─── Prompt Injection Detection ─────────────────────────────────────────────

INJECTION_PATTERNS = [
    ("ignore_previous_instructions", re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE)),
    ("ignore_above_instructions", re.compile(r"ignore\s+(all\s+)?above\s+instructions", re.IGNORECASE)),
    ("disregard_previous", re.compile(r"disregard\s+(all\s+)?previous", re.IGNORECASE)),
    ("persona_override_you_are", re.compile(r"you\s+are\s+now\s+a", re.IGNORECASE)),
    ("persona_override_act_as", re.compile(r"act\s+as\s+(if\s+you\s+are|a)\s+", re.IGNORECASE)),
    ("chatml_start_token", re.compile(r"<\|im_start\|>", re.IGNORECASE)),
    ("chatml_end_token", re.compile(r"<\|im_end\|>", re.IGNORECASE)),
    ("system_role_injection", re.compile(r"\bsystem:\s*", re.IGNORECASE)),
    ("admin_override", re.compile(r"ADMIN\s*OVERRIDE", re.IGNORECASE)),
    ("jailbreak", re.compile(r"jailbreak", re.IGNORECASE)),
]


def _check_prompt_injection(input_text: str) -> list[str]:
    """Check text for common prompt injection patterns. Returns list of matched pattern names."""
    if not input_text:
        return []
    # Limit scan length to prevent ReDoS
    scan_text_str = input_text[:50000] if len(input_text) > 50000 else input_text
    matched: list[str] = []
    for name, pattern in INJECTION_PATTERNS:
        try:
            if pattern.search(scan_text_str):
                matched.append(name)
        except Exception:
            pass
    return matched


# ─── MCP Tool Input Scanning ───────────────────────────────────────────────

async def scan_tool_input(org_id: int, tool_name: str, arguments: dict) -> ScanResult:
    """
    Scan MCP tool call arguments through org guardrail rules.

    Fetches active MCP guardrail rules from ai_gateway_mcp_guardrail_rules,
    runs existing scan_text() for PII/content filter checks, and additionally
    checks for prompt injection patterns.
    """
    # Serialize arguments to scannable text
    text_parts: list[str] = []
    for value in arguments.values():
        if isinstance(value, str):
            text_parts.append(value)
        elif isinstance(value, (dict, list)):
            text_parts.append(json.dumps(value))
    input_text = "\n".join(text_parts)

    if not input_text.strip():
        return ScanResult()

    start_time = time.time()

    # Fetch active MCP guardrail rules scoped to this tool (or all tools)
    async with get_db() as db:
        rules_result = await db.execute(
            text("""
                SELECT id, name, rule_type, config, scope, action,
                       applies_to_tools, is_active
                FROM ai_gateway_mcp_guardrail_rules
                WHERE organization_id = :org_id
                  AND is_active = true
                  AND (
                      applies_to_tools IS NULL
                      OR array_length(applies_to_tools, 1) IS NULL
                      OR :tool_name = ANY(applies_to_tools)
                  )
                ORDER BY created_at
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        mcp_rules = [dict(r) for r in rules_result.mappings().fetchall()]

        # Also fetch org-level guardrail settings (reuse existing table)
        settings_result = await db.execute(
            text("""
                SELECT pii_on_error, content_filter_on_error,
                       pii_replacement_format, content_filter_replacement,
                       log_retention_days, log_request_body, log_response_body
                FROM ai_gateway_guardrail_settings
                WHERE organization_id = :org_id
            """),
            {"org_id": org_id},
        )
        settings_row = settings_result.mappings().fetchone()
        guardrail_settings = dict(settings_row) if settings_row else {}

    # Transform MCP rule format to match scan_text expectations
    # rule_type -> guardrail_type
    transformed_rules: list[dict] = []
    for rule in mcp_rules:
        rule_type = rule.get("rule_type", "")
        if rule_type in ("pii", "content_filter"):
            transformed_rules.append({
                "id": rule["id"],
                "guardrail_type": rule_type,
                "name": rule["name"],
                "config": rule.get("config") or {},
                "scope": rule.get("scope", "input"),
                "action": rule.get("action", "block"),
                "is_active": True,
            })

    # Run existing scan_text for PII + content filter rules
    result = scan_text(
        text=input_text,
        guardrail_rules=transformed_rules,
        settings=guardrail_settings,
    )

    # Check for prompt injection patterns
    injection_rules = [r for r in mcp_rules if r.get("rule_type") == "prompt_injection"]
    if injection_rules:
        matched_patterns = _check_prompt_injection(input_text)
        if matched_patterns:
            # Use action from the first prompt_injection rule
            injection_action = injection_rules[0].get("action", "block")
            from services.guardrail_service import Detection

            for pattern_name in matched_patterns:
                result.detections.append(
                    Detection(
                        guardrail_id=injection_rules[0].get("id"),
                        guardrail_type="prompt_injection",
                        entity_type=pattern_name,
                        action=injection_action,
                        matched_text=pattern_name,
                        start=0,
                        end=0,
                        score=1.0,
                    )
                )

            if injection_action == "block":
                result.blocked = True
                result.block_reason = (
                    f"prompt_injection: {matched_patterns[0]} detected"
                )

    result.execution_time_ms = int((time.time() - start_time) * 1000)
    return result


# ─── Anomaly Detection ──────────────────────────────────────────────────────

ANOMALY_WINDOW = 3600  # 1 hour
ANOMALY_MIN_AVERAGE = 5
ANOMALY_MULTIPLIER = 3
EMA_ALPHA = 0.3  # Exponential moving average smoothing factor


async def check_anomaly(agent_key_id: int, tool_name: str) -> bool:
    """
    Check if the current call rate for a tool is anomalous.

    Uses a Redis sorted set to count calls in the last hour and compares
    against a rolling exponential moving average. Returns True if the
    current rate exceeds 3x the rolling average (with a minimum threshold).
    Fails open on Redis errors.
    """
    try:
        r = await get_redis()
        rate_key = f"gw:mcp:anomaly:{agent_key_id}:{tool_name}"
        avg_key = f"gw:mcp:anomaly:avg:{agent_key_id}:{tool_name}"
        now = time.time()
        window_start = now - ANOMALY_WINDOW

        # Record this call and count recent calls atomically
        pipe = r.pipeline()
        pipe.zremrangebyscore(rate_key, 0, window_start)
        pipe.zadd(rate_key, {str(now): now})
        pipe.zcard(rate_key)
        pipe.expire(rate_key, ANOMALY_WINDOW + 60)
        pipe.get(avg_key)
        results = await pipe.execute()

        current_count = results[2]  # zcard after zadd
        stored_avg = results[4]

        rolling_average = float(stored_avg) if stored_avg else 0.0

        # Update rolling average using exponential moving average
        if rolling_average == 0.0:
            new_avg = float(current_count)
        else:
            new_avg = EMA_ALPHA * float(current_count) + (1 - EMA_ALPHA) * rolling_average

        await r.set(avg_key, str(new_avg), ex=ANOMALY_WINDOW * 24)  # Keep for 24 hours

        # Anomaly check: current > 3x average AND average > minimum threshold
        if rolling_average > ANOMALY_MIN_AVERAGE and current_count > ANOMALY_MULTIPLIER * rolling_average:
            logger.warning(
                f"Anomaly detected: agent_key={agent_key_id} tool={tool_name} "
                f"count={current_count} avg={rolling_average:.1f}"
            )
            return True

        return False

    except Exception as e:
        logger.warning(f"Anomaly detection failed (fail-open): {e}")
        return False


# ─── Circuit Breaker ────────────────────────────────────────────────────────

class CircuitBreaker:
    """Per-server circuit breaker using Redis state."""

    FAILURE_THRESHOLD = 5
    RECOVERY_TIMEOUT = 30  # seconds

    @staticmethod
    async def is_open(server_id: int) -> bool:
        """Check if circuit is open (server is unhealthy). Returns True if requests should be blocked."""
        try:
            r = await get_redis()
            state = await r.get(f"gw:mcp:cb:{server_id}:state")
            if state == "open":
                # Check if recovery timeout has passed
                opened_at = await r.get(f"gw:mcp:cb:{server_id}:opened_at")
                if opened_at and (time.time() - float(opened_at)) > CircuitBreaker.RECOVERY_TIMEOUT:
                    # Move to half-open: allow one request through
                    await r.set(f"gw:mcp:cb:{server_id}:state", "half-open", ex=60)
                    return False
                return True
            return False
        except Exception:
            return False  # fail-open

    @staticmethod
    async def record_success(server_id: int) -> None:
        """Record a successful request. Reset circuit breaker."""
        try:
            r = await get_redis()
            pipe = r.pipeline()
            pipe.set(f"gw:mcp:cb:{server_id}:state", "closed", ex=300)
            pipe.delete(f"gw:mcp:cb:{server_id}:failures")
            pipe.delete(f"gw:mcp:cb:{server_id}:opened_at")
            await pipe.execute()
        except Exception:
            pass

    @staticmethod
    async def record_failure(server_id: int) -> None:
        """Record a failed request. Open circuit if threshold reached."""
        try:
            r = await get_redis()
            key = f"gw:mcp:cb:{server_id}:failures"
            count = await r.incr(key)
            await r.expire(key, 120)

            if count >= CircuitBreaker.FAILURE_THRESHOLD:
                pipe = r.pipeline()
                pipe.set(f"gw:mcp:cb:{server_id}:state", "open", ex=300)
                pipe.set(f"gw:mcp:cb:{server_id}:opened_at", str(time.time()), ex=300)
                await pipe.execute()
                logger.warning(
                    f"Circuit breaker OPEN for MCP server {server_id} "
                    f"after {count} failures"
                )
        except Exception:
            pass
