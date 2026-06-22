# Phase 2 — Human approval of native Bash calls (MCP Gateway hook)

> **Status:** Design approved 2026-06-15
> **Branch:** (to be created) `feat/mcp-hook-approval`
> **Predecessor:** Phase 1 (native Bash tool-call hook) — branch `feat/mcp-bash-hook`
> **Spec (Phase 1):** `docs/superpowers/specs/2026-06-15-mcp-bash-hook-design.md`

## Goal

Extend the Phase 1 Bash hook so a human can **approve or deny** a command before it
runs, reusing the MCP gateway's existing approval flow (poll endpoint, approve/deny
routes, notifications, history, frontend). A new guardrail rule type `require_approval`
triggers it.

## Scope (locked)

| Decision | Choice |
|---|---|
| Feature | Human approval of native Bash calls only |
| File-write gating | **Deferred to Phase 3** |
| Trigger | New `require_approval` **rule_type**, matched **regex/keyword on the command string** |
| Match containment | New module `mcp_approval_match.py`, imported **only** by `mcp_hook.py`. Shared `scan_text`/`scan_tool_input` UNCHANGED |
| Hook wait | Block & poll, ~2s interval, bounded by `VW_APPROVAL_WAIT` (default 120s) |
| Approval timeout/expiry | **Deny** via `VW_APPROVAL_FAIL_MODE` (default `closed`) — overrides general `VW_FAIL_MODE` |
| `tool_id` for native approvals | `ai_gateway_mcp_approval_requests.tool_id` made **nullable**; native approvals store NULL + `tool_name` |
| Rate-limit response | `{"decision":"rate_limited"}` → adapter applies `VW_FAIL_MODE` (infra, not policy) |
| Folded-in review items | Dedup `extract_agent_key`; rate-limit the hook endpoint |
| UI | Reuse existing MCP Approvals page — **no new UI** |

### Out of scope (Phase 2)

- File-write (Edit/Write) gating → Phase 3.
- Any change to the LLM proxy or MCP proxy guardrail paths.
- Approval of MCP-proxied tools (already exists, unchanged).

## Behavior model (adapter decision map)

Three classes of outcome, each with its own failure rule:

| Class | Decisions | On failure |
|---|---|---|
| **Policy** | `allow`, `deny`, `approval_required` | Deterministic — fail-mode independent |
| **Infra** | gateway-unreachable, `rate_limited` | `VW_FAIL_MODE` (default `open`) |
| **Approval timeout** | pending past `VW_APPROVAL_WAIT` or expiry | `VW_APPROVAL_FAIL_MODE` (default `closed` → deny) |

## Server flow (`mcp_hook.py`)

```
1. extract_agent_key(request)                     -> org_id, agent_key   (401 on bad)   [DEDUPED, shared]
2. enforce_mcp_rate_limits(agent_key, tool_name)  -> on exceed: audit "rate_limited",
                                                     return {"decision":"rate_limited"}  [REUSED]
3. scan_tool_input(org_id, tool_name, arguments)  -> ScanResult          (UNCHANGED)
   if blocked or any mask detection: audit "blocked", return deny        (Phase 1)
4. check_require_approval(org_id, tool_name, arguments)                   [NEW module]
   if match:
     args_hash = hash_arguments(arguments)
     if get_approved_request(...): fall through to allow   (reused decision, no re-prompt)
     else:
       approval = get_pending_request(...) or create_approval_request(org_id, {
           agent_key_id, tool_id=None, tool_name, arguments, arguments_hash, expires_at })
       if newly created: notify_approval_pending(...)                     [REUSED]
       audit "approval_required"
       return {"decision":"approval_required", "approval_id", "poll_endpoint", "expires_at"}
5. audit "success", return {"decision":"allow"}                          (Phase 1)
```

`check_require_approval` lives in **`AIGateway/src/routers/.../mcp_approval_match.py`** (new),
imported only by the hook. It queries `ai_gateway_mcp_guardrail_rules WHERE
rule_type='require_approval' AND is_active AND (applies_to_tools IS NULL OR :tool = ANY(...))`,
and matches each rule's `config` (`{type:"regex", pattern}` or `{type:"keyword", keywords:[]}`)
against the serialized command string. Regex matching carries the existing 50 000-char ReDoS
cap. Returns the first matching rule (or None).

## Data model / migration (Alembic)

One migration:
1. `ALTER TABLE ai_gateway_mcp_approval_requests ALTER COLUMN tool_id DROP NOT NULL`.
2. Add `require_approval` to the MCP guardrail `VALID_RULE_TYPES` set (`mcp_guardrails.py`
   CRUD validation) so admins can create such rules via the existing Guardrails UI.

**Verify-don't-assume (for the plan):** confirm `create_approval_request` accepts
`tool_id=None` without an INSERT/FK error after the `DROP NOT NULL`. The FK to
`ai_gateway_mcp_tools` must permit NULL (NULL FK values are not enforced, but confirm the
CRUD INSERT actually passes NULL through rather than omitting/defaulting the column).

## Adapter changes (`vw-bash-hook.sh`)

New `approval_required` branch on top of Phase 1's allow/deny:

```
approval_required:
  read approval_id, poll_endpoint from response
  deadline = now + VW_APPROVAL_WAIT          # default 120
  while now < deadline:
    GET $VW_GATEWAY_URL$poll_endpoint  (Bearer key, --max-time VW_TIMEOUT, HTTP-status check)
      approved → "Approved by <decider>" >&2 ; exit 0
      denied   → "Denied by VerifyWise: <reason>" >&2 ; exit 2
      pending / poll-unreachable → sleep 2 ; continue   (transient blip != decision)
  # deadline reached, still pending:
  apply VW_APPROVAL_FAIL_MODE (default closed) → exit 2   (open → exit 0, warn)

rate_limited:
  apply VW_FAIL_MODE (default open) → exit 0 (warn) | closed → exit 2
```

New env vars: `VW_APPROVAL_WAIT` (default 120), `VW_APPROVAL_FAIL_MODE` (default `closed`).
Existing `VW_FAIL_MODE` / `VW_TIMEOUT` unchanged. Each poll reuses the Phase 1 no-temp-file
HTTP-status capture.

## UI

No new UI. The existing MCP Approvals page (`Clients/.../AIGateway/MCPApprovals/`) is
tool-agnostic: it lists pending/history by `tool_name`, renders `arguments` JSON
(`{"command":"..."}` displays cleanly), and approve/deny posts to the existing routes. A
native-call approval appears there identically to an MCP-proxied one. `require_approval`
rules are authored in the existing MCP Guardrails page (new rule_type option).

## Testing

**E2E** (new `test_14_mcp_hook_approval.py`):
- `require_approval` regex rule (e.g. `rm -rf`) + agent key created.
- `rm -rf /tmp/x` → `approval_required` + `approval_id` + audit `approval_required`.
- Approve via API → re-POST same command → `allow` (reused arg-hash).
- Deny via API → poll status returns `denied`.
- Arg-hash scoping: approve command A; different command B → still `approval_required`.
- Clean command (no match) → `allow`.
- Rate-limit: exceed RPM → `rate_limited`.
- Approval row persists `tool_id IS NULL`.

**Adapter** (live):
- approval_required → approve in-flight → exit 0; deny in-flight → exit 2.
- Wait timeout, no decision: `VW_APPROVAL_FAIL_MODE=closed` → exit 2; `=open` → exit 0.
- `rate_limited`: `VW_FAIL_MODE` open → exit 0 / closed → exit 2.
- **Regression:** Phase 1 paths (allow / deny / fail-open / fail-closed / bad-key) still pass.

**Migration:** `tool_id` nullable applied; `require_approval` accepted by guardrails CRUD;
downgrade reverses both.

## Open questions

None blocking. Deferred: Phase 3 file-write gating; the shared `_cap_arguments` 10 KB
truncation (review item 6) remains untouched (shared with proxy).
