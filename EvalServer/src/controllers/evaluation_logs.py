"""Controllers for evaluation logs, metrics, and experiments"""

from fastapi import HTTPException
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from crud import evaluation_logs as crud
from database.db import get_db


# ==================== LOGS ====================

async def create_log_controller(
    organization_id: int,
    user_id: int,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new evaluation log"""
    try:
        async with get_db() as db:
            log = await crud.create_log(
                db=db,
                project_id=data.get("project_id"),
                organization_id=organization_id,
                experiment_id=data.get("experiment_id"),
                trace_id=data.get("trace_id"),
                parent_trace_id=data.get("parent_trace_id"),
                span_name=data.get("span_name"),
                input_text=data.get("input"),
                output_text=data.get("output"),
                model_name=data.get("model_name"),
                metadata=data.get("metadata"),
                latency_ms=data.get("latency_ms"),
                token_count=data.get("token_count"),
                cost=data.get("cost"),
                status=data.get("status", "success"),
                error_message=data.get("error_message"),
                created_by=user_id,
            )
            return {"log": log}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create log: {str(e)}")


async def get_logs_controller(
    organization_id: int,
    project_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """Get logs with filtering"""
    try:
        async with get_db() as db:
            logs = await crud.get_logs(
                db=db,
                organization_id=organization_id,
                project_id=project_id,
                experiment_id=experiment_id,
                status=status,
                limit=limit,
                offset=offset,
            )

            total = await crud.get_log_count(
                db=db,
                organization_id=organization_id,
                project_id=project_id,
                status=status,
            )

            return {
                "logs": logs,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")


# ==================== METRICS ====================

async def create_metric_controller(
    organization_id: int,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new metric entry"""
    try:
        async with get_db() as db:
            metric = await crud.create_metric(
                db=db,
                project_id=data.get("project_id"),
                metric_name=data.get("metric_name"),
                metric_type=data.get("metric_type"),
                value=data.get("value"),
                organization_id=organization_id,
                experiment_id=data.get("experiment_id"),
                dimensions=data.get("dimensions"),
            )
            return {"metric": metric}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create metric: {str(e)}")


async def get_metric_aggregates_controller(
    organization_id: int,
    project_id: str,
    metric_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Get aggregated statistics for a metric"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None

        async with get_db() as db:
            aggregates = await crud.get_metric_aggregates(
                db=db,
                organization_id=organization_id,
                project_id=project_id,
                metric_name=metric_name,
                start_date=start_dt,
                end_date=end_dt,
            )

            return {
                "metric_name": metric_name,
                "aggregates": aggregates,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metric aggregates: {str(e)}")


# ==================== EXPERIMENTS ====================

async def create_experiment_controller(
    organization_id: int,
    user_id: int,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new experiment"""
    try:
        print(f"📊 Controller - Creating experiment in DB...")
        print(f"   Org ID: {organization_id}")
        print(f"   User ID: {user_id}")
        print(f"   Data keys: {list(data.keys())}")
        
        async with get_db() as db:
            experiment = await crud.create_experiment(
                db=db,
                project_id=data.get("project_id"),
                name=data.get("name"),
                config=data.get("config"),
                organization_id=organization_id,
                description=data.get("description"),
                baseline_experiment_id=data.get("baseline_experiment_id"),
                created_by=user_id,
            )
            print(f"✅ Controller - Experiment created successfully")
            return {"experiment": experiment}
    except Exception as e:
        print(f"❌ Controller ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create experiment: {str(e)}")


async def get_experiment_by_id_controller(
    experiment_id: str,
    organization_id: int,
) -> Dict[str, Any]:
    """Get a specific experiment by ID"""
    try:
        async with get_db() as db:
            experiment = await crud.get_experiment_by_id(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
            )
            if not experiment:
                raise HTTPException(status_code=404, detail="Experiment not found")
            return {"experiment": experiment}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get experiment: {str(e)}")


async def get_experiments_controller(
    organization_id: int,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """Get experiments with filtering"""
    try:
        async with get_db() as db:
            experiments = await crud.get_experiments(
                db=db,
                organization_id=organization_id,
                project_id=project_id,
                status=status,
                limit=limit,
                offset=offset,
            )

            total = await crud.get_experiment_count(
                db=db,
                organization_id=organization_id,
                project_id=project_id,
            )

            return {
                "experiments": experiments,
                "total": total,
                "limit": limit,
                "offset": offset,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get experiments: {str(e)}")


async def update_experiment_controller(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
):
    """Update experiment name and/or description"""
    try:
        updated = await crud.update_experiment(
            db=db,
            experiment_id=experiment_id,
            organization_id=organization_id,
            name=name,
            description=description,
        )

        if not updated:
            raise HTTPException(status_code=404, detail="Experiment not found")

        return {"message": "Experiment updated successfully", "experiment": updated}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating experiment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update experiment: {str(e)}")


async def delete_experiment_controller(
    db: AsyncSession,
    experiment_id: str,
    organization_id: int,
):
    """Delete an experiment and all associated data"""
    try:
        deleted = await crud.delete_experiment(
            db=db,
            experiment_id=experiment_id,
            organization_id=organization_id,
        )

        if not deleted:
            raise HTTPException(status_code=404, detail="Experiment not found")

        return {"message": "Experiment deleted successfully", "id": experiment_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting experiment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment: {str(e)}")
