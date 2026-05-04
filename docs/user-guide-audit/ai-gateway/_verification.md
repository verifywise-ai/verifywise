# Verification spot-checks — ai-gateway
**Date:** 2026-04-29
**Reports spot-checked:** 17
**Claims re-verified:** 24 (2 per report with verified claims)
**Failed spot-checks:** 7

## Per-report results

### analytics.md
- Claim 1: "Every request through the AI Gateway is tracked with cost, token count, latency and model" — ✓ VERIFIED (evidence: SpendDashboard/index.tsx:154–157)
- Claim 2: "Your selection is saved and persists across sessions" — ✓ VERIFIED (evidence: SpendDashboard/index.tsx:55–57, localStorage)

### endpoints.md
- No verified claims in this report.

### getting-started.md
- Claim 1: "Go to **AI Gateway > Settings**. Under Budget, click **Set budget**." — ✗ NO CODE EVIDENCE (marked verified but reference incomplete)
- Claim 2: "Click **Create endpoint**." — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/Endpoints/index.tsx)

### guardrails.md
- Claim 1: Masking replaces matched text with placeholder — ✗ NO CODE EVIDENCE (vague reference to "masking implementation")
- Claim 2: Regex patterns validated on save, rejected with HTTP 422 — ✗ NO CODE EVIDENCE (incomplete path reference)

### logs.md
- Claim 1: "Toggle between All, Success (HTTP 200), and Error (anything else)" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/Logs/index.tsx)
- Claim 2: "Chat messages rendered as a conversation with colored role labels" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/Logs/ChatDisplay.tsx)

### mcp-agent-keys.md
- No verified claims in this report.

### mcp-approvals.md
- Claim 1: "The expiration time is configured in the gateway settings (`mcp_approval_expiry_seconds`)" — ✓ VERIFIED (evidence: AIGateway/src/config.py)
- Claim 2: "The agent polls `GET /v1/mcp/approvals/{approval_id}/status` periodically" — ✓ VERIFIED (evidence: AIGateway/src/routers/mcp_proxy.py)

### mcp-audit.md
- No verified claims in this report.

### mcp-guardrails.md
- Claim 1: "PII detection uses Presidio-based detection" — ✗ NO CODE EVIDENCE (vague grep reference, no specific file)
- Claim 2: "Content filter checks keywords or regex patterns" — ✗ NO CODE EVIDENCE (file reference to entityTips.ts incomplete)

### mcp-overview.md
- Claim 1: "Your agent connects to `POST /v1/mcp`" — ✓ VERIFIED (evidence: AIGateway/src/routers/mcp_proxy.py:62, @router.post("/v1/mcp"))
- Claim 2: "The gateway implements MCP protocol version 2025-03-26" — ✓ VERIFIED (evidence: AIGateway/src/routers/mcp_proxy.py:84)

### mcp-servers.md
- Claim 1: "Click **Add server** in the top-right corner" — ✓ VERIFIED (evidence: MCPServers/index.tsx:212–216)
- Claim 2: "Auth type shows 'no auth', 'bearer', or 'api_key'" — ✓ VERIFIED (evidence: MCPServers/index.tsx:276)

### mcp-tools.md
- Claim 1: "Shows 'Approval required' in orange when the tool needs human sign-off" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/MCPToolCatalog)
- Claim 2: "New tools default to 'low' risk" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.tsx:40–43)

### models.md
- No verified claims in this report.

### playground.md
- Claim 1: "Temperature controls randomness (0 = focused, 2 = creative). Default: 0.7" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/Playground/index.tsx)
- Claim 2: "Max tokens default: 4096" — ✓ VERIFIED (evidence: Clients/src/presentation/pages/AIGateway/Playground/index.tsx:30)

### prompts.md
- Claim 1: "Default is 1.0" for temperature — ✓ VERIFIED (evidence: PromptEditor.tsx:805–810)
- Claim 2: "The editor is a 50/50 split: messages on the left, a test chat on the right" — ✓ VERIFIED (evidence: PromptEditor.tsx:524, display layout)

### settings.md
- Claim 1: "PII scan on error: Block (default)" — ✗ NO CODE EVIDENCE (file reference only: settings.ts line 108, no path prefix)
- Claim 2: "Content filter on error: Allow (default)" — ✗ NO CODE EVIDENCE (file reference only: settings.ts line 109, no path prefix)

### virtual-keys.md
- No verified claims in this report.

## Summary

Out of 24 sampled verified claims (from 12 reports with claims), **7 failed spot-checks** due to incomplete or vague evidence references. The primary issue is insufficient code path qualification: some claims cite evidence paths without full directory context (e.g., "settings.ts line 108" instead of absolute path), while others use grep patterns or generic references ("the masking implementation") rather than specific line numbers. Five reports—endpoints.md, mcp-agent-keys.md, mcp-audit.md, models.md, and virtual-keys.md—contain no verified claims, which suggests either incomplete audit coverage or genuine lack of verifiable technical content in those articles. The 71% pass rate (17/24) on sampled claims indicates moderate verification rigor, but the false-positive patterns suggest auditor guidance should emphasize absolute file paths and specific line number ranges over vague implementation references.
