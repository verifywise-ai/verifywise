# Agent run correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Join the two halves of an agent turn — the model call (conversation) and the tool call (action) — into one reconstructable *run* in Agent Control, and actually persist the conversation (which today is not written on the live proxy path).

**Architecture:** Add a nullable `agent_run_id` correlation key to both `ai_gateway_spend_logs` (model calls) and `ai_gateway_mcp_audit_logs` (tool calls). The hook reuses its existing `session_id` as the run id; the proxy reads a new `x-vw-agent-run-id` header (plus aliases). Persist prompt/response on the proxy path, gated by the per-endpoint `log_request_body`/`log_response_body` flags. A new AIGateway runs router groups both tables by `agent_run_id`; Express transparently proxies it; a new frontend "Runs" page lists runs and shows an interleaved detail timeline. Enforcement behavior is unchanged.

**Tech Stack:** FastAPI + SQLAlchemy core (AIGateway, Python 3.12), Alembic migrations, Express transparent proxy (no new controller), React 19 + TypeScript + MUI (Clients), pytest E2E (AIGateway/tests).

**Source spec:** `docs/superpowers/specs/2026-06-17-agent-run-correlation-design.md`

---

## File Structure

**AIGateway (Python):**
- Create: `AIGateway/src/database/migrations/versions/a0008_agent_run_correlation.py` — schema: add `agent_run_id` + `agent_run_path` columns + indexes to both tables.
- Modify: `AIGateway/src/services/mcp_audit_service.py` — `log_tool_call` writes `agent_run_id`.
- Modify: `AIGateway/src/services/proxy_service.py` — `log_spend` writes `agent_run_id`, `request_messages`, `response_text` (flag-gated).
- Modify: `AIGateway/src/routers/proxy.py` — read run-id header; thread `agent_run_id` + messages/response into all `log_spend`/`log_cache_hit` calls.
- Create: `AIGateway/src/crud/mcp_runs.py` — read queries: list runs, get one run's interleaved entries.
- Create: `AIGateway/src/routers/mcp_runs.py` — `GET /mcp/runs`, `GET /mcp/runs/{run_id}`.
- Modify: `AIGateway/src/app.py` — mount `mcp_runs_router`.
- Create: `AIGateway/tests/test_17_mcp_runs.py` — E2E for the runs endpoints.

**Frontend (React):**
- Create: `Clients/src/presentation/pages/AIGateway/MCPRuns/index.tsx` — runs list page.
- Create: `Clients/src/presentation/pages/AIGateway/MCPRuns/RunDetailDrawer.tsx` — interleaved run detail.
- Modify: the Agent Control sidebar/route registration (located in Task 9) — add "Runs".

**Express:** No change — `Servers/routes/aiGateway.route.ts` is a transparent pass-through (`/api/ai-gateway/*` → `/internal/*`). New `/internal/mcp/runs*` routes are reachable as `/ai-gateway/mcp/runs*` automatically.

---

## Conventions you must follow (read before starting)

- **AIGateway auth in every internal router handler:** `verify_internal_key(request)` then `org_id = get_org_id(request)`. Imports are from **two different modules** (verified against `routers/mcp_audit.py`): `from middlewares.auth import verify_internal_key` and `from utils.auth import get_org_id`. Do NOT import `get_org_id` from `middlewares.auth` — it isn't there.
- **DB access:** `async with get_db() as db:` + `await db.execute(text(sql), params)`; reads use `result.mappings().all()`; writes need `await db.commit()`. (Mirror `crud/mcp_audit.py` / `services/proxy_service.py`.)
- **All tenant queries filter `organization_id`.**
- **Table names (verified):** `ai_gateway_spend_logs`, `ai_gateway_mcp_audit_logs`, `ai_gateway_mcp_agent_keys`, `ai_gateway_endpoints`.
- **Migrations:** latest is `a0007_mcp_audit_results.py`; new revision `a0008` has `down_revision = "a0007"`.
- **Run AIGateway tests:** `cd AIGateway && source venv/bin/activate && cd tests && pytest test_17_mcp_runs.py -v` (gateway must run on :8100; mirror existing E2E style in `test_13_mcp_hook.py`).
- **Frontend fetch:** `apiServices.get('/ai-gateway/mcp/...')`; use `MCPTable`, `MCPInvocationDrawer`, `EmptyState`. Design tokens: primary `#13715B`, border `#d0d5dd`, radius 4px, sentence case, Lucide icons.

---

## Task 1: Migration — add correlation columns + indexes

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0008_agent_run_correlation.py`

- [ ] **Step 1: Write the migration**

```python
"""agent run correlation: add agent_run_id + agent_run_path to spend + mcp audit

Revision ID: a0008
Revises: a0007
"""
from alembic import op

revision = "a0008"
down_revision = "a0007"
branch_labels = None
depends_on = None


def upgrade():
    # Correlation key + reserved (unused in v1) path column on both tables
    op.execute("ALTER TABLE ai_gateway_spend_logs     ADD COLUMN IF NOT EXISTS agent_run_id TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_spend_logs     ADD COLUMN IF NOT EXISTS agent_run_path TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs ADD COLUMN IF NOT EXISTS agent_run_id TEXT NULL")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs ADD COLUMN IF NOT EXISTS agent_run_path TEXT NULL")

    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_spend_run "
        "ON ai_gateway_spend_logs(organization_id, agent_run_id, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gw_audit_run "
        "ON ai_gateway_mcp_audit_logs(organization_id, agent_run_id, created_at)"
    )

    # Backfill existing hook rows: the run id IS the session id (exact, cheap).
    op.execute(
        "UPDATE ai_gateway_mcp_audit_logs SET agent_run_id = session_id "
        "WHERE agent_run_id IS NULL AND session_id IS NOT NULL"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_gw_audit_run")
    op.execute("DROP INDEX IF EXISTS idx_gw_spend_run")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS agent_run_path")
    op.execute("ALTER TABLE ai_gateway_mcp_audit_logs DROP COLUMN IF EXISTS agent_run_id")
    op.execute("ALTER TABLE ai_gateway_spend_logs     DROP COLUMN IF EXISTS agent_run_path")
    op.execute("ALTER TABLE ai_gateway_spend_logs     DROP COLUMN IF EXISTS agent_run_id")
```

- [ ] **Step 2: Apply the migration**

Run: `cd AIGateway/src && source ../venv/bin/activate && alembic upgrade head`
Expected: "Running upgrade a0007 -> a0008" and no error.

- [ ] **Step 3: Verify columns + backfill**

Run: `psql "$DATABASE_URL" -c "\d ai_gateway_spend_logs" | grep agent_run`
Then: `psql "$DATABASE_URL" -c "\d ai_gateway_mcp_audit_logs" | grep agent_run`
Expected: both tables list `agent_run_id` and `agent_run_path` (text).
Backfill check: `psql "$DATABASE_URL" -c "SELECT count(*) FROM ai_gateway_mcp_audit_logs WHERE agent_run_id IS NULL AND session_id IS NOT NULL"`
Expected: `0` (all historical hook rows backfilled).

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/database/migrations/versions/a0008_agent_run_correlation.py
git commit -m "feat(ai-gateway): add agent_run_id correlation columns + indexes (a0008)"
```

---

## Task 2: Hook write path — store agent_run_id = session_id

**Files:**
- Modify: `AIGateway/src/services/mcp_audit_service.py` (`log_tool_call`, the INSERT)

- [ ] **Step 1: Add `agent_run_id` to the INSERT in `log_tool_call`**

In `log_tool_call`, the INSERT currently lists 13 columns ending `..., tool_use_id, events)`. Add `agent_run_id` and bind it to `session_id` (already a param — no signature change needed). Change the column list and VALUES:

```python
                    INSERT INTO ai_gateway_mcp_audit_logs
                        (organization_id, agent_key_id, server_id, tool_name,
                         arguments, result_status, result_summary, is_error,
                         latency_ms, session_id, metadata, tool_use_id, events,
                         agent_run_id)
                    VALUES
                        (:org_id, :agent_key_id, :server_id, :tool_name,
                         CAST(:arguments AS jsonb), :result_status, :result_summary, :is_error,
                         :latency_ms, :session_id, CAST(:metadata AS jsonb),
                         :tool_use_id, CAST(:events AS jsonb),
                         :agent_run_id)
```

And add to the params dict (after `"events": json.dumps(events or [])`):

```python
                    "agent_run_id": session_id,
```

- [ ] **Step 2: Smoke-test the hook still logs**

Run: `cd AIGateway && source venv/bin/activate && cd tests && pytest test_13_mcp_hook.py -v`
Expected: PASS (no behavior change; column is additive).

- [ ] **Step 3: Verify run id is written**

Make any hook call via the existing E2E, then:
`psql "$DATABASE_URL" -c "SELECT session_id, agent_run_id FROM ai_gateway_mcp_audit_logs ORDER BY created_at DESC LIMIT 1"`
Expected: `agent_run_id` equals `session_id`.

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/services/mcp_audit_service.py
git commit -m "feat(ai-gateway): write agent_run_id from session_id on tool-call audit"
```

---

## Task 3: Conversation capture + agent_run_id in `log_spend`

**Files:**
- Modify: `AIGateway/src/services/proxy_service.py` (`log_spend`, `log_cache_hit`)

- [ ] **Step 1: Extend `log_spend` signature + INSERT**

Add three params (all optional, default `None`) to `log_spend` after `metadata`:

```python
    metadata: Optional[dict] = None,
    agent_run_id: Optional[str] = None,
    request_messages: Optional[list] = None,
    response_text: Optional[str] = None,
):
```

Change the INSERT column list and VALUES to include the three new fields:

```python
                    INSERT INTO ai_gateway_spend_logs
                        (organization_id, endpoint_id, provider, model,
                         prompt_tokens, completion_tokens, total_tokens,
                         cost_usd, latency_ms, status_code, metadata, virtual_key_id,
                         agent_run_id, request_messages, response_text)
                    VALUES
                        (:org_id, :endpoint_id, :provider, :model,
                         :prompt_tokens, :completion_tokens, :total_tokens,
                         :cost_usd, :latency_ms, :status_code, :metadata::jsonb, :vk_id,
                         :agent_run_id, :request_messages::jsonb, :response_text)
```

Add to the params dict (after `"vk_id": virtual_key_id,`):

```python
                    "agent_run_id": agent_run_id,
                    "request_messages": json.dumps(request_messages) if request_messages is not None else None,
                    "response_text": response_text,
```

- [ ] **Step 2: Thread the run id through `log_cache_hit`**

`log_cache_hit` calls `log_spend` internally. Add `agent_run_id` param and forward it:

```python
async def log_cache_hit(
    organization_id: int,
    endpoint_id: int,
    virtual_key_id: int,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    original_cost_usd: float,
    latency_ms: int,
    agent_run_id: Optional[str] = None,
):
    """Log a cache hit as a spend entry with zero cost and cache metadata."""
    await log_spend(
        organization_id=organization_id,
        endpoint_id=endpoint_id,
        virtual_key_id=virtual_key_id,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_usd=0.0,
        latency_ms=latency_ms,
        metadata={"cache_hit": True, "original_cost_usd": original_cost_usd},
        agent_run_id=agent_run_id,
    )
```

- [ ] **Step 3: Verify the service imports + module loads**

Run: `cd AIGateway/src && source ../venv/bin/activate && python -c "import services.proxy_service"`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/services/proxy_service.py
git commit -m "feat(ai-gateway): log_spend persists agent_run_id + prompt/response"
```

---

## Task 4: Proxy router — read run-id header, gate capture, thread everything

**Files:**
- Modify: `AIGateway/src/routers/proxy.py` (`proxy_chat`, `_handle_completion`, `_handle_stream`, `proxy_embeddings`)

- [ ] **Step 1: Add a header-extraction helper**

Add near `_extract_virtual_key` in `routers/proxy.py`:

```python
def _extract_run_id(request: Request) -> Optional[str]:
    """Read the agent run/session id from the canonical header or accepted aliases.
    Header wins; falls back to common names other tools already emit."""
    for h in ("x-vw-agent-run-id", "x-session-id", "helicone-session-id"):
        v = request.headers.get(h)
        if v:
            return v.strip()
    return None
```

- [ ] **Step 2: Read run id + body-logging flags in `proxy_chat` and pass down**

In `proxy_chat`, right after `org_id = vk["organization_id"]`:

```python
    agent_run_id = _extract_run_id(request)
```

After `endpoint` is resolved, compute the messages to store (respecting the per-endpoint flags; store the **scanned** messages, never raw). Replace the two terminal calls (`_handle_stream` / `_handle_completion`) so they receive `agent_run_id` and the messages-to-store. Pass `final_messages if endpoint.get("log_request_body") else None` as the stored request:

```python
    stored_request = scanned_messages if endpoint.get("log_request_body") else None

    if body.stream:
        return await _handle_stream(
            org_id, vk, endpoint, final_messages, kwargs, estimated_cost, start_time,
            agent_run_id=agent_run_id, stored_request=stored_request,
        )

    return await _handle_completion(
        org_id, vk, endpoint, final_messages, kwargs, estimated_cost, start_time,
        _prompt_hash=prompt_hash,
        _scanned_messages=scanned_messages if prompt_hash else None,
        agent_run_id=agent_run_id, stored_request=stored_request,
    )
```

Also pass `agent_run_id=agent_run_id` into the `log_cache_hit(...)` call in the cache-hit branch.

- [ ] **Step 3: Thread through `_handle_completion`**

Add params to the signature:

```python
async def _handle_completion(
    org_id: int, vk: dict, endpoint: dict,
    messages: list[dict], kwargs: dict,
    estimated_cost: float, start_time: float,
    _depth: int = 0,
    _prompt_hash: Optional[str] = None,
    _scanned_messages: Optional[list[dict]] = None,
    agent_run_id: Optional[str] = None,
    stored_request: Optional[list] = None,
):
```

In the **success** `log_spend(...)`, extract the response text and pass the three new args. After `usage = result.get("usage", {})`:

```python
        resp_text = None
        if endpoint.get("log_response_body"):
            try:
                resp_text = result["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                resp_text = None
```

Then add to that `log_spend(...)` call:

```python
            agent_run_id=agent_run_id,
            request_messages=stored_request,
            response_text=resp_text,
```

In the **failure** `log_spend(...)` call (the `except` block), add only `agent_run_id=agent_run_id,` (no content on failure). In the fallback recursion, forward `agent_run_id=agent_run_id, stored_request=stored_request`.

- [ ] **Step 4: Thread through `_handle_stream`**

Add params:

```python
async def _handle_stream(
    org_id: int, vk: dict, endpoint: dict,
    messages: list[dict], kwargs: dict,
    estimated_cost: float, start_time: float,
    agent_run_id: Optional[str] = None,
    stored_request: Optional[list] = None,
):
```

Accumulate streamed content for optional response capture. In `_stream_generator`, add `acc = []` near the other totals, and inside the chunk-parse `try` block append deltas:

```python
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                        if delta:
                            acc.append(delta)
```

In the `finally` block's `log_spend(...)`, add:

```python
                agent_run_id=agent_run_id,
                request_messages=stored_request,
                response_text="".join(acc) if (acc and endpoint.get("log_response_body")) else None,
```

- [ ] **Step 5: Thread through `proxy_embeddings`**

In `proxy_embeddings`, after `org_id = vk["organization_id"]` add `agent_run_id = _extract_run_id(request)`. Add `agent_run_id=agent_run_id` to **both** `log_spend(...)` calls (success + failure). Do **not** pass `request_messages`/`response_text` — embeddings have no chat content to render.

- [ ] **Step 6: Verify module loads**

Run: `cd AIGateway/src && source ../venv/bin/activate && python -c "import routers.proxy"`
Expected: no error.

- [ ] **Step 7: Commit**

```bash
git add AIGateway/src/routers/proxy.py
git commit -m "feat(ai-gateway): proxy reads x-vw-agent-run-id, captures conversation (flag-gated)"
```

---

## Task 5: Runs read queries (CRUD)

**Files:**
- Create: `AIGateway/src/crud/mcp_runs.py`

- [ ] **Step 1: Write the runs list + detail queries**

```python
"""Read queries for agent runs — group model calls (spend_logs) and tool calls
(mcp_audit_logs) by agent_run_id within an organization."""

from typing import Optional
from sqlalchemy import text
from database.db import get_db


async def list_runs(org_id: int, limit: int = 50, offset: int = 0) -> dict:
    """One row per agent_run_id with model/tool counts, denied count, totals."""
    params = {"org_id": org_id, "limit": limit, "offset": offset}

    base = """
        WITH model_calls AS (
            SELECT agent_run_id,
                   COUNT(*) AS model_count,
                   COALESCE(SUM(total_tokens), 0) AS tokens,
                   COALESCE(SUM(cost_usd), 0) AS cost,
                   MIN(created_at) AS first_at,
                   MAX(created_at) AS last_at
            FROM ai_gateway_spend_logs
            WHERE organization_id = :org_id AND agent_run_id IS NOT NULL
            GROUP BY agent_run_id
        ),
        tool_calls AS (
            SELECT agent_run_id,
                   COUNT(*) AS tool_count,
                   COUNT(*) FILTER (WHERE result_status = 'blocked') AS denied_count,
                   MIN(created_at) AS first_at,
                   MAX(created_at) AS last_at,
                   MAX(agent_key_id) AS agent_key_id
            FROM ai_gateway_mcp_audit_logs
            WHERE organization_id = :org_id AND agent_run_id IS NOT NULL
            GROUP BY agent_run_id
        ),
        runs AS (
            SELECT
                COALESCE(m.agent_run_id, t.agent_run_id) AS agent_run_id,
                COALESCE(m.model_count, 0) AS model_count,
                COALESCE(t.tool_count, 0) AS tool_count,
                COALESCE(t.denied_count, 0) AS denied_count,
                COALESCE(m.tokens, 0) AS total_tokens,
                COALESCE(m.cost, 0) AS total_cost,
                t.agent_key_id AS agent_key_id,
                LEAST(COALESCE(m.first_at, t.first_at), COALESCE(t.first_at, m.first_at)) AS started_at,
                GREATEST(COALESCE(m.last_at, t.last_at), COALESCE(t.last_at, m.last_at)) AS last_at
            FROM model_calls m
            FULL OUTER JOIN tool_calls t ON m.agent_run_id = t.agent_run_id
        )
    """

    count_sql = base + " SELECT COUNT(*) AS total FROM runs"
    data_sql = base + """
        SELECT r.*, ak.name AS agent_key_name
        FROM runs r
        LEFT JOIN ai_gateway_mcp_agent_keys ak ON ak.id = r.agent_key_id
        ORDER BY r.last_at DESC
        LIMIT :limit OFFSET :offset
    """

    async with get_db() as db:
        total = (await db.execute(text(count_sql), {"org_id": org_id})).scalar() or 0
        rows = (await db.execute(text(data_sql), params)).mappings().all()
        data = [dict(r) for r in rows]

    return {"data": data, "total": total, "limit": limit, "offset": offset}


async def get_run(org_id: int, run_id: str) -> dict:
    """Interleaved entries (model + tool) for one run, ordered by created_at."""
    params = {"org_id": org_id, "run_id": run_id}

    model_sql = """
        SELECT 'model' AS kind, created_at, model, provider,
               prompt_tokens, completion_tokens, total_tokens, cost_usd,
               latency_ms, status_code, request_messages, response_text,
               NULL::int AS agent_key_id
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id AND agent_run_id = :run_id
    """
    tool_sql = """
        SELECT 'tool' AS kind, created_at, tool_name AS model, NULL AS provider,
               NULL::int AS prompt_tokens, NULL::int AS completion_tokens,
               NULL::int AS total_tokens, NULL::numeric AS cost_usd,
               latency_ms, NULL::int AS status_code,
               arguments AS request_messages, result_summary AS response_text,
               agent_key_id
        FROM ai_gateway_mcp_audit_logs
        WHERE organization_id = :org_id AND agent_run_id = :run_id
    """

    async with get_db() as db:
        model_rows = (await db.execute(text(model_sql), params)).mappings().all()
        tool_rows = (await db.execute(text(tool_sql), params)).mappings().all()

    entries = [dict(r) for r in model_rows] + [dict(r) for r in tool_rows]
    entries.sort(key=lambda e: e["created_at"])
    return {"agent_run_id": run_id, "entries": entries}
```

- [ ] **Step 2: Verify module loads**

Run: `cd AIGateway/src && source ../venv/bin/activate && python -c "import crud.mcp_runs"`
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add AIGateway/src/crud/mcp_runs.py
git commit -m "feat(ai-gateway): runs read queries (list + interleaved detail)"
```

---

## Task 6: Runs router + mount

**Files:**
- Create: `AIGateway/src/routers/mcp_runs.py`
- Modify: `AIGateway/src/app.py`

- [ ] **Step 1: Write the router**

```python
"""Agent runs — group model calls and tool calls by agent_run_id."""

from fastapi import APIRouter, Request, status, HTTPException

from middlewares.auth import verify_internal_key
from utils.auth import get_org_id
from crud.mcp_runs import list_runs, get_run

router = APIRouter(prefix="/mcp/runs", tags=["mcp-runs"])


@router.get("", status_code=status.HTTP_200_OK)
async def runs_list(request: Request, limit: int = 50, offset: int = 0):
    verify_internal_key(request)
    org_id = get_org_id(request)
    result = await list_runs(org_id, limit=limit, offset=offset)
    return {
        "status": "success",
        "data": result["data"],
        "total": result["total"],
        "limit": result["limit"],
        "offset": result["offset"],
    }


@router.get("/{run_id}", status_code=status.HTTP_200_OK)
async def run_detail(run_id: str, request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    result = await get_run(org_id, run_id)
    if not result["entries"]:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "success", "data": result}
```

- [ ] **Step 2: Mount the router in `app.py`**

Add the import next to the other mcp router imports (`from routers.mcp_audit import ...`):

```python
from routers.mcp_runs import router as mcp_runs_router
```

Add the mount next to `app.include_router(mcp_audit_router, prefix="/internal", tags=["MCP CRUD"])`:

```python
app.include_router(mcp_runs_router, prefix="/internal", tags=["MCP CRUD"])
```

- [ ] **Step 3: Verify app boots**

Run: `cd AIGateway/src && source ../venv/bin/activate && python -c "import app"`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add AIGateway/src/routers/mcp_runs.py AIGateway/src/app.py
git commit -m "feat(ai-gateway): GET /internal/mcp/runs list + detail endpoints"
```

---

## Task 7: E2E test for the runs endpoints

**Files:**
- Create: `AIGateway/tests/test_17_mcp_runs.py`

- [ ] **Step 1: Write the E2E test**

```python
"""E2E: agent runs correlation — tool calls carrying a session_id group into a run.

Requires AI Gateway on :8100 and Express on :3000 (mirror test_13_mcp_hook.py setup).
"""

import os
import uuid
import httpx
import pytest

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
    from conftest import set_state
    set_state("runs_key", res.json()["data"]["plain_key"])


def test_two_tool_calls_same_session_form_one_run(api):
    from conftest import get_state
    key = get_state("runs_key")
    run_id = f"run-{uuid.uuid4()}"

    r1 = _hook(key, "echo one", run_id, "tu-1")
    r2 = _hook(key, "echo two", run_id, "tu-2")
    assert r1.json()["decision"] == "allow"
    assert r2.json()["decision"] == "allow"

    # Runs list contains our run with tool_count == 2
    runs = api.get("/mcp/runs?limit=100")
    assert runs.status_code == 200, runs.text
    match = [r for r in runs.json()["data"] if r["agent_run_id"] == run_id]
    assert len(match) == 1, "the two calls should collapse into one run"
    assert match[0]["tool_count"] == 2
    assert match[0]["model_count"] == 0

    # Run detail returns 2 interleaved entries, ordered
    detail = api.get(f"/mcp/runs/{run_id}")
    assert detail.status_code == 200, detail.text
    entries = detail.json()["data"]["entries"]
    assert len(entries) == 2
    assert all(e["kind"] == "tool" for e in entries)


def test_unknown_run_404(api):
    res = api.get("/mcp/runs/does-not-exist-xyz")
    assert res.status_code == 404
```

- [ ] **Step 2: Run the test**

Run: `cd AIGateway && source venv/bin/activate && cd tests && pytest test_17_mcp_runs.py -v`
Expected: 3 passed (gateway must be running on :8100).

- [ ] **Step 3: Commit**

```bash
git add AIGateway/tests/test_17_mcp_runs.py
git commit -m "test(ai-gateway): E2E for agent runs correlation endpoints"
```

---

## Task 8: Frontend — Runs list page

**Files:**
- Create: `Clients/src/presentation/pages/AIGateway/MCPRuns/index.tsx`

- [ ] **Step 1: Build the runs list page (mirrors MCPAuditLog data-fetch + MCPTable)**

```tsx
import { useEffect, useState, useCallback } from "react";
import { Stack, Typography } from "@mui/material";
import { Activity } from "lucide-react";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPTable, { MCPTableColumn } from "../MCPTable";
import { EmptyState } from "../../../components/EmptyState";
import RunDetailDrawer from "./RunDetailDrawer";

interface RunRow {
  agent_run_id: string;
  agent_key_name: string | null;
  model_count: number;
  tool_count: number;
  denied_count: number;
  total_tokens: number;
  total_cost: number;
  started_at: string;
  last_at: string;
}

const PAGE_SIZE = 25;

const COLUMNS: MCPTableColumn[] = [
  { label: "Run" },
  { label: "Agent" },
  { label: "Started" },
  { label: "Model calls", align: "right" },
  { label: "Tool calls", align: "right" },
  { label: "Denied", align: "right" },
];

export default function MCPRuns() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiServices.get<Record<string, any>>(
        `/ai-gateway/mcp/runs?limit=${PAGE_SIZE}&offset=0`,
      );
      setRows(res?.data?.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && rows.length === 0) {
    return (
      <EmptyState icon={Activity} message="No agent runs yet" showBorder>
        <Typography variant="body2">
          Runs appear when an agent sends the same run id (header
          {" "}<code>x-vw-agent-run-id</code> on model calls, or the session id on tool calls).
        </Typography>
      </EmptyState>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Runs</Typography>
      <MCPTable
        id="mcp-runs-table"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.agent_run_id}
        onRowClick={(r) => setSelected(r.agent_run_id)}
        renderRow={(r) => [
          r.agent_run_id.slice(0, 12) + "…",
          r.agent_key_name ?? "—",
          new Date(r.started_at).toLocaleString(),
          r.model_count,
          r.tool_count,
          r.denied_count || "—",
        ]}
      />
      {selected && (
        <RunDetailDrawer runId={selected} onClose={() => setSelected(null)} />
      )}
    </Stack>
  );
}
```

> Verified against `Clients/src/presentation/pages/AIGateway/MCPTable.tsx`: props are `id`, `columns: MCPTableColumn[]` (`{label, width?, align?}` — no per-column render), `rows`, `rowKey`, `renderRow` (returns cells in column order), optional `onRowClick`. `EmptyState` is a **named** export. There is no `loading` prop on MCPTable — render a spinner around it or omit; align the cell order in `renderRow` with `COLUMNS`.

- [ ] **Step 2: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no new errors in `MCPRuns/index.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Clients/src/presentation/pages/AIGateway/MCPRuns/index.tsx
git commit -m "feat(agent-control): runs list page"
```

---

## Task 9: Frontend — Run detail drawer (interleaved timeline) + sidebar entry

**Files:**
- Create: `Clients/src/presentation/pages/AIGateway/MCPRuns/RunDetailDrawer.tsx`
- Modify: Agent Control sidebar + route registration (find with the grep in Step 3)

- [ ] **Step 1: Build the run detail drawer**

```tsx
import { useEffect, useState } from "react";
import { Drawer, Box, Stack, Typography, Chip, Divider } from "@mui/material";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface RunEntry {
  kind: "model" | "tool";
  created_at: string;
  model: string;
  provider: string | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  request_messages: any;
  response_text: string | null;
}

export default function RunDetailDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<RunEntry[]>([]);

  useEffect(() => {
    (async () => {
      const res = await apiServices.get<{ data: { entries: RunEntry[] } }>(
        `/ai-gateway/mcp/runs/${encodeURIComponent(runId)}`,
      );
      setEntries((res.data as any)?.data?.entries ?? []);
    })();
  }, [runId]);

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: 560, p: "16px" } }}>
      <Typography variant="h6" sx={{ mb: "8px" }}>Run {runId.slice(0, 12)}…</Typography>
      <Stack spacing={1.5}>
        {entries.map((e, i) => (
          <Box key={i} sx={{ border: "1px solid #d0d5dd", borderRadius: "4px", p: "12px" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: "6px" }}>
              <Chip
                size="small"
                label={e.kind === "model" ? "Model call" : "Tool call"}
                sx={{ bgcolor: e.kind === "model" ? "#13715B" : "#1c6e7d", color: "#fff" }}
              />
              <Typography variant="caption">{new Date(e.created_at).toLocaleTimeString()}</Typography>
              <Typography variant="caption" sx={{ ml: "auto" }}>{e.model}</Typography>
            </Stack>
            {e.kind === "model" ? (
              <>
                <Typography variant="caption" color="text.secondary">Prompt</Typography>
                <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontSize: 12, m: 0 }}>
                  {e.request_messages ? JSON.stringify(e.request_messages, null, 2) : "(body logging disabled)"}
                </Box>
                <Divider sx={{ my: "6px" }} />
                <Typography variant="caption" color="text.secondary">Response</Typography>
                <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontSize: 12, m: 0 }}>
                  {e.response_text ?? "(body logging disabled)"}
                </Box>
              </>
            ) : (
              <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontSize: 12, m: 0 }}>
                {e.request_messages ? JSON.stringify(e.request_messages, null, 2) : "—"}
              </Box>
            )}
          </Box>
        ))}
      </Stack>
    </Drawer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd Clients && npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Register the Runs page in the Agent Control sidebar + router**

Find where the existing MCP pages are wired:

Run: `grep -rnE "MCPAuditLog|MCPApprovals" Clients/src --include=*.tsx --include=*.ts | grep -viE "pages/AIGateway/MCP(AuditLog|Approvals)/index"`
Expected: the sidebar/route file(s) that import the MCP pages.

In that file: import `MCPRuns` and add a nav item + route alongside the Audit log entry, in the monitor group, label "Runs", a Lucide icon (e.g. `Activity` / `GitBranch`), sentence case. Mirror the exact registration shape used by the audit-log entry you found.

- [ ] **Step 4: Typecheck + build**

Run: `cd Clients && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/AIGateway/MCPRuns/RunDetailDrawer.tsx
# plus the sidebar/route file(s) modified in Step 3
git commit -m "feat(agent-control): run detail drawer + Runs sidebar entry"
```

---

## Task 10: Docs

**Files:**
- Modify: `docs/technical/domains/agent-control.md`

- [ ] **Step 1: Add a "Run correlation" section**

Append a section documenting: `agent_run_id` is the join key; hook uses `session_id`, proxy reads `x-vw-agent-run-id` (aliases `x-session-id`, `helicone-session-id`); conversation capture is gated by endpoint `log_request_body`/`log_response_body` (default off); runs endpoints `GET /v1/.../mcp/runs` (via `/internal/mcp/runs`); flat ordering by `created_at`; `agent_run_path` reserved for future nesting; NULL run id = uncorrelated, still captured + enforced.

- [ ] **Step 2: Update the "Last Updated" date** at the top of `docs/technical/domains/agent-control.md` to today.

- [ ] **Step 3: Commit**

```bash
git add docs/technical/domains/agent-control.md
git commit -m "docs(agent-control): document agent run correlation"
```

---

## Final verification

- [ ] **Step 1: AIGateway tests**

Run: `cd AIGateway && source venv/bin/activate && cd tests && pytest test_13_mcp_hook.py test_16_mcp_hook_results.py test_17_mcp_runs.py -v`
Expected: all pass (no enforcement regression; runs correlation works).

- [ ] **Step 2: Frontend gates**

Run: `cd Clients && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Manual smoke (optional)**

Point an OpenAI client at the proxy with `-H 'x-vw-agent-run-id: smoke-1'`, make a call on a `log_response_body=true` endpoint, run a Bash hook call with `session_id=smoke-1`, then open Agent Control → Runs → the `smoke-1` run shows both the model call (prompt/response) and the tool call interleaved.
