"""E2E: field-aware file-write gating via /v1/mcp/hook.

Proves the gateway scans only WRITTEN content for file-write tools:
deleting PII is allowed, writing PII is denied. Audit keeps the full call.
"""

import os
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def _hook(key, tool_name, arguments):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"tool_name": tool_name, "arguments": arguments},
    )


def test_setup(api):
    key_res = api.post("/mcp/agent-keys", json={"name": "E2E FileWrite Key"})
    assert key_res.status_code in (200, 201), key_res.text
    set_state("fw_key", key_res.json()["data"]["plain_key"])
    set_state("fw_key_id", key_res.json()["data"]["id"])

    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E FileWrite PII",
        "rule_type": "pii",
        "action": "block",
        "config": {"entities": {"EMAIL_ADDRESS": "block"}, "score_thresholds": {"ALL": 0.7}, "language": "en"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text
    set_state("fw_pii_rule_id", rule_res.json()["data"]["id"])

    appr_res = api.post("/mcp/guardrails", json={
        "name": "E2E FileWrite Approve Keys",
        "rule_type": "require_approval",
        "config": {"type": "regex", "pattern": r"BEGIN [A-Z ]*PRIVATE KEY"},
    })
    assert appr_res.status_code in (200, 201), appr_res.text
    set_state("fw_appr_rule_id", appr_res.json()["data"]["id"])


# ── The killer test: written content is scanned, removed content is not ──

def test_edit_writing_pii_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Edit", {"file_path": "/tmp/x", "old_string": "x", "new_string": "contact me@evil.com"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_edit_deleting_pii_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    # PII is only in old_string (being removed). new_string is clean -> allow.
    res = _hook(key, "Edit", {"file_path": "/tmp/x", "old_string": "contact me@evil.com", "new_string": "contact removed"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


# ── Write / MultiEdit / path / clean coverage ──

def test_write_pii_content_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/x", "content": "contact me@evil.com"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_write_clean_content_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/x", "content": "hello world"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_multiedit_pii_in_new_string_is_denied(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "MultiEdit", {"file_path": "/tmp/x", "edits": [
        {"old_string": "a", "new_string": "clean"},
        {"old_string": "b", "new_string": "leak me@evil.com"},
    ]})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "deny"


def test_multiedit_pii_only_in_old_string_is_allowed(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "MultiEdit", {"file_path": "/tmp/x", "edits": [
        {"old_string": "remove me@evil.com", "new_string": "removed"},
    ]})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_pii_in_file_path_is_not_scanned(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    # Email-like string in the PATH, clean content -> path not scanned -> allow.
    res = _hook(key, "Write", {"file_path": "/home/me@evil.com/notes.txt", "content": "hello"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "allow"


def test_require_approval_on_written_content(api):
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/key.pem", "content": "-----BEGIN RSA PRIVATE KEY-----"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"] == "approval_required"


def test_audit_keeps_full_arguments(api):
    """A denied Write's audit row must contain the full call (path + content),
    not just the scanned subset."""
    key = get_state("fw_key")
    if not key:
        pytest.skip("no key")
    res = _hook(key, "Write", {"file_path": "/tmp/audit-check.txt", "content": "leak me@evil.com"})
    assert res.json()["decision"] == "deny"
    logs = api.get("/mcp/audit/logs?limit=10")
    assert logs.status_code == 200, logs.text
    rows = logs.json()["data"]
    match = next((r for r in rows if r.get("arguments", {}).get("file_path") == "/tmp/audit-check.txt"), None)
    assert match is not None, "denied Write not found in audit logs"
    # Full args preserved: both path and content present in the audit record.
    assert match["arguments"].get("content") == "leak me@evil.com"


def test_cleanup(api):
    for sid in ("fw_pii_rule_id", "fw_appr_rule_id"):
        rid = get_state(sid)
        if rid:
            res = api.delete(f"/mcp/guardrails/{rid}")
            assert res.status_code in (200, 204), res.text
    # Don't leak the agent key: revoke (keys must be inactive to delete), then delete.
    key_id = get_state("fw_key_id")
    if key_id:
        api.post(f"/mcp/agent-keys/{key_id}/revoke")
        api.delete(f"/mcp/agent-keys/{key_id}")
