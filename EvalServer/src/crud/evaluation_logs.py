"""CRUD operations for evaluation logs, metrics, and experiments

Shared-schema multi-tenancy: All data is in the public schema with organization_id column.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
import json


# ==================== LOGS ====================

async def create_log(
    db: AsyncSession,
    project_id: str,
    organization_id: int,
    experiment_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    parent_trace_id: Optional[str] = None,
    span_name: Optional[str] = None,
    input_text: Optional[str] = None,
    output_text: Optional[str] = None,
    model_name: Optional[str] = None,
    metadata: Optional[Dict] = None,
    latency_ms: Optional[int] = None,
    token_count: Optional[int] = None,
    cost: Optional[float] = None,
    status: Optional[str] = "success",
    error_message: Optional[str] = None,
    created_by: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new evaluation log entry"""
    log_id = str(uuid.uuid4())
    trace = trace_id or str(uuid.uuid4())

    metadata_json = json.dumps(metadata) if metadata else '{}'

    result = await db.execute(
        text('''
            INSERT INTO llm_evals_logs
            (id, organization_id, project_id, experiment_id, trace_id, parent_trace_id, span_name,
             input_text, output_text, model_name, metadata, latency_ms, token_count,
             cost, status, error_message, created_by)
            VALUES (:id, :organization_id, :project_id, :experiment_id, CAST(:trace_id AS uuid), CAST(:parent_trace_id AS uuid), :span_name,
                    :input_text, :output_text, :model_name, CAST(:metadata_json AS jsonb), :latency_ms, :token_count,
                    :cost, :status, :error_message, :created_by)
            RETURNING id, project_id, experiment_id, trace_id, timestamp, status
        '''),
        {
            "id": log_id,
            "organization_id": organization_id,
            "project_id": project_id,
            "experiment_id": experiment_id,
            "trace_id": trace,
            "parent_trace_id": parent_trace_id,
            "span_name": span_name,
            "input_text": input_text,
            "output_text": output_text,
            "model_name": model_name,
            "metadata_json": metadata_json,
            "latency_ms": latency_ms,
            "token_count": token_count,
            "cost": cost,
            "status": status,
            "error_message": error_message,
            "created_by": str(created_by) if created_by is not None else None,
        }
    )

    await db.commit()
    row = result.mappings().first()

    if row:
        return {
            "id": str(row["id"]),
            "project_id": row["project_id"],
            "experiment_id": row["experiment_id"],
            "trace_id": str(row["trace_id"]) if row["trace_id"] else None,
            "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
            "status": row["status"],
        }
    return None


async def update_log_metadata(
    db: AsyncSession,
    log_id: str,
    organization_id: int,
    metadata: Dict[str, Any],
) -> bool:
    """Merge/replace metadata for a specific log id"""
    metadata_json = json.dumps(metadata) if metadata else '{}'
    result = await db.execute(
        text('''
            UPDATE llm_evals_logs
            SET metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:metadata_json AS jsonb)
            WHERE organization_id = :organization_id AND id = :log_id
            RETURNING id
        '''),
        {"metadata_json": metadata_json, "log_id": log_id, "organization_id": organization_id}
    )
    await db.commit()
    return result.mappings().first() is not None


async def get_logs(
    db: AsyncSession,
    organization_id: int,
    project_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Get logs with optional filtering"""

    where_clauses = ["organization_id = :organization_id"]
    params: Dict[str, Any] = {"limit": limit, "offset": offset, "organization_id": organization_id}

    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    if experiment_id:
        where_clauses.append("experiment_id = :experiment_id")
        params["experiment_id"] = experiment_id
    if status:
        where_clauses.append("status = :status")
        params["status"] = status

    where_clause = "WHERE " + " AND ".join(where_clauses)

    result = await db.execute(
        text(f'''
            SELECT id, project_id, experiment_id, trace_id, span_name,
                   input_text, output_text, model_name, metadata, latency_ms, token_count,
                   cost, status, error_message, timestamp
            FROM llm_evals_logs
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT :limit OFFSET :offset
        '''),
        params
    )

    logs = []
    for row in result.mappings():
        logs.append({
            "id": str(row["id"]),
            "project_id": row["project_id"],
            "experiment_id": row["experiment_id"],
            "trace_id": str(row["trace_id"]) if row["trace_id"] else None,
            "span_name": row["span_name"],
            "input_text": row["input_text"],
            "output_text": row["output_text"],
            "model_name": row["model_name"],
            "metadata": row["metadata"] if row["metadata"] else {},
            "latency_ms": row["latency_ms"],
            "token_count": row["token_count"],
            "cost": float(row["cost"]) if row["cost"] else None,
            "status": row["status"],
            "error_message": row["error_message"],
            "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
        })

    return logs


async def get_log_count(
    db: AsyncSession,
    organization_id: int,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
) -> int:
    """Get total count of logs"""

    where_clauses = ["organization_id = :organization_id"]
    params: Dict[str, Any] = {"organization_id": organization_id}

    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    if status:
        where_clauses.append("status = :status")
        params["status"] = status

    where_clause = "WHERE " + " AND ".join(where_clauses)

    result = await db.execute(
        text(f'SELECT COUNT(*) as count FROM llm_evals_logs {where_clause}'),
        params
    )

    row = result.mappings().first()
    return row["count"] if row else 0


# ==================== METRICS ====================

async def create_metric(
    db: AsyncSession,
    project_id: str,
    metric_name: str,
    metric_type: str,
    value: float,
    organization_id: int,
    experiment_id: Optional[str] = None,
    dimensions: Optional[Dict] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new metric entry"""
    metric_id = str(uuid.uuid4())
    dimensions_json = json.dumps(dimensions) if dimensions else '{}'

    result = await db.execute(
        text('''
            INSERT INTO llm_evals_metrics
            (id, organization_id, project_id, experiment_id, metric_name, metric_type, value, dimensions)
            VALUES (:id, :organization_id, :project_id, :experiment_id, :metric_name, :metric_type, :value, CAST(:dimensions_json AS jsonb))
            RETURNING id, project_id, metric_name, value, timestamp
        '''),
        {
            "id": metric_id,
            "organization_id": organization_id,
            "project_id": project_id,
            "experiment_id": experiment_id,
            "metric_name": metric_name,
            "metric_type": metric_type,
            "value": value,
            "dimensions_json": dimensions_json,
        }
    )

    await db.commit()
    row = result.mappings().first()

    if row:
        return {
            "id": str(row["id"]),
            "project_id": row["project_id"],
            "metric_name": row["metric_name"],
            "value": row["value"],
            "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
        }
    return None


async def get_metric_aggregates(
    db: AsyncSession,
    organization_id: int,
    project_id: str,
    metric_name: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Dict[str, float]:
    """Get aggregated statistics for a metric"""

    where_clauses = ["organization_id = :organization_id", "project_id = :project_id", "metric_name = :metric_name"]
    params: Dict[str, Any] = {
        "organization_id": organization_id,
        "project_id": project_id,
        "metric_name": metric_name,
    }

    if start_date:
        where_clauses.append("timestamp >= :start_date")
        params["start_date"] = start_date
    if end_date:
        where_clauses.append("timestamp <= :end_date")
        params["end_date"] = end_date

    where_clause = "WHERE " + " AND ".join(where_clauses)

    result = await db.execute(
        text(f'''
            SELECT
                AVG(value) as avg,
                MIN(value) as min,
                MAX(value) as max,
                COUNT(*) as count
            FROM llm_evals_metrics
            {where_clause}
        '''),
        params
    )

    row = result.mappings().first()

    if row:
        return {
            "average": float(row["avg"]) if row["avg"] else 0,
            "min": float(row["min"]) if row["min"] else 0,
            "max": float(row["max"]) if row["max"] else 0,
            "count": row["count"] or 0,
        }

    return {"average": 0, "min": 0, "max": 0, "count": 0}


# ==================== EXPERIMENTS ====================

async def create_experiment(
    db: AsyncSession,
    project_id: str,
    name: str,
    config: Dict,
    organization_id: int,
    description: Optional[str] = None,
    baseline_experiment_id: Optional[str] = None,
    created_by: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new experiment"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    experiment_id = f"exp_{timestamp}"

    print(f"💾 CRUD - Inserting experiment into database...")
    print(f"   Organization ID: {organization_id}")
    print(f"   Experiment ID: {experiment_id}")
    print(f"   Project ID: {project_id}")

    try:
        config_json = json.dumps(config) if config else '{}'

        result = await db.execute(
            text('''
                INSERT INTO llm_evals_experiments
                (id, organization_id, project_id, name, description, config, baseline_experiment_id, status, created_by)
                VALUES (:id, :organization_id, :project_id, :name, :description, CAST(:config_json AS jsonb), :baseline_experiment_id, :status, :created_by)
                RETURNING id, name, status, created_at
            '''),
            {
                "id": experiment_id,
                "organization_id": organization_id,
                "project_id": project_id,
                "name": name,
                "description": description,
                "config_json": config_json,
                "baseline_experiment_id": baseline_experiment_id,
                "status": "pending",
                "created_by": str(created_by) if created_by is not None else None,
            }
        )

        await db.commit()
        row = result.mappings().first()

        if row:
            print(f"✅ CRUD - Experiment inserted successfully")
            return {
                "id": row["id"],
                "name": row["name"],
                "status": row["status"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        return None
    except Exception as e:
        print(f"❌ CRUD ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


async def get_experiment_by_id(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
) -> Optional[Dict[str, Any]]:
    """Get a specific experiment by ID"""

    result = await db.execute(
        text('''
            SELECT id, project_id, name, description, config, baseline_experiment_id,
                   status, results, error_message, started_at, completed_at,
                   created_at, updated_at, created_by
            FROM llm_evals_experiments
            WHERE organization_id = :organization_id AND id = :experiment_id
        '''),
        {"organization_id": organization_id, "experiment_id": experiment_id}
    )

    row = result.mappings().first()

    if row:
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "name": row["name"],
            "description": row["description"],
            "config": row["config"],
            "baseline_experiment_id": row["baseline_experiment_id"],
            "status": row["status"],
            "results": row["results"],
            "error_message": row["error_message"],
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "created_by": row["created_by"],
        }
    return None


async def get_experiments(
    db: AsyncSession,
    organization_id: int,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Get experiments with optional filtering"""

    where_clauses = ["organization_id = :organization_id"]
    params: Dict[str, Any] = {"limit": limit, "offset": offset, "organization_id": organization_id}

    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    if status:
        where_clauses.append("status = :status")
        params["status"] = status

    where_clause = "WHERE " + " AND ".join(where_clauses)

    result = await db.execute(
        text(f'''
            SELECT id, project_id, name, description, config, status,
                   results, created_at, updated_at, started_at, completed_at
            FROM llm_evals_experiments
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        '''),
        params
    )

    experiments = []
    for row in result.mappings():
        experiments.append({
            "id": row["id"],
            "project_id": row["project_id"],
            "name": row["name"],
            "description": row["description"],
            "config": row["config"],
            "status": row["status"],
            "results": row["results"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
        })

    return experiments


async def get_experiment_count(
    db: AsyncSession,
    organization_id: int,
    project_id: Optional[str] = None
) -> int:
    """Get total count of experiments"""

    where_clauses = ["organization_id = :organization_id"]
    params: Dict[str, Any] = {"organization_id": organization_id}

    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id

    where_clause = "WHERE " + " AND ".join(where_clauses)

    result = await db.execute(
        text(f'SELECT COUNT(*) as count FROM llm_evals_experiments {where_clause}'),
        params
    )

    row = result.mappings().first()
    return row["count"] if row else 0


async def update_experiment_status(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
    status: str,
    results: Optional[Dict] = None,
    error_message: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update experiment status and results"""

    # Build update fields
    updates = ["status = :status", "updated_at = CURRENT_TIMESTAMP"]
    params = {"experiment_id": experiment_id, "organization_id": organization_id, "status": status}

    if results is not None:
        updates.append("results = CAST(:results_json AS jsonb)")
        params["results_json"] = json.dumps(results)

    if error_message is not None:
        updates.append("error_message = :error_message")
        params["error_message"] = error_message

    if status == "running":
        updates.append("started_at = COALESCE(started_at, CURRENT_TIMESTAMP)")
    elif status in ["completed", "failed"]:
        updates.append("completed_at = CURRENT_TIMESTAMP")

    update_clause = ", ".join(updates)

    result = await db.execute(
        text(f'''
            UPDATE llm_evals_experiments
            SET {update_clause}
            WHERE organization_id = :organization_id AND id = :experiment_id
            RETURNING id, status, updated_at
        '''),
        params
    )

    await db.commit()
    row = result.mappings().first()

    if row:
        return {
            "id": row["id"],
            "status": row["status"],
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
    return None


async def update_experiment(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update experiment name and/or description"""

    # Build update fields dynamically
    updates = ["updated_at = CURRENT_TIMESTAMP"]
    params = {"experiment_id": experiment_id, "organization_id": organization_id}

    if name is not None:
        updates.append("name = :name")
        params["name"] = name

    if description is not None:
        updates.append("description = :description")
        params["description"] = description

    if len(updates) == 1:  # Only updated_at
        return None

    update_clause = ", ".join(updates)

    result = await db.execute(
        text(f'''
            UPDATE llm_evals_experiments
            SET {update_clause}
            WHERE organization_id = :organization_id AND id = :experiment_id
            RETURNING *
        '''),
        params
    )

    await db.commit()
    row = result.mappings().first()

    if row:
        return dict(row)
    return None


async def delete_experiment(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
) -> bool:
    """
    Delete an experiment and all associated logs and metrics

    Args:
        db: Database session
        experiment_id: Experiment ID to delete
        organization_id: Organization ID for tenant isolation

    Returns:
        True if deleted successfully, False if not found
    """

    try:
        # First, delete associated evaluation logs
        await db.execute(
            text('''
                DELETE FROM llm_evals_logs
                WHERE organization_id = :organization_id AND experiment_id = :experiment_id
            '''),
            {"organization_id": organization_id, "experiment_id": experiment_id}
        )

        # Then delete the experiment
        result = await db.execute(
            text('''
                DELETE FROM llm_evals_experiments
                WHERE organization_id = :organization_id AND id = :experiment_id
                RETURNING id
            '''),
            {"organization_id": organization_id, "experiment_id": experiment_id}
        )

        await db.commit()
        row = result.mappings().first()

        return row is not None
    except Exception as e:
        print(f"❌ Error deleting experiment: {e}")
        await db.rollback()
        raise
