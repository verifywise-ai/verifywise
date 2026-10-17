"""
Native tool-call hook endpoint — adjudicates a coding agent's own tool calls
(e.g. Claude Code's built-in Bash) WITHOUT forwarding or executing them.

    POST /v1/mcp/hook  -> {"decision": "allow" | "deny" | "approval_required" | "rate_limited", ...}

Authenticated via agent keys (sk-mcp-*). When the key opts in
(apply_tool_lists_to_hook), its allowed_tools / blocked_tools lists are checked
first (violation -> deny). The lists were written for MCP proxy tools, so a key
that has not opted in skips them here. Reuses the existing MCP guardrail scan,
audit log, rate limiter, and approval flow. MASK detections are treated as DENY.
require_approval rules (matched in the hook-only mcp_approval_match module) create
an approval request and tell the caller to poll. Rate-limit exceed is reported as
a distinct decision so the adapter can apply its infra fail-mode.

A monitor-only agent key (enforcement_mode = 'monitor') is always allowed (rate
limit aside); what would have happened is returned under "monitored" and
recorded as a would_block / would_need_approval audit row.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from config import settings
from crud.mcp_approvals import create_approval_request, get_active_request
from services.mcp_audit_service import log_tool_call, update_tool_result
from services.mcp_approval_match import check_require_approval
from services.mcp_guardrail_service import blocking_rule, scan_tool_input, scan_result_blob
from services.mcp_monitor import (
    SOURCE_APPROVAL_RULE,
    SOURCE_GUARDRAIL,
    SOURCE_TOOL_ACL,
    WOULD_BLOCK,
    WOULD_NEED_APPROVAL,
    is_monitor,
    monitored_payload,
    most_severe,
    outcome,
    outcome_events,
)
from services.mcp_proxy_service import extract_agent_key, enforce_mcp_rate_limits, tool_acl_violation
from utils.mcp_arguments import hash_arguments
from utils.notifications import notify_approval_pending

logger = logging.getLogger("uvicorn")

router = APIRouter()


@dataclass
class PolicyHit:
    """One policy that stops (or would stop) a native tool call."""

    kind: str  # "tool_acl" (key tool lists) | "deny" (guardrail block / mask) | "approval" (require_approval rule)
    reason: str
    rule_id: int | None = None
    rule_name: str | None = None
    detections: list = field(default_factory=list)  # deny only
    approval_rule: dict | None = None  # approval only
    audit_summary: str | None = None  # tool_acl only: names the key's lists

    def as_outcome(self) -> dict:
        """The monitor-mode record of this hit."""
        if self.kind == "tool_acl":
            return outcome(WOULD_BLOCK, self.reason, SOURCE_TOOL_ACL)
        if self.kind == "deny":
            return outcome(WOULD_BLOCK, self.reason, SOURCE_GUARDRAIL, self.rule_id, self.rule_name)
        return outcome(
            WOULD_NEED_APPROVAL,
            f"rule '{self.rule_name}' requires approval" if self.rule_name else "a rule requires approval",
            SOURCE_APPROVAL_RULE,
            self.rule_id,
            self.rule_name,
        )


def applies_tool_lists_to_hook(agent_key: dict) -> bool:
    """True when the key opted in to having its tool lists checked on native
    tool calls. A missing value (row read before migration a0015) means no."""
    return agent_key.get("apply_tool_lists_to_hook") is True


def _tool_acl_hit(agent_key: dict, tool_name: str) -> PolicyHit | None:
    """The key's allowed / blocked lists, when the key applies them to the hook."""
    if not applies_tool_lists_to_hook(agent_key) or not tool_acl_violation(agent_key, tool_name):
        return None
    allowed = agent_key.get("allowed_tools") or []
    blocked = agent_key.get("blocked_tools") or []
    lists = []
    if allowed:
        lists.append(f"allowed: {', '.join(map(str, allowed))}")
    if blocked:
        lists.append(f"blocked: {', '.join(map(str, blocked))}")
    return PolicyHit(
        kind="tool_acl",
        reason=f"Tool '{tool_name}' is not allowed for this agent key",
        audit_summary=f"tool not permitted by agent key ({'; '.join(lists)})",
    )


async def evaluate_hook_policies(
    org_id: int,
    tool_name: str,
    arguments: dict,
    *,
    agent_key: dict,
    first_only: bool,
) -> list[PolicyHit]:
    """Evaluate the key's tool lists (only when the key opted in), then the
    guardrails, then the require_approval rules, for one native tool call.
    Read-only: creates no approval request and sends nothing. The key's id
    scopes the guardrails and approval rules.

    first_only=True (enforce mode) returns as soon as a policy hits, so a
    tool-list or guardrail deny skips the later checks. first_only=False
    (monitor mode) evaluates all of them and returns every hit, in that order.
    """
    hits: list[PolicyHit] = []
    agent_key_id = agent_key["id"]

    acl_hit = _tool_acl_hit(agent_key, tool_name)
    if acl_hit:
        hits.append(acl_hit)
        if first_only:
            return hits

    # field_aware: native file-write tools are scanned only on written content
    # (Write.content, Edit.new_string, ...), not old_string/file_path. This applies
    # to PII, content-filter AND prompt-injection on the hook path — injection in a
    # removed line or a path is intentionally not scanned (we gate what is written).
    scan_result = await scan_tool_input(
        org_id, tool_name, arguments, field_aware=True, agent_key_id=agent_key_id
    )
    # A mask rule can't rewrite a command/file the agent itself executes, so on the
    # hook path a mask detection is escalated to a hard deny. An org that configured
    # a PII rule as action="mask" (fine on the LLM proxy) therefore BLOCKS matching
    # native tool calls rather than masking them — intentional, surfaced in the reason.
    mask_hit = any(getattr(d, "action", None) == "mask" for d in scan_result.detections)
    if scan_result.blocked or mask_hit:
        reason = scan_result.block_reason
        if not reason and mask_hit:
            reason = "mask rule matched (masking not supported for native tool calls)"
        # Record the rule that caused the deny (a mask hit counts here, since the
        # hook escalates it) so the Activity log can show why the call stopped.
        rule_id, rule_name = blocking_rule(scan_result, include_mask=True)
        hits.append(PolicyHit(
            kind="deny",
            reason=reason or "policy violation",
            rule_id=rule_id,
            rule_name=rule_name,
            detections=[
                {"rule": d.guardrail_type, "action": d.action, "snippet": d.entity_type}
                for d in scan_result.detections
            ],
        ))
        if first_only:
            return hits

    approval_rule = await check_require_approval(
        org_id, tool_name, arguments, agent_key_id=agent_key_id
    )
    if approval_rule:
        hits.append(PolicyHit(
            kind="approval",
            reason="",
            rule_id=approval_rule.get("id"),
            rule_name=approval_rule.get("name"),
            approval_rule=approval_rule,
        ))
    return hits


async def _json_object(request: Request) -> dict:
    """The request body, which must be a JSON object (400 otherwise)."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")
    return body


def _require_optional_strings(**fields) -> None:
    """400 unless each field is either absent (None) or a string."""
    for name, value in fields.items():
        if value is not None and not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"{name} must be a string")


@router.post("/v1/mcp/hook")
async def mcp_hook(request: Request):
    """Adjudicate a native tool call. Never forwards or executes it."""
    agent_key = await extract_agent_key(request)
    org_id = agent_key["organization_id"]

    body = await _json_object(request)

    tool_name = body.get("tool_name")
    arguments = body.get("arguments")
    if arguments is None:
        arguments = {}
    session_id = body.get("session_id")
    tool_use_id = body.get("tool_use_id")

    if not isinstance(tool_name, str) or not tool_name or not isinstance(arguments, dict):
        raise HTTPException(status_code=400, detail="tool_name (str) and arguments (object) are required")
    _require_optional_strings(session_id=session_id, tool_use_id=tool_use_id)

    start_time = time.time()
    received_at = datetime.now(timezone.utc).isoformat()

    async def _audit(
        status: str,
        summary: str,
        decided_detail: str,
        is_error: bool = False,
        matched_rule_id: int | None = None,
        matched_rule_name: str | None = None,
        extra_events: list | None = None,
    ):
        events = [
            {"type": "received", "at": received_at},
            *(extra_events or []),
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
            matched_rule_id=matched_rule_id,
            matched_rule_name=matched_rule_name,
        )

    if is_monitor(agent_key):
        return await _monitor_hook(agent_key, org_id, tool_name, arguments, _audit)

    # ── Policy: tool lists (opted-in keys only), guardrail (block / mask ->
    #    deny), then require_approval ──────────────────────────────────────────
    # Policy (block / mask / require_approval) is evaluated BEFORE the rate
    # limit so a rate-limited agent cannot burst past its cap to get a
    # policy-violating command allowed (rate_limited fails open by default).
    # Enforce mode stops at the first hit, exactly as before.
    hits = await evaluate_hook_policies(org_id, tool_name, arguments, agent_key=agent_key, first_only=True)
    hit = hits[0] if hits else None
    if hit and hit.kind == "tool_acl":
        await _audit("blocked", f"Hook deny: {hit.audit_summary}", "deny")
        return JSONResponse(content={"decision": "deny", "reason": hit.reason})
    if hit and hit.kind == "deny":
        await _audit(
            "blocked",
            f"Hook deny: {hit.reason}",
            "deny",
            matched_rule_id=hit.rule_id,
            matched_rule_name=hit.rule_name,
        )
        return JSONResponse(content={"decision": "deny", "reason": hit.reason, "detections": hit.detections})

    # ── require_approval (hook-only matcher): create/reuse approval request ──
    approval_rule = hit.approval_rule if hit else None
    human_approved = False
    if approval_rule:
        args_hash = hash_arguments(arguments)
        # One query returns the latest non-expired approved-or-pending request.
        # native=True: only match native-hook approvals (tool_id IS NULL), never a
        # proxy approval for an upstream tool that happens to share this name+args.
        active = await get_active_request(org_id, agent_key["id"], tool_name, args_hash, native=True)

        if active and active["status"] == "approved":
            # Already approved for this exact call. Fall through to allow and skip
            # the rate limiter: a human said yes, so rate-limiting must not flip an
            # approved command to rate_limited and silently waste the approval.
            human_approved = True
        else:
            if active:  # an existing pending request — reuse it, don't re-notify
                approval = active
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
            await _audit(
                "approval_required",
                f"Approval request {approval.get('id')} created",
                "approval_required",
                matched_rule_id=approval_rule.get("id"),
                matched_rule_name=approval_rule.get("name"),
            )
            exp = approval.get("expires_at")
            return JSONResponse(content={
                "decision": "approval_required",
                "approval_id": approval.get("id"),
                "poll_endpoint": f"/v1/mcp/approvals/{approval.get('id')}/status",
                "expires_at": exp.isoformat() if hasattr(exp, "isoformat") else str(exp),
            })

    # ── Rate limit (infra, not policy) ──────────────────────────────────────
    # Checked last: only a call that already passed every policy gate can be
    # reported as rate_limited, so the adapter's fail-open on rate_limited can
    # never release a command that a guardrail or approval rule would stop.
    # Skipped for a human-approved re-call so an approval is never wasted.
    if not human_approved:
        try:
            await enforce_mcp_rate_limits(agent_key, tool_name)
        except HTTPException as e:
            if e.status_code == 429:
                await _audit("rate_limited", "Hook rate limited", "rate_limited")
                return JSONResponse(content={"decision": "rate_limited", "reason": "rate limit exceeded"})
            # Any other error while adjudicating must not escape to a 500 (the
            # adapter treats a non-200 as fail-open and would run the command).
            # Audit and deny instead.
            await _audit("error", f"Hook error during rate-limit check: {e.detail}", "error", is_error=True)
            return JSONResponse(content={"decision": "deny", "reason": "internal error during adjudication"})

    await _audit("success", "Hook allow", "allow")
    return JSONResponse(content={"decision": "allow"})


async def _monitor_hook(agent_key: dict, org_id: int, tool_name: str, arguments: dict, _audit):
    """Monitor-only key: evaluate every policy, never deny or pause the call.

    The key's tool lists (when it opted in with apply_tool_lists_to_hook), the
    guardrail scan and the require_approval match all run (in enforce mode the
    first hit returns before the later checks). No approval request is
    created, reused or notified. The rate limit is still enforced: it protects
    the gateway rather than expressing policy.
    """
    hits = await evaluate_hook_policies(org_id, tool_name, arguments, agent_key=agent_key, first_only=False)
    outcomes = [h.as_outcome() for h in hits]

    events = outcome_events(outcomes)

    try:
        await enforce_mcp_rate_limits(agent_key, tool_name)
    except HTTPException as e:
        if e.status_code == 429:
            await _audit("rate_limited", "Hook rate limited", "rate_limited", extra_events=events)
            return JSONResponse(content={"decision": "rate_limited", "reason": "rate limit exceeded"})
        await _audit(
            "error", f"Hook error during rate-limit check: {e.detail}", "error",
            is_error=True, extra_events=events,
        )
        return JSONResponse(content={"decision": "deny", "reason": "internal error during adjudication"})

    if not outcomes:
        await _audit("success", "Hook allow", "allow")
        return JSONResponse(content={"decision": "allow"})

    chosen = most_severe(outcomes)
    # Same summary as a normal allow; the would-outcomes live in the status,
    # the matched rule and the events timeline.
    await _audit(
        chosen["status"],
        "Hook allow",
        "allow",
        matched_rule_id=chosen["rule_id"],
        matched_rule_name=chosen["rule_name"],
        extra_events=events,
    )
    return JSONResponse(content={"decision": "allow", "monitored": monitored_payload(outcomes)})


MCP_RESULT_CAP_BYTES = getattr(settings, "mcp_result_cap_bytes", 10240)


@router.post("/v1/mcp/hook/result")
async def mcp_hook_result(request: Request):
    """Receive a PostToolUse result and attach it to the existing audit row.
    Never executes anything. Best-effort: returns 200 even when no row matches."""
    agent_key = await extract_agent_key(request)
    org_id = agent_key["organization_id"]
    body = await _json_object(request)

    session_id = body.get("session_id")
    tool_use_id = body.get("tool_use_id")
    tool_name = body.get("tool_name")
    tool_response = body.get("tool_response")
    if not isinstance(session_id, str) or not session_id or not isinstance(tool_use_id, str) or not tool_use_id:
        raise HTTPException(status_code=400, detail="session_id and tool_use_id (str) are required")
    if tool_name is None:
        tool_name = "unknown"
    elif not isinstance(tool_name, str) or not tool_name:
        raise HTTPException(status_code=400, detail="tool_name must be a non-empty string")

    serialized = json.dumps(tool_response) if tool_response is not None else "{}"
    truncated = len(serialized.encode("utf-8")) > MCP_RESULT_CAP_BYTES
    if truncated:
        serialized = serialized.encode("utf-8")[:MCP_RESULT_CAP_BYTES].decode("utf-8", "ignore")
    masked = await scan_result_blob(org_id, serialized, agent_key_id=agent_key["id"])
    try:
        stored = json.loads(masked)
    except Exception:
        logger.warning("scan_result_blob produced non-JSON result; storing as _raw")
        stored = {"_raw": masked}

    now = datetime.now(timezone.utc).isoformat()
    # {"error": ...} is how the SDKs (and any other client) report a failed
    # call, so it counts as failed whatever the tool. A null error is not one.
    reported_error = isinstance(tool_response, dict) and tool_response.get("error") is not None
    if reported_error:
        outcome = {"type": "failed", "at": now}
    elif tool_name == "Bash" and isinstance(tool_response, dict) and tool_response.get("interrupted"):
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
    if status == "error":
        raise HTTPException(status_code=500, detail="failed to store tool result")
    return JSONResponse(content={"status": status})
