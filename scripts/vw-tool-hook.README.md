# VerifyWise tool gate (Claude Code hook)

Gates Claude Code's built-in tools (**Bash**, plus file writes via **Edit**,
**Write**, **MultiEdit** and **NotebookEdit**) through the VerifyWise AI Gateway. Before a tool
runs, the gateway scans the call against your org's MCP guardrail rules and the
call is allowed or denied. For Bash it scans the command; for file writes it
scans the content being written (not the path or the text being removed). Every
call is recorded in the MCP Audit Log. When the PostToolUse hook is also
configured (below), the gateway records each tool's result and a per-invocation
events timeline, viewable in the Activity drawer.

## Setup

1. Mint an agent key: VerifyWise, AI Gateway, MCP Gateway, **Agent Keys**,
   create. Copy the `sk-mcp-...` value (shown once).
2. Add the guardrail rules you want enforced under MCP Gateway, **Guardrails**.
3. Set env vars (e.g. in your shell profile):

   ```bash
   export VW_GATEWAY_URL=http://localhost:8100   # your gateway URL
   export VW_AGENT_KEY=sk-mcp-...
   # optional:
   export VW_FAIL_MODE=open   # open (default) | closed
   export VW_TIMEOUT=3        # seconds
   export VW_APPROVAL_WAIT=120         # max seconds to block on human approval
   export VW_APPROVAL_FAIL_MODE=closed # closed (default) | open, on approval timeout
   ```

4. Wire the hook in `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
           "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }
       ],
       "PostToolUse": [
         { "matcher": "Bash|Edit|Write",
           "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }
       ]
     }
   }
   ```

   The PostToolUse matcher uses `Bash|Edit|Write` because `MultiEdit` and
   `NotebookEdit` are not confirmed as PostToolUse-matchable tools in the Claude
   Code docs — test before adding them to the PostToolUse matcher.

   Result capture is best-effort: if the gateway is unreachable the tool still
   runs and the invocation simply shows "no result captured". It never blocks.

## Behavior

| Situation | Result |
|---|---|
| Bash command passes guardrails | runs (exit 0) |
| File-write content passes guardrails | runs (exit 0) |
| Guardrail blocks (or a mask rule matches) | blocked (exit 2), reason shown to the agent |
| Call matches a require-approval rule | hook blocks up to `VW_APPROVAL_WAIT`; approved runs, denied blocks |
| Approval not decided in time | `VW_APPROVAL_FAIL_MODE=closed` (default) blocks; `open` runs |
| Gateway rate-limits the call | `VW_FAIL_MODE=open` (default) runs; `closed` blocks |
| Gateway unreachable / timeout | `VW_FAIL_MODE=open` runs; `closed` blocks |
| PostToolUse result capture | best-effort; tool already ran, result POSTed to the gateway, never blocks |

File-write tools (Write, Edit, MultiEdit, NotebookEdit) are gated on the content being written.
A guardrail or approval rule that matches that content blocks or pauses the write;
deleting content (an `old_string`) and the file path are not scanned.

Requires `curl` and `jq` on PATH.
