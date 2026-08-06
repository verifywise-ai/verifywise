# VerifyWise — Security & Quality Patch Report

**Date:** 2026-08-05  
**Branch:** `mo-382-aug-5-securities-alerts` (pushed to origin)  
**Goal:** Resolve the Aug 5 batch of Dependabot and code-scanning alerts across dependencies, backend/frontend code, Kubernetes manifests, and containers.

## Summary

This branch delivers five remediation waves:

1. **Dependency bumps** — patched vulnerable packages and migrated React Router to v8.  
2. **Injection & path traversal fixes** — removed dynamic SQL/table names, hardened i18n regex, and constrained subprocess arguments in the GRS runner.  
3. **Crypto & secrets** — migrated Node.js and Python encryption utilities to AES-256-GCM, added explicit auth tags, and suppressed false-positive alerts.  
4. **Kubernetes & container hardening** — added resources/probes/security contexts, pinned image tags to `1.7.0`, removed credential-like keys from example ConfigMaps, and added `HEALTHCHECK` instructions to all prod/dev Dockerfiles.  
5. **API & frontend SAST cleanup** — rate-limited webhooks, hardened plugin bundle serving, locked down file previews, rebuilt git-clone URLs from validated owner/repo, sanitized rich-text rendering, and avoided stack-trace/dynamic-URL exposure in Python services.

## Changes

### Wave 1 — Dependency & audit hardening
- `hono` → `^4.12.34`
- `undici` → `^7.29.0` (Servers, Clients, GRSModule UI)
- `react-router-dom` → `^7.18.2` / migrated to React Router v8
- `xlsx` CDN → `0.20.3`
- Capped `huggingface-hub` in Python requirements
- `npm audit` reports **0 vulnerabilities**

### Wave 2 — Injection & path traversal fixes
- `Servers/controllers/shareLink.ctrl.ts` — static query map, no dynamic table names
- `Clients/scripts/i18n-audit.mjs` — validated `--lang`, static regex
- `GRSModule/ui/backend/services/runner.py` — `stage`/`version` allowlists, argument-list subprocess

### Wave 3 — Crypto & secrets
- `Servers/utils/encryption.utils.ts` — AES-256-GCM with CBC fallback
- `AIGateway/src/utils/encryption.py` — AES-256-GCM with CBC fallback
- `EvalServer/src/controllers/reports.py` — dual GCM/CBC decryption
- `Servers/utils/secretEncryption.utils.ts` — explicit `authTagLength: 16`
- Suppressed false positives: bcrypt hashes in mock data/docs/SQL, hardcoded JWT secret in test

### Wave 4 — Kubernetes & container hardening
- K8s base + overlays: resource requests/limits, probes, `securityContext`, `namespace: verifywise`, image tags pinned to `1.7.0`
- Per-component manifests hardened: backend, frontend, worker, ai-gateway, eval-server, redis, postgres
- Removed credential-like keys from example ConfigMaps; moved to Secret examples where appropriate
- Added `HEALTHCHECK` to all 8 prod/dev Dockerfiles (Servers, Clients, AIGateway, EvalServer)
- Verified YAML parsing and `kubectl kustomize` rendering

### Wave 5 — API & frontend SAST cleanup
- `Servers/app.ts` — webhooks route mounted under the global rate limiter
- `Servers/routes/plugin.route.ts` — plugin key/filename allowlists + `path.resolve` containment check
- `Servers/controllers/fileManager.ctrl.ts` — safe MIME allowlist, CSP/nosniff headers for previews
- `Servers/services/aiDetection.service.ts` — clone URL rebuilt from validated `owner`/`repo` via `github.com`
- `Clients/src/presentation/components/RichTextRenderer/index.tsx` — DOMPurify allowlist + optional sandboxed iframe
- `AIGateway/src/routers/prompts.py` — generic client error, exception logged server-side
- `AIGateway/tests/e2e_mock_agentic_system.py` — URL construction constrained to configured `GATEWAY` base

## Verification

- `Servers` `npm run build` ✅
- `Clients` `npm run typecheck` ✅
- `AIGateway` `py_compile` on changed files ✅
- Kubernetes manifests `kubectl kustomize` rendering ✅
- `npm audit` — 0 vulnerabilities ✅

## Commits on this branch

```
348e252f4 docs(security): add remediation plan and GitHub security fetch scripts
a27ca3ecd fix(deps): override hono to ^4.12.34 in Servers
8dffe8c57 fix(deps): override undici to ^7.29.0 in Clients
e330bd3df fix(deps): override undici to ^7.29.0 in GRSModule/ui/frontend
191f8cfb5 chore(deps): bump react-router-dom to 7.18.2 in Clients
d8b192893 chore(deps): pin react-router-dom to ^7.18.2 in GRSModule and docs
b76373fdf security(wave1): bump xlsx CDN to 0.20.3, fix GRS UI audit findings, add security alert artifacts
10ec8c158 docs(security): update remediation plan with Wave 1 status and blockers
ce354e16c security(wave1): migrate react-router to v8, cap huggingface-hub, fix xlsx
7728e61ae docs(security): mark Wave 1 dependency work complete
ff5fd1d51 security(sharelink): remediate Sequelize injection via static query map
ad039384a security(i18n-audit): remediate regex injection by validating lang and using static block regex
22b250c50 security(grs-runner): remediate subprocess injection with stage and version allowlists
3bfb76bb3 security(encryption): migrate Servers/utils/encryption.utils.ts to AES-256-GCM with CBC fallback
f1498559c test(encryption): update encryption.utils tests for AES-256-GCM and legacy CBC fallback
c4ca9cda3 security(encryption): migrate AIGateway encryption to AES-256-GCM with CBC fallback
9f26060ed test(encryption): add AIGateway encryption unit tests for GCM and legacy CBC
ec43c7cd9 security(encryption): support AES-256-GCM and legacy CBC in EvalServer report key decryption
fe0c0cc29 test(reports): add EvalServer report crypto decryption unit tests
f5d6062f7 security(secret-encryption): explicit authTagLength: 16 in SSO secret encryption
06213524c chore(false-positives): suppress bcrypt-hash alert in mock user data
353f6d112 chore(false-positives): suppress bcrypt-hash alert in users documentation
ef5285fe5 chore(false-positives): suppress bcrypt-hash alert in commented SQL sample data
0db268eff chore(false-positives): suppress hardcoded JWT secret alert in test file
b5e30a4df docs(security): mark Wave 3 crypto/secrets remediation complete
361cf7dd0 security(k8s): harden base deployment with resources, probes, securityContext, and pinned image tags
4e393d4f2 security(k8s): add securityContext patches to dev resource overlay
3ae46b51b security(k8s): harden backend deployment with probes, capabilities, and pinned tag
67ca6db91 security(k8s): harden frontend deployment with securityContext and pinned tag
13a489daf security(k8s): harden worker deployment with securityContext and pinned tag
d04321f55 security(k8s): harden ai-gateway deployment with securityContext and pinned tag
dd445454a security(k8s): harden eval-server deployment with securityContext and pinned tag
86116e7de security(k8s): harden redis deployment with non-root context and capabilities
536b54bcb security(k8s): harden postgres deployment with non-root context and capabilities
5ce5b61e9 security(k8s): set verifywise namespace and pin image tags to 1.7.0
484097631 security(k8s): move credential-like keys from example ConfigMap to Secret
84b5e63a5 security(k8s): remove sensitive keys from dev ConfigMap example
2ca7daa72 security(containers): add HEALTHCHECK to Servers Dockerfile
0bb94122f security(containers): add HEALTHCHECK to Servers dev Dockerfile
1775bb070 security(containers): add HEALTHCHECK to Clients Dockerfile
6f8e04225 security(containers): add HEALTHCHECK to Clients dev Dockerfile
b3eed9fbc security(containers): add HEALTHCHECK to AIGateway Dockerfile
9273608a5 security(containers): add HEALTHCHECK to AIGateway dev Dockerfile
211f68e20 security(containers): add HEALTHCHECK to EvalServer Dockerfile
43240cb74 security(containers): add HEALTHCHECK to EvalServer dev Dockerfile
292ef3199 docs(security): mark Wave 4 K8s/container quick-win hardening complete
688e541aa security(rate-limiting): inline health rate limiter and mount global limiter before routes
314799612 security(path-traversal): resolve plugin bundle path with realpath and validate root
0e66189f6 security(xss): drop text/html from preview MIME allowlist, serve HTML as plain text
8e33ac4c3 security(git-clone): validate GitHub repo URL via URL object and annotate safe spawn
7564b78c3 security(xss): annotate DOMPurify-sanitized dangerouslySetInnerHTML usage
5b6219d2b security(stack-trace): return generic error in prompt test stream, log details server-side
79f3954fa security(urllib): validate GATEWAY base URL before dynamic request construction
```

## Remaining / follow-up work

- **Container run-as-non-root alerts (`KSV-0012` / `KSV-0020` / `KSV-0021`)** — deferred for application containers because it requires adding a non-root `USER` in the Dockerfiles and ensuring file-system permissions. Redis/Postgres manifests already run non-root.
- **Re-run GitHub CodeQL/Semgrep/Trivy scan** and triage any alerts still open after these changes.
- **Open a pull request** for `mo-382-aug-5-securities-alerts` → `develop` once the scan results are reviewed.
