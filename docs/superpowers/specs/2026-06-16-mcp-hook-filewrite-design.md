# Phase 3 — Field-aware file-write gating

> **Status:** Design approved 2026-06-16 (revised after spec pushback)
> **Branch:** `feat/mcp-hook-filewrite` off `feat/mcp-hook-approval` (Phase 2)
> **Predecessors:** Phase 1 (`feat/mcp-bash-hook`), Phase 2 (`feat/mcp-hook-approval`) — both unmerged

## Goal

Gate a coding agent's file-write tools (Write, Edit, MultiEdit, NotebookEdit) through the
existing hook, scanning **only the content being written** for PII, secrets, prohibited
content and approval-triggering patterns.

## Why this is a real feature (not just config)

The first draft framed Phase 3 as "thin enablement" because the gateway already serializes
all tool args. Pushback found that framing wrong. The generic serializer scans **every**
argument value, which for file edits over-matches:

- `Edit.old_string` (text being **removed**) gets scanned, so an agent **deleting** a line
  that contains an email could be blocked from deleting it. Backwards.
- `file_path` gets scanned, so a path like `/home/me@evil.com/notes` false-positives a PII rule.
- `MultiEdit.edits[].old_string` has the same delete-is-blocked problem.

Gating file writes correctly means scanning **what is written**, not what is removed or
where it goes. That requires gateway logic: field-aware content extraction. So Phase 3 adds
real logic, scoped tightly.

## The mechanism: a content-extraction helper

New `AIGateway/src/utils/mcp_tool_content.py`:

```
extract_scannable_content(tool_name: str, arguments: dict) -> dict
```

Returns the subset of `arguments` that represents **written content**, per a hardcoded map:

| Tool | Scannable fields |
|---|---|
| `Write` | `content` |
| `Edit` | `new_string` |
| `MultiEdit` | `new_strings` = list of each `edits[].new_string` |
| `NotebookEdit` | `new_source` |
| **anything else** (Bash, MCP-proxied, unknown) | **full `arguments`, unchanged** |

The unknown-tool fallback is deliberate: over-scan (preserve Phase 1/2 behavior) rather than
under-scan. A new write-like tool stays gated on everything until a field mapping is added,
so there is no silent security gap.

The map is hardcoded (a module constant). No new config, table or UI — YAGNI; it covers
Claude Code's file tools and is a one-line edit to extend.

## Where it plugs in

Both scanners independently serialize args today; both call the helper first:

1. `services/mcp_guardrail_service.py::scan_tool_input` — extract, then serialize the
   extracted dict (its existing loop is unchanged; it just receives the extracted subset).
2. `services/mcp_approval_match.py::_serialize` — same: extract, then serialize.

This is the only behavioral change. Block / mask / require_approval / rate-limit / audit
flow are all untouched.

## Critical separation: scan the content, identify/audit the whole call

The extracted subset is used **only for scanning**. Everything else uses the **full**
`arguments`:

- **Audit** (`log_tool_call`) logs the full `arguments` — the complete record of what was
  written, including the path. (`mcp_hook.py` already passes full `arguments` to audit; no change.)
- **`hash_arguments`** (approval arg-scoping) hashes the full `arguments` — so approving a
  write of content X to `/tmp/a` does **not** authorize the same content to `/tmp/b`. The
  path is part of the call's identity even though it is not scanned for content. (No change;
  `mcp_hook.py` already hashes full args.)

Subtle but load-bearing: **scan what is written; identify and audit the whole call.**

## Scope (locked)

| Decision | Choice |
|---|---|
| Tools gated | Write, Edit, MultiEdit, NotebookEdit (field-aware) + Bash + MCP (unchanged) |
| What is scanned | Written content only for file tools; full args for everything else |
| Unknown tools | Fall back to full-args scan (over-scan, no gap) |
| Field map | Hardcoded constant in `mcp_tool_content.py` |
| Audit + arg-hash | Use **full** args (unchanged) |
| Adapter | Rename `vw-bash-hook.sh` → `vw-tool-hook.sh`; matcher `Bash\|Edit\|Write\|MultiEdit`; clean rename, no shim |
| Path-based gating | **Out of scope** → Phase 4 |
| Migration / UI | None |

## Files

- **Create:** `AIGateway/src/utils/mcp_tool_content.py` — `extract_scannable_content` + the field map.
- **Modify:** `AIGateway/src/services/mcp_guardrail_service.py` — call the helper in `scan_tool_input`.
- **Modify:** `AIGateway/src/services/mcp_approval_match.py` — call the helper in `_serialize`.
- **Rename:** `scripts/vw-bash-hook.sh` → `scripts/vw-tool-hook.sh` (`git mv`, header comment "tool gate"); README likewise, with the multi-matcher config.
- **Create:** `AIGateway/tests/test_15_mcp_hook_filewrite.py`.

`mcp_hook.py` does **not** change (it already passes full args to scan/approval/audit; the
field-awareness lives inside the scanners via the helper).

## Testing

New `AIGateway/tests/test_15_mcp_hook_filewrite.py`, live-HTTP style:

**The killer test (proves field-awareness, the whole reason this is a phase):**
- PII rule (EMAIL_ADDRESS). `Edit` with `old_string:"contact me@evil.com"`, `new_string:"contact removed"`
  → **allow** (you can delete PII). Same call but `new_string:"contact me@evil.com"`, `old_string:"x"`
  → **deny**.

**Coverage:**
- `Write` + PII in `content` → deny; `Write` clean content → allow.
- `MultiEdit` with PII in an `edits[].new_string` → deny; PII only in an `edits[].old_string` → allow.
- `file_path` containing an email-like string but clean content → allow (path not scanned).
- `require_approval` regex rule (e.g. `BEGIN [A-Z ]*PRIVATE KEY`) + a `Write` whose content
  matches → approval_required.
- `applies_to_tools:["Write"]` rule fires on a Write but not on a Bash call with the same content.
- **Audit check:** after a denied `Write`, the audit row's `arguments` still contains the
  full call (path + content), not just the scanned subset.
- **Regression:** Phase 1 (`test_13`, Bash) and Phase 2 (`test_14`, approval) suites still pass —
  proves the helper's full-args fallback preserves Bash behavior exactly.

## Adapter rename verification

After `git mv`, run the Phase 1/2 live adapter checks against a `Write`-shaped stdin payload
(`{"tool_name":"Write","tool_input":{"content":"..."}}`): allow / deny / fail-open /
fail-closed / approval-poll all still behave.

## Merge ordering

Stacks on Phase 2. Train: **Phase 1 → Phase 2 → Phase 3 → rename**. The adapter file is
created by Phase 1 and renamed here (`git mv` preserves history). `mcp_guardrail_service.py`
and `mcp_approval_match.py` are touched by Phase 2 and again here — reconcile at merge.

## Open questions

None blocking. Deferred to Phase 4: path-based gating (block/approve by write destination,
e.g. `~/.ssh`, `.env`, outside the repo) — genuinely new matching logic.
