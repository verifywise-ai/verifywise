from typing import Any, Optional
from sqlalchemy import text
from database.db import get_db


async def get_all_endpoints(org_id: int, role_id: Optional[int] = None) -> list[dict]:
    async with get_db() as db:
        role_filter = "AND :role_id = ANY(e.allowed_role_ids)" if role_id is not None else ""
        params: dict[str, Any] = {"org_id": org_id}
        if role_id is not None:
            params["role_id"] = role_id

        result = await db.execute(
            text(f"""
                SELECT
                    e.id,
                    e.slug,
                    e.display_name,
                    e.provider,
                    e.model,
                    e.api_key_id,
                    ak.key_name,
                    e.max_tokens,
                    e.temperature,
                    e.system_prompt,
                    e.rate_limit_rpm,
                    e.prompt_id,
                    e.prompt_label,
                    e.fallback_endpoint_id,
                    e.allowed_role_ids,
                    e.is_active,
                    e.created_at,
                    e.updated_at,
                    e.cache_enabled,
                    e.cache_ttl_seconds
                FROM ai_gateway_endpoints e
                LEFT JOIN ai_gateway_api_keys ak ON e.api_key_id = ak.id
                WHERE e.organization_id = :org_id
                {role_filter}
                ORDER BY e.created_at DESC
            """),
            params,
        )
        rows = result.mappings().all()
        return [
            {
                **dict(row),
                "created_at": str(row["created_at"]) if row["created_at"] else None,
                "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            }
            for row in rows
        ]
    return []


async def get_endpoint_by_id(org_id: int, id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    e.id,
                    e.slug,
                    e.display_name,
                    e.provider,
                    e.model,
                    e.api_key_id,
                    ak.key_name,
                    e.max_tokens,
                    e.temperature,
                    e.system_prompt,
                    e.rate_limit_rpm,
                    e.prompt_id,
                    e.prompt_label,
                    e.fallback_endpoint_id,
                    e.allowed_role_ids,
                    e.is_active,
                    e.created_at,
                    e.updated_at,
                    e.cache_enabled,
                    e.cache_ttl_seconds
                FROM ai_gateway_endpoints e
                LEFT JOIN ai_gateway_api_keys ak ON e.api_key_id = ak.id
                WHERE e.organization_id = :org_id
                  AND e.id = :id
            """),
            {"org_id": org_id, "id": id},
        )
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    return None


async def create_endpoint(org_id: int, data: dict) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_endpoints (
                    organization_id,
                    slug,
                    display_name,
                    provider,
                    model,
                    api_key_id,
                    max_tokens,
                    temperature,
                    system_prompt,
                    rate_limit_rpm,
                    prompt_id,
                    prompt_label,
                    cache_enabled,
                    cache_ttl_seconds
                ) VALUES (
                    :org_id,
                    :slug,
                    :display_name,
                    :provider,
                    :model,
                    :api_key_id,
                    :max_tokens,
                    :temperature,
                    :system_prompt,
                    :rate_limit_rpm,
                    :prompt_id,
                    :prompt_label,
                    :cache_enabled,
                    :cache_ttl_seconds
                )
                RETURNING *
            """),
            {
                "org_id": org_id,
                "slug": data.get("slug"),
                "display_name": data.get("display_name"),
                "provider": data.get("provider"),
                "model": data.get("model"),
                "api_key_id": data.get("api_key_id"),
                "max_tokens": data.get("max_tokens"),
                "temperature": data.get("temperature"),
                "system_prompt": data.get("system_prompt"),
                "rate_limit_rpm": data.get("rate_limit_rpm"),
                "prompt_id": data.get("prompt_id"),
                "prompt_label": data.get("prompt_label", "production"),
                "cache_enabled": data.get("cache_enabled", False),
                "cache_ttl_seconds": data.get("cache_ttl_seconds", 14400),
            },
        )
        await db.commit()
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    return None


async def update_endpoint(org_id: int, id: int, data: dict) -> Optional[dict]:
    allowed_fields = {
        "slug",
        "display_name",
        "provider",
        "model",
        "api_key_id",
        "max_tokens",
        "temperature",
        "system_prompt",
        "rate_limit_rpm",
        "prompt_id",
        "prompt_label",
        "fallback_endpoint_id",
        "allowed_role_ids",
        "is_active",
        "cache_enabled",
        "cache_ttl_seconds",
    }

    set_clauses: list[str] = []
    params: dict[str, Any] = {"org_id": org_id, "id": id}

    for field in allowed_fields:
        if field not in data:
            continue

        value = data[field]

        if field == "allowed_role_ids":
            # Represent as a PostgreSQL array literal, e.g. '{1,2,3}'
            if isinstance(value, list):
                inner = ",".join(str(v) for v in value)
                array_literal = "{" + inner + "}"
            else:
                array_literal = value  # already a string literal
            set_clauses.append(f"{field} = :allowed_role_ids")
            params["allowed_role_ids"] = array_literal
        else:
            set_clauses.append(f"{field} = :{field}")
            params[field] = value

    if not set_clauses:
        # Nothing to update — return existing row
        return await get_endpoint_by_id(org_id, id)

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_endpoints
                SET {set_sql}
                WHERE organization_id = :org_id
                  AND id = :id
                RETURNING *
            """),
            params,
        )
        await db.commit()
        row = result.mappings().first()
        if not row:
            return None

        # Auto-invalidate cache AFTER successful update
        cache_invalidating_fields = {"model", "system_prompt", "temperature"}
        if any(f in data for f in cache_invalidating_fields):
            from crud.cache import clear_endpoint_cache
            await clear_endpoint_cache(org_id, id)

        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    return None


async def delete_endpoint(org_id: int, id: int) -> bool:
    async with get_db() as db:
        # Log any endpoints that reference this one as a fallback
        fallback_refs = await db.execute(
            text("""
                SELECT id, slug
                FROM ai_gateway_endpoints
                WHERE organization_id = :org_id
                  AND fallback_endpoint_id = :id
            """),
            {"org_id": org_id, "id": id},
        )
        refs = fallback_refs.mappings().all()
        if refs:
            ref_slugs = [row["slug"] for row in refs]
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                "Deleting endpoint id=%s which is referenced as fallback by: %s",
                id,
                ", ".join(ref_slugs),
            )

        # Remove this endpoint from virtual key allowed_endpoint_ids arrays
        await db.execute(
            text("""
                UPDATE ai_gateway_virtual_keys
                SET allowed_endpoint_ids = array_remove(allowed_endpoint_ids, :id)
                WHERE organization_id = :org_id
                  AND :id = ANY(allowed_endpoint_ids)
            """),
            {"org_id": org_id, "id": id},
        )

        # Delete the endpoint
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_endpoints
                WHERE organization_id = :org_id
                  AND id = :id
                RETURNING id
            """),
            {"org_id": org_id, "id": id},
        )
        await db.commit()
        deleted = result.fetchone()
        return deleted is not None
    return False
