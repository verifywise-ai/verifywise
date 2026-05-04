# Audit: risk-management/risk-mitigation
**Article path:** shared/user-guide-content/content/risk-management/risk-mitigation.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (2)

## Summary
The article describes mitigation workflows and status tracking with generally sound concepts, but contains two material discrepancies with the actual implementation: (1) the mitigation status enum includes 7 values, not the 5 shown in the article, with two labels incorrect ("Complete" vs "Completed", "Paused" vs "On Hold"), and (2) the mitigation form field labels are inconsistent with documentation ("Approver" not "Owner", "Deadline" not "Target date"). The four mitigation strategies and risk level measurements claims are not code-enforced and cannot be verified.

## Findings

### Finding 1 — Mitigation status enum mismatch: article shows 5, code has 7 with label errors
- **Type:** UI
- **Status:** ❌ wrong
- **Doc says:** "Not started, In progress, Complete, Paused, Requires review" (block 9)
- **Reality:** MitigationStatus enum has 7 members: NotStarted = "Not Started", InProgress = "In Progress", Completed = "Completed", OnHold = "On Hold", Deferred = "Deferred", Canceled = "Canceled", RequiresReview = "Requires Review"
- **Evidence:** `/Clients/src/domain/enums/mitigationStatus.enum.ts:1-9` and `/Clients/src/presentation/components/RiskLevel/riskValues.ts:26-34`
- **Suggested fix:** Update block 9 to list all 7 status values with correct capitalization and names. Replace "Complete" with "Completed" and "Paused" with "On Hold". Add "Deferred" and "Canceled" to the list.
- **Confidence:** high

### Finding 2 — Mitigation form fields documented incorrectly
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "For each risk requiring mitigation, document the following: Mitigation plan, Owner, Target date, Implementation" (block 12)
- **Reality:** The actual form labels in MitigationSection are: "Mitigation plan" (line 316), "Approver" (line 370), "Deadline" (line 298), "Implementation strategy" (line 330). The form also includes "Assessment date", "Mitigation status", "Current risk level", "Approval status", and "Recommendations" fields not mentioned in the article.
- **Evidence:** `/Clients/src/presentation/components/AddNewRiskForm/MitigationSection/index.tsx:314-340`
- **Suggested fix:** Update block 12 to use actual field names: replace "Owner" with "Approver", replace "Target date" with "Deadline". Consider expanding the list to acknowledge all documented fields or clarify that these are the core fields.
- **Confidence:** high

### Finding 3 — Risk level measurements claim
- **Type:** Behavior
- **Status:** ❓ unverifiable
- **Doc says:** "VerifyWise tracks multiple risk level measurements so you can see how well your mitigations are working: Audit risk, Residual risk, Target risk" (block 14-15)
- **Reality:** Code contains "Current risk level" (a select field in the form) and "Residual risk likelihood/severity" (calculated from likelihood + severity multiplier) but no explicit enum or documentation for "Audit risk" or "Target risk" as distinct, trackable measurements. The form captures "Current risk level" pre-mitigation and residual scores post-mitigation, but terminology differs from the article.
- **Evidence:** No matching constant/enum found in codebase. References: `/Clients/src/presentation/components/AddNewRiskForm/MitigationSection/index.tsx:356-361` (RiskLevel component) and `/Clients/src/domain/types/riskForm.types.ts:28-41` (no "Audit risk" or "Target risk" properties)
- **Suggested fix:** Verify product intent: are "Audit risk", "Residual risk", and "Target risk" intended as formal measurement names? If so, surface them as enums or constants in code. If not, rewrite the article to use "Current risk level" (before mitigation) and "Residual risk" (after) with the actual formula.
- **Confidence:** medium

## Verified claims (sampled)

- Claim: "Mitigation information is stored directly on each risk record, making it easy to see both the risk and its treatment in a single view." (block 6) — verified at `mitigationStatus.enum.ts` and `IMitigation` interface in `/Clients/src/domain/interfaces/i.mitigation.ts:6-19`; mitigation fields are part of the risk form structure.
- Claim: "When addressing a risk, you typically have four options" (block 4) — verified at `riskValues.ts` lines 5-8, where standard risk management terms Avoid, Reduce, Transfer, Accept are documented; confirmed as educational reference, not code-enforced.
- Claim: "Mitigation has been identified but work has not begun" describes "Not started" status (block 9) — verified at `/Clients/src/presentation/components/AddNewRiskForm/MitigationSection/index.tsx:265`, where "Mitigation status" select uses `mitigationStatusItems` containing the matching enum values.
- Claim: Mitigation form includes a "Mitigation plan" field (block 12) — verified at `/Clients/src/presentation/components/AddNewRiskForm/MitigationSection/index.tsx:314-326` with label "Mitigation plan".
- Claim: "Implementation strategy" is documented (block 12) — verified at `/Clients/src/presentation/components/AddNewRiskForm/MitigationSection/index.tsx:328-340` with exact label "Implementation strategy".

## Skipped / non-verifiable

- "Risk mitigation is about taking action to bring identified risks down to acceptable levels" (block 1) — reason: definitional/motivational only; not code-verifiable.
- "Without mitigation planning, risks stay as theoretical concerns in a spreadsheet" (block 2) — reason: motivational framing; opinion on value proposition.
- "Shift the risk to a third party (insurance, outsourcing)" in Transfer option (block 5, "Transfer" item) — reason: business practice reference; not code-enforced as a distinct workflow.
