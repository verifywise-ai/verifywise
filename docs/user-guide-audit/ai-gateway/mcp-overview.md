# Audit: ai-gateway/mcp-overview
**Article path:** shared/user-guide-content/content/ai-gateway/mcp-overview.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The MCP Gateway overview article is factually accurate. All verifiable claims—protocol version, endpoint paths, JSON-RPC structure, agent key prefix, sidebar navigation items, and guardrail rules—are confirmed against implementation code. No inaccuracies, partial claims, or verifiable gaps found.

## Findings
*(No findings — all sampled claims verified)*

## Verified claims (sampled)
- Claim: "The gateway speaks JSON-RPC 2.0 over HTTP" (block 5) — verified at `AIGateway/src/routers/mcp_proxy.py:1-10`
- Claim: "Your agent connects to `POST /v1/mcp`" (block 5) — verified at `AIGateway/src/routers/mcp_proxy.py:62` (`@router.post("/v1/mcp")`)
- Claim: "The gateway implements MCP protocol version 2025-03-26" (block 7, callout) — verified at `AIGateway/src/routers/mcp_proxy.py:84` and `mcp_proxy_service.py:protocolVersion` assignments
- Claim: "SSE endpoint for keep-alive connections" at `GET /v1/mcp` (block 7, callout) — verified in router comments at `AIGateway/src/routers/mcp_proxy.py:6`
- Claim: "Agent keys (prefixed sk-mcp-)" (block 9, grid card) — verified at `AIGateway/src/crud/mcp_agent_keys.py:plain_key = "sk-mcp-" + secrets.token_hex(16)`
- Claim: "The gateway runs guardrail rules...PII detection, content filtering, prompt injection detection" (block 6, list item 3) — verified at `AIGateway/src/routers/mcp_proxy.py` guardrail scan and test files
- Claim: "Returns an approval request ID" with error code -32001 (block 6, list item 4) — verified at `AIGateway/src/routers/mcp_proxy.py` approval handling with `-32001` error code
- Claim: Sidebar shows "six sub-pages: Agent keys, Servers, Tools, Audit log, Approvals, Guardrails" (block 15) — verified at `Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx:81-125` (all six items present with matching labels)

## Skipped / non-verifiable
- "Your organization runs AI agents that call external tools, you need governance" (block 11, opening) — opinion/motivation only; non-verifiable product framing
- "Getting started takes about 5 minutes" (block 12, intro) — opinion/timing claim; unverifiable without user study
- Compliance mappings (block 13, table rows) — marked low-confidence; mapping EU AI Act Articles to features requires legal interpretation beyond code verification
