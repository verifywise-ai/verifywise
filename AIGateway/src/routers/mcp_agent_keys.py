from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, status

from crud.mcp_agent_keys import (
    create_agent_key,
    delete_agent_key,
    get_all_agent_keys,
    revoke_agent_key,
    update_agent_key,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

router = APIRouter(prefix="/mcp/agent-keys", tags=["mcp-agent-keys"])


# ---------------------------------------------------------------------------
# GET /mcp/agent-keys/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_agent_keys(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)

    keys = await get_all_agent_keys(org_id)
    return {"status": "success", "data": keys}


# ---------------------------------------------------------------------------
# POST /mcp/agent-keys/
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

    # Validate description
    description = body.get("description")
    if description is not None:
        if not isinstance(description, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="description must be a string",
            )
        if len(description) > 1000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="description must be 1000 characters or fewer",
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

    # Validate tool ACL fields
    acl_fields = {}
    for field in ("allowed_tools", "blocked_tools"):
        value = body.get(field)
        if value is not None:
            if not isinstance(value, list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field} must be an array",
                )
            if not all(isinstance(v, str) for v in value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field} must be an array of strings",
                )
            acl_fields[field] = value

    # Validate allowed_server_ids
    allowed_server_ids = body.get("allowed_server_ids")
    if allowed_server_ids is not None:
        if not isinstance(allowed_server_ids, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_server_ids must be an array",
            )
        if not all(isinstance(i, int) for i in allowed_server_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_server_ids must be an array of integers",
            )

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    data = {
        "name": name,
        "description": description,
        "allowed_tools": acl_fields.get("allowed_tools", []),
        "blocked_tools": acl_fields.get("blocked_tools", []),
        "allowed_server_ids": allowed_server_ids or [],
        "rate_limit_rpm": body.get("rate_limit_rpm"),
        "metadata": body.get("metadata"),
        "expires_at": expires_at,
        "created_by": user_id,
    }

    record = await create_agent_key(org_id, data)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create MCP agent key",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "created",
            "entity_type": "mcp_agent_key",
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
# PATCH /mcp/agent-keys/{key_id}
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

    # description
    if "description" in body:
        description = body["description"]
        if description is not None and not isinstance(description, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="description must be a string",
            )
        if description is not None and len(description) > 1000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="description must be 1000 characters or fewer",
            )
        updates["description"] = description

    # tool ACLs
    for field in ("allowed_tools", "blocked_tools"):
        if field in body:
            value = body[field]
            if value is not None and not isinstance(value, list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field} must be an array",
                )
            if value is not None and not all(isinstance(v, str) for v in value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field} must be an array of strings",
                )
            updates[field] = value if value is not None else []

    # allowed_server_ids
    if "allowed_server_ids" in body:
        ids = body["allowed_server_ids"]
        if not isinstance(ids, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_server_ids must be an array",
            )
        if not all(isinstance(i, int) for i in ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allowed_server_ids must be an array of integers",
            )
        updates["allowed_server_ids"] = ids

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

    record = await update_agent_key(org_id, key_id, updates)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP agent key not found or no fields to update",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "updated",
            "entity_type": "mcp_agent_key",
            "entity_id": str(key_id),
            "entity_name": record.get("name", ""),
        },
    )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# POST /mcp/agent-keys/{key_id}/revoke
# ---------------------------------------------------------------------------

@router.post("/{key_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_key(key_id: int, request: Request):
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    revoked = await revoke_agent_key(org_id, key_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP agent key not found or already revoked",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "revoked",
            "entity_type": "mcp_agent_key",
            "entity_id": str(key_id),
        },
    )

    return {"status": "success", "message": "MCP agent key revoked"}


# ---------------------------------------------------------------------------
# DELETE /mcp/agent-keys/{key_id}
# ---------------------------------------------------------------------------

@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def delete_key(key_id: int, request: Request):
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    deleted = await delete_agent_key(org_id, key_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP agent key not found or not revoked (only revoked keys can be deleted)",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "deleted",
            "entity_type": "mcp_agent_key",
            "entity_id": str(key_id),
        },
    )

    return {"status": "success", "message": "MCP agent key deleted"}
