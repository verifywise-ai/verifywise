# VerifyWise — Test-Automation Phase 1 Report

**Date:** 2026-08-26  
**Branch:** `mo-388-aug-24-testing-scenarios`  
**Scope:** Complete Phase 1 "Quick Wins" of the VerifyWise test-automation strategy.

---

## Summary

Resumed Phase 1 with the API contract smoke gate failing on swagger/response drift. Fixed the swagger schemas, hardened the gate to strict-by-default, built an enum/label drift sentinel, and updated the strategy doc. Every modified file was committed and pushed individually.

| Phase 1 Item | Status |
|---|---|
| Stabilize critical-journey Playwright specs | ✅ Already green (58/58) |
| API contract smoke gate for top 10 endpoints | ✅ Fixed + strict |
| Enum/label drift sentinel | ✅ Built + warning mode |
| Session replay on staging | ⬜ Not started |

---

## Key Changes

### API contract smoke gate
- **`Servers/scripts/apiContractSmoke.ts`** — switched to strict-by-default; `CONTRACT_STRICT=0` downgrades schema drift to a warning.
- **`Servers/swagger.yaml`** — fixed response drift for the top-10 endpoints:
  - `/users`: camelCase `createdAt`/`updatedAt`, nullable `last_login`/`sso_provider`.
  - `/projects`: nullable `ai_risk_classification`/`type_of_high_risk_role`, added `use_case_*` fields, removed non-emitted fields.
  - `/projectRisks`: allowed `null` on all nullable enum/string fields and added `null` to inline enums; corrected `current_risk_level` casing.
  - Shared enums: `AiRiskClassification` now includes `GPAI`/`General Risk`; `HighRiskRole` reduced to `Deployer`/`Provider`.
- **`Servers/scripts/patchSwaggerForDrift.ts`** — reproducible helper used to apply the ProjectRisk fixes.

### Enum/label drift sentinel
- **`Servers/scripts/generateEnumManifest.ts`** — exports backend enums/const arrays to `Servers/enum-manifest.json`.
- **`Servers/scripts/checkEnumLabelDrift.ts`** — compares the manifest to frontend domain enums in `Clients/src/domain/enums` and to swagger enum schemas. Default warning mode; `ENUM_DRIFT_STRICT=1` fails on drift.
- **`Servers/package.json`** — added `generate:enum-manifest` and `check:enum-drift` scripts.
- **`Clients/src/domain/enums/modelInventory.enum.ts`** — added missing `Rejected` value.
- **`Clients/src/domain/enums/mitigationStatus.enum.ts`** — aligned `Requires review` casing with the backend.

### Documentation
- **`docs/feature-inventory/automation-strategy.md`** — marked Phase 1 items 1, 2, and 3 complete with run commands and strict-mode notes.

---

## Validation

```bash
cd Servers
npm run smoke:api-contract
# → API contract smoke gate passed for all top-10 endpoints.

npm run check:enum-drift
# → 1 drift detected (CurrentRiskLevel casing) but exits 0 in warning mode.
```

- `npm run generate:swagger` preserves the manually corrected `components.schemas`.
- Backend test DB is running; the strict contract gate passes end-to-end.

---

## Known Drift Catalogued

`CurrentRiskLevel` uses title-case `"Very Low risk"` in the frontend while the backend risk calculator uses `"Very low risk"`. The sentinel reports this; flipping `ENUM_DRIFT_STRICT=1` will make it a blocking failure once the UI constants are reconciled.

---

## Commits Pushed (file-by-file)

1. `fix(Servers): align swagger schemas with actual API responses`
2. `feat(Servers): make API contract smoke gate strict by default`
3. `chore(Servers): add swagger drift patch helper`
4. `feat(Servers): generate enum manifest from backend source of truth`
5. `feat(Servers): enum/label drift sentinel`
6. `chore(Servers): seed enum manifest JSON`
7. `chore(Servers): add enum drift npm scripts`
8. `fix(Clients): add Rejected to ModelInventoryStatus enum`
9. `fix(Clients): align MitigationStatus casing with backend`
10. `docs(automation): mark API contract gate and enum drift sentinel complete`

---

## Next Step

Pick one of:
- **Finish Phase 1** — add the staging session-replay configuration (OpenReplay/PostHog snippet + docs).
- **Start Phase 2** — split Playwright into smoke/full suites and add a `playwright-smoke` project.
- **Extend sentinel coverage** — add more enums/labels (incidents, datasets, vendors, framework statuses) and fix remaining drifts so `ENUM_DRIFT_STRICT=1` passes.
