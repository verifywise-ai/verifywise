"""
MCP Gateway proxy service — agent key authentication, tool ACL enforcement,
rate limiting, and tool call forwarding for the MCP Gateway.
"""

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qsl, quote, quote_plus, unquote, urlsplit

import httpx
from fastapi import Request, HTTPException
from sqlalchemy import text

import crud.mcp_servers as mcp_servers_crud
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

class UpstreamResponseError(Exception):
    """The upstream MCP server answered with something that is not a usable
    JSON-RPC response. Not a ValueError: it is the server's fault, not the
    agent's arguments, so it counts against the circuit breaker."""


class UpstreamToolError(ValueError):
    """A JSON-RPC error returned by a healthy upstream for a tool call (unknown
    tool, bad arguments, ...). A ValueError so it is not counted against the
    circuit breaker; the router passes its code and message on to the agent,
    as a direct connection to that server would show them."""

    def __init__(self, code: int, message: str):
        super().__init__(f"Tool call failed: {message}")
        self.code = code
        self.message = message

    @classmethod
    def from_rpc(cls, error, secrets: tuple[str, ...] = ()) -> "UpstreamToolError":
        """Build from a JSON-RPC error object. Only the code and message are
        kept, and every secret the gateway added to the request is masked."""
        if not isinstance(error, dict):
            return cls(-32603, _redact(str(error), secrets)[:500])
        code = error.get("code")
        return cls(
            code if isinstance(code, int) and not isinstance(code, bool) else -32603,
            _redact(str(error.get("message") or "Unknown error"), secrets)[:500],
        )


# Headers the gateway sets that carry no secret.
_PLAIN_HEADERS = frozenset({"content-type", "accept", "mcp-session-id"})
_MIN_SECRET_CHARS = 6


def _looks_like_path_secret(segment: str) -> bool:
    """A URL path segment that may be a credential (some servers put the key
    in the path): long, or mid-length with a digit. Plain words such as
    "mcp" or "servers" are left alone so messages stay readable."""
    return len(segment) >= 16 or (len(segment) >= 8 and any(c.isdigit() for c in segment))


def _request_secrets(server_url: str, headers: dict) -> tuple[str, ...]:
    """Values the gateway adds to a forwarded call that the agent never holds:
    auth header values (and the token after a scheme such as Bearer), the
    server URL's user, password, query values and secret-looking path
    segments, each also in its percent-encoded forms. Longest first, so a
    value is masked whole."""
    found = set()
    for name, value in headers.items():
        if name.lower() in _PLAIN_HEADERS or not isinstance(value, str):
            continue
        found.add(value)
        _scheme, _, token = value.partition(" ")
        if token:
            found.add(token)
    parts = urlsplit(server_url)
    found.update(v for v in (parts.username, parts.password) if v)
    found.update(v for _, v in parse_qsl(parts.query))
    found.update(pair.partition("=")[2] for pair in parts.query.split("&"))  # as written in the URL
    found.update(unquote(seg) for seg in parts.path.split("/") if _looks_like_path_secret(unquote(seg)))
    found |= {quote(v, safe="") for v in found} | {quote_plus(v) for v in found}
    return tuple(sorted((v for v in found if len(v) >= _MIN_SECRET_CHARS), key=len, reverse=True))


def _redact(text_value: str, secrets: tuple[str, ...]) -> str:
    for secret in secrets:
        text_value = text_value.replace(secret, "[redacted]")
    return text_value


def _answers_call(resp: httpx.Response, request_id) -> bool:
    """The reply is a JSON-RPC response to this call, so the call ran."""
    try:
        return _parse_response(resp).get("id") == request_id
    except UpstreamResponseError:
        return False


def _is_stale_session(resp: httpx.Response, request_id) -> bool:
    """The upstream rejected the session id before running the call: 404 per
    the MCP spec; some servers answer 400 and name the session in the body.

    A reply that is a JSON-RPC response to this call came from the tool after
    it ran (say, a lookup that failed with 404, or "user session expired" from
    an API it called), so it is never treated as stale: retrying it would run
    the tool twice."""
    if resp.status_code == 404:
        return not _answers_call(resp, request_id)
    if resp.status_code == 400 and "session" in resp.text.lower():
        return not _answers_call(resp, request_id)
    return False


def _raise_rpc_error_from_4xx(resp: httpx.Response, request_id, secrets: tuple[str, ...]) -> None:
    """A 400 or 422 carrying a JSON-RPC error, or any 4xx whose JSON-RPC error
    answers this call, is the server's answer to the call: it goes to the agent
    and does not charge the breaker. Other 4xx replies (a moved endpoint, 429)
    fall through to raise_for_status and count as upstream failures; 401 and
    403 always do, so the token retry and the credentials message apply."""
    if not 400 <= resp.status_code < 500 or resp.status_code in (401, 403):
        return
    try:
        data = _parse_response(resp)
    except UpstreamResponseError:
        return
    if "error" not in data:
        return
    if resp.status_code in (400, 422) or data.get("id") == request_id:
        raise UpstreamToolError.from_rpc(data["error"], secrets)


_SSE_LINE_BREAK = re.compile(r"\r\n|\r|\n")


def _sse_messages(text_body: str):
    """Yield the JSON payload of each event in a Server-Sent Events body.

    An event's data may span several `data:` lines (joined with newlines), and
    the space after the colon is optional. Events whose data is not JSON are
    skipped."""
    data_lines: list[str] = []
    # Only CR, LF and CRLF end an SSE line. str.splitlines() would also split
    # at U+2028, U+2029 and U+0085, which may appear unescaped inside JSON.
    for raw in _SSE_LINE_BREAK.split(text_body) + [""]:
        if raw == "":
            if data_lines:
                try:
                    yield json.loads("\n".join(data_lines))
                except ValueError:
                    pass
                data_lines = []
            continue
        if raw.startswith("data:"):
            value = raw[5:]
            data_lines.append(value[1:] if value.startswith(" ") else value)


def _is_response(message, request_id) -> bool:
    """A JSON-RPC response (not a notification or request), to request_id if given."""
    if not isinstance(message, dict) or "method" in message:
        return False
    if "result" not in message and "error" not in message:
        return False
    return request_id is None or message.get("id") == request_id


def _parse_sse_response(text_body: str, request_id=None) -> dict:
    """Extract the JSON-RPC response from a Server-Sent Events body.

    A server may send notifications (progress, log messages) or its own
    requests on the stream before the response, so the response is the first
    message that answers request_id."""
    for message in _sse_messages(text_body):
        if _is_response(message, request_id):
            return message
    raise UpstreamResponseError(f"No JSON-RPC response in SSE body: {text_body[:200]}")


def _parse_response(resp: httpx.Response, request_id=None) -> dict:
    """Parse an MCP response — handles both JSON and SSE content types."""
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        return _parse_sse_response(resp.text, request_id)
    try:
        data = resp.json()
    except ValueError:
        raise UpstreamResponseError(
            f"Upstream sent a non-JSON response ({content_type or 'no content type'}): {resp.text[:200]}"
        ) from None
    if not isinstance(data, dict):
        raise UpstreamResponseError("Upstream sent a JSON response that is not a JSON-RPC object")
    return data


# ─── Server Tool Discovery ─────────────────────────────────────────────────

ON_SAVE_DISCOVERY_SECONDS = 10
# Kept under the Express proxy timeout (30 s) so this error, not a generic
# gateway timeout, is what the user sees.
MANUAL_DISCOVERY_SECONDS = 25
# How long a forwarded tools/call may take upstream.
TOOL_CALL_TIMEOUT_SECONDS = 60
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
    elif isinstance(exc, (UpstreamResponseError, ValueError, KeyError, TypeError)):
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
    Returns (result_dict, backend_session_id): the id is None when no new
    session was opened, "" when the upstream is stateless (so a cached id must
    be dropped), otherwise the new session's id.
    """
    async def _handshake(client: httpx.AsyncClient, url: str, headers: dict) -> Optional[str]:
        """Open a backend session; returns its id (None for a stateless server)."""
        headers.pop("Mcp-Session-Id", None)
        init_resp = await client.post(
            url,
            json={
                "jsonrpc": "2.0",
                "id": 0,
                "method": "initialize",
                "params": {
                    "protocolVersion": _PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "VerifyWise MCP Gateway", "version": "1.0.0"},
                },
            },
            headers=headers,
        )
        init_resp.raise_for_status()
        # "" (not None) for a stateless server, so a stale cached id is replaced.
        sid = init_resp.headers.get("mcp-session-id") or ""
        if sid:
            headers["Mcp-Session-Id"] = sid
        # notifications/initialized only after fresh handshake
        await client.post(
            url,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=headers,
        )
        return sid

    async def _attempt() -> tuple[dict, Optional[str]]:
        url = assert_safe_outbound_url(server_url)
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **(await auth_headers_for(auth_type, auth_config)),
        }
        call = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }
        secrets = _request_secrets(url, headers)
        new_session = None

        async with httpx.AsyncClient(timeout=TOOL_CALL_TIMEOUT_SECONDS) as client:
            if session_id:
                headers["Mcp-Session-Id"] = session_id
            else:
                new_session = await _handshake(client, url, headers)

            resp = await client.post(url, json=call, headers=headers)
            if session_id and _is_stale_session(resp, call["id"]):
                # The upstream no longer knows the cached session (it restarted
                # or expired it), so it did not run the call. Open a new session
                # and send the call once more, as the MCP spec asks of clients.
                new_session = await _handshake(client, url, headers)
                resp = await client.post(url, json=call, headers=headers)
            _raise_rpc_error_from_4xx(resp, call["id"], secrets)
            resp.raise_for_status()
            data = _parse_response(resp, request_id=1)

        if "error" in data:
            raise UpstreamToolError.from_rpc(data["error"], secrets)

        result = data.get("result") or {}
        if not isinstance(result, dict):
            raise UpstreamResponseError("Upstream tools/call result is not a JSON object")
        return result, new_session

    return await _with_token_retry(auth_type, auth_config, _attempt)
