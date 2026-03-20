import json
from typing import Optional, Any
from sqlalchemy import text
from database.db import get_db


async def get_risk_settings(org_id: int) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            text(
                "SELECT * FROM ai_gateway_risk_settings "
                "WHERE organization_id = :org_id "
                "ORDER BY condition_id"
            ),
            {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def upsert_risk_setting(
    org_id: int,
    condition_id: str,
    is_enabled: bool = True,
    threshold: Optional[Any] = None,
    severity_override: Optional[str] = None,
) -> dict:
    threshold_json = json.dumps(threshold) if threshold is not None else None

    async with get_db() as db:
        result = await db.execute(
            text(
                """
                INSERT INTO ai_gateway_risk_settings
                    (organization_id, condition_id, is_enabled, threshold, severity_override)
                VALUES
                    (:org_id, :condition_id, :is_enabled, :threshold::jsonb, :severity_override)
                ON CONFLICT (organization_id, condition_id) DO UPDATE SET
                    is_enabled       = EXCLUDED.is_enabled,
                    threshold        = COALESCE(EXCLUDED.threshold, ai_gateway_risk_settings.threshold),
                    severity_override = COALESCE(EXCLUDED.severity_override, ai_gateway_risk_settings.severity_override),
                    updated_at       = NOW()
                RETURNING *
                """
            ),
            {
                "org_id": org_id,
                "condition_id": condition_id,
                "is_enabled": is_enabled,
                "threshold": threshold_json,
                "severity_override": severity_override,
            },
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else {}
    return {}


async def create_suggestion(
    org_id: int,
    condition_id: str,
    title: str,
    description: str,
    severity: str,
    evidence: dict,
    compliance_tags: list[str],
    suggested_mitigation: Optional[str] = None,
) -> dict:
    evidence_json = json.dumps(evidence)
    # Build a PostgreSQL array literal: ARRAY['tag1','tag2']
    tags_literal = (
        "ARRAY[" + ",".join(f"'{t}'" for t in compliance_tags) + "]"
        if compliance_tags
        else "ARRAY[]::text[]"
    )

    async with get_db() as db:
        result = await db.execute(
            text(
                f"""
                INSERT INTO ai_gateway_risk_suggestions
                    (organization_id, condition_id, title, description, severity,
                     evidence, compliance_tags, suggested_mitigation, status)
                VALUES
                    (:org_id, :condition_id, :title, :description, :severity,
                     :evidence::jsonb, {tags_literal}, :suggested_mitigation, 'pending')
                RETURNING *
                """
            ),
            {
                "org_id": org_id,
                "condition_id": condition_id,
                "title": title,
                "description": description,
                "severity": severity,
                "evidence": evidence_json,
                "suggested_mitigation": suggested_mitigation,
            },
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else {}
    return {}


async def get_suggestions(org_id: int, status: Optional[str] = None) -> list[dict]:
    status_clause = "AND s.status = :status" if status else ""

    async with get_db() as db:
        result = await db.execute(
            text(
                f"""
                SELECT
                    s.*,
                    u.name AS reviewed_by_name
                FROM ai_gateway_risk_suggestions s
                LEFT JOIN users u ON u.id = s.reviewed_by
                WHERE s.organization_id = :org_id
                {status_clause}
                ORDER BY s.created_at DESC
                """
            ),
            {"org_id": org_id, "status": status} if status else {"org_id": org_id},
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    return []


async def update_suggestion_status(
    org_id: int,
    suggestion_id: int,
    status: str,
    reviewed_by: int,
    dismiss_reason: Optional[str] = None,
    accepted_risk_id: Optional[int] = None,
) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                UPDATE ai_gateway_risk_suggestions SET
                    status           = :status,
                    reviewed_by      = :reviewed_by,
                    reviewed_at      = NOW(),
                    dismiss_reason   = :dismiss_reason,
                    accepted_risk_id = :accepted_risk_id
                WHERE id = :id
                  AND organization_id = :org_id
                  AND status = 'pending'
                RETURNING *
                """
            ),
            {
                "status": status,
                "reviewed_by": reviewed_by,
                "dismiss_reason": dismiss_reason,
                "accepted_risk_id": accepted_risk_id,
                "id": suggestion_id,
                "org_id": org_id,
            },
        )
        await db.commit()
        row = result.mappings().first()
        return dict(row) if row else None
    return None


async def has_pending_suggestion(org_id: int, condition_id: str) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM ai_gateway_risk_suggestions
                    WHERE organization_id = :org_id
                      AND condition_id = :condition_id
                      AND status = 'pending'
                )
                """
            ),
            {"org_id": org_id, "condition_id": condition_id},
        )
        row = result.first()
        return bool(row[0]) if row else False
    return False


async def get_all_pending_condition_ids(org_id: int) -> set[str]:
    async with get_db() as db:
        result = await db.execute(
            text(
                """
                SELECT DISTINCT condition_id
                FROM ai_gateway_risk_suggestions
                WHERE organization_id = :org_id
                  AND status = 'pending'
                """
            ),
            {"org_id": org_id},
        )
        rows = result.fetchall()
        return {row[0] for row in rows}
    return set()
