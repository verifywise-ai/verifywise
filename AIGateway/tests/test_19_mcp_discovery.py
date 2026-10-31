"""MCP tool discovery: protocol, paging, budget, friendly errors.

No live services: httpx.MockTransport stands in for the MCP server and the
database writes are replaced with fakes."""

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

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


NO_CHANGES = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}


@pytest.fixture
def recorded(monkeypatch):
    calls = {"store": [], "result": []}

    async def store(org_id, server_id, tools):
        calls["store"].append((org_id, server_id, tools))
        return [{"tool_name": t["name"]} for t in tools], {**NO_CHANGES, "added": len(tools)}

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
        assert out == {
            "status": "success",
            "tools_discovered": 2,
            "changes": {**NO_CHANGES, "added": 2},
            "error": None,
        }
        assert recorded["result"] == [(1, 5, None)]

    async def test_zero_tools_is_success(self, recorded):
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[]], []))
        assert out == {"status": "success", "tools_discovered": 0, "changes": NO_CHANGES, "error": None}
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
        assert out == {
            "status": "failed",
            "tools_discovered": 0,
            "changes": None,
            "error": "Could not save the discovered tools",
        }
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
            "changes": None,
            "error": "The server rejected the credentials (HTTP 401)",
        }


def _row(name, description="d", schema=None, active=True):
    return {"tool_name": name, "description": description, "input_schema": schema, "is_active": active}


class TestDiffDiscoveredTools:
    def test_first_discovery_counts_everything_as_added(self):
        out = svc.diff_discovered_tools([], [{"name": "a"}, {"name": "b"}])
        assert out == {**NO_CHANGES, "added": 2}

    def test_no_changes(self):
        existing = [_row("a", "d", '{"type": "object"}'), _row("b", None, None)]
        tools = [
            {"name": "a", "description": "d", "inputSchema": {"type": "object"}},
            {"name": "b", "description": "", "inputSchema": {}},
        ]
        assert svc.diff_discovered_tools(existing, tools) == {**NO_CHANGES, "unchanged": 2}

    def test_description_and_schema_changes(self):
        existing = [_row("a", "old"), _row("b", "d", {"type": "object"}), _row("c")]
        tools = [
            {"name": "a", "description": "new"},
            {"name": "b", "description": "d", "inputSchema": {"type": "object", "required": ["q"]}},
            {"name": "c", "description": "d"},
        ]
        assert svc.diff_discovered_tools(existing, tools) == {**NO_CHANGES, "changed": 2, "unchanged": 1}

    def test_removed_counts_only_active_tools(self):
        existing = [_row("a"), _row("gone"), _row("long_gone", active=False)]
        out = svc.diff_discovered_tools(existing, [{"name": "a", "description": "d"}])
        assert out == {**NO_CHANGES, "removed": 1, "unchanged": 1}

    def test_returning_inactive_tool_counts_as_added(self):
        out = svc.diff_discovered_tools([_row("a", active=False)], [{"name": "a", "description": "d"}])
        assert out == {**NO_CHANGES, "added": 1}

    def test_empty_list_removes_all_active(self):
        out = svc.diff_discovered_tools([_row("a"), _row("b")], [])
        assert out == {**NO_CHANGES, "removed": 2}

    def test_schema_key_order_is_not_a_change(self):
        existing = [_row("a", "d", '{"b": 1, "a": 2}')]
        tools = [{"name": "a", "description": "d", "inputSchema": {"a": 2, "b": 1}}]
        assert svc.diff_discovered_tools(existing, tools) == {**NO_CHANGES, "unchanged": 1}


def _fake_db(existing_rows):
    """A get_db replacement that records every statement and returns existing_rows."""
    executed = []

    result = MagicMock()
    result.mappings.return_value.all.return_value = existing_rows

    db = MagicMock()
    db.commit = AsyncMock()

    async def execute(stmt, params=None):
        executed.append((str(stmt), params))
        return result

    db.execute = execute

    @asynccontextmanager
    async def get_db():
        yield db

    return get_db, executed


@pytest.mark.asyncio
class TestStoreDiscoveredTools:
    async def test_locks_the_server_row_before_reading_tools(self, monkeypatch):
        get_db, executed = _fake_db([])
        monkeypatch.setattr(svc, "get_db", get_db)
        await svc.store_discovered_tools(1, 5, [{"name": "a"}])
        assert "FOR NO KEY UPDATE" in executed[0][0]
        assert executed[0][1] == {"org_id": 1, "server_id": 5}

    async def test_duplicate_names_are_stored_once(self, monkeypatch):
        get_db, executed = _fake_db([])
        monkeypatch.setattr(svc, "get_db", get_db)
        tools = [{"name": "a", "description": "first"}, {"name": "b"}, {"name": "a", "description": "last"}]
        stored, changes = await svc.store_discovered_tools(1, 5, tools)
        assert [t["tool_name"] for t in stored] == ["a", "b"]
        assert stored[0]["description"] == "last"
        assert changes == {**NO_CHANGES, "added": 2}
        inserts = [p for sql, p in executed if "INSERT INTO ai_gateway_mcp_tools" in sql]
        assert [p["tool_name"] for p in inserts] == ["a", "b"]


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
