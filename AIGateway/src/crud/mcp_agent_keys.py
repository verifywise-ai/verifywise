import json
import secrets
import hashlib
from typing import Any, Optional
from sqlalchemy import text
from database.db import get_db


def generate_agent_key() -> dict:
    plain_key = "sk-mcp-" + secrets.token_hex(16)
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
    prefix = plain_key[:13] + "..."
    return {
        "plain_key": plain_key,
        "key_hash": key_hash,
        "prefix": prefix,
    }


async def get_all_agent_keys(org_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    ak.id,
                    ak.key_prefix,
                    ak.name,
                    ak.description,
                    ak.allowed_tools,
                    ak.blocked_tools,
                    ak.allowed_server_ids,
                    ak.rate_limit_rpm,
                    ak.metadata,
                    ak.expires_at,
                    ak.is_active,
                    ak.revoked_at,
                    ak.created_by,
                    ak.created_at,
                    ak.updated_at,
                    u.name AS created_by_name
                FROM ai_gateway_mcp_agent_keys ak
                LEFT JOIN users u ON u.id = ak.created_by
                WHERE ak.organization_id = :org_id
                ORDER BY ak.created_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def create_agent_key(org_id: int, data: dict) -> Optional[dict]:
    key_data = generate_agent_key()

    allowed_server_ids = data.get("allowed_server_ids") or []
    metadata_value = data.get("metadata")
    metadata_json = json.dumps(metadata_value) if metadata_value is not None else "{}"
    expires_at = data.get("expires_at")
    created_by = data.get("created_by")
    rate_limit_rpm = data.get("rate_limit_rpm")
    name = data.get("name")
    description = data.get("description")
    allowed_tools = data.get("allowed_tools") or []
    blocked_tools = data.get("blocked_tools") or []

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_mcp_agent_keys (
                    organization_id,
                    key_hash,
                    key_prefix,
                    name,
                    description,
                    allowed_tools,
                    blocked_tools,
                    allowed_server_ids,
                    rate_limit_rpm,
                    metadata,
                    expires_at,
                    created_by
                ) VALUES (
                    :org_id,
                    :key_hash,
                    :key_prefix,
                    :name,
                    :description,
                    :allowed_tools,
                    :blocked_tools,
                    :allowed_server_ids,
                    :rate_limit_rpm,
                    CAST(:metadata AS jsonb),
                    :expires_at,
                    :created_by
                )
                RETURNING
                    id,
                    key_prefix,
                    name,
                    description,
                    allowed_tools,
                    blocked_tools,
                    allowed_server_ids,
                    rate_limit_rpm,
                    metadata,
                    expires_at,
                    is_active,
                    revoked_at,
                    created_by,
                    created_at,
                    updated_at
            """),
            {
                "org_id": org_id,
                "key_hash": key_data["key_hash"],
                "key_prefix": key_data["prefix"],
                "name": name,
                "description": description,
                "allowed_tools": allowed_tools,
                "blocked_tools": blocked_tools,
                "allowed_server_ids": allowed_server_ids,
                "rate_limit_rpm": rate_limit_rpm,
                "metadata": metadata_json,
                "expires_at": expires_at,
                "created_by": created_by,
            },
        )
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return None
        record = dict(row)
        record["plain_key"] = key_data["plain_key"]
        return record
    return None


async def update_agent_key(org_id: int, key_id: int, data: dict) -> Optional[dict]:
    set_clauses = []
    params: dict[str, Any] = {"org_id": org_id, "key_id": key_id}

    if "name" in data:
        set_clauses.append("name = :name")
        params["name"] = data["name"]

    if "description" in data:
        set_clauses.append("description = :description")
        params["description"] = data["description"]

    for field in ("allowed_tools", "blocked_tools"):
        if field in data:
            set_clauses.append(f"{field} = :{field}")
            params[field] = data[field] if data[field] else []

    if "allowed_server_ids" in data:
        set_clauses.append("allowed_server_ids = :allowed_server_ids")
        params["allowed_server_ids"] = data["allowed_server_ids"] or []

    if "rate_limit_rpm" in data:
        set_clauses.append("rate_limit_rpm = :rate_limit_rpm")
        params["rate_limit_rpm"] = data["rate_limit_rpm"]

    if "metadata" in data:
        set_clauses.append("metadata = CAST(:metadata AS jsonb)")
        metadata_value = data["metadata"]
        params["metadata"] = json.dumps(metadata_value) if metadata_value is not None else "{}"

    if "expires_at" in data:
        set_clauses.append("expires_at = :expires_at")
        params["expires_at"] = data["expires_at"]

    if not set_clauses:
        return None

    set_clauses.append("updated_at = NOW()")

    sql = f"""
        UPDATE ai_gateway_mcp_agent_keys
        SET {", ".join(set_clauses)}
        WHERE organization_id = :org_id
          AND id = :key_id
        RETURNING
            id,
            key_prefix,
            name,
            description,
            allowed_tools,
            blocked_tools,
            allowed_server_ids,
            rate_limit_rpm,
            metadata,
            expires_at,
            is_active,
            revoked_at,
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


async def revoke_agent_key(org_id: int, key_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_mcp_agent_keys
                SET is_active = false, revoked_at = NOW(), updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :key_id
                  AND is_active = true
                RETURNING id
            """),
            {"org_id": org_id, "key_id": key_id},
        )
        await db.commit()
        row = result.first()
        return row is not None
    return False


async def delete_agent_key(org_id: int, key_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_mcp_agent_keys
                WHERE organization_id = :org_id
                  AND id = :key_id
                  AND is_active = false
                RETURNING id
            """),
            {"org_id": org_id, "key_id": key_id},
        )
        await db.commit()
        row = result.first()
        return row is not None
    return False
