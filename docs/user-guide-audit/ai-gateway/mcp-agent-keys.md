# Audit: ai-gateway/mcp-agent-keys
**Article path:** shared/user-guide-content/content/ai-gateway/mcp-agent-keys.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
Article describes MCP agent key management interface and authentication. All core claims verified against React UI component and backend Python code. Four key statuses (Active, Revoked, Expired, Inactive), key prefix format (sk-mcp-), bearer token authentication, and POST /v1/mcp endpoint all match implementation.

## Findings
(None — all verifiable claims accurate)

## Verified claims (sampled)
- **Claim:** "Agent keys are prefixed with `sk-mcp-`" (block 4) — verified at `AIGateway/src/crud/mcp_agent_keys.py:10` where `plain_key = "sk-mcp-" + secrets.token_hex(16)`
- **Claim:** "Your agent includes the key in the `Authorization` header when connecting to `POST /v1/mcp`." (block 4) — verified at `AIGateway/src/routers/mcp_proxy.py:62` (`@router.post("/v1/mcp")`) and lines 51-54 showing Bearer token extraction from Authorization header
- **Claim:** Four key statuses: "Active", "Revoked", "Expired", "Inactive" (key-statuses block) — verified at `Clients/src/presentation/pages/AIGateway/MCPAgentKeys/index.tsx:162-167` in `getStatusLabel()` function that returns exactly these four values based on `revoked_at`, `expires_at`, and `is_active` fields
- **Claim:** "The main view lists all agent keys for your organization" — verified at `MCPAgentKeys/index.tsx:86` API call to `/ai-gateway/mcp/agent-keys` and lines 35-48 showing `AgentKey` interface with all documented fields (name, key_prefix, rate_limit_rpm, allowed_tools, blocked_tools, expires_at, revoked_at)
- **Claim:** "work as Bearer tokens" (block 4) — verified at `AIGateway/src/routers/mcp_proxy.py:51-54` where function checks for `"Bearer "` prefix in Authorization header

## Skipped / non-verifiable
- "This helps you do X" framings in EmptyState descriptions (blocks 190-197) — opinion/motivation only, not verifiable design claims
