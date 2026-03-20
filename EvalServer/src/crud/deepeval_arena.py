"""
CRUD operations for DeepEval Arena comparisons.

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

from typing import List, Dict, Any, Optional
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime


async def create_arena_comparison(
    comparison_id: str,
    *,
    name: str,
    description: Optional[str],
    organization_id: int,
    contestants: List[Dict[str, Any]],
    contestant_names: List[str],
    metric_config: Dict[str, Any],
    judge_model: str,
    created_by: Optional[str],
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Create a new arena comparison record.
    """
    result = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_arena_comparisons
            (id, name, description, organization_id, contestants, contestant_names,
             metric_config, judge_model, status, created_by)
            VALUES
            (:id, :name, :description, :organization_id, :contestants, :contestant_names,
             :metric_config, :judge_model, :status, :created_by)
            RETURNING id, name, description, organization_id, contestants, contestant_names,
                      metric_config, judge_model, status, progress, winner, win_counts,
                      detailed_results, error_message, created_at, updated_at,
                      completed_at, created_by
            '''
        ),
        {
            "id": comparison_id,
            "name": name,
            "description": description,
            "organization_id": organization_id,
            "contestants": json.dumps(contestants),
            "contestant_names": json.dumps(contestant_names),
            "metric_config": json.dumps(metric_config),
            "judge_model": judge_model,
            "status": "pending",
            "created_by": created_by,
        },
    )

    row = result.mappings().first()
    if not row:
        return None

    return _row_to_dict(row)


async def get_arena_comparison(
    comparison_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Get an arena comparison by ID.
    """
    result = await db.execute(
        text(
            '''
            SELECT id, name, description, organization_id, contestants, contestant_names,
                   metric_config, judge_model, status, progress, winner, win_counts,
                   detailed_results, error_message, created_at, updated_at,
                   completed_at, created_by
            FROM llm_evals_arena_comparisons
            WHERE organization_id = :organization_id AND id = :id
            '''
        ),
        {"organization_id": organization_id, "id": comparison_id},
    )

    row = result.mappings().first()
    if not row:
        return None

    return _row_to_dict(row)


async def list_arena_comparisons(
    organization_id: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """
    List all arena comparisons for an organization.
    """
    result = await db.execute(
        text(
            '''
            SELECT id, name, description, organization_id, contestants, contestant_names,
                   metric_config, judge_model, status, progress, winner, win_counts,
                   detailed_results, error_message, created_at, updated_at,
                   completed_at, created_by
            FROM llm_evals_arena_comparisons
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
            '''
        ),
        {"organization_id": organization_id},
    )

    rows = result.mappings().all()
    return [_row_to_dict(row) for row in rows]


async def update_arena_comparison(
    comparison_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
    status: Optional[str] = None,
    progress: Optional[str] = None,
    winner: Optional[str] = None,
    win_counts: Optional[Dict[str, int]] = None,
    detailed_results: Optional[List[Dict[str, Any]]] = None,
    error_message: Optional[str] = None,
    completed_at: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """
    Update an arena comparison.
    """
    updates = []
    params: Dict[str, Any] = {"id": comparison_id, "organization_id": organization_id}

    if status is not None:
        updates.append("status = :status")
        params["status"] = status
    if progress is not None:
        updates.append("progress = :progress")
        params["progress"] = progress
    if winner is not None:
        updates.append("winner = :winner")
        params["winner"] = winner
    if win_counts is not None:
        updates.append("win_counts = :win_counts")
        params["win_counts"] = json.dumps(win_counts)
    if detailed_results is not None:
        updates.append("detailed_results = :detailed_results")
        params["detailed_results"] = json.dumps(detailed_results)
    if error_message is not None:
        updates.append("error_message = :error_message")
        params["error_message"] = error_message
    if completed_at is not None:
        updates.append("completed_at = :completed_at")
        params["completed_at"] = completed_at

    if not updates:
        return await get_arena_comparison(comparison_id, organization_id=organization_id, db=db)

    updates.append("updated_at = CURRENT_TIMESTAMP")

    result = await db.execute(
        text(
            f'''
            UPDATE llm_evals_arena_comparisons
            SET {", ".join(updates)}
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id, name, description, organization_id, contestants, contestant_names,
                      metric_config, judge_model, status, progress, winner, win_counts,
                      detailed_results, error_message, created_at, updated_at,
                      completed_at, created_by
            '''
        ),
        params,
    )

    row = result.mappings().first()
    if not row:
        return None

    return _row_to_dict(row)


async def delete_arena_comparison(
    comparison_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> bool:
    """
    Delete an arena comparison.
    """
    result = await db.execute(
        text(
            '''
            DELETE FROM llm_evals_arena_comparisons
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id
            '''
        ),
        {"organization_id": organization_id, "id": comparison_id},
    )

    row = result.fetchone()
    return row is not None


def _row_to_dict(row) -> Dict[str, Any]:
    """
    Convert a database row to a dictionary.
    """
    metric_config = row["metric_config"] if isinstance(row["metric_config"], dict) else json.loads(row["metric_config"] or "{}")

    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "contestants": row["contestants"] if isinstance(row["contestants"], list) else json.loads(row["contestants"] or "[]"),
        "contestantNames": row["contestant_names"] if isinstance(row["contestant_names"], list) else json.loads(row["contestant_names"] or "[]"),
        "metricConfig": metric_config,
        "judgeModel": row["judge_model"],
        "status": row["status"],
        "progress": row["progress"],
        "winner": row["winner"],
        "winCounts": row["win_counts"] if isinstance(row["win_counts"], dict) else json.loads(row["win_counts"] or "{}"),
        "detailedResults": row["detailed_results"] if isinstance(row["detailed_results"], list) else json.loads(row["detailed_results"] or "[]"),
        "errorMessage": row["error_message"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        "createdBy": row["created_by"],
        "dataset": metric_config.get("datasetPath", ""),
    }
