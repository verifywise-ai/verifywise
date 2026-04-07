import json
from typing import Any, Optional
from sqlalchemy import text
from database.db import get_db


async def get_all_mcp_servers(org_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    s.id,
                    s.organization_id,
                    s.name,
                    s.slug,
                    s.url,
                    s.auth_type,
                    s.auth_config,
                    s.is_active,
                    s.health_status,
                    s.last_health_check_at,
                    s.description,
                    s.metadata,
                    s.created_by,
                    u.name AS created_by_name,
                    s.created_at,
                    s.updated_at
                FROM ai_gateway_mcp_servers s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.organization_id = :org_id
                ORDER BY s.created_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [
            {
                **dict(row),
                "created_at": str(row["created_at"]) if row["created_at"] else None,
                "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
                "last_health_check_at": (
                    str(row["last_health_check_at"])
                    if row["last_health_check_at"]
                    else None
                ),
            }
            for row in rows
        ]
    return []


async def get_mcp_server(org_id: int, server_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    s.id,
                    s.organization_id,
                    s.name,
                    s.slug,
                    s.url,
                    s.auth_type,
                    s.auth_config,
                    s.is_active,
                    s.health_status,
                    s.last_health_check_at,
                    s.description,
                    s.metadata,
                    s.created_by,
                    u.name AS created_by_name,
                    s.created_at,
                    s.updated_at
                FROM ai_gateway_mcp_servers s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.organization_id = :org_id
                  AND s.id = :server_id
            """),
            {"org_id": org_id, "server_id": server_id},
        )
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            "last_health_check_at": (
                str(row["last_health_check_at"])
                if row["last_health_check_at"]
                else None
            ),
        }
    return None


async def get_mcp_server_by_slug(org_id: int, slug: str) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    s.id,
                    s.organization_id,
                    s.name,
                    s.slug,
                    s.url,
                    s.auth_type,
                    s.auth_config,
                    s.is_active,
                    s.health_status,
                    s.last_health_check_at,
                    s.description,
                    s.metadata,
                    s.created_by,
                    u.name AS created_by_name,
                    s.created_at,
                    s.updated_at
                FROM ai_gateway_mcp_servers s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.organization_id = :org_id
                  AND s.slug = :slug
            """),
            {"org_id": org_id, "slug": slug},
        )
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            "last_health_check_at": (
                str(row["last_health_check_at"])
                if row["last_health_check_at"]
                else None
            ),
        }
    return None


async def create_mcp_server(org_id: int, data: dict) -> Optional[dict]:
    async with get_db() as db:
        auth_config = data.get("auth_config")
        if auth_config is not None and not isinstance(auth_config, str):
            auth_config = json.dumps(auth_config)

        metadata = data.get("metadata")
        if metadata is not None and not isinstance(metadata, str):
            metadata = json.dumps(metadata)

        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_mcp_servers (
                    organization_id,
                    name,
                    slug,
                    url,
                    auth_type,
                    auth_config,
                    description,
                    metadata,
                    created_by
                ) VALUES (
                    :org_id,
                    :name,
                    :slug,
                    :url,
                    :auth_type,
                    CAST(:auth_config AS jsonb),
                    :description,
                    CAST(:metadata AS jsonb),
                    :created_by
                )
                RETURNING *
            """),
            {
                "org_id": org_id,
                "name": data.get("name"),
                "slug": data.get("slug"),
                "url": data.get("url"),
                "auth_type": data.get("auth_type", "none"),
                "auth_config": auth_config or "{}",
                "description": data.get("description"),
                "metadata": metadata or "{}",
                "created_by": data.get("created_by"),
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
            "last_health_check_at": (
                str(row["last_health_check_at"])
                if row["last_health_check_at"]
                else None
            ),
        }
    return None


async def update_mcp_server(
    org_id: int, server_id: int, data: dict
) -> Optional[dict]:
    allowed_fields = {
        "name",
        "slug",
        "url",
        "auth_type",
        "auth_config",
        "description",
        "metadata",
        "is_active",
    }

    set_clauses: list[str] = []
    params: dict[str, Any] = {"org_id": org_id, "server_id": server_id}

    for field in allowed_fields:
        if field not in data:
            continue

        value = data[field]

        if field == "auth_config" and value is not None and not isinstance(value, str):
            value = json.dumps(value)

        if field == "metadata" and value is not None and not isinstance(value, str):
            value = json.dumps(value)

        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    if not set_clauses:
        return await get_mcp_server(org_id, server_id)

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_mcp_servers
                SET {set_sql}
                WHERE organization_id = :org_id
                  AND id = :server_id
                RETURNING *
            """),
            params,
        )
        await db.commit()
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            "last_health_check_at": (
                str(row["last_health_check_at"])
                if row["last_health_check_at"]
                else None
            ),
        }
    return None


async def delete_mcp_server(org_id: int, server_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_mcp_servers
                WHERE organization_id = :org_id
                  AND id = :server_id
                RETURNING id
            """),
            {"org_id": org_id, "server_id": server_id},
        )
        await db.commit()
        deleted = result.fetchone()
        return deleted is not None
    return False


async def update_server_health(server_id: int, status: str) -> None:
    async with get_db() as db:
        await db.execute(
            text("""
                UPDATE ai_gateway_mcp_servers
                SET health_status = :status,
                    last_health_check_at = NOW()
                WHERE id = :server_id
            """),
            {"server_id": server_id, "status": status},
        )
        await db.commit()
