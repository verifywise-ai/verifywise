"""
Response cache service for the AI Gateway.

Provides exact-match caching using SHA-256 hash of
(model + messages + temperature + max_tokens) as the cache key.
Cache entries are stored in PostgreSQL with per-endpoint TTL.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from crud.cache import (
    get_cached_response,
    store_cached_response,
    increment_hit_count,
    get_cache_stats,
    get_global_cache_settings,
    get_cache_entry_count,
)

logger = logging.getLogger("uvicorn")


def generate_cache_key(
    model: str,
    messages: list[dict],
    temperature: Optional[float],
    max_tokens: Optional[int],
) -> str:
    """
    Generate a deterministic SHA-256 hash from the request parameters
    that affect the LLM response.

    Includes: model, all messages (role + content), temperature, max_tokens.
    Excludes: metadata, timestamps, api_key, user info.
    """
    canonical = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": m.get("role", ""), "content": m.get("content", "")}
                for m in messages
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        sort_keys=True,
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def is_cache_globally_enabled(organization_id: int) -> bool:
    """Check if caching is globally enabled for the org. Defaults to True if no settings row."""
    settings = await get_global_cache_settings(organization_id)
    return settings.get("cache_global_enabled", True)


async def check_cache(
    organization_id: int,
    endpoint_id: int,
    prompt_hash: str,
) -> Optional[dict]:
    """
    Look up a cached response by hash. Returns the cached entry
    (with response_body, tokens, cost) or None on miss.
    Increments hit_count on a hit.
    """
    entry = await get_cached_response(organization_id, endpoint_id, prompt_hash)
    if entry is None:
        return None

    # Check expiry (belt-and-suspenders — query already filters, but be safe)
    if entry.get("expires_at") and entry["expires_at"] < datetime.now(timezone.utc):
        return None

    # Increment hit count (fire-and-forget)
    try:
        await increment_hit_count(entry["id"])
    except Exception:
        pass

    logger.info(
        f"Cache HIT for endpoint_id={endpoint_id} hash={prompt_hash[:12]}... "
        f"(hit #{entry.get('hit_count', 0) + 1})"
    )
    return entry


async def store_in_cache(
    organization_id: int,
    endpoint_id: int,
    prompt_hash: str,
    model: str,
    messages: list[dict],
    response_body: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    cost_usd: float,
    ttl_seconds: int,
) -> None:
    """Store a successful LLM response in the cache."""
    # Build a short preview for debugging (first user message, truncated)
    preview = ""
    for m in messages:
        if m.get("role") == "user" and m.get("content"):
            preview = m["content"][:200]
            break

    # Skip caching very large responses (> 500KB)
    if len(response_body) > 500_000:
        logger.info(f"Cache SKIP for endpoint_id={endpoint_id} — response too large ({len(response_body)} bytes)")
        return

    # Check max entries limit
    settings = await get_global_cache_settings(organization_id)
    max_entries = settings.get("cache_max_entries_per_org", 50000)
    current_count = await get_cache_entry_count(organization_id)
    if current_count >= max_entries:
        logger.info(f"Cache SKIP for endpoint_id={endpoint_id} — max entries reached ({current_count}/{max_entries})")
        return

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

    try:
        await store_cached_response(
            organization_id=organization_id,
            endpoint_id=endpoint_id,
            prompt_hash=prompt_hash,
            model=model,
            prompt_preview=preview,
            response_body=response_body,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            ttl_seconds=ttl_seconds,
            expires_at=expires_at,
        )
        logger.info(f"Cache STORE for endpoint_id={endpoint_id} hash={prompt_hash[:12]}... ttl={ttl_seconds}s")
    except Exception as e:
        logger.warning(f"Cache store failed (non-fatal): {e}")


async def get_cache_statistics(organization_id: int) -> dict:
    """Return cache stats for the dashboard: total entries, total hits, cost saved."""
    return await get_cache_stats(organization_id)
