"""
Controllers for DeepEval organizations.

Shared-schema multi-tenancy: Uses organization_id for tenant isolation.
"""
from datetime import datetime
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from database.db import get_db
from crud.deepeval_orgs import create_org, get_all_orgs, get_projects_for_org, delete_org, update_org
from typing import List, Optional


async def create_org_controller(name: str, organization_id: int) -> JSONResponse:
    try:
        org_id = f"org_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        async with get_db() as db:
            org = await create_org(org_id=org_id, name=name, organization_id=organization_id, db=db)
            await db.commit()
            if not org:
                raise HTTPException(status_code=500, detail="Failed to create organization")
            return JSONResponse(status_code=201, content={"org": org})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create organization: {e}")


async def get_all_orgs_controller(organization_id: int) -> JSONResponse:
    try:
        async with get_db() as db:
            orgs = await get_all_orgs(organization_id=organization_id, db=db)

            # Auto-create a default organization if none exists
            if not orgs:
                org_id = f"org_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
                default_org = await create_org(
                    org_id=org_id,
                    name="My Organization",
                    organization_id=organization_id,
                    db=db
                )
                await db.commit()
                if default_org:
                    orgs = [default_org]

            return JSONResponse(status_code=200, content={"orgs": orgs})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch organizations: {e}")


async def get_projects_for_org_controller(org_id: str, organization_id: int) -> JSONResponse:
    try:
        async with get_db() as db:
            ids = await get_projects_for_org(org_id=org_id, organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"projectIds": ids})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects for org: {e}")


async def update_org_controller(
    org_id: str,
    name: str,
    member_ids: Optional[List[int]],
    organization_id: int,
) -> JSONResponse:
    """
    Update an organization's name and members.
    """
    try:
        async with get_db() as db:
            org = await update_org(org_id=org_id, name=name, member_ids=member_ids, organization_id=organization_id, db=db)
            await db.commit()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        return JSONResponse(status_code=200, content={"org": org})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update organization: {e}")


async def delete_org_controller(org_id: str, organization_id: int) -> JSONResponse:
    """
    Delete an organization. For now, we allow deletion even if projects still
    reference this org; projects will simply have a dangling org_id.
    """
    try:
        async with get_db() as db:
            removed = await delete_org(org_id=org_id, organization_id=organization_id, db=db)
            await db.commit()
        if not removed:
            raise HTTPException(status_code=404, detail="Organization not found")
        # 204 No Content
        return JSONResponse(status_code=204, content=None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete organization: {e}")
