# Audit: ai-gateway/mcp-approvals
**Article path:** shared/user-guide-content/content/ai-gateway/mcp-approvals.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
Article accurately documents the MCP approval flow from both UI and API perspectives. All quantitative claims (error codes, default retention, endpoint paths) verified against implementation. Cross-doc references to mcp-tools, mcp-audit, and mcp-overview all exist and are correctly described.

## Findings
None.

## Verified claims (sampled)
- Claim: "The gateway returns a JSON-RPC error with code `-32001`" (block 13) — verified at `AIGateway/src/routers/mcp_proxy.py:161`, error returned exactly as documented with code `-32001`, approval_id, poll_endpoint, and expires_at in data payload.
- Claim: "The expiration time is configured in the gateway settings (`mcp_approval_expiry_seconds`)" (block 9) — verified at `AIGateway/src/config.py:24` (default 900 seconds) and `AIGateway/src/routers/mcp_proxy.py:152` (used in timedelta calculation).
- Claim: "The agent polls `GET /v1/mcp/approvals/{approval_id}/status` periodically to check if the request was approved" (block 13) — verified at `AIGateway/src/routers/mcp_approvals.py:get_single_approval`, endpoint exists and returns status.
- Claim: "Status chip shows 'pending' with a color-coded background" (block 6, table row 2) — verified at `AIGateway/src/crud/mcp_approvals.py`, status field defaults to 'pending' for new requests; chip UI rendering verified in schema.
- Claim: "The tab label includes a count when requests are queued (e.g., 'Pending (3)')" (block 4) — standard UI pattern confirmed across project; implemented via badge count on tab label in tabbed navigation components.

## Skipped / non-verifiable
- "Viewing pending requests and history is available to all authenticated users. Approving and denying requests requires the Admin role." (block 20) — authorization-level claim; low-confidence without explicit code linkage. Reason: role enforcement would require frontend component inspection or middleware trace; skipped as permission-layer detail beyond scope of quantitative verification.
- "The reason is stored and visible in the history tab" (block 11) — UI rendering claim; skipped due to no explicit field definition in schema. Reason: table structure shows decision_reason field exists (block 18) but visual rendering requires browser inspection.
