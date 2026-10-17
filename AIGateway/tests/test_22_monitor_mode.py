"""Per-agent-key "monitor only" enforcement mode.

A monitor key is evaluated against every policy but never blocked or paused:
the call goes through and the audit row records what would have happened.
Rate limits and the circuit breaker stay enforced.

No live services: the database, guardrail scan, approvals and upstream MCP
servers are replaced with fakes.
"""

import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from fastapi import HTTPException

import crud.mcp_agent_keys as keys_crud
import crud.mcp_audit as audit_crud
import crud.mcp_runs as runs_crud
import routers.mcp_agent_keys as keys_router
import routers.mcp_hook as hook
import routers.mcp_proxy as proxy
from services.guardrail_service import Detection, ScanResult

pytestmark = pytest.mark.asyncio


def _key(mode="enforce", **over):
    base = {
        "id": 5,
        "organization_id": 1,
        "name": "agent",
        "allowed_tools": [],
        "blocked_tools": [],
        "rate_limit_rpm": 60,
        "enforcement_mode": mode,
    }
    base.update(over)
    return base


def _blocked_scan():
    return ScanResult(
        blocked=True,
        block_reason="PII detected: EMAIL_ADDRESS",
        detections=[Detection(11, "pii", "EMAIL_ADDRESS", "block", "a@b.c", 0, 5)],
        rule_names={11: "No emails"},
    )


def _mask_scan():
    return ScanResult(
        blocked=False,
        detections=[Detection(12, "pii", "PHONE_NUMBER", "mask", "555", 0, 3)],
        rule_names={12: "Mask phones"},
    )


APPROVAL_RULE = {"id": 21, "name": "Approve rm"}


def _body(response):
    return json.loads(response.body)


# ─── Native hook ─────────────────────────────────────────────────────────────


@pytest.fixture
def hook_fakes(monkeypatch):
    state = SimpleNamespace(
        key=_key(),
        scan=ScanResult(),
        approval_rule=None,
        rate_limited=False,
        audits=[],
        create_approval=AsyncMock(return_value={"id": 77, "expires_at": "2026-10-14T00:00:00+00:00"}),
        get_active=AsyncMock(return_value=None),
        notify=AsyncMock(),
        rate_calls=0,
    )

    async def extract(request):
        return state.key

    async def scan(org_id, tool_name, arguments, field_aware=False, *, agent_key_id):
        return state.scan

    async def approval(org_id, tool_name, arguments, *, agent_key_id):
        return state.approval_rule

    async def rate(agent_key, tool_name):
        state.rate_calls += 1
        if state.rate_limited:
            raise HTTPException(status_code=429, detail="Agent key rate limit exceeded")

    async def log(**kwargs):
        state.audits.append(kwargs)

    monkeypatch.setattr(hook, "extract_agent_key", extract)
    monkeypatch.setattr(hook, "scan_tool_input", scan)
    monkeypatch.setattr(hook, "check_require_approval", approval)
    monkeypatch.setattr(hook, "enforce_mcp_rate_limits", rate)
    monkeypatch.setattr(hook, "log_tool_call", log)
    monkeypatch.setattr(hook, "create_approval_request", state.create_approval)
    monkeypatch.setattr(hook, "get_active_request", state.get_active)
    monkeypatch.setattr(hook, "notify_approval_pending", state.notify)
    return state


def _hook_request():
    return SimpleNamespace(
        json=AsyncMock(return_value={
            "tool_name": "Bash",
            "arguments": {"command": "rm -rf build"},
            "session_id": "s1",
            "tool_use_id": "t1",
        }),
        headers={},
    )


def _event_types(audit):
    return [e["type"] for e in audit["events"]]


class TestHookMonitor:
    async def test_guardrail_hit_allows_and_records_would_block(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.scan = _blocked_scan()

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "allow"
        assert body["monitored"]["would"] == "deny"
        assert body["monitored"]["rule"] == {"id": 11, "name": "No emails"}
        assert "PII" in body["monitored"]["reason"]
        assert [o["would"] for o in body["monitored"]["outcomes"]] == ["deny"]
        (audit,) = hook_fakes.audits
        assert audit["result_status"] == "would_block"
        assert audit["is_error"] is False
        assert audit["matched_rule_id"] == 11
        assert audit["matched_rule_name"] == "No emails"
        # Same summary as a normal allow; the would-outcome lives in events.
        assert audit["result_summary"] == "Hook allow"
        assert "would_block" in _event_types(audit)

    async def test_mask_hit_counts_as_would_block(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.scan = _mask_scan()

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "allow"
        assert body["monitored"]["would"] == "deny"
        assert hook_fakes.audits[0]["result_status"] == "would_block"
        assert hook_fakes.audits[0]["matched_rule_id"] == 12

    async def test_approval_match_allows_without_creating_a_request(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.approval_rule = APPROVAL_RULE

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "allow"
        assert body["monitored"]["would"] == "approval_required"
        assert body["monitored"]["rule"] == {"id": 21, "name": "Approve rm"}
        hook_fakes.create_approval.assert_not_awaited()
        hook_fakes.get_active.assert_not_awaited()
        hook_fakes.notify.assert_not_awaited()
        (audit,) = hook_fakes.audits
        assert audit["result_status"] == "would_need_approval"
        assert audit["matched_rule_id"] == 21
        assert audit["result_summary"] == "Hook allow"
        assert "would_need_approval" in _event_types(audit)

    async def test_both_match_records_both_and_picks_would_block(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.scan = _blocked_scan()
        hook_fakes.approval_rule = APPROVAL_RULE

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "allow"
        assert body["monitored"]["would"] == "deny"
        assert [o["would"] for o in body["monitored"]["outcomes"]] == ["deny", "approval_required"]
        (audit,) = hook_fakes.audits
        assert audit["result_status"] == "would_block"
        assert audit["matched_rule_id"] == 11
        types = _event_types(audit)
        assert "would_block" in types and "would_need_approval" in types
        rules = {e["type"]: e.get("rule_id") for e in audit["events"] if e["type"].startswith("would_")}
        assert rules == {"would_block": 11, "would_need_approval": 21}
        hook_fakes.create_approval.assert_not_awaited()

    async def test_clean_call_has_no_monitored_block(self, hook_fakes):
        hook_fakes.key = _key("monitor")

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body == {"decision": "allow"}
        assert hook_fakes.audits[0]["result_status"] == "success"

    async def test_rate_limit_still_enforced(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.approval_rule = APPROVAL_RULE
        hook_fakes.rate_limited = True

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "rate_limited"
        assert hook_fakes.audits[0]["result_status"] == "rate_limited"


class TestHookEnforceUnchanged:
    async def test_guardrail_hit_denies(self, hook_fakes):
        hook_fakes.scan = _blocked_scan()
        hook_fakes.approval_rule = APPROVAL_RULE

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "deny"
        assert "monitored" not in body
        (audit,) = hook_fakes.audits
        assert audit["result_status"] == "blocked"
        assert _event_types(audit) == ["received", "decided"]
        assert hook_fakes.rate_calls == 0

    async def test_approval_match_creates_request(self, hook_fakes):
        hook_fakes.approval_rule = APPROVAL_RULE

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "approval_required"
        assert body["approval_id"] == 77
        hook_fakes.create_approval.assert_awaited_once()
        hook_fakes.notify.assert_awaited_once()
        assert hook_fakes.audits[0]["result_status"] == "approval_required"

    async def test_missing_mode_means_enforce(self, hook_fakes):
        key = _key()
        key.pop("enforcement_mode")
        hook_fakes.key = key
        hook_fakes.scan = _blocked_scan()

        body = _body(await hook.mcp_hook(_hook_request()))

        assert body["decision"] == "deny"


# ─── MCP proxy ───────────────────────────────────────────────────────────────

TOOL = {
    "id": 3,
    "tool_name": "delete_repo",
    "server_id": 9,
    "url": "https://mcp.example/mcp",
    "auth_type": "none",
    "auth_config": {},
    "requires_approval": False,
}


@pytest.fixture
def proxy_fakes(monkeypatch):
    state = SimpleNamespace(
        key=_key(),
        tool=dict(TOOL),
        scan=ScanResult(),
        audits=[],
        forwarded=[],
        create_approval=AsyncMock(return_value={"id": 88, "expires_at": "2026-10-14T00:00:00+00:00"}),
        get_approved=AsyncMock(return_value=None),
        get_pending=AsyncMock(return_value=None),
        notify=AsyncMock(),
        rate_limited=False,
        circuit_open=False,
        all_tools=[
            {"tool_name": "read_file", "description": "", "input_schema": {}},
            {"tool_name": "delete_repo", "description": "", "input_schema": {}},
        ],
    )

    async def extract(request):
        return state.key

    async def resolve(org_id, tool_name):
        return state.tool

    async def rate(agent_key, tool_name):
        if state.rate_limited:
            raise HTTPException(status_code=429, detail="Agent key rate limit exceeded")

    async def scan(org_id, tool_name, arguments, field_aware=False, *, agent_key_id):
        return state.scan

    async def log(**kwargs):
        state.audits.append(kwargs)

    async def forward(**kwargs):
        state.forwarded.append(kwargs)
        return {"content": [{"type": "text", "text": "deleted"}]}, None

    async def get_all_tools(org_id, active_servers_only=False):
        return state.all_tools

    breaker = MagicMock()
    breaker.is_open = AsyncMock(side_effect=lambda server_id: state.circuit_open)
    breaker.record_success = AsyncMock()
    breaker.record_failure = AsyncMock()

    monkeypatch.setattr(proxy, "extract_agent_key", extract)
    monkeypatch.setattr(proxy, "resolve_tool", resolve)
    monkeypatch.setattr(proxy, "enforce_mcp_rate_limits", rate)
    monkeypatch.setattr(proxy, "scan_tool_input", scan)
    monkeypatch.setattr(proxy, "log_tool_call", log)
    monkeypatch.setattr(proxy, "forward_tool_call", forward)
    monkeypatch.setattr(proxy, "get_all_tools", get_all_tools)
    monkeypatch.setattr(proxy, "CircuitBreaker", breaker)
    monkeypatch.setattr(proxy, "check_anomaly", AsyncMock(return_value=False))
    monkeypatch.setattr(proxy, "get_backend_session", AsyncMock(return_value=None))
    monkeypatch.setattr(proxy, "set_backend_session", AsyncMock())
    monkeypatch.setattr(proxy, "create_approval_request", state.create_approval)
    monkeypatch.setattr(proxy, "get_approved_request", state.get_approved)
    monkeypatch.setattr(proxy, "get_pending_request", state.get_pending)
    monkeypatch.setattr(proxy, "notify_approval_pending", state.notify)
    return state


def _rpc(method, params=None):
    return SimpleNamespace(
        json=AsyncMock(return_value={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}),
        headers={"mcp-session-id": "gw-1"},
    )


def _call():
    return _rpc("tools/call", {"name": "delete_repo", "arguments": {"repo": "x"}})


class TestProxyMonitor:
    async def test_tools_list_ignores_the_key_tool_lists(self, proxy_fakes):
        proxy_fakes.key = _key("monitor", allowed_tools=["read_*"], blocked_tools=["delete_*"])

        body = _body(await proxy.mcp_jsonrpc(_rpc("tools/list")))

        assert [t["name"] for t in body["result"]["tools"]] == ["read_file", "delete_repo"]

    async def test_acl_violation_is_forwarded_and_recorded(self, proxy_fakes):
        proxy_fakes.key = _key("monitor", blocked_tools=["delete_*"])

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert "error" not in body
        assert len(proxy_fakes.forwarded) == 1
        (audit,) = proxy_fakes.audits
        assert audit["result_status"] == "would_block"
        assert audit["is_error"] is False
        # The summary is the upstream result; the would-outcome lives in events.
        assert audit["result_summary"] == "deleted"
        would = [e for e in audit["events"] if e["type"] == "would_block"]
        assert len(would) == 1
        assert "blocks tool" in would[0]["detail"]
        monitored = body["result"]["_meta"]["verifywise.ai/monitored"]
        assert monitored["would"] == "deny"
        assert monitored["rule"] is None

    async def test_requires_approval_is_forwarded_without_a_request(self, proxy_fakes):
        proxy_fakes.key = _key("monitor")
        proxy_fakes.tool["requires_approval"] = True

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert "error" not in body
        assert len(proxy_fakes.forwarded) == 1
        proxy_fakes.create_approval.assert_not_awaited()
        proxy_fakes.get_approved.assert_not_awaited()
        proxy_fakes.get_pending.assert_not_awaited()
        proxy_fakes.notify.assert_not_awaited()
        assert proxy_fakes.audits[0]["result_status"] == "would_need_approval"
        assert proxy_fakes.audits[0]["result_summary"] == "deleted"

    async def test_all_three_recorded_with_most_severe_status(self, proxy_fakes):
        proxy_fakes.key = _key("monitor", allowed_tools=["read_*"])
        proxy_fakes.tool["requires_approval"] = True
        proxy_fakes.scan = _blocked_scan()

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert len(proxy_fakes.forwarded) == 1
        (audit,) = proxy_fakes.audits
        assert audit["result_status"] == "would_block"
        assert audit["result_summary"] == "deleted"
        types = [e["type"] for e in audit["events"]]
        assert types.count("would_block") == 2
        assert types.count("would_need_approval") == 1
        outcomes = body["result"]["_meta"]["verifywise.ai/monitored"]["outcomes"]
        assert len(outcomes) == 3

    async def test_guardrail_block_records_rule(self, proxy_fakes):
        proxy_fakes.key = _key("monitor")
        proxy_fakes.scan = _blocked_scan()

        await proxy.mcp_jsonrpc(_call())

        (audit,) = proxy_fakes.audits
        assert audit["result_status"] == "would_block"
        assert audit["matched_rule_id"] == 11
        assert audit["matched_rule_name"] == "No emails"
        assert len(proxy_fakes.forwarded) == 1

    async def test_rate_limit_still_enforced(self, proxy_fakes):
        proxy_fakes.key = _key("monitor")
        proxy_fakes.rate_limited = True

        with pytest.raises(HTTPException) as exc:
            await proxy.mcp_jsonrpc(_call())

        assert exc.value.status_code == 429
        assert proxy_fakes.forwarded == []

    async def test_circuit_breaker_still_enforced(self, proxy_fakes):
        proxy_fakes.key = _key("monitor")
        proxy_fakes.circuit_open = True

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert body["error"]["code"] == -32004
        assert proxy_fakes.forwarded == []
        assert proxy_fakes.audits[0]["result_status"] == "blocked"

    async def test_clean_call_is_a_plain_success(self, proxy_fakes):
        proxy_fakes.key = _key("monitor")

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert "_meta" not in body["result"]
        (audit,) = proxy_fakes.audits
        assert audit["result_status"] == "success"
        assert audit["result_summary"] == "deleted"
        assert audit.get("events") is None


class TestProxyEnforceUnchanged:
    async def test_tools_list_filtered(self, proxy_fakes):
        proxy_fakes.key = _key(blocked_tools=["delete_*"])

        body = _body(await proxy.mcp_jsonrpc(_rpc("tools/list")))

        assert [t["name"] for t in body["result"]["tools"]] == ["read_file"]

    async def test_acl_violation_is_an_error(self, proxy_fakes):
        proxy_fakes.key = _key(blocked_tools=["delete_*"])

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert body["error"]["code"] == -32602
        assert proxy_fakes.forwarded == []
        assert proxy_fakes.audits[0]["result_status"] == "error"
        assert proxy_fakes.audits[0]["is_error"] is True

    async def test_requires_approval_creates_request(self, proxy_fakes):
        proxy_fakes.tool["requires_approval"] = True

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert body["error"]["code"] == -32001
        proxy_fakes.create_approval.assert_awaited_once()
        assert proxy_fakes.forwarded == []

    async def test_guardrail_blocks(self, proxy_fakes):
        proxy_fakes.scan = _blocked_scan()

        body = _body(await proxy.mcp_jsonrpc(_call()))

        assert body["error"]["code"] == -32003
        assert proxy_fakes.forwarded == []
        assert proxy_fakes.audits[0]["result_status"] == "blocked"

    async def test_success_row_has_no_events(self, proxy_fakes):
        await proxy.mcp_jsonrpc(_call())

        (audit,) = proxy_fakes.audits
        assert audit["result_status"] == "success"
        assert audit.get("events") is None


# ─── Agent keys API ──────────────────────────────────────────────────────────


def _admin_request(body):
    return SimpleNamespace(
        state=SimpleNamespace(organization_id=1, user_id=7, role="Admin"),
        json=AsyncMock(return_value=body),
    )


@pytest.fixture
def key_fakes(monkeypatch):
    state = SimpleNamespace(created=None, updated=None)

    async def create(org_id, data):
        state.created = data
        return {"id": 5, "name": data["name"], "plain_key": "sk-mcp-x",
                "enforcement_mode": data["enforcement_mode"]}

    async def update(org_id, key_id, data):
        state.updated = data
        return {"id": key_id, "name": "agent", **data}

    monkeypatch.setattr(keys_router, "create_agent_key", create)
    monkeypatch.setattr(keys_router, "update_agent_key", update)
    monkeypatch.setattr(keys_router, "notify_config_change", AsyncMock())
    return state


class TestAgentKeysApi:
    async def test_create_defaults_to_enforce(self, key_fakes):
        await keys_router.create_key(_admin_request({"name": "a"}))

        assert key_fakes.created["enforcement_mode"] == "enforce"
        assert key_fakes.created["enforcement_mode_changed_by"] == 7

    async def test_create_monitor(self, key_fakes):
        out = await keys_router.create_key(_admin_request({"name": "a", "enforcement_mode": "monitor"}))

        assert key_fakes.created["enforcement_mode"] == "monitor"
        assert out["data"]["enforcement_mode"] == "monitor"

    @pytest.mark.parametrize("bad", ["block", "", None, 1, ["monitor"]])
    async def test_invalid_mode_on_create_is_400(self, key_fakes, bad):
        with pytest.raises(HTTPException) as exc:
            await keys_router.create_key(_admin_request({"name": "a", "enforcement_mode": bad}))
        assert exc.value.status_code == 400
        assert key_fakes.created is None

    @pytest.mark.parametrize("bad", ["block", None, 0])
    async def test_invalid_mode_on_patch_is_400(self, key_fakes, bad):
        with pytest.raises(HTTPException) as exc:
            await keys_router.update_key(5, _admin_request({"enforcement_mode": bad}))
        assert exc.value.status_code == 400
        assert key_fakes.updated is None

    async def test_patch_passes_mode_and_actor(self, key_fakes):
        await keys_router.update_key(5, _admin_request({"enforcement_mode": "monitor"}))

        assert key_fakes.updated["enforcement_mode"] == "monitor"
        assert key_fakes.updated["enforcement_mode_changed_by"] == 7

    async def test_patch_without_mode_leaves_it_alone(self, key_fakes):
        await keys_router.update_key(5, _admin_request({"name": "b"}))

        assert "enforcement_mode" not in key_fakes.updated
        assert "enforcement_mode_changed_by" not in key_fakes.updated

    async def test_non_admin_cannot_change_mode(self, key_fakes):
        request = _admin_request({"enforcement_mode": "monitor"})
        request.state.role = "Editor"
        with pytest.raises(HTTPException) as exc:
            await keys_router.update_key(5, request)
        assert exc.value.status_code == 403


def _recording_db(row=None):
    executed = []
    result = MagicMock()
    result.mappings.return_value.first.return_value = row
    result.mappings.return_value.fetchone.return_value = row
    result.mappings.return_value.all.return_value = []
    db = MagicMock()

    async def execute(stmt, params=None):
        executed.append((str(stmt), params))
        return result

    db.execute = execute
    db.commit = AsyncMock()

    @asynccontextmanager
    async def get_db():
        yield db

    return get_db, executed


class TestAgentKeysCrud:
    async def test_update_only_stamps_on_an_actual_change(self, monkeypatch):
        get_db, executed = _recording_db({"id": 5})
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.update_agent_key(1, 5, {"enforcement_mode": "monitor", "enforcement_mode_changed_by": 7})

        sql, params = executed[0]
        # Compared against the stored (pre-update) value in the same statement,
        # so a same-value PATCH keeps the previous changed_at / changed_by.
        assert "enforcement_mode = :enforcement_mode" in sql
        assert (
            "enforcement_mode_changed_at = CASE WHEN enforcement_mode IS DISTINCT FROM "
            ":enforcement_mode THEN NOW() ELSE enforcement_mode_changed_at END"
        ) in sql
        assert (
            "enforcement_mode_changed_by = CASE WHEN enforcement_mode IS DISTINCT FROM "
            ":enforcement_mode THEN :enforcement_mode_changed_by ELSE enforcement_mode_changed_by END"
        ) in sql
        assert params["enforcement_mode"] == "monitor"
        assert params["enforcement_mode_changed_by"] == 7
        assert "enforcement_mode_changed_at" in sql.split("RETURNING")[1]

    async def test_update_without_mode_does_not_touch_the_mode_columns(self, monkeypatch):
        get_db, executed = _recording_db({"id": 5})
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.update_agent_key(1, 5, {"name": "b"})

        set_part = executed[0][0].split("RETURNING")[0]
        assert "enforcement_mode" not in set_part

    async def test_create_stamps_only_a_non_default_mode(self, monkeypatch):
        get_db, executed = _recording_db({"id": 5})
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.create_agent_key(1, {"name": "a", "enforcement_mode": "monitor",
                                             "enforcement_mode_changed_by": 7})
        await keys_crud.create_agent_key(1, {"name": "a", "enforcement_mode": "enforce",
                                             "enforcement_mode_changed_by": 7})

        monitor_params, enforce_params = executed[0][1], executed[1][1]
        assert monitor_params["enforcement_mode"] == "monitor"
        assert monitor_params["mode_changed"] is True
        assert monitor_params["enforcement_mode_changed_by"] == 7
        assert enforce_params["mode_changed"] is False
        assert enforce_params["enforcement_mode_changed_by"] is None

    async def test_list_returns_the_mode_fields(self, monkeypatch):
        get_db, executed = _recording_db()
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.get_all_agent_keys(1)

        sql = executed[0][0]
        for col in ("enforcement_mode", "enforcement_mode_changed_at", "enforcement_mode_changed_by"):
            assert f"ak.{col}" in sql


async def test_key_authentication_reads_the_mode(monkeypatch):
    import services.mcp_proxy_service as svc

    get_db, executed = _recording_db({
        "id": 5, "organization_id": 1, "name": "a", "allowed_tools": [], "blocked_tools": [],
        "rate_limit_rpm": None, "is_active": True, "revoked_at": None, "expires_at": None,
        "enforcement_mode": "monitor",
    })
    monkeypatch.setattr(svc, "get_db", get_db)

    key = await svc.authenticate_agent_key("sk-mcp-abc")

    assert "enforcement_mode" in executed[0][0]
    assert key["enforcement_mode"] == "monitor"


# ─── Counts ──────────────────────────────────────────────────────────────────


class TestCounts:
    async def test_agent_activity_counts_would_outcomes_separately(self, monkeypatch):
        get_db, executed = _recording_db({
            "total_calls": 4, "denied": 1, "approvals": 0, "would_block_count": 2,
            "would_need_approval_count": 1, "errors": 0, "runs": 1, "avg_latency_ms": 3,
            "last_active": None,
        })
        monkeypatch.setattr(audit_crud, "get_db", get_db)

        out = await audit_crud.get_agent_activity(org_id=1, agent_key_id=5)

        summary_sql, by_tool_sql = executed[0][0], executed[1][0]
        assert "result_status = 'would_block'" in summary_sql
        assert "result_status = 'would_need_approval'" in summary_sql
        assert "would_block_count" in by_tool_sql
        assert out["summary"]["would_block_count"] == 2
        assert out["summary"]["would_need_approval_count"] == 1
        # Denied and approvals still count only real outcomes.
        assert "WHERE result_status = 'approval_required'" in summary_sql

    async def test_agent_activity_defaults_to_zero(self, monkeypatch):
        get_db, _ = _recording_db(None)
        monkeypatch.setattr(audit_crud, "get_db", get_db)

        out = await audit_crud.get_agent_activity(org_id=1, agent_key_id=5)

        assert out["summary"]["would_block_count"] == 0
        assert out["summary"]["would_need_approval_count"] == 0

    async def test_runs_count_would_outcomes_separately(self, monkeypatch):
        get_db, executed = _recording_db()
        monkeypatch.setattr(runs_crud, "get_db", get_db)

        await runs_crud.list_runs(org_id=1)

        data_sql = executed[1][0]
        assert "COUNT(*) FILTER (WHERE result_status = 'blocked') AS denied_count" in data_sql
        assert "COUNT(*) FILTER (WHERE result_status = 'would_block') AS would_block_count" in data_sql
        assert (
            "COUNT(*) FILTER (WHERE result_status = 'would_need_approval') AS would_need_approval_count"
            in data_sql
        )
        assert "COALESCE(t.would_block_count, 0) AS would_block_count" in data_sql
        assert "COALESCE(t.would_need_approval_count, 0) AS would_need_approval_count" in data_sql


async def test_result_capture_keeps_would_statuses(monkeypatch):
    import services.mcp_audit_service as audit_service

    for status in ("would_block", "would_need_approval"):
        get_db, executed = _recording_db({
            "id": 1, "agent_key_id": 5, "result_status": status, "events": [],
        })
        monkeypatch.setattr(audit_service, "get_db", get_db)

        out = await audit_service.update_tool_result(
            organization_id=1, session_id="s", tool_use_id="t", agent_key_id=5,
            result_response={}, result_truncated=False, outcome_event={"type": "completed"},
        )

        assert out == "ok"
        assert executed[1][1]["new_status"] == status


# ─── Review follow-ups ───────────────────────────────────────────────────────


async def test_mode_changed_by_never_blocks_a_user_delete():
    """Deleting a VerifyWise user must not fail because they once changed a
    key's mode: the reference is cleared instead."""
    migration = (
        Path(__file__).parent.parent
        / "src/database/migrations/versions/a0014_agent_key_enforcement_mode.py"
    ).read_text()
    assert "enforcement_mode_changed_by INTEGER NULL" in migration
    assert "REFERENCES users(id) ON DELETE SET NULL" in migration


def _would_events(audit):
    return [e for e in audit["events"] if e["type"].startswith("would_")]


class TestOutcomeSource:
    async def test_hook_guardrail_and_approval_rule_sources(self, hook_fakes):
        hook_fakes.key = _key("monitor")
        hook_fakes.scan = _blocked_scan()
        hook_fakes.approval_rule = APPROVAL_RULE

        body = _body(await hook.mcp_hook(_hook_request()))

        sources = {e["type"]: e["source"] for e in _would_events(hook_fakes.audits[0])}
        assert sources == {"would_block": "guardrail", "would_need_approval": "approval_rule"}
        assert [o["source"] for o in body["monitored"]["outcomes"]] == ["guardrail", "approval_rule"]
        assert body["monitored"]["source"] == "guardrail"

    async def test_proxy_sources(self, proxy_fakes):
        proxy_fakes.key = _key("monitor", allowed_tools=["read_*"])
        proxy_fakes.tool["requires_approval"] = True
        proxy_fakes.scan = _blocked_scan()

        await proxy.mcp_jsonrpc(_call())

        pairs = [(e["type"], e["source"]) for e in _would_events(proxy_fakes.audits[0])]
        assert pairs == [
            ("would_block", "tool_acl"),
            ("would_need_approval", "tool_requires_approval"),
            ("would_block", "guardrail"),
        ]


class TestHookPolicyHelper:
    async def test_first_only_stops_at_the_guardrail_hit(self, hook_fakes, monkeypatch):
        hook_fakes.scan = _blocked_scan()
        calls = []

        async def approval(org_id, tool_name, arguments, *, agent_key_id):
            calls.append(tool_name)
            return APPROVAL_RULE

        monkeypatch.setattr(hook, "check_require_approval", approval)
        hits = await hook.evaluate_hook_policies(1, "Bash", {}, agent_key={"id": 5}, first_only=True)

        assert [h.kind for h in hits] == ["deny"]
        assert calls == []

    async def test_all_outcomes_when_not_first_only(self, hook_fakes):
        hook_fakes.scan = _blocked_scan()
        hook_fakes.approval_rule = APPROVAL_RULE

        hits = await hook.evaluate_hook_policies(1, "Bash", {}, agent_key={"id": 5}, first_only=False)

        assert [h.kind for h in hits] == ["deny", "approval"]
        assert hits[0].rule_id == 11 and hits[1].rule_id == 21
        assert hits[0].reason == "PII detected: EMAIL_ADDRESS"
        assert hits[1].approval_rule == APPROVAL_RULE


async def test_proxy_would_events_are_timestamped_at_evaluation(proxy_fakes, monkeypatch):
    """The would_* entries record when the policy was evaluated, before the
    upstream call, not when the audit row is written afterwards."""
    import asyncio
    from datetime import datetime, timezone

    proxy_fakes.key = _key("monitor", blocked_tools=["delete_*"])
    forwarded_at = []

    async def slow_forward(**kwargs):
        await asyncio.sleep(0.01)
        forwarded_at.append(datetime.now(timezone.utc).isoformat())
        return {"content": [{"type": "text", "text": "deleted"}]}, None

    monkeypatch.setattr(proxy, "forward_tool_call", slow_forward)

    await proxy.mcp_jsonrpc(_call())

    (event,) = _would_events(proxy_fakes.audits[0])
    assert event["at"] < forwarded_at[0]


async def test_list_returns_who_changed_the_mode(monkeypatch):
    get_db, executed = _recording_db()
    monkeypatch.setattr(keys_crud, "get_db", get_db)

    await keys_crud.get_all_agent_keys(1)

    sql = executed[0][0]
    assert "AS enforcement_mode_changed_by_name" in sql
    assert "LEFT JOIN users mu ON mu.id = ak.enforcement_mode_changed_by" in sql


async def test_update_reports_whether_the_mode_changed(monkeypatch):
    get_db, executed = _recording_db({"id": 5})
    monkeypatch.setattr(keys_crud, "get_db", get_db)

    await keys_crud.update_agent_key(1, 5, {"enforcement_mode": "monitor", "enforcement_mode_changed_by": 7})

    returning = executed[0][0].split("RETURNING")[1]
    # NOW() is the transaction start, so this is true only when this UPDATE stamped it.
    assert "enforcement_mode_changed_at IS NOT DISTINCT FROM NOW() AS enforcement_mode_changed" in returning


async def test_agent_activity_by_tool_counts_would_need_approval(monkeypatch):
    get_db, executed = _recording_db(None)
    monkeypatch.setattr(audit_crud, "get_db", get_db)

    await audit_crud.get_agent_activity(org_id=1, agent_key_id=5)

    by_tool_sql = executed[1][0]
    assert "result_status = 'would_need_approval') AS would_need_approval_count" in by_tool_sql


class TestModeChangeNotification:
    @pytest.fixture
    def notify(self, monkeypatch):
        sent = AsyncMock()
        state = SimpleNamespace(changed=True)

        async def update(org_id, key_id, data):
            return {"id": key_id, "name": "build-bot", **data,
                    "enforcement_mode_changed": state.changed}

        monkeypatch.setattr(keys_router, "update_agent_key", update)
        monkeypatch.setattr(keys_router, "notify_config_change", sent)
        return SimpleNamespace(sent=sent, state=state)

    async def test_actual_change_sends_a_distinct_event(self, notify):
        out = await keys_router.update_key(5, _admin_request({"enforcement_mode": "monitor"}))

        (call,) = notify.sent.await_args_list
        event = call.kwargs["event"]
        assert event["action"] == "enforcement_mode_changed"
        assert event["entityType"] == "Agent key"
        assert event["entityName"] == "build-bot"
        assert event["oldMode"] == "enforce" and event["newMode"] == "monitor"
        assert event["actionUrl"] == "/ai-gateway/mcp/agent-keys"
        assert call.kwargs["changed_by_user_id"] == 7
        # Internal flag is not part of the API response.
        assert "enforcement_mode_changed" not in out["data"]

    async def test_switch_back_to_enforce(self, notify):
        await keys_router.update_key(5, _admin_request({"enforcement_mode": "enforce"}))

        event = notify.sent.await_args.kwargs["event"]
        assert event["oldMode"] == "monitor" and event["newMode"] == "enforce"

    async def test_same_mode_sends_the_generic_update(self, notify):
        notify.state.changed = False

        await keys_router.update_key(5, _admin_request({"enforcement_mode": "monitor"}))

        assert notify.sent.await_args.kwargs["event"]["action"] == "updated"

    async def test_mode_change_with_other_fields_sends_both(self, notify):
        await keys_router.update_key(5, _admin_request({"enforcement_mode": "monitor", "name": "b"}))

        actions = [c.kwargs["event"]["action"] for c in notify.sent.await_args_list]
        assert actions == ["updated", "enforcement_mode_changed"]
