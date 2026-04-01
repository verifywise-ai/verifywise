"""
DeepEval Arena Router

Endpoints for running LLM Arena comparisons using ArenaGEval.
Based on DeepEval's LLM Arena: https://deepeval.com/docs/getting-started-llm-arena

Shared-schema multi-tenancy: Uses organization_id from request.state.
"""

from fastapi import APIRouter, BackgroundTasks, Request, Body, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
from controllers.deepeval_arena import (
    create_arena_comparison_controller,
    get_arena_comparison_status_controller,
    get_arena_comparison_results_controller,
    list_arena_comparisons_controller,
    delete_arena_comparison_controller,
)

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.post("/arena/compare")
async def create_arena_comparison(
    request: Request,
    background_tasks: BackgroundTasks,
    config_data: dict = Body(...)
):
    """
    Create and run an LLM Arena comparison.
    
    Request body:
    {
        "name": "Model Comparison Test",
        "description": "Comparing different model versions",
        "contestants": [
            {
                "name": "GPT-4 Turbo",
                "hyperparameters": {
                    "model": "gpt-4-turbo",
                    "temperature": 0.7
                },
                "testCases": [
                    {
                        "input": "What is the capital of France?",
                        "actualOutput": "Paris is the capital of France."
                    }
                ]
            },
            {
                "name": "GPT-3.5 Turbo",
                "hyperparameters": {
                    "model": "gpt-3.5-turbo",
                    "temperature": 0.7
                },
                "testCases": [
                    {
                        "input": "What is the capital of France?",
                        "actualOutput": "Paris"
                    }
                ]
            }
        ],
        "metric": {
            "name": "Helpfulness",
            "criteria": "Choose the winner based on which response is more helpful and informative",
            "evaluationParams": ["input", "actual_output"]
        },
        "judgeModel": "gpt-4o"  // Model used as judge
    }
    """
    organization_id = _get_organization_id(request)
    user_id = request.headers.get("x-user-id")
    return await create_arena_comparison_controller(
        background_tasks=background_tasks,
        config_data=config_data,
        organization_id=organization_id,
        user_id=user_id,
    )


@router.get("/arena/comparisons")
async def list_arena_comparisons(
    request: Request,
    org_id: Optional[str] = None,
):
    """
    List all arena comparisons for the current tenant.
    
    Returns:
    {
        "comparisons": [
            {
                "id": "arena_20250130_120000",
                "name": "Model Comparison Test",
                "status": "completed",
                "contestants": ["GPT-4 Turbo", "GPT-3.5 Turbo"],
                "winner": "GPT-4 Turbo",
                "createdAt": "2025-01-30T12:00:00",
                "completedAt": "2025-01-30T12:05:30"
            },
            ...
        ]
    }
    """
    organization_id = _get_organization_id(request)
    return await list_arena_comparisons_controller(organization_id=organization_id, org_id=org_id)


@router.get("/arena/comparisons/{comparison_id}")
async def get_arena_comparison_status(comparison_id: str, request: Request):
    """
    Get the status of an arena comparison.
    
    Returns:
    {
        "id": "arena_20250130_120000",
        "status": "running" | "completed" | "failed",
        "progress": "3/10 test cases evaluated",
        "createdAt": "2025-01-30T12:00:00",
        "updatedAt": "2025-01-30T12:01:30"
    }
    """
    organization_id = _get_organization_id(request)
    return await get_arena_comparison_status_controller(comparison_id, organization_id=organization_id)


@router.get("/arena/comparisons/{comparison_id}/results")
async def get_arena_comparison_results(comparison_id: str, request: Request):
    """
    Get the results of a completed arena comparison.
    
    Returns:
    {
        "id": "arena_20250130_120000",
        "name": "Model Comparison Test",
        "status": "completed",
        "metric": {
            "name": "Helpfulness",
            "criteria": "Choose the winner based on which response is more helpful"
        },
        "results": {
            "winner": "GPT-4 Turbo",
            "winCounts": {
                "GPT-4 Turbo": 7,
                "GPT-3.5 Turbo": 3
            },
            "detailedResults": [
                {
                    "testCaseIndex": 0,
                    "input": "What is the capital of France?",
                    "winner": "GPT-4 Turbo",
                    "reason": "More comprehensive and informative response"
                },
                ...
            ]
        }
    }
    """
    organization_id = _get_organization_id(request)
    return await get_arena_comparison_results_controller(comparison_id, organization_id=organization_id)


@router.delete("/arena/comparisons/{comparison_id}")
async def delete_arena_comparison(comparison_id: str, request: Request):
    """
    Delete an arena comparison.
    
    Returns:
    {
        "message": "Arena comparison deleted successfully",
        "id": "arena_20250130_120000"
    }
    """
    organization_id = _get_organization_id(request)
    return await delete_arena_comparison_controller(comparison_id, organization_id=organization_id)

