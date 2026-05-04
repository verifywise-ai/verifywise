# Audit: ai-detection/settings
**Article path:** shared/user-guide-content/content/ai-detection/settings.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The settings article accurately describes the Settings page structure, tab configuration, and most UI elements. Two vulnerability type names in the article differ from the actual UI labels, creating minor user-facing discrepancies. All quantitative claims (5 dimensions, 10 OWASP types, 100% weight validation) and behavioral claims are verified.

## Findings
### Finding 1 — Vulnerability type LLM02 name mismatch
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Insecure output handling (LLM02)" (block 20, item 2)
- **Reality:** UI displays "Jailbreak risk" (LLM02) in the vulnerability toggles
- **Evidence:** `Clients/src/domain/ai-detection/riskScoringTypes.ts:104` — `name: "Jailbreak risk"` with `owaspId: "LLM02"`
- **Suggested fix:** Update block 20 item 2 to use "Jailbreak risk (LLM02)" to match the rendered UI label
- **Confidence:** high

### Finding 2 — Vulnerability type LLM06 name variant
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Sensitive info disclosure (LLM06)" (block 20, item 6)
- **Reality:** UI displays "PII exposure" (LLM06) in the vulnerability toggles
- **Evidence:** `Clients/src/domain/ai-detection/riskScoringTypes.ts:89` — `name: "PII exposure"` with `owaspId: "LLM06"`
- **Suggested fix:** Update block 20 item 6 to use "PII exposure (LLM06)" to match the rendered UI label
- **Confidence:** high

## Verified claims (sampled)
- Claim: "The Settings page has 2 tabs: **GitHub integration** for repository access tokens, and **Risk scoring**" (block 1) — verified at `Clients/src/presentation/pages/AIDetection/SettingsPage.tsx:294-300` (TabBar tabs configuration)
- Claim: "The 5 dimensions: Data sovereignty, Transparency, Security, Autonomy, Supply chain" (block 15) — verified at `Clients/src/domain/ai-detection/riskScoringTypes.ts:176-182` (DIMENSION_LABELS)
- Claim: "Weights must total 100%" (block 17) — verified at `Clients/src/presentation/pages/AIDetection/SettingsPage.tsx:226` (weightsValid calculation with 0.02 tolerance) and line 655 (error message "Weights must sum to 100%")
- Claim: "10 OWASP LLM Top 10 types" listed (block 20) — verified: all 10 types (LLM01–LLM10) are defined in `Clients/src/domain/ai-detection/riskScoringTypes.ts:79-150` (VULNERABILITY_TYPES array)
- Claim: "Reset to defaults" button available (block 17) — verified at `Clients/src/presentation/pages/AIDetection/SettingsPage.tsx:601-609` (handleResetWeights handler and button rendering)

## Skipped / non-verifiable
- "Help you do X" framing throughout — skipped as opinion/motivation only (e.g., block 1, "helps your team focus on what matters")
- "LLM will produce" behavioral promises (block 10) — skipped as internal LLM behavior not directly verifiable from codebase alone
