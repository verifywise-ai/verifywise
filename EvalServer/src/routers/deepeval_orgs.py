"""
DeepEval Orgs Router

Shared-schema multi-tenancy: Uses organization_id from request.state.
"""
from fastapi import APIRouter, Request, Body, HTTPException
from controllers.deepeval_orgs import (
    create_org_controller,
    get_all_orgs_controller,
    get_projects_for_org_controller,
    delete_org_controller,
    update_org_controller,
)

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.get("/orgs")
async def list_orgs(request: Request):
    organization_id = _get_organization_id(request)
    return await get_all_orgs_controller(organization_id=organization_id)


@router.post("/orgs")
async def create_org(request: Request, body: dict = Body(...)):
    organization_id = _get_organization_id(request)
    name = body.get("name", "").strip()
    return await create_org_controller(name=name, organization_id=organization_id)


@router.get("/orgs/{org_id}/projects")
async def org_projects(org_id: str, request: Request):
    organization_id = _get_organization_id(request)
    return await get_projects_for_org_controller(org_id=org_id, organization_id=organization_id)


@router.put("/orgs/{org_id}")
async def update_org(org_id: str, request: Request, body: dict = Body(...)):
    """
    Update an organization.
    """
    organization_id = _get_organization_id(request)
    name = body.get("name", "").strip()
    member_ids = body.get("member_ids", None)
    return await update_org_controller(
        org_id=org_id,
        name=name,
        member_ids=member_ids,
        organization_id=organization_id
    )


@router.delete("/orgs/{org_id}")
async def delete_org(org_id: str, request: Request):
    """
    Delete an organization.
    """
    organization_id = _get_organization_id(request)
    return await delete_org_controller(org_id=org_id, organization_id=organization_id)
