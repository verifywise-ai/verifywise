# Collection summary — compliance
**Date:** 2026-04-29
**Articles audited:** 8 (1 from Phase 1, 7 from Phase 2)
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| assessments | ✅ clean | 0 | 0 | 0 |
| ce-marking | ⚠️ minor (2) | 0 | 2 | 0 |
| eu-ai-act (P1) | ⚠️ minor (1) | 0 | 1 | 0 |
| fria | ✅ clean | 0 | 0 | 0 |
| iso-27001 | ⚠️ minor (1) | 0 | 1 | 0 |
| iso-42001 | ✅ clean | 0 | 0 | 0 |
| nist-ai-rmf | ⚠️ minor (1) | 0 | 1 | 0 |
| post-market-monitoring | ✅ clean | 0 | 0 | 0 |

## Verification

14/16 spot-checks passed. **Two failures caught:**
1. `nist-ai-rmf.md`: subcategory count "~25" for MEASURE function actually verifies as 22 in seed data — the audit's approximation hid a real discrepancy. Should be added as a finding.
2. `fria.md`: cited the risk score formula at `docs/technical/domains/fria.md`, but the formula doesn't exist in that file (only the 500ms debounce did). The audit's high-confidence ✅ on the formula isn't supported by the cited evidence.

The verification subagent earned its keep again — it caught two real issues the audits had marked as ✅.

## Assessment

Half the collection (4/8) is ✅ clean — strong result for a compliance-heavy area where the spec's low-confidence-by-default rule has been working. The findings that exist cluster around **enum/count drift**:
- ce-marking: lowercase backend strings vs Title Case doc labels
- iso-27001: "Technology" vs "Technological" terminology
- nist-ai-rmf: approximate subcategory counts (audit + verification both flagged this)

**FRIA** is interesting — it has high-confidence quantitative claims (risk formula, 500ms debounce) but the verification spot-checker found the cited reference for the formula was wrong. This means: the formula might still be correct in the actual code, but the audit's evidence pointed to the wrong file. Worth flagging in Findings: "evidence citation needs correction even if claim is true."

Updating `fria.md` to convert the formula claim to ❓ and `nist-ai-rmf.md` to add the missing finding inline.

Ready to move on.
