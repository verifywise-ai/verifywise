# Agent Control — native tool-call governance

> **Status:** Shipped to `develop`. Core governance (PRs #4078, #4083, #4084); tool result
> capture + events timeline + invocation drawer (PR #4103); run correlation, multi-agent
> wiring (Claude Code + Cursor) and the developer guide (PR #4112). Last updated 2026-06-18.

Agent Control gates a coding agent's tool calls through the AI Gateway's guardrails,
human-approval and audit machinery. It covers two entry paths that share one governance
layer:

- **MCP proxy** (`POST /v1/mcp`) — the agent calls a tool *through* the gateway, which
  forwards the JSON-RPC call to a registered MCP server.
- **Native hook** (`POST /v1/mcp/hook`) — the agent runs its *own* built-in tool (Bash,
  Edit, Write, MultiEdit, NotebookEdit). The gateway **adjudicates** (allow / deny /
  approval_required / rate_limited) and **never forwards or executes** the call. A
  dev-machine adapter (`scripts/vw-tool-hook.sh`, a Claude Code `PreToolUse` hook) calls
  this endpoint before the tool runs.

"Agent Control" is the UI name for this section (renamed from "MCP Gateway"). Mental model:
the **AI Gateway** governs what the AI *says* (model calls, spend); **Agent Control** governs
what the AI *does* (tool calls).

## Request flow (the hook, `AIGateway/src/routers/mcp_hook.py`)

```
extract_agent_key (sk-mcp-*)                    -- shared with the proxy
  → scan_tool_input(field_aware=True)           -- guardrail scan; block/mask → deny
  → check_require_approval                      -- hook-only; match → create/reuse approval
  → enforce_mcp_rate_limits                     -- LAST, and skipped on an approved re-call
  → allow
```

Every path writes an audit row (`log_tool_call`), seeded with a `received` + `decided` event
and the call's `tool_use_id`. Audit and the approval argument-hash use the **full** arguments;
only the guardrail scan uses the field-aware subset.

## Field-aware scanning (`AIGateway/src/utils/mcp_tool_content.py`)

`extract_scannable_content(tool_name, arguments)` returns the subset to scan:

| Tool | Scanned field(s) |
|---|---|
| `Write` | `content` |
| `Edit` | `new_string` |
| `MultiEdit` | each `edits[].new_string`, joined raw |
| `NotebookEdit` | `new_source` |
| Bash / MCP / unknown | full `arguments` |

Only **written** content is scanned, not `old_string` (removed text) or `file_path`. So
*deleting* a line containing PII is allowed; *writing* PII is denied. A pure deletion (no
written content) returns `{}` and is allowed.

**Critical:** this is **opt-in** via `scan_tool_input(..., field_aware=True)`. The hook passes
`True`; the **MCP proxy passes the default `False`** (full-args scan). Without this, a proxied
MCP tool that happens to be named `Write`/`Edit` would have its args narrowed and bypass
guardrails. (Closed in review.)

## Human approval (`require_approval` rule type)

A guardrail rule with `rule_type = "require_approval"` (regex/keyword on the command, matched
in `services/mcp_approval_match.py`) routes a matching call through the existing approval flow
instead of denying it. The adapter blocks and polls `GET /v1/mcp/approvals/{id}/status`;
approved → run, denied → block, timeout → `VW_APPROVAL_FAIL_MODE` (default deny).

- Approvals are **argument-scoped** (SHA-256 of full args) — approving one call doesn't
  authorize a different one.
- Native approvals carry `tool_id IS NULL`; proxy approvals carry a `tool_id`. Lookups are
  scoped by `native=True/False` so a native-hook approval can never authorize a proxy call of
  the same name+args. (Migration `a0006` made `tool_id` nullable.)
- An already-approved re-call **skips** the rate limiter so an approval is never wasted.

## Tool result capture & events timeline (PR #4103)

The PreToolUse hook records that a call happened and how it was adjudicated, but not what the
tool *did*. A second, post-execution call captures the result, and every invocation carries an
events timeline.

**Correlation.** One audit row per invocation, keyed by
`(organization_id, session_id, tool_use_id)`. All three are present in both the Claude Code
PreToolUse and PostToolUse hook payloads, so nothing is minted or persisted between the two
separate hook processes. The row is updated in place.

```
PreToolUse  → POST /v1/mcp/hook         -- INSERT row, store tool_use_id,
                                           events: [received, decided:<outcome>]
[allow → the tool runs; approval_required → adapter polls, then runs]
PostToolUse → POST /v1/mcp/hook/result  -- find row by (org, session_id, tool_use_id),
                                           cap + mask the result, append outcome event
```

- **`POST /v1/mcp/hook/result`** (`mcp_hook.py`): serializes the tool's `tool_response`, caps
  it to `MCP_RESULT_CAP_BYTES` (default 10240, byte-safe slice), masks it via
  `scan_result_blob`, then calls `update_tool_result`. Returns `forbidden` → 403,
  `error` → 500, and `ok`/`no_match` → 200. A missing row (deny, rate-limited, or an old
  adapter that never sends the result) is a benign `no_match`, not an error.
- **Per-tool outcome event.** `tool_response` shape differs per tool and has no exit code, so
  the result is stored as a generic `result_response` JSONB and the outcome event is derived
  per tool: Bash `interrupted` → `interrupted`; Write/Edit `success === false` → `failed`;
  otherwise `completed`.
- **Approval flow stays one row.** When an approval-gated call is approved and re-runs, its
  PostToolUse result updates the original `approval_required` row in place
  (`update_tool_result` flips it to `success`).
- **`GET /mcp/audit/logs/{id}`** returns a single audit row (with `result_response` and
  `events`) for the invocation drawer; envelope `{"status": "success", "data": row}`.

### Masking the result (`scan_result_blob`, `mcp_guardrail_service.py`)

`scan_result_blob(org_id, blob)` runs the org's PII / content-filter guardrails over the flat
serialized result and returns the masked string. Fail-open: any error stores the original blob
rather than dropping the result. A tool result has already executed, so **every** detected
entity is forced to `mask` — a per-entity `block` action would otherwise short-circuit
`scan_text` into a blocked result (`masked_text=None`) and leak the unmasked blob. (This was a
real leak caught by the masking E2E test against a live org that had a block-action PII rule.)

### Schema (migration `a0007`, additive)

`ai_gateway_mcp_audit_logs` gains `tool_use_id VARCHAR(128)`, `result_response JSONB`,
`result_truncated BOOLEAN`, `events JSONB DEFAULT '[]'`, plus an index on
`(organization_id, session_id, tool_use_id)`. All nullable/defaulted, so old rows and old
adapters keep working.

## Adapter (`scripts/vw-tool-hook.sh` + README)

Two Claude Code hooks point at the same script:

- **PreToolUse** (matcher `Bash|Edit|Write|MultiEdit|NotebookEdit`) adjudicates the call and
  blocks on approval polling.
- **PostToolUse** (matcher `Bash|Edit|Write`) captures the result, best-effort: it POSTs the
  `tool_response` to `/v1/mcp/hook/result` and always exits 0 — the tool has already run, so
  result capture never blocks. (`MultiEdit`/`NotebookEdit` aren't confirmed as PostToolUse
  matchers in the Claude Code docs; test before adding them.)

Env: `VW_GATEWAY_URL`, `VW_AGENT_KEY` (sk-mcp-*), `VW_FAIL_MODE` (open|closed, default open —
for gateway-unreachable and rate_limited), `VW_TIMEOUT`, `VW_APPROVAL_WAIT`,
`VW_APPROVAL_FAIL_MODE` (default closed).

## UI

No bespoke screens for governance: rules are authored in **Guardrails**, decisions made in
**Approvals**, and every call appears in **Activity** (the renamed Audit Log) — all under the
**Agent Control** sidebar group. Servers/Tools keep "MCP" in their labels (genuinely
MCP-protocol concepts).

**Invocation drawer** (PR #4103): Activity rows are clickable and open a right-side drawer
(`MCPInvocationDrawer.tsx`) showing the call's status, `tool_use_id`, agent key + session,
arguments, the captured result (or "no result captured"), the events timeline, and a raw-JSON
toggle. It reads `GET /ai-gateway/mcp/audit/logs/{id}`.

## Run correlation

The two halves of an agent turn live in separate tables: the **model call** (the conversation
the agent had with the LLM) lands in `ai_gateway_spend_logs`; the **tool call** (the action it
took) lands in `ai_gateway_mcp_audit_logs`. Run correlation joins them into one reconstructable
**run** — what the agent said, then what it did.

**The key.** `agent_run_id` is the correlation key.

- The **native hook** reuses its existing `session_id` as the `agent_run_id`, set at insert in
  `log_tool_call`. No new identifier is minted.
- The **model proxy** reads a request header `x-vw-agent-run-id` (accepted aliases:
  `x-session-id`, `helicone-session-id`) and persists it on the spend log.

**Storage.** `agent_run_id` (nullable `TEXT`) is added to both `ai_gateway_spend_logs` and
`ai_gateway_mcp_audit_logs` in migration `a0008`. A reserved nullable `agent_run_path` column
is added alongside it for future run-tree nesting — unused in v1; runs are flat and ordered by
`created_at`.

**Conversation capture.** The proxy persists `request_messages` / `response_text` on
`ai_gateway_spend_logs`, gated by the org-level guardrail settings flags `log_request_body` /
`log_response_body` (both default `false`). Stored content is the **post-guardrails**
(scanned/masked) messages — never the raw request/response. When a flag is off, the column is
null and the UI shows "(body logging disabled)".

**Endpoints.**

- `GET /internal/mcp/runs` — lists runs, one row per run with model/tool counts, denied count,
  total tokens and cost.
- `GET /internal/mcp/runs/{run_id}` — the run detail: model and tool entries interleaved,
  ordered by `created_at`.

Both are reachable through the Express proxy under `/ai-gateway/mcp/runs`.

**Graceful degradation.** A call with no run id — a plain OpenAI client, or an un-instrumented
agent — is still logged and still enforced exactly as before. It simply won't appear inside a
correlated run. Zero regression.

**UI.** A **Runs** page in Agent Control lists runs; clicking one opens a detail drawer that
shows the conversation and the tool calls interleaved.

## Not yet built (Phase 4+)

- **Path-based gating** — block/approve writes by *destination* (`~/.ssh`, `.env`, outside the
  repo). Genuinely new matching logic.
- **Decision provenance** — record which rule matched each call (the "RULE" badge and "Create
  rule from this" in comparable products); Server/Decision columns on Activity depend on it.
- An Agent Control overview/landing page; a priority rule engine; tamper-evident audit;
  metering MCP calls into the existing budgets; an LLM "summarize" for captured results.
- Adapters for agents without a pre-tool hook (Codex CLI, Aider, Gemini CLI). The integration
  contract is documented (see the developer guide) so users can wire these themselves; no
  bundled adapter ships yet. Cursor and Claude Code both work today via `scripts/vw-tool-hook.sh`.

## Design history

The spec/plan trail for each increment lives under `docs/superpowers/`:
`2026-06-15-mcp-bash-hook-*` (Phase 1), `2026-06-15-mcp-hook-approval-*` (Phase 2),
`2026-06-16-mcp-hook-filewrite-*` (Phase 3), `2026-06-16-agent-control-rename-*` (rename),
`2026-06-16-agent-control-tool-results-*` (result capture + events + drawer),
`2026-06-17-agent-run-correlation-*` (run correlation),
`2026-06-17-agent-control-developer-docs-*` (developer guide + multi-agent support).

## Integrator-facing docs

Customer developers connecting their own agent use the **Developer guide** collection in the
in-app user guide (`shared/user-guide-content/content/developers/`): overview, connect your
agent (Claude Code + Cursor wiring), connect any agent (the generic hook contract + MCP proxy +
bring-your-own), governing tool calls, and an API reference. Keep that collection in sync when
the hook request/response shape, the `x-vw-agent-run-id` header, or the endpoints change.
