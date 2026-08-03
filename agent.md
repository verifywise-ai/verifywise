# VerifyWise — Vulnerability Patch Report

**Date:** 2026-08-03  
**Branch:** `mo-381-aug-3-vulnerability-issues` (pushed to origin)

## Changes

Fixed six CodeQL `js/polynomial-redos` alerts (#1194–#1199) in `Servers`:

- **`utils/intakeForm.utils.ts`** — rewrote `generateSlug()` to trim leading/trailing hyphens manually instead of using the ambiguous `/^-+|-+$/g` regex.
- **`controllers/intakeForm.ctrl.ts`** — replaced three inline email regexes with the shared `isEmail()` helper.
- **`controllers/aiTrustIndex.ctrl.ts`** — replaced `EMAIL_RE` with `isEmail()`.
- **`controllers/aiDetectionRepository.ctrl.ts`** — rewrote `parseGitHubUrl()` using `URL` parsing and string splitting to avoid the ambiguous `github.com[/:]([^/]+)/([^/.]+)` regex.

Also updated the same unsafe email pattern in `validation.utils.ts`, `mailValidation.utils.ts`, `aiTrustCentreValidation.utils.ts`, `userValidation.utils.ts`, `shadowAiIngestion.ctrl.ts`, `devAutoBootstrap.ts`, and `documentation/validations/email.md`.

New helper: `Servers/utils/validations/email.utils.ts` uses the safe pattern `^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$` with a 320-character length guard.

## Dependency audit gate fix

The `Lint and Build` job failed because `brace-expansion@1.1.17` is affected by a new high-severity advisory (`GHSA-rgw5-rvv9-x895`). Bumped the `brace-expansion@1` npm override to `1.1.18` in `Servers/package.json` and regenerated `Servers/package-lock.json`. The audit gate now passes; `xlsx` remains the only waived high-severity advisory.

## Verification

- `npm run build` in `Servers` ✅
- `npm test` in `Servers` ✅ — **231 suites passed, 3,448 tests passed**
- `node scripts/security/npm-audit-gate.js .` in `Servers` ✅ — passed (xlsx waived)

## Commits

- `02c71cbd7 fix(servers): remediate CodeQL polynomial ReDoS alerts (#1194-#1199)`
- `02f244380 docs(agent.md): add brief report for ReDoS fixes (#1194-#1199)`
