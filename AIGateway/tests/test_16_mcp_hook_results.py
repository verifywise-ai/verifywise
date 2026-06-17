"""E2E: native tool-call result capture (/v1/mcp/hook/result)."""
import json
import os
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def test_setup_result_key_and_pii_rule(api):
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E Result Key"})
    assert key_res.status_code in (200, 201), key_res.text
    set_state("result_agent_key", key_res.json()["data"]["plain_key"])
    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E Result PII Mask",
        "rule_type": "pii",
        "action": "mask",
        "config": {"entities": {"EMAIL_ADDRESS": "mask"}, "score_thresholds": {"ALL": 0.5}, "language": "en"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text


def _hook(key, tool_name, arguments, session_id, tool_use_id):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": tool_name, "arguments": arguments,
              "session_id": session_id, "tool_use_id": tool_use_id},
    )


def _result(key, tool_name, tool_response, session_id, tool_use_id):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook/result",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": tool_name, "tool_response": tool_response,
              "session_id": session_id, "tool_use_id": tool_use_id},
    )


def test_allow_then_result_attaches():
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    sid, tuid = "sess-A", "toolu_A1"
    assert _hook(key, "Bash", {"command": "ls"}, sid, tuid).json()["decision"] == "allow"
    res = _result(key, "Bash", {"stdout": "file1\nfile2", "stderr": "", "interrupted": False, "isImage": False}, sid, tuid)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"


def test_result_masks_pii_in_stdout(api):
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    sid, tuid = "sess-B", "toolu_B1"

    # Guard: pre-tool hook must allow the command (no PII in arguments).
    assert _hook(key, "Bash", {"command": "cat creds"}, sid, tuid).json()["decision"] == "allow"

    # Post-tool result contains an email — masking rule must fire.
    res = _result(
        key, "Bash",
        {"stdout": "token for attacker@evil.com", "stderr": "", "interrupted": False, "isImage": False},
        sid, tuid,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"

    # Read the row back and verify PII was masked at storage.
    #
    # Strategy: LIST endpoint (GET /mcp/audit/logs) returns `id` and `session_id`
    # but NOT `tool_use_id`/`result_response`. We find the row by session_id to
    # get its `id`, then fetch the single-row endpoint which does expose
    # `tool_use_id` and `result_response`.
    listed = api.get("/mcp/audit/logs?limit=100")
    assert listed.status_code == 200, listed.text
    rows = listed.json().get("data") or []
    # Locate the row written for this session.
    match = next((r for r in rows if r.get("session_id") == sid), None)
    assert match is not None, f"audit row not found for session_id={sid!r}"

    # Fetch single-row endpoint for result_response (not in LIST SELECT).
    log_id = match["id"]
    detail = api.get(f"/mcp/audit/logs/{log_id}")
    assert detail.status_code == 200, detail.text
    row = detail.json().get("data") or {}
    assert row.get("tool_use_id") == tuid, "tool_use_id mismatch in stored row"
    # The raw email must not appear in the stored result (it must have been masked).
    assert "attacker@evil.com" not in json.dumps(row.get("result_response") or {})


def test_result_no_match_returns_ok_status():
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    res = _result(key, "Bash", {"stdout": "x"}, "sess-never", "toolu-never")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "no_match"


def test_result_missing_ids_returns_400():
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    res = _client.post(f"{GATEWAY_URL}/v1/mcp/hook/result",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": "Bash", "tool_response": {"stdout": "x"}})
    assert res.status_code == 400, res.text


def test_result_bad_key_returns_401():
    res = _client.post(f"{GATEWAY_URL}/v1/mcp/hook/result",
        headers={"Authorization": "Bearer sk-mcp-not-a-real-key", "Content-Type": "application/json"},
        json={"tool_name": "Bash", "tool_response": {"stdout": "x"}, "session_id": "s", "tool_use_id": "t"})
    assert res.status_code == 401, res.text
