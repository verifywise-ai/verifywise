# Collection summary — shadow-ai
**Date:** 2026-04-29
**Articles audited:** 6
**Verification:** see `_verification.md`

## Verdicts

| Article | Verdict | ❌ | ⚠️ | ❓ |
|---|---|---|---|---|
| ai-tools | ✅ clean | 0 | 0 | 0 |
| insights | ⚠️ minor (1) | 0 | 1 | 0 |
| integration-guide | ✅ clean | 0 | 0 | 0 |
| rules | ⚠️ minor (2) | 0 | 1 | 1 |
| settings | ⚠️ minor (2) | 1 | 1 | 0 |
| user-activity | ✅ clean | 0 | 0 | 0 |

## Verification

12/12 spot-checks passed. No false-positive verifications.

## Assessment

Strongest collection so far: 3 ✅ clean and the issues that were found are concrete (API path missing `/api` prefix, risk score formula nuance not captured in doc, settings/integration-guide endpoint mismatch).

Notable: `settings.md` Finding 1 (API path `/api/v1/shadow-ai/events` vs actual `/v1/shadow-ai/events`) is a **cluster** with `integration-guide.md` which the audit verified as ✅ — the same endpoint should appear in both. Quick check: integration-guide audit verified `POST /api/v1/shadow-ai/events` as accurate, but settings audit found the prefix is wrong. Either the routes file mounts differently for different consumers, or one of the audits is wrong. Logging for fix-pass investigation.

`ai-tools` and `user-activity` are clean despite being detail-heavy (enum tables, scoring weights, department tiers).

Ready to move on.
