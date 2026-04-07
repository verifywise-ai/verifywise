"""
MCP Gateway proxy service — agent key authentication, tool ACL enforcement,
rate limiting, and tool call forwarding for the MCP Gateway.
"""

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import text

from config import settings
from database.db import get_db
from utils.rate_limit import check_rate_limit

logger = logging.getLogger("uvicorn")


# ─── Agent Key Authentication ───────────────────────────────────────────────

def hash_agent_key(plain_key: str) -> str:
    """SHA-256 hash an MCP agent key."""
    return hashlib.sha256(plain_key.encode("utf-8")).hexdigest()


async def authenticate_agent_key(bearer_token: str) -> dict:
    """
    Validate an MCP agent key and return its metadata.
    Raises ValueError if invalid.
    """
    if not bearer_token.startswith("sk-mcp-"):
        raise ValueError("Invalid agent key format")

    key_hash = hash_agent_key(bearer_token)
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, organization_id, name, allowed_tools, blocked_tools,
                       rate_limit_rpm, is_active, revoked_at, expires_at
                FROM ai_gateway_mcp_agent_keys
                WHERE key_hash = :key_hash
            """),
            {"key_hash": key_hash},
        )
        row = result.mappings().fetchone()
        if not row:
            raise ValueError("Agent key not found")
        if not row["is_active"]:
            raise ValueError("Agent key is inactive")
        if row["revoked_at"]:
            raise ValueError("Agent key has been revoked")
        if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
            raise ValueError("Agent key has expired")
        return dict(row)


# ─── Tool ACL Enforcement ──────────────────────────────────────────────────

from utils.acl import matches_acl


def enforce_tool_acls(agent_key: dict, tool_name: str) -> None:
    """
    Check allowed_tools/blocked_tools on the agent key.
    Raises ValueError if the tool is not permitted.
    """
    allowed_tools = agent_key.get("allowed_tools") or []
    if allowed_tools and not matches_acl(tool_name, allowed_tools):
        raise ValueError(f"Agent key does not allow tool: {tool_name}")

    blocked_tools = agent_key.get("blocked_tools") or []
    if blocked_tools and matches_acl(tool_name, blocked_tools):
        raise ValueError(f"Agent key blocks tool: {tool_name}")


# ─── Rate Limiting ──────────────────────────────────────────────────────────


async def enforce_mcp_rate_limits(agent_key: dict, tool_name: str) -> None:
    """Check per-agent rate limit. Raises HTTPException(429) if exceeded."""
    if agent_key.get("rate_limit_rpm") and agent_key["rate_limit_rpm"] > 0:
        if not await check_rate_limit(f"mcp:ak:{agent_key['id']}", agent_key["rate_limit_rpm"]):
            raise HTTPException(status_code=429, detail="Agent key rate limit exceeded")


# ─── Tool Resolution ───────────────────────────────────────────────────────

async def resolve_tool(org_id: int, tool_name: str) -> dict:
    """
    Look up which server hosts a tool.
    Raises ValueError if not found or server inactive.
    """
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT t.id, t.tool_name, t.description, t.input_schema, t.risk_level,
                       t.requires_approval, t.server_id,
                       s.url, s.auth_type, s.auth_config, s.is_active AS server_active
                FROM ai_gateway_mcp_tools t
                JOIN ai_gateway_mcp_servers s ON t.server_id = s.id
                WHERE t.organization_id = :org_id
                  AND t.tool_name = :tool_name
                  AND t.is_active = true
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        row = result.mappings().fetchone()
        if not row:
            raise ValueError(f"Tool not found: {tool_name}")
        if not row["server_active"]:
            raise ValueError(f"Server hosting tool '{tool_name}' is inactive")
        return dict(row)


# ─── Auth Header Builder ───────────────────────────────────────────────────

def _build_auth_headers(auth_type: str, auth_config: dict) -> dict:
    """Build authentication headers for backend MCP server requests."""
    if auth_type == "bearer":
        return {"Authorization": f"Bearer {auth_config.get('token', '')}"}
    elif auth_type == "api_key":
        header_name = auth_config.get("header", "x-api-key")
        return {header_name: auth_config.get("key", "")}
    return {}


# ─── SSE Response Parser ──────────────────────────────────────────────────

def _parse_sse_response(text_body: str) -> dict:
    """Parse a Server-Sent Events response and extract the JSON-RPC message."""
    for line in text_body.strip().split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise ValueError(f"No data line found in SSE response: {text_body[:200]}")


def _parse_response(resp: httpx.Response) -> dict:
    """Parse an MCP response — handles both JSON and SSE content types."""
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        return _parse_sse_response(resp.text)
    return resp.json()


# ─── Server Tool Discovery ─────────────────────────────────────────────────

async def discover_server_tools(
    org_id: int,
    server_id: int,
    server_url: str,
    auth_type: str,
    auth_config: dict,
) -> list[dict]:
    """
    Connect to a backend MCP server and discover its tools.
    Sends initialize + tools/list, then upserts discovered tools into the database.
    Returns list of discovered tools.
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **_build_auth_headers(auth_type, auth_config),
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Initialize the MCP session
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {
                    "name": "VerifyWise MCP Gateway",
                    "version": "1.0.0",
                },
            },
        }
        init_resp = await client.post(server_url, json=init_payload, headers=headers)
        init_resp.raise_for_status()
        init_data = _parse_response(init_resp)
        if "error" in init_data:
            raise ValueError(f"MCP initialize failed: {init_data['error']}")

        # Capture backend session ID if returned
        backend_session_id = init_resp.headers.get("mcp-session-id")
        if backend_session_id:
            headers["Mcp-Session-Id"] = backend_session_id

        # Step 2: List tools
        list_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        }
        list_resp = await client.post(server_url, json=list_payload, headers=headers)
        list_resp.raise_for_status()
        list_data = _parse_response(list_resp)
        if "error" in list_data:
            raise ValueError(f"MCP tools/list failed: {list_data['error']}")

    tools = list_data.get("result", {}).get("tools", [])
    discovered_tool_names = set()
    discovered_tools = []

    async with get_db() as db:
        for tool in tools:
            tool_name = tool.get("name", "")
            description = tool.get("description", "")
            input_schema = tool.get("inputSchema", {})
            discovered_tool_names.add(tool_name)

            await db.execute(
                text("""
                    INSERT INTO ai_gateway_mcp_tools
                        (organization_id, server_id, tool_name, description,
                         input_schema, is_active)
                    VALUES
                        (:org_id, :server_id, :tool_name, :description,
                         CAST(:input_schema AS jsonb), true)
                    ON CONFLICT (organization_id, server_id, tool_name)
                    DO UPDATE SET
                        description = EXCLUDED.description,
                        input_schema = EXCLUDED.input_schema,
                        is_active = true,
                        updated_at = NOW()
                """),
                {
                    "org_id": org_id,
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "description": description,
                    "input_schema": json.dumps(input_schema),
                },
            )

            discovered_tools.append({
                "tool_name": tool_name,
                "description": description,
                "input_schema": input_schema,
            })

        # Deactivate tools that are no longer advertised by the server
        if discovered_tool_names:
            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_tools
                    SET is_active = false, updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND server_id = :server_id
                      AND is_active = true
                      AND tool_name != ALL(:tool_names)
                """),
                {
                    "org_id": org_id,
                    "server_id": server_id,
                    "tool_names": list(discovered_tool_names),
                },
            )
        else:
            # No tools discovered — deactivate all tools for this server
            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_tools
                    SET is_active = false, updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND server_id = :server_id
                      AND is_active = true
                """),
                {"org_id": org_id, "server_id": server_id},
            )

        await db.commit()

    logger.info(
        f"Discovered {len(discovered_tools)} tools from server {server_id} "
        f"for org {org_id}"
    )
    return discovered_tools


# ─── Tool Call Forwarding ──────────────────────────────────────────────────

async def forward_tool_call(
    server_url: str,
    auth_type: str,
    auth_config: dict,
    tool_name: str,
    arguments: dict,
    session_id: Optional[str] = None,
) -> tuple[dict, Optional[str]]:
    """
    Forward a tools/call request to the backend MCP server.
    Initializes a session if no session_id is provided.
    Returns (result_dict, backend_session_id).
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **_build_auth_headers(auth_type, auth_config),
    }
    new_session = None

    async with httpx.AsyncClient(timeout=60) as client:
        if not session_id:
            init_resp = await client.post(
                server_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 0,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "VerifyWise MCP Gateway", "version": "1.0.0"},
                    },
                },
                headers=headers,
            )
            init_resp.raise_for_status()
            session_id = init_resp.headers.get("mcp-session-id")
            new_session = session_id

            if session_id:
                headers["Mcp-Session-Id"] = session_id

            # notifications/initialized only after fresh handshake
            await client.post(
                server_url,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=headers,
            )
        else:
            headers["Mcp-Session-Id"] = session_id

        resp = await client.post(
            server_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            },
            headers=headers,
        )
        resp.raise_for_status()
        data = _parse_response(resp)

    if "error" in data:
        error = data["error"]
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        raise ValueError(f"Tool call failed: {message}")

    return data.get("result", {}), new_session
