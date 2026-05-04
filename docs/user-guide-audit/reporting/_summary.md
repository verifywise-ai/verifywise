# Collection summary — reporting
**Date:** 2026-04-29
**Articles audited:** 2
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| dashboard-analytics | ❌ significant (3) | 3 | 0 | 0 |
| generating-reports | ⚠️ minor (2) | 1 | 1 | 0 |

## Verification

All 4 spot-checks passed. Audit subagent's citations were accurate and the code implementations matched the documented claims. Zero false positives in the verified claims.

## Assessment

The dashboard-analytics article is the heaviest finding so far — three high-confidence ❌ contradictions about features (edit mode lock icon, drag-and-drop widgets, widget resizing) that simply don't exist in the codebase. This looks like the doc was written aspirationally or against an older/different design.

generating-reports has one real button-label mismatch ("Generate use case report" vs actual "Generate report" → dropdown). Finding 2 (step ordering) is a consequence of Finding 1 — should ideally have been clustered.

Note for global summary: both reports show a v2-prompt regression where behavior claims that need code-tracing get put in Skipped (e.g., "Reports are generated as downloadable files" was Skipped instead of marked ❓). The Skip-vs-❓ rule needs reinforcement in subagent dispatch language.
