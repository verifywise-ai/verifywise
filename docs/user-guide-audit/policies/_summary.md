# Collection summary — policies
**Date:** 2026-04-29
**Articles audited:** 4
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| policy-approval | ✅ clean | 0 | 0 | 0 |
| policy-management | ❌ significant (1) | 1 | 0 | 0 |
| policy-templates | ❌ significant (3) | 1 | 2 | 0 |
| policy-versioning | ⚠️ minor (2) | 0 | 2 | 0 |

## Verification

7/8 spot-checks passed. **One failed spot-check:** `policy-templates.md` had a verified claim "five categories" — the verification subagent caught that the code enum actually has 6 categories. The original audit miscounted; the article itself is also wrong (says "five"). Finding 1 in policy-templates.md was added retroactively after the verification subagent flagged it.

The verification subagent earned its keep on this collection — it caught a real ❌ that the audit missed.

## Assessment

**Structural finding (logged for fix decisions):** the policies collection has an article-naming problem.
- `policy-approval.ts` is registered with title "Policy templates" and contains template content. Filename suggests approval workflow.
- `policy-templates.ts` is also templates content (different angle).
- There is no article covering actual policy approval workflow, even though the codebase has approvalWorkflow services.

This is collection-level drift, not per-article. The fix decision likely needs to be: rename `policy-approval.ts` to something else (or delete and merge into `policy-templates.ts`), and write a new article for the actual approval workflow.

**Method observation:** policy-templates audit failed on a quantitative claim despite v2's "no rationalized quantitatives" rule — the auditor cited the enum file but counted wrong. This is a different failure mode than rationalization (it's miscounting). Worth tightening the verification subagent's coverage of quantitative claims specifically, since it caught this one.

Ready to move on to ai-detection.
