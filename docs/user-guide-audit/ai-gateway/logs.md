# Audit: ai-gateway/logs
**Article path:** shared/user-guide-content/content/ai-gateway/logs.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (1)

## Summary
The article accurately describes most log page features: date grouping ("Today"/"Yesterday"/short date), role labels (system/user/assistant), source filter, and status filter. However, one significant claim about log row columns is incorrect: the article states each row shows "endpoint, model, cost, tokens, latency, status and who sent it," but the implemented component does not display latency in the log row—only after clicking to expand the request details.

## Findings

### Finding 1 — Log row missing latency column
- **Type:** UI claim
- **Status:** ❌ wrong
- **Doc says:** "Each row shows the endpoint, model, cost, tokens, latency, status and who sent it" (block index 2)
- **Reality:** Log rows render endpoint, model, cost (USD), tokens, status code, and user name/virtual key name. Latency is not displayed in the collapsed row view; it appears only in the expanded request detail panel.
- **Evidence:** `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:73–98` (log row rendering shows endpoint_name, model, total_tokens, cost_usd, status_code, user_name/virtual_key_name but no latency_ms display in the main row)
- **Suggested fix:** Either add latency_ms to the log row template, or revise the claim to state "Each row shows endpoint, model, cost, tokens, status and who sent it; click to view latency and full request/response."
- **Confidence:** high

## Verified claims (sampled)
- Claim: 'Logs are grouped under day headers: "Today", "Yesterday", or a short date like "Mar 14"' (block 5) — verified at `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:32–41` (formatDateHeader function returns exactly these strings)
- Claim: "Toggle between All, Success (HTTP 200), and Error (anything else)" (block 4) — verified at `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:189–195` (status_code === 200 ? 'success' : 'error' logic confirms mapping)
- Claim: "Chat messages are rendered as a conversation with colored role labels (system, user, assistant)" (block 9) — verified at `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:46–50` (roleLabelColor object defines system, user, assistant keys)
- Claim: 'Toggle between All, Playground (requests from logged-in users), and Virtual key (programmatic requests from developer API keys)' (block 5) — verified at `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:197–201` (SOURCE_OPTIONS constant includes all, playground, virtual-key)
- Claim: "All filtering happens server-side" (block 3) — verified at `Clients/src/presentation/pages/AIGateway/Logs/index.tsx:55–62` (buildQuery constructs URL parameters sent to `/ai-gateway/spend/logs` endpoint; results reflect server-side filtering)

## Skipped / non-verifiable
- "The search box matches against endpoint name, model, u..." (block 2) — reason: article text is truncated (ends with "u..."); full claim scope cannot be verified without complete text
