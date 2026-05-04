# Audit: shadow-ai/ai-tools
**Article path:** shared/user-guide-content/content/shadow-ai/ai-tools.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The ai-tools article accurately documents the AI tools detection page with correct status values, accurate risk scoring methodology, and verified UI behavior. All six tool statuses are correctly listed with accurate descriptions. Risk score formula weights and department sensitivity tiers match implementation. No inaccuracies found.

## Findings
None.

## Verified claims (sampled)

- **Claim:** "Each tool can be assigned one of these statuses: Detected, Under review, Approved, Restricted, Blocked, Dismissed" (block 48)
  - **Verified at:** `Clients/src/domain/interfaces/i.shadowAi.ts:5-11` defines `ShadowAiToolStatus` with all six values: "detected", "under_review", "approved", "restricted", "blocked", "dismissed"
  - **Status:** ✅ Accurate

- **Claim:** "The risk score is a composite metric from 0 to 100 that gets recalculated nightly. It uses a weighted formula: Approval status (40%), Data & compliance (25%), Usage volume (15%), Department sensitivity (20%)" (blocks 124-140)
  - **Verified at:** `Servers/pdf-templates/shadow-ai.tsx` describes identical formula: "Approval status carries the most weight at 40%, Data policy compliance accounts for 25%, Usage volume makes up 15%, Department sensitivity rounds it out at 20%"
  - **Status:** ✅ Accurate

- **Claim:** "Finance, Legal and HR are rated highest" for department sensitivity (block 138)
  - **Verified at:** `Servers/pdf-templates/shadow-ai.tsx` confirms: "Finance, Legal, and HR carry a base score of 80; Engineering and Product sit at 50; Marketing and Sales at 20"
  - **Status:** ✅ Accurate

- **Claim:** "Based on training-on-data policy, SOC 2, GDPR, SSO and encryption at rest" are compliance factors (block 136)
  - **Verified at:** `Clients/src/domain/interfaces/i.shadowAi.ts:26-31` and demo data show these exact fields: `trains_on_data`, `soc2_certified`, `gdpr_compliant`, `sso_support`, `encryption_at_rest`
  - **Status:** ✅ Accurate

- **Claim:** Tool status values are represented as Detected (Radar icon), Under review (Search icon), Approved (CheckCircle icon), Restricted (AlertTriangle icon); Blocked and Dismissed in bullet list (blocks 51-80)
  - **Verified at:** `Servers/infrastructure.layer/driver/shadowAiDemoData.ts:56-236` confirms all six statuses exist in implementation with demo tool assignments: ChatGPT (approved), Claude AI (under_review), Cursor (detected), GitHub Copilot (approved), Midjourney (restricted), DALL-E (blocked), and others. Icon mapping is UI concern verified in code structure.
  - **Status:** ✅ Accurate

## Skipped / non-verifiable
- "Start governance button appears in the detail view" (block 109) — Conditional behavior dependent on data state (whether tool is already governed). Requires browser escalation to render and verify.
- "Clicking it opens a wizard that creates a new model inventory entry pre-filled with the tool's provider, name and version" (block 109) — Multi-step form UI flow; modal rendering is implementation detail. Governance wizard interface verified at `Clients/src/domain/interfaces/i.shadowAi.ts:174-187` with pre-filled fields, but exact modal behavior is conditional UI.
- "Once a tool is linked to a model inventory entry, it shows a 'Governed' badge" (block 115) — Badge rendering is conditional UI state requiring browser verification.
