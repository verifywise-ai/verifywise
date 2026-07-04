"""E2E: native-call human approval via /v1/mcp/hook + require_approval rules."""

import os
import time
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def _hook(key, command):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": "Bash", "arguments": {"command": command}},
    )


def _status(key, request_id):
    return _client.get(
        f"{GATEWAY_URL}/v1/mcp/approvals/{request_id}/status",
        headers={"Authorization": f"Bearer {key}"},
    )


def test_setup(api):
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E Approval Key"})
    assert key_res.status_code in (200, 201), key_res.text
    set_state("appr_key", key_res.json()["data"]["plain_key"])

    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E Approve rm -rf",
        "rule_type": "require_approval",
        "config": {"type": "regex", "pattern": r"rm\s+-rf"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text
    set_state("appr_rule_id", rule_res.json()["data"]["id"])


def test_clean_command_allows(api):
    key = get_state("appr_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "ls -la /tmp")
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_matching_command_requires_approval(api):
    key = get_state("appr_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "rm -rf /tmp/build")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["decision"] == "approval_required"
    assert body["approval_id"]
    assert body["poll_endpoint"].endswith(f"/v1/mcp/approvals/{body['approval_id']}/status")
    set_state("appr_id", body["approval_id"])


def test_status_pending(api):
    key = get_state("appr_key")
    aid = get_state("appr_id")
    if not key or not aid:
        pytest.skip("no approval")
    res = _status(key, aid)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "pending"


def test_approve_then_same_command_allows(api):
    key = get_state("appr_key")
    aid = get_state("appr_id")
    if not key or not aid:
        pytest.skip("no approval")
    dec = api.post(f"/mcp/approvals/{aid}/approve", json={"reason": "ok for test"})
    assert dec.status_code == 200, dec.text
    # Same command (same arg-hash) now reuses the approved decision.
    res = _hook(key, "rm -rf /tmp/build")
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_different_command_still_requires_approval(api):
    key = get_state("appr_key")
    if not key:
        pytest.skip("no key")
    # Different arguments -> different arg-hash -> not covered by prior approval.
    res = _hook(key, "rm -rf /tmp/other")
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "approval_required"
    set_state("appr_id2", res.json()["approval_id"])


def test_deny_then_status_denied(api):
    key = get_state("appr_key")
    aid = get_state("appr_id2")
    if not key or not aid:
        pytest.skip("no approval")
    dec = api.post(f"/mcp/approvals/{aid}/deny", json={"reason": "nope"})
    assert dec.status_code == 200, dec.text
    res = _status(key, aid)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "denied"


def test_rate_limit_does_not_bypass_policy(api):
    """A rate-limited key must still get approval_required for a matching command.

    Regression for the ordering bug where the rate-limit check ran before the
    guardrail scan + approval matcher, letting a rate-limited agent fail-open
    past policy. Policy must be evaluated first.
    """
    # A key capped at 1 rpm so the second call within the minute trips the limit.
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E RL Key", "rate_limit_rpm": 1})
    assert key_res.status_code in (200, 201), key_res.text
    rl_key = key_res.json()["data"]["plain_key"]

    # First call uses the single allowed request for this minute.
    first = _hook(rl_key, "rm -rf /tmp/rl-a")
    assert first.status_code == 200, first.text
    assert first.json()["decision"] == "approval_required"

    # Second call is over the rpm cap. Pre-fix it returned rate_limited (fail
    # open); post-fix policy runs first, so it must still require approval.
    second = _hook(rl_key, "rm -rf /tmp/rl-b")
    assert second.status_code == 200, second.text
    assert second.json()["decision"] == "approval_required", (
        f"rate-limited call bypassed policy: {second.text}"
    )


def test_require_approval_rule_is_editable(api):
    """Regression: a require_approval rule must be PATCH-able while echoing its
    own action sentinel (previously rejected with 'action must be block/mask')."""
    rid = get_state("appr_rule_id")
    if not rid:
        pytest.skip("no rule")
    res = api.patch(f"/mcp/guardrails/{rid}", json={
        "name": "E2E Approve rm -rf (edited)",
        "rule_type": "require_approval",
        "action": "require_approval",
    })
    assert res.status_code == 200, res.text


def test_cleanup(api):
    rid = get_state("appr_rule_id")
    if rid:
        api.delete(f"/mcp/guardrails/{rid}")
