# VerifyWise — Security & Quality Patch Report

**Date:** 2026-08-04  
**Branch:** `mo-382-aug-4-security-and-quality` (pushed to origin)

## Summary

This branch resolves the remaining CodeQL security and quality alerts in the Aug 4 batch (#1193–#1161) across the TypeScript/JavaScript backend/frontend and the Python GRS/Eval services. It builds on the dependency-security patch (`mo-380`) and the ReDoS remediation (`mo-381`) from Aug 3.

## Changes

### TypeScript/JavaScript — `Servers` / `Clients` / `tools`

- **Dependency & audit hardening**
  - Added `re2js` (pure-JS RE2 engine) to avoid native `re2` build failures on Windows.
  - Patched transitive advisories via overrides: `brace-expansion@1` → `1.1.18`, `brace-expansion@5` → `^5.0.8`, `fast-uri` → `^3.1.5`, `ip-address` → `^10.4.0`, `undici` → `^8.10.0`.
- **API token hashing (#1178)**
  - `Servers/utils/tokens.utils.ts` now uses HMAC-SHA256 with `API_TOKEN_HASH_SECRET` (falls back to `ENCRYPTION_KEY`). Module load fails if neither is set.
  - `Servers/.env.example` documents the new secret.
- **Secret redaction in logs (#1183, #1184)**
  - `Servers/utils/logger/fileLogger.ts` masks API keys, tokens, passwords, and secrets in Winston log output.
- **Rate limiting (#1180)**
  - Added a dedicated generous rate limiter (`1000 req/min` prod, `100k/min` dev/test) to the `/health` endpoint in `Servers/app.ts`.
- **Regex injection / ReDoS defense (#1175, #1176)**
  - `Servers/services/aiDetectionSuppression.service.ts` and `Servers/services/aiDetection/suppressionMatcher.ts` compile user-supplied suppression patterns with `RE2JS` instead of native `RegExp`.
- **Path traversal hardening (#1193)**
  - `Servers/routes/plugin.route.ts` sanitizes plugin bundle filenames and verifies the resolved path stays inside `temp/plugins`.
  - `tools/mrm-simulator/src/dashboard/server.ts` rejects null bytes and `..` segments before resolving static files.
- **Credential leakage (#1181)**
  - `Servers/scripts/seedE2EAdmin.ts` writes the generated admin password to a restricted temp file (`0o600`) instead of stdout.
  - `Clients/e2e/global.setup.ts` reads credentials from that file and deletes it after setup.
- **Tainted format string / i18n (#1167)**
  - `Clients/scripts/i18n-audit.mjs` validates `--lang` against an allowlist (`de`, `fr`, `es`) before using it in a regex.

### Python — `EvalServer` / `GRSModule`

- **Clear-text logging (#1173)**
  - `EvalServer/src/controllers/reports.py` logs provider/model as structured extra fields instead of interpolating them near the API key.
- **Path injection (#1172–#1161)**
  - Added `GRSModule/ui/backend/services/path_utils.py` with `resolve_dataset_path()`.
  - The helper validates `dataset_version` against a safe allowlist, rejects traversal characters, resolves the path under `GRS_ROOT/datasets`, and confirms containment with `is_relative_to`.
  - `watcher.py`, `snapshot.py`, and `results.py` now route all dataset-version file access through the helper. `watcher.py` also validates the `stage` argument (`infer` or `judge`).

## Verification

- `npm run build` in `Servers` ✅
- `npm test` in `Servers` ✅ — **231 suites passed, 3,448 tests passed**
- `node scripts/security/npm-audit-gate.js` ✅ — passed (`xlsx` remains the only waived advisory)

## Commits on this branch

- `3664f26e1` — chore(servers): add re2js and patch transitive audit findings
- `eea5311d5` — fix(servers): use HMAC-SHA256 for API token storage
- `4d07bf2c0` — fix(servers): redact secrets and avoid logging sensitive objects
- `ae1eabe7c` — fix(servers): add generous rate limiter to /health endpoint
- `372fcf650` — fix(servers): evaluate suppression regexes with RE2JS
- `325b709d8` — fix(servers): harden static file serving paths
- `4475d2c37` — fix(dev): write E2E seed credentials to restricted file
- `10c4e349f` — fix(clients): validate --lang argument before building regex
- `70088cfab` — fix(grs-backend): validate dataset_version paths and redact api_key log

## Earlier Aug 3 patches

- `mo-380-aug-3-dependency-security-patch` — bumped React Router, pinned/updated `sanitize-html`, `dompurify`, `sharp`, and documented audit overrides.
- `mo-381-aug-3-vulnerability-issues` — remediated CodeQL polynomial ReDoS alerts #1194–#1199 and bumped `brace-expansion@1` to `1.1.18` for the audit gate.
