"""
DeepEval organization settings router.

GET  /deepeval/settings/arena  any member of the organization
PUT  /deepeval/settings/arena  only callers the Node proxy marked as holding
                               the "organization.admin" permission

Shared-schema multi-tenancy: uses organization_id from request.state.
"""

from fastapi import APIRouter, HTTPException, Request

from controllers.org_settings import (
    SETTINGS_FORBIDDEN_MESSAGE,
    can_manage_settings,
    get_arena_setting,
    set_arena_setting,
)
from request_schemas import UpdateArenaSettingRequest

router = APIRouter()


def _get_organization_id(request: Request) -> int:
    """Extract organization_id from request state (set by middleware)."""
    org_id = getattr(request.state, "organization_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


@router.get("/settings/arena")
async def read_arena_setting(request: Request):
    """
    Returns ``{"enabled": bool, "configured": bool}``. ``configured`` is false
    while no Admin has saved the setting; ``enabled`` is then true only if the
    organization already has Arena comparisons.
    """
    organization_id = _get_organization_id(request)
    return await get_arena_setting(organization_id)


@router.put("/settings/arena")
async def update_arena_setting(request: Request, body: UpdateArenaSettingRequest):
    """Turn Arena on or off for the organization. Admins only."""
    organization_id = _get_organization_id(request)
    if not can_manage_settings(request):
        raise HTTPException(status_code=403, detail=SETTINGS_FORBIDDEN_MESSAGE)
    user_id = getattr(request.state, "user_id", None)
    return await set_arena_setting(
        organization_id, body.enabled, str(user_id) if user_id is not None else None
    )
