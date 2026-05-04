# Audit: risk-management/vendor-risks
**Article path:** shared/user-guide-content/content/risk-management/vendor-risks.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (3)

## Summary
The article describes vendor risk assessment scorecard dimensions and review workflows accurately, but contains three material discrepancies in the enum values shown to users. The data sensitivity and business criticality field descriptions in the article do not match the actual enum labels in the codebase, which would confuse users when they open the vendor form. Review status workflow matches code correctly.

## Findings

### Finding 1 — Data sensitivity level descriptions do not match code enum labels
- **Type:** UI claim + Behavior claim
- **Status:** ❌ wrong
- **Doc says:** "Classify the most sensitive data shared with the vendor: None (No sensitive data (lowest risk)), Internal only (Internal business data), PII (Personally identifiable information), Financial (Financial data or records), Health (Health-related information), Model weights (Proprietary model parameters (highest risk))" (block index 6)
- **Reality:** Code enum shows: None, "Internal only", "Personally identifiable information (PII)", "Financial data", "Health data (e.g. HIPAA)", "Model weights or AI assets". The article simplifies labels (e.g., "Internal business data" vs. enum "Internal only"; "Financial data or records" vs. enum "Financial data"; "Health-related information" vs. enum "Health data (e.g. HIPAA)"; "Proprietary model parameters" vs. enum "Model weights or AI assets")
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/enums/status.enum.ts:20-28` — DataSensitivity enum defines exact labels; form will display these, not the article text
- **Suggested fix:** Update article block 6 to use exact enum values: "Internal only", "Personally identifiable information (PII)", "Financial data", "Health data (e.g. HIPAA)", "Model weights or AI assets"
- **Confidence:** high

### Finding 2 — Business criticality descriptions do not match code enum labels
- **Type:** UI claim + Behavior claim
- **Status:** ❌ wrong
- **Doc says:** "Evaluate how dependent your operations are on this vendor: Low (Non-essential services; alternatives readily available), Medium (Important but not critical; disruption would be manageable), High (Critical to operations; disruption would significantly impact business)" (block index 10)
- **Reality:** Code enum shows: "Low (vendor supports non-core functions)", "Medium (affects operations but is replaceable)", "High (critical to core services or products)". The article text descriptions differ materially from the parenthetical labels in the enum.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/enums/status.enum.ts:30-34` — BusinessCriticality enum defines exact labels; UI displays these labels, not the article prose
- **Suggested fix:** Update article block 10 to state: "Low (vendor supports non-core functions), Medium (affects operations but is replaceable), High (critical to core services or products)"
- **Confidence:** high

### Finding 3 — Past issues enum descriptions partially misaligned
- **Type:** UI claim
- **Status:** ⚠️ partial
- **Doc says:** "Document any historical incidents with the vendor to inform future risk decisions: None (No known issues (best)), Minor incident (Small issues that were resolved satisfactorily), Major incident (Significant incidents affecting operations or compliance)" (block index 12)
- **Reality:** Code enum shows: "None", "Minor incident (e.g. small delay, minor bug)", "Major incident (e.g. data breach, legal issue)". The article's "Major incident" description differs from the code's example.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/enums/status.enum.ts:36-40` — PastIssues enum shows parenthetical examples differ from article
- **Suggested fix:** Update Minor incident to "(e.g. small delay, minor bug)" and Major incident to "(e.g. data breach, legal issue)" to match enum
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Update review status to 'In review'" (block 17) — verified at `Clients/src/domain/enums/status.enum.ts:15` (ReviewStatus.InReview = "In review")
- Claim: "Set status to 'Reviewed' or 'Requires follow-up'" (block 17) — verified at `Clients/src/domain/enums/status.enum.ts:16-17` (ReviewStatus.Reviewed, RequiresFollowUp)
- Claim: "VerifyWise assesses vendor risk across four dimensions: Data sensitivity, Business criticality, Past issues, Regulatory exposure" (block 5) — verified as present in scorecard; icon-cards structure confirms four-dimension design
- Claim: "RegulatoryExposure checklist includes GDPR, HIPAA, SOC 2, ISO 27001, EU AI Act, CCPA" (block 15) — verified at `Clients/src/domain/enums/status.enum.ts:44-49` (all regulatory options present)
- Claim: "Related articles link to vendor-management, risk-assessment, and risk-mitigation" (block 19) — verified at `vendor-risks.ts:259-276` (all three articleId values present)

## Skipped / non-verifiable
- "Vendor risk assessment helps you maintain compliance, protect sensitive data, plan for continuity, and prioritize oversight" (block 3) — reason: motivation/benefit framing; non-verifiable
- "Higher data sensitivity increases vendor risk" (block 6) — reason: design intent; not tied to specific code behavior
- "More regulatory exposure means higher risk and more oversight" (block 16) — reason: general principle about risk; not a specific UI/behavioral claim
- "Schedule vendor risk reviews based on risk score. High-risk vendors should be reviewed more frequently than low-risk vendors." (block 18) — reason: recommendation/best practice; non-verifiable
