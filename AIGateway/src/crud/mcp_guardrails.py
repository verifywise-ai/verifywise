import json
from typing import Any, Optional

from sqlalchemy import text

from database.db import get_db


def _to_text_array(lst) -> str:
    """Convert a Python list of strings to a PostgreSQL text[] literal."""
    if lst and len(lst) > 0:
        return "{" + ",".join(f'"{v}"' for v in lst) + "}"
    return "{}"


async def get_all_mcp_guardrails(org_id: int) -> list[dict]:
    """Fetch all MCP guardrail rules for an organization."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    name,
                    rule_type,
                    config,
                    scope,
                    action,
                    applies_to_tools,
                    is_active,
                    created_by,
                    created_at,
                    updated_at
                FROM ai_gateway_mcp_guardrail_rules
                WHERE organization_id = :org_id
                ORDER BY created_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def create_mcp_guardrail(org_id: int, data: dict) -> Optional[dict]:
    """Insert a new MCP guardrail rule and return the created record."""
    config_value = data.get("config")
    config_json = json.dumps(config_value) if config_value is not None else "{}"

    applies_to_tools = data.get("applies_to_tools") or []

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_mcp_guardrail_rules (
                    organization_id,
                    name,
                    rule_type,
                    config,
                    scope,
                    action,
                    applies_to_tools,
                    is_active,
                    created_by
                ) VALUES (
                    :org_id,
                    :name,
                    :rule_type,
                    CAST(:config AS jsonb),
                    :scope,
                    :action,
                    :applies_to_tools,
                    :is_active,
                    :created_by
                )
                RETURNING
                    id,
                    organization_id,
                    name,
                    rule_type,
                    config,
                    scope,
                    action,
                    applies_to_tools,
                    is_active,
                    created_by,
                    created_at,
                    updated_at
            """),
            {
                "org_id": org_id,
                "name": data.get("name"),
                "rule_type": data.get("rule_type"),
                "config": config_json,
                "scope": data.get("scope", "input"),
                "action": data.get("action", "block"),
                "applies_to_tools": applies_to_tools,
                "is_active": data.get("is_active", True),
                "created_by": data.get("created_by"),
            },
        )
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)
    return None


async def update_mcp_guardrail(org_id: int, rule_id: int, data: dict) -> Optional[dict]:
    """Update an existing MCP guardrail rule with a dynamic SET clause."""
    set_clauses: list[str] = []
    params: dict[str, Any] = {"org_id": org_id, "rule_id": rule_id}

    if "name" in data:
        set_clauses.append("name = :name")
        params["name"] = data["name"]

    if "rule_type" in data:
        set_clauses.append("rule_type = :rule_type")
        params["rule_type"] = data["rule_type"]

    if "config" in data:
        set_clauses.append("config = CAST(:config AS jsonb)")
        config_value = data["config"]
        params["config"] = json.dumps(config_value) if config_value is not None else "{}"

    if "scope" in data:
        set_clauses.append("scope = :scope")
        params["scope"] = data["scope"]

    if "action" in data:
        set_clauses.append("action = :action")
        params["action"] = data["action"]

    if "applies_to_tools" in data:
        set_clauses.append("applies_to_tools = :applies_to_tools")
        params["applies_to_tools"] = data["applies_to_tools"] or []

    if "is_active" in data:
        set_clauses.append("is_active = :is_active")
        params["is_active"] = data["is_active"]

    if not set_clauses:
        return None

    set_clauses.append("updated_at = NOW()")

    sql = f"""
        UPDATE ai_gateway_mcp_guardrail_rules
        SET {", ".join(set_clauses)}
        WHERE organization_id = :org_id
          AND id = :rule_id
        RETURNING
            id,
            organization_id,
            name,
            rule_type,
            config,
            scope,
            action,
            applies_to_tools,
            is_active,
            created_by,
            created_at,
            updated_at
    """

    async with get_db() as db:
        result = await db.execute(text(sql), params)
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)
    return None


async def delete_mcp_guardrail(org_id: int, rule_id: int) -> bool:
    """Delete an MCP guardrail rule. Returns True if a row was deleted."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_mcp_guardrail_rules
                WHERE organization_id = :org_id
                  AND id = :rule_id
                RETURNING id
            """),
            {"org_id": org_id, "rule_id": rule_id},
        )
        await db.commit()
        row = result.first()
        return row is not None
    return False
