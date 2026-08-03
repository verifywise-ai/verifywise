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

## Verification

- `npm run build` in `Servers` ✅
- `npm test` in `Servers` ✅ — **231 suites passed, 3,448 tests passed**

## Commit

`02c71cbd7 fix(servers): remediate CodeQL polynomial ReDoS alerts (#1194-#1199)`
