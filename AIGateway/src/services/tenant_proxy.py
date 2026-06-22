"""
Tenant proxy service — orchestrates the chat/embedding flow for JWT-authenticated
requests proxied from Express.

This is the counterpart to proxy_service.py (which handles virtual key auth).
Both share the same underlying functions: endpoint resolution, guardrails,
budget, rate limiting, spend logging.

Flow:
  1. Resolve endpoint by slug (check role access)
  2. Rate limit check (Redis)
  3. Guardrail pre-scan (mask/block)
  4. Prompt template resolution
  5. Cost estimation + budget reservation
  6. LLM call (LiteLLM)
  7. Spend logging + budget reconciliation
  8. Budget alert check (Redis dedup)
"""

import json
import logging
import re
import time
from typing import AsyncIterator, Optional

from fastapi import HTTPException
from sqlalchemy import text

from config import settings
from database.db import get_db
from services.cost_service import estimate_prompt_cost
from services.llm_service import chat_completion, embedding, stream_chat_completion
from services.proxy_service import (
    check_org_budget,
    check_rate_limit,
    log_spend,
    reconcile_budget,
    run_guardrails,
    _get_redis,
)
from utils.encryption import decrypt as decrypt_api_key
from utils.notifications import notify_budget_warning, notify_budget_exhausted, notify_virtual_key_budget_exhausted

logger = logging.getLogger("uvicorn")

MAX_FALLBACK_DEPTH = 3
MAX_LOG_TEXT_LENGTH = 2048


# ─── Endpoint Resolution ─────────────────────────────────────────────────────

async def resolve_endpoint(
    organization_id: int,
    endpoint_slug: str,
    role_id: Optional[int] = None,
) -> dict:
    """Resolve endpoint by slug, check role access, decrypt API key."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT e.id, e.slug, e.display_name, e.provider, e.model,
                       e.max_tokens, e.temperature, e.system_prompt,
                       e.rate_limit_rpm, e.prompt_id, e.prompt_label,
                       e.fallback_endpoint_id, e.is_active,
                       e.allowed_role_ids,
                       k.encrypted_key, k.is_active AS key_is_active
                FROM ai_gateway_endpoints e
                JOIN ai_gateway_api_keys k ON e.api_key_id = k.id
                WHERE e.organization_id = :org_id AND e.slug = :slug
            """),
            {"org_id": organization_id, "slug": endpoint_slug},
        )
        row = result.mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Endpoint not found: {endpoint_slug}")
    if not row["is_active"]:
        raise HTTPException(status_code=400, detail=f"Endpoint is inactive: {endpoint_slug}")
    if not row["key_is_active"]:
        raise HTTPException(status_code=400, detail=f"API key is inactive for endpoint: {endpoint_slug}")

    # Role-based access
    allowed_roles = row["allowed_role_ids"]
    if allowed_roles and len(allowed_roles) > 0:
        if not role_id or role_id not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Your role does not have access to endpoint: {endpoint_slug}",
            )

    decrypted_key = decrypt_api_key(row["encrypted_key"])
    return {**dict(row), "decrypted_key": decrypted_key}


async def resolve_endpoint_by_id(organization_id: int, endpoint_id: int) -> Optional[dict]:
    """Resolve endpoint by ID (for fallback chains)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT e.id, e.slug, e.display_name, e.provider, e.model,
                       e.max_tokens, e.temperature, e.system_prompt,
                       e.rate_limit_rpm, e.prompt_id, e.prompt_label,
                       e.fallback_endpoint_id, e.is_active,
                       e.allowed_role_ids,
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


# ─── Prompt Template Resolution ───────────────────────────────────────────────

def _resolve_variables(messages: list[dict], variables: dict) -> list[dict]:
    """Replace {{variable}} placeholders in message content."""
    resolved = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            for key, value in variables.items():
                content = content.replace(f"{{{{{key}}}}}", str(value))
        resolved.append({**msg, "content": content})
    return resolved


async def _resolve_prompt_by_label(
    organization_id: int, prompt_id: int, label: str
) -> Optional[dict]:
    """Resolve a prompt version by label, falling back to published."""
    async with get_db() as db:
        # Try label first
        result = await db.execute(
            text("""
                SELECT pv.id, pv.version, pv.content, pv.model_override
                FROM ai_gateway_prompt_labels pl
                JOIN ai_gateway_prompt_versions pv
                    ON pv.prompt_id = pl.prompt_id AND pv.version = pl.version
                WHERE pl.prompt_id = :prompt_id
                  AND pl.organization_id = :org_id
                  AND pl.label = :label
            """),
            {"prompt_id": prompt_id, "org_id": organization_id, "label": label},
        )
        row = result.mappings().fetchone()
        if row:
            content = row["content"]
            if isinstance(content, str):
                content = json.loads(content)
            return {"content": content, "model_override": row["model_override"]}

        # Fallback to published version
        result = await db.execute(
            text("""
                SELECT id, version, content, model_override
                FROM ai_gateway_prompt_versions
                WHERE prompt_id = :prompt_id
                  AND organization_id = :org_id
                  AND is_published = true
                ORDER BY version DESC LIMIT 1
            """),
            {"prompt_id": prompt_id, "org_id": organization_id},
        )
        row = result.mappings().fetchone()
        if row:
            content = row["content"]
            if isinstance(content, str):
                content = json.loads(content)
            return {"content": content, "model_override": row["model_override"]}

    return None


async def _resolve_prompt_references(
    organization_id: int, messages: list[dict]
) -> list[dict]:
    """Resolve @prompt:slug composability references in message content."""
    pattern = re.compile(r"@prompt:([a-z0-9][a-z0-9-]*)")
    resolved = []
    for msg in messages:
        content = msg.get("content", "")
        if not isinstance(content, str) or "@prompt:" not in content:
            resolved.append(msg)
            continue
        slugs = pattern.findall(content)
        for slug in slugs:
            async with get_db() as db:
                result = await db.execute(
                    text("""
                        SELECT pv.content
                        FROM ai_gateway_prompts p
                        JOIN ai_gateway_prompt_versions pv
                            ON pv.prompt_id = p.id AND pv.is_published = true
                        WHERE p.organization_id = :org_id AND p.slug = :slug
                        ORDER BY pv.version DESC LIMIT 1
                    """),
                    {"org_id": organization_id, "slug": slug},
                )
                row = result.mappings().fetchone()
            if row:
                ref_content = row["content"]
                if isinstance(ref_content, str):
                    ref_content = json.loads(ref_content)
                # Flatten referenced prompt messages into text
                ref_text = "\n".join(
                    m.get("content", "") for m in ref_content if isinstance(m, dict)
                )
                content = content.replace(f"@prompt:{slug}", ref_text)
        resolved.append({**msg, "content": content})
    return resolved


async def build_final_messages(
    organization_id: int,
    endpoint: dict,
    scanned_messages: list[dict],
    metadata: Optional[dict] = None,
) -> list[dict]:
    """Build final messages by resolving prompt templates."""
    if endpoint.get("prompt_id"):
        try:
            label = endpoint.get("prompt_label") or "production"
            prompt_data = await _resolve_prompt_by_label(
                organization_id, endpoint["prompt_id"], label
            )
            if prompt_data and prompt_data.get("content"):
                content = prompt_data["content"]
                # Resolve @prompt:slug composability
                has_refs = any(
                    "@prompt:" in (m.get("content", "") if isinstance(m, dict) else "")
                    for m in content
                )
                if has_refs:
                    content = await _resolve_prompt_references(organization_id, content)
                # Resolve {{variable}} placeholders
                variables = metadata or {}
                return [*_resolve_variables(content, variables), *scanned_messages]
            # No published version — fall through to system_prompt
            if endpoint.get("system_prompt"):
                return [
                    {"role": "system", "content": endpoint["system_prompt"]},
                    *scanned_messages,
                ]
            return scanned_messages
        except Exception as e:
            logger.error(f"Failed to resolve prompt template: {e}")
            if endpoint.get("system_prompt"):
                return [
                    {"role": "system", "content": endpoint["system_prompt"]},
                    *scanned_messages,
                ]
            return scanned_messages

    if endpoint.get("system_prompt"):
        return [
            {"role": "system", "content": endpoint["system_prompt"]},
            *scanned_messages,
        ]
    return scanned_messages


# ─── Budget Alert ─────────────────────────────────────────────────────────────

def _get_monthly_alert_ttl() -> tuple[str, int]:
    """Get current month key and TTL for Redis alert dedup."""
    from datetime import datetime, timezone
    import calendar

    now = datetime.now(timezone.utc)
    month = now.strftime("%Y-%m")
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_remaining = days_in_month - now.day + 1
    return month, days_remaining * 86400


async def _check_budget_alert(organization_id: int):
    """Check budget alert threshold and send notification (Redis dedup)."""
    try:
        async with get_db() as db:
            result = await db.execute(
                text("""
                    SELECT monthly_limit_usd, current_spend_usd,
                           alert_threshold_pct, is_hard_limit
                    FROM ai_gateway_budgets WHERE organization_id = :org_id
                """),
                {"org_id": organization_id},
            )
            budget = result.mappings().fetchone()

        if not budget or not budget["monthly_limit_usd"]:
            return
        limit = float(budget["monthly_limit_usd"])
        if limit <= 0:
            return
        spend_pct = (float(budget["current_spend_usd"]) / limit) * 100
        threshold = budget["alert_threshold_pct"] or 80
        if spend_pct < threshold:
            return

        month, ttl = _get_monthly_alert_ttl()
        r = await _get_redis()

        if spend_pct >= 100 and budget["is_hard_limit"]:
            key = f"gw:alert:exhausted:{organization_id}:{month}"
            if await r.get(key):
                return
            await r.set(key, "1", ex=ttl)
            await notify_budget_exhausted(organization_id, dict(budget))
        else:
            key = f"gw:alert:warning:{organization_id}:{month}"
            if await r.get(key):
                return
            await r.set(key, "1", ex=ttl)
            await notify_budget_warning(organization_id, dict(budget))
    except Exception as e:
        logger.error(f"Budget alert check failed: {e}")


# ─── Spend Logging ────────────────────────────────────────────────────────────

def _truncate_log_text(text_str: str, max_len: int = MAX_LOG_TEXT_LENGTH) -> str:
    if not text_str or len(text_str) <= max_len:
        return text_str
    start = int(max_len * 0.8)
    end = max(0, max_len - start - 60)
    skipped = len(text_str) - start - end
    return f"{text_str[:start]} ... (truncated {skipped} chars) ... {text_str[-end:]}" if end > 0 else text_str[:start]


async def _finalize_spend(
    organization_id: int,
    endpoint_id: int,
    user_id: int,
    provider: str,
    model: str,
    usage: dict,
    cost_usd: float,
    latency_ms: int,
    status_code: int,
    estimated_cost: float,
    metadata: Optional[dict] = None,
    request_messages: Optional[list] = None,
    response_text: Optional[str] = None,
    error_message: Optional[str] = None,
):
    """Log spend and reconcile budget after request completes."""
    try:
        # Get log settings
        log_bodies = {"request": False, "response": False}
        try:
            async with get_db() as db:
                result = await db.execute(
                    text("""
                        SELECT log_request_body, log_response_body
                        FROM ai_gateway_guardrail_settings
                        WHERE organization_id = :org_id
                    """),
                    {"org_id": organization_id},
                )
                settings_row = result.mappings().fetchone()
                if settings_row:
                    log_bodies["request"] = settings_row["log_request_body"] is True
                    log_bodies["response"] = settings_row["log_response_body"] is True
        except Exception:
            pass

        # Truncate messages for logging
        req_msgs = None
        if log_bodies["request"] and request_messages:
            last_n = request_messages[-3:]
            req_msgs = [
                {**m, "content": _truncate_log_text(m.get("content", "")) if isinstance(m.get("content"), str) else m.get("content")}
                for m in last_n
            ]

        resp_text = None
        if log_bodies["response"] and response_text:
            resp_text = _truncate_log_text(response_text)

        err_msg = _truncate_log_text(error_message, 500) if error_message else None

        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_spend_logs
                        (organization_id, endpoint_id, user_id, provider, model,
                         prompt_tokens, completion_tokens, total_tokens,
                         cost_usd, latency_ms, status_code, metadata,
                         request_messages, response_text, error_message)
                    VALUES
                        (:org_id, :endpoint_id, :user_id, :provider, :model,
                         :prompt_tokens, :completion_tokens, :total_tokens,
                         :cost_usd, :latency_ms, :status_code, CAST(:metadata AS jsonb),
                         CAST(:request_messages AS jsonb), :response_text, :error_message)
                """),
                {
                    "org_id": organization_id,
                    "endpoint_id": endpoint_id,
                    "user_id": user_id,
                    "provider": provider,
                    "model": model,
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                    "cost_usd": cost_usd,
                    "latency_ms": latency_ms,
                    "status_code": status_code,
                    "metadata": json.dumps(metadata or {}),
                    "request_messages": json.dumps(req_msgs) if req_msgs else None,
                    "response_text": resp_text,
                    "error_message": err_msg,
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log spend: {e}")

    # Reconcile budget
    try:
        await reconcile_budget(organization_id, estimated_cost, cost_usd)
    except Exception as e:
        logger.error(f"Failed to reconcile budget: {e}")

    # Budget alert (non-blocking)
    await _check_budget_alert(organization_id)


# ─── Chat Completion ──────────────────────────────────────────────────────────

async def tenant_chat_completion(
    organization_id: int,
    endpoint_slug: str,
    messages: list[dict],
    user_id: int,
    role_id: Optional[int] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    metadata: Optional[dict] = None,
    _fallback_depth: int = 0,
) -> dict:
    """Proxy a tenant-authenticated chat completion through the full pipeline."""
    endpoint = await resolve_endpoint(organization_id, endpoint_slug, role_id)

    # Rate limit
    if endpoint.get("rate_limit_rpm") and endpoint["rate_limit_rpm"] > 0:
        if not await check_rate_limit(f"ep:{endpoint['id']}", endpoint["rate_limit_rpm"]):
            raise HTTPException(status_code=429, detail=f"Rate limit exceeded for endpoint {endpoint_slug}")

    # Guardrails
    scanned_messages = await run_guardrails(organization_id, messages, endpoint["id"])

    # Prompt template resolution
    final_messages = await build_final_messages(
        organization_id, endpoint, scanned_messages, metadata
    )

    # Cost estimation + budget
    estimated_cost = 0.0
    try:
        estimated_cost = estimate_prompt_cost(endpoint["model"], final_messages)
    except Exception:
        pass

    budget_ok = await check_org_budget(organization_id, estimated_cost)
    if not budget_ok:
        raise HTTPException(status_code=429, detail="Monthly budget limit exceeded")

    start_time = time.time()
    status_code = 200

    try:
        result = await chat_completion(
            model=endpoint["model"],
            messages=final_messages,
            api_key=endpoint["decrypted_key"],
            max_tokens=max_tokens or endpoint.get("max_tokens"),
            temperature=temperature if temperature is not None else endpoint.get("temperature"),
            top_p=top_p,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        cost_usd = result.get("cost_usd", 0)

        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], result.get("model", endpoint["model"]),
            usage, cost_usd, latency_ms, status_code, estimated_cost,
            metadata=metadata, request_messages=final_messages,
            response_text=result.get("choices", [{}])[0].get("message", {}).get("content"),
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], endpoint["model"],
            {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            0, latency_ms, 500, estimated_cost,
            request_messages=final_messages, error_message=str(e)[:500],
        )

        # Fallback chain
        if (
            endpoint.get("fallback_endpoint_id")
            and _fallback_depth < MAX_FALLBACK_DEPTH
        ):
            fallback = await resolve_endpoint_by_id(
                organization_id, endpoint["fallback_endpoint_id"]
            )
            if fallback:
                logger.info(
                    f"Falling back from {endpoint_slug} to {fallback['slug']} "
                    f"(depth {_fallback_depth + 1}/{MAX_FALLBACK_DEPTH})"
                )
                return await tenant_chat_completion(
                    organization_id, fallback["slug"], scanned_messages,
                    user_id, role_id, max_tokens, temperature, top_p,
                    metadata, _fallback_depth + 1,
                )

        raise HTTPException(status_code=502, detail=str(e))


# ─── Streaming Chat Completion ────────────────────────────────────────────────

async def tenant_stream_completion(
    organization_id: int,
    endpoint_slug: str,
    messages: list[dict],
    user_id: int,
    role_id: Optional[int] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    metadata: Optional[dict] = None,
    _fallback_depth: int = 0,
) -> AsyncIterator[str]:
    """Proxy a tenant-authenticated streaming chat completion."""
    endpoint = await resolve_endpoint(organization_id, endpoint_slug, role_id)

    # Rate limit
    if endpoint.get("rate_limit_rpm") and endpoint["rate_limit_rpm"] > 0:
        if not await check_rate_limit(f"ep:{endpoint['id']}", endpoint["rate_limit_rpm"]):
            raise HTTPException(status_code=429, detail=f"Rate limit exceeded for endpoint {endpoint_slug}")

    # Guardrails
    scanned_messages = await run_guardrails(organization_id, messages, endpoint["id"])

    # Prompt template resolution
    final_messages = await build_final_messages(
        organization_id, endpoint, scanned_messages, metadata
    )

    # Cost estimation + budget
    estimated_cost = 0.0
    try:
        estimated_cost = estimate_prompt_cost(endpoint["model"], final_messages)
    except Exception:
        pass

    budget_ok = await check_org_budget(organization_id, estimated_cost)
    if not budget_ok:
        raise HTTPException(status_code=429, detail="Monthly budget limit exceeded")

    start_time = time.time()

    try:
        stream = stream_chat_completion(
            model=endpoint["model"],
            messages=final_messages,
            api_key=endpoint["decrypted_key"],
            max_tokens=max_tokens or endpoint.get("max_tokens"),
            temperature=temperature if temperature is not None else endpoint.get("temperature"),
            top_p=top_p,
        )

        total_cost = 0.0
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        final_model = endpoint["model"]

        async for chunk in stream:
            yield chunk
            # Parse SSE for usage/cost
            if chunk.startswith("data: ") and chunk.strip() != "data: [DONE]":
                try:
                    data = json.loads(chunk[6:])
                    if "usage" in data and data["usage"]:
                        total_usage = data["usage"]
                    if "cost_usd" in data and data["cost_usd"]:
                        total_cost = data["cost_usd"]
                    if "model" in data and data["model"]:
                        final_model = data["model"]
                except (json.JSONDecodeError, KeyError):
                    pass

        latency_ms = int((time.time() - start_time) * 1000)
        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], final_model,
            total_usage, total_cost, latency_ms, 200, estimated_cost,
            metadata=metadata, request_messages=final_messages,
        )

    except HTTPException:
        raise
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], endpoint["model"],
            {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            0, latency_ms, 500, estimated_cost,
            request_messages=final_messages, error_message=str(e)[:500],
        )

        # Fallback chain
        if (
            endpoint.get("fallback_endpoint_id")
            and _fallback_depth < MAX_FALLBACK_DEPTH
        ):
            fallback = await resolve_endpoint_by_id(
                organization_id, endpoint["fallback_endpoint_id"]
            )
            if fallback:
                logger.info(
                    f"Stream falling back from {endpoint_slug} to {fallback['slug']} "
                    f"(depth {_fallback_depth + 1}/{MAX_FALLBACK_DEPTH})"
                )
                async for chunk in tenant_stream_completion(
                    organization_id, fallback["slug"], scanned_messages,
                    user_id, role_id, max_tokens, temperature, top_p,
                    metadata, _fallback_depth + 1,
                ):
                    yield chunk
                return

        raise HTTPException(status_code=502, detail=str(e))


# ─── Embedding ────────────────────────────────────────────────────────────────

async def tenant_embedding(
    organization_id: int,
    endpoint_slug: str,
    input_data: str | list[str],
    user_id: int,
    role_id: Optional[int] = None,
) -> dict:
    """Proxy a tenant-authenticated embedding request."""
    endpoint = await resolve_endpoint(organization_id, endpoint_slug, role_id)

    # Guardrails on input
    if isinstance(input_data, list):
        scanned_items = []
        for item in input_data:
            msgs = await run_guardrails(
                organization_id, [{"role": "user", "content": item}], endpoint["id"]
            )
            scanned_items.append(msgs[0].get("content", item))
        final_input = scanned_items
    else:
        msgs = await run_guardrails(
            organization_id, [{"role": "user", "content": input_data}], endpoint["id"]
        )
        final_input = msgs[0].get("content", input_data)

    # Cost estimation + budget
    cost_text = " ".join(final_input) if isinstance(final_input, list) else final_input
    estimated_cost = 0.0
    try:
        estimated_cost = estimate_prompt_cost(
            endpoint["model"], [{"role": "user", "content": cost_text}]
        )
    except Exception:
        pass

    budget_ok = await check_org_budget(organization_id, estimated_cost)
    if not budget_ok:
        raise HTTPException(status_code=429, detail="Monthly budget limit exceeded")

    start_time = time.time()
    status_code = 200

    try:
        input_list = final_input if isinstance(final_input, list) else [final_input]
        result = await embedding(
            model=endpoint["model"],
            input_text=input_list,
            api_key=endpoint["decrypted_key"],
        )

        latency_ms = int((time.time() - start_time) * 1000)
        usage = result.get("response", {}).get("usage", {})
        cost_usd = result.get("cost_usd", 0)

        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], result.get("model", endpoint["model"]),
            {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": 0,
                "total_tokens": usage.get("total_tokens", 0),
            },
            cost_usd, latency_ms, status_code, estimated_cost,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        await _finalize_spend(
            organization_id, endpoint["id"], user_id,
            endpoint["provider"], endpoint["model"],
            {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            0, latency_ms, 500, estimated_cost,
        )
        raise HTTPException(status_code=502, detail=str(e))
