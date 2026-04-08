import json
from typing import Any, Optional
from sqlalchemy import text
from database.db import get_db


async def get_all_tools(org_id: int) -> list[dict]:
    """Get all active tools for an organization, joined with server details."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    t.id,
                    t.organization_id,
                    t.server_id,
                    t.tool_name,
                    t.description,
                    t.input_schema,
                    t.risk_level,
                    t.requires_approval,
                    t.is_active,
                    t.discovered_at,
                    t.updated_at,
                    s.name AS server_name,
                    s.slug AS server_slug
                FROM ai_gateway_mcp_tools t
                JOIN ai_gateway_mcp_servers s ON t.server_id = s.id
                WHERE t.organization_id = :org_id
                  AND t.is_active = true
                ORDER BY t.tool_name
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [
            {
                **dict(row),
                "discovered_at": str(row["discovered_at"]) if row["discovered_at"] else None,
                "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            }
            for row in rows
        ]
    return []


async def get_tool_by_name(org_id: int, tool_name: str) -> Optional[dict]:
    """Get a single active tool by name, joined with server connection details."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    t.id,
                    t.organization_id,
                    t.server_id,
                    t.tool_name,
                    t.description,
                    t.input_schema,
                    t.risk_level,
                    t.requires_approval,
                    t.is_active,
                    t.discovered_at,
                    t.updated_at,
                    s.name AS server_name,
                    s.slug AS server_slug,
                    s.url AS server_url,
                    s.auth_type AS server_auth_type,
                    s.auth_config AS server_auth_config,
                    s.is_active AS server_active
                FROM ai_gateway_mcp_tools t
                JOIN ai_gateway_mcp_servers s ON t.server_id = s.id
                WHERE t.organization_id = :org_id
                  AND t.tool_name = :tool_name
                  AND t.is_active = true
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        row = result.mappings().first()
        if not row:
            return None
        return {
            **dict(row),
            "discovered_at": str(row["discovered_at"]) if row["discovered_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    return None


async def get_tools_by_server(org_id: int, server_id: int) -> list[dict]:
    """Get all tools for a specific server."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    t.id,
                    t.organization_id,
                    t.server_id,
                    t.tool_name,
                    t.description,
                    t.input_schema,
                    t.risk_level,
                    t.requires_approval,
                    t.is_active,
                    t.discovered_at,
                    t.updated_at
                FROM ai_gateway_mcp_tools t
                WHERE t.organization_id = :org_id
                  AND t.server_id = :server_id
                ORDER BY t.tool_name
            """),
            {"org_id": org_id, "server_id": server_id},
        )
        rows = result.mappings().all()
        return [
            {
                **dict(row),
                "discovered_at": str(row["discovered_at"]) if row["discovered_at"] else None,
                "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            }
            for row in rows
        ]
    return []


async def upsert_tools(org_id: int, server_id: int, tools: list[dict]) -> int:
    """Bulk upsert tools from discovery. Returns count of upserted tools."""
    if not tools:
        return 0

    count = 0
    async with get_db() as db:
        for tool in tools:
            input_schema = tool.get("input_schema") or tool.get("inputSchema")
            if input_schema is not None and not isinstance(input_schema, str):
                input_schema = json.dumps(input_schema)

            await db.execute(
                text("""
                    INSERT INTO ai_gateway_mcp_tools (
                        organization_id,
                        server_id,
                        tool_name,
                        description,
                        input_schema,
                        is_active
                    ) VALUES (
                        :org_id,
                        :server_id,
                        :tool_name,
                        :description,
                        :input_schema,
                        true
                    )
                    ON CONFLICT (organization_id, server_id, tool_name)
                    DO UPDATE SET
                        description = EXCLUDED.description,
                        input_schema = EXCLUDED.input_schema,
                        is_active = true,
                        updated_at = NOW()
                """),
                {
                    "org_id": org_id,
                    "server_id": server_id,
                    "tool_name": tool.get("tool_name") or tool.get("name"),
                    "description": tool.get("description"),
                    "input_schema": input_schema,
                },
            )
            count += 1

        await db.commit()
    return count


async def update_tool(org_id: int, tool_id: int, data: dict) -> Optional[dict]:
    """Update tool governance fields (risk_level, requires_approval)."""
    allowed_fields = {"risk_level", "requires_approval"}

    set_clauses: list[str] = []
    params: dict[str, Any] = {"org_id": org_id, "tool_id": tool_id}

    for field in allowed_fields:
        if field not in data:
            continue
        set_clauses.append(f"{field} = :{field}")
        params[field] = data[field]

    if not set_clauses:
        # Nothing to update — return existing row
        async with get_db() as db:
            result = await db.execute(
                text("""
                    SELECT * FROM ai_gateway_mcp_tools
                    WHERE organization_id = :org_id AND id = :tool_id
                """),
                {"org_id": org_id, "tool_id": tool_id},
            )
            row = result.mappings().first()
            if not row:
                return None
            return {
                **dict(row),
                "discovered_at": str(row["discovered_at"]) if row["discovered_at"] else None,
                "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            }
        return None

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_mcp_tools
                SET {set_sql}
                WHERE organization_id = :org_id
                  AND id = :tool_id
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
            "discovered_at": str(row["discovered_at"]) if row["discovered_at"] else None,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    return None


async def deactivate_stale_tools(
    org_id: int, server_id: int, active_names: list[str]
) -> int:
    """Deactivate tools not in the active_names list. Returns count of deactivated."""
    if not active_names:
        # Deactivate all tools for the server
        async with get_db() as db:
            result = await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_tools
                    SET is_active = false, updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND server_id = :server_id
                      AND is_active = true
                """),
                {"org_id": org_id, "server_id": server_id},
            )
            await db.commit()
            return result.rowcount
        return 0

    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_mcp_tools
                SET is_active = false, updated_at = NOW()
                WHERE organization_id = :org_id
                  AND server_id = :server_id
                  AND is_active = true
                  AND tool_name != ALL(:active_names)
            """),
            {
                "org_id": org_id,
                "server_id": server_id,
                "active_names": active_names,
            },
        )
        await db.commit()
        return result.rowcount
    return 0
