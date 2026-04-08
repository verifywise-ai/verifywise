import json
import secrets
import hashlib
from typing import Any, Optional
from sqlalchemy import text
from database.db import get_db


def generate_virtual_key() -> dict:
    plain_key = "sk-vw-" + secrets.token_hex(16)
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
    prefix = plain_key[:12] + "..."
    return {
        "plain_key": plain_key,
        "key_hash": key_hash,
        "prefix": prefix,
    }


async def get_all_virtual_keys(org_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    vk.id,
                    vk.key_prefix,
                    vk.name,
                    vk.allowed_endpoint_ids,
                    vk.allowed_models,
                    vk.blocked_models,
                    vk.allowed_providers,
                    vk.blocked_providers,
                    vk.max_budget_usd,
                    vk.current_spend_usd,
                    vk.rate_limit_rpm,
                    vk.metadata,
                    vk.expires_at,
                    vk.is_active,
                    vk.revoked_at,
                    vk.created_by,
                    vk.created_at,
                    vk.updated_at,
                    u.name AS created_by_name
                FROM ai_gateway_virtual_keys vk
                LEFT JOIN users u ON u.id = vk.created_by
                WHERE vk.organization_id = :org_id
                ORDER BY vk.created_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def create_virtual_key(org_id: int, data: dict) -> Optional[dict]:
    key_data = generate_virtual_key()

    allowed_endpoint_ids = data.get("allowed_endpoint_ids")
    if allowed_endpoint_ids and len(allowed_endpoint_ids) > 0:
        array_literal = "{" + ",".join(str(i) for i in allowed_endpoint_ids) + "}"
    else:
        array_literal = "{}"

    metadata_value = data.get("metadata")
    metadata_json = json.dumps(metadata_value) if metadata_value is not None else None

    expires_at = data.get("expires_at")
    created_by = data.get("created_by")
    max_budget_usd = data.get("max_budget_usd")
    rate_limit_rpm = data.get("rate_limit_rpm")
    name = data.get("name")

    def _to_text_array(lst):
        if lst and len(lst) > 0:
            return "{" + ",".join(f'"{v}"' for v in lst) + "}"
        return "{}"

    allowed_models = _to_text_array(data.get("allowed_models"))
    blocked_models = _to_text_array(data.get("blocked_models"))
    allowed_providers = _to_text_array(data.get("allowed_providers"))
    blocked_providers = _to_text_array(data.get("blocked_providers"))

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_virtual_keys (
                    organization_id,
                    key_hash,
                    key_prefix,
                    name,
                    allowed_endpoint_ids,
                    allowed_models,
                    blocked_models,
                    allowed_providers,
                    blocked_providers,
                    max_budget_usd,
                    rate_limit_rpm,
                    metadata,
                    expires_at,
                    created_by
                ) VALUES (
                    :org_id,
                    :key_hash,
                    :key_prefix,
                    :name,
                    :allowed_endpoint_ids::int[],
                    :allowed_models::text[],
                    :blocked_models::text[],
                    :allowed_providers::text[],
                    :blocked_providers::text[],
                    :max_budget_usd,
                    :rate_limit_rpm,
                    :metadata::jsonb,
                    :expires_at,
                    :created_by
                )
                RETURNING
                    id,
                    key_prefix,
                    name,
                    allowed_endpoint_ids,
                    allowed_models,
                    blocked_models,
                    allowed_providers,
                    blocked_providers,
                    max_budget_usd,
                    current_spend_usd,
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
                "allowed_endpoint_ids": array_literal,
                "allowed_models": allowed_models,
                "blocked_models": blocked_models,
                "allowed_providers": allowed_providers,
                "blocked_providers": blocked_providers,
                "max_budget_usd": max_budget_usd,
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


async def update_virtual_key(org_id: int, key_id: int, data: dict) -> Optional[dict]:
    set_clauses = []
    params: dict[str, Any] = {"org_id": org_id, "key_id": key_id}

    if "name" in data:
        set_clauses.append("name = :name")
        params["name"] = data["name"]

    if "allowed_endpoint_ids" in data:
        ids = data["allowed_endpoint_ids"]
        if ids and len(ids) > 0:
            array_literal = "{" + ",".join(str(i) for i in ids) + "}"
        else:
            array_literal = "{}"
        set_clauses.append("allowed_endpoint_ids = :allowed_endpoint_ids::int[]")
        params["allowed_endpoint_ids"] = array_literal

    def _to_text_array(lst):
        if lst and len(lst) > 0:
            return "{" + ",".join(f'"{v}"' for v in lst) + "}"
        return "{}"

    for field in ("allowed_models", "blocked_models", "allowed_providers", "blocked_providers"):
        if field in data:
            set_clauses.append(f"{field} = :{field}::text[]")
            params[field] = _to_text_array(data[field])

    if "max_budget_usd" in data:
        set_clauses.append("max_budget_usd = :max_budget_usd")
        params["max_budget_usd"] = data["max_budget_usd"]

    if "rate_limit_rpm" in data:
        set_clauses.append("rate_limit_rpm = :rate_limit_rpm")
        params["rate_limit_rpm"] = data["rate_limit_rpm"]

    if "metadata" in data:
        set_clauses.append("metadata = :metadata::jsonb")
        metadata_value = data["metadata"]
        params["metadata"] = json.dumps(metadata_value) if metadata_value is not None else None

    if "expires_at" in data:
        set_clauses.append("expires_at = :expires_at")
        params["expires_at"] = data["expires_at"]

    if not set_clauses:
        return None

    set_clauses.append("updated_at = NOW()")

    sql = f"""
        UPDATE ai_gateway_virtual_keys
        SET {", ".join(set_clauses)}
        WHERE organization_id = :org_id
          AND id = :key_id
        RETURNING
            id,
            key_prefix,
            name,
            allowed_endpoint_ids,
            allowed_models,
            blocked_models,
            allowed_providers,
            blocked_providers,
            max_budget_usd,
            current_spend_usd,
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


async def revoke_virtual_key(org_id: int, key_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_virtual_keys
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


async def delete_virtual_key(org_id: int, key_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_virtual_keys
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
