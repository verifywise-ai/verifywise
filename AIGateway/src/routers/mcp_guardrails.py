from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from crud.mcp_guardrails import (
    create_mcp_guardrail,
    delete_mcp_guardrail,
    get_all_mcp_guardrails,
    get_mcp_guardrail_agent_scope,
    update_mcp_guardrail,
)
from crud.mcp_agent_keys import get_active_org_agent_key_ids
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

# Upper bound on agent keys a single rule can be scoped to.
MAX_RULE_AGENT_KEYS = 100
VALID_AGENT_SCOPES = {"all", "selected"}


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


async def _validated_agent_keys(request: Request, value: Any) -> list[int]:
    """Validate applies_to_agent_keys: a list of this organization's active
    (not revoked) agent-key ids, deduplicated in order."""
    if value is None:
        return []
    if not isinstance(value, list) or not all(
        isinstance(k, int) and not isinstance(k, bool) for k in value
    ):
        raise _bad_request("applies_to_agent_keys must be an array of agent-key ids")
    keys = list(dict.fromkeys(value))
    if len(keys) > MAX_RULE_AGENT_KEYS:
        raise _bad_request(
            f"applies_to_agent_keys can list at most {MAX_RULE_AGENT_KEYS} agent keys"
        )
    active = await get_active_org_agent_key_ids(get_org_id(request), keys)
    if len(active) != len(keys):
        raise _bad_request(
            "applies_to_agent_keys contains an agent key that does not exist or is revoked"
        )
    return keys


async def _resolved_agent_scope(
    request: Request,
    body: dict[str, Any],
    current: tuple[str, list[int]] | None = None,
) -> tuple[str, list[int]]:
    """The (agent_scope, applies_to_agent_keys) a create or update leaves the
    rule with. `current` is the rule's stored scope on update.

    'all' applies the rule to every agent and lists no keys. 'selected' applies
    it only to the listed keys and needs at least one. When agent_scope is
    omitted, sending keys means 'selected'; otherwise the current scope stays."""
    scope = body.get("agent_scope")
    if scope is not None and scope not in VALID_AGENT_SCOPES:
        raise _bad_request("agent_scope must be one of: all, selected")

    if "applies_to_agent_keys" in body:
        keys = await _validated_agent_keys(request, body["applies_to_agent_keys"])
    else:
        keys = current[1] if current else []

    if scope is None:
        scope = "selected" if keys else (current[0] if current else "all")

    if scope == "all":
        if body.get("applies_to_agent_keys"):
            raise _bad_request("applies_to_agent_keys must be empty when agent_scope is all")
        return "all", []
    if not keys:
        raise _bad_request("A rule for selected agents needs at least one agent key")
    return "selected", keys


router = APIRouter(prefix="/mcp/guardrails", tags=["mcp-guardrails"])

VALID_RULE_TYPES = {"pii", "content_filter", "prompt_injection", "require_approval"}
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

    # Validate action. require_approval rules have no block/mask action — the
    # rule type itself is the effect — so action is optional and defaults to
    # the sentinel "require_approval".
    action = body.get("action")
    if rule_type == "require_approval":
        action = "require_approval"
    else:
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

    # Agent scope (optional): every agent, or only the selected agent keys.
    agent_scope, applies_to_agent_keys = await _resolved_agent_scope(request, body)

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
        "agent_scope": agent_scope,
        "applies_to_agent_keys": applies_to_agent_keys,
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

    # rule_type carries the effect for require_approval rules, whose stored
    # action is the "require_approval" sentinel rather than block/mask. Accept
    # that sentinel here (and when this PATCH sets rule_type=require_approval)
    # so such rules can be edited by clients that round-trip the action field.
    if updates.get("rule_type") == "require_approval":
        updates["action"] = "require_approval"
    elif "action" in body:
        action = body["action"]
        if action == "require_approval":
            updates["action"] = action
        elif action not in VALID_ACTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"action must be one of: {', '.join(sorted(VALID_ACTIONS))}",
            )
        else:
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

    # agent_scope / applies_to_agent_keys, resolved together against the
    # rule's stored scope.
    if "agent_scope" in body or "applies_to_agent_keys" in body:
        current = await get_mcp_guardrail_agent_scope(get_org_id(request), rule_id)
        if current is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MCP guardrail rule not found",
            )
        (
            updates["agent_scope"],
            updates["applies_to_agent_keys"],
        ) = await _resolved_agent_scope(request, body, current)

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
