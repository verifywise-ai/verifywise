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
        }
        assert params == {"org_id": 7, "akid": 3, "days": 30}


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
