# Multi-Agent Remediation Plan: Code-Scanning Alerts

## Mission
Close all 136 open GitHub code-scanning alerts in `verifywise-ai/verifywise` using the VerifyWise agent roster, in focused batches, with frequent commits and pushes.

## Status Dashboard

| Batch | Title | Open Alerts | Primary Agent | Reviewer | Status | PR / Commit Range |
|-------|-------|-------------|---------------|----------|--------|-------------------|
| 0 | Planning & tooling setup | — | Master Orchestrator | — | 🟢 Done | — |
| 4 | Secret / hash exposure cleanup | 3 | Full-Stack Developer | AppSec Engineer | 🟢 Done | pushed |
| 3a | Kubernetes Trivy hardening — safe contexts pass | 47 | DevSecOps Engineer | Cloud Architect / SRE | 🟡 In progress | — |
| 2 | Path injection hardening | 16 | Senior Backend Developer | AppSec Engineer | ⚪ Not started | — |
| 5 | CodeQL JS/TS fixes | 18 | Senior Backend / Full-Stack Developer | AppSec Engineer | ⚪ Not started | — |
| 6 | Remaining Semgrep miscellany | ~10 | Full-Stack Developer | AppSec Engineer | ⚪ Not started | — |
| 1 | SQLAlchemy `text()` parameterization | 58 | Senior Backend Developer | AppSec Engineer / DBA | ⚪ Not started | — |
| 3b | Kubernetes Trivy hardening — runAsNonRoot + Dockerfile USER | 47 | DevSecOps Engineer | Cloud Architect / SRE | ⚪ Not started | — |
| 7 | Validation, regression, docs | — | QA Engineer | AppSec Engineer / Tech Writer | ⚪ Not started | — |

## Git Convention
- Branch: `mo-384-aug-13-vulnerability-issues`
- Commit message: `security(<scope>): fix <rule> in <file>`
- Push rule: push after every commit.

## Batches Detail

### Batch 4 — Secret / hash exposure cleanup (3 alerts) ✅
**Agent:** Full-Stack Developer (lead) + Application Security Engineer (review)  
**Files:**
- `Servers/domain.layer/models/user/users.mock.data.ts`
- `Servers/documentation/mocks/users.md`
**Rule:** `generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash`  
**Done:** Updated TS file to use rule-specific `nosemgrep` annotation; redacted mock hash in docs MD file.

### Batch 3a — Kubernetes Trivy hardening: safe securityContext pass
**Agent:** DevSecOps Engineer (lead) + Cloud Architect (review) + Site Reliability Engineer (ops impact)  
**Files:** `kubernetes/dev/set-resources.yaml`, `kubernetes/base/deployment.yaml`, `kubernetes/base/frontend-nginx-mount.yaml`, `kubernetes/.k8s/*-deployment.yaml`  
**Rules:** KSV-0004, KSV-0003, KSV-0106, KSV-0022  
**Plan:** Add `securityContext.allowPrivilegeEscalation: false` and `capabilities.drop: [ALL]` to every container that is missing them. Do **not** add `runAsNonRoot` in this pass (images currently run as root; see Batch 3b).

### Batch 3b — Kubernetes Trivy hardening: non-root images
**Agent:** DevSecOps Engineer (lead) + Cloud Architect (review) + Site Reliability Engineer (ops impact)  
**Files:** `Servers/Dockerfile`, `Clients/Dockerfile`, `AIGateway/Dockerfile`, `EvalServer/Dockerfile`, plus all Kubernetes manifests  
**Rules:** KSV-0001, KSV-0125, KSV-0110, KSV-0117, KSV-0018, KSV-0016, KSV-0015, KSV-0011  
**Plan:** Add non-root `USER` to Dockerfiles, adjust ports if needed (e.g., frontend nginx 80→8080), then add `runAsNonRoot: true`, `runAsUser`, `runAsGroup`, and image-digest pinning to manifests.

### Batch 2 — Path injection hardening (16 alerts)
**Agent:** Senior Backend Developer (lead) + Application Security Engineer (review)  
**Rule:** CodeQL `py/path-injection`  
**Plan:** Canonicalize paths, enforce base-directory allowlists, reject `..`, avoid `shell=True` with user paths.

### Batch 1 — SQLAlchemy `text()` parameterization (58 alerts)
**Agent:** Senior Backend Developer (lead) + Database Administrator (schema review) + Application Security Engineer (final review)  
**Rule:** `python.sqlalchemy.security.audit.avoid-sqlalchemy-text`  
**Plan:** Replace f-string interpolation inside `text()` with named bind parameters and parameter dictionaries; preserve query semantics and run CRUD tests.

### Batch 5 — CodeQL JS/TS fixes (18 alerts)
**Agent:** Senior Backend / Full-Stack Developer (lead) + Application Security Engineer (review)  
**Rules:** `js/missing-rate-limiting`, `javascript.express.security.audit.xss.direct-response-write`, `javascript.jsonwebtoken.security.jwt-hardcode`, `javascript.sequelize.security.audit.sequelize-injection-express`, `javascript.lang.security.audit.unknown-value-with-script-tag`  
**Plan:** Add rate-limiting middleware, sanitize/escape direct responses, externalize JWT secrets, parameterize Sequelize queries, sanitize DOM/script-tag sinks.

### Batch 6 — Remaining Semgrep miscellany (~10 alerts)
**Agent:** Full-Stack Developer (lead) + Application Security Engineer (review)  
**Rules:** `python.cryptography.security.mode-without-authentication`, `python.django.security.injection.command.subprocess-injection`, `python.lang.security.audit.dynamic-urllib-use-detected`, `py/stack-trace-exposure`  
**Plan:** Use authenticated encryption (AES-GCM), avoid subprocess with user input, validate URLs, avoid leaking stack traces.

### Batch 7 — Validation, regression, documentation
**Agent:** QA Engineer (lead) + Application Security Engineer + Technical Writer  
**Plan:** Re-run Semgrep, Trivy, CodeQL; run affected unit/integration tests; update security runbook and changelog; verify GitHub Security tab shows zero open alerts.

## Execution Order

1. Batch 4 ✅
2. Batch 3a (safe K8s contexts)
3. Batch 2 (path injection)
4. Batch 5 (JS/TS CodeQL)
5. Batch 6 (misc Semgrep)
6. Batch 1 (SQLAlchemy — largest, saved for focused effort)
7. Batch 3b (K8s non-root — requires Dockerfile rebuilds)
8. Batch 7 (validation + docs)

## Notes / Decisions
- Scope is the 136 **open** alerts. Dismissed alerts are out of scope unless they re-open during validation.
- Each file fix = one commit; push immediately after.
