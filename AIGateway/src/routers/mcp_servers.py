import re
import logging
from fastapi import APIRouter, HTTPException, Request
from typing import Any, Optional

from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change
import crud.mcp_servers as mcp_servers_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/servers", tags=["mcp-servers"])

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _validate_slug(slug: str) -> None:
    if not SLUG_PATTERN.match(slug):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid slug. Must start with a lowercase letter or digit and "
                "contain only lowercase letters, digits, and hyphens."
            ),
        )


@router.get("")
async def list_mcp_servers(request: Request) -> Any:
    verify_internal_key(request)

    org_id = get_org_id(request)

    servers = await mcp_servers_crud.get_all_mcp_servers(org_id)
    return {"servers": servers}


@router.get("/{server_id}")
async def get_mcp_server(server_id: int, request: Request) -> Any:
    verify_internal_key(request)

    org_id = get_org_id(request)

    server = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    return {"server": server}


@router.post("")
async def create_mcp_server(request: Request) -> Any:
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict = await request.json()

    name: Optional[str] = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    slug: Optional[str] = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    _validate_slug(slug)

    if not body.get("url"):
        raise HTTPException(status_code=400, detail="url is required")

    body["created_by"] = user_id

    try:
        server = await mcp_servers_crud.create_mcp_server(org_id, body)
    except Exception as e:
        from sqlalchemy.exc import IntegrityError
        if isinstance(e, IntegrityError):
            raise HTTPException(status_code=409, detail=f"Slug '{body.get('slug')}' already exists")
        raise HTTPException(status_code=500, detail="Failed to create MCP server")
    if not server:
        raise HTTPException(status_code=500, detail="Failed to create MCP server")

    await notify_config_change(
        org_id=org_id,
        event="mcp_server_created",
        payload={"server_id": server["id"], "slug": server["slug"]},
    )

    return {"server": server}


@router.patch("/{server_id}")
async def update_mcp_server(server_id: int, request: Request) -> Any:
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)

    body: dict = await request.json()

    slug: Optional[str] = body.get("slug")
    if slug is not None:
        _validate_slug(slug)

    existing = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not existing:
        raise HTTPException(status_code=404, detail="MCP server not found")

    updated = await mcp_servers_crud.update_mcp_server(org_id, server_id, body)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update MCP server")

    await notify_config_change(
        org_id=org_id,
        event="mcp_server_updated",
        payload={"server_id": server_id, "slug": updated.get("slug")},
    )

    return {"server": updated}


@router.delete("/{server_id}")
async def delete_mcp_server(server_id: int, request: Request) -> Any:
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)

    existing = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not existing:
        raise HTTPException(status_code=404, detail="MCP server not found")

    deleted = await mcp_servers_crud.delete_mcp_server(org_id, server_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete MCP server")

    await notify_config_change(
        org_id=org_id,
        event="mcp_server_deleted",
        payload={"server_id": server_id, "slug": existing.get("slug")},
    )

    return {"deleted": True, "server_id": server_id}


@router.post("/{server_id}/discover")
async def discover_server_tools(server_id: int, request: Request) -> Any:
    """Trigger tool discovery for a registered MCP server."""
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)

    server = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    from services.mcp_proxy_service import discover_server_tools as do_discover

    try:
        tools = await do_discover(
            org_id=org_id,
            server_id=server_id,
            server_url=server["url"],
            auth_type=server.get("auth_type", "none"),
            auth_config=server.get("auth_config") or {},
        )
        await mcp_servers_crud.update_server_health(server_id, "healthy")
        return {"status": "success", "tools_discovered": len(tools), "tools": tools}
    except Exception as e:
        await mcp_servers_crud.update_server_health(server_id, "unhealthy")
        raise HTTPException(status_code=502, detail=f"Discovery failed: {str(e)}")
