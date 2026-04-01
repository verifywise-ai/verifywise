"""
CRUD operations for DeepEval scorers (metric definitions).

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

from typing import List, Dict, Any, Optional
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime


async def list_scorers(
    organization_id: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """
    List scorers for an organization.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   description,
                   type,
                   metric_key,
                   config,
                   enabled,
                   default_threshold,
                   weight,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_scorers
            WHERE organization_id = :organization_id
            ORDER BY created_at DESC
            '''
        ),
        {"organization_id": organization_id},
    )

    rows = result.mappings().all()
    scorers: List[Dict[str, Any]] = []
    for row in rows:
        scorers.append(
            {
                "id": row["id"],
                "orgId": str(row["organization_id"]) if row["organization_id"] else None,
                "name": row["name"],
                "description": row["description"],
                "type": row["type"],
                "metricKey": row["metric_key"],
                "config": row["config"] or {},
                "enabled": row["enabled"],
                "defaultThreshold": float(row["default_threshold"]) if row["default_threshold"] is not None else None,
                "weight": float(row["weight"]) if row["weight"] is not None else None,
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
                "createdBy": row["created_by"],
            }
        )
    return scorers


async def create_scorer(
    scorer_id: str,
    *,
    organization_id: int,
    name: str,
    description: Optional[str],
    scorer_type: str,
    metric_key: str,
    config: Dict[str, Any],
    enabled: bool,
    default_threshold: Optional[float],
    weight: Optional[float],
    created_by: Optional[str],
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Create a new scorer definition.
    """

    result = await db.execute(
        text(
            '''
            INSERT INTO llm_evals_scorers
            (id, organization_id, name, description, type, metric_key, config, enabled,
             default_threshold, weight, created_by)
            VALUES
            (:id, :organization_id, :name, :description, :type, :metric_key, :config, :enabled,
             :default_threshold, :weight, :created_by)
            RETURNING id, organization_id, name, description, type, metric_key, config, enabled,
                      default_threshold, weight, created_at, updated_at, created_by
            '''
        ),
        {
            "id": scorer_id,
            "organization_id": organization_id,
            "name": name,
            "description": description,
            "type": scorer_type,
            "metric_key": metric_key,
            "config": json.dumps(config or {}),
            "enabled": enabled,
            "default_threshold": default_threshold,
            "weight": weight,
            "created_by": created_by,
        },
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "description": row["description"],
        "type": row["type"],
        "metricKey": row["metric_key"],
        "config": row["config"] or {},
        "enabled": row["enabled"],
        "defaultThreshold": float(row["default_threshold"]) if row["default_threshold"] is not None else None,
        "weight": float(row["weight"]) if row["weight"] is not None else None,
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def update_scorer(
    scorer_id: str,
    *,
    organization_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    scorer_type: Optional[str] = None,
    metric_key: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    enabled: Optional[bool] = None,
    default_threshold: Optional[float] = None,
    weight: Optional[float] = None,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Update an existing scorer.
    """

    updates = []
    params: Dict[str, Any] = {"id": scorer_id, "organization_id": organization_id}

    if name is not None:
        updates.append("name = :name")
        params["name"] = name
    if description is not None:
        updates.append("description = :description")
        params["description"] = description
    if scorer_type is not None:
        updates.append("type = :type")
        params["type"] = scorer_type
    if metric_key is not None:
        updates.append("metric_key = :metric_key")
        params["metric_key"] = metric_key
    if config is not None:
        updates.append("config = :config")
        params["config"] = json.dumps(config)
    if enabled is not None:
        updates.append("enabled = :enabled")
        params["enabled"] = enabled
    if default_threshold is not None:
        updates.append("default_threshold = :default_threshold")
        params["default_threshold"] = default_threshold
    if weight is not None:
        updates.append("weight = :weight")
        params["weight"] = weight

    if not updates:
        result = await db.execute(
            text(
                '''
                SELECT id, organization_id, name, description, type, metric_key, config, enabled,
                       default_threshold, weight, created_at, updated_at, created_by
                FROM llm_evals_scorers
                WHERE organization_id = :organization_id AND id = :id
                '''
            ),
            params,
        )
    else:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        result = await db.execute(
            text(
                f'''
                UPDATE llm_evals_scorers
                SET {", ".join(updates)}
                WHERE organization_id = :organization_id AND id = :id
                RETURNING id, organization_id, name, description, type, metric_key, config, enabled,
                          default_threshold, weight, created_at, updated_at, created_by
                '''
            ),
            params,
        )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "description": row["description"],
        "type": row["type"],
        "metricKey": row["metric_key"],
        "config": row["config"] or {},
        "enabled": row["enabled"],
        "defaultThreshold": float(row["default_threshold"]) if row["default_threshold"] is not None else None,
        "weight": float(row["weight"]) if row["weight"] is not None else None,
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def get_scorer_by_id(
    scorer_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Get a single scorer by ID.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   description,
                   type,
                   metric_key,
                   config,
                   enabled,
                   default_threshold,
                   weight,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_scorers
            WHERE organization_id = :organization_id AND id = :id
            '''
        ),
        {"organization_id": organization_id, "id": scorer_id},
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "description": row["description"],
        "type": row["type"],
        "metricKey": row["metric_key"],
        "config": row["config"] or {},
        "enabled": row["enabled"],
        "defaultThreshold": float(row["default_threshold"]) if row["default_threshold"] is not None else None,
        "weight": float(row["weight"]) if row["weight"] is not None else None,
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }


async def delete_scorer(
    scorer_id: str,
    *,
    organization_id: int,
    db: AsyncSession,
) -> bool:
    """
    Delete a scorer by ID.
    """

    result = await db.execute(
        text(
            '''
            DELETE FROM llm_evals_scorers
            WHERE organization_id = :organization_id AND id = :id
            RETURNING id
            '''
        ),
        {"organization_id": organization_id, "id": scorer_id},
    )

    row = result.fetchone()
    return row is not None


async def get_latest_scorer(
    organization_id: int,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Get the most recently added/updated scorer.
    Used for auto-populating experiment forms with the last used judge settings.
    """

    result = await db.execute(
        text(
            '''
            SELECT id,
                   organization_id,
                   name,
                   description,
                   type,
                   metric_key,
                   config,
                   enabled,
                   default_threshold,
                   weight,
                   created_at,
                   updated_at,
                   created_by
            FROM llm_evals_scorers
            WHERE organization_id = :organization_id
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
            '''
        ),
        {"organization_id": organization_id},
    )

    row = result.mappings().first()
    if not row:
        return None

    return {
        "id": row["id"],
        "orgId": str(row["organization_id"]) if row["organization_id"] else None,
        "name": row["name"],
        "description": row["description"],
        "type": row["type"],
        "metricKey": row["metric_key"],
        "config": row["config"] or {},
        "enabled": row["enabled"],
        "defaultThreshold": float(row["default_threshold"]) if row["default_threshold"] is not None else None,
        "weight": float(row["weight"]) if row["weight"] is not None else None,
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "createdBy": row["created_by"],
    }
