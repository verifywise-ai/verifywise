"""Self-contained tests: the native hook applies an agent key's tool lists only
when the key opts in (apply_tool_lists_to_hook).

The allowed / blocked tool lists were written for MCP proxy tools. A key shared
with Claude Code or Cursor would have Bash, Edit and friends denied if the hook
applied those lists unconditionally, so the hook checks them only for keys with
apply_tool_lists_to_hook = true. An enforce key then gets a deny; a monitor key
gets a would_block outcome (source tool_acl) and the call is allowed.

No live services: key auth, policy checks, rate limiting and the audit log are
replaced with fakes on the hook router module.
"""

import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import crud.mcp_agent_keys as keys_crud
import routers.mcp_agent_keys as keys_router
import routers.mcp_hook as hook_router
from services.guardrail_service import Detection
from services.mcp_guardrail_service import ScanResult
from services.mcp_proxy_service import authenticate_agent_key


def _key(allowed=None, blocked=None, *, apply=True, mode="enforce"):
    return {
        "id": 5,
        "organization_id": 9,
        "name": "build-bot",
        "allowed_tools": allowed,
        "blocked_tools": blocked,
        "rate_limit_rpm": None,
        "enforcement_mode": mode,
        "apply_tool_lists_to_hook": apply,
    }


@pytest.fixture
def hook(monkeypatch):
    """Wire the hook to fakes and return the mocks the tests assert on."""
    mocks = MagicMock()
    mocks.key = _key()
    mocks.audit = AsyncMock()
    mocks.scan = AsyncMock(return_value=ScanResult())
    mocks.approval = AsyncMock(return_value=None)
    mocks.rate = AsyncMock()

    async def extract(_request):
        return mocks.key

    monkeypatch.setattr(hook_router, "extract_agent_key", extract)
    monkeypatch.setattr(hook_router, "log_tool_call", mocks.audit)
    monkeypatch.setattr(hook_router, "scan_tool_input", mocks.scan)
    monkeypatch.setattr(hook_router, "check_require_approval", mocks.approval)
    monkeypatch.setattr(hook_router, "enforce_mcp_rate_limits", mocks.rate)
    return mocks


async def _call(tool_name):
    request = MagicMock()
    request.json = AsyncMock(
        return_value={"tool_name": tool_name, "arguments": {"q": 1}, "session_id": "s", "tool_use_id": "u"}
    )
    response = await hook_router.mcp_hook(request)
    return json.loads(response.body)


def _would_events(audit):
    return [e for e in audit["events"] if e["type"].startswith("would_")]


# ─── Opted in, enforce mode ─────────────────────────────────────────────────


async def test_a_tool_outside_the_allowed_list_is_denied_before_guardrails(hook):
    hook.key = _key(allowed=["Read", "search_*"])

    body = await _call("Bash")

    assert body == {"decision": "deny", "reason": "Tool 'Bash' is not allowed for this agent key"}
    hook.scan.assert_not_awaited()
    hook.approval.assert_not_awaited()
    hook.rate.assert_not_awaited()
    audit = hook.audit.await_args.kwargs
    assert audit["result_status"] == "blocked"
    assert audit["tool_name"] == "Bash"
    assert "Read, search_*" in audit["result_summary"]
    assert "allowed" in audit["result_summary"]


async def test_a_tool_on_the_allowed_list_goes_on_to_guardrails(hook):
    hook.key = _key(allowed=["Read", "search_*"])

    body = await _call("search_docs")

    assert body == {"decision": "allow"}
    hook.scan.assert_awaited_once()
    assert hook.audit.await_args.kwargs["result_status"] == "success"


async def test_a_tool_on_the_blocked_list_is_denied(hook):
    hook.key = _key(blocked=["Bash", "delete_*"])

    body = await _call("delete_user")

    assert body == {"decision": "deny", "reason": "Tool 'delete_user' is not allowed for this agent key"}
    hook.scan.assert_not_awaited()
    audit = hook.audit.await_args.kwargs
    assert audit["result_status"] == "blocked"
    assert "Bash, delete_*" in audit["result_summary"]
    assert "blocked" in audit["result_summary"]


async def test_a_tool_not_on_the_blocked_list_is_allowed(hook):
    hook.key = _key(blocked=["Bash"])

    assert await _call("Read") == {"decision": "allow"}


@pytest.mark.parametrize("allowed,blocked", [(None, None), ([], [])])
async def test_a_key_without_tool_lists_is_unchanged(hook, allowed, blocked):
    hook.key = _key(allowed=allowed, blocked=blocked)

    assert await _call("Bash") == {"decision": "allow"}
    hook.scan.assert_awaited_once()
    hook.rate.assert_awaited_once()


# ─── Not opted in: the lists are for the MCP proxy only ─────────────────────


@pytest.mark.parametrize("apply", [False, None])
@pytest.mark.parametrize("mode", ["enforce", "monitor"])
async def test_tool_lists_are_ignored_on_the_hook_unless_the_key_opts_in(hook, apply, mode):
    hook.key = _key(allowed=["search_*"], blocked=["Bash"], apply=apply, mode=mode)

    body = await _call("Bash")

    assert body == {"decision": "allow"}
    hook.scan.assert_awaited_once()
    audit = hook.audit.await_args.kwargs
    assert audit["result_status"] == "success"
    assert _would_events(audit) == []


async def test_a_key_without_the_flag_field_is_not_opted_in(hook):
    """A key row read before the column existed has no flag: treat it as off."""
    key = _key(allowed=["search_*"])
    del key["apply_tool_lists_to_hook"]
    hook.key = key

    assert await _call("Bash") == {"decision": "allow"}


# ─── Opted in, monitor mode: record, never deny ─────────────────────────────


async def test_monitor_key_records_a_tool_list_violation_and_allows(hook):
    hook.key = _key(allowed=["Read"], mode="monitor")

    body = await _call("Bash")

    assert body["decision"] == "allow"
    monitored = body["monitored"]
    assert monitored["would"] == "deny"
    assert monitored["source"] == "tool_acl"
    assert monitored["reason"] == "Tool 'Bash' is not allowed for this agent key"
    assert monitored["rule"] is None
    hook.rate.assert_awaited_once()
    audit = hook.audit.await_args.kwargs
    assert audit["result_status"] == "would_block"
    events = _would_events(audit)
    assert [(e["type"], e["source"]) for e in events] == [("would_block", "tool_acl")]


async def test_monitor_key_records_tool_list_and_guardrail_outcomes_in_order(hook):
    hook.key = _key(blocked=["Bash"], mode="monitor")
    hook.scan.return_value = ScanResult(
        blocked=True,
        block_reason="secret in command",
        detections=[Detection(
            guardrail_id=1, guardrail_type="pii", entity_type="EMAIL", action="block",
            matched_text="x", start=0, end=1,
        )],
    )
    hook.approval.return_value = {"id": 3, "name": "shell needs review"}

    body = await _call("Bash")

    assert body["decision"] == "allow"
    sources = [o["source"] for o in body["monitored"]["outcomes"]]
    assert sources == ["tool_acl", "guardrail", "approval_rule"]
    # Every policy still runs in monitor mode.
    hook.scan.assert_awaited_once()
    hook.approval.assert_awaited_once()
    audit = hook.audit.await_args.kwargs
    assert audit["result_status"] == "would_block"
    assert [e["source"] for e in _would_events(audit)] == ["tool_acl", "guardrail", "approval_rule"]


async def test_monitor_key_tool_on_the_allowed_list_has_no_outcome(hook):
    hook.key = _key(allowed=["Read"], mode="monitor")

    assert await _call("Read") == {"decision": "allow"}


async def test_policy_helper_reports_a_tool_list_hit_first(hook):
    hits = await hook_router.evaluate_hook_policies(
        9, "Bash", {}, agent_key=_key(allowed=["Read"]), first_only=False
    )

    assert [h.kind for h in hits] == ["tool_acl"]
    assert hits[0].as_outcome()["source"] == "tool_acl"
    assert hits[0].as_outcome()["status"] == "would_block"


async def test_policy_helper_takes_the_key_id_from_the_agent_key(hook):
    key = {**_key(apply=False), "id": 77}

    await hook_router.evaluate_hook_policies(9, "Bash", {"command": "ls"}, agent_key=key, first_only=False)

    assert hook.scan.await_args.kwargs["agent_key_id"] == 77
    assert hook.approval.await_args.kwargs["agent_key_id"] == 77


async def test_policy_helper_requires_the_agent_key(hook):
    with pytest.raises(TypeError):
        await hook_router.evaluate_hook_policies(9, "Bash", {}, first_only=True)


# ─── Key auth, API, storage, migration ──────────────────────────────────────


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


async def test_key_lookup_returns_the_tool_lists_and_the_hook_flag(monkeypatch):
    """The hook can only apply the lists if key auth selects them and the flag."""
    import services.mcp_proxy_service as proxy_service

    get_db, executed = _recording_db({
        "id": 1, "organization_id": 2, "name": "k", "allowed_tools": ["Read"], "blocked_tools": None,
        "rate_limit_rpm": None, "is_active": True, "revoked_at": None, "expires_at": None,
        "enforcement_mode": "enforce", "apply_tool_lists_to_hook": True,
    })
    monkeypatch.setattr(proxy_service, "get_db", get_db)

    key = await authenticate_agent_key("sk-mcp-test")

    sql = executed[0][0]
    assert "allowed_tools" in sql and "blocked_tools" in sql
    assert "apply_tool_lists_to_hook" in sql
    assert key["allowed_tools"] == ["Read"]
    assert key["apply_tool_lists_to_hook"] is True


def _admin_request(body, role="Admin"):
    return SimpleNamespace(
        state=SimpleNamespace(organization_id=1, user_id=7, role=role),
        json=AsyncMock(return_value=body),
    )


@pytest.fixture
def key_fakes(monkeypatch):
    state = SimpleNamespace(created=None, updated=None)

    async def create(org_id, data):
        state.created = data
        return {"id": 5, "name": data["name"], "plain_key": "sk-mcp-x", **data}

    async def update(org_id, key_id, data):
        state.updated = data
        return {"id": key_id, "name": "agent", **data}

    monkeypatch.setattr(keys_router, "create_agent_key", create)
    monkeypatch.setattr(keys_router, "update_agent_key", update)
    monkeypatch.setattr(keys_router, "notify_config_change", AsyncMock())
    return state


class TestAgentKeysApiFlag:
    async def test_create_defaults_to_off(self, key_fakes):
        await keys_router.create_key(_admin_request({"name": "a"}))

        assert key_fakes.created["apply_tool_lists_to_hook"] is False

    async def test_create_can_opt_in(self, key_fakes):
        out = await keys_router.create_key(_admin_request({"name": "a", "apply_tool_lists_to_hook": True}))

        assert key_fakes.created["apply_tool_lists_to_hook"] is True
        assert out["data"]["apply_tool_lists_to_hook"] is True

    @pytest.mark.parametrize("bad", ["true", 1, None, []])
    async def test_non_boolean_on_create_is_400(self, key_fakes, bad):
        with pytest.raises(HTTPException) as exc:
            await keys_router.create_key(_admin_request({"name": "a", "apply_tool_lists_to_hook": bad}))
        assert exc.value.status_code == 400
        assert key_fakes.created is None

    async def test_patch_sets_the_flag(self, key_fakes):
        await keys_router.update_key(5, _admin_request({"apply_tool_lists_to_hook": True}))

        assert key_fakes.updated == {"apply_tool_lists_to_hook": True}

    @pytest.mark.parametrize("bad", ["false", 0, None])
    async def test_non_boolean_on_patch_is_400(self, key_fakes, bad):
        with pytest.raises(HTTPException) as exc:
            await keys_router.update_key(5, _admin_request({"apply_tool_lists_to_hook": bad}))
        assert exc.value.status_code == 400
        assert key_fakes.updated is None

    async def test_patch_without_the_flag_leaves_it_alone(self, key_fakes):
        await keys_router.update_key(5, _admin_request({"name": "b"}))

        assert "apply_tool_lists_to_hook" not in key_fakes.updated

    @pytest.mark.parametrize("role", ["Editor", "Reviewer", "Auditor"])
    async def test_only_admins_can_change_the_flag(self, key_fakes, role):
        with pytest.raises(HTTPException) as exc:
            await keys_router.update_key(5, _admin_request({"apply_tool_lists_to_hook": True}, role=role))
        assert exc.value.status_code == 403


class TestAgentKeysCrudFlag:
    async def test_create_stores_the_flag(self, monkeypatch):
        get_db, executed = _recording_db({"id": 5})
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.create_agent_key(1, {"name": "a", "apply_tool_lists_to_hook": True})
        await keys_crud.create_agent_key(1, {"name": "a"})

        sql = executed[0][0]
        assert ":apply_tool_lists_to_hook" in sql
        assert "apply_tool_lists_to_hook" in sql.split("RETURNING")[1]
        assert executed[0][1]["apply_tool_lists_to_hook"] is True
        assert executed[1][1]["apply_tool_lists_to_hook"] is False

    async def test_update_sets_the_flag(self, monkeypatch):
        get_db, executed = _recording_db({"id": 5})
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.update_agent_key(1, 5, {"apply_tool_lists_to_hook": True})

        sql, params = executed[0]
        assert "apply_tool_lists_to_hook = :apply_tool_lists_to_hook" in sql
        assert "apply_tool_lists_to_hook" in sql.split("RETURNING")[1]
        assert params["apply_tool_lists_to_hook"] is True

    async def test_list_returns_the_flag(self, monkeypatch):
        get_db, executed = _recording_db()
        monkeypatch.setattr(keys_crud, "get_db", get_db)

        await keys_crud.get_all_agent_keys(1)

        assert "ak.apply_tool_lists_to_hook" in executed[0][0]


def test_migration_adds_the_flag_off_by_default():
    migration = (
        Path(__file__).parent.parent
        / "src/database/migrations/versions/a0015_agent_key_apply_tool_lists_to_hook.py"
    ).read_text()
    assert 'revision: str = "a0015"' in migration
    assert 'down_revision: Union[str, None] = "a0014"' in migration
    assert "apply_tool_lists_to_hook BOOLEAN NOT NULL DEFAULT FALSE" in migration
    assert "DROP COLUMN IF EXISTS apply_tool_lists_to_hook" in migration
