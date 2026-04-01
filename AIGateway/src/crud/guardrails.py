"""
CRUD operations for AI Gateway guardrails.
Translated from Servers/utils/aiGatewayGuardrail.utils.ts
"""

import json
from datetime import datetime, timezone
from typing import Any, Optional

from database.db import get_db
from sqlalchemy import text


async def get_all_guardrails(org_id: int) -> list[dict]:
    """SELECT all guardrail rules ordered by type, created_at."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT *
                FROM ai_gateway_guardrails
                WHERE organization_id = :org_id
                ORDER BY guardrail_type, created_at
                """
            ),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def get_active_guardrails(org_id: int) -> list[dict]:
    """SELECT active guardrail rules only."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT *
                FROM ai_gateway_guardrails
                WHERE organization_id = :org_id
                  AND is_active = TRUE
                ORDER BY guardrail_type, created_at
                """
            ),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def create_guardrail(org_id: int, data: dict) -> dict:
    """INSERT a new guardrail rule."""
    async with get_db() as db:
        config = data.get("config", {})
        config_json = json.dumps(config) if isinstance(config, dict) else config

        result = await db.execute(
            text(
                """
                INSERT INTO ai_gateway_guardrails (
                    organization_id,
                    guardrail_type,
                    name,
                    config,
                    scope,
                    action,
                    is_active,
                    created_by,
                    created_at,
                    updated_at
                ) VALUES (
                    :org_id,
                    :guardrail_type,
                    :name,
                    :config,
                    :scope,
                    :action,
                    :is_active,
                    :created_by,
                    NOW(),
                    NOW()
                )
                RETURNING *
                """
            ),
            {
                "org_id": org_id,
                "guardrail_type": data["guardrail_type"],
                "name": data["name"],
                "config": config_json,
                "scope": data.get("scope", "input"),
                "action": data.get("action", "block"),
                "is_active": data.get("is_active", True),
                "created_by": data.get("created_by"),
            },
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else {}
    return {}


async def update_guardrail(org_id: int, rule_id: int, data: dict) -> Optional[dict]:
    """Dynamic SET for name, config, scope, action, is_active. Returns updated row or None."""
    async with get_db() as db:
        set_clauses = []
        params: dict[str, Any] = {"org_id": org_id, "rule_id": rule_id}

        if "name" in data:
            set_clauses.append("name = :name")
            params["name"] = data["name"]

        if "config" in data:
            set_clauses.append("config = :config")
            config = data["config"]
            params["config"] = (
                json.dumps(config) if isinstance(config, dict) else config
            )

        if "scope" in data:
            set_clauses.append("scope = :scope")
            params["scope"] = data["scope"]

        if "action" in data:
            set_clauses.append("action = :action")
            params["action"] = data["action"]

        if "is_active" in data:
            set_clauses.append("is_active = :is_active")
            params["is_active"] = data["is_active"]

        if not set_clauses:
            # Nothing to update — fetch and return existing row
            result = await db.execute(
                text(
                    """
                    SELECT * FROM ai_gateway_guardrails
                    WHERE organization_id = :org_id AND id = :rule_id
                    """
                ),
                params,
            )
            row = result.mappings().first()
            return dict(row) if row else None

        set_clauses.append("updated_at = NOW()")
        set_sql = ", ".join(set_clauses)

        result = await db.execute(
            text(
                f"""
                UPDATE ai_gateway_guardrails
                SET {set_sql}
                WHERE organization_id = :org_id AND id = :rule_id
                RETURNING *
                """
            ),
            params,
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else None
    return None


async def delete_guardrail(org_id: int, rule_id: int) -> bool:
    """DELETE RETURNING, returns bool."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                DELETE FROM ai_gateway_guardrails
                WHERE organization_id = :org_id AND id = :rule_id
                RETURNING id
                """
            ),
            {"org_id": org_id, "rule_id": rule_id},
        )
        await db.commit()
        row = result.first()
        return row is not None
    return False


async def get_guardrail_settings(org_id: int) -> Optional[dict]:
    """SELECT * FROM ai_gateway_guardrail_settings WHERE org."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT *
                FROM ai_gateway_guardrail_settings
                WHERE organization_id = :org_id
                """
            ),
            {"org_id": org_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None
    return None


async def upsert_guardrail_settings(org_id: int, data: dict) -> dict:
    """INSERT ON CONFLICT (upsert) guardrail settings."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                INSERT INTO ai_gateway_guardrail_settings (
                    organization_id,
                    pii_on_error,
                    content_filter_on_error,
                    pii_replacement_format,
                    content_filter_replacement,
                    log_retention_days,
                    log_request_body,
                    log_response_body,
                    created_at,
                    updated_at
                ) VALUES (
                    :org_id,
                    :pii_on_error,
                    :content_filter_on_error,
                    :pii_replacement_format,
                    :content_filter_replacement,
                    :log_retention_days,
                    :log_request_body,
                    :log_response_body,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (organization_id) DO UPDATE SET
                    pii_on_error               = EXCLUDED.pii_on_error,
                    content_filter_on_error    = EXCLUDED.content_filter_on_error,
                    pii_replacement_format     = EXCLUDED.pii_replacement_format,
                    content_filter_replacement = EXCLUDED.content_filter_replacement,
                    log_retention_days         = EXCLUDED.log_retention_days,
                    log_request_body           = EXCLUDED.log_request_body,
                    log_response_body          = EXCLUDED.log_response_body,
                    updated_at                 = NOW()
                RETURNING *
                """
            ),
            {
                "org_id": org_id,
                "pii_on_error": data.get("pii_on_error", "block"),
                "content_filter_on_error": data.get("content_filter_on_error", "allow"),
                "pii_replacement_format": data.get(
                    "pii_replacement_format", "<ENTITY_TYPE>"
                ),
                "content_filter_replacement": data.get(
                    "content_filter_replacement", "[REDACTED]"
                ),
                "log_retention_days": data.get("log_retention_days", 90),
                "log_request_body": data.get("log_request_body", False),
                "log_response_body": data.get("log_response_body", False),
            },
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else {}
    return {}


async def get_guardrail_logs(
    org_id: int, limit: int = 50, offset: int = 0
) -> list[dict]:
    """SELECT logs with LEFT JOIN on guardrails for name."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT
                    l.*,
                    g.name AS guardrail_name
                FROM ai_gateway_guardrail_logs l
                LEFT JOIN ai_gateway_guardrails g
                    ON l.guardrail_id = g.id
                WHERE l.organization_id = :org_id
                ORDER BY l.created_at DESC
                LIMIT :limit OFFSET :offset
                """
            ),
            {"org_id": org_id, "limit": limit, "offset": offset},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def get_guardrail_stats(
    org_id: int, start_date: datetime, end_date: datetime
) -> dict:
    """COUNT FILTER for blocked/masked/allowed/total."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT
                    COUNT(*)                                             AS total,
                    COUNT(*) FILTER (WHERE action_taken = 'blocked')    AS blocked,
                    COUNT(*) FILTER (WHERE action_taken = 'masked')     AS masked,
                    COUNT(*) FILTER (WHERE action_taken = 'allowed')    AS allowed
                FROM ai_gateway_guardrail_logs
                WHERE organization_id = :org_id
                  AND created_at >= :start_date
                  AND created_at <  :end_date
                """
            ),
            {"org_id": org_id, "start_date": start_date, "end_date": end_date},
        )
        row = result.mappings().first()
        return dict(row) if row else {"total": 0, "blocked": 0, "masked": 0, "allowed": 0}
    return {"total": 0, "blocked": 0, "masked": 0, "allowed": 0}


async def get_guardrail_stats_by_type(
    org_id: int, start_date: datetime, end_date: datetime
) -> list[dict]:
    """GROUP BY guardrail_type, action_taken."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT
                    guardrail_type,
                    action_taken,
                    COUNT(*) AS count
                FROM ai_gateway_guardrail_logs
                WHERE organization_id = :org_id
                  AND created_at >= :start_date
                  AND created_at <  :end_date
                GROUP BY guardrail_type, action_taken
                ORDER BY guardrail_type, action_taken
                """
            ),
            {"org_id": org_id, "start_date": start_date, "end_date": end_date},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def get_guardrail_stats_by_day(
    org_id: int, start_date: datetime, end_date: datetime
) -> list[dict]:
    """GROUP BY DATE with blocked/masked/total."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT
                    DATE(created_at)                                         AS day,
                    COUNT(*)                                                 AS total,
                    COUNT(*) FILTER (WHERE action_taken = 'blocked')        AS blocked,
                    COUNT(*) FILTER (WHERE action_taken = 'masked')         AS masked
                FROM ai_gateway_guardrail_logs
                WHERE organization_id = :org_id
                  AND created_at >= :start_date
                  AND created_at <  :end_date
                GROUP BY DATE(created_at)
                ORDER BY day
                """
            ),
            {"org_id": org_id, "start_date": start_date, "end_date": end_date},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def purge_guardrail_logs(org_id: int, retention_days: int) -> int:
    """Batch DELETE 1000 rows at a time, max 50 batches. Returns total deleted count."""
    total_deleted = 0
    max_batches = 50
    batch_size = 1000

    async with get_db() as db:
        for _ in range(max_batches):
            result = await db.execute(
                text(
                    """
                    DELETE FROM ai_gateway_guardrail_logs
                    WHERE id IN (
                        SELECT id
                        FROM ai_gateway_guardrail_logs
                        WHERE organization_id = :org_id
                          AND created_at < NOW() - INTERVAL ':retention_days days'
                        LIMIT :batch_size
                    )
                    """
                ),
                {
                    "org_id": org_id,
                    "retention_days": retention_days,
                    "batch_size": batch_size,
                },
            )
            await db.commit()
            deleted = result.rowcount
            total_deleted += deleted
            if deleted < batch_size:
                break

        return total_deleted
    return 0
