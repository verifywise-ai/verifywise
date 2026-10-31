import re
import logging
from fastapi import APIRouter, HTTPException, Request
from typing import Any, Optional

from utils.auth import get_org_id, get_role, get_user_id, require_admin
from utils.mcp_credentials import CredentialError, normalize_auth_config, public_auth_fields
from services.mcp_proxy_service import (
    MANUAL_DISCOVERY_SECONDS,
    ON_SAVE_DISCOVERY_SECONDS,
    run_discovery,
)
from services.mcp_oauth_discovery import OAuthDiscoveryError, discover_token_endpoint
from utils.notifications import config_event, notify_config_change
from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url
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


SKIPPED = {"status": "skipped", "tools_discovered": 0, "changes": None, "error": None}


def _present(server: dict, request: Request) -> dict:
    """Response shape: never auth_config; a masked hint for Admins only."""
    out = {k: v for k, v in server.items() if k != "auth_config"}
    try:
        out.update(
            public_auth_fields(
                server.get("auth_type") or "none",
                server.get("auth_config") or {},
                get_role(request) == "Admin",
            )
        )
    except Exception:
        # e.g. a secret that can no longer be decrypted after a key change.
        logger.warning("Skipped the masked auth hint for MCP server %s: stored value unreadable", server.get("id"))
    return out


def _normalized(auth_type: str, incoming, stored) -> dict:
    try:
        return normalize_auth_config(auth_type, incoming, stored)
    except CredentialError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
async def list_mcp_servers(request: Request) -> Any:

    org_id = get_org_id(request)

    servers = await mcp_servers_crud.get_all_mcp_servers(org_id)
    return {"servers": [_present(s, request) for s in servers]}


@router.post("/discover-oauth")
async def discover_oauth(request: Request) -> Any:
    """Find the OAuth token URL for a server address (no secret is sent)."""
    require_admin(request)
    body = await request.json()
    url = body.get("url") if isinstance(body, dict) else None
    if not isinstance(url, str) or not url.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        return await discover_token_endpoint(url.strip())
    except OAuthDiscoveryError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{server_id}")
async def get_mcp_server(server_id: int, request: Request) -> Any:

    org_id = get_org_id(request)

    server = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    return {"server": _present(server, request)}


def _safe_url(raw: Any) -> str:
    try:
        return assert_safe_outbound_url(raw)
    except UnsafeOutboundUrlError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("")
async def create_mcp_server(request: Request) -> Any:
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
    body["url"] = _safe_url(body["url"])

    auth_type = body.get("auth_type") or "none"
    body["auth_type"] = auth_type
    body["auth_config"] = _normalized(auth_type, body.get("auth_config"), None)

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
        org_id,
        user_id,
        config_event("mcp_server", "created", server.get("name"), server["id"]),
    )

    discovery = SKIPPED
    if server.get("is_active", True):
        discovery = await run_discovery(org_id, server, ON_SAVE_DISCOVERY_SECONDS)
    server = await mcp_servers_crud.get_mcp_server(org_id, server["id"]) or server
    return {"server": _present(server, request), "discovery": discovery}


@router.patch("/{server_id}")
async def update_mcp_server(server_id: int, request: Request) -> Any:
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict = await request.json()

    slug: Optional[str] = body.get("slug")
    if slug is not None:
        _validate_slug(slug)

    if "url" in body:
        body["url"] = _safe_url(body["url"])

    existing = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not existing:
        raise HTTPException(status_code=404, detail="MCP server not found")

    old_type = existing.get("auth_type") or "none"
    new_type = body.get("auth_type") or old_type
    if "auth_config" in body or new_type != old_type:
        stored = existing.get("auth_config") if new_type == old_type else None
        body["auth_type"] = new_type
        body["auth_config"] = _normalized(new_type, body.get("auth_config"), stored)

    connection_changed = (
        ("url" in body and body["url"] != existing.get("url"))
        or new_type != old_type
        or "auth_config" in body
    )
    enabling = body.get("is_active") is True and not existing.get("is_active")

    updated = await mcp_servers_crud.update_mcp_server(org_id, server_id, body)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update MCP server")

    await notify_config_change(
        org_id,
        user_id,
        config_event("mcp_server", "updated", updated.get("name"), server_id),
    )

    discovery = SKIPPED
    if updated.get("is_active") and (connection_changed or enabling):
        discovery = await run_discovery(org_id, updated, ON_SAVE_DISCOVERY_SECONDS)
    updated = await mcp_servers_crud.get_mcp_server(org_id, server_id) or updated
    return {"server": _present(updated, request), "discovery": discovery}


@router.delete("/{server_id}")
async def delete_mcp_server(server_id: int, request: Request) -> Any:
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    existing = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not existing:
        raise HTTPException(status_code=404, detail="MCP server not found")

    deleted = await mcp_servers_crud.delete_mcp_server(org_id, server_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete MCP server")

    await notify_config_change(
        org_id,
        user_id,
        config_event("mcp_server", "deleted", existing.get("name"), server_id),
    )

    return {"deleted": True, "server_id": server_id}


@router.post("/{server_id}/discover")
async def discover_server_tools(server_id: int, request: Request) -> Any:
    """Trigger tool discovery for a registered MCP server."""
    require_admin(request)

    org_id = get_org_id(request)

    server = await mcp_servers_crud.get_mcp_server(org_id, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    result = await run_discovery(org_id, server, MANUAL_DISCOVERY_SECONDS)
    if result["status"] != "success":
        raise HTTPException(status_code=502, detail=result["error"])
    return {
        "status": "success",
        "tools_discovered": result["tools_discovered"],
        "changes": result["changes"],
    }
