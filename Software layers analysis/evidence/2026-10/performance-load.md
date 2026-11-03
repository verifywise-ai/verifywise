# Performance & Load — Evidence Note 2026-10

**Layer:** Performance / Load
**Date written:** 2026-10-20
**Last re-verified:** 2026-10-20 (post-implementation pass)
**Verification method:** `Test-Path` / `Get-ChildItem` against the working
tree of branch `chore/debora-one-fix-to-all`.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| k6 load-test suite | `Servers/tests/perf/` (`api.k6.js`, `multireplica.k6.js`, `compare-baseline.mjs`, `README.md`) | ✅ exists |
| Nightly perf CI workflow | `.github/workflows/perf-nightly.yml` | ✅ exists |
| k6 perf baselines doc | `docs/deployment/k6-perf-baselines.md` | ✅ exists |
| Multi-replica compose file | `docker-compose.multireplica.yml` | ✅ exists |
| Multi-replica scaling doc | `docs/deployment/multi-replica-scaling.md` | ✅ exists |
| Existing compose variants (context) | `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.override.yml`, `docker-compose.observability.yml` | ✅ exists |

## Verification log

```
First pass (artifacts absent, 🟡 planned-this-cycle):
Test-Path Servers\tests\perf                      -> False  🟡
Test-Path .github\workflows\perf-nightly.yml      -> False  🟡
Test-Path docs\deployment\k6-perf-baselines.md    -> False  🟡
Test-Path docker-compose.multireplica.yml         -> False  🟡
Test-Path docs\deployment\multi-replica-scaling.md -> False 🟡

Re-verification pass (same cycle, post-implementation):
Test-Path Servers\tests\perf\api.k6.js            -> True   ✅
Test-Path Servers\tests\perf\multireplica.k6.js   -> True   ✅
Test-Path Servers\tests\perf\compare-baseline.mjs -> True   ✅
Test-Path .github\workflows\perf-nightly.yml      -> True   ✅
Test-Path docs\deployment\k6-perf-baselines.md    -> True   ✅
Test-Path docker-compose.multireplica.yml         -> True   ✅
Test-Path docs\deployment\multi-replica-scaling.md -> True  ✅
```

Root directory now ships five compose files (the four original ✅ plus the
multi-replica variant ✅).

## Notes

- All five performance artifacts landed in this cycle and were re-verified on
  disk (log above). They are **code-complete but not yet run**: `perf-nightly.yml`
  is report-only (`continue-on-error` + `TODO(#4676)`) and has no recorded
  baseline run, so the benchmark's performance layer stays **evidence-pending**
  until the first scheduled run uploads a `k6-summary` artifact.
- The baseline policy (fail on p95 regression > 20% vs stored baseline) is
  documented in `docs/deployment/k6-perf-baselines.md` and enforced
  incrementally via `Servers/tests/perf/compare-baseline.mjs`.
- Backend health endpoints that the k6 suite and monitors target are in place:
  `Servers/app.ts` (`/health`, `/health/live`, `/health/ready`) — ✅ verified
  by content search.
