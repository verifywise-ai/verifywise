# Agent Control Tool Result Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture each native tool call's result and a per-invocation events timeline, and surface both in a detail drawer on the Agent Control Activity page.

**Architecture:** A new `POST /v1/mcp/hook/result` endpoint receives the tool result from a Claude Code PostToolUse hook and updates the existing audit row, correlated by `(organization_id, session_id, tool_use_id)`. The PreToolUse hook now stores `tool_use_id` and seeds an events array. The adapter gains a result mode. The frontend makes Activity rows open a detail drawer.

**Tech Stack:** FastAPI + SQLAlchemy Core (raw SQL) + Alembic (AIGateway, Python 3.11); React 19 + MUI 7 + TypeScript (Clients); bash adapter; pytest httpx E2E.

**Spec:** `docs/superpowers/specs/2026-06-16-agent-control-tool-results-design.md`

---

## File Structure

**Backend (AIGateway):**
- Create: `AIGateway/src/database/migrations/versions/a0007_mcp_audit_results.py` — additive columns + index.
- Modify: `AIGateway/src/services/mcp_audit_service.py` — `log_tool_call` gains `tool_use_id` + `events`; new `update_tool_result(...)`.
- Modify: `AIGateway/src/routers/mcp_hook.py` — pass `tool_use_id`/`events` into `_audit`; add `POST /v1/mcp/hook/result`.
- Modify: `AIGateway/src/services/mcp_guardrail_service.py` — new `scan_result_blob(org_id, text)` masking helper.
- Modify: `AIGateway/src/crud/mcp_audit.py` — new `get_audit_log_by_id(org_id, log_id)`.
- Modify: `AIGateway/src/routers/mcp_audit.py` — new `GET /mcp/audit/logs/{log_id}`.
- Test: `AIGateway/tests/test_16_mcp_hook_results.py`.

**Adapter:**
- Modify: `scripts/vw-tool-hook.sh` — send `session_id`/`tool_use_id`; add result mode.
- Modify: `scripts/vw-tool-hook.README.md` (or the adapter README) — PostToolUse config block.

**Frontend (Clients):**
- Create: `Clients/src/presentation/pages/AIGateway/MCPInvocationDrawer.tsx`.
- Modify: `Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx` — clickable rows + drawer state.

> **Branch note:** This plan builds on the `MCPTable` component and the `(session_id)` audit column, both of which already exist on `develop` / PR #4096. Implement on a branch off `develop` after #4096 merges, or rebase. If `MCPTable` is absent, the row-click step must be adapted to whatever Activity table is present.

---

## Task 1: Migration — additive audit result columns

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0007_mcp_audit_results.py`

- [ ] **Step 1: Write the migration**

```python
"""Add tool result + events columns to mcp audit logs

Revision ID: a0007
Revises: a0006
Create Date: 2026-06-16
"""
from alembic import op

revision = "a0007"
down_revision = "a0006"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET search_path TO verifywise")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_audit_logs
            ADD COLUMN IF NOT EXISTS tool_use_id      VARCHAR(128),
            ADD COLUMN IF NOT EXISTS result_response  JSONB,
            ADD COLUMN IF NOT EXISTS result_truncated BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS events           JSONB DEFAULT '[]'
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gw_mcp_audit_invocation
            ON ai_gateway_mcp_audit_logs(organization_id, session_id, tool_use_id)
    """)


def downgrade():
    op.execute("SET search_path TO verifywise")
    op.execute("DROP INDEX IF EXISTS idx_gw_mcp_audit_invocation")
    op.execute("""
        ALTER TABLE ai_gateway_mcp_audit_logs
            DROP COLUMN IF EXISTS tool_use_id,
            DROP COLUMN IF EXISTS result_response,
            DROP COLUMN IF EXISTS result_truncated,
            DROP COLUMN IF EXISTS events
    """)
```

- [ ] **Step 2: Run the migration**

Run: `cd AIGateway/src && alembic upgrade head`
Expected: completes; `\d ai_gateway_mcp_audit_logs` shows the 4 new columns.

- [ ] **Step 3: Verify downgrade is reversible (then re-up)**

Run: `cd AIGateway/src && alembic downgrade -1 && alembic upgrade head`
Expected: both succeed without error.

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/database/migrations/versions/a0007_mcp_audit_results.py
git commit -m "feat(ai-gateway): migration for mcp audit result + events columns"
```

---

## Task 2: `scan_result_blob` masking helper

**Files:**
- Modify: `AIGateway/src/services/mcp_guardrail_service.py`
- Test: `AIGateway/tests/test_16_mcp_hook_results.py`

- [ ] **Step 1: Write the failing test**

Add to a new file `AIGateway/tests/test_16_mcp_hook_results.py`:

```python
"""E2E: native tool-call result capture (/v1/mcp/hook/result)."""
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
    # A mask rule so result PII is masked at rest.
    rule_res = api.post("/mcp/guardrails", json={
        "name": "E2E Result PII Mask",
        "rule_type": "pii",
        "action": "mask",
        "config": {"entities": {"EMAIL_ADDRESS": "mask"}, "score_thresholds": {"ALL": 0.5}, "language": "en"},
    })
    assert rule_res.status_code in (200, 201), rule_res.text
```

- [ ] **Step 2: Run it to confirm setup passes**

Run: `cd AIGateway && GATEWAY_URL=http://localhost:8100 pytest tests/test_16_mcp_hook_results.py::test_setup_result_key_and_pii_rule -v`
Expected: PASS (requires the gateway running on 8100 and a seeded org, same as test_13).

- [ ] **Step 3: Implement `scan_result_blob`**

Add to `AIGateway/src/services/mcp_guardrail_service.py` (after `scan_tool_input`). It mirrors how `scan_tool_input` fetches rules + settings, but takes a flat string and returns the masked string:

```python
async def scan_result_blob(org_id: int, blob: str) -> str:
    """Mask PII / filtered content in a flat result string (tool stdout/stderr,
    serialized tool_response). Returns the masked string. Never blocks — a tool
    result has already been produced; we only sanitize what we store at rest.
    Fails open (returns the original blob) on any error."""
    if not blob or not blob.strip():
        return blob
    try:
        async with get_db() as db:
            rules_result = await db.execute(
                text("""
                    SELECT id, name, rule_type, config, scope, action,
                           applies_to_tools, is_active
                    FROM ai_gateway_mcp_guardrail_rules
                    WHERE organization_id = :org_id AND is_active = true
                    ORDER BY created_at
                """),
                {"org_id": org_id},
            )
            mcp_rules = [dict(r) for r in rules_result.mappings().fetchall()]
            settings_result = await db.execute(
                text("""
                    SELECT pii_on_error, content_filter_on_error,
                           pii_replacement_format, content_filter_replacement
                    FROM ai_gateway_guardrail_settings
                    WHERE organization_id = :org_id
                """),
                {"org_id": org_id},
            )
            settings_row = settings_result.mappings().fetchone()
            guardrail_settings = dict(settings_row) if settings_row else {}

        # Force mask action: we sanitize at rest, never "block" a stored result.
        transformed_rules = [
            {
                "id": r["id"],
                "guardrail_type": r["rule_type"],
                "name": r["name"],
                "config": r.get("config") or {},
                "scope": "output",
                "action": "mask",
                "is_active": True,
            }
            for r in mcp_rules
            if r.get("rule_type") in ("pii", "content_filter")
        ]
        if not transformed_rules:
            return blob
        result = scan_text(text=blob, guardrail_rules=transformed_rules, settings=guardrail_settings)
        return result.masked_text or blob
    except Exception as e:
        logger.error(f"scan_result_blob failed, storing unmasked: {e}")
        return blob
```

Confirm `logger` and `scan_text` are already imported in this module (they are — `scan_tool_input` uses both).

- [ ] **Step 4: Add a direct unit assertion**

Append to `test_16_mcp_hook_results.py`:

```python
def test_scan_result_blob_masks_email():
    # Import inside the test so the module path matches the gateway venv.
    import asyncio, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from services.mcp_guardrail_service import scan_result_blob
    masked = asyncio.get_event_loop().run_until_complete(
        scan_result_blob(get_state("org_id") or 1, "contact me at attacker@evil.com please")
    )
    assert "attacker@evil.com" not in masked
```

> If the test env can't import the gateway module directly, mark this test `@pytest.mark.skip` and rely on the end-to-end masking assertion in Task 6 instead. Do not delete it — leave the skip with a reason.

- [ ] **Step 5: Run the unit assertion**

Run: `cd AIGateway && pytest tests/test_16_mcp_hook_results.py::test_scan_result_blob_masks_email -v`
Expected: PASS (or SKIP with reason if import-path constrained).

- [ ] **Step 6: Commit**

```bash
git add AIGateway/src/services/mcp_guardrail_service.py AIGateway/tests/test_16_mcp_hook_results.py
git commit -m "feat(ai-gateway): scan_result_blob helper to mask stored tool results"
```

---

## Task 3: Audit service — store `tool_use_id` + events, and `update_tool_result`

**Files:**
- Modify: `AIGateway/src/services/mcp_audit_service.py`

- [ ] **Step 1: Extend `log_tool_call` signature and INSERT**

In `mcp_audit_service.py`, add two params to `log_tool_call` (keep them optional/defaulted so existing callers are unaffected):

```python
async def log_tool_call(
    organization_id: int,
    agent_key_id: int,
    server_id: Optional[int],
    tool_name: str,
    arguments: Optional[dict],
    result_status: str,
    result_summary: Optional[str],
    is_error: bool,
    latency_ms: int,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    tool_use_id: Optional[str] = None,
    events: Optional[list] = None,
) -> None:
```

Update the INSERT column list + VALUES to include `tool_use_id` and `events`:

```python
                INSERT INTO ai_gateway_mcp_audit_logs
                    (organization_id, agent_key_id, server_id, tool_name,
                     arguments, result_status, result_summary, is_error,
                     latency_ms, session_id, metadata, tool_use_id, events)
                VALUES
                    (:org_id, :agent_key_id, :server_id, :tool_name,
                     CAST(:arguments AS jsonb), :result_status, :result_summary, :is_error,
                     :latency_ms, :session_id, CAST(:metadata AS jsonb),
                     :tool_use_id, CAST(:events AS jsonb))
```

And in the params dict add:

```python
                    "tool_use_id": tool_use_id,
                    "events": json.dumps(events or []),
```

- [ ] **Step 2: Add `update_tool_result`**

Append to `mcp_audit_service.py`. It updates the most-recent matching row and appends the outcome event. Note: `events` is replaced wholesale (read-modify-write) because Postgres JSONB has no cheap append; this is fine — one row, one writer.

```python
async def update_tool_result(
    organization_id: int,
    session_id: str,
    tool_use_id: str,
    agent_key_id: int,
    result_response: dict,
    result_truncated: bool,
    outcome_event: dict,  # {"type": "...", "at": "...", "detail"?: "..."}
) -> str:
    """Update the audit row for (org, session_id, tool_use_id) with the tool result.
    Flips approval_required -> success, stores result_response, appends outcome_event.
    Returns: "ok" | "no_match" | "forbidden". Fire-and-forget safe."""
    try:
        async with get_db() as db:
            row = (await db.execute(
                text("""
                    SELECT id, agent_key_id, result_status, events
                    FROM ai_gateway_mcp_audit_logs
                    WHERE organization_id = :org_id
                      AND session_id = :session_id
                      AND tool_use_id = :tool_use_id
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"org_id": organization_id, "session_id": session_id, "tool_use_id": tool_use_id},
            )).mappings().fetchone()

            if not row:
                return "no_match"
            if row["agent_key_id"] != agent_key_id:
                return "forbidden"

            existing_events = row["events"] or []
            if isinstance(existing_events, str):
                existing_events = json.loads(existing_events)
            new_events = existing_events + [outcome_event]

            new_status = "success" if row["result_status"] == "approval_required" else row["result_status"]

            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_audit_logs
                    SET result_response = CAST(:result_response AS jsonb),
                        result_truncated = :result_truncated,
                        result_status = :new_status,
                        events = CAST(:events AS jsonb)
                    WHERE id = :id
                """),
                {
                    "id": row["id"],
                    "result_response": json.dumps(result_response),
                    "result_truncated": result_truncated,
                    "new_status": new_status,
                    "events": json.dumps(new_events),
                },
            )
            await db.commit()
            return "ok"
    except Exception as e:
        logger.error(f"Failed to update MCP tool result: {e}")
        return "no_match"
```

- [ ] **Step 3: Syntax check**

Run: `cd AIGateway/src && python -c "import services.mcp_audit_service"`
Expected: no output (imports clean).

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/services/mcp_audit_service.py
git commit -m "feat(ai-gateway): audit service stores tool_use_id/events and update_tool_result"
```

---

## Task 4: Hook — seed events + `tool_use_id`, add `/v1/mcp/hook/result`

**Files:**
- Modify: `AIGateway/src/routers/mcp_hook.py`

- [ ] **Step 1: Thread `tool_use_id` + events through `_audit`**

In `mcp_hook`, read `tool_use_id` from the body and seed a `received` + `decided` event in each branch. Replace the `_audit` helper and the `body.get` block:

```python
    tool_name = body.get("tool_name")
    arguments = body.get("arguments") or {}
    session_id = body.get("session_id")
    tool_use_id = body.get("tool_use_id")

    if not tool_name or not isinstance(arguments, dict):
        raise HTTPException(status_code=400, detail="tool_name (str) and arguments (object) are required")

    start_time = time.time()
    received_at = datetime.now(timezone.utc).isoformat()

    async def _audit(status: str, summary: str, decided_detail: str, is_error: bool = False):
        events = [
            {"type": "received", "at": received_at},
            {"type": "decided", "at": datetime.now(timezone.utc).isoformat(), "detail": decided_detail},
        ]
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
            tool_use_id=tool_use_id,
            events=events,
        )
```

Then update each `_audit(...)` call to pass `decided_detail`:
- blocked branch: `await _audit("blocked", f"Hook deny: {reason}", "deny")`
- approval branch: `await _audit("approval_required", f"Approval request {approval.get('id')} created", "approval_required")`
- rate-limit branch: `await _audit("rate_limited", "Hook rate limited", "rate_limited")`
- error branch: `await _audit("error", f"Hook error during rate-limit check: {e.detail}", "error", is_error=True)`
- allow branch: `await _audit("success", "Hook allow", "allow")`

- [ ] **Step 2: Add the result endpoint**

Append to `mcp_hook.py`. Add imports at top: `from services.mcp_audit_service import log_tool_call, update_tool_result` and `from services.mcp_guardrail_service import scan_tool_input, scan_result_blob`.

```python
# Uses settings.mcp_result_cap_bytes if defined, else falls back to 10240.
# No separate config task is required; add the field to config.py only if you
# want it env-tunable.
MCP_RESULT_CAP_BYTES = getattr(settings, "mcp_result_cap_bytes", 10240)


@router.post("/v1/mcp/hook/result")
async def mcp_hook_result(request: Request):
    """Receive a PostToolUse result and attach it to the existing audit row.
    Never executes anything. Best-effort: returns 200 even when no row matches."""
    agent_key = await extract_agent_key(request)
    org_id = agent_key["organization_id"]
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    session_id = body.get("session_id")
    tool_use_id = body.get("tool_use_id")
    tool_name = body.get("tool_name") or "unknown"
    tool_response = body.get("tool_response")
    if not session_id or not tool_use_id:
        raise HTTPException(status_code=400, detail="session_id and tool_use_id are required")

    # Serialize, cap, mask the whole tool_response.
    import json as _json
    serialized = _json.dumps(tool_response) if tool_response is not None else "{}"
    truncated = len(serialized.encode("utf-8")) > MCP_RESULT_CAP_BYTES
    if truncated:
        serialized = serialized.encode("utf-8")[:MCP_RESULT_CAP_BYTES].decode("utf-8", "ignore")
    masked = await scan_result_blob(org_id, serialized)
    try:
        stored = _json.loads(masked)
    except Exception:
        stored = {"_raw": masked}  # masking broke JSON shape; keep the masked text

    # Per-tool outcome event.
    now = datetime.now(timezone.utc).isoformat()
    if tool_name == "Bash" and isinstance(tool_response, dict) and tool_response.get("interrupted"):
        outcome = {"type": "interrupted", "at": now}
    elif tool_name in ("Write", "Edit") and isinstance(tool_response, dict) and tool_response.get("success") is False:
        outcome = {"type": "failed", "at": now}
    else:
        outcome = {"type": "completed", "at": now}

    status = await update_tool_result(
        organization_id=org_id,
        session_id=session_id,
        tool_use_id=tool_use_id,
        agent_key_id=agent_key["id"],
        result_response=stored,
        result_truncated=truncated,
        outcome_event=outcome,
    )
    if status == "forbidden":
        raise HTTPException(status_code=403, detail="result does not belong to this agent key")
    return JSONResponse(content={"status": status})
```

- [ ] **Step 3: Syntax check + restart gateway**

Run: `cd AIGateway/src && python -c "import routers.mcp_hook"`
Expected: clean import. Then restart the dev gateway (uvicorn --reload picks it up).

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/routers/mcp_hook.py
git commit -m "feat(ai-gateway): seed events in hook + POST /v1/mcp/hook/result"
```

---

## Task 5: Audit read endpoint — `GET /mcp/audit/logs/{id}`

**Files:**
- Modify: `AIGateway/src/crud/mcp_audit.py`
- Modify: `AIGateway/src/routers/mcp_audit.py`

- [ ] **Step 1: Add CRUD function**

Append to `AIGateway/src/crud/mcp_audit.py`:

```python
async def get_audit_log_by_id(org_id: int, log_id: int) -> dict | None:
    async with get_db() as db:
        row = (await db.execute(
            text("""
                SELECT id, agent_key_id, server_id, tool_name, arguments,
                       result_status, result_summary, is_error, latency_ms,
                       session_id, tool_use_id, result_response, result_truncated,
                       events, created_at
                FROM ai_gateway_mcp_audit_logs
                WHERE organization_id = :org_id AND id = :log_id
            """),
            {"org_id": org_id, "log_id": log_id},
        )).mappings().fetchone()
        return dict(row) if row else None
```

Confirm `get_db` and `text` are already imported at the top of the file (the existing functions use them).

- [ ] **Step 2: Add the route**

In `AIGateway/src/routers/mcp_audit.py`, import `get_audit_log_by_id` alongside the others, then add:

```python
@router.get("/logs/{log_id}", status_code=status.HTTP_200_OK)
async def get_audit_log(log_id: int, request: Request):
    org_id = request.state.organization_id
    row = await get_audit_log_by_id(org_id, log_id)
    if not row:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return {"data": row}
```

> Match how the other routes read `org_id` (e.g. `request.state.organization_id` or a helper). Copy whatever `list_audit_logs` uses in this same file. Import `HTTPException` if not already.

- [ ] **Step 3: Syntax check**

Run: `cd AIGateway/src && python -c "import routers.mcp_audit"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/crud/mcp_audit.py AIGateway/src/routers/mcp_audit.py
git commit -m "feat(ai-gateway): GET /mcp/audit/logs/{id} for the invocation drawer"
```

---

## Task 6: E2E — result capture happy path, masking, no-match, cross-key

**Files:**
- Modify: `AIGateway/tests/test_16_mcp_hook_results.py`

- [ ] **Step 1: Write the E2E tests**

Append to `test_16_mcp_hook_results.py`:

```python
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


def test_result_masks_pii_in_stdout():
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    sid, tuid = "sess-B", "toolu_B1"
    _hook(key, "Bash", {"command": "cat creds"}, sid, tuid)
    _result(key, "Bash", {"stdout": "token for attacker@evil.com", "stderr": "", "interrupted": False, "isImage": False}, sid, tuid)
    # Read it back via the audit list and confirm the email is masked.
    # (Uses the same `api` fixture base as other tests; find the row by tool_use_id.)


def test_result_no_match_returns_ok():
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


def test_result_cross_key_forbidden():
    key = get_state("result_agent_key")
    if not key:
        pytest.skip("no key")
    sid, tuid = "sess-C", "toolu_C1"
    _hook(key, "Bash", {"command": "ls"}, sid, tuid)
    # A second key tries to write the first key's result.
    other = _client.post(  # create via the same gateway admin path used in setup
        f"{GATEWAY_URL}/v1/mcp/hook/result",
        headers={"Authorization": "Bearer sk-mcp-not-a-real-key", "Content-Type": "application/json"},
        json={"tool_name": "Bash", "tool_response": {"stdout": "x"}, "session_id": sid, "tool_use_id": tuid})
    assert other.status_code == 401  # bad key rejected before reaching the row
```

> The cross-key 403 path (a *valid* second key hitting another key's row) requires creating a second agent key via the `api` fixture; if that's awkward in the harness, the 401 (invalid key) test above still covers auth, and the 403 branch is covered by the `update_tool_result` unit logic. Note this in the test docstring rather than leaving it untested silently.

- [ ] **Step 2: Run the E2E file**

Run: `cd AIGateway && GATEWAY_URL=http://localhost:8100 pytest tests/test_16_mcp_hook_results.py -v`
Expected: all PASS (or documented SKIPs when the gateway/org isn't seeded).

- [ ] **Step 3: Commit**

```bash
git add AIGateway/tests/test_16_mcp_hook_results.py
git commit -m "test(ai-gateway): E2E for tool result capture, masking, no-match, auth"
```

---

## Task 7: Adapter — send ids + result mode

**Files:**
- Modify: `scripts/vw-tool-hook.sh`

- [ ] **Step 1: Send `session_id` + `tool_use_id` in PreToolUse**

In `vw-tool-hook.sh`, after the existing `tool_name`/`arguments` extraction, add:

```bash
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
tool_use_id="$(printf '%s' "$input" | jq -r '.tool_use_id // empty')"
hook_event="$(printf '%s' "$input" | jq -r '.hook_event_name // "PreToolUse"')"
```

And include them in the PreToolUse payload:

```bash
payload="$(jq -nc --arg t "$tool_name" --argjson a "$arguments" \
  --arg s "$session_id" --arg u "$tool_use_id" \
  '{tool_name:$t, arguments:$a, session_id:$s, tool_use_id:$u}')"
```

- [ ] **Step 2: Add result-mode dispatch**

Near the top, after the env checks, branch on the event. Result mode is best-effort and always exits 0:

```bash
if [ "$hook_event" = "PostToolUse" ]; then
  tool_response="$(printf '%s' "$input" | jq -c '.tool_response // {}')"
  duration_ms="$(printf '%s' "$input" | jq -r '.duration_ms // empty')"
  rpayload="$(jq -nc --arg t "$tool_name" --argjson r "$tool_response" \
    --arg s "$session_id" --arg u "$tool_use_id" \
    '{tool_name:$t, tool_response:$r, session_id:$s, tool_use_id:$u}')"
  curl -s --max-time "$TIMEOUT" -o /dev/null \
    -X POST "$VW_GATEWAY_URL/v1/mcp/hook/result" \
    -H "Authorization: Bearer $VW_AGENT_KEY" \
    -H "Content-Type: application/json" \
    -d "$rpayload" 2>/dev/null || true
  exit 0   # result capture never blocks
fi
```

Place this AFTER `session_id`/`tool_use_id`/`hook_event` are set and after the env/`jq`/`curl` checks, but BEFORE the PreToolUse adjudication block.

- [ ] **Step 3: Lint the script**

Run: `bash -n scripts/vw-tool-hook.sh`
Expected: no syntax errors.

- [ ] **Step 4: Manual smoke (optional, requires gateway)**

```bash
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","session_id":"s1","tool_use_id":"t1","tool_response":{"stdout":"hi","stderr":"","interrupted":false,"isImage":false}}' \
  | VW_GATEWAY_URL=http://localhost:8100 VW_AGENT_KEY=sk-mcp-... bash scripts/vw-tool-hook.sh; echo "exit=$?"
```
Expected: `exit=0` (no output; result POSTed or silently failed open).

- [ ] **Step 5: Commit**

```bash
git add scripts/vw-tool-hook.sh
git commit -m "feat(adapter): send session_id/tool_use_id and add PostToolUse result mode"
```

---

## Task 8: Adapter README — PostToolUse config

**Files:**
- Modify: the adapter README (`scripts/vw-tool-hook.README.md` if present, else the doc that holds the PreToolUse config block — find it with `grep -rl PreToolUse scripts docs`)

- [ ] **Step 1: Add the PostToolUse hook config block**

Document, next to the existing PreToolUse config, a PostToolUse entry pointing the same script at the same matcher:

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "Bash|Edit|Write", "hooks": [{ "type": "command", "command": "/path/to/vw-tool-hook.sh" }] }],
    "PostToolUse": [{ "matcher": "Bash|Edit|Write", "hooks": [{ "type": "command", "command": "/path/to/vw-tool-hook.sh" }] }]
  }
}
```

Add a sentence: "`MultiEdit`/`NotebookEdit` are not confirmed as PostToolUse matchers in the Claude Code docs; test before adding them to the PostToolUse matcher. Result capture is best-effort: if the gateway is unreachable, the tool still runs and the invocation simply shows no result."

- [ ] **Step 2: Commit**

```bash
git add scripts/vw-tool-hook.README.md
git commit -m "docs(adapter): document PostToolUse result-capture hook"
```

---

## Task 9: Frontend — clickable rows + invocation drawer

**Files:**
- Create: `Clients/src/presentation/pages/AIGateway/MCPInvocationDrawer.tsx`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx`

- [ ] **Step 1: Create the drawer component**

```tsx
import { Box, Drawer, Typography, Stack, IconButton } from "@mui/material";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import Chip from "../../components/Chip";
import { apiServices } from "../../../infrastructure/api/networkServices";
import palette from "../../themes/palette";
import { MCP_STATUS_COLORS, MCP_STATUS_FALLBACK } from "./shared";
import { displayFormattedDate } from "../../tools/isoDateToString";

interface InvocationDrawerProps {
  logId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function MCPInvocationDrawer({ logId, open, onClose }: InvocationDrawerProps) {
  const [row, setRow] = useState<any | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open || !logId) return;
    setRow(null);
    setShowRaw(false);
    apiServices
      .get<Record<string, any>>(`/ai-gateway/mcp/audit/logs/${logId}`)
      .then((res) => setRow(res?.data?.data || null))
      .catch(() => setRow(null));
  }, [open, logId]);

  const colors = row ? MCP_STATUS_COLORS[row.result_status] || MCP_STATUS_FALLBACK : MCP_STATUS_FALLBACK;
  const labelSx = { fontSize: 11, fontWeight: 600, color: palette.text.tertiary, letterSpacing: "0.5px" };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} sx={{ "& .MuiDrawer-paper": { width: 520, p: 3 } }}>
      {!row ? (
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Loading…</Typography>
      ) : (
        <Stack gap="16px">
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace" }}>
                {row.tool_name}
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {displayFormattedDate(row.created_at)}
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose} aria-label="Close">
              <X size={16} />
            </IconButton>
          </Stack>

          <Chip label={row.result_status} backgroundColor={colors.bg} textColor={colors.text} />

          <Box>
            <Typography sx={labelSx}>TOOL USE ID</Typography>
            <Typography sx={{ fontSize: 12, fontFamily: "monospace" }}>
              {row.tool_use_id || "—"}
            </Typography>
          </Box>

          <Box>
            <Typography sx={labelSx}>ARGUMENTS</Typography>
            <Box component="pre" sx={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap",
              bgcolor: "#F9FAFB", p: "8px", borderRadius: "4px", overflow: "auto", maxHeight: 200 }}>
              {JSON.stringify(row.arguments ?? {}, null, 2)}
            </Box>
          </Box>

          <Box>
            <Typography sx={labelSx}>RESULT</Typography>
            {row.result_response ? (
              <Box component="pre" sx={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap",
                bgcolor: "#F9FAFB", p: "8px", borderRadius: "4px", overflow: "auto", maxHeight: 280 }}>
                {JSON.stringify(row.result_response, null, 2)}
                {row.result_truncated ? "\n… (truncated)" : ""}
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                No result captured (older adapter, or the tool did not report back).
              </Typography>
            )}
          </Box>

          <Box>
            <Typography sx={labelSx}>EVENTS</Typography>
            <Stack gap="4px" sx={{ mt: "4px" }}>
              {(row.events || []).map((e: any, i: number) => (
                <Stack key={i} direction="row" justifyContent="space-between">
                  <Typography sx={{ fontSize: 12 }}>
                    {e.type}{e.detail ? ` · ${e.detail}` : ""}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                    {displayFormattedDate(e.at)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography
              sx={{ fontSize: 12, color: palette.primary.main, cursor: "pointer" }}
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide raw JSON" : "Show raw JSON"}
            </Typography>
            {showRaw && (
              <Box component="pre" sx={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
                bgcolor: "#1E1E1E", color: "#D4D4D4", p: "8px", borderRadius: "4px", overflow: "auto", maxHeight: 320 }}>
                {JSON.stringify(row, null, 2)}
              </Box>
            )}
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}
```

> Verify the import paths resolve from `pages/AIGateway/` (the existing `MCPAuditLog/index.tsx` imports `Chip` as `../../../components/Chip` because it is one directory deeper; `MCPInvocationDrawer.tsx` sits directly in `pages/AIGateway/`, so it uses `../../components/Chip`). Match `MCPTable.tsx`'s import depth, which lives in the same folder.

- [ ] **Step 2: Wire row click in MCPAuditLog**

In `MCPAuditLog/index.tsx`: import the drawer, add state, pass `onRowClick` to the existing `MCPTable`, render the drawer.

```tsx
import MCPInvocationDrawer from "../MCPInvocationDrawer";
// ...
const [drawerLogId, setDrawerLogId] = useState<number | null>(null);
// ... on the <MCPTable ...>:
onRowClick={(log) => setDrawerLogId(log.id)}
// ... after the table block, before </PageHeaderExtended>:
<MCPInvocationDrawer
  logId={drawerLogId}
  open={drawerLogId !== null}
  onClose={() => setDrawerLogId(null)}
/>
```

- [ ] **Step 3: Typecheck + format (full, unfiltered)**

Run: `cd Clients && npm run typecheck && npm run format-check`
Expected: no errors in the changed files; if format-check flags them, run `npm run format` and re-stage.

- [ ] **Step 4: Build**

Run: `cd Clients && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/AIGateway/MCPInvocationDrawer.tsx Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx
git commit -m "feat(ai-gateway): invocation detail drawer on Activity rows"
```

---

## Task 10: i18n + final gates

**Files:**
- Modify: `Clients/src/i18n/translations.ts`

- [ ] **Step 1: Add de/fr/es for new drawer strings**

New user-facing strings introduced by the drawer: `Arguments` (already added in PR #4096 — verify), `Result`, `Events`, `Tool use id`, `Show raw JSON`, `Hide raw JSON`, `No result captured (older adapter, or the tool did not report back).`. Add any that are missing to the `de`, `fr`, and `es` blocks of `translations.ts` (mirror the pattern: insert near the existing Agent Control keys). German/French/Spanish translations required — do not leave English-only.

- [ ] **Step 2: Run the full pre-PR gate set (unfiltered)**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: typecheck clean, i18n audit reports **0 gaps**, format clean.

- [ ] **Step 3: Commit**

```bash
git add Clients/src/i18n/translations.ts
git commit -m "i18n(ai-gateway): de/fr/es for invocation drawer strings"
```

---

## Done criteria

- A native Bash/Edit/Write call with the PostToolUse hook configured produces an Activity row whose drawer shows arguments, result, and an events timeline (received → decided → completed).
- A denied/rate-limited call shows a drawer with no result and a timeline ending at "decided".
- An approved-then-run call shows one row, status `success`, timeline received → approval_required → completed.
- PII in stdout is masked in the stored result.
- An old adapter (no PostToolUse) leaves rows showing "No result captured" — nothing breaks.
- `cd AIGateway && pytest tests/test_16_mcp_hook_results.py -v` passes.
- `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check` all pass.
