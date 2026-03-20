"""
DeepEval Router

Endpoints for running DeepEval LLM evaluations.
Shared-schema multi-tenancy: Uses organization_id from request.state.
"""

from fastapi import APIRouter, BackgroundTasks, Request, Body, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pathlib import Path
import json
from controllers.deepeval import (
    create_deepeval_evaluation_controller,
    get_deepeval_evaluation_status_controller,
    get_deepeval_evaluation_results_controller,
    get_all_deepeval_evaluations_controller,
    delete_deepeval_evaluation_controller,
    get_available_deepeval_metrics_controller,
    get_evaluation_dataset_info_controller,
    upload_deepeval_dataset_controller,
    list_deepeval_datasets_controller,
    read_deepeval_dataset_controller,
    list_user_datasets_controller,
    delete_user_datasets_controller,
    list_deepeval_scorers_controller,
    create_deepeval_scorer_controller,
    update_deepeval_scorer_controller,
    delete_deepeval_scorer_controller,
    test_deepeval_scorer_controller,
    list_deepeval_models_controller,
    create_deepeval_model_controller,
    update_deepeval_model_controller,
    delete_deepeval_model_controller,
    get_latest_model_controller,
    get_latest_scorer_controller,
    _get_uploads_root,
)

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.post("/evaluate")
async def create_deepeval_evaluation(
    request: Request,
    background_tasks: BackgroundTasks,
    config_data: dict = Body(...)
):
    """
    Create and run a DeepEval evaluation.

    Request body:
    {
        "model": {
            "name": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
            "provider": "huggingface",
            "generation": {
                "max_tokens": 500,
                "temperature": 0.7
            }
        },
        "dataset": {
            "use_builtin": true,
            "categories": ["coding", "mathematics"],  // optional
            "difficulties": ["easy", "medium"],  // optional
            "limit": 10  // optional
        },
        "metrics": {
            "answer_relevancy": true,
            "bias": true,
            "toxicity": true,
            "faithfulness": false,
            "hallucination": false,
            "contextual_relevancy": false
        },
        "metric_thresholds": {
            "answer_relevancy": 0.5,
            "bias": 0.5,
            "toxicity": 0.5
        },
        "selectedScorers": ["scorer_id_1", "scorer_id_2"]  // optional - if not specified, all enabled scorers will run
    }
    """
    organization_id = _get_organization_id(request)
    return await create_deepeval_evaluation_controller(
        background_tasks=background_tasks,
        config_data=config_data,
        organization_id=organization_id
    )


@router.get("/evaluate/status/{eval_id}")
async def get_evaluation_status(eval_id: str, request: Request):
    """
    Get the status of a DeepEval evaluation.
    
    Returns:
    {
        "eval_id": "deepeval_20250130_120000",
        "status": "running" | "completed" | "failed",
        "progress": "3/10 prompts evaluated",
        "created_at": "2025-01-30T12:00:00",
        "updated_at": "2025-01-30T12:01:30"
    }
    """
    organization_id = _get_organization_id(request)
    return await get_deepeval_evaluation_status_controller(
        eval_id,
        organization_id
    )


@router.get("/evaluate/results/{eval_id}")
async def get_evaluation_results(eval_id: str, request: Request):
    """
    Get the results of a completed DeepEval evaluation.
    
    Returns:
    {
        "eval_id": "deepeval_20250130_120000",
        "status": "completed",
        "results": {
            "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
            "total_samples": 10,
            "metric_summaries": {
                "answer_relevancy": {
                    "average_score": 0.745,
                    "pass_rate": 80.0,
                    "min_score": 0.267,
                    "max_score": 1.0
                },
                "bias": {...},
                "toxicity": {...}
            },
            "category_breakdown": {...},
            "detailed_results": [...]
        }
    }
    """
    organization_id = _get_organization_id(request)
    return await get_deepeval_evaluation_results_controller(
        eval_id,
        organization_id
    )


@router.get("/evaluations")
async def get_all_evaluations(request: Request):
    """
    Get all DeepEval evaluations for the current tenant.
    
    Returns:
    {
        "evaluations": [
            {
                "eval_id": "deepeval_20250130_120000",
                "status": "completed",
                "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
                "total_samples": 10,
                "created_at": "2025-01-30T12:00:00",
                "completed_at": "2025-01-30T12:05:30"
            },
            ...
        ]
    }
    """
    organization_id = _get_organization_id(request)
    return await get_all_deepeval_evaluations_controller(
        organization_id
    )


@router.delete("/evaluations/{eval_id}")
async def delete_evaluation(eval_id: str, request: Request):
    """
    Delete a DeepEval evaluation and its results.
    
    Returns:
    {
        "message": "Evaluation deleted successfully",
        "eval_id": "deepeval_20250130_120000"
    }
    """
    organization_id = _get_organization_id(request)
    return await delete_deepeval_evaluation_controller(
        eval_id,
        organization_id
    )


@router.get("/metrics/available")
async def get_available_metrics():
    """
    Get list of available DeepEval metrics.
    
    Returns:
    {
        "metrics": [
            {
                "name": "answer_relevancy",
                "description": "Measures if the answer is relevant to the input",
                "requires_context": false,
                "requires_openai_key": true
            },
            ...
        ]
    }
    """
    return await get_available_deepeval_metrics_controller()


@router.get("/dataset/info")
async def get_dataset_info():
    """
    Get information about the evaluation dataset.
    
    Returns:
    {
        "total_prompts": 20,
        "categories": ["coding", "mathematics", "reasoning", ...],
        "difficulties": ["easy", "medium", "hard"],
        "category_counts": {
            "coding": 3,
            "mathematics": 3,
            ...
        }
    }
    """
    return await get_evaluation_dataset_info_controller()


@router.post("/datasets/upload")
async def upload_dataset(
    request: Request, 
    dataset: UploadFile = File(...),
    dataset_type: str = Form("chatbot"),
    turn_type: str = Form("single-turn"),
    org_id: str = Form()
):
    """
    Upload a custom JSON dataset to be used in evaluations.
    
    Returns:
    {
        "message": "Dataset uploaded successfully",
        "path": "data/uploads/{tenant}/{filename}.json",
        "filename": "{filename}.json",
        "size": 12345,
        "tenant": "default",
        "datasetType": "chatbot",
        "turnType": "single-turn"
    }
    """
    # Extract user_id from headers for created_by tracking
    organization_id = _get_organization_id(request)
    user_id = request.headers.get("x-user-id")
    return await upload_deepeval_dataset_controller(
        dataset=dataset,
        organization_id=organization_id,
        org_id=org_id,
        dataset_type=dataset_type,
        turn_type=turn_type,
        user_id=user_id,
    )

@router.get("/datasets/list")
async def list_datasets():
    """
    List available built-in datasets grouped by use case.
    """
    return await list_deepeval_datasets_controller()

@router.get("/datasets/read")
async def read_dataset(path: str):
    """
    Read and return the JSON content of a dataset file by relative path.
    Example: /deepeval/datasets/read?path=chatbot/chatbot_basic.json
    """
    return await read_deepeval_dataset_controller(path)

@router.get("/datasets/uploads")
async def list_uploaded_datasets(request: Request):
    """
    List uploaded JSON datasets for the current organization.
    Docker: /app/data/uploads/{organization_id}
    Local: EvaluationModule/data/uploads/{organization_id}
    """
    try:
        organization_id = _get_organization_id(request)
        uploads_root = _get_uploads_root()
        uploads_dir = uploads_root / str(organization_id)
        uploads = []
        if uploads_dir.is_dir():
            for p in uploads_dir.glob("*.json"):
                stat = p.stat()
                uploads.append({
                    "name": p.name,
                    "path": str((Path("data") / "uploads" / str(organization_id) / p.name).as_posix()),
                    "size": stat.st_size,
                    "modifiedAt": stat.st_mtime,
                })
        return JSONResponse(status_code=200, content={"uploads": uploads})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list uploads: {e}")

@router.get("/datasets/user")
async def list_user_datasets(request: Request, org_id: str | None = None):
    """
    List user-uploaded datasets from DB for the current organization.
    Optionally filter by org_id.
    """
    organization_id = _get_organization_id(request)
    return await list_user_datasets_controller(organization_id=organization_id, org_id=org_id)

@router.delete("/datasets/user")
async def delete_user_datasets(request: Request):
    """
    Delete user-uploaded datasets from DB and filesystem for the current organization.
    Expects JSON body with {"paths": ["path1", "path2", ...]}
    """
    organization_id = _get_organization_id(request)
    body = await request.json()
    paths = body.get("paths", [])
    return await delete_user_datasets_controller(organization_id=organization_id, paths=paths)


# ==================== SCORERS ====================

@router.get("/scorers")
async def list_scorers_endpoint(request: Request, org_id: str | None = None):
    """
    List scorer definitions for the current organization (optionally for a single project).
    """
    organization_id = _get_organization_id(request)
    return await list_deepeval_scorers_controller(organization_id=organization_id, org_id=org_id)


@router.post("/scorers")
async def create_scorer_endpoint(request: Request, payload: dict = Body(...)):
    """
    Create a new scorer definition.
    """
    organization_id = _get_organization_id(request)
    # Add user_id from headers if not already in payload
    if "createdBy" not in payload:
        user_id = request.headers.get("x-user-id")
        if user_id:
            payload["createdBy"] = user_id
    return await create_deepeval_scorer_controller(organization_id=organization_id, payload=payload)


@router.put("/scorers/{scorer_id}")
async def update_scorer_endpoint(request: Request, scorer_id: str, payload: dict = Body(...)):
    """
    Update an existing scorer definition.
    """
    organization_id = _get_organization_id(request)
    return await update_deepeval_scorer_controller(scorer_id, organization_id=organization_id, payload=payload)


@router.delete("/scorers/{scorer_id}")
async def delete_scorer_endpoint(request: Request, scorer_id: str):
    """
    Delete a scorer definition.
    """
    organization_id = _get_organization_id(request)
    return await delete_deepeval_scorer_controller(scorer_id, organization_id=organization_id)


@router.post("/scorers/{scorer_id}/test")
async def test_scorer_endpoint(request: Request, scorer_id: str, payload: dict = Body(...)):
    """
    Test a scorer with sample input/output.

    Expected payload:
    {
      "input": "The source text...",
      "output": "The model's output...",
      "expected": "Optional expected output..."
    }
    """
    organization_id = _get_organization_id(request)
    return await test_deepeval_scorer_controller(scorer_id, organization_id=organization_id, payload=payload)


# ==================== MODELS ====================

@router.get("/models")
async def list_models_endpoint(request: Request, org_id: str | None = None):
    """
    List saved model configurations for the current organization.
    """
    organization_id = _get_organization_id(request)
    return await list_deepeval_models_controller(organization_id=organization_id, org_id=org_id)


@router.post("/models")
async def create_model_endpoint(request: Request, payload: dict = Body(...)):
    """
    Create a new saved model configuration.
    """
    organization_id = _get_organization_id(request)
    # Add user_id from headers if not already in payload
    if "createdBy" not in payload:
        user_id = request.headers.get("x-user-id")
        if user_id:
            payload["createdBy"] = user_id
    return await create_deepeval_model_controller(organization_id=organization_id, payload=payload)


@router.put("/models/{model_id}")
async def update_model_endpoint(request: Request, model_id: str, payload: dict = Body(...)):
    """
    Update an existing saved model configuration.
    """
    organization_id = _get_organization_id(request)
    return await update_deepeval_model_controller(model_id, organization_id=organization_id, payload=payload)


@router.delete("/models/{model_id}")
async def delete_model_endpoint(request: Request, model_id: str):
    """
    Delete a saved model configuration.
    """
    organization_id = _get_organization_id(request)
    return await delete_deepeval_model_controller(model_id, organization_id=organization_id)


# ==================== LATEST MODEL/SCORER FOR EXPERIMENTS ====================

@router.get("/models/latest")
async def get_latest_model_endpoint(request: Request, org_id: str | None = None):
    """
    Get the most recently added/updated model configuration.
    Used for auto-populating experiment forms.
    """
    organization_id = _get_organization_id(request)
    return await get_latest_model_controller(organization_id=organization_id, org_id=org_id)


@router.get("/scorers/latest")
async def get_latest_scorer_endpoint(request: Request, org_id: str | None = None):
    """
    Get the most recently added/updated scorer (judge) configuration.
    Used for auto-populating experiment forms.
    """
    organization_id = _get_organization_id(request)
    return await get_latest_scorer_controller(organization_id=organization_id, org_id=org_id)
