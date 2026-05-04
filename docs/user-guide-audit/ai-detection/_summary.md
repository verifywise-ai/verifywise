# Collection summary — ai-detection
**Date:** 2026-04-29
**Articles audited:** 5 (1 from Phase 1, 4 from Phase 2)
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| history | ⚠️ minor (1) | 0 | 1 | 0 |
| repositories | ⚠️ minor (1) | 0 | 1 | 0 |
| risk-scoring | ✅ clean | 0 | 0 | 0 |
| scanning (Phase 1) | ⚠️ minor (1) | 1 | 0 | 0 |
| settings | ⚠️ minor (2) | 0 | 2 | 0 |

## Verification

10/10 spot-checks passed. No false-positive verifications detected.

## Assessment

This collection has the highest churn in the user guide (per memory) and yet the audits came out broadly accurate. Findings cluster around **vulnerability type / status enum mismatches** (settings has 2 LLM-class name variations, history has 2 missing scan statuses) — these look like enum value drift between the docs and code. None are blockers; all have concrete suggested fixes.

`risk-scoring` (the most quantitative-heavy article) came back ✅ clean — every threshold and weight verified against constants. That's a good signal for the audit method holding up on a hard target.

Ready to move on.
