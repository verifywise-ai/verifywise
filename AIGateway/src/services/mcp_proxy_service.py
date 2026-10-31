"""
MCP Gateway proxy service — agent key authentication, tool ACL enforcement,
rate limiting, and tool call forwarding for the MCP Gateway.
"""

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import Request, HTTPException
from sqlalchemy import text

import crud.mcp_servers as mcp_servers_crud
from config import settings
from database.db import get_db
from services.mcp_token_service import TokenError, auth_headers_for, invalidate, record_upstream_rejection
from utils.mcp_credentials import TOKEN_AUTH_TYPES
from utils.rate_limit import check_rate_limit
from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url

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
                       rate_limit_rpm, is_active, revoked_at, expires_at,
                       enforcement_mode, apply_tool_lists_to_hook
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


async def extract_agent_key(request: Request) -> dict:
    """Authenticate an sk-mcp-* bearer token from a request. Raises 401 on failure."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <agent-key>")
    token = auth[7:].strip()
    try:
        return await authenticate_agent_key(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


# ─── Tool ACL Enforcement ──────────────────────────────────────────────────

from utils.acl import matches_acl


def tool_acl_violation(agent_key: dict, tool_name: str) -> Optional[str]:
    """
    Check allowed_tools/blocked_tools on the agent key.
    Returns why the tool is not permitted, or None when it is.
    """
    allowed_tools = agent_key.get("allowed_tools") or []
    if allowed_tools and not matches_acl(tool_name, allowed_tools):
        return f"Agent key does not allow tool: {tool_name}"

    blocked_tools = agent_key.get("blocked_tools") or []
    if blocked_tools and matches_acl(tool_name, blocked_tools):
        return f"Agent key blocks tool: {tool_name}"

    return None


def enforce_tool_acls(agent_key: dict, tool_name: str) -> None:
    """
    Check allowed_tools/blocked_tools on the agent key.
    Raises ValueError if the tool is not permitted.
    """
    violation = tool_acl_violation(agent_key, tool_name)
    if violation:
        raise ValueError(violation)


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
                       s.url, s.auth_type, s.auth_config, s.is_active AS server_active,
                       s.health_status, s.last_discovery_error
                FROM ai_gateway_mcp_tools t
                JOIN ai_gateway_mcp_servers s ON t.server_id = s.id
                WHERE t.organization_id = :org_id
                  AND t.tool_name = :tool_name
                  AND t.is_active = true
                ORDER BY s.is_active DESC, s.id ASC
                LIMIT 1
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        row = result.mappings().fetchone()
        if not row:
            raise ValueError(f"Tool not found: {tool_name}")
        if not row["server_active"]:
            raise ValueError(f"Server hosting tool '{tool_name}' is inactive")
        return dict(row)


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

ON_SAVE_DISCOVERY_SECONDS = 10
# Kept under the Express proxy timeout (30 s) so this error, not a generic
# gateway timeout, is what the user sees.
MANUAL_DISCOVERY_SECONDS = 25
MAX_TOOL_PAGES = 20
MAX_DISCOVERY_ERROR_CHARS = 500
_PROTOCOL_VERSION = "2025-03-26"


class McpRpcError(Exception):
    """A JSON-RPC error object returned by an MCP server."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _rpc_result(resp: httpx.Response) -> dict:
    resp.raise_for_status()
    data = _parse_response(resp)
    if "error" in data:
        error = data["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise McpRpcError(str(message or "Unknown error"))
    return data.get("result") or {}


async def _with_token_retry(auth_type: str, auth_config: dict, attempt):
    """Run ``attempt``; if a token-authenticated server answers 401, drop the
    cached token and try exactly once more with a fresh one. A second 401
    becomes a TokenError and starts the failure cooldown.

    Trade-off: for a tool call the retry re-sends tools/call. That can only
    follow an upstream that already executed it if the upstream answers HTTP 401
    after side effects; a server rejecting a token normally does so before
    running anything."""
    try:
        return await attempt()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 401 or auth_type not in TOKEN_AUTH_TYPES:
            raise
        invalidate(auth_type, auth_config)
        try:
            return await attempt()
        except httpx.HTTPStatusError as retry_exc:
            if retry_exc.response.status_code != 401:
                raise
            # A fresh token was refused too: the scope or resource is wrong, not
            # the token. Cool down (after the invalidate above, which would
            # otherwise wipe it) and report a token error.
            raise record_upstream_rejection(auth_type, auth_config) from None


async def fetch_server_tools(
    server_url: str,
    auth_type: str,
    auth_config: dict,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> list[dict]:
    """Network phase of discovery: initialize, initialized, every tools/list page."""
    async def _attempt() -> list[dict]:
        url = assert_safe_outbound_url(server_url)
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **(await auth_headers_for(auth_type, auth_config)),
        }
        tools: list[dict] = []
        async with httpx.AsyncClient(timeout=MANUAL_DISCOVERY_SECONDS, transport=transport) as client:
            init_resp = await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": _PROTOCOL_VERSION,
                        "capabilities": {},
                        "clientInfo": {"name": "VerifyWise MCP Gateway", "version": "1.0.0"},
                    },
                },
                headers=headers,
            )
            _rpc_result(init_resp)
            session_id = init_resp.headers.get("mcp-session-id")
            if session_id:
                headers["Mcp-Session-Id"] = session_id

            await client.post(
                url,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=headers,
            )

            cursor: Optional[str] = None
            for page in range(MAX_TOOL_PAGES):
                params = {"cursor": cursor} if cursor else {}
                result = _rpc_result(
                    await client.post(
                        url,
                        json={"jsonrpc": "2.0", "id": 2 + page, "method": "tools/list", "params": params},
                        headers=headers,
                    )
                )
                tools.extend(result.get("tools") or [])
                cursor = result.get("nextCursor")
                if not cursor:
                    break
        return tools

    return await _with_token_retry(auth_type, auth_config, _attempt)


def _schema(value) -> dict:
    """A stored or advertised input schema as a dict (jsonb may come back as text)."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value or {}


def diff_discovered_tools(existing: list[dict], tools: list[dict]) -> dict:
    """Count what a discovery run changes against the server's stored tools.

    A previously deactivated tool that comes back counts as added. Removed means
    an active tool the server no longer offers.
    """
    active = {row["tool_name"]: row for row in existing if row.get("is_active")}
    advertised = {tool.get("name", ""): tool for tool in tools}

    changes = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    for name, tool in advertised.items():
        row = active.get(name)
        if row is None:
            changes["added"] += 1
        elif (row.get("description") or "") != (tool.get("description") or "") or _schema(
            row.get("input_schema")
        ) != _schema(tool.get("inputSchema")):
            changes["changed"] += 1
        else:
            changes["unchanged"] += 1
    changes["removed"] = sum(1 for name in active if name not in advertised)
    return changes


async def store_discovered_tools(
    org_id: int, server_id: int, tools: list[dict]
) -> tuple[list[dict], dict]:
    """Database phase of discovery: upsert advertised tools, deactivate the rest.

    Returns the stored tools, one per name, and the counts from
    diff_discovered_tools.
    """
    # A server that lists a name twice gets one row; the last entry wins, as the
    # upserts below would do anyway.
    advertised = {tool.get("name", ""): tool for tool in tools}
    discovered_tools = []

    async with get_db() as db:
        # Lock the server row so two discoveries of one server run one after the
        # other; otherwise both diff against the same old rows and report the
        # same changes. NO KEY UPDATE, not UPDATE: inserts into tables with a
        # foreign key to this row (audit logs) take KEY SHARE and must not wait.
        await db.execute(
            text("""
                SELECT id FROM ai_gateway_mcp_servers
                WHERE organization_id = :org_id AND id = :server_id
                FOR NO KEY UPDATE
            """),
            {"org_id": org_id, "server_id": server_id},
        )
        existing = await db.execute(
            text("""
                SELECT tool_name, description, input_schema, is_active
                FROM ai_gateway_mcp_tools
                WHERE organization_id = :org_id AND server_id = :server_id
            """),
            {"org_id": org_id, "server_id": server_id},
        )
        changes = diff_discovered_tools([dict(r) for r in existing.mappings().all()], tools)

        for tool_name, tool in advertised.items():
            description = tool.get("description", "")
            input_schema = tool.get("inputSchema", {})

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

        if advertised:
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
                    "tool_names": list(advertised),
                },
            )
        else:
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
        "Discovered %d tools from server %s for org %s",
        len(discovered_tools), server_id, org_id,
    )
    return discovered_tools, changes


def describe_discovery_error(exc: BaseException, budget_seconds) -> str:
    """A message the admin can act on. Never includes URLs or raw exception text."""
    if isinstance(exc, (asyncio.TimeoutError, httpx.TimeoutException)):
        message = f"The server did not respond within {budget_seconds:g} seconds"
    elif isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        message = (
            f"The server rejected the credentials (HTTP {code})"
            if code in (401, 403)
            else f"The server returned HTTP {code}"
        )
    elif isinstance(exc, httpx.RequestError):
        message = "Could not connect to the server address"
    elif isinstance(exc, McpRpcError):
        message = f"The server returned an error: {exc.message[:200]}"
    elif isinstance(exc, TokenError):
        message = str(exc)
    elif isinstance(exc, UnsafeOutboundUrlError):
        message = f"The server address is not allowed: {exc}"
    elif isinstance(exc, (ValueError, KeyError, TypeError)):
        message = "The server's reply was not a valid MCP response"
    else:
        message = "Discovery failed unexpectedly"
    return message[:MAX_DISCOVERY_ERROR_CHARS]


async def run_discovery(
    org_id: int,
    server: dict,
    budget_seconds,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> dict:
    """Discover a server's tools within a budget and record the outcome.

    Only the network phase is bounded, so a timeout never leaves a half-written
    tool list. Never raises: failures come back as status "failed".
    """
    server_id = server.get("id")

    async def record_failure(error: str) -> None:
        try:
            await mcp_servers_crud.record_discovery_result(org_id, server_id, error)
        except Exception:  # noqa: BLE001 — must not replace the returned result
            logger.exception("Could not record MCP discovery failure for server %s", server_id)

    try:
        tools = await asyncio.wait_for(
            fetch_server_tools(
                server["url"],
                server.get("auth_type") or "none",
                server.get("auth_config") or {},
                transport=transport,
            ),
            timeout=budget_seconds,
        )
    except Exception as exc:  # noqa: BLE001 — every failure becomes a stored message
        error = describe_discovery_error(exc, budget_seconds)
        logger.warning("MCP discovery failed for server %s: %s", server_id, error)
        await record_failure(error)
        return {"status": "failed", "tools_discovered": 0, "changes": None, "error": error}

    try:
        stored, changes = await store_discovered_tools(org_id, server["id"], tools)
        await mcp_servers_crud.record_discovery_result(org_id, server["id"], None)
    except Exception:  # noqa: BLE001 — database or malformed-tool failure
        logger.exception("MCP discovery could not save tools for server %s", server_id)
        error = "Could not save the discovered tools"
        await record_failure(error)
        return {"status": "failed", "tools_discovered": 0, "changes": None, "error": error}
    return {"status": "success", "tools_discovered": len(stored), "changes": changes, "error": None}


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
    async def _attempt() -> tuple[dict, Optional[str]]:
        sid = session_id
        url = assert_safe_outbound_url(server_url)
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **(await auth_headers_for(auth_type, auth_config)),
        }
        new_session = None

        async with httpx.AsyncClient(timeout=60) as client:
            if not sid:
                init_resp = await client.post(
                    url,
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
                sid = init_resp.headers.get("mcp-session-id")
                new_session = sid

                if sid:
                    headers["Mcp-Session-Id"] = sid

                # notifications/initialized only after fresh handshake
                await client.post(
                    url,
                    json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                    headers=headers,
                )
            else:
                headers["Mcp-Session-Id"] = sid

            resp = await client.post(
                url,
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

    return await _with_token_retry(auth_type, auth_config, _attempt)
