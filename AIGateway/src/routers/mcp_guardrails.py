from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from crud.mcp_guardrails import (
    create_mcp_guardrail,
    delete_mcp_guardrail,
    get_all_mcp_guardrails,
    update_mcp_guardrail,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

router = APIRouter(prefix="/mcp/guardrails", tags=["mcp-guardrails"])

VALID_RULE_TYPES = {"pii", "content_filter", "prompt_injection"}
VALID_ACTIONS = {"block", "mask"}


# ---------------------------------------------------------------------------
# GET /mcp/guardrails/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_mcp_guardrails(request: Request):
    """List all MCP guardrail rules for the organization."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    rules = await get_all_mcp_guardrails(org_id)
    return {"status": "success", "data": rules}


# ---------------------------------------------------------------------------
# POST /mcp/guardrails/
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_guardrail(request: Request):
    """Create a new MCP guardrail rule (admin only)."""
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

    # Validate rule_type
    rule_type = body.get("rule_type")
    if not rule_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="rule_type is required",
        )
    if rule_type not in VALID_RULE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"rule_type must be one of: {', '.join(sorted(VALID_RULE_TYPES))}",
        )

    # Validate action
    action = body.get("action")
    if not action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action is required",
        )
    if action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"action must be one of: {', '.join(sorted(VALID_ACTIONS))}",
        )

    # Validate config (optional, must be object if provided)
    config = body.get("config")
    if config is not None and not isinstance(config, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="config must be an object",
        )

    # Validate scope (optional)
    scope = body.get("scope", "input")
    if not isinstance(scope, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scope must be a string",
        )

    # Validate applies_to_tools (optional, must be array of strings)
    applies_to_tools = body.get("applies_to_tools")
    if applies_to_tools is not None:
        if not isinstance(applies_to_tools, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="applies_to_tools must be an array",
            )
        if not all(isinstance(t, str) for t in applies_to_tools):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="applies_to_tools must be an array of strings",
            )

    # Validate is_active (optional, defaults to true)
    is_active = body.get("is_active", True)
    if not isinstance(is_active, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_active must be a boolean",
        )

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    data = {
        "name": name,
        "rule_type": rule_type,
        "config": config or {},
        "scope": scope,
        "action": action,
        "applies_to_tools": applies_to_tools or [],
        "is_active": is_active,
        "created_by": user_id,
    }

    record = await create_mcp_guardrail(org_id, data)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create MCP guardrail rule",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "created",
            "entity_type": "mcp_guardrail",
            "entity_id": str(record["id"]),
            "entity_name": name,
        },
    )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# PATCH /mcp/guardrails/{rule_id}
# ---------------------------------------------------------------------------

@router.patch("/{rule_id}", status_code=status.HTTP_200_OK)
async def update_guardrail(rule_id: int, request: Request):
    """Update an existing MCP guardrail rule (admin only)."""
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

    # rule_type
    if "rule_type" in body:
        rule_type = body["rule_type"]
        if rule_type not in VALID_RULE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"rule_type must be one of: {', '.join(sorted(VALID_RULE_TYPES))}",
            )
        updates["rule_type"] = rule_type

    # config
    if "config" in body:
        config = body["config"]
        if config is not None and not isinstance(config, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="config must be an object",
            )
        updates["config"] = config or {}

    # scope
    if "scope" in body:
        scope = body["scope"]
        if not isinstance(scope, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="scope must be a string",
            )
        updates["scope"] = scope

    # action
    if "action" in body:
        action = body["action"]
        if action not in VALID_ACTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"action must be one of: {', '.join(sorted(VALID_ACTIONS))}",
            )
        updates["action"] = action

    # applies_to_tools
    if "applies_to_tools" in body:
        applies_to_tools = body["applies_to_tools"]
        if applies_to_tools is not None:
            if not isinstance(applies_to_tools, list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="applies_to_tools must be an array",
                )
            if not all(isinstance(t, str) for t in applies_to_tools):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="applies_to_tools must be an array of strings",
                )
        updates["applies_to_tools"] = applies_to_tools if applies_to_tools is not None else []

    # is_active
    if "is_active" in body:
        is_active = body["is_active"]
        if not isinstance(is_active, bool):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="is_active must be a boolean",
            )
        updates["is_active"] = is_active

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    record = await update_mcp_guardrail(org_id, rule_id, updates)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP guardrail rule not found or no fields to update",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "updated",
            "entity_type": "mcp_guardrail",
            "entity_id": str(rule_id),
            "entity_name": record.get("name", ""),
        },
    )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# DELETE /mcp/guardrails/{rule_id}
# ---------------------------------------------------------------------------

@router.delete("/{rule_id}", status_code=status.HTTP_200_OK)
async def delete_guardrail(rule_id: int, request: Request):
    """Delete an MCP guardrail rule (admin only)."""
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    deleted = await delete_mcp_guardrail(org_id, rule_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP guardrail rule not found",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "deleted",
            "entity_type": "mcp_guardrail",
            "entity_id": str(rule_id),
        },
    )

    return {"status": "success", "message": "MCP guardrail rule deleted"}
