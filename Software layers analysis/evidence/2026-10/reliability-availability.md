# Reliability & Availability — Evidence Note 2026-10

**Layer:** Reliability / Availability
**Date written:** 2026-10-20
**Last re-verified:** 2026-10-20 (post-implementation pass)
**Verification method:** `Test-Path` / `Get-ChildItem` / `Select-String`
against the working tree of branch `chore/debora-one-fix-to-all`.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Backend health routes | `Servers/app.ts` (`/health`, `/health/live`, `/health/ready`, lines 254–267) | ✅ exists |
| Playwright canary specs | `Clients/e2e/canary/` (`canary.spec.ts`, `csp-capture.spec.ts`) | ✅ exists |
| Canary CI workflow | `.github/workflows/canary.yml` | ✅ exists |
| Restore-test CI workflow | `.github/workflows/restore-test.yml` | ✅ exists |
| Disaster recovery guide | `docs/deployment/DISASTER_RECOVERY_GUIDE.md` | ✅ exists |

## Verification log

```
First pass (workflows absent, 🟡 planned-this-cycle):
Test-Path .github\workflows\canary.yml                -> False  🟡
Test-Path .github\workflows\restore-test.yml          -> False  🟡

Re-verification pass (same cycle, post-implementation):
Test-Path Servers\app.ts                              -> True   ✅ (/health, /health/live, /health/ready
                                                                 confirmed via Select-String, lines 254–267)
Get-ChildItem Clients\e2e\canary -Recurse -File       -> 2 files ✅
    - canary.spec.ts
    - csp-capture.spec.ts
Test-Path .github\workflows\canary.yml                -> True   ✅
Test-Path .github\workflows\restore-test.yml          -> True   ✅
Test-Path docs\deployment\DISASTER_RECOVERY_GUIDE.md  -> True   ✅
```

`.github/workflows/` now contains, in addition to the pre-existing
`backend-checks.yml`, `frontend-checks.yml`, `e2e-tests.yml`,
`aigateway-checks.yml`, `codeql.yml`, `deploy-to-production.yml`,
`docker-image.yml`, `semgrep.yml`, `zap-*` and others, the new
`canary.yml` ✅ and `restore-test.yml` ✅.

## Notes

- The canary **specs** and their **scheduled runner** both exist ✅. The first
  canary run against staging is still pending (workflow runs on cron) — the
  Availability score moves only after a recorded green run, per the benchmark
  rules.
- `restore-test.yml` is a monthly cron + manual dispatch: fresh Postgres →
  migrations → seed → timed `pg_dump` → restore → smoke queries, with duration
  reported against the DR guide's RTO tiers (Dev 24h / Standard 4h /
  Enterprise 1h / Mission-critical 15m).
- `docs/deployment/` currently contains: `README.md`,
  `CONFIGURATION_REFERENCE.md`, `DISASTER_RECOVERY_GUIDE.md` ✅,
  `PRODUCTION_DEPLOYMENT_GUIDE.md`, `SECURITY_HARDENING_GUIDE.md`, plus this
  cycle's `uptime-monitoring.md` ✅ and `k6-perf-baselines.md` /
  `multi-replica-scaling.md` (see the performance note).
- Companion monitoring doc: `docs/deployment/uptime-monitoring.md`
  (Uptime Kuma checks against `/health`) — ✅ written and verified this cycle;
  the Kuma service snippet lives in `observability/uptime-kuma/README.md` ✅.
