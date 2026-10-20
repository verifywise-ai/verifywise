import json
import secrets
import hashlib
from typing import Any, Optional
from sqlalchemy import text
# _text: crud.endpoints' sqlalchemy.text wrapper for SQL built from fixed
# fragments (here the role_visibility predicate), reused rather than redefined.
from crud.endpoints import _text, role_visibility
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


async def get_all_virtual_keys(org_id: int, role_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
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
        keys = [dict(row) for row in result.mappings().all()]
        await _attach_endpoint_names(db, org_id, role_id, keys)
        return keys
    return []


async def _attach_endpoint_names(db, org_id: int, role_id: int, keys: list[dict]) -> None:
    """Add `allowed_endpoints` (id, name, is_active) to each key: the endpoints
    it may call that the viewer's role may see (the endpoints list's rule), so
    a name hidden there stays hidden here; the page shows those by id.
    is_active is false when the endpoint or its provider key is switched off.
    Also add `missing_endpoint_ids`: ids that name no endpoint in the org,
    usually because it was deleted (crud.endpoints.delete_endpoint leaves a
    key's last id in place so the key does not widen) but writes do not check
    ids either. The key cannot call those, which the page must not show like
    a role-hidden endpoint.
    It does not apply the key's own model/provider limits."""
    ids = sorted({eid for key in keys for eid in key.get("allowed_endpoint_ids") or [] if eid is not None})
    endpoints: dict[int, dict] = {}
    existing: set[int] = set()
    if ids:
        # The role rule is a column, not a filter, so one query also tells a
        # hidden endpoint (exists, not visible) from a missing one (no row).
        role_filter, role_params = role_visibility(role_id)
        result = await db.execute(
            _text(
                """
                SELECT e.id,
                       COALESCE(NULLIF(BTRIM(e.display_name), ''), e.slug) AS name,
                       (e.is_active AND COALESCE(k.is_active, FALSE)) AS is_active,
                       (TRUE """
                + role_filter
                + """) AS visible
                FROM ai_gateway_endpoints e
                LEFT JOIN ai_gateway_api_keys k ON k.id = e.api_key_id
                WHERE e.organization_id = :org_id AND e.id = ANY(:ids)
                """
            ),
            {"org_id": org_id, "ids": ids, **role_params},
        )
        for row in result.mappings().all():
            existing.add(row["id"])
            if row["visible"]:
                endpoints[row["id"]] = {"id": row["id"], "name": row["name"], "is_active": row["is_active"]}
    for key in keys:
        # In the key's order, once each ([9, 9] can be left by delete_endpoint).
        key_ids = list(dict.fromkeys(eid for eid in key.get("allowed_endpoint_ids") or [] if eid is not None))
        key["allowed_endpoints"] = [endpoints[eid] for eid in key_ids if eid in endpoints]
        key["missing_endpoint_ids"] = [eid for eid in key_ids if eid not in existing]


async def create_virtual_key(org_id: int, data: dict) -> Optional[dict]:
    key_data = generate_virtual_key()

    # asyncpg encodes array binds from real Python lists, NOT from "{...}" string
    # literals (passing a str raises "a sized iterable container expected").
    array_literal = [int(i) for i in (data.get("allowed_endpoint_ids") or [])]

    metadata_value = data.get("metadata")
    metadata_json = json.dumps(metadata_value) if metadata_value is not None else None

    expires_at = data.get("expires_at")
    created_by = data.get("created_by")
    max_budget_usd = data.get("max_budget_usd")
    rate_limit_rpm = data.get("rate_limit_rpm")
    name = data.get("name")

    def _to_text_array(lst):
        return [str(v) for v in (lst or [])]

    allowed_models = _to_text_array(data.get("allowed_models"))
    blocked_models = _to_text_array(data.get("blocked_models"))
    allowed_providers = _to_text_array(data.get("allowed_providers"))
    blocked_providers = _to_text_array(data.get("blocked_providers"))

    async with get_db() as db:
        result = await db.execute(
            # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
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
                    :allowed_endpoint_ids,
                    :allowed_models,
                    :blocked_models,
                    :allowed_providers,
                    :blocked_providers,
                    :max_budget_usd,
                    :rate_limit_rpm,
                    CAST(:metadata AS jsonb),
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
        # asyncpg binds arrays from real lists, not "{...}" string literals.
        set_clauses.append("allowed_endpoint_ids = :allowed_endpoint_ids")
        params["allowed_endpoint_ids"] = [int(i) for i in (data["allowed_endpoint_ids"] or [])]

    for field in ("allowed_models", "blocked_models", "allowed_providers", "blocked_providers"):
        if field in data:
            set_clauses.append(f"{field} = :{field}")
            params[field] = [str(v) for v in (data[field] or [])]

    if "max_budget_usd" in data:
        set_clauses.append("max_budget_usd = :max_budget_usd")
        params["max_budget_usd"] = data["max_budget_usd"]

    if "rate_limit_rpm" in data:
        set_clauses.append("rate_limit_rpm = :rate_limit_rpm")
        params["rate_limit_rpm"] = data["rate_limit_rpm"]

    if "metadata" in data:
        set_clauses.append("metadata = CAST(:metadata AS jsonb)")
        metadata_value = data["metadata"]
        params["metadata"] = json.dumps(metadata_value) if metadata_value is not None else None

    if "expires_at" in data:
        set_clauses.append("expires_at = :expires_at")
        params["expires_at"] = data["expires_at"]

    if not set_clauses:
        return None

    set_clauses.append("updated_at = NOW()")

    sql = """
        UPDATE ai_gateway_virtual_keys
        SET """ + ", ".join(set_clauses) + """
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
        # Column list is static; all user values are bound via params.
        # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
        result = await db.execute(text(sql), params)
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)
    return None


async def revoke_virtual_key(org_id: int, key_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
            text("""
                UPDATE ai_gateway_virtual_keys
                SET is_active = false, revoked_at = NOW(), updated_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :key_id
                  AND is_active = true
                RETURNING id, name
            """),
            {"org_id": org_id, "key_id": key_id},
        )
        await db.commit()
        row = result.first()
        return dict(row._mapping) if row is not None else None
    return False


async def delete_virtual_key(org_id: int, key_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text
            text("""
                DELETE FROM ai_gateway_virtual_keys
                WHERE organization_id = :org_id
                  AND id = :key_id
                  AND is_active = false
                RETURNING id, name
            """),
            {"org_id": org_id, "key_id": key_id},
        )
        await db.commit()
        row = result.first()
        return dict(row._mapping) if row is not None else None
    return False
