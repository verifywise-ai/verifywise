# Multi-Agent Remediation Plan: Code-Scanning Alerts

## Mission
Close all 136 open GitHub code-scanning alerts in `verifywise-ai/verifywise` using the VerifyWise agent roster, in focused batches, with frequent commits and pushes.

## Status Dashboard

| Batch | Title | Open Alerts | Primary Agent | Reviewer | Status | Commit Range |
|-------|-------|-------------|---------------|----------|--------|--------------|
| 0 | Planning & tooling setup | — | Master Orchestrator | — | 🟢 Done | — |
| 4 | Secret / hash exposure cleanup | 3 | Full-Stack Developer | AppSec Engineer | 🟢 Done | pushed |
| 3a | Kubernetes Trivy hardening — safe contexts pass | 47 | DevSecOps Engineer | Cloud Architect / SRE | 🟢 Done | pushed |
| 2 | Path injection hardening | 16 | Senior Backend Developer | AppSec Engineer | 🟢 Done | pushed |
| 5 | CodeQL JS/TS fixes | 18 | Senior Backend / Full-Stack Developer | AppSec Engineer | 🟢 Done | pushed |
| 6 | Remaining Semgrep miscellany | ~10 | Full-Stack Developer | AppSec Engineer | 🟢 Done | pushed |
| 1 | SQLAlchemy `text()` parameterization | 58 | Senior Backend Developer | AppSec Engineer / DBA | 🟢 Done | pushed |
| 3b | Kubernetes Trivy hardening — runAsNonRoot + Dockerfile USER | 47 | DevSecOps Engineer | Cloud Architect / SRE | 🟡 In progress | — |
| 3b | Kubernetes Trivy hardening — runAsNonRoot + Dockerfile USER | 47 | DevSecOps Engineer | Cloud Architect / SRE | ⚪ Not started | — |
| 7 | Validation, regression, docs | — | QA Engineer | AppSec Engineer / Tech Writer | ⚪ Not started | — |

## Git Convention
- Branch: `mo-384-aug-13-vulnerability-issues`
- Commit message: `security(<scope>): fix <rule> in <file>`
- Push rule: push after every commit.

## Batches Detail

### Batch 4 — Secret / hash exposure cleanup (3 alerts) ✅
**Agent:** Full-Stack Developer (lead) + Application Security Engineer (review)  
**Files:** `Servers/domain.layer/models/user/users.mock.data.ts`, `Servers/documentation/mocks/users.md`  
**Rule:** `generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash`  
**Done:** Updated TS file to use rule-specific `nosemgrep` annotation; redacted mock hash in docs MD file.

### Batch 3a — Kubernetes Trivy hardening: safe securityContext pass ✅
**Agent:** DevSecOps Engineer (lead) + Cloud Architect (review) + Site Reliability Engineer (ops impact)  
**Files:** `kubernetes/dev/set-resources.yaml`, `kubernetes/base/deployment.yaml`, `kubernetes/base/frontend-nginx-mount.yaml`  
**Rules:** KSV-0004, KSV-0003, KSV-0106, KSV-0022  
**Done:** Added `securityContext.allowPrivilegeEscalation: false` and `capabilities.drop: [ALL]` to every container that was missing them.

### Batch 2 — Path injection hardening (16 alerts) ✅
**Agent:** Senior Backend Developer (lead) + Application Security Engineer (review)  
**Files:** `GRSModule/ui/backend/services/path_utils.py`, `watcher.py`, `snapshot.py`, `routers/results.py`  
**Rule:** CodeQL `py/path-injection`  
**Done:** Added `assert_within()` sink-level guard that resolves paths and verifies `is_relative_to()` before any file operation.

### Batch 5 — CodeQL JS/TS fixes (18 alerts) ✅
**Agent:** Senior Backend / Full-Stack Developer (lead) + Application Security Engineer (review)  
**Files:** `Servers/middleware/rateLimit.middleware.ts`, `Servers/routes/webhook.route.ts`, `AIGateway/src/routers/mcp_proxy.py`  
**Rules:** `js/missing-rate-limiting`, `py/stack-trace-exposure`  
**Done:** Added `webhookLimiter` and applied it to GitHub webhook route; returned generic JSON-RPC error instead of exception string.

### Batch 6 — Remaining Semgrep miscellany (~10 alerts) ✅
**Agent:** Full-Stack Developer (lead) + Application Security Engineer (review)  
**Files:** `EvalServer/src/controllers/reports.py`, `AIGateway/src/utils/encryption.py`, `AIGateway/tests/e2e_mock_agentic_system.py`, `Servers/controllers/shareLink.ctrl.ts`, `GRSModule/ui/backend/services/runner.py`, `Clients/src/presentation/components/RichTextRenderer/__tests__/RichTextRenderer.test.tsx`  
**Rules:** `python.cryptography.security.mode-without-authentication`, `python.lang.security.audit.dynamic-urllib-use-detected`, `javascript.sequelize.security.audit.sequelize-injection-express`, `python.django.security.injection.command.subprocess-injection`, `javascript.lang.security.audit.unknown-value-with-script-tag`  
**Done:** Annotated safe legacy-CBC fallback, validated test urllib, static parameterized Sequelize queries, validated subprocess command, and intentional script-tag test payload with rule-specific `nosemgrep` justifications.

### Batch 1 — SQLAlchemy `text()` parameterization (58 alerts) 🟡
**Agent:** Senior Backend Developer (lead) + Database Administrator (schema review) + Application Security Engineer (final review)  
**Rule:** `python.sqlalchemy.security.audit.avoid-sqlalchemy-text`  
**Plan:** Replace f-string interpolation inside `text()` with named bind parameters and parameter dictionaries; preserve query semantics and run CRUD tests.

### Batch 3b — Kubernetes Trivy hardening: non-root images
**Agent:** DevSecOps Engineer (lead) + Cloud Architect (review) + Site Reliability Engineer (ops impact)  
**Files:** `Servers/Dockerfile`, `Clients/Dockerfile`, `AIGateway/Dockerfile`, `EvalServer/Dockerfile`, plus all Kubernetes manifests  
**Rules:** KSV-0001, KSV-0125, KSV-0110, KSV-0117, KSV-0018, KSV-0016, KSV-0015, KSV-0011  
**Plan:** Add non-root `USER` to Dockerfiles, adjust ports if needed (e.g., frontend nginx 80→8080), then add `runAsNonRoot: true`, `runAsUser`, `runAsGroup`, and image-digest pinning to manifests.

### Batch 7 — Validation, regression, documentation
**Agent:** QA Engineer (lead) + Application Security Engineer + Technical Writer  
**Plan:** Re-run Semgrep, Trivy, CodeQL; run affected unit/integration tests; update security runbook and changelog; verify GitHub Security tab shows zero open alerts.

## Execution Order

1. Batch 4 ✅
2. Batch 3a ✅
3. Batch 2 ✅
4. Batch 5 ✅
5. Batch 6 ✅
6. Batch 1 (SQLAlchemy — 58 alerts)
7. Batch 3b (K8s non-root — requires Dockerfile rebuilds)
8. Batch 7 (validation + docs)

## Notes / Decisions
- Scope is the 136 **open** alerts. Dismissed alerts are out of scope unless they re-open during validation.
- Each file fix = one commit; push immediately after.
- `nosemgrep` annotations are used only where the code is demonstrably safe and the rule cannot be satisfied by a code change without breaking legacy compatibility or test intent.
