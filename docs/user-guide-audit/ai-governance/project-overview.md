# Audit: ai-governance/project-overview
**Article path:** shared/user-guide-content/content/ai-governance/project-overview.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (1)

## Summary
Article accurately describes the project overview UI layout and tab navigation. One critical quantitative claim about risk severity categories is incorrect: the doc states "very high, high, medium, low, very low" but the codebase implements "Negligible, Minor, Moderate, Major, Critical". UC-ID format and compliance references verified against domain docs.

## Findings
### Finding 1 — Risk severity enum mismatch
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Counts of risks by severity: very high, high, medium, low, very low." (block 3)
- **Reality:** Risk severity enum defines five levels: Negligible, Minor, Moderate, Major, Critical
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/enums/riskSeverity.enum.ts:1-7`
- **Suggested fix:** Update block 3 to read "Counts of risks by severity: Critical, Major, Moderate, Minor, Negligible."
- **Confidence:** high

## Verified claims (sampled)
- Claim: "A unique identifier for this use case, in the format UC-{number}." (block 8) — verified at `docs/technical/domains/use-cases.md` ("Format: `UC-{number}` e.g., 'UC-1', 'UC-2'")
- Claim: "FRIA" tab references "Fundamental Rights Impact Assessment (required under EU AI Act Article 27)" (block 5) — verified in FRIA domain doc ("Article 27(1): Deployers of high-risk AI systems must perform a FRIA")
- Claim: "CE Marking" tab for "EU conformity assessment steps for high-risk AI systems" (block 5) — verified concept exists in compliance framework but EU AI Act mapping is aspirational
- Claim: "Chronological log of every change: who, what, when, old value, new value." in Activity tab (block 5) — verified concept in `docs/technical/domains/use-cases.md` ("Change History > Tracked Changes")
- Claim: Framework progress bar showing "how many controls and assessments are complete" (block 3) — verified pattern in projects_frameworks relation

## Skipped / non-verifiable
- "On this page you can see the overall status of your use case" — reason: general framing, opinion on UI purpose
- "you can also edit the use case properties" — reason: capability description without quantifiable constraint
- Tab descriptions like "Shows a badge with the current risk count" — reason: UI feature description; requires live component render trace to verify against exact DOM output
- "Post-market monitoring questionnaires and recurring check cycles" (block 5) — reason: feature description without quantifiable parameters
