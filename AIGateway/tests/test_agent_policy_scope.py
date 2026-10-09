"""Self-contained tests for per-agent policy scope and the per-agent activity view.

No live services: database access is replaced with fakes.
"""

import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import crud.mcp_audit as audit_crud
import routers.mcp_guardrails as guardrails_router


def _fake_db(rows=None):
    """A get_db replacement that records every executed statement."""
    executed = []

    result = MagicMock()
    result.mappings.return_value.fetchone.return_value = rows or {}
    result.mappings.return_value.all.return_value = []

    db = MagicMock()

    async def execute(stmt, params=None):
        executed.append((stmt, params))
        return result

    db.execute = execute

    @asynccontextmanager
    async def get_db():
        yield db

    return get_db, executed


async def test_agent_activity_binds_every_value(monkeypatch):
    get_db, executed = _fake_db()
    monkeypatch.setattr(audit_crud, "get_db", get_db)

    await audit_crud.get_agent_activity(org_id=7, agent_key_id=3, days="30")

    assert len(executed) == 3
    for stmt, params in executed:
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        # No value is formatted into the SQL text; the window is a bind param.
        assert "30" not in sql
        assert set(stmt.compile(dialect=postgresql.dialect()).params) <= {
            "org_id",
            "akid",
            "days",
            "circuit_breaker",
        }
        assert params == {
            "org_id": 7,
            "akid": 3,
            "days": 30,
            "circuit_breaker": audit_crud.CIRCUIT_BREAKER_SUMMARY,
        }


async def test_denied_counts_skip_circuit_breaker_outages(monkeypatch):
    get_db, executed = _fake_db()
    monkeypatch.setattr(audit_crud, "get_db", get_db)

    await audit_crud.get_agent_activity(org_id=1, agent_key_id=1)

    summary_sql, by_tool_sql = (str(stmt) for stmt, _ in executed[:2])
    for sql in (summary_sql, by_tool_sql):
        assert "result_summary IS DISTINCT FROM :circuit_breaker" in sql


async def test_agent_activity_summary_defaults(monkeypatch):
    get_db, _ = _fake_db(rows=None)
    monkeypatch.setattr(audit_crud, "get_db", get_db)

    out = await audit_crud.get_agent_activity(org_id=1, agent_key_id=1)

    assert out["summary"]["total_calls"] == 0
    assert out["summary"]["avg_latency_ms"] == 0
    assert out["by_tool"] == [] and out["recent"] == []


def _request():
    return MagicMock()


@pytest.fixture
def known_keys(monkeypatch):
    """Agent keys 1, 2 and 3 belong to the organization."""
    lookup = AsyncMock(side_effect=lambda org_id, ids: {k for k in ids if k in {1, 2, 3}})
    monkeypatch.setattr(guardrails_router, "get_org_agent_key_ids", lookup)
    monkeypatch.setattr(guardrails_router, "get_org_id", lambda request: 9)
    return lookup


@pytest.mark.parametrize("value", [None, []])
async def test_empty_scope_means_every_agent(known_keys, value):
    assert await guardrails_router._validated_agent_keys(_request(), value) == []


async def test_scope_keeps_order_and_drops_duplicates(known_keys):
    keys = await guardrails_router._validated_agent_keys(_request(), [3, 1, 3])
    assert keys == [3, 1]
    known_keys.assert_awaited_once_with(9, [3, 1])


@pytest.mark.parametrize("value", ["1", {"a": 1}, [1, "2"], [True], [1.5]])
async def test_scope_rejects_non_id_values(known_keys, value):
    with pytest.raises(HTTPException) as exc:
        await guardrails_router._validated_agent_keys(_request(), value)
    assert exc.value.status_code == 400


async def test_scope_rejects_a_key_outside_the_organization(known_keys):
    with pytest.raises(HTTPException) as exc:
        await guardrails_router._validated_agent_keys(_request(), [1, 99])
    assert exc.value.status_code == 400
    assert "does not exist" in exc.value.detail


async def test_scope_has_an_upper_bound(known_keys):
    too_many = list(range(1, guardrails_router.MAX_RULE_AGENT_KEYS + 2))
    with pytest.raises(HTTPException) as exc:
        await guardrails_router._validated_agent_keys(_request(), too_many)
    assert exc.value.status_code == 400
    known_keys.assert_not_awaited()


def _policy_calls(path):
    import ast

    tree = ast.parse(open(path).read())
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) in {
            "scan_tool_input",
            "check_require_approval",
        }:
            yield node


@pytest.mark.parametrize("router", ["mcp_hook.py", "mcp_proxy.py"])
def test_every_policy_check_passes_the_calling_agent_key(router):
    """Both tool-call paths (native hook and MCP proxy) must pass the agent key,
    or rules scoped to specific agents would silently not apply on that path."""
    path = os.path.join(os.path.dirname(__file__), "..", "src", "routers", router)
    calls = list(_policy_calls(path))
    assert calls, f"{router} should run the policy checks"
    for call in calls:
        kwargs = {k.arg: k.value for k in call.keywords}
        assert "agent_key_id" in kwargs, f"{router}:{call.lineno} omits agent_key_id"
        value = kwargs["agent_key_id"]
        assert not (isinstance(value, __import__("ast").Constant) and value.value is None)


# --- Which rule caused a block -------------------------------------------------

from services.guardrail_service import Detection, ScanResult
from services.mcp_guardrail_service import blocking_rule


def _detection(rule_id, action):
    return Detection(
        guardrail_id=rule_id,
        guardrail_type="pii" if action == "mask" else "content_filter",
        entity_type="X",
        action=action,
        matched_text="x",
        start=0,
        end=1,
    )


def test_blocking_rule_is_the_rule_that_blocked_not_the_first_detection():
    result = ScanResult(
        blocked=True,
        detections=[_detection(1, "mask"), _detection(2, "block")],
        rule_names={1: "Mask emails", 2: "Block secrets"},
    )
    assert blocking_rule(result) == (2, "Block secrets")


def test_blocking_rule_counts_a_mask_hit_only_when_asked():
    result = ScanResult(detections=[_detection(1, "mask")], rule_names={1: "Mask emails"})
    assert blocking_rule(result) == (None, None)
    assert blocking_rule(result, include_mask=True) == (1, "Mask emails")


def test_blocking_rule_without_a_rule_id():
    result = ScanResult(blocked=True, detections=[_detection(None, "block")])
    assert blocking_rule(result) == (None, None)


# --- Deleting an agent key cleans up rule scopes ------------------------------

import crud.mcp_agent_keys as agent_keys_crud


def _fake_delete_db(deleted: bool):
    executed = []
    db = MagicMock()

    async def execute(stmt, params=None):
        executed.append((str(stmt), params))
        result = MagicMock()
        result.first.return_value = (5,) if deleted else None
        return result

    db.execute = execute
    db.commit = AsyncMock()

    @asynccontextmanager
    async def get_db():
        yield db

    return get_db, executed, db


async def test_deleting_a_key_removes_it_from_rule_scopes(monkeypatch):
    get_db, executed, db = _fake_delete_db(deleted=True)
    monkeypatch.setattr(agent_keys_crud, "get_db", get_db)

    assert await agent_keys_crud.delete_agent_key(org_id=2, key_id=5) is True

    assert len(executed) == 2
    cleanup_sql, params = executed[1]
    assert "array_remove(applies_to_agent_keys, :key_id)" in cleanup_sql
    # A rule left with no agents is switched off, not made org-wide.
    assert "THEN false" in cleanup_sql
    assert "organization_id = :org_id" in cleanup_sql
    assert params == {"org_id": 2, "key_id": 5}
    db.commit.assert_awaited_once()


async def test_no_cleanup_when_nothing_was_deleted(monkeypatch):
    get_db, executed, _ = _fake_delete_db(deleted=False)
    monkeypatch.setattr(agent_keys_crud, "get_db", get_db)

    assert await agent_keys_crud.delete_agent_key(org_id=2, key_id=5) is False
    assert len(executed) == 1
