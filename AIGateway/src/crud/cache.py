"""
CRUD operations for the AI Gateway response cache.
All queries use parameterized SQL via SQLAlchemy text().
"""

import time as _time
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from database.db import get_db

# In-memory cache for global settings (rarely changes, queried on every request)
_global_settings_cache: dict[int, tuple[dict, float]] = {}
_SETTINGS_CACHE_TTL = 30  # seconds


async def get_cached_response(
    organization_id: int,
    endpoint_id: int,
    prompt_hash: str,
) -> Optional[dict]:
    """Fetch a non-expired cache entry by (org, endpoint, hash)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, response_body, prompt_tokens, completion_tokens,
                       total_tokens, cost_usd, hit_count, expires_at, model
                FROM ai_gateway_cache
                WHERE organization_id = :org_id
                  AND endpoint_id = :endpoint_id
                  AND prompt_hash = :prompt_hash
                  AND expires_at > NOW()
            """),
            {
                "org_id": organization_id,
                "endpoint_id": endpoint_id,
                "prompt_hash": prompt_hash,
            },
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def store_cached_response(
    organization_id: int,
    endpoint_id: int,
    prompt_hash: str,
    model: str,
    prompt_preview: str,
    response_body: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    cost_usd: float,
    ttl_seconds: int,
    expires_at: datetime,
) -> None:
    """Insert or update a cache entry (upsert on org+endpoint+hash)."""
    async with get_db() as db:
        await db.execute(
            text("""
                INSERT INTO ai_gateway_cache
                    (organization_id, endpoint_id, prompt_hash, model,
                     prompt_preview, response_body,
                     prompt_tokens, completion_tokens, total_tokens, cost_usd,
                     ttl_seconds, expires_at, hit_count, created_at)
                VALUES
                    (:org_id, :endpoint_id, :prompt_hash, :model,
                     :prompt_preview, :response_body,
                     :prompt_tokens, :completion_tokens, :total_tokens, :cost_usd,
                     :ttl_seconds, :expires_at, 0, NOW())
                ON CONFLICT (organization_id, endpoint_id, prompt_hash) DO UPDATE SET
                    response_body = EXCLUDED.response_body,
                    prompt_tokens = EXCLUDED.prompt_tokens,
                    completion_tokens = EXCLUDED.completion_tokens,
                    total_tokens = EXCLUDED.total_tokens,
                    cost_usd = EXCLUDED.cost_usd,
                    ttl_seconds = EXCLUDED.ttl_seconds,
                    expires_at = EXCLUDED.expires_at,
                    hit_count = 0,
                    created_at = NOW()
            """),
            {
                "org_id": organization_id,
                "endpoint_id": endpoint_id,
                "prompt_hash": prompt_hash,
                "model": model,
                "prompt_preview": prompt_preview,
                "response_body": response_body,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "cost_usd": cost_usd,
                "ttl_seconds": ttl_seconds,
                "expires_at": expires_at,
            },
        )
        await db.commit()


async def increment_hit_count(cache_id: int) -> None:
    """Increment hit_count and update last_hit_at."""
    async with get_db() as db:
        await db.execute(
            text("""
                UPDATE ai_gateway_cache
                SET hit_count = hit_count + 1, last_hit_at = NOW()
                WHERE id = :id
            """),
            {"id": cache_id},
        )
        await db.commit()


async def get_cache_stats(organization_id: int) -> dict:
    """Return aggregate cache statistics for the dashboard."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*)                                       AS total_entries,
                    COALESCE(SUM(hit_count), 0)                    AS total_hits,
                    COALESCE(SUM(hit_count * cost_usd), 0)         AS total_cost_saved,
                    COALESCE(SUM(hit_count * total_tokens), 0)     AS total_tokens_saved,
                    ROUND(
                        CASE WHEN COUNT(*) > 0
                            THEN COALESCE(SUM(hit_count), 0)::numeric /
                                 NULLIF(COALESCE(SUM(hit_count), 0) + COUNT(*), 0) * 100
                            ELSE 0
                        END, 1
                    )                                              AS hit_rate_pct
                FROM ai_gateway_cache
                WHERE organization_id = :org_id
                  AND expires_at > NOW()
            """),
            {"org_id": organization_id},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else {
            "total_entries": 0, "total_hits": 0,
            "total_cost_saved": 0, "total_tokens_saved": 0,
            "hit_rate_pct": 0,
        }


async def get_cache_entry_count(organization_id: int) -> int:
    """Count active (non-expired) cache entries for an org."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM ai_gateway_cache
                WHERE organization_id = :org_id AND expires_at > NOW()
            """),
            {"org_id": organization_id},
        )
        row = result.fetchone()
        return row[0] if row else 0


async def purge_expired_cache(organization_id: Optional[int] = None) -> int:
    """Delete expired cache entries. Returns count deleted."""
    async with get_db() as db:
        if organization_id:
            result = await db.execute(
                text("""
                    DELETE FROM ai_gateway_cache
                    WHERE organization_id = :org_id AND expires_at < NOW()
                """),
                {"org_id": organization_id},
            )
        else:
            result = await db.execute(
                text("DELETE FROM ai_gateway_cache WHERE expires_at < NOW()")
            )
        await db.commit()
        return result.rowcount


async def clear_endpoint_cache(organization_id: int, endpoint_id: int) -> int:
    """Clear all cache entries for a specific endpoint."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_cache
                WHERE organization_id = :org_id AND endpoint_id = :endpoint_id
            """),
            {"org_id": organization_id, "endpoint_id": endpoint_id},
        )
        await db.commit()
        return result.rowcount


async def get_global_cache_settings(organization_id: int) -> dict:
    """Read global cache settings from guardrail_settings. Uses in-memory TTL cache (30s)."""
    now = _time.time()
    if organization_id in _global_settings_cache:
        cached, ts = _global_settings_cache[organization_id]
        if now - ts < _SETTINGS_CACHE_TTL:
            return cached

    defaults = {
        "cache_global_enabled": True,
        "cache_default_ttl_seconds": 14400,
        "cache_max_entries_per_org": 50000,
    }
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT cache_global_enabled, cache_default_ttl_seconds, cache_max_entries_per_org
                FROM ai_gateway_guardrail_settings
                WHERE organization_id = :org_id
            """),
            {"org_id": organization_id},
        )
        row = result.mappings().fetchone()
        settings = dict(row) if row else defaults

    _global_settings_cache[organization_id] = (settings, now)
    return settings


async def update_global_cache_settings(
    organization_id: int,
    cache_global_enabled: bool,
    cache_default_ttl_seconds: int,
    cache_max_entries_per_org: int,
) -> dict:
    """Update global cache settings (upsert into guardrail_settings).

    Uses INSERT ON CONFLICT to only touch cache columns, leaving guardrail
    columns untouched on existing rows.
    """
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_guardrail_settings
                    (organization_id, cache_global_enabled, cache_default_ttl_seconds,
                     cache_max_entries_per_org, created_at, updated_at)
                VALUES
                    (:org_id, :enabled, :ttl, :max_entries, NOW(), NOW())
                ON CONFLICT (organization_id) DO UPDATE SET
                    cache_global_enabled = EXCLUDED.cache_global_enabled,
                    cache_default_ttl_seconds = EXCLUDED.cache_default_ttl_seconds,
                    cache_max_entries_per_org = EXCLUDED.cache_max_entries_per_org,
                    updated_at = NOW()
                RETURNING cache_global_enabled, cache_default_ttl_seconds, cache_max_entries_per_org
            """),
            {
                "org_id": organization_id,
                "enabled": cache_global_enabled,
                "ttl": cache_default_ttl_seconds,
                "max_entries": cache_max_entries_per_org,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        # Invalidate in-memory cache so next read sees updated values
        _global_settings_cache.pop(organization_id, None)
        return dict(row) if row else {}
