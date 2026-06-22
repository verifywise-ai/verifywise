#!/usr/bin/env bash
# VerifyWise tool gate — Claude Code PreToolUse/PostToolUse hook.
# PreToolUse: reads the tool call as JSON on stdin, asks the AI Gateway to
# adjudicate, and exits 0 (allow) or non-zero (deny). Fails open by default
# so a gateway outage never halts your workflow.
# PostToolUse: captures the tool result and forwards it to the gateway
# best-effort; always exits 0 — result capture must never block.
#
# Env:
#   VW_GATEWAY_URL  (required)  e.g. http://localhost:8100
#   VW_AGENT_KEY    (required)  sk-mcp-...
#   VW_FAIL_MODE          (optional)  open | closed   (default: open)
#   VW_TIMEOUT            (optional)  seconds          (default: 3)
#   VW_APPROVAL_WAIT      (optional)  max seconds to block on human approval (default: 120)
#   VW_APPROVAL_FAIL_MODE (optional)  open | closed, on approval timeout (default: closed)
set -uo pipefail

FAIL_MODE="${VW_FAIL_MODE:-open}"
TIMEOUT="${VW_TIMEOUT:-3}"
APPROVAL_WAIT="${VW_APPROVAL_WAIT:-120}"
APPROVAL_FAIL_MODE="${VW_APPROVAL_FAIL_MODE:-closed}"

fail() {  # $1 = stderr message
  echo "vw-tool-hook: $1" >&2
  if [ "$FAIL_MODE" = "closed" ]; then exit 2; fi
  exit 0   # fail-open
}

[ -n "${VW_GATEWAY_URL:-}" ] || fail "VW_GATEWAY_URL not set"
[ -n "${VW_AGENT_KEY:-}" ]   || fail "VW_AGENT_KEY not set"
command -v jq   >/dev/null 2>&1 || fail "jq not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // .tool.name // "unknown"')"
arguments="$(printf '%s' "$input" | jq -c '.tool_input // .arguments // {}')"
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
tool_use_id="$(printf '%s' "$input" | jq -r '.tool_use_id // empty')"
hook_event="$(printf '%s' "$input" | jq -r '.hook_event_name // "PreToolUse"')"

# PostToolUse: capture the tool result, best-effort. Never blocks — the tool
# has already run, so any failure here must still exit 0.
if [ "$hook_event" = "PostToolUse" ]; then
  tool_response="$(printf '%s' "$input" | jq -c '.tool_response // {}')"
  rpayload="$(jq -nc --arg t "$tool_name" --argjson r "$tool_response" \
    --arg s "$session_id" --arg u "$tool_use_id" \
    '{tool_name:$t, tool_response:$r, session_id:$s, tool_use_id:$u}')"
  curl -s --max-time "$TIMEOUT" -o /dev/null \
    -X POST "$VW_GATEWAY_URL/v1/mcp/hook/result" \
    -H "Authorization: Bearer $VW_AGENT_KEY" \
    -H "Content-Type: application/json" \
    -d "$rpayload" 2>/dev/null || true
  exit 0
fi

payload="$(jq -nc --arg t "$tool_name" --argjson a "$arguments" \
  --arg s "$session_id" --arg u "$tool_use_id" \
  '{tool_name:$t, arguments:$a, session_id:$s, tool_use_id:$u}')"

# Append the HTTP status on its own trailing line so we never write a
# response file to a predictable /tmp path (symlink-attack surface).
raw="$(curl -s -w '\n%{http_code}' --max-time "$TIMEOUT" \
  -X POST "$VW_GATEWAY_URL/v1/mcp/hook" \
  -H "Authorization: Bearer $VW_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d "$payload")" || fail "gateway unreachable"

http_code="${raw##*$'\n'}"   # last line
resp="${raw%$'\n'*}"         # everything before it

[ "$http_code" = "200" ] || fail "gateway returned HTTP $http_code"
[ -n "$resp" ] || fail "empty gateway response"

decision="$(printf '%s' "$resp" | jq -r '.decision // "error"')"
case "$decision" in
  allow) exit 0 ;;
  deny)
    reason="$(printf '%s' "$resp" | jq -r '.reason // "policy violation"')"
    echo "Blocked by VerifyWise: $reason" >&2
    exit 2 ;;
  rate_limited)
    # Infra outcome, not policy. Follow the general fail-mode.
    echo "vw-tool-hook: rate limited" >&2
    if [ "$FAIL_MODE" = "closed" ]; then exit 2; fi
    exit 0 ;;
  approval_required)
    approval_id="$(printf '%s' "$resp" | jq -r '.approval_id // empty')"
    poll_endpoint="$(printf '%s' "$resp" | jq -r '.poll_endpoint // empty')"
    # A malformed approval_required response (no id/endpoint) is unrecoverable,
    # fail fast on the infra fail-mode rather than polling a bad URL for the
    # full APPROVAL_WAIT.
    if [ -z "$approval_id" ] || [ -z "$poll_endpoint" ]; then
      fail "approval_required response missing approval_id/poll_endpoint"
    fi
    echo "vw-tool-hook: awaiting human approval (id=$approval_id, up to ${APPROVAL_WAIT}s)" >&2
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
        expired)
          # Server-side expiry: no human can decide it now, so stop waiting and
          # apply the approval fail-mode instead of polling to our own deadline.
          echo "vw-tool-hook: approval request expired" >&2
          if [ "$APPROVAL_FAIL_MODE" = "open" ]; then exit 0; fi
          exit 2 ;;
        *) sleep 2 ;;
      esac
    done
    # No decision in time. Approval-specific fail mode (default closed = deny).
    echo "vw-tool-hook: approval timed out" >&2
    if [ "$APPROVAL_FAIL_MODE" = "open" ]; then exit 0; fi
    exit 2 ;;
  *) fail "unexpected gateway response: $resp" ;;
esac
