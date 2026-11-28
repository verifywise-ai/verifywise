"""MCP clients (Claude, the MCP SDKs, mcp-remote) against the /v1/mcp proxy.

Covers the session handshake without Redis, notifications, ping, the GET
stream's authentication, SSE parsing of upstream replies, a stale upstream
session, and how upstream failures reach the agent. No live services:
httpx.MockTransport for the upstream, fakes for the handler's collaborators."""

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
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.mcp_proxy as proxy
import services.mcp_proxy_service as svc
import services.mcp_session as sessions
from services.guardrail_service import ScanResult
from utils.mcp_credentials import normalize_auth_config

SERVER_URL = "https://mcp.example.com/mcp"
AGENT_KEY = {"id": 5, "organization_id": 1, "allowed_tools": [], "blocked_tools": [], "rate_limit_rpm": 0}
TOOL = {
    "id": 3,
    "tool_name": "search",
    "server_id": 9,
    "url": SERVER_URL,
    "auth_type": "none",
    "auth_config": {},
    "requires_approval": False,
}


def _request(body, headers=None):
    return SimpleNamespace(json=AsyncMock(return_value=body), headers=headers or {})


def _rpc(method, params=None, id=1):
    body = {"jsonrpc": "2.0", "method": method}
    if id is not None:
        body["id"] = id
    if params is not None:
        body["params"] = params
    return body


@pytest.fixture
def redis_down(monkeypatch):
    async def unreachable():
        raise ConnectionError("Error 111 connecting to localhost:6379. Connection refused.")

    monkeypatch.setattr(sessions, "get_redis", unreachable)


@pytest.fixture
def handler_fakes(monkeypatch):
    state = SimpleNamespace(audits=[], breaker=MagicMock(), forward=None)
    state.breaker.is_open = AsyncMock(return_value=False)
    state.breaker.record_success = AsyncMock()
    state.breaker.record_failure = AsyncMock()

    async def extract(request):
        return dict(AGENT_KEY)

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
    monkeypatch.setattr(proxy, "get_all_tools", AsyncMock(return_value=[{**TOOL, "description": "", "input_schema": {}}]))
    return state


# ─── Handshake, notifications, ping ─────────────────────────────────────────

@pytest.mark.asyncio
class TestHandshake:
    async def test_initialize_works_without_redis(self, handler_fakes, redis_down):
        response = await proxy.mcp_jsonrpc(_request(_rpc("initialize", {"protocolVersion": "2025-03-26"})))

        assert response.status_code == 200
        assert json.loads(response.body)["result"]["serverInfo"]["name"] == "VerifyWise MCP Gateway"
        assert response.headers["mcp-session-id"]

    async def test_tool_call_with_a_session_works_without_redis(self, handler_fakes, redis_down, monkeypatch):
        monkeypatch.setattr(proxy, "get_backend_session", sessions.get_backend_session)
        monkeypatch.setattr(proxy, "set_backend_session", sessions.set_backend_session)

        async def ok(**kwargs):
            assert kwargs["session_id"] is None
            return {"content": [{"type": "text", "text": "3 tables"}]}, "backend-1"

        handler_fakes.forward = ok
        response = await proxy.mcp_jsonrpc(
            _request(_rpc("tools/call", {"name": "search", "arguments": {}}), {"mcp-session-id": "gw-1"})
        )

        assert json.loads(response.body)["result"]["content"][0]["text"] == "3 tables"
        assert handler_fakes.audits[-1]["result_status"] == "success"

    @pytest.mark.parametrize("method", ["notifications/initialized", "notifications/cancelled"])
    async def test_notifications_get_202_and_no_body(self, handler_fakes, method):
        response = await proxy.mcp_jsonrpc(_request(_rpc(method, {}, id=None)))

        assert response.status_code == 202
        assert response.body == b""

    async def test_a_client_response_gets_202(self, handler_fakes):
        response = await proxy.mcp_jsonrpc(_request({"jsonrpc": "2.0", "id": 7, "result": {}}))

        assert response.status_code == 202

    async def test_ping_answers_an_empty_result(self, handler_fakes):
        response = await proxy.mcp_jsonrpc(_request(_rpc("ping", id=42)))

        assert json.loads(response.body) == {"jsonrpc": "2.0", "id": 42, "result": {}}

    async def test_a_batch_is_an_invalid_request(self, handler_fakes):
        response = await proxy.mcp_jsonrpc(_request([_rpc("ping")]))

        assert json.loads(response.body)["error"]["code"] == -32600

    async def test_null_params_is_a_json_rpc_error(self, handler_fakes):
        body = _rpc("tools/call")
        body["params"] = None
        response = await proxy.mcp_jsonrpc(_request(body))

        assert response.status_code == 200
        assert json.loads(response.body)["error"]["code"] == -32602


def test_get_stream_needs_an_agent_key():
    app = FastAPI()
    app.include_router(proxy.router)

    response = TestClient(app).get("/v1/mcp")

    assert response.status_code == 401


# ─── Session store ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestSessionStoreFailOpen:
    async def test_create_returns_an_id(self, redis_down):
        assert len(await sessions.create_session()) == 36

    async def test_lookup_returns_none(self, redis_down):
        assert await sessions.get_backend_session("gw-1", 9) is None

    async def test_store_does_not_raise(self, redis_down):
        await sessions.set_backend_session("gw-1", 9, "backend-1")


# ─── SSE parsing ────────────────────────────────────────────────────────────

class TestSseParsing:
    def test_skips_notifications_before_the_response(self):
        body = (
            'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\n'
            'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}\n\n'
        )
        assert svc._parse_sse_response(body, request_id=1)["result"] == {"content": []}

    def test_joins_multi_line_data_and_allows_no_space(self):
        body = 'data:{"jsonrpc":"2.0",\ndata: "id":1,\ndata:"result":{"ok":true}}\n\n'
        assert svc._parse_sse_response(body, request_id=1)["result"] == {"ok": True}

    def test_handles_crlf_line_endings(self):
        body = 'event: message\r\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\r\n\r\n'
        assert svc._parse_sse_response(body, request_id=1) == {"jsonrpc": "2.0", "id": 1, "result": {}}

    def test_ignores_a_response_to_another_request(self):
        body = 'data: {"jsonrpc":"2.0","id":0,"result":{}}\n\ndata: {"jsonrpc":"2.0","id":1,"result":{"x":1}}\n\n'
        assert svc._parse_sse_response(body, request_id=1)["result"] == {"x": 1}

    def test_no_response_raises(self):
        with pytest.raises(svc.UpstreamResponseError):
            svc._parse_sse_response(": keep-alive\n\n", request_id=1)

    def test_a_non_json_reply_raises(self):
        resp = httpx.Response(200, text="<html>Bad gateway</html>", headers={"content-type": "text/html"})
        with pytest.raises(svc.UpstreamResponseError):
            svc._parse_response(resp)


# ─── Forwarding ─────────────────────────────────────────────────────────────

@pytest.fixture
def route_forward_through(monkeypatch):
    real_client = httpx.AsyncClient

    def install(handler):
        transport = httpx.MockTransport(handler)
        monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kw: real_client(**{**kw, "transport": transport}))

    return install


@pytest.mark.asyncio
class TestForward:
    async def test_stale_session_opens_a_new_one_and_retries(self, route_forward_through):
        seen = []

        def handler(request):
            method = json.loads(request.content).get("method")
            sid = request.headers.get("mcp-session-id")
            seen.append((method, sid))
            if method == "initialize":
                return httpx.Response(200, json={"jsonrpc": "2.0", "id": 0, "result": {}}, headers={"mcp-session-id": "fresh"})
            if method == "tools/call" and sid == "stale":
                return httpx.Response(404, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32001, "message": "Session not found"}})
            if method == "tools/call":
                return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"content": []}})
            return httpx.Response(202)

        route_forward_through(handler)
        result, new_session = await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {}, session_id="stale")

        assert result == {"content": []}
        assert new_session == "fresh"
        assert seen == [
            ("tools/call", "stale"),
            ("initialize", None),
            ("notifications/initialized", "fresh"),
            ("tools/call", "fresh"),
        ]

    async def test_404_without_a_cached_session_is_not_retried(self, route_forward_through):
        calls = []

        def handler(request):
            method = json.loads(request.content).get("method")
            calls.append(method)
            if method == "tools/call":
                return httpx.Response(404)
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 0, "result": {}})

        route_forward_through(handler)
        with pytest.raises(httpx.HTTPStatusError):
            await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {})
        assert calls.count("tools/call") == 1

    async def test_upstream_rpc_error_keeps_its_code_and_message(self, route_forward_through):
        def handler(request):
            method = json.loads(request.content).get("method")
            if method == "tools/call":
                return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "Unknown table: orders"}})
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 0, "result": {}})

        route_forward_through(handler)
        with pytest.raises(svc.UpstreamToolError) as exc:
            await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {})
        assert (exc.value.code, exc.value.message) == (-32602, "Unknown table: orders")


# ─── What the agent sees ────────────────────────────────────────────────────

def _call():
    return _request(_rpc("tools/call", {"name": "search", "arguments": {"q": "orders"}}))


@pytest.mark.asyncio
class TestUpstreamErrorsToAgent:
    async def test_upstream_tool_error_is_passed_on(self, handler_fakes):
        async def fail(**kwargs):
            raise svc.UpstreamToolError(-32602, "Unknown table: orders")

        handler_fakes.forward = fail
        error = json.loads((await proxy.mcp_jsonrpc(_call())).body)["error"]

        assert error == {"code": -32602, "message": "Unknown table: orders"}
        handler_fakes.breaker.record_failure.assert_not_awaited()

    async def test_a_gateway_code_from_upstream_is_not_repeated(self, handler_fakes):
        async def fail(**kwargs):
            raise svc.UpstreamToolError(-32001, "Tool requires approval")

        handler_fakes.forward = fail
        error = json.loads((await proxy.mcp_jsonrpc(_call())).body)["error"]

        assert error["code"] == -32603

    async def test_upstream_http_error_names_the_status(self, handler_fakes):
        async def fail(**kwargs):
            request = httpx.Request("POST", SERVER_URL)
            raise httpx.HTTPStatusError("boom", request=request, response=httpx.Response(500, request=request))

        handler_fakes.forward = fail
        error = json.loads((await proxy.mcp_jsonrpc(_call())).body)["error"]

        assert error == {"code": -32603, "message": "Upstream MCP server error: The server returned HTTP 500"}
        handler_fakes.breaker.record_failure.assert_awaited_once()
        assert handler_fakes.audits[-1]["result_status"] == "error"

    async def test_upstream_timeout_says_so(self, handler_fakes):
        async def fail(**kwargs):
            raise httpx.ReadTimeout("timed out")

        handler_fakes.forward = fail
        error = json.loads((await proxy.mcp_jsonrpc(_call())).body)["error"]

        assert error["message"] == "Upstream MCP server error: The server did not respond within 60 seconds"

    async def test_unreadable_reply_says_so_without_the_body(self, handler_fakes):
        async def fail(**kwargs):
            raise svc.UpstreamResponseError("No JSON-RPC response in SSE body: secret-ish text")

        handler_fakes.forward = fail
        error = json.loads((await proxy.mcp_jsonrpc(_call())).body)["error"]

        assert error["message"] == "Upstream MCP server error: The server's reply was not a valid MCP response"
        assert "secret" in handler_fakes.audits[-1]["result_summary"]


# ─── Review follow-ups ──────────────────────────────────────────────────────

def test_sse_keeps_unicode_line_separators_inside_json():
    text = "a b c\u0085d"
    body = 'data: {"jsonrpc":"2.0","id":1,"result":{"text":"' + text + '"}}\n\n'
    assert svc._parse_sse_response(body, request_id=1)["result"]["text"] == text


def _rpc_upstream(call_response):
    """initialize succeeds; tools/call gets call_response(request)."""
    def handler(request):
        method = json.loads(request.content).get("method")
        if method == "tools/call":
            return call_response(request)
        if method == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 0, "result": {}})
        return httpx.Response(202)
    return handler


@pytest.mark.asyncio
class TestReviewFollowUps:
    async def test_upstream_error_masks_credentials_the_gateway_added(self, route_forward_through):
        def call(request):
            token = request.headers["authorization"].split(" ", 1)[1]
            message = f"Request with token {token} to {request.url} failed"
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": message}})

        route_forward_through(_rpc_upstream(call))
        cfg = {"token": "s3cr3t-bearer-token"}

        with pytest.raises(svc.UpstreamToolError) as exc:
            await svc.forward_tool_call(
                f"{SERVER_URL}?api_key=query-secret-123", "bearer", normalize_auth_config("bearer", cfg, None), "search", {}
            )
        assert "s3cr3t-bearer-token" not in exc.value.message
        assert "query-secret-123" not in exc.value.message
        assert exc.value.message.count("[redacted]") == 2

    async def test_4xx_with_a_json_rpc_error_is_the_servers_answer(self, route_forward_through):
        route_forward_through(_rpc_upstream(lambda r: httpx.Response(
            400, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "Missing argument: name"}})))

        with pytest.raises(svc.UpstreamToolError) as exc:
            await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {})
        assert (exc.value.code, exc.value.message) == (-32602, "Missing argument: name")

    async def test_403_with_a_json_rpc_error_stays_an_http_error(self, route_forward_through):
        route_forward_through(_rpc_upstream(lambda r: httpx.Response(
            403, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "Forbidden"}})))

        with pytest.raises(httpx.HTTPStatusError):
            await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {})

    async def test_400_naming_the_session_on_a_cached_session_is_retried(self, route_forward_through):
        seen = []

        def call(request):
            sid = request.headers.get("mcp-session-id")
            seen.append(sid)
            if sid == "stale":
                return httpx.Response(400, text="Bad Request: No valid session ID provided")
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"content": []}})

        route_forward_through(_rpc_upstream(call))
        result, _ = await svc.forward_tool_call(SERVER_URL, "none", {}, "search", {}, session_id="stale")

        assert result == {"content": []}
        assert seen == ["stale", None]

    async def test_an_id_without_a_method_is_an_invalid_request(self, handler_fakes):
        response = await proxy.mcp_jsonrpc(_request({"jsonrpc": "2.0", "id": 3, "method": None}))

        assert json.loads(response.body) == {"jsonrpc": "2.0", "id": 3, "error": {"code": -32600, "message": "Invalid Request"}}

    async def test_a_notification_without_jsonrpc_gets_no_body(self, handler_fakes):
        response = await proxy.mcp_jsonrpc(_request({"method": "notifications/initialized"}))

        assert response.status_code == 202
        assert response.body == b""


def test_get_stream_ends_when_the_key_is_revoked(monkeypatch):
    from fastapi import HTTPException

    checks = {"n": 0}

    async def extract(request):
        checks["n"] += 1
        if checks["n"] > 1:
            raise HTTPException(status_code=401, detail="Agent key has been revoked")
        return dict(AGENT_KEY)

    monkeypatch.setattr(proxy, "extract_agent_key", extract)
    monkeypatch.setattr(proxy, "SSE_KEEPALIVE_SECONDS", 0)
    monkeypatch.setattr(proxy, "SSE_KEY_RECHECK_BEATS", 2)
    app = FastAPI()
    app.include_router(proxy.router)

    response = TestClient(app).get("/v1/mcp")

    assert response.status_code == 200
    assert response.text == ": keep-alive\n\n" * 2
    assert checks["n"] == 2
