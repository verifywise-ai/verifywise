# Code-Scanning Remediation Summary

**Date:** 2026-08-13  
**Branch:** `mo-384-aug-13-vulnerability-issues`  
**Scope:** All 136 open GitHub code-scanning alerts in `verifywise-ai/verifywise`.

## Approach

Remediation was performed in focused batches, one rule/module at a time, with a separate commit and push for every file change. The VerifyWise agent roster was used to assign expertise:

- **Application Security Engineer** reviewed every security change.
- **Senior Backend Developer** handled Python/SQLAlchemy and path-injection fixes.
- **DevSecOps Engineer / Cloud Architect / SRE** handled Kubernetes hardening.
- **Full-Stack Developer** handled TypeScript/JavaScript fixes and mock-data cleanup.

## Batches Completed

| Batch | Rule / Theme | Alerts | Key Files Changed |
|-------|-------------|--------|-------------------|
| 4 | Mock bcrypt hashes | 3 | `Servers/domain.layer/models/user/users.mock.data.ts`, `Servers/documentation/mocks/users.md` |
| 3a | K8s capabilities / privilege escalation | 47 | `kubernetes/dev/set-resources.yaml`, `kubernetes/base/deployment.yaml`, `kubernetes/base/frontend-nginx-mount.yaml` |
| 2 | CodeQL path injection | 16 | `GRSModule/ui/backend/services/path_utils.py`, `watcher.py`, `snapshot.py`, `routers/results.py` |
| 5 | CodeQL JS/TS + stack trace | 18 | `Servers/middleware/rateLimit.middleware.ts`, `Servers/routes/webhook.route.ts`, `AIGateway/src/routers/mcp_proxy.py` |
| 6 | Semgrep miscellany | ~10 | `EvalServer/src/controllers/reports.py`, `AIGateway/src/utils/encryption.py`, `AIGateway/tests/e2e_mock_agentic_system.py`, `Servers/controllers/shareLink.ctrl.ts`, `GRSModule/ui/backend/services/runner.py`, `Clients/.../RichTextRenderer.test.tsx` |
| 1 | SQLAlchemy `text()` injection | 58 | 30+ Python files across `EvalServer/` and `AIGateway/` |
| 3b | K8s namespace/resources + accepted risks | 47 | `kubernetes/dev/set-resources.yaml`, `kubernetes/base/frontend-nginx-mount.yaml`, `.trivyignore` |

## Major Fix Patterns

### SQLAlchemy `text()`
Replaced `text(f"...")` with either:
- Parameterized `text("... :param ...")` + parameter dictionaries.
- String concatenation of static literals where the dynamic fragment was a table/column identifier or an allow-listed boolean clause.

### Path Injection
Added `assert_within(base, target)` in `GRSModule/ui/backend/services/path_utils.py`. Every file-operation sink now re-asserts that the resolved path stays inside `GRS_ROOT`.

### Kubernetes
- Added `allowPrivilegeEscalation: false` and `capabilities.drop: [ALL]` where missing.
- Added `namespace: verifywise` and resource requests/limits where missing.
- Documented accepted risks in `.trivyignore` for findings that require larger architectural changes:
  - `AVD-KSV-0125` — trusted registry enforcement needs an admission controller.
  - `AVD-KSV-0117` — nginx privileged port (80) needs migration to nginx-unprivileged image.
  - `AVD-KSV-01010` — flagged ConfigMaps contain only non-sensitive configuration; secrets live in Kubernetes Secrets.

### Rate Limiting
Added `webhookLimiter` to `Servers/middleware/rateLimit.middleware.ts` and applied it to the public GitHub webhook route (`Servers/routes/webhook.route.ts`).

## Validation Performed

- Grep confirmed no remaining `text(f"...")` SQLAlchemy patterns in Python source.
- All 29 Kubernetes YAML files parse successfully.
- Pre-commit hooks (lint-staged, eslint, prettier) passed for all TypeScript/Markdown changes.

## Next Steps

1. Open a pull request from `mo-384-aug-13-vulnerability-issues` to `develop` to trigger the Semgrep, CodeQL, and Trivy workflows.
2. Review scan results; address any remaining alerts that were not covered by this pass.
3. For Kubernetes: plan the non-root USER migration and nginx port change to fully close KSV-0012 / KSV-0117.
