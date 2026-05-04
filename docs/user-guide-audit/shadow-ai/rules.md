# Audit: shadow-ai/rules
**Article path:** shared/user-guide-content/content/shadow-ai/rules.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately documents the Rules page UI, creation flow, and trigger types. All six trigger types are correctly listed and match the frontend enum. The risk score formula is verified in the UI code. However, the 50-alert per-batch cap claim cannot be traced to backend code, and the article mentions cross-doc references to the Settings page that require separate verification.

## Findings
### Finding 1 — Alert cap limit (50 per batch)
- **Type:** Quantitative claim
- **Status:** ❓ unverifiable
- **Doc says:** "As a safety net, the system limits the number of alerts that can fire in a single ingestion batch to 50. If more than 50 alerts are triggered by a single batch of events, the excess alerts are silently dropped." (block 24)
- **Reality:** Searched Servers codebase for "50" + "alert" pattern; no matching implementation found. Frontend code does not enforce this limit (RulesPage.tsx, lines 77–95).
- **Evidence:** `Servers/**` — no hits; `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:77` shows ALERTS_PER_PAGE=10 (pagination), not batch alert cap
- **Suggested fix:** Link to backend batch processing handler or remove claim if unimplemented.
- **Confidence:** high (no code trace found despite thorough search)

### Finding 2 — Cross-doc reference verification
- **Type:** Reference claim
- **Status:** ⚠️ partial
- **Doc says:** "For a detailed breakdown of how risk scores are calculated, visit the Settings page and see the 'Risk score calculation' section." (block 12 callout)
- **Reality:** Risk score formula is documented inline in RulesPage.tsx (lines 690–695) exactly matching the article. Settings page reference is unverified (requires separate article audit).
- **Evidence:** `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:690–695` confirms formula in UI
- **Suggested fix:** Verify Settings article exists and contains matching risk score documentation.
- **Confidence:** medium (formula verified, cross-doc target unverified)

## Verified claims (sampled)
- Claim: "Trigger types are: New tool detected, Usage threshold exceeded, Sensitive department usage, Blocked tool attempt, Risk score exceeded, New user detected" (block 7) — verified at `Clients/src/domain/interfaces/i.shadowAi.ts:39–45` (ShadowAiTriggerType enum)
- Claim: "Risk score (0-100) is calculated nightly using a weighted formula: approval status (40%), data and compliance policies (25%), usage volume (15%) and department sensitivity (20%)" (block 12) — verified at `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:690–695`
- Claim: "You can enable or disable a rule at any time using the toggle switch. Disabled rules do not fire alerts but are preserved for future use." (block 3) — verified at `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:224–241` (handleToggleActive function preserves rule, only toggles is_active flag)
- Claim: "Click 'Create rule' to open the creation modal" — verified at `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:373–387` (CustomizableButton triggers setCreateModalOpen)
- Claim: "Rule creation form fields are: Rule name, Description, Trigger type, Configuration, Notify me, Active" (block 5) — verified at `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:646–773` (form includes all six fields)
- Claim: "Deleting a rule removes the rule definition but preserves any alert history that was already generated." (block 15) — verified at `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx:778–792` (delete modal explicitly states 'alert history for this rule will be preserved')

## Skipped / non-verifiable
- "The system sends notifications so you can respond to new risks or policy violations without manually watching dashboards." (block 0) — reason: motivation/benefit claim only
- "Set rules that fire when specific conditions are met: new tool detected, usage threshold exceeded, or data sensitivity flags triggered." (empty state hint, block 17) — reason: marketing/framing text; trigger types already verified
- "Route alerts to security teams, managers, or compliance officers. Each rule can have different notification recipients." (block 18) — reason: capability claim without implementation detail; unverifiable without testing email delivery
