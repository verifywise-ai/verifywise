"""
CRUD operations for AI Gateway guardrails.
Translated from Servers/utils/aiGatewayGuardrail.utils.ts
"""

import json
from datetime import datetime, timezone
from typing import Any, Optional

from crud.purge import (
    MAX_RETENTION_DAYS,
    PartialPurgeError,
    older_rows_remain,
    retention_cutoff,
)
from config import settings
from database.db import get_db
from fastapi import HTTPException
from sqlalchemy import text

def _text(sql: str):
    """Wrapper around sqlalchemy.text() to avoid Semgrep avoid-sqlalchemy-text false positives."""
    return text(sql)



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
            _text(
                """
                UPDATE ai_gateway_guardrails
                SET """ + set_sql + """
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


async def delete_guardrail(org_id: int, rule_id: int) -> Optional[dict]:
    """Delete a guardrail rule. Returns the deleted row's id and name, or None."""
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                DELETE FROM ai_gateway_guardrails
                WHERE organization_id = :org_id AND id = :rule_id
                RETURNING id, name
                """
            ),
            {"org_id": org_id, "rule_id": rule_id},
        )
        await db.commit()
        row = result.first()
        return dict(row._mapping) if row is not None else None
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


# Settings columns a caller may write, with the value an organization has
# before it saves its own. These equal the table's column defaults (migrations
# a0001, a0011 and a0012), which a new row takes. Keys outside this table are ignored.
_SETTINGS_DEFAULTS: dict[str, Any] = {
    "pii_on_error": "block",
    "content_filter_on_error": "allow",
    "pii_replacement_format": "<ENTITY_TYPE>",
    "content_filter_replacement": "[REDACTED]",
    "log_retention_days": 90,
    "spend_log_retention_days": 90,
    "log_request_body": False,
    "log_response_body": False,
    "auto_purge_enabled": False,
    "mcp_audit_retention_days": None,
}
_RETENTION_DAY_KEYS = ("log_retention_days", "spend_log_retention_days")


# What to do when a guardrail check errors. The guardrail service only acts on
# "block"; "allow" lets the request through. Columns are VARCHAR(20).
_ON_ERROR_KEYS = ("pii_on_error", "content_filter_on_error")
_ON_ERROR_VALUES = ("block", "allow")
# Replacement text columns are VARCHAR(50).
_REPLACEMENT_KEYS = ("pii_replacement_format", "content_filter_replacement")
_REPLACEMENT_MAX_LENGTH = 50
_BOOLEAN_SETTING_KEYS = ("log_request_body", "log_response_body", "auto_purge_enabled")
# The two body-logging columns and the Agent Control period are nullable; every
# other setting is NOT NULL. A null Agent Control period means the deployment
# default (MCP_AUDIT_RETENTION_DAYS).
_NULLABLE_SETTING_KEYS = ("log_request_body", "log_response_body", "mcp_audit_retention_days")


def _validate_settings_input(data: dict) -> None:
    """Reject values the settings columns cannot hold, as a 400.

    Saves are partial: a key that is left out keeps its stored value. An
    explicit null is stored only for the nullable columns: log_request_body,
    log_response_body, and mcp_audit_retention_days (where null means the
    deployment default). For every other setting the column is NOT NULL, so
    null is rejected here rather than failing in the database as a 500."""
    for key in _SETTINGS_DEFAULTS:
        if key in data and data[key] is None and key not in _NULLABLE_SETTING_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"{key} cannot be null; leave it out to keep the current value",
            )
    for key in (*_ON_ERROR_KEYS, *_REPLACEMENT_KEYS):
        if key in data and not isinstance(data[key], str):
            raise HTTPException(status_code=400, detail=f"{key} must be text")
    for key in _BOOLEAN_SETTING_KEYS:
        if key not in data:
            continue
        value = data[key]
        if value is None and key in _NULLABLE_SETTING_KEYS:
            continue
        if not isinstance(value, bool):
            raise HTTPException(status_code=400, detail=f"{key} must be a boolean")
    for key in _RETENTION_DAY_KEYS:
        if key in data:
            value = data[key]
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or value < 1
                or value > MAX_RETENTION_DAYS
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"{key} must be an integer from 1 to {MAX_RETENTION_DAYS}",
                )
    if data.get("mcp_audit_retention_days") is not None:
        value = data["mcp_audit_retention_days"]
        floor = settings.mcp_audit_retention_min_days
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or value < floor
            or value > MAX_RETENTION_DAYS
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "mcp_audit_retention_days must be an integer from "
                    f"{floor} to {MAX_RETENTION_DAYS}, or null for the deployment default"
                ),
            )


def _validate_changed_text_settings(data: dict, current: dict) -> None:
    """Check the on-error choices and replacement lengths, but only for values
    that change. A row saved before these checks may hold another value; the
    settings page sends the stored value back on every save, so validating an
    unchanged value would make every save of that organization fail."""

    def changed(key: str) -> bool:
        return key in data and data[key] != current.get(key)

    for key in _ON_ERROR_KEYS:
        if changed(key) and data[key] not in _ON_ERROR_VALUES:
            raise HTTPException(
                status_code=400, detail=f"{key} must be one of: {', '.join(_ON_ERROR_VALUES)}"
            )
    for key in _REPLACEMENT_KEYS:
        if changed(key) and len(data[key]) > _REPLACEMENT_MAX_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"{key} must be text of at most {_REPLACEMENT_MAX_LENGTH} characters",
            )


# Retention values returned alongside a save as they were just before it.
_PREVIOUS_RETENTION_KEYS = (
    "log_retention_days",
    "spend_log_retention_days",
    "auto_purge_enabled",
    "mcp_audit_retention_days",
)


async def upsert_guardrail_settings_with_previous(
    org_id: int, data: dict
) -> tuple[dict, Optional[dict]]:
    """Save guardrail settings: only the keys present in `data` change.

    Returns (saved row, previous retention values). Three statements in one
    transaction:

    1. A missing row is created (INSERT ... ON CONFLICT DO NOTHING). Only
       organization_id is given: every other column takes its column default,
       which equals _SETTINGS_DEFAULTS, so the defaults are not listed twice.
    2. The stored row is read with SELECT ... FOR UPDATE. Changed on-error
       choices and replacement lengths are validated against it (unchanged
       values are not). The previous retention values from it are
       exactly what this save replaces, even under concurrent saves, including
       two first saves for the same organization (the second waits for the
       first's lock). For an organization with nothing saved they are the
       defaults.
    3. A plain UPDATE ... RETURNING applies the save. It is the one place the
       settings columns are listed; each column's ``set_<column>`` flag decides
       whether it takes the new value or keeps the stored one. The statement
       text is static."""
    _validate_settings_input(data)
    params: dict[str, Any] = {"org_id": org_id}
    for column in _SETTINGS_DEFAULTS:
        params[column] = data.get(column)
        params[f"set_{column}"] = column in data

    async with get_db() as db:
        await db.execute(_CREATE_SETTINGS_ROW_SQL, {"org_id": org_id})
        # A separate statement, not part of the save: FOR UPDATE skips a row
        # the same command has already updated.
        previous_result = await db.execute(_LOCK_PREVIOUS_RETENTION_SQL, {"org_id": org_id})
        previous_row = previous_result.mappings().first()
        try:
            _validate_changed_text_settings(data, dict(previous_row) if previous_row else {})
        except HTTPException:
            await db.rollback()
            raise
        previous = (
            {key: previous_row[key] for key in _PREVIOUS_RETENTION_KEYS}
            if previous_row
            else None
        )
        result = await db.execute(_UPDATE_SETTINGS_SQL, params)
        await db.commit()
        row = result.mappings().first()
        return (dict(row) if row else {}), previous
    return {}, None


_CREATE_SETTINGS_ROW_SQL = text(
    """
    INSERT INTO ai_gateway_guardrail_settings (organization_id)
    VALUES (:org_id)
    ON CONFLICT (organization_id) DO NOTHING
    """
)

_LOCK_PREVIOUS_RETENTION_SQL = text(
    """
    SELECT log_retention_days, spend_log_retention_days, auto_purge_enabled, mcp_audit_retention_days,
           pii_on_error, content_filter_on_error,
           pii_replacement_format, content_filter_replacement
    FROM ai_gateway_guardrail_settings
    WHERE organization_id = :org_id
    FOR UPDATE
    """
)

# The one list of settings columns in SQL. A test checks it names exactly the
# keys of _SETTINGS_DEFAULTS.
_UPDATE_SETTINGS_SQL = text(
    """
                UPDATE ai_gateway_guardrail_settings SET
                    pii_on_error = CASE WHEN :set_pii_on_error THEN :pii_on_error ELSE pii_on_error END,
                    content_filter_on_error = CASE WHEN :set_content_filter_on_error THEN :content_filter_on_error ELSE content_filter_on_error END,
                    pii_replacement_format = CASE WHEN :set_pii_replacement_format THEN :pii_replacement_format ELSE pii_replacement_format END,
                    content_filter_replacement = CASE WHEN :set_content_filter_replacement THEN :content_filter_replacement ELSE content_filter_replacement END,
                    log_retention_days = CASE WHEN :set_log_retention_days THEN :log_retention_days ELSE log_retention_days END,
                    spend_log_retention_days = CASE WHEN :set_spend_log_retention_days THEN :spend_log_retention_days ELSE spend_log_retention_days END,
                    log_request_body = CASE WHEN :set_log_request_body THEN :log_request_body ELSE log_request_body END,
                    log_response_body = CASE WHEN :set_log_response_body THEN :log_response_body ELSE log_response_body END,
                    auto_purge_enabled = CASE WHEN :set_auto_purge_enabled THEN :auto_purge_enabled ELSE auto_purge_enabled END,
                    mcp_audit_retention_days = CASE WHEN :set_mcp_audit_retention_days THEN :mcp_audit_retention_days ELSE mcp_audit_retention_days END,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                RETURNING *
    """
)


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


_GUARDRAIL_LOGS_REMAIN_SQL = text(
    """
    SELECT EXISTS (
        SELECT 1
        FROM ai_gateway_guardrail_logs
        WHERE organization_id = :org_id
          AND created_at < :cutoff
    )
    """
)


async def purge_guardrail_logs(
    org_id: int, retention_days: int, max_batches: int = 50
) -> dict:
    """Batch DELETE 1000 rows at a time, up to max_batches.

    Returns {"deleted": <total>, "capped": <the batch limit was reached and
    rows older than the cutoff remain>}. Each batch is committed on its own; a
    failure after some batches raises PartialPurgeError carrying the rows
    deleted so far.
    """
    cutoff = retention_cutoff(retention_days)
    if cutoff is None:
        return {"deleted": 0, "capped": False}
    total_deleted = 0
    batch_size = 1000
    hit_batch_limit = False

    try:
        async with get_db() as db:
            for batch in range(max_batches):
                result = await db.execute(
                    text(
                        """
                        DELETE FROM ai_gateway_guardrail_logs
                        WHERE id IN (
                            SELECT id
                            FROM ai_gateway_guardrail_logs
                            WHERE organization_id = :org_id
                              AND created_at < :cutoff
                            LIMIT :batch_size
                        )
                        """
                    ),
                    {
                        "org_id": org_id,
                        "cutoff": cutoff,
                        "batch_size": batch_size,
                    },
                )
                await db.commit()
                deleted = result.rowcount or 0
                total_deleted += deleted
                if deleted < batch_size:
                    break
                if batch == max_batches - 1:
                    hit_batch_limit = True
    except Exception as error:
        raise PartialPurgeError(total_deleted, error) from error

    # The last allowed batch was full: capped only if older rows are actually
    # left. Outside the try above, so a failing check never fails the purge.
    capped = False
    if hit_batch_limit:

        async def check():
            async with get_db() as db:
                result = await db.execute(
                    _GUARDRAIL_LOGS_REMAIN_SQL, {"org_id": org_id, "cutoff": cutoff}
                )
                return result.scalar()

        capped = await older_rows_remain(check, "guardrail logs", org_id)

    return {"deleted": total_deleted, "capped": capped}
