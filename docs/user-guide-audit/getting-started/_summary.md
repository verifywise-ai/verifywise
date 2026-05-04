# Collection summary — getting-started
**Date:** 2026-04-29
**Articles audited:** 4 (1 from Phase 1, 3 from Phase 2)
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| dashboard | ⚠️ minor (2) | 1 | 0 | 1 |
| installing | ✅ clean | 0 | 0 | 0 |
| quick-start | ⚠️ minor (1) | 1 | 0 | 0 |
| welcome | ✅ clean | 0 | 0 | 0 |

## Verification

8/8 spot-checks passed. Audit subagent demonstrated reliable verification practices: cited files and line ranges are accurate, claims are correctly interpreted from source code, citations directly support the documented claims. No false positives detected.

## Assessment

Cluster finding: **"Controls hub" sidebar item is referenced in BOTH `quick-start.ts` (block 10) AND `dashboard.ts` (block 16) but does not exist in the codebase.** This is the same drift surfacing in two articles — likely a feature was renamed or removed and the docs weren't updated together.

`installing` and `welcome` are clean. `installing` is technically reference-heavy (ports, scripts, env vars) and all check out — good signal that backend/dev-setup docs are current.

`welcome.md` Skipped section was over-eager: items like "PostgreSQL and Redis" infrastructure and the "Other things included" feature list are technically verifiable but were punted to Skip. Not blocking, but the Skip-vs-❓ rule still slips through.

Ready to move on to policies.
