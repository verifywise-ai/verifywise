import json
from typing import Optional

from sqlalchemy import text

from database.db import get_db


async def create_approval_request(org_id: int, data: dict) -> dict:
    arguments_json = json.dumps(data.get("arguments")) if data.get("arguments") is not None else "{}"

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_mcp_approval_requests (
                    organization_id,
                    agent_key_id,
                    tool_id,
                    tool_name,
                    arguments,
                    arguments_hash,
                    expires_at
                ) VALUES (
                    :org_id,
                    :agent_key_id,
                    :tool_id,
                    :tool_name,
                    CAST(:arguments AS jsonb),
                    :arguments_hash,
                    :expires_at
                )
                RETURNING
                    id,
                    organization_id,
                    agent_key_id,
                    tool_id,
                    tool_name,
                    arguments,
                    status,
                    decided_by,
                    decided_at,
                    decision_reason,
                    expires_at,
                    created_at
            """),
            {
                "org_id": org_id,
                "agent_key_id": data.get("agent_key_id"),
                "tool_id": data.get("tool_id"),
                "tool_name": data.get("tool_name"),
                "arguments": arguments_json,
                "arguments_hash": data.get("arguments_hash"),
                "expires_at": data.get("expires_at"),
            },
        )
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return {}
        return dict(row)
    return {}


async def get_pending_approvals(org_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    ar.id,
                    ar.organization_id,
                    ar.agent_key_id,
                    ar.tool_id,
                    ar.tool_name,
                    ar.arguments,
                    ar.status,
                    ar.expires_at,
                    ar.created_at,
                    ak.name AS agent_key_name
                FROM ai_gateway_mcp_approval_requests ar
                LEFT JOIN ai_gateway_mcp_agent_keys ak
                    ON ak.id = ar.agent_key_id
                    AND ak.organization_id = ar.organization_id
                WHERE ar.organization_id = :org_id
                  AND ar.status = 'pending'
                  AND ar.expires_at > NOW()
                ORDER BY ar.created_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def get_approval_history(
    org_id: int, limit: int = 50, offset: int = 0
) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    ar.id,
                    ar.organization_id,
                    ar.agent_key_id,
                    ar.tool_id,
                    ar.tool_name,
                    ar.arguments,
                    ar.status,
                    ar.decided_by,
                    ar.decided_at,
                    ar.decision_reason,
                    ar.expires_at,
                    ar.created_at,
                    ak.name AS key_name,
                    u.name AS decided_by_name
                FROM ai_gateway_mcp_approval_requests ar
                LEFT JOIN ai_gateway_mcp_agent_keys ak
                    ON ak.id = ar.agent_key_id
                    AND ak.organization_id = ar.organization_id
                LEFT JOIN users u
                    ON u.id = ar.decided_by
                WHERE ar.organization_id = :org_id
                  AND ar.status != 'pending'
                ORDER BY ar.decided_at DESC
                LIMIT :limit
                OFFSET :offset
            """),
            {"org_id": org_id, "limit": limit, "offset": offset},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def get_pending_request(
    org_id: int, agent_key_id: int, tool_name: str, arguments_hash: str,
    native: bool = False,
) -> Optional[dict]:
    """Return an existing pending, non-expired approval request for this exact call.

    Scoped to the call's arguments (via arguments_hash) so a pending request for
    one set of arguments is not reused for a different call. `native` restricts
    to native (tool_id IS NULL) vs proxy (tool_id IS NOT NULL) approvals so the
    two surfaces never share a row.
    """
    tool_id_clause = "AND tool_id IS NULL" if native else "AND tool_id IS NOT NULL"
    async with get_db() as db:
        result = await db.execute(
            text(f"""
                SELECT id, status, expires_at
                FROM ai_gateway_mcp_approval_requests
                WHERE organization_id = :org_id
                  AND agent_key_id = :agent_key_id
                  AND tool_name = :tool_name
                  AND arguments_hash = :arguments_hash
                  {tool_id_clause}
                  AND status = 'pending'
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {
                "org_id": org_id,
                "agent_key_id": agent_key_id,
                "tool_name": tool_name,
                "arguments_hash": arguments_hash,
            },
        )
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)


async def get_approved_request(
    org_id: int, agent_key_id: int, tool_name: str, arguments_hash: str,
    native: bool = False,
) -> Optional[dict]:
    """Check if an approved, non-expired approval request exists for this exact call.

    Scoped to the call's arguments (via arguments_hash) so an approval granted for
    one set of arguments cannot be reused to authorize a different call. `native`
    restricts to native (tool_id IS NULL) vs proxy (tool_id IS NOT NULL) approvals
    so the two surfaces never share a row.
    """
    tool_id_clause = "AND tool_id IS NULL" if native else "AND tool_id IS NOT NULL"
    async with get_db() as db:
        result = await db.execute(
            text(f"""
                SELECT id, status, expires_at
                FROM ai_gateway_mcp_approval_requests
                WHERE organization_id = :org_id
                  AND agent_key_id = :agent_key_id
                  AND tool_name = :tool_name
                  AND arguments_hash = :arguments_hash
                  {tool_id_clause}
                  AND status = 'approved'
                  AND expires_at > NOW()
                ORDER BY decided_at DESC
                LIMIT 1
            """),
            {
                "org_id": org_id,
                "agent_key_id": agent_key_id,
                "tool_name": tool_name,
                "arguments_hash": arguments_hash,
            },
        )
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)


async def get_active_request(
    org_id: int, agent_key_id: int, tool_name: str, arguments_hash: str,
    native: bool = False,
) -> Optional[dict]:
    """Return the latest non-expired approved OR pending request for this exact
    call, or None. Collapses the separate approved/pending lookups into a single
    query+connection; the caller branches on row['status'].

    native: restrict to native tool-call approvals (tool_id IS NULL) when True,
    or proxy approvals (tool_id IS NOT NULL) when False. A native hook approval
    and a proxy approval for the same tool_name+args must never authorize each
    other, so the two surfaces never share an approval row.
    """
    tool_id_clause = "AND tool_id IS NULL" if native else "AND tool_id IS NOT NULL"
    async with get_db() as db:
        result = await db.execute(
            text(f"""
                SELECT id, status, expires_at
                FROM ai_gateway_mcp_approval_requests
                WHERE organization_id = :org_id
                  AND agent_key_id = :agent_key_id
                  AND tool_name = :tool_name
                  AND arguments_hash = :arguments_hash
                  {tool_id_clause}
                  AND status IN ('approved', 'pending')
                  AND expires_at > NOW()
                ORDER BY
                    CASE status WHEN 'approved' THEN 0 ELSE 1 END,
                    created_at DESC
                LIMIT 1
            """),
            {
                "org_id": org_id,
                "agent_key_id": agent_key_id,
                "tool_name": tool_name,
                "arguments_hash": arguments_hash,
            },
        )
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)


async def get_approval_status(org_id: int, request_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    agent_key_id,
                    tool_id,
                    tool_name,
                    arguments,
                    status,
                    decided_by,
                    decided_at,
                    decision_reason,
                    expires_at,
                    created_at
                FROM ai_gateway_mcp_approval_requests
                WHERE organization_id = :org_id
                  AND id = :request_id
            """),
            {"org_id": org_id, "request_id": request_id},
        )
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)
    return None


async def decide_approval(
    org_id: int, request_id: int, data: dict
) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_mcp_approval_requests
                SET
                    status = :status,
                    decided_by = :user_id,
                    decided_at = NOW(),
                    decision_reason = :reason
                WHERE id = :request_id
                  AND organization_id = :org_id
                  AND status = 'pending'
                  AND expires_at > NOW()
                RETURNING
                    id,
                    organization_id,
                    agent_key_id,
                    tool_id,
                    tool_name,
                    arguments,
                    status,
                    decided_by,
                    decided_at,
                    decision_reason,
                    expires_at,
                    created_at
            """),
            {
                "request_id": request_id,
                "org_id": org_id,
                "status": data.get("status"),
                "user_id": data.get("user_id"),
                "reason": data.get("reason"),
            },
        )
        await db.commit()
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)
    return None


async def delete_expired_approval_requests(retention_days: int = 30, batch_size: int = 5000) -> int:
    """Delete decided or expired approval requests older than retention_days in batches."""
    from utils.batch_delete import batch_delete_expired

    return await batch_delete_expired(
        table="ai_gateway_mcp_approval_requests",
        where_clause="(status != 'pending' OR expires_at < NOW())",
        retention_days=retention_days,
        batch_size=batch_size,
    )
