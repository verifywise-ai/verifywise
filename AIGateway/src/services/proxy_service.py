"""
Proxy service — virtual key authentication, endpoint resolution, budget enforcement,
rate limiting, spend logging, and guardrail scanning for the AI Gateway.

This is the core orchestration layer that enables employees to use the gateway
directly with virtual keys — no VerifyWise account required.
"""

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import HTTPException
from sqlalchemy import text

from config import settings
from database.db import get_db
from services.guardrail_service import scan_text
from utils.encryption import decrypt as decrypt_api_key  # noqa: F401 — re-export

logger = logging.getLogger("uvicorn")

# ─── Redis connection ────────────────────────────────────────────────────────

_redis: Optional[aioredis.Redis] = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


# ─── Virtual Key Authentication ──────────────────────────────────────────────

def hash_virtual_key(plain_key: str) -> str:
    """SHA-256 hash a virtual key (matches the Node.js hashVirtualKey function)."""
    return hashlib.sha256(plain_key.encode("utf-8")).hexdigest()


async def authenticate_virtual_key(bearer_token: str) -> dict:
    """
    Validate a virtual key and return its metadata.
    Raises ValueError if invalid.
    """
    if not bearer_token.startswith("sk-vw-"):
        raise ValueError("Invalid virtual key format")

    key_hash = hash_virtual_key(bearer_token)
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, organization_id, name, allowed_endpoint_ids,
                       allowed_models, blocked_models,
                       allowed_providers, blocked_providers,
                       max_budget_usd, current_spend_usd, rate_limit_rpm,
                       is_active, revoked_at, expires_at
                FROM ai_gateway_virtual_keys
                WHERE key_hash = :key_hash
            """),
            {"key_hash": key_hash},
        )
        row = result.mappings().fetchone()
        if not row:
            raise ValueError("Virtual key not found")
        if not row["is_active"]:
            raise ValueError("Virtual key is inactive")
        if row["revoked_at"]:
            raise ValueError("Virtual key has been revoked")
        if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
            raise ValueError("Virtual key has expired")
        if row["max_budget_usd"] is not None:
            if float(row["current_spend_usd"]) >= float(row["max_budget_usd"]):
                raise ValueError("Virtual key budget exhausted")
        return dict(row)


# ─── Model / Provider ACL Enforcement ────────────────────────────────────────

def _matches_acl(value: str, patterns: list[str]) -> bool:
    """Check if a value matches any pattern in the list. Supports trailing wildcard (e.g. 'gpt-4o*')."""
    for pattern in patterns:
        if pattern.endswith("*"):
            if value.startswith(pattern[:-1]):
                return True
        elif value == pattern:
            return True
    return False


def enforce_model_provider_acls(vk: dict, endpoint: dict):
    """
    Check virtual key model/provider ACLs against the resolved endpoint.
    Raises ValueError if the request is denied.
    """
    provider = endpoint.get("provider", "")
    model = endpoint.get("model", "")

    allowed_providers = vk.get("allowed_providers") or []
    if allowed_providers and not _matches_acl(provider, allowed_providers):
        raise ValueError(f"Virtual key does not allow provider: {provider}")

    blocked_providers = vk.get("blocked_providers") or []
    if blocked_providers and _matches_acl(provider, blocked_providers):
        raise ValueError(f"Virtual key blocks provider: {provider}")

    allowed_models = vk.get("allowed_models") or []
    if allowed_models and not _matches_acl(model, allowed_models):
        raise ValueError(f"Virtual key does not allow model: {model}")

    blocked_models = vk.get("blocked_models") or []
    if blocked_models and _matches_acl(model, blocked_models):
        raise ValueError(f"Virtual key blocks model: {model}")


# ─── Endpoint Resolution ─────────────────────────────────────────────────────

async def resolve_endpoint_for_key(
    organization_id: int,
    endpoint_slug: str,
    allowed_endpoint_ids: list[int],
) -> dict:
    """Resolve an endpoint by slug, verify access, and decrypt the provider API key."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT e.id, e.slug, e.display_name, e.provider, e.model,
                       e.max_tokens, e.temperature, e.system_prompt,
                       e.rate_limit_rpm, e.prompt_id, e.prompt_label,
                       e.fallback_endpoint_id, e.is_active,
                       e.cache_enabled, e.cache_ttl_seconds,
                       k.encrypted_key, k.is_active AS key_is_active
                FROM ai_gateway_endpoints e
                JOIN ai_gateway_api_keys k ON e.api_key_id = k.id
                WHERE e.organization_id = :org_id AND e.slug = :slug
            """),
            {"org_id": organization_id, "slug": endpoint_slug},
        )
        row = result.mappings().fetchone()
        if not row:
            raise ValueError(f"Endpoint not found: {endpoint_slug}")
        if not row["is_active"]:
            raise ValueError(f"Endpoint is inactive: {endpoint_slug}")
        if not row["key_is_active"]:
            raise ValueError(f"API key is inactive for endpoint: {endpoint_slug}")
        if allowed_endpoint_ids and row["id"] not in allowed_endpoint_ids:
            raise ValueError(f"Virtual key does not have access to endpoint: {endpoint_slug}")
        decrypted_key = decrypt_api_key(row["encrypted_key"])
        return {**dict(row), "decrypted_key": decrypted_key}


async def resolve_endpoint_by_id(organization_id: int, endpoint_id: int) -> Optional[dict]:
    """Resolve an endpoint by ID (for fallback chains)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT e.id, e.slug, e.display_name, e.provider, e.model,
                       e.is_active, e.fallback_endpoint_id,
                       e.cache_enabled, e.cache_ttl_seconds,
                       k.encrypted_key, k.is_active AS key_is_active
                FROM ai_gateway_endpoints e
                JOIN ai_gateway_api_keys k ON e.api_key_id = k.id
                WHERE e.organization_id = :org_id AND e.id = :id
            """),
            {"org_id": organization_id, "id": endpoint_id},
        )
        row = result.mappings().fetchone()
        if not row or not row["is_active"] or not row["key_is_active"]:
            return None
        return {**dict(row), "decrypted_key": decrypt_api_key(row["encrypted_key"])}


# ─── Budget Enforcement ──────────────────────────────────────────────────────

async def check_org_budget(organization_id: int, estimated_cost: float) -> bool:
    """Check if org budget allows the request. Atomic UPDATE prevents TOCTOU."""
    if estimated_cost <= 0:
        return True

    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_budgets
                SET current_spend_usd = current_spend_usd + :cost, updated_at = NOW()
                WHERE organization_id = :org_id
                  AND (NOT is_hard_limit OR current_spend_usd + :cost <= monthly_limit_usd)
                RETURNING id
            """),
            {"org_id": organization_id, "cost": estimated_cost},
        )
        await db.commit()
        row = result.mappings().fetchone()
        if row is None:
            check = await db.execute(
                text("SELECT is_hard_limit FROM ai_gateway_budgets WHERE organization_id = :org_id"),
                {"org_id": organization_id},
            )
            budget = check.mappings().fetchone()
            if budget and budget["is_hard_limit"]:
                return False
        return True


async def reconcile_budget(organization_id: int, estimated_cost: float, actual_cost: float):
    """Adjust budget after request completes: remove estimate, add actual."""
    adjustment = actual_cost - estimated_cost
    if abs(adjustment) < 0.000001:
        return
    async with get_db() as db:
        await db.execute(
            text("""
                UPDATE ai_gateway_budgets
                SET current_spend_usd = GREATEST(0, current_spend_usd + :adjustment), updated_at = NOW()
                WHERE organization_id = :org_id
            """),
            {"org_id": organization_id, "adjustment": adjustment},
        )
        await db.commit()


# ─── Rate Limiting ───────────────────────────────────────────────────────────

RATE_LIMIT_WINDOW = 60  # seconds


async def check_rate_limit(key: str, rpm: int) -> bool:
    """Check RPM rate limit using Redis sorted set. Returns True if allowed. Fail-open on Redis error."""
    if rpm <= 0:
        return True
    try:
        r = await _get_redis()
        redis_key = f"gw:rate:{key}"
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

        pipe = r.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zcard(redis_key)
        pipe.zadd(redis_key, {str(now): now})
        pipe.expire(redis_key, RATE_LIMIT_WINDOW + 10)
        results = await pipe.execute()

        count = results[1]  # zcard result before zadd
        return count < rpm
    except Exception as e:
        logger.warning(f"Rate limit check failed (fail-open): {e}")
        return True


async def enforce_rate_limits(endpoint: dict, vk: dict):
    """Check both endpoint and virtual key rate limits. Raises HTTPException(429) if exceeded."""
    if endpoint.get("rate_limit_rpm") and endpoint["rate_limit_rpm"] > 0:
        if not await check_rate_limit(f"ep:{endpoint['id']}", endpoint["rate_limit_rpm"]):
            raise HTTPException(status_code=429, detail="Endpoint rate limit exceeded")
    if vk.get("rate_limit_rpm") and vk["rate_limit_rpm"] > 0:
        if not await check_rate_limit(f"vk:{vk['id']}", vk["rate_limit_rpm"]):
            raise HTTPException(status_code=429, detail="Virtual key rate limit exceeded")


# ─── Spend Logging ───────────────────────────────────────────────────────────

async def log_spend(
    organization_id: int,
    endpoint_id: int,
    virtual_key_id: int,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    cost_usd: float,
    latency_ms: int,
    status_code: int = 200,
    metadata: Optional[dict] = None,
):
    """Insert a spend log entry and update virtual key spend."""
    try:
        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_spend_logs
                        (organization_id, endpoint_id, provider, model,
                         prompt_tokens, completion_tokens, total_tokens,
                         cost_usd, latency_ms, status_code, metadata, virtual_key_id)
                    VALUES
                        (:org_id, :endpoint_id, :provider, :model,
                         :prompt_tokens, :completion_tokens, :total_tokens,
                         :cost_usd, :latency_ms, :status_code, :metadata::jsonb, :vk_id)
                """),
                {
                    "org_id": organization_id,
                    "endpoint_id": endpoint_id,
                    "provider": provider,
                    "model": model,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "cost_usd": cost_usd,
                    "latency_ms": latency_ms,
                    "status_code": status_code,
                    "metadata": json.dumps(metadata or {}),
                    "vk_id": virtual_key_id,
                },
            )
            if cost_usd > 0:
                await db.execute(
                    text("""
                        UPDATE ai_gateway_virtual_keys
                        SET current_spend_usd = current_spend_usd + :cost, updated_at = NOW()
                        WHERE id = :vk_id
                    """),
                    {"cost": cost_usd, "vk_id": virtual_key_id},
                )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log spend: {e}")


async def log_cache_hit(
    organization_id: int,
    endpoint_id: int,
    virtual_key_id: int,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    original_cost_usd: float,
    latency_ms: int,
):
    """Log a cache hit as a spend entry with zero cost and cache metadata."""
    await log_spend(
        organization_id=organization_id,
        endpoint_id=endpoint_id,
        virtual_key_id=virtual_key_id,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_usd=0.0,
        latency_ms=latency_ms,
        metadata={"cache_hit": True, "original_cost_usd": original_cost_usd},
    )


# ─── Guardrail Scanning ─────────────────────────────────────────────────────

async def get_guardrail_config(organization_id: int) -> tuple[list, dict]:
    """Fetch active guardrail rules and settings for an org."""
    async with get_db() as db:
        rules_result = await db.execute(
            text("""
                SELECT id, guardrail_type, name, config, scope, action, is_active
                FROM ai_gateway_guardrails
                WHERE organization_id = :org_id AND is_active = true
                ORDER BY guardrail_type, created_at
            """),
            {"org_id": organization_id},
        )
        rules = [dict(r) for r in rules_result.mappings().fetchall()]

        settings_result = await db.execute(
            text("""
                SELECT pii_on_error, content_filter_on_error,
                       pii_replacement_format, content_filter_replacement,
                       log_retention_days, log_request_body, log_response_body
                FROM ai_gateway_guardrail_settings
                WHERE organization_id = :org_id
            """),
            {"org_id": organization_id},
        )
        settings_row = settings_result.mappings().fetchone()
        return rules, dict(settings_row) if settings_row else {}


async def _log_guardrail_detection(
    organization_id: int,
    guardrail_id: Optional[int],
    endpoint_id: int,
    guardrail_type: str,
    action_taken: str,
    matched_text: str,
    entity_type: str,
    execution_time_ms: int,
):
    """Log a single guardrail detection."""
    try:
        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_guardrail_logs
                        (organization_id, guardrail_id, endpoint_id,
                         guardrail_type, action_taken, matched_text,
                         entity_type, execution_time_ms)
                    VALUES
                        (:org_id, :guardrail_id, :endpoint_id,
                         :guardrail_type, :action_taken, :matched_text,
                         :entity_type, :exec_time)
                """),
                {
                    "org_id": organization_id,
                    "guardrail_id": guardrail_id,
                    "endpoint_id": endpoint_id,
                    "guardrail_type": guardrail_type,
                    "action_taken": action_taken,
                    "matched_text": matched_text,
                    "entity_type": entity_type,
                    "exec_time": execution_time_ms,
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log guardrail detection: {e}")


async def run_guardrails(
    organization_id: int,
    messages: list[dict],
    endpoint_id: int,
) -> list[dict]:
    """
    Scan all user messages through guardrails. Returns possibly-masked messages.
    Raises HTTPException(400) if any message is blocked.
    """
    rules, guardrail_settings = await get_guardrail_config(organization_id)
    if not rules:
        return messages

    updated = list(messages)
    for i, msg in enumerate(updated):
        if msg.get("role") != "user" or not isinstance(msg.get("content"), str):
            continue

        result = scan_text(
            text=msg["content"],
            guardrail_rules=[
                {"guardrail_type": r["guardrail_type"], "config": r["config"],
                 "action": r["action"], "is_active": True, "id": r["id"], "name": r["name"]}
                for r in rules
            ],
            settings=guardrail_settings,
        )

        for detection in (result.detections or []):
            await _log_guardrail_detection(
                organization_id=organization_id,
                guardrail_id=getattr(detection, "guardrail_id", None),
                endpoint_id=endpoint_id,
                guardrail_type=getattr(detection, "guardrail_type", ""),
                action_taken="blocked" if result.blocked else getattr(detection, "action", "allowed"),
                matched_text=getattr(detection, "matched_text", ""),
                entity_type=getattr(detection, "entity_type", ""),
                execution_time_ms=result.execution_time_ms or 0,
            )

        if result.blocked:
            raise HTTPException(
                status_code=400,
                detail=f"Request blocked by guardrail: {result.block_reason or 'policy violation'}",
            )

        if result.masked_text:
            updated[i] = {**msg, "content": result.masked_text}

    return updated
