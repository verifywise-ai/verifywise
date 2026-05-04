# Audit: risk-management/vendor-management
**Article path:** shared/user-guide-content/content/risk-management/vendor-management.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The vendor management article is substantively accurate and well-structured. All UI claims, behavior descriptions, scorecard dimensions, and review workflow states match the production code. Two minor discrepancies were identified: (1) the article simplifies Business Criticality descriptions, and (2) the article describes generic Past Issues options rather than the code's specific incident-type wording.

## Findings

### Finding 1 — Business Criticality descriptions simplified
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Low: Vendor is non-essential; easy to replace" (block 188)
- **Reality:** Code defines "Low (vendor supports non-core functions)"
- **Evidence:** `Clients/src/domain/enums/status.enum.ts:21`
- **Suggested fix:** Change to match enum exactly: "Low: Vendor supports non-core functions" (or document that the user guide simplifies enum values for readability, with explicit product decision)
- **Confidence:** high

### Finding 2 — Past Issues descriptions differ in specificity
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Minor incident: Small issues that were resolved" (block 206)
- **Reality:** Code enum: "Minor incident (e.g. small delay, minor bug)"
- **Evidence:** `Clients/src/domain/enums/status.enum.ts:24`
- **Suggested fix:** Align doc text to code: "Minor incident: Small issues (e.g. small delay, minor bug) that were resolved"
- **Confidence:** high

## Verified claims (sampled)

- Claim: "Not started: Vendor has been added but review has not begun" (block 111) — verified at `Clients/src/domain/enums/status.enum.ts` ReviewStatus.NotStarted
- Claim: "In review: Vendor assessment is currently in progress" (block 115) — verified at `Clients/src/domain/enums/status.enum.ts` ReviewStatus.InReview
- Claim: "Reviewed: Vendor assessment has been completed" (block 120) — verified at `Clients/src/domain/enums/status.enum.ts` ReviewStatus.Reviewed
- Claim: "Requires follow-up: Review identified issues that need additional attention" (block 125) — verified at `Clients/src/domain/enums/status.enum.ts` ReviewStatus.RequiresFollowUp
- Claim: "Risk score calculated from data sensitivity (0.3 weight), business criticality (0.3), past issues (0.2), regulatory exposure (0.2)" — verified at `Clients/src/domain/utils/vendorScorecard.utils.ts` lines 78-83

## Skipped / non-verifiable

- "Good vendor management helps you..." (block 27) — motivation/framing only
- "Under the EU AI Act, organizations... are still responsible" (block 42) — compliance mapping; low-confidence without explicit regulatory code linkage
- "Proper vendor management helps you demonstrate due diligence" (block 42) — opinion/aspiration, not verifiable
- "When a vendor experiences an incident... review all linked projects" (block 269) — best-practice guidance, non-verifiable outcome
