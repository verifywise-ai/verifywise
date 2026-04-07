import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from crud.mcp_tools import get_all_tools, get_tools_by_server, update_tool
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/tools", tags=["mcp-tools"])

VALID_RISK_LEVELS = {"low", "medium", "high"}


# ---------------------------------------------------------------------------
# GET /mcp/tools/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_tools(request: Request) -> Any:
    """List all active tools for the organization."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    tools = await get_all_tools(org_id)
    return {"tools": tools}


# ---------------------------------------------------------------------------
# GET /mcp/tools/server/{server_id}
# ---------------------------------------------------------------------------

@router.get("/server/{server_id}", status_code=status.HTTP_200_OK)
async def list_tools_by_server(server_id: int, request: Request) -> Any:
    """List all tools for a specific MCP server."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    tools = await get_tools_by_server(org_id, server_id)
    return {"tools": tools}


# ---------------------------------------------------------------------------
# PATCH /mcp/tools/{tool_id}
# ---------------------------------------------------------------------------

@router.patch("/{tool_id}", status_code=status.HTTP_200_OK)
async def patch_tool(tool_id: int, request: Request) -> Any:
    """Update governance fields (risk_level, requires_approval) for a tool. Admin only."""
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    body: dict = await request.json()

    # Validate risk_level if provided
    risk_level = body.get("risk_level")
    if risk_level is not None and risk_level not in VALID_RISK_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid risk_level. Must be one of: {', '.join(sorted(VALID_RISK_LEVELS))}",
        )

    # Validate requires_approval if provided
    requires_approval = body.get("requires_approval")
    if requires_approval is not None and not isinstance(requires_approval, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="requires_approval must be a boolean",
        )

    # Only pass allowed fields to the CRUD layer
    data: dict[str, Any] = {}
    if risk_level is not None:
        data["risk_level"] = risk_level
    if requires_approval is not None:
        data["requires_approval"] = requires_approval

    updated = await update_tool(org_id, tool_id, data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tool not found",
        )

    return {"tool": updated}
