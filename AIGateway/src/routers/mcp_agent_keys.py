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
from services.mcp_monitor import ENFORCE, ENFORCEMENT_MODES, MONITOR
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import config_event, notify_config_change

router = APIRouter(prefix="/mcp/agent-keys", tags=["mcp-agent-keys"])


def _validated_enforcement_mode(value: Any) -> str:
    """'enforce' blocks and pauses calls per policy; 'monitor' only records
    what would have happened. Raises 400 for anything else."""
    if not isinstance(value, str) or value not in ENFORCEMENT_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="enforcement_mode must be one of: " + ", ".join(ENFORCEMENT_MODES),
        )
    return value


def _validated_apply_tool_lists_to_hook(value: Any) -> bool:
    """Whether the key's tool lists also apply to native tool calls (the hook
    and the SDKs). Off by default: the lists were written for MCP proxy tools.
    Raises 400 for anything but a boolean."""
    if not isinstance(value, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="apply_tool_lists_to_hook must be a boolean",
        )
    return value


_MODE_FIELDS = ("enforcement_mode", "enforcement_mode_changed_by")
_MODE_LABELS = {ENFORCE: "enforce", MONITOR: "monitor only"}


def _mode_change_event(key_id: int, name: str, new_mode: str) -> dict:
    """Config-change event for an actual enforcement mode switch. Uses the
    camelCase fields the backend's notifyConfigChange reads; the backend turns
    action 'enforcement_mode_changed' + newMode into readable text
    ("Agent key "x" switched to monitor only by <user>.")."""
    # Only two modes exist (CHECK constraint), so a real change came from the other one.
    old_mode = MONITOR if new_mode == ENFORCE else ENFORCE
    return {
        **config_event(
            "mcp_agent_key",
            "enforcement_mode_changed",
            name,
            key_id,
            detail=f"Enforcement mode: {_MODE_LABELS[old_mode]} to {_MODE_LABELS[new_mode]}",
        ),
        "oldMode": old_mode,
        "newMode": new_mode,
    }


# ---------------------------------------------------------------------------
# GET /mcp/agent-keys/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_agent_keys(request: Request):
    org_id = get_org_id(request)

    keys = await get_all_agent_keys(org_id)
    return {"status": "success", "data": keys}


# ---------------------------------------------------------------------------
# POST /mcp/agent-keys/
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_key(request: Request):
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

    enforcement_mode = ENFORCE
    if "enforcement_mode" in body:
        enforcement_mode = _validated_enforcement_mode(body["enforcement_mode"])

    apply_tool_lists_to_hook = False
    if "apply_tool_lists_to_hook" in body:
        apply_tool_lists_to_hook = _validated_apply_tool_lists_to_hook(body["apply_tool_lists_to_hook"])

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
        "enforcement_mode": enforcement_mode,
        # Recorded only when the key starts in a non-default mode.
        "enforcement_mode_changed_by": user_id,
        "apply_tool_lists_to_hook": apply_tool_lists_to_hook,
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
        event=config_event("mcp_agent_key", "created", name, record["id"]),
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

    # enforcement_mode
    if "enforcement_mode" in body:
        updates["enforcement_mode"] = _validated_enforcement_mode(body["enforcement_mode"])

    # apply_tool_lists_to_hook
    if "apply_tool_lists_to_hook" in body:
        updates["apply_tool_lists_to_hook"] = _validated_apply_tool_lists_to_hook(
            body["apply_tool_lists_to_hook"]
        )

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    if "enforcement_mode" in updates:
        # Stamped only if the stored mode actually changes (see update_agent_key).
        updates["enforcement_mode_changed_by"] = user_id

    record = await update_agent_key(org_id, key_id, updates)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP agent key not found or no fields to update",
        )

    # Internal flag from update_agent_key, not part of the API response.
    mode_changed = bool(record.pop("enforcement_mode_changed", False))
    other_fields = any(k not in _MODE_FIELDS for k in updates)

    if other_fields or not mode_changed:
        await notify_config_change(
            organization_id=org_id,
            changed_by_user_id=user_id,
            event=config_event("mcp_agent_key", "updated", record.get("name", ""), key_id),
        )

    if mode_changed:
        # A mode switch changes whether policies are enforced for this key, so
        # admins get a distinct notification for it.
        await notify_config_change(
            organization_id=org_id,
            changed_by_user_id=user_id,
            event=_mode_change_event(key_id, record.get("name", ""), updates["enforcement_mode"]),
        )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# POST /mcp/agent-keys/{key_id}/revoke
# ---------------------------------------------------------------------------

@router.post("/{key_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_key(key_id: int, request: Request):
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
        event=config_event("mcp_agent_key", "revoked", revoked["name"], key_id),
    )

    return {"status": "success", "message": "MCP agent key revoked"}


# ---------------------------------------------------------------------------
# DELETE /mcp/agent-keys/{key_id}
# ---------------------------------------------------------------------------

@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def delete_key(key_id: int, request: Request):
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
        event=config_event("mcp_agent_key", "deleted", deleted["name"], key_id),
    )

    return {"status": "success", "message": "MCP agent key deleted"}
