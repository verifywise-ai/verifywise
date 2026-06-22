"""E2E: agent runs correlation — tool calls carrying a session_id group into a run.

Requires AI Gateway on :8100 and Express on :3000 (mirror test_13_mcp_hook.py setup).
"""

import os
import uuid
import httpx
import pytest
from conftest import set_state, get_state

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
_client = httpx.Client(timeout=30.0)


def _hook(key, command, session_id, tool_use_id):
    return _client.post(
        f"{GATEWAY_URL}/v1/mcp/hook",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "tool_name": "Bash",
            "arguments": {"command": command},
            "session_id": session_id,
            "tool_use_id": tool_use_id,
        },
    )


def test_setup(api):
    res = api.post("/mcp/agent-keys", json={"name": "E2E Runs Key"})
    assert res.status_code in (200, 201), res.text
    # The full sk-mcp-* value is returned once, under data.plain_key.
    set_state("runs_key", res.json()["data"]["plain_key"])


def test_two_tool_calls_same_session_form_one_run(api):
    key = get_state("runs_key")
    if not key:
        pytest.skip("no agent key")
    run_id = f"run-{uuid.uuid4()}"

    r1 = _hook(key, "echo one", run_id, "tu-1")
    r2 = _hook(key, "echo two", run_id, "tu-2")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.json()["decision"] == "allow"
    assert r2.json()["decision"] == "allow"

    runs = api.get("/mcp/runs?limit=100")
    assert runs.status_code == 200, runs.text
    match = [r for r in runs.json()["data"] if r["agent_run_id"] == run_id]
    assert len(match) == 1, "the two calls should collapse into one run"
    assert match[0]["tool_count"] == 2
    assert match[0]["model_count"] == 0

    detail = api.get(f"/mcp/runs/{run_id}")
    assert detail.status_code == 200, detail.text
    entries = detail.json()["data"]["entries"]
    assert len(entries) == 2
    assert all(e["kind"] == "tool" for e in entries)


def test_unknown_run_404(api):
    res = api.get("/mcp/runs/does-not-exist-xyz")
    assert res.status_code == 404
