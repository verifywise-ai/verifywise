"""
CRUD operations for ai_gateway_api_keys table.

Translated from Servers/utils/aiGatewayApiKey.utils.ts.
"""

import logging
from typing import Any, Optional

from sqlalchemy import text

from database.db import get_db
from utils.encryption import encrypt, decrypt, mask_api_key

logger = logging.getLogger("uvicorn")


async def get_all_api_keys(organization_id: int) -> list[dict[str, Any]]:
    """Get all API keys for an org (masked, no encrypted_key)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, provider, key_name, encrypted_key, is_active,
                       created_at, updated_at
                FROM ai_gateway_api_keys
                WHERE organization_id = :org_id
                ORDER BY created_at DESC
            """),
            {"org_id": organization_id},
        )
        rows = result.mappings().fetchall()

    masked = []
    for row in rows:
        masked_key = "***"
        try:
            if row["encrypted_key"]:
                plain = decrypt(row["encrypted_key"])
                masked_key = mask_api_key(plain)
        except Exception:
            pass

        masked.append({
            "id": row["id"],
            "provider": row["provider"],
            "key_name": row["key_name"],
            "masked_key": masked_key,
            "is_active": row["is_active"],
            "created_at": str(row["created_at"]),
            "updated_at": str(row["updated_at"]),
        })

    return masked


async def get_api_key_by_id(
    organization_id: int, key_id: int
) -> Optional[dict[str, Any]]:
    """Get a single API key by ID (includes encrypted_key for internal use)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, organization_id, provider, key_name, encrypted_key,
                       is_active, created_at, updated_at
                FROM ai_gateway_api_keys
                WHERE organization_id = :org_id AND id = :id
            """),
            {"org_id": organization_id, "id": key_id},
        )
        row = result.mappings().fetchone()
        if not row:
            return None
        return {**dict(row), "created_at": str(row["created_at"]), "updated_at": str(row["updated_at"])}


async def create_api_key(
    organization_id: int,
    provider: str,
    key_name: str,
    api_key: str,
) -> dict[str, Any]:
    """Create a new API key (encrypts the raw key)."""
    encrypted = encrypt(api_key.strip())

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_api_keys
                    (organization_id, provider, key_name, encrypted_key,
                     is_active, created_at, updated_at)
                VALUES
                    (:org_id, :provider, :key_name, :encrypted_key,
                     true, NOW(), NOW())
                RETURNING id, organization_id, provider, key_name, encrypted_key,
                          is_active, created_at, updated_at
            """),
            {
                "org_id": organization_id,
                "provider": provider,
                "key_name": key_name,
                "encrypted_key": encrypted,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        return {**dict(row), "created_at": str(row["created_at"]), "updated_at": str(row["updated_at"])}


async def update_api_key(
    organization_id: int,
    key_id: int,
    data: dict[str, Any],
) -> Optional[dict[str, Any]]:
    """Update an existing API key. Supports partial updates."""
    set_clauses: list[str] = []
    params: dict[str, Any] = {"org_id": organization_id, "id": key_id}

    if "provider" in data:
        set_clauses.append("provider = :provider")
        params["provider"] = data["provider"]
    if "key_name" in data:
        set_clauses.append("key_name = :key_name")
        params["key_name"] = data["key_name"]
    if "api_key" in data:
        set_clauses.append("encrypted_key = :encrypted_key")
        params["encrypted_key"] = encrypt(data["api_key"].strip())

    if not set_clauses:
        return await get_api_key_by_id(organization_id, key_id)

    set_clauses.append("updated_at = NOW()")

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_api_keys
                SET {", ".join(set_clauses)}
                WHERE organization_id = :org_id AND id = :id
                RETURNING id, organization_id, provider, key_name, encrypted_key,
                          is_active, created_at, updated_at
            """),
            params,
        )
        await db.commit()
        row = result.mappings().fetchone()
        if not row:
            return None
        return {**dict(row), "created_at": str(row["created_at"]), "updated_at": str(row["updated_at"])}


async def delete_api_key(organization_id: int, key_id: int) -> bool:
    """Delete an API key. Returns True if deleted."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_api_keys
                WHERE organization_id = :org_id AND id = :id
                RETURNING id
            """),
            {"org_id": organization_id, "id": key_id},
        )
        await db.commit()
        return result.mappings().fetchone() is not None
