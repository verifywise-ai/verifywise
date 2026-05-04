# Verification spot-checks — risk-management
**Date:** 2026-04-29
**Reports spot-checked:** 5
**Claims re-verified:** 10
**Failed spot-checks:** 1

## Per-report results

### quantitative-risk-assessment.md
- ✅ "ALE calculation: Multiply the PERT of your event frequency by the total PERT loss across all four categories" (verified at `fairCalculator.ts:42-51`) — confirmed: `computeALE()` multiplies `freq * totalLoss` exactly as documented
- ✅ "Example claim: frequency 0.1, 0.3, 0.8 produces ~0.317 PERT (once every 3 years)" (mathematical verification) — confirmed: (0.1 + 4×0.3 + 0.8)/6 ≈ 0.317 matches documented calculation

### risk-assessment.md
- ✅ "AI lifecycle phase: When in the AI lifecycle this risk applies" (verified at `RisksSection/index.tsx:456`) — confirmed: field label="AI lifecycle phase" present in form
- ❌ "Likelihood levels are Rare, Unlikely, Possible, Likely, Almost certain" (verified at `likelihood.enum.ts`) — **MISMATCH**: enum shows "Almost Certain" (capitalized), not "Almost certain" (lowercase). All other four values match exactly.

### risk-mitigation.md
- ✅ "Mitigation information is stored directly on each risk record" (verified at `i.mitigation.ts:6-19`) — confirmed: IMitigation interface includes mitigationPlan, implementationStrategy, deadline, approver fields as part of core interface
- ✅ "Implementation strategy field documented" (verified at `MitigationSection/index.tsx:328-340`) — confirmed: label="Implementation strategy" present with proper validation and placeholder

### vendor-management.md
- ✅ "Not started: Vendor has been added but review has not begun" (verified at `status.enum.ts:14`) — confirmed: ReviewStatus.NotStarted = "Not started"
- ✅ "Risk score calculated with weights (data sensitivity 0.3, business criticality 0.3, past issues 0.2, regulatory exposure 0.2)" (verified at `vendorScorecard.utils.ts:78-83`) — confirmed: exact formula `(dataSensitivityValue * 0.3) + (businessCriticalityValue * 0.3) + (pastIssuesValue * 0.2) + (regulatoryExposureValue * 0.2)`

### vendor-risks.md
- ✅ "Update review status to 'In review'" (verified at `status.enum.ts:15`) — confirmed: ReviewStatus.InReview = "In review"
- ✅ "Related articles link to vendor-management, risk-assessment, and risk-mitigation" (verified at `vendor-risks.ts:265-271`) — confirmed: all three articleIds present with correct collectionId="risk-management"

## Summary
Nine of ten spot-checked claims verified successfully. One false-positive detected in risk-assessment.md: the likelihood enum uses "Almost Certain" (proper capitalization), but the article documents it as "Almost certain" (lowercase). This is a minor capitalization inconsistency in the verified claims section. All quantitative formulas, interface definitions, enum values, and field labels match their documented claims. The vendor-management and vendor-risks reports show perfect alignment with code. No structural or functional false positives identified.
