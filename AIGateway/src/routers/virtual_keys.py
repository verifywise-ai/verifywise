from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, status

from crud.virtual_keys import (
    create_virtual_key,
    delete_virtual_key,
    get_all_virtual_keys,
    revoke_virtual_key,
    update_virtual_key,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

router = APIRouter(prefix="/virtual-keys", tags=["virtual-keys"])


# ---------------------------------------------------------------------------
# GET /virtual-keys/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_virtual_keys(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)

    keys = await get_all_virtual_keys(org_id)
    return {"status": "success", "data": keys}


# ---------------------------------------------------------------------------
# POST /virtual-keys/
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_key(request: Request):
    verify_internal_key(request)
    require_admin(request)

    body: dict[str, Any] = await request.json()

    # Validate name
    name = body.get("name")
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name is required",
        )
    if not isinstance(name, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name must be a string",
        )
    if len(name) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name must be 255 characters or fewer",
        )

    # Validate expires_at if provided
    expires_at: Optional[datetime] = None
    if "expires_at" in body and body["expires_at"] is not None:
        try:
            expires_at = datetime.fromisoformat(str(body["expires_at"]).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at must be a valid ISO 8601 datetime string",
            )

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    data = {
        "name": name,
        "allowed_endpoint_ids": body.get("allowed_endpoint_ids") or [],
        "max_budget_usd": body.get("max_budget_usd"),
        "rate_limit_rpm": body.get("rate_limit_rpm"),
        "metadata": body.get("metadata"),
        "expires_at": expires_at,
        "created_by": user_id,
    }

    record = await create_virtual_key(org_id, data)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create virtual key",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "created",
            "entity_type": "virtual_key",
            "entity_id": str(record["id"]),
            "entity_name": name,
        },
    )

    return {
        "status": "success",
        "data": {
            **record,
            "plain_key": record["plain_key"],
        },
    }


# ---------------------------------------------------------------------------
# PATCH /virtual-keys/{key_id}
# ---------------------------------------------------------------------------

@router.patch("/{key_id}", status_code=status.HTTP_200_OK)
async def update_key(key_id: int, request: Request):
    verify_internal_key(request)
    require_admin(request)

    body: dict[str, Any] = await request.json()
    updates: dict[str, Any] = {}

    # name
    if "name" in body:
        name = body["name"]
        if not isinstance(name, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="name must be a string",
            )
        if len(name) > 255:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="name must be 255 characters or fewer",
            )
        updates["name"] = name

    # allowed_endpoint_ids
    if "allowed_endpoint_ids" in body:
        ids = body["allowed_endpoint_ids"]
        if not isinstance(ids, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_endpoint_ids must be an array",
            )
        if not all(isinstance(i, int) for i in ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_endpoint_ids must be an array of integers",
            )
        updates["allowed_endpoint_ids"] = ids

    # max_budget_usd
    if "max_budget_usd" in body:
        value = body["max_budget_usd"]
        if value is not None and not isinstance(value, (int, float)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_budget_usd must be a number",
            )
        updates["max_budget_usd"] = value

    # rate_limit_rpm
    if "rate_limit_rpm" in body:
        value = body["rate_limit_rpm"]
        if value is not None and not isinstance(value, int):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rate_limit_rpm must be an integer",
            )
        updates["rate_limit_rpm"] = value

    # metadata
    if "metadata" in body:
        value = body["metadata"]
        if value is not None and not isinstance(value, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="metadata must be an object",
            )
        updates["metadata"] = value

    # expires_at
    if "expires_at" in body:
        raw = body["expires_at"]
        if raw is None:
            updates["expires_at"] = None
        else:
            try:
                updates["expires_at"] = datetime.fromisoformat(
                    str(raw).replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="expires_at must be a valid ISO 8601 datetime string",
                )

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    record = await update_virtual_key(org_id, key_id, updates)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Virtual key not found or no fields to update",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "updated",
            "entity_type": "virtual_key",
            "entity_id": str(key_id),
            "entity_name": record.get("name", ""),
        },
    )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# POST /virtual-keys/{key_id}/revoke
# ---------------------------------------------------------------------------

@router.post("/{key_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_key(key_id: int, request: Request):
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    revoked = await revoke_virtual_key(org_id, key_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Virtual key not found or already revoked",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "revoked",
            "entity_type": "virtual_key",
            "entity_id": str(key_id),
        },
    )

    return {"status": "success", "message": "Virtual key revoked"}


# ---------------------------------------------------------------------------
# DELETE /virtual-keys/{key_id}
# ---------------------------------------------------------------------------

@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def delete_key(key_id: int, request: Request):
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    deleted = await delete_virtual_key(org_id, key_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Virtual key not found or not revoked (only revoked keys can be deleted)",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "deleted",
            "entity_type": "virtual_key",
            "entity_id": str(key_id),
        },
    )

    return {"status": "success", "message": "Virtual key deleted"}


# ---------------------------------------------------------------------------
# POST /virtual-keys/reset-budgets — BullMQ monthly job
# ---------------------------------------------------------------------------

@router.post("/reset-budgets", status_code=status.HTTP_200_OK)
async def reset_all_virtual_key_budgets(request: Request):
    """Reset current_spend_usd to 0 for all virtual keys. Called by BullMQ monthly job."""
    from sqlalchemy import text
    from database.db import get_db

    verify_internal_key(request)
    async with get_db() as db:
        await db.execute(
            text("UPDATE ai_gateway_virtual_keys SET current_spend_usd = 0, updated_at = NOW()")
        )
        await db.commit()
    return {"data": {"reset": True}}
