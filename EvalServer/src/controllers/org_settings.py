"""
Per-organization LLM Evals settings.

Arena is off by default. An organization that never saved the setting gets
Arena on only if it already has Arena comparisons, so organizations that used
Arena before the setting existed keep it. Once an Admin saves the setting, the
stored value wins.

The first time Arena is found on because of existing comparisons, that value is
saved, so deleting those comparisons later does not turn Arena off.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from crud.org_settings import (
    get_stored_arena_enabled,
    insert_arena_enabled_if_unset,
    org_has_arena_comparisons,
    upsert_arena_enabled,
)
from database.db import get_db

logger = logging.getLogger(__name__)

ARENA_DISABLED_MESSAGE = (
    "Arena is turned off for this organization. "
    "An Admin can turn it on in LLM Evals settings."
)
SETTINGS_FORBIDDEN_MESSAGE = "Only Admins can change LLM Evals settings."

# Set by the Node proxy from the caller's "organization.admin" permission. The
# proxy strips any client-supplied value, so only the proxy can set it.
MANAGE_SETTINGS_HEADER = "x-can-manage-org-settings"


def resolve_arena_enabled(stored: Optional[bool], has_comparisons: bool) -> bool:
    """Effective Arena value: the stored one, else whether the org already used Arena."""
    if stored is not None:
        return stored
    return has_comparisons


async def get_arena_setting(organization_id: int) -> Dict[str, Any]:
    """The effective Arena value and whether a value is stored for the org."""
    async with get_db() as db:
        stored = await get_stored_arena_enabled(organization_id, db)
        if stored is not None:
            return {"enabled": stored, "configured": True}
        # Nothing stored: on only if the org already has comparisons.
        has_comparisons = await org_has_arena_comparisons(organization_id, db)
        if has_comparisons:
            # Keep it on once found on, even if those comparisons are deleted.
            await insert_arena_enabled_if_unset(organization_id, True, db)
            return {"enabled": True, "configured": True}
    return {"enabled": resolve_arena_enabled(None, False), "configured": False}


async def is_arena_enabled(organization_id: int) -> bool:
    return (await get_arena_setting(organization_id))["enabled"]


async def set_arena_setting(
    organization_id: int, enabled: bool, updated_by: Optional[str]
) -> Dict[str, Any]:
    async with get_db() as db:
        await upsert_arena_enabled(organization_id, enabled, updated_by, db)
    logger.info(
        "Arena setting changed: organization_id=%s enabled=%s by user=%s",
        organization_id,
        enabled,
        updated_by,
    )
    return {"enabled": enabled, "configured": True}


def can_manage_settings(request: Request) -> bool:
    return request.headers.get(MANAGE_SETTINGS_HEADER, "").lower() == "true"


async def require_arena_enabled(request: Request) -> None:
    """Router dependency: refuse Arena requests while Arena is off for the org."""
    organization_id = getattr(request.state, "organization_id", None)
    if organization_id is None:
        raise HTTPException(status_code=400, detail="Missing organization id")
    if not await is_arena_enabled(organization_id):
        raise HTTPException(status_code=403, detail=ARENA_DISABLED_MESSAGE)
