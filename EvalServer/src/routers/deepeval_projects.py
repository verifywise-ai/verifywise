"""
DeepEval Projects Router

API endpoints for managing DeepEval projects.
Shared-schema multi-tenancy: Uses organization_id from request.state.
"""

from fastapi import APIRouter, Request, Body, HTTPException
from controllers.deepeval_projects import (
    create_project_controller,
    get_all_projects_controller,
    get_project_controller,
    update_project_controller,
    delete_project_controller,
    get_project_stats_controller,
)

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.post("/projects")
async def create_project(request: Request, project_data: dict = Body(...)):
    """
    Create a new DeepEval project.

    Request body:
    {
        "name": "Coding Tasks Evaluation",
        "description": "Evaluating model performance on coding tasks",
        "useCase": "chatbot"
    }
    """
    organization_id = _get_organization_id(request)

    # Add user_id from headers if not in payload
    if "createdBy" not in project_data:
        user_id = request.headers.get("x-user-id")
        if user_id:
            project_data["createdBy"] = user_id
    return await create_project_controller(
        project_data=project_data,
        organization_id=organization_id
    )


@router.get("/projects")
async def get_all_projects(request: Request):
    """
    Get all DeepEval projects for the current organization.
    """
    organization_id = _get_organization_id(request)
    return await get_all_projects_controller(organization_id=organization_id)


@router.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    """
    Get a specific project by ID.
    """
    organization_id = _get_organization_id(request)
    return await get_project_controller(
        project_id=project_id,
        organization_id=organization_id
    )


@router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    request: Request,
    project_data: dict = Body(...)
):
    """
    Update an existing project.
    """
    organization_id = _get_organization_id(request)
    return await update_project_controller(
        project_id=project_id,
        project_data=project_data,
        organization_id=organization_id
    )


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    """
    Delete a project and all its associated experiments.
    """
    organization_id = _get_organization_id(request)
    return await delete_project_controller(
        project_id=project_id,
        organization_id=organization_id
    )


@router.get("/projects/{project_id}/stats")
async def get_project_stats(project_id: str, request: Request):
    """
    Get project statistics (number of experiments, avg metrics, etc.).
    """
    organization_id = _get_organization_id(request)
    return await get_project_stats_controller(
        project_id=project_id,
        organization_id=organization_id
    )
