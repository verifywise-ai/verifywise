"""
CRUD operations for bias audits.

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

from typing import List, Dict, Any, Optional
import logging
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

logger = logging.getLogger(__name__)

_ALLOWED_STATUSES = {"pending", "running", "completed", "failed"}


async def create_bias_audit(
    organization_id: int,
    db: AsyncSession,
    *,
    audit_id: str,
    project_id: Optional[str],
    preset_id: str,
    preset_name: str,
    mode: str,
    config: Dict[str, Any],
    created_by: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new bias audit record."""
    result = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_bias_audits
            (id, organization_id, project_id, preset_id, preset_name, mode, status, config, created_by)
            VALUES
            (:id, :organization_id, :project_id, :preset_id, :preset_name, :mode, 'pending', :config, :created_by)
            RETURNING id, organization_id, project_id, preset_id, preset_name, mode, status,
                      config, results, error, created_at, updated_at, completed_at, created_by
            '''
        ),
        {
            "id": audit_id,
            "organization_id": organization_id,
            "project_id": project_id,
            "preset_id": preset_id,
            "preset_name": preset_name,
            "mode": mode,
            "config": json.dumps(config),
            "created_by": created_by,
        },
    )
    row = result.mappings().first()
    if not row:
        return None
    return _row_to_dict(row)


async def get_bias_audit(
    organization_id: int,
    db: AsyncSession,
    audit_id: str,
) -> Optional[Dict[str, Any]]:
    """Get a single bias audit by ID."""
    result = await db.execute(
        text(
            '''
            SELECT id, organization_id, project_id, preset_id, preset_name, mode, status,
                   config, results, error, created_at, updated_at, completed_at, created_by
            FROM llm_evals_bias_audits
            WHERE organization_id = :organization_id AND id = :id
            '''
        ),
        {"organization_id": organization_id, "id": audit_id},
    )
    row = result.mappings().first()
    if not row:
        return None
    return _row_to_dict(row)


async def update_bias_audit_status(
    organization_id: int,
    db: AsyncSession,
    audit_id: str,
    *,
    status: str,
    results: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update audit status, results, and/or error."""
    if status not in _ALLOWED_STATUSES:
        raise ValueError(f"Invalid status: {status}. Must be one of {_ALLOWED_STATUSES}")
    updates = ["status = :status", "updated_at = CURRENT_TIMESTAMP"]
    params: Dict[str, Any] = {"id": audit_id, "organization_id": organization_id, "status": status}

    if results is not None:
        updates.append("results = :results")
        params["results"] = json.dumps(results)

    if error is not None:
        updates.append("error = :error")
        params["error"] = error

    if status in ("completed", "failed"):
        updates.append("completed_at = CURRENT_TIMESTAMP")

    result = await db.execute(
        text(
            f'''
            UPDATE llm_evals_bias_audits
            SET {", ".join(updates)}
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id, organization_id, project_id, preset_id, preset_name, mode, status,
                      config, results, error, created_at, updated_at, completed_at, created_by
            '''
        ),
        params,
    )
    row = result.mappings().first()
    if not row:
        return None
    return _row_to_dict(row)


async def list_bias_audits(
    organization_id: int,
    db: AsyncSession,
    project_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List bias audits with optional filtering."""
    where_clauses = ["organization_id = :organization_id"]
    params: Dict[str, Any] = {"organization_id": organization_id}

    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id

    where_sql = f"WHERE {' AND '.join(where_clauses)}"

    result = await db.execute(
        text(
            f'''
            SELECT id, organization_id, project_id, preset_id, preset_name, mode, status,
                   config, results, error, created_at, updated_at, completed_at, created_by
            FROM llm_evals_bias_audits
            {where_sql}
            ORDER BY created_at DESC
            '''
        ),
        params,
    )
    rows = result.mappings().all()
    return [_row_to_dict(row) for row in rows]


async def delete_bias_audit(
    organization_id: int,
    db: AsyncSession,
    audit_id: str,
) -> bool:
    """Delete a bias audit and its result rows (CASCADE)."""
    result = await db.execute(
        text(
            '''
            DELETE FROM llm_evals_bias_audits
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id
            '''
        ),
        {"organization_id": organization_id, "id": audit_id},
    )
    row = result.fetchone()
    return row is not None


async def create_bias_audit_result_rows(
    organization_id: int,
    db: AsyncSession,
    audit_id: str,
    rows: List[Dict[str, Any]],
) -> int:
    """Bulk insert per-group result rows for an audit."""
    inserted = 0
    for row_data in rows:
        await db.execute(
            text(
                '''
                INSERT INTO llm_evals_bias_audit_results
                (organization_id, audit_id, category_type, category_name, applicant_count,
                 selected_count, selection_rate, impact_ratio, excluded, flagged)
                VALUES
                (:organization_id, :audit_id, :category_type, :category_name, :applicant_count,
                 :selected_count, :selection_rate, :impact_ratio, :excluded, :flagged)
                '''
            ),
            {
                "organization_id": organization_id,
                "audit_id": audit_id,
                "category_type": row_data["category_type"],
                "category_name": row_data["category_name"],
                "applicant_count": row_data["applicant_count"],
                "selected_count": row_data["selected_count"],
                "selection_rate": row_data["selection_rate"],
                "impact_ratio": row_data.get("impact_ratio"),
                "excluded": row_data.get("excluded", False),
                "flagged": row_data.get("flagged", False),
            },
        )
        inserted += 1
    return inserted


async def get_bias_audit_result_rows(
    organization_id: int,
    db: AsyncSession,
    audit_id: str,
) -> List[Dict[str, Any]]:
    """Get all per-group result rows for an audit."""
    result = await db.execute(
        text(
            '''
            SELECT id, audit_id, category_type, category_name, applicant_count,
                   selected_count, selection_rate, impact_ratio, excluded, flagged, created_at
            FROM llm_evals_bias_audit_results
            WHERE organization_id = :organization_id AND audit_id = :audit_id
            ORDER BY id
            '''
        ),
        {"organization_id": organization_id, "audit_id": audit_id},
    )
    rows = result.mappings().all()
    return [
        {
            "id": row["id"],
            "auditId": row["audit_id"],
            "categoryType": row["category_type"],
            "categoryName": row["category_name"],
            "applicantCount": row["applicant_count"],
            "selectedCount": row["selected_count"],
            "selectionRate": float(row["selection_rate"]),
            "impactRatio": float(row["impact_ratio"]) if row["impact_ratio"] is not None else None,
            "excluded": row["excluded"],
            "flagged": row["flagged"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]


def _safe_json_load(value: Any, default: Any = None) -> Any:
    """Safely load JSON, returning default on failure."""
    if isinstance(value, (dict, list)):
        return value
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"Failed to parse JSON value in bias audit row")
        return default


def _row_to_dict(row) -> Dict[str, Any]:
    """Convert a database row to a camelCase dict for API responses."""
    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "projectId": row["project_id"],
        "presetId": row["preset_id"],
        "presetName": row["preset_name"],
        "mode": row["mode"],
        "status": row["status"],
        "config": _safe_json_load(row["config"], {}),
        "results": _safe_json_load(row["results"]),
        "error": row["error"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        "createdBy": row["created_by"],
    }
