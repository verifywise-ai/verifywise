# Native-Call Approval (MCP Hook Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human approve/deny a coding agent's native Bash command before it runs, by adding a `require_approval` guardrail rule type that routes matching commands through the MCP gateway's existing approval flow, with the dev-machine hook blocking and polling for the decision.

**Architecture:** A new, hook-only module `mcp_approval_match.py` matches the command string against `require_approval` rules (regex/keyword), keeping the shared guardrail scanner untouched. `mcp_hook.py` gains an approval branch (between scan and allow) that reuses the existing `create_approval_request`/`get_approved_request`/`get_pending_request`/`notify_approval_pending` machinery and the existing `GET /v1/mcp/approvals/{id}/status` poll endpoint. The adapter script gains an `approval_required` polling loop and a `rate_limited` branch. One Alembic migration makes `tool_id` nullable.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Alembic; Bash + curl + jq; pytest (E2E HTTP).

**Spec:** `docs/superpowers/specs/2026-06-15-mcp-hook-approval-design.md`
**Branch:** `feat/mcp-hook-approval` (already created, off `feat/mcp-bash-hook`)

---

## Reused building blocks (verified — do not reimplement)

| Symbol | Location | Shape |
|---|---|---|
| `create_approval_request(org_id, data)` | `src/crud/mcp_approvals.py:9` | `data` keys: agent_key_id, tool_id, tool_name, arguments, arguments_hash, expires_at. Passes `tool_id` straight to INSERT (so `tool_id=None` works once column is nullable). Returns row dict incl. `id`, `expires_at`. |
| `get_approved_request(org_id, agent_key_id, tool_name, arguments_hash)` | `src/crud/mcp_approvals.py:170` | returns dict or None |
| `get_pending_request(...)` (same args) | `src/crud/mcp_approvals.py:135` | returns dict or None |
| `get_approval_status(org_id, request_id)` | `src/crud/mcp_approvals.py:205` | backs `GET /v1/mcp/approvals/{id}/status` which returns `{approval_id,status,decided_at,decision_reason,expires_at}` |
| `notify_approval_pending(org_id, approval_dict)` | `src/utils/notifications.py:105` | fire-and-forget |
| `hash_arguments(arguments)` | `src/utils/mcp_arguments.py:13` | SHA-256 of canonical JSON |
| `enforce_mcp_rate_limits(agent_key, tool_name)` | `src/services/mcp_proxy_service.py:84` | **raises `HTTPException(status_code=429)`** on exceed (does NOT return a flag) |
| `settings.mcp_approval_expiry_seconds` | `src/config.py` | 900 |
| Content-filter match primitive to MIRROR | `src/services/guardrail_service.py:40,57` | `config:{type:"keyword"|"regex", pattern:"..."}`; `_get_compiled_pattern` + `_run_regex_safe` (50k ReDoS cap) |
| Guardrails CRUD validation | `src/routers/mcp_guardrails.py:17` | `VALID_RULE_TYPES={pii,content_filter,prompt_injection}`, `VALID_ACTIONS={block,mask}`, `action` is REQUIRED |
| Alembic head | `src/database/migrations/versions/a0005_*.py` | revision `a0005`; new migration is `a0006` revises `a0005` |
| Phase 1 hook | `src/routers/mcp_hook.py` | has local `_extract_agent_key`; allow/deny logic |
| Phase 1 adapter | `scripts/vw-bash-hook.sh` | allow/deny/fail-open; no-temp-file HTTP-status capture |

---

## File Structure

- **Create:** `AIGateway/src/database/migrations/versions/a0006_mcp_approval_native_calls.py` — `tool_id` nullable.
- **Create:** `AIGateway/src/services/mcp_approval_match.py` — hook-only `check_require_approval()`.
- **Modify:** `AIGateway/src/routers/mcp_guardrails.py` — allow `require_approval` rule_type (action optional for it).
- **Modify:** `AIGateway/src/services/mcp_proxy_service.py` — extract shared `extract_agent_key()`.
- **Modify:** `AIGateway/src/routers/mcp_proxy.py` — use shared `extract_agent_key()`.
- **Modify:** `AIGateway/src/routers/mcp_hook.py` — use shared auth, add rate-limit + approval branches.
- **Modify:** `scripts/vw-bash-hook.sh` + `scripts/vw-bash-hook.README.md` — approval polling + rate_limited.
- **Create:** `AIGateway/tests/test_14_mcp_hook_approval.py` — E2E tests.

---

## Task 1: Migration — make `tool_id` nullable

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0006_mcp_approval_native_calls.py`

- [ ] **Step 1: Write the migration**

```python
"""Make approval tool_id nullable for native (non-MCP) tool-call approvals.

Native tool calls (e.g. a coding agent's built-in Bash) have no row in
ai_gateway_mcp_tools, so their approval requests carry a NULL tool_id and rely
on tool_name instead.

Revision ID: a0006
Revises: a0005
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a0006"
down_revision: Union[str, None] = "a0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_approval_requests
        ALTER COLUMN tool_id DROP NOT NULL
    """)


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    # Re-applying NOT NULL fails if NULL rows exist; clear native-call rows first.
    op.execute("""
        DELETE FROM ai_gateway_mcp_approval_requests WHERE tool_id IS NULL
    """)
    op.execute("""
        ALTER TABLE ai_gateway_mcp_approval_requests
        ALTER COLUMN tool_id SET NOT NULL
    """)
```

- [ ] **Step 2: Apply it**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && source venv/bin/activate 2>/dev/null; cd src && alembic upgrade head
```
Expected: runs without error, ends at `a0006`.

- [ ] **Step 3: Verify the column is nullable**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway/src && alembic current
```
Expected: shows `a0006 (head)`. (If you have psql access, optionally confirm `tool_id` `is_nullable=YES`; not required.)

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/database/migrations/versions/a0006_mcp_approval_native_calls.py && git commit -m "feat(ai-gateway): make approval tool_id nullable for native calls"
```

---

## Task 2: Allow `require_approval` rule type in guardrails CRUD

`require_approval` rules have no block/mask action — the rule type *is* the action. The CRUD currently requires `action ∈ {block,mask}`. Make `action` optional (and default to a sentinel) specifically for this rule type.

**Files:**
- Modify: `AIGateway/src/routers/mcp_guardrails.py:17` (VALID_RULE_TYPES), `:65-90` (validation), `:134-137` (record build)

- [ ] **Step 1: Read the current validation block**

```bash
sed -n '60,140p' /Users/gorkemcetin/verifywise/AIGateway/src/routers/mcp_guardrails.py
```

- [ ] **Step 2: Add the rule type and relax the action requirement**

Change line 17 from:
```python
VALID_RULE_TYPES = {"pii", "content_filter", "prompt_injection"}
```
to:
```python
VALID_RULE_TYPES = {"pii", "content_filter", "prompt_injection", "require_approval"}
```

Then in the create handler, replace the action-required block (the `action = body.get("action")` / `if not action:` / `if action not in VALID_ACTIONS:` sequence around lines 78-89) with:

```python
    # Validate action. require_approval rules have no block/mask action — the
    # rule type itself is the effect — so action is optional and defaults to
    # the sentinel "require_approval".
    action = body.get("action")
    if rule_type == "require_approval":
        action = "require_approval"
    else:
        if not action:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="action is required",
            )
        if action not in VALID_ACTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"action must be one of: {', '.join(sorted(VALID_ACTIONS))}",
            )
```

(Match the exact `HTTPException`/`status` import style already used in the file — read lines 60-95 first and mirror it. The record-build block at ~134-137 already sets `"action": action`, so no change there.)

- [ ] **Step 3: Verify it imports and the validation logic is sound**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway/src && python -c "import routers.mcp_guardrails; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Smoke-test via the running stack** (gateway + backend up)

```bash
cd /Users/gorkemcetin/verifywise
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login -H "Content-Type: application/json" -d '{"email":"gorkem.cetin@verifywise.ai","password":"Verifywise#1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s -X POST http://localhost:3000/api/ai-gateway/mcp/guardrails -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Approve rm -rf","rule_type":"require_approval","config":{"type":"regex","pattern":"rm\\s+-rf"}}' -w "\nHTTP %{http_code}\n"
```
Expected: `HTTP 201` with a record (no "action is required" error). Note the returned `data.id` and delete it afterward, or leave it for Task 5 tests to reuse.

- [ ] **Step 5: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/routers/mcp_guardrails.py && git commit -m "feat(ai-gateway): accept require_approval guardrail rule type"
```

---

## Task 3: `mcp_approval_match.py` — hook-only command matcher

Mirrors the content-filter primitive but is imported ONLY by the hook, so the shared scanner is never touched.

**Files:**
- Create: `AIGateway/src/services/mcp_approval_match.py`

- [ ] **Step 1: Write the module**

```python
"""
Hook-only matcher for require_approval guardrail rules.

Imported ONLY by mcp_hook.py — never by the shared scan_text / scan_tool_input.
Matches the serialized command string against active require_approval rules
(regex or keyword), reusing the same config shape and ReDoS guard as the
content-filter scanner.
"""

import json
import logging
import re
from typing import Optional

from sqlalchemy import text

from database.db import get_db

logger = logging.getLogger("uvicorn")

_REDOS_CAP = 50000  # mirror guardrail_service._run_regex_safe


def _serialize(arguments: dict) -> str:
    parts: list[str] = []
    for value in arguments.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, (dict, list)):
            parts.append(json.dumps(value))
    return "\n".join(parts)


def _matches(config: dict, text_in: str) -> bool:
    filter_type = config.get("type", "keyword")
    pattern_str = config.get("pattern", "")
    if not pattern_str:
        return False
    scan = text_in[:_REDOS_CAP]
    try:
        if filter_type == "keyword":
            escaped = re.escape(pattern_str)
            raw = r"\b" + escaped + r"\b" if " " not in pattern_str else escaped
        else:
            raw = pattern_str
        return re.search(raw, scan, re.IGNORECASE) is not None
    except re.error as e:
        logger.warning(f"Invalid require_approval pattern '{pattern_str[:50]}': {e}")
        return False


async def check_require_approval(org_id: int, tool_name: str, arguments: dict) -> Optional[dict]:
    """Return the first active require_approval rule matching the command, else None."""
    input_text = _serialize(arguments)
    if not input_text.strip():
        return None

    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, name, config
                FROM ai_gateway_mcp_guardrail_rules
                WHERE organization_id = :org_id
                  AND rule_type = 'require_approval'
                  AND is_active = true
                  AND (
                      applies_to_tools IS NULL
                      OR array_length(applies_to_tools, 1) IS NULL
                      OR :tool_name = ANY(applies_to_tools)
                  )
                ORDER BY created_at
            """),
            {"org_id": org_id, "tool_name": tool_name},
        )
        rules = [dict(r) for r in result.mappings().fetchall()]

    for rule in rules:
        if _matches(rule.get("config") or {}, input_text):
            return rule
    return None
```

- [ ] **Step 2: Verify it imports**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway/src && python -c "from services.mcp_approval_match import check_require_approval; print('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/services/mcp_approval_match.py && git commit -m "feat(ai-gateway): add hook-only require_approval command matcher"
```

---

## Task 4: Wire approval + rate-limit + shared auth into the hook

**Files:**
- Modify: `AIGateway/src/services/mcp_proxy_service.py` (add `extract_agent_key`)
- Modify: `AIGateway/src/routers/mcp_proxy.py` (use shared helper)
- Modify: `AIGateway/src/routers/mcp_hook.py` (shared auth + rate-limit + approval branch)

- [ ] **Step 1: Add shared `extract_agent_key` to `mcp_proxy_service.py`**

Append this function to `AIGateway/src/services/mcp_proxy_service.py` (it already imports/defines `authenticate_agent_key`; add the FastAPI imports at the top if not present):

```python
from fastapi import Request, HTTPException  # add to existing imports if missing


async def extract_agent_key(request: Request) -> dict:
    """Authenticate an sk-mcp-* bearer token from a request. Raises 401 on failure."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <agent-key>")
    token = auth[7:].strip()
    try:
        return await authenticate_agent_key(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
```

- [ ] **Step 2: Point `mcp_proxy.py` at the shared helper**

In `AIGateway/src/routers/mcp_proxy.py`: delete the local `_extract_agent_key` function (lines ~53-61) and import the shared one. Update the import line that pulls from `services.mcp_proxy_service` to also import `extract_agent_key`, and replace the two call sites `await _extract_agent_key(request)` with `await extract_agent_key(request)`.

```bash
grep -n "_extract_agent_key\|from services.mcp_proxy_service" /Users/gorkemcetin/verifywise/AIGateway/src/routers/mcp_proxy.py
```
(Read the file, make the edits, keep behavior identical.)

- [ ] **Step 3: Verify proxy still imports**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway/src && python -c "import routers.mcp_proxy; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Rewrite `mcp_hook.py` to the full Phase 2 body**

Replace the entire contents of `AIGateway/src/routers/mcp_hook.py` with:

```python
"""
Native tool-call hook endpoint — adjudicates a coding agent's own tool calls
(e.g. Claude Code's built-in Bash) WITHOUT forwarding or executing them.

    POST /v1/mcp/hook  -> {"decision": "allow" | "deny" | "approval_required" | "rate_limited", ...}

Authenticated via agent keys (sk-mcp-*). Reuses the existing MCP guardrail scan,
audit log, rate limiter, and approval flow. MASK detections are treated as DENY.
require_approval rules (matched in the hook-only mcp_approval_match module) create
an approval request and tell the caller to poll. Rate-limit exceed is reported as
a distinct decision so the adapter can apply its infra fail-mode.
"""

import logging
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from config import settings
from crud.mcp_approvals import create_approval_request, get_approved_request, get_pending_request
from services.mcp_audit_service import log_tool_call
from services.mcp_approval_match import check_require_approval
from services.mcp_guardrail_service import scan_tool_input
from services.mcp_proxy_service import extract_agent_key, enforce_mcp_rate_limits
from utils.mcp_arguments import hash_arguments
from utils.notifications import notify_approval_pending

logger = logging.getLogger("uvicorn")

router = APIRouter()


@router.post("/v1/mcp/hook")
async def mcp_hook(request: Request):
    """Adjudicate a native tool call. Never forwards or executes it."""
    agent_key = await extract_agent_key(request)
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

    async def _audit(status: str, summary: str, is_error: bool = False):
        await log_tool_call(
            organization_id=org_id,
            agent_key_id=agent_key["id"],
            server_id=None,
            tool_name=tool_name,
            arguments=arguments,
            result_status=status,
            result_summary=summary,
            is_error=is_error,
            latency_ms=int((time.time() - start_time) * 1000),
            session_id=session_id,
        )

    # ── Rate limit (infra, not policy) ──────────────────────────────────────
    try:
        await enforce_mcp_rate_limits(agent_key, tool_name)
    except HTTPException as e:
        if e.status_code == 429:
            await _audit("rate_limited", "Hook rate limited")
            return JSONResponse(content={"decision": "rate_limited", "reason": "rate limit exceeded"})
        raise

    # ── Guardrail scan (UNCHANGED shared path): block / mask -> deny ─────────
    scan_result = await scan_tool_input(org_id, tool_name, arguments)
    mask_hit = any(getattr(d, "action", None) == "mask" for d in scan_result.detections)
    if scan_result.blocked or mask_hit:
        reason = scan_result.block_reason
        if not reason and mask_hit:
            reason = "mask rule matched (masking not supported for native tool calls)"
        reason = reason or "policy violation"
        detections = [
            {"rule": d.guardrail_type, "action": d.action, "snippet": d.entity_type}
            for d in scan_result.detections
        ]
        await _audit("blocked", f"Hook deny: {reason}")
        return JSONResponse(content={"decision": "deny", "reason": reason, "detections": detections})

    # ── require_approval (hook-only matcher): create/reuse approval request ──
    approval_rule = await check_require_approval(org_id, tool_name, arguments)
    if approval_rule:
        args_hash = hash_arguments(arguments)
        approved = await get_approved_request(org_id, agent_key["id"], tool_name, args_hash)
        if not approved:
            pending = await get_pending_request(org_id, agent_key["id"], tool_name, args_hash)
            if pending:
                approval = pending
            else:
                expires_at = datetime.now(timezone.utc) + timedelta(
                    seconds=settings.mcp_approval_expiry_seconds
                )
                approval = await create_approval_request(org_id, {
                    "agent_key_id": agent_key["id"],
                    "tool_id": None,
                    "tool_name": tool_name,
                    "arguments": arguments,
                    "arguments_hash": args_hash,
                    "expires_at": expires_at,
                })
                await notify_approval_pending(org_id, {
                    "approval_id": approval.get("id"),
                    "tool_name": tool_name,
                    "agent_key_id": agent_key["id"],
                    "agent_key_name": agent_key.get("name"),
                })
            await _audit("approval_required", f"Approval request {approval.get('id')} created")
            exp = approval.get("expires_at")
            return JSONResponse(content={
                "decision": "approval_required",
                "approval_id": approval.get("id"),
                "poll_endpoint": f"/v1/mcp/approvals/{approval.get('id')}/status",
                "expires_at": exp.isoformat() if hasattr(exp, "isoformat") else str(exp),
            })
        # else: already approved for this exact call — fall through to allow

    await _audit("success", "Hook allow")
    return JSONResponse(content={"decision": "allow"})
```

- [ ] **Step 5: Verify the hook imports**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway/src && python -c "from routers.mcp_hook import router; print('ok')"
```
Expected: `ok`.

- [ ] **Step 6: Restart the gateway and smoke-test allow still works**

Restart your running gateway (so the new code loads), then:
```bash
cd /Users/gorkemcetin/verifywise
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login -H "Content-Type: application/json" -d '{"email":"gorkem.cetin@verifywise.ai","password":"Verifywise#1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
KEY=$(curl -s -X POST http://localhost:3000/api/ai-gateway/mcp/agent-keys -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"P2 smoke"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['plain_key'])")
curl -s -X POST http://localhost:8100/v1/mcp/hook -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"tool_name":"Bash","arguments":{"command":"ls /tmp"}}'
```
Expected: `{"decision":"allow"}`.

- [ ] **Step 7: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/src/services/mcp_proxy_service.py AIGateway/src/routers/mcp_proxy.py AIGateway/src/routers/mcp_hook.py && git commit -m "feat(ai-gateway): hook approval + rate-limit branches, shared auth helper

Dedup _extract_agent_key into mcp_proxy_service.extract_agent_key (used
by both routers). Add rate-limit (returns decision rate_limited) and a
require_approval branch that reuses the existing approval flow with a
NULL tool_id for native calls."
```

---

## Task 5: E2E tests

**Files:**
- Create: `AIGateway/tests/test_14_mcp_hook_approval.py`

- [ ] **Step 1: Write the tests**

```python
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


def test_cleanup(api):
    rid = get_state("appr_rule_id")
    if rid:
        api.delete(f"/mcp/guardrails/{rid}")
```

- [ ] **Step 2: Run the tests** (gateway + backend up, gateway restarted with Task 4 code)

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && VW_PASSWORD='Verifywise#1' python -m pytest tests/test_14_mcp_hook_approval.py -v
```
Expected: all pass. If `test_matching_command_requires_approval` returns `allow`, the require_approval rule wasn't created (check Task 2) or the gateway wasn't restarted. If `test_approve_then_same_command_allows` returns `approval_required`, the arg-hash reuse path (`get_approved_request`) isn't matching — verify the approve call set status='approved'.

- [ ] **Step 3: Run the Phase 1 suite as a regression guard**

```bash
cd /Users/gorkemcetin/verifywise/AIGateway && VW_PASSWORD='Verifywise#1' python -m pytest tests/test_13_mcp_hook.py -v
```
Expected: all 7 still pass (proves the shared-auth dedup and new branches didn't break Phase 1 allow/deny).

- [ ] **Step 4: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add AIGateway/tests/test_14_mcp_hook_approval.py && git commit -m "test(ai-gateway): E2E tests for native-call approval flow"
```

---

## Task 6: Adapter — approval polling + rate_limited branch

**Files:**
- Modify: `scripts/vw-bash-hook.sh`
- Modify: `scripts/vw-bash-hook.README.md`

- [ ] **Step 1: Read the current decision `case` block**

```bash
sed -n '1,60p' /Users/gorkemcetin/verifywise/scripts/vw-bash-hook.sh
```

- [ ] **Step 2: Add the new env defaults**

After the existing `TIMEOUT="${VW_TIMEOUT:-3}"` line near the top, add:

```bash
APPROVAL_WAIT="${VW_APPROVAL_WAIT:-120}"
APPROVAL_FAIL_MODE="${VW_APPROVAL_FAIL_MODE:-closed}"
```

- [ ] **Step 3: Replace the decision `case` block** (the `case "$decision" in ... esac` at the end)

```bash
case "$decision" in
  allow) exit 0 ;;
  deny)
    reason="$(printf '%s' "$resp" | jq -r '.reason // "policy violation"')"
    echo "Blocked by VerifyWise: $reason" >&2
    exit 2 ;;
  rate_limited)
    # Infra outcome, not policy — follow the general fail-mode.
    echo "vw-bash-hook: rate limited" >&2
    if [ "$FAIL_MODE" = "closed" ]; then exit 2; fi
    exit 0 ;;
  approval_required)
    approval_id="$(printf '%s' "$resp" | jq -r '.approval_id')"
    poll_endpoint="$(printf '%s' "$resp" | jq -r '.poll_endpoint')"
    echo "vw-bash-hook: awaiting human approval (id=$approval_id, up to ${APPROVAL_WAIT}s)" >&2
    deadline=$(( $(date +%s) + APPROVAL_WAIT ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
      praw="$(curl -s -w '\n%{http_code}' --max-time "$TIMEOUT" \
        -H "Authorization: Bearer $VW_AGENT_KEY" \
        "$VW_GATEWAY_URL$poll_endpoint")" || { sleep 2; continue; }
      pcode="${praw##*$'\n'}"
      pbody="${praw%$'\n'*}"
      [ "$pcode" = "200" ] || { sleep 2; continue; }
      pstatus="$(printf '%s' "$pbody" | jq -r '.status // "pending"')"
      case "$pstatus" in
        approved) echo "Approved by VerifyWise" >&2; exit 0 ;;
        denied)
          dreason="$(printf '%s' "$pbody" | jq -r '.decision_reason // "denied"')"
          echo "Denied by VerifyWise: $dreason" >&2
          exit 2 ;;
        *) sleep 2 ;;
      esac
    done
    # No decision in time — approval-specific fail mode (default closed = deny).
    echo "vw-bash-hook: approval timed out" >&2
    if [ "$APPROVAL_FAIL_MODE" = "open" ]; then exit 0; fi
    exit 2 ;;
  *) fail "unexpected gateway response: $resp" ;;
esac
```

- [ ] **Step 4: Update the README**

In `scripts/vw-bash-hook.README.md`, add to the env block:
```bash
   export VW_APPROVAL_WAIT=120        # max seconds to block on human approval
   export VW_APPROVAL_FAIL_MODE=closed # closed (default) | open — on approval timeout
```
And add to the Behavior table these rows:
```markdown
| Command matches a require-approval rule | hook blocks up to `VW_APPROVAL_WAIT`; approved → runs, denied → blocked |
| Approval not decided in time | `VW_APPROVAL_FAIL_MODE=closed` (default) → blocked; `open` → runs |
| Gateway rate-limits the call | `VW_FAIL_MODE=open` (default) → runs; `closed` → blocked |
```

- [ ] **Step 5: Syntax check + fail-mode logic check (no live gateway needed)**

```bash
bash -n /Users/gorkemcetin/verifywise/scripts/vw-bash-hook.sh && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 6: Live test the full approval cycle** (gateway + backend up; require_approval rule from Task 5 setup present, or recreate one)

Mint a key + an `rm -rf` require_approval rule (as in Task 2 Step 4 / Task 5 setup). Then, in one shell start the hook on a matching command in the background and approve it from another:

```bash
cd /Users/gorkemcetin/verifywise
# (set VW_GATEWAY_URL, VW_AGENT_KEY, VW_APPROVAL_WAIT=30)
( echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/zzz"}}' | VW_GATEWAY_URL=http://localhost:8100 VW_AGENT_KEY=$KEY VW_APPROVAL_WAIT=30 scripts/vw-bash-hook.sh; echo "hook exit=$?" ) &
sleep 3
# find the pending approval id and approve it via the API, then wait for the hook
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login -H "Content-Type: application/json" -d '{"email":"gorkem.cetin@verifywise.ai","password":"Verifywise#1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
AID=$(curl -s http://localhost:3000/api/ai-gateway/mcp/approvals -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")
curl -s -o /dev/null -X POST http://localhost:3000/api/ai-gateway/mcp/approvals/$AID/approve -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"reason":"ok"}'
wait
```
Expected: the backgrounded hook prints `Approved by VerifyWise` and `hook exit=0`.

Also test approval-timeout-denies (no approval given):
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/never"}}' | VW_GATEWAY_URL=http://localhost:8100 VW_AGENT_KEY=$KEY VW_APPROVAL_WAIT=5 scripts/vw-bash-hook.sh; echo "exit=$?"
```
Expected: after ~5s, `approval timed out` on stderr and `exit=2` (default fail-closed).

- [ ] **Step 7: Commit**

```bash
cd /Users/gorkemcetin/verifywise && git add scripts/vw-bash-hook.sh scripts/vw-bash-hook.README.md && git commit -m "feat(ai-gateway): adapter polls for approval; rate_limited follows fail-mode

approval_required -> poll status up to VW_APPROVAL_WAIT; approved runs,
denied blocks, timeout applies VW_APPROVAL_FAIL_MODE (default closed).
rate_limited follows the infra fail-mode (VW_FAIL_MODE)."
```

---

## Self-review notes

- **Spec coverage:** require_approval rule_type → Task 2; regex/keyword match in separate module → Task 3; hook approval branch with tool_id=None → Task 4; rate_limited decision → Task 4; shared auth dedup → Task 4; tool_id nullable migration → Task 1; adapter approval poll + VW_APPROVAL_WAIT/VW_APPROVAL_FAIL_MODE + rate_limited→VW_FAIL_MODE → Task 6; E2E incl. arg-hash scoping + reuse + deny → Task 5; Phase 1 regression → Task 5 Step 3; no-new-UI → no task (existing screens). All spec sections covered.
- **Verify-don't-assume (now resolved):** `create_approval_request` passes `tool_id` straight to INSERT (`mcp_approvals.py:49`), so `tool_id=None` works once Task 1 makes the column nullable — confirmed by reading the CRUD, no code change needed there.
- **Type consistency:** decisions are exactly `allow|deny|approval_required|rate_limited`, matched identically in hook (Task 4) and adapter (Task 6). `extract_agent_key` (no underscore) defined in Task 4 Step 1, used in Tasks 4 Step 2/4. Poll response keys (`status`, `decision_reason`) match the existing endpoint read in the adapter.
- **Containment:** `check_require_approval` lives in `mcp_approval_match.py`, imported only by `mcp_hook.py` — `scan_text`/`scan_tool_input`/`guardrail_service.py` untouched.
- **Rate-limit shape:** `enforce_mcp_rate_limits` raises `HTTPException(429)`; Task 4 wraps it in try/except and converts to `rate_limited` rather than letting a 429 propagate.
```
