"""
Native tool-call hook endpoint — adjudicates a coding agent's own tool calls
(e.g. Claude Code's built-in Bash) WITHOUT forwarding or executing them.

    POST /v1/mcp/hook  -> {"decision": "allow" | "deny" | "approval_required" | "rate_limited", ...}

Authenticated via agent keys (sk-mcp-*). Reuses the existing MCP guardrail scan,
audit log, rate limiter, and approval flow. MASK detections are treated as DENY.
require_approval rules (matched in the hook-only mcp_approval_match module) create
an approval request and tell the caller to poll. Rate-limit exceed is reported as
a distinct decision so the adapter can apply its infra fail-mode.
"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from config import settings
from crud.mcp_approvals import create_approval_request, get_active_request
from services.mcp_audit_service import log_tool_call, update_tool_result
from services.mcp_approval_match import check_require_approval
from services.mcp_guardrail_service import scan_tool_input, scan_result_blob
from services.mcp_proxy_service import extract_agent_key, enforce_mcp_rate_limits
from utils.mcp_arguments import hash_arguments
from utils.notifications import notify_approval_pending

logger = logging.getLogger("uvicorn")

router = APIRouter()


@router.post("/v1/mcp/hook")
async def mcp_hook(request: Request):
    """Adjudicate a native tool call. Never forwards or executes it."""
    agent_key = await extract_agent_key(request)
    org_id = agent_key["organization_id"]

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

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

    # ── Guardrail scan (UNCHANGED shared path): block / mask -> deny ─────────
    # Policy (block / mask / require_approval) is evaluated BEFORE the rate
    # limit so a rate-limited agent cannot burst past its cap to get a
    # policy-violating command allowed (rate_limited fails open by default).
    # field_aware: native file-write tools are scanned only on written content
    # (Write.content, Edit.new_string, ...), not old_string/file_path. This applies
    # to PII, content-filter AND prompt-injection on the hook path — injection in a
    # removed line or a path is intentionally not scanned (we gate what is written).
    scan_result = await scan_tool_input(org_id, tool_name, arguments, field_aware=True)
    # A mask rule can't rewrite a command/file the agent itself executes, so on the
    # hook path a mask detection is escalated to a hard deny. An org that configured
    # a PII rule as action="mask" (fine on the LLM proxy) therefore BLOCKS matching
    # native tool calls rather than masking them — intentional, surfaced in the reason.
    mask_hit = any(getattr(d, "action", None) == "mask" for d in scan_result.detections)
    if scan_result.blocked or mask_hit:
        reason = scan_result.block_reason
        if not reason and mask_hit:
            reason = "mask rule matched (masking not supported for native tool calls)"
        reason = reason or "policy violation"
        detections = [
            {"rule": d.guardrail_type, "action": d.action, "snippet": d.entity_type}
            for d in scan_result.detections
        ]
        await _audit("blocked", f"Hook deny: {reason}", "deny")
        return JSONResponse(content={"decision": "deny", "reason": reason, "detections": detections})

    # ── require_approval (hook-only matcher): create/reuse approval request ──
    approval_rule = await check_require_approval(org_id, tool_name, arguments)
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
            await _audit("approval_required", f"Approval request {approval.get('id')} created", "approval_required")
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

    serialized = json.dumps(tool_response) if tool_response is not None else "{}"
    truncated = len(serialized.encode("utf-8")) > MCP_RESULT_CAP_BYTES
    if truncated:
        serialized = serialized.encode("utf-8")[:MCP_RESULT_CAP_BYTES].decode("utf-8", "ignore")
    masked = await scan_result_blob(org_id, serialized)
    try:
        stored = json.loads(masked)
    except Exception:
        logger.warning("scan_result_blob produced non-JSON result; storing as _raw")
        stored = {"_raw": masked}

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
    if status == "error":
        raise HTTPException(status_code=500, detail="failed to store tool result")
    return JSONResponse(content={"status": status})
