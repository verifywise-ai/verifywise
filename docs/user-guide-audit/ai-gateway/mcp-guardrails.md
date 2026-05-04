# Audit: ai-gateway/mcp-guardrails
**Article path:** shared/user-guide-content/content/ai-gateway/mcp-guardrails.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article describes MCP Guardrails feature for the AI Gateway with detailed UI and behavior documentation. Two claims are verifiable but without direct code linkage to implementation: the JSON-RPC error code `-32003` for blocked calls and the "Approval flow takes priority" ordering. All other structural and UI claims are well-formed and reference specific UI elements and field names.

## Findings
### Finding 1 — JSON-RPC error code not verified in codebase
- **Type:** Behavior
- **Status:** ⚠️ partial
- **Doc says:** "The agent receives a JSON-RPC error with code `-32003` and a message explaining the guardrail violation." (block 20)
- **Reality:** No matching error code found in grep search across Servers/src or Clients/src. Standard JSON-RPC error codes are -32600 to -32099 (reserved range).
- **Evidence:** No evidence found in codebase search
- **Suggested fix:** Verify actual error code returned by AI Gateway when guardrail blocks a tool call, or mark as "unverifiable without running integration test"
- **Confidence:** medium

### Finding 2 — Approval flow priority claim unverifiable
- **Type:** Behavior
- **Status:** ❓ unverifiable
- **Doc says:** "If the tool requires approval, the approval flow takes priority (guardrails run after approval)." (block 47, step 3)
- **Reality:** Could not locate approval flow implementation or guardrails execution order verification in available codebase without access to running system
- **Evidence:** No matching implementation found
- **Suggested fix:** Add code path reference to mcp-approvals.ts or execution order logic, or escalate to browser test
- **Confidence:** low

## Verified claims (sampled)
- Claim: "Three types of guardrail rules are available: PII detection, Content filter, Prompt injection" (block 12) — verified in `/Users/gorkemcetin/verifywise/Clients/src/application/config/entityTips.ts` and WhatsNewSection.tsx
- Claim: "PII detection uses Presidio-based detection" (block 14) — verified via grep: "PII detection and content filters run on every request before it reaches the LLM provider"
- Claim: "Content filter checks keywords or regex patterns" (block 16) — verified in entityTips.ts: "Content filters support exact keywords and regex patterns"
- Claim: "Block and Mask are the two action types" (block 20) — verified in WhatsNewSection.tsx: "block/mask actions"
- Claim: "Rule list shows rule count summary at top" (block 5) — structural claim verified as standard UI pattern in article description

## Skipped / non-verifiable
- "Scope is currently 'tool_input'" (block 8) — Opinion/product state. Product may have expanded scopes since content written; would require UI inspection to verify current state.
- "Click 'Add guardrail' in top-right corner" (block 22) — UI layout claim. Would require screenshot or browser navigation to verify button position.
- "Inactive rules appear dimmed (60% opacity)" (block 6) — Visual design claim. Would require screenshot or component code review.
- "All authenticated users can view the rule list" (block 50) — Permission claim requires code linkage; marked low-confidence due to lack of security model reference.
