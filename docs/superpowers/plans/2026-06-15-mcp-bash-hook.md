# MCP Bash Tool-Call Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /v1/mcp/hook` endpoint in AIGateway that adjudicates (allow/deny) a coding agent's native Bash tool call using existing MCP guardrail + audit services, plus a Claude Code adapter script to call it.

**Architecture:** New FastAPI router `mcp_hook.py` in the MCP module. It authenticates an `sk-mcp-*` agent key, runs the existing `scan_tool_input()` guardrail scan, treats any block-or-mask detection as a deny, always writes an audit row via `log_tool_call()`, and returns a plain JSON `{decision}`. It never forwards or executes the command. A shell adapter wires it into Claude Code as a `PreToolUse` hook.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy (async), existing AIGateway services; Bash + curl + jq for the adapter; pytest (E2E HTTP) for tests.

**Spec:** `docs/superpowers/specs/2026-06-15-mcp-bash-hook-design.md`

---

## Reused building blocks (do not reimplement)

| Symbol | Location | Signature / shape |
|---|---|---|
| `authenticate_agent_key(token)` | `src/services/mcp_proxy_service.py` | `async (token: str) -> dict` with keys `id`, `organization_id`, `name`, `allowed_tools`, `blocked_tools`. Raises `ValueError` on bad key. |
| `scan_tool_input(org_id, tool_name, arguments)` | `src/services/mcp_guardrail_service.py` | `async (int, str, dict) -> ScanResult` |
| `ScanResult` | `src/services/guardrail_service.py:32` | fields: `.blocked: bool`, `.block_reason: str|None`, `.detections: list[Detection]` |
| `Detection` | `src/services/guardrail_service.py:20` | fields: `.guardrail_type: str`, `.entity_type: str`, `.action: "block"|"mask"`, `.matched_text: str` |
| `log_tool_call(...)` | `src/services/mcp_audit_service.py:28` | `async (...)`; `result_status` ∈ `"success"|"error"|"blocked"|"rate_limited"|"approval_required"` |

The MCP proxy registers with **no prefix** (`src/app.py:103`), so a route declared as `@router.post("/v1/mcp/hook")` serves at `/v1/mcp/hook`.

---

## File Structure

- **Create:** `AIGateway/src/routers/mcp_hook.py` — the adjudication endpoint (only new server code).
- **Modify:** `AIGateway/src/app.py` — register the new router (one import + one `include_router`).
- **Create:** `AIGateway/tests/test_13_mcp_hook.py` — E2E tests (live HTTP, matches existing test style).
- **Create:** `scripts/vw-bash-hook.sh` — Claude Code adapter script.
- **Create:** `scripts/vw-bash-hook.README.md` — wiring + env documentation.

---

## Task 1: Adjudication endpoint (`mcp_hook.py`)

**Files:**
- Create: `AIGateway/src/routers/mcp_hook.py`
- Modify: `AIGateway/src/app.py`

- [ ] **Step 1: Write the router**

Create `AIGateway/src/routers/mcp_hook.py`:

```python
"""
Native tool-call hook endpoint — adjudicates a coding agent's own tool calls
(e.g. Claude Code's built-in Bash) WITHOUT forwarding or executing them.

    POST /v1/mcp/hook  — returns {"decision": "allow"} or {"decision": "deny", ...}

Authenticated via agent keys (sk-mcp-*), same as the MCP proxy. Reuses the
existing MCP guardrail scan and audit log. MASK detections are treated as DENY:
a shell command cannot be safely rewritten, so a mask rule blocks it.
"""

import logging
import time

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from services.mcp_audit_service import log_tool_call
from services.mcp_guardrail_service import scan_tool_input
from services.mcp_proxy_service import authenticate_agent_key

logger = logging.getLogger("uvicorn")

router = APIRouter()


async def _extract_agent_key(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <agent-key>")
    token = auth[7:].strip()
    try:
        return await authenticate_agent_key(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/v1/mcp/hook")
async def mcp_hook(request: Request):
    """Adjudicate a native tool call. Never forwards or executes it."""
    agent_key = await _extract_agent_key(request)
    org_id = agent_key["organization_id"]

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    tool_name = body.get("tool_name")
    arguments = body.get("arguments") or {}
    session_id = body.get("session_id")

    if not tool_name or not isinstance(arguments, dict):
        raise HTTPException(status_code=400, detail="tool_name (str) and arguments (object) are required")

    start_time = time.time()
    scan_result = await scan_tool_input(org_id, tool_name, arguments)

    # MASK is treated as DENY for native tool calls — a shell command cannot be
    # safely rewritten, so any mask detection blocks the call.
    mask_hit = any(getattr(d, "action", None) == "mask" for d in scan_result.detections)
    deny = bool(scan_result.blocked or mask_hit)

    if deny:
        reason = scan_result.block_reason
        if not reason and mask_hit:
            reason = "mask rule matched (masking not supported for native tool calls)"
        reason = reason or "policy violation"
        detections = [
            {"rule": d.guardrail_type, "action": d.action, "snippet": d.entity_type}
            for d in scan_result.detections
        ]
        await log_tool_call(
            organization_id=org_id,
            agent_key_id=agent_key["id"],
            server_id=None,
            tool_name=tool_name,
            arguments=arguments,
            result_status="blocked",
            result_summary=f"Hook deny: {reason}",
            is_error=False,
            latency_ms=int((time.time() - start_time) * 1000),
            session_id=session_id,
        )
        return JSONResponse(content={"decision": "deny", "reason": reason, "detections": detections})

    await log_tool_call(
        organization_id=org_id,
        agent_key_id=agent_key["id"],
        server_id=None,
        tool_name=tool_name,
        arguments=arguments,
        result_status="success",
        result_summary="Hook allow",
        is_error=False,
        latency_ms=int((time.time() - start_time) * 1000),
        session_id=session_id,
    )
    return JSONResponse(content={"decision": "allow"})
```

- [ ] **Step 2: Register the router in `app.py`**

In `AIGateway/src/app.py`, add the import next to the other MCP proxy import (near line 30):

```python
from routers.mcp_hook import router as mcp_hook_router
```

And register it next to the MCP proxy registration (near line 103), with **no prefix**:

```python
app.include_router(mcp_hook_router, tags=["MCP Proxy"])
```

- [ ] **Step 3: Verify the service imports resolve**

Run (from `AIGateway/src`, with venv active):

```bash
cd AIGateway/src && python -c "from routers.mcp_hook import router; print('ok')"
```

Expected: prints `ok` (no ImportError). If `authenticate_agent_key`, `scan_tool_input`, or `log_tool_call` can't import, stop and fix the import path before continuing.

- [ ] **Step 4: Start the gateway and smoke-test the route exists**

Run:

```bash
cd AIGateway/src && uvicorn app:app --port 8100 --reload &
sleep 3
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8100/v1/mcp/hook \
  -H "Content-Type: application/json" -d '{"tool_name":"Bash","arguments":{}}'
```

Expected: `401` (route exists, rejects missing auth — proves it's wired, not 404).

- [ ] **Step 5: Commit**

```bash
git add AIGateway/src/routers/mcp_hook.py AIGateway/src/app.py
git commit -m "feat(ai-gateway): add /v1/mcp/hook adjudication endpoint

Adjudicate a coding agent's native tool call (allow/deny) using the
existing MCP guardrail scan and audit log. Never forwards or executes
the command. MASK detections are treated as DENY."
```

---

## Task 2: E2E tests (`test_13_mcp_hook.py`)

These follow the existing live-HTTP E2E style (`tests/conftest.py` provides `api` for Express CRUD and a `Gateway` for direct agent-key auth). They require a running gateway + backend and `VW_PASSWORD` set. We create an agent key + a PII guardrail rule via the API, then exercise the hook directly with the key.

**Files:**
- Create: `AIGateway/tests/test_13_mcp_hook.py`

- [ ] **Step 1: Write the failing tests**

Create `AIGateway/tests/test_13_mcp_hook.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail (before endpoint is deployed) / pass (after)**

Start the gateway + backend, then run:

```bash
cd AIGateway && VW_PASSWORD='Verifywise#1' python -m pytest tests/test_13_mcp_hook.py -v
```

Expected after Task 1: all pass. If `test_hook_denies_command_with_pii` returns `allow`, confirm the PII rule was created (check the response of `test_setup_agent_key_and_rule`) and that Presidio is available in the gateway env. If the agent-keys or guardrails CRUD paths 404, verify the Express proxy is running (`/api/ai-gateway/mcp/*`).

- [ ] **Step 3: Commit**

```bash
git add AIGateway/tests/test_13_mcp_hook.py
git commit -m "test(ai-gateway): E2E tests for /v1/mcp/hook adjudication"
```

---

## Task 3: Claude Code adapter script

**Files:**
- Create: `scripts/vw-bash-hook.sh`
- Create: `scripts/vw-bash-hook.README.md`

- [ ] **Step 1: Write the adapter script**

Create `scripts/vw-bash-hook.sh`:

```bash
#!/usr/bin/env bash
# VerifyWise Bash gate — Claude Code PreToolUse hook.
# Reads the tool call as JSON on stdin, asks the AI Gateway to adjudicate,
# and exits 0 (allow) or non-zero (deny). Fails open by default so a gateway
# outage never halts your workflow.
#
# Env:
#   VW_GATEWAY_URL  (required)  e.g. http://localhost:8100
#   VW_AGENT_KEY    (required)  sk-mcp-...
#   VW_FAIL_MODE    (optional)  open | closed   (default: open)
#   VW_TIMEOUT      (optional)  seconds          (default: 3)
set -uo pipefail

FAIL_MODE="${VW_FAIL_MODE:-open}"
TIMEOUT="${VW_TIMEOUT:-3}"

fail() {  # $1 = stderr message
  echo "vw-bash-hook: $1" >&2
  if [ "$FAIL_MODE" = "closed" ]; then exit 2; fi
  exit 0   # fail-open
}

[ -n "${VW_GATEWAY_URL:-}" ] || fail "VW_GATEWAY_URL not set"
[ -n "${VW_AGENT_KEY:-}" ]   || fail "VW_AGENT_KEY not set"
command -v jq   >/dev/null 2>&1 || fail "jq not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // .tool.name // "Bash"')"
arguments="$(printf '%s' "$input" | jq -c '.tool_input // .arguments // {}')"

payload="$(jq -nc --arg t "$tool_name" --argjson a "$arguments" '{tool_name:$t, arguments:$a}')"

resp="$(curl -s --max-time "$TIMEOUT" -X POST "$VW_GATEWAY_URL/v1/mcp/hook" \
  -H "Authorization: Bearer $VW_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d "$payload")" || fail "gateway unreachable"

[ -n "$resp" ] || fail "empty gateway response"

decision="$(printf '%s' "$resp" | jq -r '.decision // "error"')"
case "$decision" in
  allow) exit 0 ;;
  deny)
    reason="$(printf '%s' "$resp" | jq -r '.reason // "policy violation"')"
    echo "Blocked by VerifyWise: $reason" >&2
    exit 2 ;;
  *) fail "unexpected gateway response: $resp" ;;
esac
```

- [ ] **Step 2: Make it executable**

Run:

```bash
chmod +x scripts/vw-bash-hook.sh
```

- [ ] **Step 3: Test allow path (clean command, against a running gateway)**

Run (replace the key with a real `sk-mcp-*` minted in the Agent Keys UI):

```bash
export VW_GATEWAY_URL=http://localhost:8100
export VW_AGENT_KEY=sk-mcp-REPLACE
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' | ./scripts/vw-bash-hook.sh ; echo "exit=$?"
```

Expected: `exit=0`, no stderr.

- [ ] **Step 4: Test deny path (PII command)**

Run (requires the PII block rule from Task 2 to exist for this org):

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"echo me@evil.com"}}' | ./scripts/vw-bash-hook.sh ; echo "exit=$?"
```

Expected: `exit=2`, stderr line `Blocked by VerifyWise: ...`.

- [ ] **Step 5: Test fail-open (gateway down)**

Run:

```bash
VW_GATEWAY_URL=http://localhost:59999 \
  bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"}}" | ./scripts/vw-bash-hook.sh' ; echo "exit=$?"
```

Expected: `exit=0`, stderr warns `gateway unreachable`.

- [ ] **Step 6: Test fail-closed override**

Run:

```bash
VW_GATEWAY_URL=http://localhost:59999 VW_FAIL_MODE=closed \
  bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"}}" | ./scripts/vw-bash-hook.sh' ; echo "exit=$?"
```

Expected: `exit=2`.

- [ ] **Step 7: Write the README**

Create `scripts/vw-bash-hook.README.md`:

```markdown
# VerifyWise Bash gate (Claude Code hook)

Gates Claude Code's built-in **Bash** tool through the VerifyWise AI Gateway.
Before a shell command runs, the gateway scans it against your org's MCP
guardrail rules and the call is allowed or denied. Every call is recorded in
the MCP Audit Log.

## Setup

1. Mint an agent key: VerifyWise → AI Gateway → MCP Gateway → **Agent Keys** →
   create. Copy the `sk-mcp-...` value (shown once).
2. Add the guardrail rules you want enforced under MCP Gateway → **Guardrails**.
3. Set env vars (e.g. in your shell profile):

   ```bash
   export VW_GATEWAY_URL=http://localhost:8100   # your gateway URL
   export VW_AGENT_KEY=sk-mcp-...
   # optional:
   export VW_FAIL_MODE=open   # open (default) | closed
   export VW_TIMEOUT=3        # seconds
   ```

4. Wire the hook in `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Bash",
           "hooks": [{ "type": "command", "command": "scripts/vw-bash-hook.sh" }] }
       ]
     }
   }
   ```

## Behavior

| Situation | Result |
|---|---|
| Command passes guardrails | runs (exit 0) |
| Guardrail blocks (or a mask rule matches) | blocked (exit 2), reason shown to the agent |
| Gateway unreachable / timeout | `VW_FAIL_MODE=open` → runs; `closed` → blocked |

Requires `curl` and `jq` on PATH.
```

- [ ] **Step 8: Commit**

```bash
git add scripts/vw-bash-hook.sh scripts/vw-bash-hook.README.md
git commit -m "feat(ai-gateway): add Claude Code Bash hook adapter

Shell PreToolUse adapter that adjudicates Bash commands via
/v1/mcp/hook. Fail-open by default with a fail-closed override and
a request timeout."
```

---

## Self-review notes

- **Spec coverage:** endpoint contract → Task 1; adjudicate-don't-forward (`server_id=None`, no forward call) → Task 1; MASK→deny → Task 1 (`mask_hit`); audit on both paths → Task 1; `sk-mcp-*` auth → Task 1 (`authenticate_agent_key`); allow/deny/401/400 + PII deny → Task 2; adapter + fail-open + timeout + fail-closed override + Claude Code wiring → Task 3; UI reuse → no task needed (existing screens read the same tables). The optional Agent-Keys snippet tweak is deliberately omitted (spec marks it "may defer").
- **No new schema / migration:** the hook writes to `ai_gateway_mcp_audit_logs` via the existing `log_tool_call`; no DDL.
- **Type consistency:** `Detection.action` ∈ `{block, mask}`, `.guardrail_type`, `.entity_type` used exactly as defined in `guardrail_service.py`; `log_tool_call` called with its real keyword signature including `session_id`.
- **Adapter input keys:** reads both `tool_name`/`arguments` (our contract) and `tool.name`/`tool_input` (Claude Code's PreToolUse payload shape) defensively via jq fallbacks.
```
