# Quality & Testing — Evidence Note 2026-10

**Layer:** Quality / Testing
**Date written:** 2026-10-20
**Verification method:** `Get-ChildItem -Recurse` file counts, `Test-Path`
against the working tree of branch `chore/debora-one-fix-to-all`.

## Test-count snapshot (reproducible)

```
(Get-ChildItem Servers\tests -Recurse -File).Count                      = 125 files
(Get-ChildItem Clients\e2e -Filter *.spec.ts -Recurse).Count            =  46 spec files
(Get-ChildItem Clients\e2e -Recurse -File).Count                        =  59 files (all)
Test-Path AIGateway\tests                                               = True
```

Servers/tests breakdown (top-level, `Get-ChildItem -Recurse -Directory`):
`contract/`, `factories/`, `integration/` (incl. `caching/`, `contract/`,
`health/`, `jira-incidents/`, `rate-limiting/`, `tenant-isolation/`),
`mocks/jiraCloud/`, `__tests__/`.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Backend test suite | `Servers/tests/` (125 files) | ✅ exists |
| E2E test suite | `Clients/e2e/*.spec.ts` (46 specs) | ✅ exists |
| AI Gateway test suite | `AIGateway/tests/` | ✅ exists |
| Frontend CI checks | `.github/workflows/frontend-checks.yml` | ✅ exists |
| Backend CI checks | `.github/workflows/backend-checks.yml` | ✅ exists |
| E2E CI workflow | `.github/workflows/e2e-tests.yml` | ✅ exists |
| AI Gateway CI checks | `.github/workflows/aigateway-checks.yml` | ✅ exists |

## Verification log

```
Test-Path Servers\tests                      -> True  ✅
Test-Path Clients\e2e                        -> True  ✅
Test-Path AIGateway\tests                    -> True  ✅
Test-Path .github\workflows\frontend-checks.yml   -> True  ✅
Test-Path .github\workflows\backend-checks.yml    -> True  ✅
Test-Path .github\workflows\e2e-tests.yml         -> True  ✅
Test-Path .github\workflows\aigateway-checks.yml  -> True  ✅
```

## Notes

- Every quality artifact cited is ✅ on disk; counts above were taken
  2026-10-20 and should be re-taken monthly with the same commands so the
  trend is machine-checkable.
- `Clients/e2e/canary/` specs are counted inside the 59 e2e files; the canary
  CI runner is tracked in `reliability-availability.md` (🟡).
- No gaps (❌) this month.
