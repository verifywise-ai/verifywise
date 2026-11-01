# Agent Control — native tool-call governance

> **Status:** Shipped to `develop`. Core governance (PRs #4078, #4083, #4084); tool result
> capture + events timeline + invocation drawer (PR #4103); run correlation, multi-agent
> wiring (Claude Code + Cursor) and the developer guide (PR #4112); per-agent rules, decision
> provenance and the agent activity drawer (#4320, restored after the #4265 revert);
> per-key monitor-only enforcement mode (migration `a0014`); per-key opt-in for tool lists on
> native calls (migration `a0015`).
> Last updated 2026-10-15 (opt-in hook tool lists; Python SDK adapters and review fixes).

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
  → tool lists (only if apply_tool_lists_to_hook) -- key's allowed_tools / blocked_tools; violation → deny
  → scan_tool_input(field_aware=True)           -- guardrail scan; block/mask → deny
  → check_require_approval                      -- hook-only; match → create/reuse approval
  → enforce_mcp_rate_limits                     -- LAST, and skipped on an approved re-call
  → allow
```

For a **monitor-only** key (see *Monitor-only mode* below) the flow is different: the tool
lists (when opted in), the guardrail scan and `check_require_approval` all run (no early
return), no approval request is
looked up, created or notified, the rate limit is still enforced, and the answer is always
`allow` (or `rate_limited`).

**Tool lists on the hook are opt-in per key.** A key's `allowed_tools` / `blocked_tools` were
written for MCP proxy tools; applying them to native calls unconditionally would deny Bash, Edit
and friends for every key shared with Claude Code or Cursor. So the hook checks them only when
the key's `apply_tool_lists_to_hook` is true (migration `a0015`: `BOOLEAN NOT NULL DEFAULT
FALSE` on `ai_gateway_mcp_agent_keys`; Admin-only on create / PATCH, boolean or 400; returned by
list / create / PATCH and selected by `authenticate_agent_key`; a missing value means off).
When on, the check is the first `PolicyHit` (kind `tool_acl`) in `evaluate_hook_policies(...,
agent_key=)` and applies to every hook client (the shell hook and the Python SDK alike). An
enforce key gets `{"decision": "deny", "reason": "Tool '<name>' is not allowed for this agent
key"}` and an audit row `result_status='blocked'` whose summary names the key's lists. A monitor
key gets a `would_block` outcome with source `tool_acl` and the call is allowed. Matching uses
`utils/acl.py` (exact name or trailing `*` wildcard), the same as the MCP proxy. UI: the
"Also apply tool lists to native tool calls (hooks and SDK)" toggle in the create modal and
the row's "Enforcement settings" modal; the Tools column says "MCP proxy only" or "MCP proxy
and native calls".

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
  the result is stored as a generic `result_response` JSONB and the outcome event is derived:
  a dict with a non-null `"error"` key → `failed` for any tool (how the SDKs report a raised
  tool); Bash `interrupted` → `interrupted`; Write/Edit `success === false` → `failed`;
  otherwise `completed`.
- **Approval flow stays one row.** When an approval-gated call is approved and re-runs, its
  PostToolUse result updates the original `approval_required` row in place
  (`update_tool_result` flips it to `success`).
- **`GET /mcp/audit/logs/{id}`** returns a single audit row (with `result_response` and
  `events`) for the invocation drawer; envelope `{"status": "success", "data": row}`.

### Masking the result (`scan_result_blob`, `mcp_guardrail_service.py`)

`scan_result_blob(org_id, blob, *, agent_key_id)` runs the org's PII / content-filter
guardrails that apply to the calling agent (see *Per-agent rules* below) over the flat
serialized result and returns the masked string. Tool scope is not applied here: the result's
tool name comes from the client, while the agent key is the caller's own credential. Fail-open: any error stores the original blob
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

## Adapters: Python SDK (`sdks/python/verifywise-agent-control/`)

An MIT-licensed Python package that calls the same two endpoints as the shell hook
(`POST /v1/mcp/hook` before, `POST /v1/mcp/hook/result` after), with the same `VW_*` env vars
and defaults. Installed from GitHub by tag (`sdk-py-vX.Y.Z`, `#subdirectory=`), not PyPI.
CI: `.github/workflows/python-sdk-checks.yml` (ruff + pytest, real frameworks, no network).
Each adapter uses the framework's own agent-level interception point, so no tool is missed:

| Framework | Interception | Refusal reaches the model as | `on_deny="raise"` |
|---|---|---|---|
| LangChain v1 | `AgentMiddleware.wrap_tool_call` / `awrap_tool_call` | `ToolMessage(status="error")` | raises `VerifyWiseDenied` |
| CrewAI (≥1.15.28) | process-wide `pre_tool_call` / `post_tool_call` hooks (+ `execution_start/end` for per-kickoff run ids) | pre hook blocks; post hook replaces CrewAI's fixed "blocked by hook" text with the refusal | post hook raises a `VerifyWiseDenied` that is also CrewAI's `HookAborted` (passed through, no retry) |
| Microsoft Agent Framework (core ≥1.21) | `FunctionMiddleware.process` | `context.result` set, `call_next` skipped | raises a `VerifyWiseDenied` that is also `MiddlewareFailure` |
| Plain Python | `@governed` / `govern_tool()` | the refusal string is returned | raises `VerifyWiseDenied` |

Run id: explicit `vw_session` → framework id (LangGraph `thread_id`, CrewAI per-kickoff id,
Agent Framework `AgentSession.session_id`) → per-invocation/per-client uuid.

Fail behaviour and integrity rules (`client.py`, `_core.py`):

- `VW_FAIL_MODE` covers only gateway outages: unreachable, timeout, 5xx / other non-200,
  unreadable reply, `rate_limited`, missing config. Always refused regardless: HTTP 401/403
  (`auth_rejected`, "VerifyWise rejected the agent key (revoked, expired or invalid)"), an
  exception inside the SDK (`sdk_error`), arguments JSON can't represent exactly
  (`arguments_unsendable`, "arguments could not be sent to VerifyWise for checking"; nothing
  is ever converted, so the guardrails scan exactly what runs) and arguments that changed
  between the check and the run (`arguments_changed`; CrewAI can only record it, the tool has
  run). All logged at ERROR.
- Only `/v1/mcp/approvals/<same id>/status` is polled; requests never follow redirects.
- The result envelope (`{"output"|"error": ...}` + `"truncated": true`) is cut to 9216 bytes as
  the gateway measures it (`len(json.dumps(tool_response))`), under `MCP_RESULT_CAP_BYTES`, so
  the gateway never re-slices.
- `AsyncAgentControlClient` keeps one httpx pool per running event loop; middlewares without an
  explicit client share `_core.default_client()` / `default_async_client()`.

Spec:
`docs/superpowers/specs/2026-10-15-agent-control-python-sdk-design.md`.

## Log retention

Each organization can set its own period for Agent Control logs in **Settings → Data retention**. It defaults to the deployment value `MCP_AUDIT_RETENTION_DAYS`. See `docs/technical/domains/data-retention.md`.

## UI

No bespoke screens for governance: rules are authored in **Guardrails**, decisions made in
**Approvals**, and every call appears in **Activity** (the renamed Audit Log) — all under the
**Agent Control** sidebar group. Servers/Tools keep "MCP" in their labels (genuinely
MCP-protocol concepts).

**Invocation drawer** (PR #4103): Activity rows are clickable and open a right-side drawer
(`MCPInvocationDrawer.tsx`) showing the call's status, `tool_use_id`, agent key + session,
arguments, the captured result (or "no result captured"), the events timeline, and a raw-JSON
toggle. It reads `GET /ai-gateway/mcp/audit/logs/{id}`. A blocked or approval-gated call also
shows the rule that decided it.

**Agent activity drawer** (`AgentActivityDrawer.tsx`): the activity icon on an Agent keys row
opens one agent's last 30 days: tool calls (with last active), runs, denied, approvals,
errors, average latency, calls per tool, and recent calls with the rule that decided each.

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

## Per-agent rules and decision provenance

**Scope.** A guardrail or `require_approval` rule has `agent_scope` (`'all'` | `'selected'`,
default `'all'`, migration `a0010`) and `applies_to_agent_keys INTEGER[]` (`a0009`). Every rule
query (`scan_tool_input`, `check_require_approval`, `scan_result_blob`) matches
`agent_scope = 'all' OR :agent_key_id = ANY(applies_to_agent_keys)`, and each takes
`agent_key_id` as a required keyword argument so no path (hook or MCP proxy) can skip it.

- A `'selected'` rule with no keys left applies to **no** agent. It never widens to every agent;
  that is why the scope is an explicit column rather than "empty list means everyone".
- Revoking a key removes it from every rule's list in the same transaction (revoked keys can't
  be reactivated, and only revoked keys can be deleted). The revoke dialog says so.
- Create/update (`routers/mcp_guardrails.py`, `_resolved_agent_scope`) take both fields
  together: ids must be active keys of the org, `'selected'` needs at least one, `'all'` takes
  none, and keys sent without a scope mean `'selected'`. A PATCH that only toggles `is_active`
  leaves the scope alone.
- The Guardrails page offers "All agents / Selected agents", lists only active keys, and treats
  ids that are no longer active keys as gone (a rule with none left shows "No agents").
- When several prompt-injection rules apply, a `block` rule wins over a `mask` one.

**Provenance.** `ai_gateway_mcp_audit_logs.matched_rule_id` / `matched_rule_name` (`a0009`)
record the rule behind a block or approval. `blocking_rule()` picks the first blocking detection
(on the hook, a mask hit counts, since the hook escalates it to a deny), and `block_reason`
describes that same detection.

**Per-agent activity.** `GET /internal/mcp/audit/agent/{agent_key_id}?days=30` (1 to 365,
reachable as `/ai-gateway/mcp/audit/agent/{id}`) returns `summary`, `by_tool` and the 50 most
recent calls. "Denied" excludes circuit-breaker outages, which the proxy logs as `blocked` with
a fixed summary (`CIRCUIT_BREAKER_SUMMARY`).

## Monitor-only mode (per agent key)

An Admin can set an agent key's `enforcement_mode` to `'monitor'` (default `'enforce'`, the
behaviour described everywhere else in this doc). A monitor key is evaluated against the same
policies as an enforce key on the same path, but its calls are never blocked or paused: they go
through, and the audit row records what would have happened. It lets an organization roll out
rules against real agent traffic before enforcing them.

What is evaluated depends on the path, exactly as in enforce mode:

| Path | Evaluated |
|---|---|
| Native hook (`/v1/mcp/hook`) | the key's `allowed_tools` / `blocked_tools` **only when** `apply_tool_lists_to_hook` is on, then guardrail rules (block, and mask escalated to deny) and `require_approval` rules |
| MCP proxy (`tools/call`) | the key's `allowed_tools` / `blocked_tools`, the tool's `requires_approval` flag, and guardrail rules |

**Data model** (migration `a0014`, on `ai_gateway_mcp_agent_keys`):

| Column | Type | Notes |
|---|---|---|
| `enforcement_mode` | `VARCHAR(20) NOT NULL DEFAULT 'enforce'` | CHECK `ai_gateway_mcp_agent_keys_enforcement_mode_check`: `'enforce'` or `'monitor'` |
| `enforcement_mode_changed_at` | `TIMESTAMPTZ NULL` | when the mode last changed |
| `enforcement_mode_changed_by` | `INTEGER NULL REFERENCES users(id) ON DELETE SET NULL` | VerifyWise user who changed it. Deleting that user clears the column instead of blocking the delete. Since `a0016`, `created_by` and every other gateway reference to `users` are `ON DELETE SET NULL` too. |

**API** (`routers/mcp_agent_keys.py`, Admin only): `enforcement_mode` is accepted on create and
PATCH; anything other than the two values is a 400. List, create and PATCH responses return all
three fields; the list also returns `enforcement_mode_changed_by_name` (a `LEFT JOIN users`, like
`created_by_name`), so the keys page needs no separate users request. The change stamp is set on
create only for a non-default mode, and on PATCH only when the stored value actually changes
(compared in the same `UPDATE`); a same-value PATCH keeps the previous stamp.
`authenticate_agent_key` reads `enforcement_mode`, so both entry paths see it; a missing value is
treated as `'enforce'`.

**Notification.** When a PATCH actually changes the mode (`update_agent_key` returns
`enforcement_mode_changed`, true only when that `UPDATE` stamped `enforcement_mode_changed_at`),
the router sends a config-change event with `action: "enforcement_mode_changed"`, `oldMode`,
`newMode` and the camelCase fields the backend's `notifyConfigChange`
(`Servers/services/aiGateway/aiGatewayNotifications.ts`) reads. Other admins get "Agent key mode
changed": *Agent key "x" switched to monitor only by Jane Doe.* A relative `actionUrl` is
prefixed with `FRONTEND_URL` there. A PATCH that also changes other fields sends the generic
`updated` event as well; a same-value PATCH sends only `updated`.

**New audit statuses.** `would_block` (a guardrail block or mask hit on the hook; a guardrail
block or a tool-list violation on the proxy) and `would_need_approval` (a `require_approval` rule
on the hook, a tool flagged `requires_approval` on the proxy). When several apply, the row's
`result_status` is the most severe (`would_block` > `would_need_approval`, first of that kind)
and `matched_rule_id` / `matched_rule_name` name the rule behind it (null for a tool-list
violation or a tool-level approval flag). **Every** outcome is added to the row's `events` as an
entry of type `would_block` / `would_need_approval` with `detail`, `rule_id`, `rule_name`, `at`
(when that policy was evaluated, not when the row was written) and `source`:

| `source` | Produced by |
|---|---|
| `guardrail` | a guardrail rule (hook and proxy) |
| `approval_rule` | a `require_approval` rule (hook) |
| `tool_acl` | the key's allowed / blocked tool lists (proxy; hook when the key opted in) |
| `tool_requires_approval` | a tool flagged `requires_approval` (proxy) |

The invocation drawer reads `source` from the first event matching the row's status to explain a
row with no rule ("Would have been blocked by this key's tool list" only for `tool_acl`; "Would
have been blocked by a guardrail" / "Would have needed approval" when there is no rule and no
such source).

Hook rows have the usual `received` and `decided` (`allow`) events around the `would_*` entries.
Proxy rows have no `received` / `decided` events (the proxy audit never wrote events); a
monitored proxy row's `events` holds only the `would_*` entries. `result_summary` stays what an
unmonitored call would record (the upstream result text on the proxy, `Hook allow` on the hook),
so the would-outcome is only in the status, the matched rule and the events.
`update_tool_result` leaves `would_*` statuses as they are (it only flips `approval_required`).
The shared helpers are in `services/mcp_monitor.py`.

**Policy evaluation is shared.** On the hook, `evaluate_hook_policies(..., first_only=)` in
`routers/mcp_hook.py` runs the opted-in tool-list check, the guardrail scan and then the
`require_approval` match and returns the hits. Enforce mode passes `first_only=True` (a guardrail deny returns before the approval
check, then creates or reuses the approval request and notifies, as before); monitor mode passes
`first_only=False` and records every hit. The helper itself creates nothing and sends nothing.
On the proxy the checks are interleaved with the rate limit and the approval lookups, so each
check branches on the mode in place rather than through one helper.

**Native hook.** Response is `{"decision": "allow"}` when nothing matched, otherwise:

```json
{"decision": "allow",
 "monitored": {"would": "deny" | "approval_required", "reason": "...", "source": "guardrail",
               "rule": {"id": 11, "name": "No emails"} | null,
               "outcomes": [{"would": "...", "reason": "...", "source": "...", "rule": {...} | null}]}}
```

`scripts/vw-tool-hook.sh` ignores the extra field (allow exits 0).

**MCP proxy.** `tools/list` is not filtered by the key's `allowed_tools` / `blocked_tools`
(the proxy does not scope tools by `allowed_server_ids` in either mode). `tools/call` evaluates
the tool lists, the tool's `requires_approval` flag and the guardrail scan, records them, then
forwards the call. The JSON-RPC result carries the same `monitored` object under
`result._meta["verifywise.ai/monitored"]` when something matched.

**Still enforced for a monitor key:** the per-key rate limit (both paths) and the circuit
breaker (proxy). They protect the gateway and upstream servers rather than express policy.
Anomaly detection is unchanged (warn-only). Enforce mode is unchanged, including the proxy
logging an ACL denial as `error`.

**Counts.** `would_*` rows never count as denied or as approvals. They are counted separately:
`GET /internal/mcp/audit/agent/{id}` returns `summary.would_block_count`,
`summary.would_need_approval_count`, and `by_tool[].would_block_count` /
`by_tool[].would_need_approval_count`; `GET /internal/mcp/runs` returns `would_block_count` and
`would_need_approval_count` per run. The Activity list's `result_status` filter accepts the new
values.

**UI.** Agent keys: a Mode select on create and a Change mode action per active key (switching
to monitor only asks for confirmation; the confirm button is disabled while the request runs), a
"Monitor only" chip and "Monitor only since <date> · by <name>". Activity: "Would block" / "Would
need approval" status chips and the same labels in the events timeline. Runs: "Would block" and
"Would need approval" columns. Agent activity drawer: a Would block card (would need approval in
its subtitle) and per-tool chips for both counts.

## MCP server registration and discovery

Servers are registered in the UI (Admin only) and stored in the gateway's MCP server table.
Registration is what feeds the proxy's tool catalog.

- **Auth config** (`auth_config`, migration `a0013`): `{}` for none, `{"token_enc"}` for bearer,
  `{"header", "key_enc"}` for API key (header defaults to `X-API-Key`). Secrets are AES-256-GCM
  encrypted via `utils/encryption.py`; `utils/mcp_credentials.py` handles encrypt, decrypt and the
  masked hint (shown to Admins only). A blank credential on edit keeps the stored one. Transport is
  Streamable HTTP; tools only (no resources or prompts).
- **OAuth and AWS IAM auth** (`auth_type` `oauth` / `aws_iam`, no migration; `auth_type` is
  `VARCHAR(20)`). Shapes: `oauth` is `{"client_id", "client_secret_enc", "token_url",
  "token_url_source": "manual"|"discovered", "scope"?, "resource"?, "auth_method":
  "client_secret_basic"|"client_secret_post"}`; `aws_iam` is `{"region", "access_key_id",
  "secret_access_key_enc", "resource"}` (resource defaults to `aws-mcp.amazonaws.com`).
  `services/mcp_token_service.py` gets the access token (OAuth client credentials, or boto3
  `signin.create_oauth2_token_with_iam` built only from the stored keys, never the default
  credential chain; no session tokens or AssumeRole) and sends it as a bearer token on discovery
  and `tools/call`. Tokens are cached per config until 60 s before expiry (`expires_in` missing
  means 3600; 60 s or less is used once, not cached) with one in-flight fetch per config.
  `services/mcp_oauth_discovery.py` backs `POST /mcp/servers/discover-oauth` (Admin): protected
  resource metadata (RFC 9728), then authorization server metadata (RFC 8414); the form fills the
  token URL from it and the Admin sees it before saving. Every outbound URL goes through
  `assert_safe_outbound_url`. A token failure raises `TokenError` (not a `ValueError`); the agent
  sees a generic -32603 "Internal error", the breaker is not charged, and the server's health and
  `last_discovery_error` are written only when the outcome changes. Messages never contain
  secrets. The authorization-code (Connect) flow is not built.
- **Outbound URL policy** (`utils/safe_outbound_url.py`, a port of `Servers/utils/safeOutboundUrl.ts`):
  http or https only, no embedded username or password, and cloud metadata (169.254.169.254) and
  `0.0.0.0` are refused. Private network addresses are allowed (on-prem).
- **Discovery** (`services/mcp_proxy_service.py`): `fetch_server_tools` (bounded, sends
  `notifications/initialized`, follows `nextCursor` up to 20 pages), `store_discovered_tools`,
  `run_discovery`. It runs on create, on an edit that changes the URL, auth type or credentials,
  and when a server is switched on, with a 10-second budget. The Discover tools button (Admin)
  reruns it with a 25-second budget. The server is always saved even if discovery fails.
- **Health** is the result of the last discovery. Failures are stored in `last_discovery_error`
  and shown on hover over "Unhealthy". There are no periodic health checks yet and unhealthy
  servers are not bypassed by the proxy.
- **Tool lifecycle:** tools a server no longer offers are deactivated on the next discovery;
  risk level and approval settings are kept and apply again if the tool returns.
- **Disabled servers:** proxy `tools/list` passes `active_servers_only=True`, so agents do not see
  tools of disabled servers, and calls to them are rejected. The admin MCP tools page still lists them (they are active tools of an inactive server). Tools deactivated by discovery are neither listed nor counted in `tool_count`.

## Not yet built (Phase 4+)

- **Path-based gating** — block/approve writes by *destination* (`~/.ssh`, `.env`, outside the
  repo). Genuinely new matching logic.
- **"Create rule from this"** on an Activity row, and Server/Decision columns on Activity
  (the recorded rule is there to build on; see *Per-agent rules and decision provenance*).
- An Agent Control overview/landing page; a priority rule engine; tamper-evident audit;
  metering MCP calls into the existing budgets; an LLM "summarize" for captured results.
- Adapters for terminal agents without a pre-tool hook (Codex CLI, Aider, Gemini CLI). The
  integration contract is documented (see the developer guide) so users can wire these
  themselves; no bundled adapter ships yet. Cursor and Claude Code work via
  `scripts/vw-tool-hook.sh`; Python agents (LangChain, CrewAI, Microsoft Agent Framework,
  plain Python) via the Python SDK (see *Adapters: Python SDK*).

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
agent (Claude Code + Cursor wiring), connect Python agents (the Python SDK), connect any agent
(the generic hook contract + MCP proxy + bring-your-own), governing tool calls, and an API reference. Keep that collection in sync when
the hook request/response shape, the `x-vw-agent-run-id` header, or the endpoints change.
