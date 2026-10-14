"""MCP tool discovery: protocol, paging, budget, friendly errors.

No live services: httpx.MockTransport stands in for the MCP server and the
database writes are replaced with fakes."""

import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest

import services.mcp_proxy_service as svc


def _server(**over):
    base = {"id": 5, "url": "https://mcp.example.com/mcp?token=supersecret", "auth_type": "none", "auth_config": {}}
    base.update(over)
    return base


def _rpc(result, session=None):
    headers = {"content-type": "application/json"}
    if session:
        headers["mcp-session-id"] = session
    return lambda req_id: httpx.Response(200, headers=headers, json={"jsonrpc": "2.0", "id": req_id, "result": result})


def _transport(pages, seen, session="sess-1"):
    """MCP server: initialize, accept initialized, serve tools/list pages."""
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append((body.get("method"), body.get("params"), dict(request.headers)))
        method = body.get("method")
        if method == "initialize":
            return _rpc({"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}}, session)(body["id"])
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            cursor = (body.get("params") or {}).get("cursor")
            index = int(cursor) if cursor else 0
            page = {"tools": pages[index]}
            if index + 1 < len(pages):
                page["nextCursor"] = str(index + 1)
            return _rpc(page)(body["id"])
        return httpx.Response(400)
    return httpx.MockTransport(handler)


@pytest.fixture
def recorded(monkeypatch):
    calls = {"store": [], "result": []}

    async def store(org_id, server_id, tools):
        calls["store"].append((org_id, server_id, tools))
        return [{"tool_name": t["name"]} for t in tools]

    async def record(org_id, server_id, error):
        calls["result"].append((org_id, server_id, error))

    monkeypatch.setattr(svc, "store_discovered_tools", store)
    monkeypatch.setattr(svc.mcp_servers_crud, "record_discovery_result", record)
    return calls


@pytest.mark.asyncio
class TestProtocol:
    async def test_sends_initialized_before_tools_list(self):
        seen = []
        await svc.fetch_server_tools("https://x/mcp", "none", {}, transport=_transport([[{"name": "a"}]], seen))
        methods = [m for m, _, _ in seen]
        assert methods == ["initialize", "notifications/initialized", "tools/list"]
        assert seen[1][2].get("mcp-session-id") == "sess-1"
        assert seen[2][2].get("mcp-session-id") == "sess-1"

    async def test_follows_next_cursor(self):
        seen = []
        tools = await svc.fetch_server_tools(
            "https://x/mcp", "none", {},
            transport=_transport([[{"name": "a"}], [{"name": "b"}], [{"name": "c"}]], seen),
        )
        assert [t["name"] for t in tools] == ["a", "b", "c"]
        assert [p for m, p, _ in seen if m == "tools/list"][1] == {"cursor": "1"}

    async def test_page_cap(self):
        seen = []
        pages = [[{"name": f"t{i}"}] for i in range(svc.MAX_TOOL_PAGES + 5)]
        tools = await svc.fetch_server_tools("https://x/mcp", "none", {}, transport=_transport(pages, seen))
        assert len(tools) == svc.MAX_TOOL_PAGES

    async def test_sends_api_key_header(self):
        from utils.mcp_credentials import normalize_auth_config
        seen = []
        cfg = normalize_auth_config("api_key", {"header_name": "X-K", "api_key": "k-1"}, None)
        await svc.fetch_server_tools("https://x/mcp", "api_key", cfg, transport=_transport([[]], seen))
        assert seen[0][2].get("x-k") == "k-1"


@pytest.mark.asyncio
class TestRunDiscovery:
    async def test_success_records_healthy(self, recorded):
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[{"name": "a"}, {"name": "b"}]], []))
        assert out == {"status": "success", "tools_discovered": 2, "error": None}
        assert recorded["result"] == [(1, 5, None)]

    async def test_zero_tools_is_success(self, recorded):
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[]], []))
        assert out == {"status": "success", "tools_discovered": 0, "error": None}
        assert recorded["store"] == [(1, 5, [])]

    async def test_budget_exceeded_fails_without_storing(self, recorded):
        async def slow(request):
            await asyncio.sleep(5)
            return httpx.Response(200)
        out = await svc.run_discovery(1, _server(), 0.05, transport=httpx.MockTransport(slow))
        assert out["status"] == "failed"
        assert out["error"] == "The server did not respond within 0.05 seconds"
        assert recorded["store"] == []
        assert recorded["result"] == [(1, 5, out["error"])]

    async def test_401_message(self, recorded):
        t = httpx.MockTransport(lambda r: httpx.Response(401))
        out = await svc.run_discovery(1, _server(), 10, transport=t)
        assert out["error"] == "The server rejected the credentials (HTTP 401)"

    async def test_store_failure_returns_failed_and_records(self, recorded, monkeypatch):
        async def boom(org_id, server_id, tools):
            raise RuntimeError("db down")

        monkeypatch.setattr(svc, "store_discovered_tools", boom)
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[{"name": "a"}]], []))
        assert out == {"status": "failed", "tools_discovered": 0, "error": "Could not save the discovered tools"}
        assert recorded["result"] == [(1, 5, "Could not save the discovered tools")]

    async def test_record_failure_does_not_replace_result(self, monkeypatch):
        async def boom(org_id, server_id, error):
            raise RuntimeError("db down")

        monkeypatch.setattr(svc.mcp_servers_crud, "record_discovery_result", boom)
        t = httpx.MockTransport(lambda r: httpx.Response(401))
        out = await svc.run_discovery(1, _server(), 10, transport=t)
        assert out == {
            "status": "failed",
            "tools_discovered": 0,
            "error": "The server rejected the credentials (HTTP 401)",
        }


class TestErrorMessages:
    def _status_error(self, code):
        req = httpx.Request("POST", "https://mcp.example.com/mcp?token=supersecret")
        return httpx.HTTPStatusError("boom", request=req, response=httpx.Response(code, request=req))

    @pytest.mark.parametrize(
        "exc, expected",
        [
            ("403", "The server rejected the credentials (HTTP 403)"),
            ("500", "The server returned HTTP 500"),
            ("404", "The server returned HTTP 404"),
        ],
    )
    def test_http_status(self, exc, expected):
        assert svc.describe_discovery_error(self._status_error(int(exc)), 10) == expected

    def test_connect_error(self):
        exc = httpx.ConnectError("dns fail https://mcp.example.com/mcp?token=supersecret")
        assert svc.describe_discovery_error(exc, 10) == "Could not connect to the server address"

    def test_timeouts(self):
        assert svc.describe_discovery_error(asyncio.TimeoutError(), 10) == "The server did not respond within 10 seconds"
        assert svc.describe_discovery_error(httpx.ReadTimeout("t"), 10) == "The server did not respond within 10 seconds"

    def test_rpc_error_truncated(self):
        msg = svc.describe_discovery_error(svc.McpRpcError("x" * 500), 10)
        assert msg.startswith("The server returned an error: ")
        assert len(msg) <= len("The server returned an error: ") + 200

    def test_bad_body(self):
        assert svc.describe_discovery_error(ValueError("no json"), 10) == "The server's reply was not a valid MCP response"

    def test_error_messages_never_echo_url(self):
        for exc in (self._status_error(401), self._status_error(500), httpx.ConnectError("https://mcp.example.com/mcp?token=supersecret"), ValueError("token=supersecret")):
            assert "supersecret" not in svc.describe_discovery_error(exc, 10)

    def test_describe_maps_unsafe_before_generic_value_error(self):
        from utils.safe_outbound_url import UnsafeOutboundUrlError
        msg = svc.describe_discovery_error(UnsafeOutboundUrlError("URL protocol 'file:' is not allowed (only http/https)"), 10)
        assert msg == "The server address is not allowed: URL protocol 'file:' is not allowed (only http/https)"

    def test_max_length(self):
        assert len(svc.describe_discovery_error(svc.McpRpcError("y" * 5000), 10)) <= 500


@pytest.mark.asyncio
class TestUnsafeStoredUrl:
    async def test_discovery_refuses_without_any_request(self, recorded):
        seen = []

        def handler(request):
            seen.append(request)
            return httpx.Response(200)

        out = await svc.run_discovery(1, _server(url="http://0.0.0.0/?token=supersecret"), 10, transport=httpx.MockTransport(handler))
        assert out["status"] == "failed"
        assert out["error"].startswith("The server address is not allowed: ")
        assert "0.0.0.0" in out["error"] and "supersecret" not in out["error"]
        assert seen == []
        assert recorded["store"] == []
        assert recorded["result"] == [(1, 5, out["error"])]

    async def test_forward_tool_call_refuses_unsafe_url(self):
        with pytest.raises(ValueError, match="not allowed"):
            await svc.forward_tool_call("http://169.254.169.254/", "none", {}, "t", {})
