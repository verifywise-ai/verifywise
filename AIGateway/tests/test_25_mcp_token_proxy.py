"""MCP proxy with token auth types: discovery, tool calls and server health.

No live services: httpx.MockTransport for the upstream, fakes for the token
fetch, the database and the proxy handler's collaborators."""

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest

import crud.mcp_servers as mcp_servers_crud
import routers.mcp_proxy as proxy
import services.mcp_proxy_service as svc
from services import mcp_token_service as tokens
from services.guardrail_service import ScanResult
from services.mcp_token_service import TokenError
from utils.mcp_credentials import normalize_auth_config

pytestmark = pytest.mark.asyncio

SERVER_URL = "https://mcp.example.com/mcp"
AWS_MESSAGE = "AWS rejected the access key (InvalidClientTokenId)"


def oauth_cfg():
    return normalize_auth_config(
        "oauth",
        {"client_id": "app", "client_secret": "s3cret", "token_url": "https://auth.example.com/token"},
        None,
    )


@pytest.fixture(autouse=True)
def _clean_state():
    tokens._reset_cache()
    tokens._reset_outcomes()
    yield
    tokens._reset_cache()
    tokens._reset_outcomes()


@pytest.fixture
def token_fetches(monkeypatch):
    """Replace the token fetch; each fetch returns tok1, tok2, ..."""
    fetched = []

    async def fake_get(auth_type, cfg, *, transport=None):
        fetched.append(auth_type)
        return f"tok{len(fetched)}"

    monkeypatch.setattr(tokens, "get_access_token", fake_get)
    return fetched


def upstream(statuses, seen):
    """Answers each POST; `statuses` maps an initialize attempt number to a status."""
    attempts = {"initialize": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method")
        seen.append((method, request.headers.get("authorization")))
        if method == "initialize":
            attempts["initialize"] += 1
            status = statuses.get(attempts["initialize"], 200)
            if status != 200:
                return httpx.Response(status)
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}})
        if method == "tools/list":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 2, "result": {"tools": [{"name": "t"}]}})
        return httpx.Response(202)

    return httpx.MockTransport(handler)


class TestDiscoveryTokens:
    async def test_fetch_tools_uses_bearer_token(self, token_fetches):
        seen = []
        tools = await svc.fetch_server_tools(SERVER_URL, "oauth", oauth_cfg(), transport=upstream({}, seen))

        assert tools == [{"name": "t"}]
        assert {auth for _, auth in seen} == {"Bearer tok1"}

    async def test_401_invalidates_and_retries_once(self, token_fetches):
        seen = []
        tools = await svc.fetch_server_tools(
            SERVER_URL, "oauth", oauth_cfg(), transport=upstream({1: 401}, seen)
        )

        assert tools == [{"name": "t"}]
        assert len(token_fetches) == 2
        assert [auth for m, auth in seen if m == "initialize"] == ["Bearer tok1", "Bearer tok2"]

    async def test_second_401_raises(self, token_fetches):
        with pytest.raises(httpx.HTTPStatusError):
            await svc.fetch_server_tools(
                SERVER_URL, "oauth", oauth_cfg(), transport=upstream({1: 401, 2: 401, 3: 401}, [])
            )
        assert len(token_fetches) == 2

    async def test_static_types_no_retry(self, token_fetches):
        seen = []
        cfg = normalize_auth_config("bearer", {"token": "static"}, None)
        with pytest.raises(httpx.HTTPStatusError):
            await svc.fetch_server_tools(SERVER_URL, "bearer", cfg, transport=upstream({1: 401}, seen))

        assert token_fetches == []
        assert [m for m, _ in seen] == ["initialize"]

    async def test_discovery_records_token_error(self, monkeypatch):
        async def failing(auth_type, cfg, *, transport=None):
            raise TokenError(AWS_MESSAGE)

        recorded = []

        async def record(org_id, server_id, error):
            recorded.append((org_id, server_id, error))

        monkeypatch.setattr(tokens, "get_access_token", failing)
        monkeypatch.setattr(mcp_servers_crud, "record_discovery_result", record)

        result = await svc.run_discovery(
            1,
            {"id": 7, "url": SERVER_URL, "auth_type": "aws_iam", "auth_config": {"region": "us-east-1"}},
            5,
            transport=upstream({}, []),
        )

        assert result["status"] == "failed"
        assert result["error"] == AWS_MESSAGE
        assert recorded == [(1, 7, AWS_MESSAGE)]


def forward_upstream(initialize_statuses, seen):
    """Upstream for forward_tool_call: initialize answers per attempt, tools/call succeeds."""
    attempts = {"initialize": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        method = json.loads(request.content).get("method")
        seen.append((method, request.headers.get("authorization")))
        if method == "initialize":
            attempts["initialize"] += 1
            status = initialize_statuses.get(attempts["initialize"], 200)
            return httpx.Response(status, json={"jsonrpc": "2.0", "id": 0, "result": {}})
        if method == "tools/call":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"content": []}})
        return httpx.Response(202)

    return httpx.MockTransport(handler)


@pytest.fixture
def route_forward_through(monkeypatch):
    real_client = httpx.AsyncClient

    def install(transport):
        monkeypatch.setattr(
            svc.httpx, "AsyncClient", lambda **kw: real_client(**{**kw, "transport": transport})
        )

    return install


class TestForwardTokens:
    async def test_forward_retries_a_401_once(self, token_fetches, route_forward_through):
        seen = []
        route_forward_through(forward_upstream({1: 401}, seen))

        result, _ = await svc.forward_tool_call(SERVER_URL, "oauth", oauth_cfg(), "t", {})

        assert result == {"content": []}
        assert len(token_fetches) == 2
        assert [a for m, a in seen if m == "initialize"] == ["Bearer tok1", "Bearer tok2"]

    async def test_forward_second_401_raises(self, token_fetches, route_forward_through):
        route_forward_through(forward_upstream({1: 401, 2: 401, 3: 401}, []))

        with pytest.raises(httpx.HTTPStatusError):
            await svc.forward_tool_call(SERVER_URL, "oauth", oauth_cfg(), "t", {})
        assert len(token_fetches) == 2

    async def test_forward_static_type_no_retry(self, token_fetches, route_forward_through):
        seen = []
        route_forward_through(forward_upstream({1: 401}, seen))
        cfg = normalize_auth_config("bearer", {"token": "static"}, None)

        with pytest.raises(httpx.HTTPStatusError):
            await svc.forward_tool_call(SERVER_URL, "bearer", cfg, "t", {})
        assert [m for m, _ in seen] == ["initialize"]


class TestNoteTokenOutcome:
    async def test_writes_on_change_only(self, monkeypatch):
        record = AsyncMock()
        monkeypatch.setattr(mcp_servers_crud, "record_discovery_result", record)

        for error in ("bad key", "bad key", "bad key", None, None):
            await tokens.note_token_outcome(1, 9, error)

        assert [c.args for c in record.await_args_list] == [(1, 9, "bad key"), (1, 9, None)]

    async def test_servers_are_tracked_separately(self, monkeypatch):
        record = AsyncMock()
        monkeypatch.setattr(mcp_servers_crud, "record_discovery_result", record)

        await tokens.note_token_outcome(1, 9, None)
        await tokens.note_token_outcome(1, 10, None)

        assert record.await_count == 2

    async def test_database_error_is_swallowed_and_retried_next_time(self, monkeypatch):
        record = AsyncMock(side_effect=[RuntimeError("db down"), None])
        monkeypatch.setattr(mcp_servers_crud, "record_discovery_result", record)

        await tokens.note_token_outcome(1, 9, "bad key")
        await tokens.note_token_outcome(1, 9, "bad key")

        assert record.await_count == 2


# ─── Proxy handler ───────────────────────────────────────────────────────────

TOOL = {
    "id": 3,
    "tool_name": "get_thing",
    "server_id": 9,
    "url": SERVER_URL,
    "auth_type": "oauth",
    "auth_config": {},
    "requires_approval": False,
}


@pytest.fixture
def handler_fakes(monkeypatch):
    state = SimpleNamespace(audits=[], breaker=MagicMock(), note=AsyncMock(), forward=None)
    state.breaker.is_open = AsyncMock(return_value=False)
    state.breaker.record_success = AsyncMock()
    state.breaker.record_failure = AsyncMock()

    async def extract(request):
        return {"id": 5, "organization_id": 1, "allowed_tools": [], "blocked_tools": [], "rate_limit_rpm": 0}

    async def log(**kwargs):
        state.audits.append(kwargs)

    async def forward(**kwargs):
        return await state.forward(**kwargs)

    monkeypatch.setattr(proxy, "extract_agent_key", extract)
    monkeypatch.setattr(proxy, "resolve_tool", AsyncMock(return_value=dict(TOOL)))
    monkeypatch.setattr(proxy, "enforce_mcp_rate_limits", AsyncMock())
    monkeypatch.setattr(proxy, "scan_tool_input", AsyncMock(return_value=ScanResult()))
    monkeypatch.setattr(proxy, "log_tool_call", log)
    monkeypatch.setattr(proxy, "forward_tool_call", forward)
    monkeypatch.setattr(proxy, "CircuitBreaker", state.breaker)
    monkeypatch.setattr(proxy, "check_anomaly", AsyncMock(return_value=False))
    monkeypatch.setattr(proxy, "get_backend_session", AsyncMock(return_value=None))
    monkeypatch.setattr(proxy, "set_backend_session", AsyncMock())
    monkeypatch.setattr(proxy, "note_token_outcome", state.note)
    return state


def _call():
    return SimpleNamespace(
        json=AsyncMock(return_value={
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "get_thing", "arguments": {}},
        }),
        headers={"mcp-session-id": "gw-1"},
    )


class TestProxyHandler:
    async def test_tool_call_token_error_generic_to_agent(self, handler_fakes):
        async def boom(**kwargs):
            raise TokenError(AWS_MESSAGE)

        handler_fakes.forward = boom

        response = await proxy.mcp_jsonrpc(_call())
        error = json.loads(response.body)["error"]

        assert error == {"code": -32603, "message": "Internal error"}
        assert handler_fakes.audits[-1]["result_summary"] == AWS_MESSAGE
        assert handler_fakes.audits[-1]["is_error"] is True
        handler_fakes.breaker.record_failure.assert_not_awaited()
        handler_fakes.note.assert_awaited_once_with(1, 9, AWS_MESSAGE)

    async def test_success_marks_token_server_healthy(self, handler_fakes):
        async def ok(**kwargs):
            return {"content": [{"type": "text", "text": "fine"}]}, None

        handler_fakes.forward = ok

        await proxy.mcp_jsonrpc(_call())

        handler_fakes.note.assert_awaited_once_with(1, 9, None)

    async def test_success_on_static_server_does_not_touch_health(self, handler_fakes, monkeypatch):
        monkeypatch.setattr(proxy, "resolve_tool", AsyncMock(return_value={**TOOL, "auth_type": "bearer"}))

        async def ok(**kwargs):
            return {"content": []}, None

        handler_fakes.forward = ok

        await proxy.mcp_jsonrpc(_call())

        handler_fakes.note.assert_not_awaited()
