# Agent Control — tool result capture, events timeline, and invocation drawer

> **Status:** Design approved 2026-06-16. Not yet implemented.
> **Scope:** Feature #4 from the Atyrum gap analysis — capture each native tool call's
> *result* and a per-invocation *events timeline*, and surface both in a detail drawer on
> the Activity page.

## Problem

Atyrum's "Invocations" view has a per-invocation detail drawer showing the tool's RESULT
(stdout/stderr/interrupted) and an EVENTS timeline (Received → Decided → Completed). We
already store arguments, status, latency and a 500-char summary per call, but:

1. We never capture what a native tool actually *did* — the native hook is **PreToolUse
   only**. It adjudicates before the tool runs and never sees the result.
2. We have no per-invocation event timeline.
3. Activity rows aren't clickable and there is no detail drawer.

This feature closes #4: result capture + events + drawer. It does **not** cover decision
provenance (which rule matched / "Create rule from this") — that is a separate follow-up.

## Verified facts this design rests on

- **Claude Code passes `tool_use_id` and `session_id` on stdin to BOTH PreToolUse and
  PostToolUse hooks.** `tool_use_id` is the per-tool-call identifier and is identical
  across the two events for the same call. `session_id` identifies the whole session, not
  a single call. (Confirmed against the official Claude Code hooks reference.)
- **PostToolUse provides `tool_response`, whose shape differs per tool.** Bash:
  `{stdout, stderr, interrupted, isImage}`. Write: `{filePath, success}`. Edit: a
  success-shaped object. Read: file content. **There is no exit code.**
- **PostToolUse also provides `duration_ms`** (optional).
- **`MultiEdit`/`NotebookEdit` are not in the documented PostToolUse matchable-tool table.**
  Treat them as unverified for PostToolUse; test before adding to the matcher.
- **The native hook (`mcp_hook.py`) has 5 terminal decisions**: `allow`, `deny`/blocked,
  `approval_required`, `rate_limited`, internal `error`. Only `allow` (and an
  `approval_required` that the human approves) leads to the tool actually running.
- **Auditing is fire-and-forget** (`log_tool_call` does an INSERT and swallows errors,
  returns nothing). It must stay off the hot path.
- **The approval flow produces ONE audit row today.** The adapter polls in-process and
  `exit 0`s on approval; it never makes a second `/v1/mcp/hook` call, so there is no
  separate `success` row. The approved tool then runs and (with this feature) its
  PostToolUse result updates the original `approval_required` row in place.

## Model

**One audit row per invocation, correlated by `(organization_id, session_id, tool_use_id)`,
updated in place.**

```
PreToolUse  → POST /v1/mcp/hook {tool_name, arguments, session_id, tool_use_id}
   adjudicate → INSERT one row, store session_id + tool_use_id
   seed events: [received, decided:<outcome>]
   status: success(allow) | blocked | rate_limited | approval_required | error

   allow              → tool runs
   approval_required  → adapter polls in-process; on approved, tool runs
   deny / rate_limited(closed) / error → TERMINAL, tool never runs, no result

PostToolUse → POST /v1/mcp/hook/result
              {session_id, tool_use_id, tool_name, tool_response, duration_ms}
   find row WHERE (org, session_id, tool_use_id), most recent
   cap (serialized tool_response ≤ MCP_RESULT_CAP_BYTES, default 10240) + mask
   UPDATE row:
     - if status was approval_required → success
     - store result_response (capped + masked), set result_truncated
     - append outcome event (per-tool heuristic, below)
   no row found → 200 {"status": "no_match"}   (deny / rate-limited / old adapter — benign)
```

### Correlation

`(session_id, tool_use_id)` read from Claude Code stdin by both hook processes. Nothing is
minted; nothing is persisted between the two separate hook processes; the hot path is
unchanged. An adapter that does not send `tool_use_id` (or an old adapter) simply never
matches a result → the drawer shows "No result captured." Purely additive, fully
backward-compatible.

### Result outcome (no exit code exists)

Append exactly one terminal event derived per tool:

- **Bash**: `tool_response.interrupted === true` → `interrupted`, else `completed`.
  (stderr alone is NOT treated as failure — many tools write to stderr on success.)
- **Write / Edit**: `tool_response.success === false` → `failed`, else `completed`.
- **Other tools**: `completed`.

## Schema (additive Alembic migration, AIGateway)

`session_id` already exists on `ai_gateway_mcp_audit_logs`. Add:

```sql
ALTER TABLE ai_gateway_mcp_audit_logs
  ADD COLUMN tool_use_id      VARCHAR(128),
  ADD COLUMN result_response  JSONB,                 -- whole tool_response, capped + masked
  ADD COLUMN result_truncated BOOLEAN DEFAULT false,
  ADD COLUMN events           JSONB DEFAULT '[]';    -- [{type, at, detail?}]

CREATE INDEX idx_gw_mcp_audit_invocation
  ON ai_gateway_mcp_audit_logs(organization_id, session_id, tool_use_id);
```

All columns nullable / defaulted → old rows and old adapters keep working. No exit-code
column; no fixed stdout/stderr columns (those are Bash-specific and live inside
`result_response`).

### `events` shape

```json
[
  {"type": "received",          "at": "2026-06-16T13:05:01Z"},
  {"type": "decided",           "at": "2026-06-16T13:05:01Z", "detail": "allow"},
  {"type": "completed",         "at": "2026-06-16T13:05:02Z"}
]
```

Possible `type` values: `received`, `decided` (detail = allow/deny/rate_limited/error),
`approval_required`, `approved`, `denied`, `completed`, `interrupted`, `failed`.

## Backend

### `mcp_audit_service.log_tool_call`

Gains optional `tool_use_id` and `events` params. Each of the 5 decision branches in
`mcp_hook.py` passes its seed events via the existing `_audit()` helper (the single place
that calls `log_tool_call` in the hook). Still fire-and-forget.

### New endpoint `POST /v1/mcp/hook/result`

- Auth: `extract_agent_key` (same sk-mcp-* path as `/v1/mcp/hook`).
- Body: `{session_id, tool_use_id, tool_name, tool_response, duration_ms?}`.
- Look up the most-recent row `WHERE (organization_id, session_id, tool_use_id)`.
- **Reject** (403) if the matched row's `agent_key_id` != caller's key id — one key can't
  write another key's result.
- **No match** → `200 {"status": "no_match"}`. Never 500: deny/rate-limited/old-adapter
  cases are expected and benign.
- Serialize `tool_response`, cap to `MCP_RESULT_CAP_BYTES` (config, default 10240), set
  `result_truncated`.
- Mask via a **new** `scan_result_blob(org_id, text)` helper (NOT `scan_tool_input`, which
  is field-aware for tool arguments). The blob helper runs the org's PII/content guardrails
  over a flat string and returns the masked string. This keeps result data-at-rest
  consistent with how input is treated.
- UPDATE: flip `approval_required` → `success`; store `result_response`,
  `result_truncated`; append the outcome event.

### New read endpoint `GET /mcp/audit/logs/{id}`

Returns a single audit row by primary key, including `arguments`, `result_response`,
`events`, `status`, `tool_use_id`, `session_id`, timestamps. Org-scoped. Used by the drawer.

## Adapter (`scripts/vw-tool-hook.sh`)

- PreToolUse POST gains `session_id` and `tool_use_id`, read from stdin
  (`.session_id`, `.tool_use_id`).
- New **result mode** (same script, dispatched by `hook_event_name` or an arg): reads
  `tool_response`, `session_id`, `tool_use_id`, `tool_name`, `duration_ms` from stdin and
  POSTs to `/v1/mcp/hook/result`.
- Result mode is **best-effort, fail-open, silent**: any failure (gateway down, non-200,
  timeout) exits 0 without output. The tool has already run; result capture must never
  block or error.
- README/config: add a **PostToolUse** matcher. Start with `Bash|Edit|Write` (documented).
  `MultiEdit|NotebookEdit` are unverified for PostToolUse — note that they must be tested
  before being added to the matcher.

## Frontend

- Activity rows become clickable (`onRowClick` on the existing `MCPTable`).
- New `MCPInvocationDrawer` built on the existing right-anchored MUI `Drawer` pattern
  (`components/Drawer/*`), ~520px wide.
- Drawer data: `GET /ai-gateway/mcp/audit/logs/:id` (single row).
- Sections, top to bottom:
  - **Header**: `tool_name · agent key`, status chip, timestamp, `tool_use_id` (the
    per-call identifier, shown as the invocation id), session id. The internal row PK is
    used only as the `GET .../logs/:id` lookup key, not surfaced as the user-facing id.
  - **Arguments**: key/value table from `arguments` (already stored).
  - **Result**: rendered per tool from `result_response` — Bash shows stdout/stderr +
    interrupted; Write shows filePath/success; etc. If absent → "No result captured
    (older adapter, or the tool did not report back)."
  - **Events**: vertical timeline from `events`.
  - **Show raw JSON**: collapsible, dumps the full row.
- No "Summarize" button (no summary model configured; out of scope).

## Error handling

- Result endpoint: never 500 on missing row; 403 on cross-key write; cap + mask before
  store; events are append-only.
- Adapter result mode: fail-open silent.
- Drawer: render each state (full result / no result / terminal-deny with no result /
  approval-then-completed timeline); long output scrolls inside the result block.

## Testing

**Backend E2E** (extend the existing MCP hook E2E suite):
- allow → PostToolUse result → row updated, `completed` event, result stored.
- deny → no result call → row terminal at `decided`, drawer shows no result.
- approval_required → approve → tool runs → PostToolUse updates the SAME row to `success`
  with result (events: received → approval_required → approved → completed).
- oversized `tool_response` → `result_truncated = true`, capped.
- PII in stdout → masked in stored `result_response`.
- PostToolUse for an unknown `(session_id, tool_use_id)` → `200 no_match`, no row created.
- cross-key result write → 403.

**Adapter**: result POST failure is silent/fail-open; correct fields sent for Bash vs Write.

**Frontend**: drawer renders full-result, no-result, terminal-deny and approval-timeline
states; raw-JSON toggle; long output scrolls.

## Out of scope (separate follow-ups)

- **Decision provenance**: which rule matched, the "RULE" badge, "Create rule from this".
  Needs `matched_rule_id`/type recorded in the scan + approval-match services.
- **LLM "Summarize"** of a result (needs a configured summary model).
- **Server / Decision columns** on the Activity table (server_id is stored; decision needs
  the provenance work above).
- Non-Claude-Code adapters (Cursor etc.) — they get no result capture until they send
  `tool_use_id` + a PostToolUse equivalent.
