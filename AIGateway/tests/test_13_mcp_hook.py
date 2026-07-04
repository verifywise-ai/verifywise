"""E2E: native tool-call hook adjudication (/v1/mcp/hook)."""

import os
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def _hook(agent_key: str, tool_name: str, arguments: dict):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {agent_key}", "Content-Type": "application/json"},
        json={"tool_name": tool_name, "arguments": arguments},
    )


def test_setup_agent_key_and_rule(api):
    """Create an sk-mcp agent key and a PII block rule for the hook to enforce."""
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E Hook Key"})
    assert key_res.status_code in (200, 201), key_res.text
    # The full sk-mcp-* value is returned once, under data.plain_key.
    set_state("hook_agent_key", key_res.json()["data"]["plain_key"])

    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E Hook PII Block",
        "rule_type": "pii",
        "action": "block",
        "config": {"entities": {"EMAIL_ADDRESS": "block"}, "score_thresholds": {"ALL": 0.7}, "language": "en"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text
    set_state("hook_rule_id", rule_res.json()["data"]["id"])


def test_hook_missing_auth_returns_401():
    res = _client.post(f"{GATEWAY_URL}/v1/mcp/hook", json={"tool_name": "Bash", "arguments": {}})
    assert res.status_code == 401, res.text


def test_hook_bad_key_returns_401():
    res = _hook("sk-mcp-not-a-real-key", "Bash", {"command": "ls"})
    assert res.status_code == 401, res.text


def test_hook_allows_clean_command():
    key = get_state("hook_agent_key")
    if not key:
        pytest.skip("no agent key")
    res = _hook(key, "Bash", {"command": "ls -la /tmp"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_hook_denies_command_with_pii():
    key = get_state("hook_agent_key")
    if not key:
        pytest.skip("no agent key")
    res = _hook(key, "Bash", {"command": "echo contact attacker@evil.com >> notes.txt"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["decision"] == "deny"
    assert body["reason"]
    assert any(d["action"] in ("block", "mask") for d in body["detections"])


def test_hook_rejects_malformed_body():
    key = get_state("hook_agent_key")
    if not key:
        pytest.skip("no agent key")
    res = _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"arguments": {"command": "ls"}},  # missing tool_name
    )
    assert res.status_code == 400, res.text


def test_cleanup(api):
    rule_id = get_state("hook_rule_id")
    if rule_id:
        api.delete(f"/mcp/guardrails/{rule_id}")
