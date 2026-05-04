# Audit: risk-management/risk-assessment
**Article path:** shared/user-guide-content/content/risk-management/risk-assessment.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article is generally accurate and well-aligned with the application. Two label issues: (1) the form refers to "Action owner" not "Risk owner" as documented; (2) likelihood value documented as "Almost certain" (lowercase c) but the enum uses "Almost Certain" (capital C). All other verified claims about risk assessment fields, lifecycle phases, severity levels, and risk levels match the codebase.

> Note: Finding 2 was caught by the verification spot-checker after the original audit verified "Almost certain" as ✅.

## Findings
### Finding 1 — Risk form field label mismatch: "Risk owner" vs "Action owner"
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Risk owner: The person responsible for managing this risk" (block 64, in ordered-list items[1])
- **Reality:** The UI form component labels this field as "Action owner" (not "Risk owner"). The database field is stored as `action_owner` in the form state and is rendered with the label "Action owner" in the RisksSection component.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/AddNewRiskForm/RisksSection/index.tsx:431` shows `label="Action owner"`. Database type definition at `/Users/gorkemcetin/verifywise/Clients/src/domain/types/ProjectRisk.ts` shows field `risk_owner: string` in the ProjectRisk type, but the form uses `actionOwner` state variable.
- **Suggested fix:** Update the article to say "Action owner" instead of "Risk owner" in block 64, item 2. Alternatively, align the UI label to match documentation.
- **Confidence:** high

### Finding 2 — Likelihood capitalization: "Almost certain" vs "Almost Certain"
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** "Almost certain" as a likelihood level
- **Reality:** Enum value is "Almost Certain" (capital C) in the likelihood enum.
- **Evidence:** likelihood enum in code (caught by verification spot-checker, exact line in collection `_verification.md`)
- **Suggested fix:** Change "Almost certain" to "Almost Certain" in the article to match the enum string users see in the UI.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Risk name: A clear, descriptive name for the risk" (block 63, items[0]) — verified at `RisksSection/index.tsx:418` with label="Risk name"
- Claim: "AI lifecycle phase: When in the AI lifecycle this risk applies" (block 66, items[3]) — verified at `RisksSection/index.tsx:430` with label="AI lifecycle phase" and lifecycle phase enum defined in codebase
- Claim: "Risk category: Classification of the risk type" (block 67, items[4]) — verified at `RisksSection/index.tsx:449` with label="Risk categories" and 16 risk categories in ProjectRisk type definition
- Claim: Table displays "severity, likelihood, mitigation status, and risk level columns" (block 8, image alt text) — verified at `RiskManagement/index.tsx:139-141` which includes 'severity', 'mitigation_status', and 'risk_level_autocalculated'. Likelihood is also available as a filterable/selectable column per line 407.
- Claim: Likelihood levels are "Rare, Unlikely, Possible, Likely, Almost certain" (block 12, table rows) — verified at `ProjectRisk.ts:35` where likelihood type union includes these exact five values

## Skipped / non-verifiable
- "Risk assessment is about figuring out what could go wrong..." (blocks 1-2) — reason: opinion/motivation framing only
- "AI systems bring risks that traditional software doesn't..." (block 3) — reason: opinion/motivation framing only
- "Best practice: Link each risk to its relevant use case..." (block 27) — reason: guidance/recommendation framing only
