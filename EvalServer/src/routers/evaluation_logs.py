"""
API routes for evaluation logs, metrics, and experiments

Shared-schema multi-tenancy: Uses organization_id from request.state.
"""

from fastapi import APIRouter, Query, Path, Request, HTTPException
from fastapi.responses import JSONResponse
import os
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from sqlalchemy import text

from controllers import evaluation_logs as controller
from database.db import get_db


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


# ==================== MODEL API KEY VALIDATION ====================

# Map of model providers to their required environment variables
PROVIDER_API_KEY_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "xai": "XAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "ollama": None,  # Ollama doesn't require an API key
    "huggingface": None,  # HuggingFace can run locally without API key
}

# Map of known model name patterns to providers
MODEL_TO_PROVIDER = {
    # OpenAI models
    "gpt-4": "openai",
    "gpt-3.5": "openai",
    "o1": "openai",
    "o3": "openai",
    # Anthropic models
    "claude": "anthropic",
    # Google models
    "gemini": "google",
    # Mistral models
    "mistral": "mistral",
    "mixtral": "mistral",
    "codestral": "mistral",
    "pixtral": "mistral",
    # xAI models
    "grok": "xai",
}


def detect_provider_from_model(model_name: str) -> Optional[str]:
    """Detect the provider from a model name."""
    if not model_name:
        return None
    model_lower = model_name.lower()
    for pattern, provider in MODEL_TO_PROVIDER.items():
        if pattern in model_lower:
            return provider
    return None


def check_api_key_available(provider: str) -> bool:
    """Check if the API key for a provider is available in environment variables."""
    if provider not in PROVIDER_API_KEY_MAP:
        return True  # Unknown provider, assume it's fine

    env_var = PROVIDER_API_KEY_MAP.get(provider)
    if env_var is None:
        return True  # No API key required

    return bool(os.getenv(env_var))


def check_openrouter_available() -> bool:
    """Check if OpenRouter is configured as a fallback."""
    return bool(os.getenv("OPENROUTER_API_KEY"))


async def check_db_api_key_available(organization_id: int, provider: str) -> bool:
    """Check if the API key for a provider is stored in the database."""
    try:
        async with get_db() as db:
            result = await db.execute(
                text('SELECT COUNT(*) FROM llm_evals_api_keys WHERE organization_id = :organization_id AND provider = :provider'),
                {"organization_id": organization_id, "provider": provider}
            )
            row = result.fetchone()
            return row[0] > 0 if row else False
    except Exception as e:
        print(f"Error checking DB for API key: {e}")
        return False


async def check_db_openrouter_available(organization_id: int) -> bool:
    """Check if OpenRouter is configured in the database as a fallback."""
    return await check_db_api_key_available(organization_id, "openrouter")


# ==================== REQUEST MODELS ====================

class CreateLogRequest(BaseModel):
    project_id: str
    experiment_id: Optional[str] = None
    trace_id: Optional[str] = None
    parent_trace_id: Optional[str] = None
    span_name: Optional[str] = None
    input: Optional[str] = None
    output: Optional[str] = None
    model_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    latency_ms: Optional[int] = None
    token_count: Optional[int] = None
    cost: Optional[float] = None
    status: Optional[str] = "success"
    error_message: Optional[str] = None


class CreateMetricRequest(BaseModel):
    project_id: str
    experiment_id: Optional[str] = None
    metric_name: str
    metric_type: str  # performance, quality, system
    value: float
    dimensions: Optional[Dict[str, Any]] = None


class CreateExperimentRequest(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    config: Dict[str, Any]  # Contains model, dataset, metrics config
    baseline_experiment_id: Optional[str] = None


class UpdateExperimentStatusRequest(BaseModel):
    status: str  # pending, running, completed, failed
    results: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


# ==================== ROUTER SETUP ====================

router = APIRouter(prefix="/deepeval", tags=["Evaluation Logs & Monitoring"])


# ==================== MODEL VALIDATION ENDPOINT ====================

class ValidateModelRequest(BaseModel):
    model_name: str
    provider: Optional[str] = None  # If not provided, will be auto-detected


@router.post("/models/validate")
async def validate_model_api_key(request: Request, payload: ValidateModelRequest):
    """
    Validate that the required API key is available for a model.

    Checks both environment variables AND the database for stored API keys.

    Returns:
    {
        "valid": true/false,
        "model_name": "mistral-large-latest",
        "provider": "mistral",
        "has_api_key": true/false,
        "has_openrouter_fallback": true/false,
        "error_message": "MISTRAL_API_KEY not configured" (if invalid)
    }
    """
    model_name = payload.model_name
    provider = payload.provider
    organization_id = _get_organization_id(request)

    # Auto-detect provider if not provided
    if not provider:
        provider = detect_provider_from_model(model_name)

    if not provider:
        # Unknown provider - can't validate, assume it's fine
        has_openrouter_env = check_openrouter_available()
        has_openrouter_db = await check_db_openrouter_available(organization_id)
        return JSONResponse(content={
            "valid": True,
            "model_name": model_name,
            "provider": None,
            "has_api_key": True,
            "has_openrouter_fallback": has_openrouter_env or has_openrouter_db,
            "error_message": None,
        })

    # Check both environment variables and database for API keys
    has_api_key_env = check_api_key_available(provider)
    has_api_key_db = await check_db_api_key_available(organization_id, provider)
    has_api_key = has_api_key_env or has_api_key_db

    has_openrouter_env = check_openrouter_available()
    has_openrouter_db = await check_db_openrouter_available(organization_id)
    has_openrouter = has_openrouter_env or has_openrouter_db

    # Model is valid if it has its API key OR OpenRouter is available as fallback
    # Note: OpenRouter can proxy to many models but not all (e.g., not ollama/huggingface local)
    is_valid = has_api_key or (has_openrouter and provider in ["openai", "anthropic", "google", "mistral"])

    env_var = PROVIDER_API_KEY_MAP.get(provider)
    error_message = None
    if not is_valid:
        if env_var:
            error_message = f"{env_var} is not configured. Please add your API key in settings or enable OpenRouter."
        else:
            error_message = f"API key for provider '{provider}' is not configured."

    return JSONResponse(content={
        "valid": is_valid,
        "model_name": model_name,
        "provider": provider,
        "has_api_key": has_api_key,
        "has_openrouter_fallback": has_openrouter,
        "error_message": error_message,
    })


# ==================== LOGS ENDPOINTS ====================

@router.post("/logs")
async def create_log(
    request: Request,
    log_data: CreateLogRequest,
):
    """Create a new evaluation log entry"""
    return await controller.create_log_controller(
        organization_id=_get_organization_id(request),
        user_id=int(request.headers.get("x-user-id", 0)),
        data=log_data.dict(),
    )


@router.get("/logs")
async def get_logs(
    request: Request,
    project_id: Optional[str] = Query(None),
    experiment_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Get logs with optional filtering"""
    return await controller.get_logs_controller(
        organization_id=_get_organization_id(request),
        project_id=project_id,
        experiment_id=experiment_id,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/{log_id}")
async def get_log(
    request: Request,
    log_id: str = Path(...),
):
    """Get a specific log by ID"""
    # Placeholder - implement if needed
    return {"message": "Log details endpoint - implement if needed"}


@router.get("/logs/trace/{trace_id}")
async def get_trace(
    request: Request,
    trace_id: str = Path(...),
):
    """Get all logs for a specific trace"""
    # Placeholder - implement if needed
    return {"message": "Trace logs endpoint - implement if needed"}


# ==================== METRICS ENDPOINTS ====================

@router.post("/metrics")
async def create_metric(
    request: Request,
    metric_data: CreateMetricRequest,
):
    """Create a new metric entry"""
    return await controller.create_metric_controller(
        organization_id=_get_organization_id(request),
        data=metric_data.dict(),
    )


@router.get("/metrics")
async def get_metrics(
    request: Request,
):
    """Get metrics with optional filtering"""
    # Placeholder - implement if needed
    return {"message": "Metrics list endpoint - implement if needed"}


@router.get("/metrics/aggregates")
async def get_metric_aggregates(
    request: Request,
    project_id: str = Query(...),
    metric_name: str = Query(...),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Get aggregated statistics for a metric"""
    return await controller.get_metric_aggregates_controller(
        organization_id=_get_organization_id(request),
        project_id=project_id,
        metric_name=metric_name,
        start_date=start_date,
        end_date=end_date,
    )


# ==================== EXPERIMENTS ENDPOINTS ====================

@router.post("/experiments")
async def create_experiment(
    request: Request,
    experiment_data: CreateExperimentRequest,
):
    """Create a new experiment"""
    print(f"\n{'='*70}")
    print(f"📝 Creating experiment: {experiment_data.name}")
    print(f"   Project ID: {experiment_data.project_id}")
    print(f"   Org ID: {getattr(request.state, 'organization_id', 'unknown')}")
    print(f"   User ID: {request.headers.get('x-user-id', 0)}")
    print(f"{'='*70}\n")
    
    try:
        result = await controller.create_experiment_controller(
            organization_id=_get_organization_id(request),
            user_id=int(request.headers.get("x-user-id", 0)),
            data=experiment_data.dict(),
        )
        
        print(f"✅ Experiment created: {result.get('experiment', {}).get('id')}")
        
        # Auto-run the evaluation in the background
        experiment_id = result.get("experiment", {}).get("id")
        if experiment_id:
            import asyncio
            from database.db import get_db
            from utils.run_evaluation import run_evaluation
            
            print(f"🚀 Starting background evaluation task...")
            
            # Run evaluation in background
            asyncio.create_task(run_evaluation_task(
                experiment_id=experiment_id,
                config=experiment_data.config,
                organization_id=_get_organization_id(request),
            ))
        
        return result
    except Exception as e:
        print(f"❌ ERROR creating experiment: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


async def run_evaluation_task(experiment_id: str, config: Dict, organization_id: int):
    """Background task: run evaluation in a non-blocking subprocess and stream logs asynchronously."""
    import sys
    import json
    from pathlib import Path
    import asyncio

    try:
        from database.db import get_db
        from crud import evaluation_logs as crud

        async with get_db() as db:
            # Update status to running
            await crud.update_experiment_status(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
                status="running",
            )
        
        # Run evaluation in subprocess to avoid uvloop conflict with DeepEval
        print("🚀 Starting evaluation in subprocess (streaming logs)...")

        script_path = Path(__file__).parent.parent / "utils" / "run_evaluation_subprocess.py"
        python_executable = sys.executable

        # Prepare arguments
        eval_args = json.dumps({
            "experiment_id": experiment_id,
            "config": config,
            "organization_id": organization_id,
        })

        # Async subprocess with piped output (non-blocking)
        env = dict(**os.environ)
        env["PYTHONUNBUFFERED"] = "1"

        proc = await asyncio.create_subprocess_exec(
            python_executable,
            "-u",
            str(script_path),
            eval_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )

        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            print(f"[eval:{experiment_id}] {line.decode().rstrip()}")

        return_code = await proc.wait()

        if return_code == 0:
            print("✅ Evaluation subprocess completed successfully")
        else:
            raise Exception(f"Evaluation subprocess failed with code {return_code}")
            
    except Exception as e:
        print(f"❌ Background evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Update experiment status to failed
        try:
            from database.db import get_db
            from crud import evaluation_logs as crud
            
            async with get_db() as db:
                await crud.update_experiment_status(
                    db=db,
                    experiment_id=experiment_id,
                    organization_id=organization_id,
                    status="failed",
                    error_message=str(e)
                )
        except Exception as update_err:
            print(f"Failed to update experiment status: {update_err}")


@router.get("/experiments")
async def get_experiments(
    request: Request,
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Get experiments with optional filtering"""
    return await controller.get_experiments_controller(
        organization_id=_get_organization_id(request),
        project_id=project_id,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/experiments/all")
async def get_all_experiments(
    request: Request,
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """Get all experiments (no pagination) for optional project/status filters"""
    # Use a high limit to return all in one response
    return await controller.get_experiments_controller(
        organization_id=_get_organization_id(request),
        project_id=project_id,
        status=status,
        limit=10000,
        offset=0,
    )


@router.get("/experiments/{experiment_id}")
async def get_experiment(
    request: Request,
    experiment_id: str = Path(...),
):
    """Get a specific experiment by ID"""
    return await controller.get_experiment_by_id_controller(
        experiment_id=experiment_id,
        organization_id=_get_organization_id(request),
    )


@router.patch("/experiments/{experiment_id}")
async def update_experiment(
    request: Request,
    experiment_id: str = Path(...),
    name: Optional[str] = None,
    description: Optional[str] = None,
):
    """Update experiment name and/or description"""
    from database.db import get_db
    from crud import evaluation_logs as crud

    organization_id = _get_organization_id(request)

    # Parse request body
    body = await request.json()
    name = body.get("name")
    description = body.get("description")

    if name is None and description is None:
        raise HTTPException(status_code=400, detail="Must provide at least one field to update (name or description)")

    async with get_db() as db:
        return await controller.update_experiment_controller(
            db=db,
            experiment_id=experiment_id,
            organization_id=organization_id,
            name=name,
            description=description,
        )


@router.put("/experiments/{experiment_id}/status")
async def update_experiment_status(
    request: Request,
    experiment_id: str = Path(...),
    status_data: UpdateExperimentStatusRequest = None,
):
    """Update experiment status and results"""
    # Placeholder - implement if needed
    return {"message": "Update experiment status endpoint - implement if needed"}


@router.delete("/experiments/{experiment_id}")
async def delete_experiment(
    request: Request,
    experiment_id: str = Path(...),
):
    """Delete an experiment and all associated logs"""
    organization_id = _get_organization_id(request)

    from database.db import get_db
    from controllers import evaluation_logs as controllers

    async with get_db() as db:
        return await controllers.delete_experiment_controller(
            db=db,
            experiment_id=experiment_id,
            organization_id=organization_id,
        )


# ==================== MONITOR DASHBOARD ENDPOINT ====================

@router.get("/projects/{project_id}/monitor/dashboard")
async def get_monitor_dashboard(
    request: Request,
    project_id: str = Path(...),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Get monitoring dashboard data for a project"""
    try:
        from datetime import datetime, timedelta
        from crud import evaluation_logs as crud
        from database.db import get_db

        organization_id = _get_organization_id(request)

        # Default to last 24 hours if no dates provided
        if not end_date:
            end_dt = datetime.now()
        else:
            end_dt = datetime.fromisoformat(end_date)

        if not start_date:
            start_dt = end_dt - timedelta(hours=24)
        else:
            start_dt = datetime.fromisoformat(start_date)

        async with get_db() as db:
            # Get metrics overview
            metric_names = ["latency", "token_count", "cost", "score_average"]
            metrics_data = {}

            for metric_name in metric_names:
                aggregates = await crud.get_metric_aggregates(
                    db=db,
                    organization_id=organization_id,
                    project_id=project_id,
                    metric_name=metric_name,
                    start_date=start_dt,
                    end_date=end_dt,
                )
                metrics_data[metric_name] = aggregates

            # Get log counts by status
            total_logs = await crud.get_log_count(db=db, organization_id=organization_id, project_id=project_id)
            success_logs = await crud.get_log_count(db=db, organization_id=organization_id, project_id=project_id, status="success")
            error_logs = await crud.get_log_count(db=db, organization_id=organization_id, project_id=project_id, status="error")

            # Get recent experiments
            experiments = await crud.get_experiments(db=db, organization_id=organization_id, project_id=project_id, limit=10)
            
            return {
                "project_id": project_id,
                "time_range": {
                    "start": start_dt.isoformat(),
                    "end": end_dt.isoformat(),
                },
                "metrics": metrics_data,
                "logs": {
                    "total": total_logs,
                    "success": success_logs,
                    "error": error_logs,
                    "error_rate": (error_logs / total_logs * 100) if total_logs > 0 else 0,
                },
                "recent_experiments": experiments,
            }
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard data: {str(e)}")

