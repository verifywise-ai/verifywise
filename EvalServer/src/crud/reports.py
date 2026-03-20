"""
CRUD operations for report generation and storage.
Aggregates experiment and log data for PDF/CSV report building.
Uses shared-schema multi-tenancy with organization_id.
"""

import json
import re
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_experiments_for_report(
    db: AsyncSession,
    organization_id: int,
    experiment_ids: List[str],
) -> List[Dict[str, Any]]:
    """Fetch experiment details for the given IDs, including computed metric summaries."""

    if not experiment_ids:
        return []

    placeholders = ", ".join(f":id_{i}" for i in range(len(experiment_ids)))
    params = {f"id_{i}": eid for i, eid in enumerate(experiment_ids)}
    params["organization_id"] = organization_id

    result = await db.execute(
        text(f'''
            SELECT id, project_id, name, description, config, status, results,
                   started_at, completed_at, created_at, created_by
            FROM llm_evals_experiments
            WHERE organization_id = :organization_id AND id IN ({placeholders})
            ORDER BY created_at DESC
        '''),
        params,
    )

    rows = result.mappings().all()
    experiments = []

    for row in rows:
        config = row["config"] or {}
        if isinstance(config, str):
            config = json.loads(config)
        results = row["results"] or {}
        if isinstance(results, str):
            results = json.loads(results)

        # Build metric summaries from results.avg_scores or from logs
        metric_summaries: Dict[str, Dict] = {}
        metric_thresholds: Dict[str, float] = {}

        avg_scores = results.get("avg_scores", {})
        if avg_scores:
            for key, val in avg_scores.items():
                if len(key) < 3 or not re.match(r'^[a-zA-Z]', key):
                    continue
                score = float(val) if isinstance(val, (int, float)) else 0.0
                metric_summaries[key] = {
                    "averageScore": score,
                    "passRate": 100.0 if score >= 0.5 else 0.0,
                    "minScore": score,
                    "maxScore": score,
                    "totalEvaluated": results.get("total_prompts", 0),
                }
        else:
            logs_summaries = await _compute_metrics_from_logs(
                db, organization_id, row["id"]
            )
            metric_summaries = logs_summaries

        thresholds = results.get("metric_thresholds") or config.get("metric_thresholds", {})
        if thresholds:
            for k, v in thresholds.items():
                metric_thresholds[k] = float(v) if v is not None else 0.5

        experiments.append({
            "id": row["id"],
            "name": row["name"] or config.get("name", row["id"]),
            "status": row["status"] or "unknown",
            "model": config.get("model", {}).get("name") or config.get("model", {}).get("model_name") or results.get("model", "Unknown"),
            "dataset": (config.get("dataset", {}).get("name") if isinstance(config.get("dataset"), dict) else config.get("dataset", "")) or results.get("dataset", ""),
            "judge": config.get("judgeLlm", {}).get("model") or config.get("judge", {}).get("model_name", ""),
            "scorer": config.get("scorer", {}).get("name", ""),
            "useCase": config.get("use_case", ""),
            "totalSamples": results.get("total_prompts", 0),
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
            "completedAt": row["completed_at"].isoformat() if row["completed_at"] else "",
            "duration": results.get("duration"),
            "metricSummaries": metric_summaries,
            "metricThresholds": metric_thresholds,
            "_raw_config": config,
        })

    return experiments


async def _compute_metrics_from_logs(
    db: AsyncSession,
    organization_id: int,
    experiment_id: str,
) -> Dict[str, Dict]:
    """Compute metric summaries from individual evaluation logs."""

    result = await db.execute(
        text('''
            SELECT metadata
            FROM llm_evals_logs
            WHERE organization_id = :organization_id
              AND experiment_id = :experiment_id
              AND metadata IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 2000
        '''),
        {"organization_id": organization_id, "experiment_id": experiment_id},
    )

    rows = result.mappings().all()
    agg: Dict[str, Dict] = {}

    for row in rows:
        metadata = row["metadata"]
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        if not metadata:
            continue

        scores = metadata.get("metric_scores", {})
        for raw_key, value in scores.items():
            key = re.sub(r"^G-Eval\s*\((.+)\)$", r"\1", raw_key, flags=re.IGNORECASE)
            score = value if isinstance(value, (int, float)) else (value.get("score") if isinstance(value, dict) else None)
            if not isinstance(score, (int, float)):
                continue
            score = float(score)

            if key not in agg:
                agg[key] = {"sum": 0.0, "count": 0, "min": 1.0, "max": 0.0, "pass": 0}
            agg[key]["sum"] += score
            agg[key]["count"] += 1
            agg[key]["min"] = min(agg[key]["min"], score)
            agg[key]["max"] = max(agg[key]["max"], score)
            if score >= 0.5:
                agg[key]["pass"] += 1

    summaries = {}
    for key, val in agg.items():
        count = val["count"]
        summaries[key] = {
            "averageScore": val["sum"] / count if count else 0,
            "passRate": (val["pass"] / count * 100) if count else 0,
            "minScore": val["min"],
            "maxScore": val["max"],
            "totalEvaluated": count,
        }

    return summaries


async def get_project_info(
    db: AsyncSession,
    organization_id: int,
    project_id: str,
) -> Optional[Dict[str, Any]]:
    """Get project name and details for the report cover."""

    result = await db.execute(
        text('''
            SELECT id, name, description, use_case
            FROM llm_evals_projects
            WHERE organization_id = :organization_id AND id = :project_id
        '''),
        {"organization_id": organization_id, "project_id": project_id},
    )

    row = result.mappings().first()
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "useCase": row["use_case"],
        }
    return None


# ==================== REPORT STORAGE ====================

async def save_report(
    db: AsyncSession,
    organization_id: int,
    title: str,
    format: str,
    file_data: bytes,
    experiment_ids: List[str],
    sections: List[Dict],
    project_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Save a generated report to the database."""
    report_id = f"report_{uuid.uuid4().hex[:16]}"
    file_size = len(file_data)

    await db.execute(
        text('''
            INSERT INTO llm_evals_reports
                (id, title, format, file_data, file_size, experiment_ids,
                 sections, project_id, organization_id, created_by)
            VALUES
                (:id, :title, :format, :file_data, :file_size, :experiment_ids,
                 :sections, :project_id, :organization_id, :created_by)
        '''),
        {
            "id": report_id,
            "title": title,
            "format": format,
            "file_data": file_data,
            "file_size": file_size,
            "experiment_ids": json.dumps(experiment_ids),
            "sections": json.dumps(sections),
            "project_id": project_id,
            "organization_id": organization_id,
            "created_by": created_by,
        },
    )
    await db.commit()

    return {
        "id": report_id,
        "title": title,
        "format": format,
        "fileSize": file_size,
        "experimentIds": experiment_ids,
        "projectId": project_id,
        "createdAt": None,
    }


async def get_report_file(
    db: AsyncSession,
    organization_id: int,
    report_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch a stored report's binary data and metadata."""
    result = await db.execute(
        text('''
            SELECT id, title, format, file_data, file_size, created_at
            FROM llm_evals_reports
            WHERE organization_id = :organization_id AND id = :report_id
        '''),
        {"organization_id": organization_id, "report_id": report_id},
    )
    row = result.mappings().first()
    if not row:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "format": row["format"],
        "file_data": bytes(row["file_data"]),
        "file_size": row["file_size"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
    }


async def list_reports(
    db: AsyncSession,
    organization_id: int,
    project_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List stored reports (metadata only, no binary)."""
    params: Dict[str, Any] = {"organization_id": organization_id, "limit": limit}
    where = "WHERE organization_id = :organization_id"
    if project_id:
        where += " AND project_id = :project_id"
        params["project_id"] = project_id

    result = await db.execute(
        text(f'''
            SELECT id, title, format, file_size, experiment_ids,
                   project_id, created_by, created_at
            FROM llm_evals_reports
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
        '''),
        params,
    )
    rows = result.mappings().all()
    reports = []
    for row in rows:
        exp_ids = row["experiment_ids"]
        if isinstance(exp_ids, str):
            exp_ids = json.loads(exp_ids)
        reports.append({
            "id": row["id"],
            "title": row["title"],
            "format": row["format"],
            "fileSize": row["file_size"],
            "experiments": len(exp_ids) if exp_ids else 0,
            "experimentIds": exp_ids,
            "projectId": row["project_id"],
            "createdBy": row["created_by"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        })
    return reports


async def delete_report(
    db: AsyncSession,
    organization_id: int,
    report_id: str,
) -> bool:
    """Delete a stored report."""
    result = await db.execute(
        text('''
            DELETE FROM llm_evals_reports
            WHERE organization_id = :organization_id AND id = :report_id
        '''),
        {"organization_id": organization_id, "report_id": report_id},
    )
    await db.commit()
    return result.rowcount > 0
