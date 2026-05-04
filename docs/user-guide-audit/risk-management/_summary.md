# Collection summary — risk-management
**Date:** 2026-04-29
**Articles audited:** 5
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| quantitative-risk-assessment | ✅ clean | 0 | 0 | 0 |
| risk-assessment | ⚠️ minor (1) | 0 | 1 | 0 |
| risk-mitigation | ❌ significant (2) | 2 | 1 | 0 |
| vendor-management | ⚠️ minor (2) | 0 | 2 | 0 |
| vendor-risks | ❌ significant (3) | 3 | 0 | 0 |

## Verification

9/10 spot-checks passed. 1 false-positive caught: `risk-assessment.md` had "Almost certain" (lowercase) verified as ✅ but the enum is "Almost Certain" — a capitalization mismatch the audit missed. Worth adding as a finding.

## Assessment

Findings cluster heavily around **enum/label drift** — same pattern as policies, ai-detection, and integrations:
- `risk-mitigation`: doc claims 5 statuses but enum has 7 (also "Complete"→"Completed", "Paused"→"On Hold")
- `vendor-management` and `vendor-risks`: simplified label descriptions in doc don't match the actual enum strings users see in UI
- `risk-assessment`: capitalization mismatch on likelihood values

**Strong positive:** `quantitative-risk-assessment` is ✅ clean despite being the most numerically-dense article in the user guide. PERT, ALE, residual-ALE, ROI formulas, all 4 loss categories, example calculations — all verified against `fairCalculator.ts`. This is the second clean verdict on a hard quantitative target (risk-scoring was the first).

**Pattern across collections (5/7 collections so far):** the docs often describe enum values in *natural-language* form ("Internal business data") while the actual UI shows the *enum string* ("Internal only"). Users see one thing, docs describe another. This is a systematic doc-writing convention that doesn't survive enum changes.

Ready to move on.
