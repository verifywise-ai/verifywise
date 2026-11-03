# Security & Verification — Evidence Note 2026-10

**Layer:** Security / Verification
**Date written:** 2026-10-20
**Verification method:** `Test-Path` / `Get-ChildItem` against the working
tree of branch `chore/debora-one-fix-to-all`.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Tenant-isolation integration tests | `Servers/tests/integration/tenant-isolation/` | ✅ exists |
| Dependabot exceptions register | `docs/security/dependabot-exceptions.md` | ✅ exists |
| Secret-scanning CI workflow | `.github/workflows/gitleaks.yml` | ✅ exists |

## Verification log

```
Test-Path Servers\tests\integration\tenant-isolation     -> True ✅ (directory)
Test-Path docs\security\dependabot-exceptions.md         -> True ✅
Test-Path .github\workflows\gitleaks.yml                 -> True ✅
```

Tenant-isolation suite contents (40 entries — 36 `*.isolation.test.ts`
specs plus the shared `tenantIsolation.*` harness/matrix/registry fixtures),
confirmed by `Get-ChildItem` on 2026-10-20. Highlights: `rls.enforcement`,
`role-permissions`, `users`, `vendors`, `incidents`, `assessments`,
`evidence-hub`, `file-entity-links`, `projects-frameworks`,
`tenantIsolation.coverage` and `tenantIsolation.matrix`.

Related security workflows already in `.github/workflows/` (context, ✅):
`codeql.yml`, `semgrep.yml`, `iac-scan.yml`, `sbom.yml`, `zap-baseline.yml`,
`zap-api-scan.yml`.

## Notes

- All three cited artifacts were verified on disk — this layer has the
  strongest evidence base of the four 2026-10 notes.
- The tenant-isolation tests cover cross-tenant access denial for report
  templates; count and expand per month so the "verification" claim keeps
  pace with new entities.
- No gaps (❌) this month.
