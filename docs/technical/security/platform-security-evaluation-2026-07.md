# VerifyWise Platform Security Evaluation

**Date:** 2026-07-21
**Branch:** `mo-374-jul-20-advanced-security-scanning`
**Scope:** RLS & tenant isolation · Authentication & Authorization · HTTPS/TLS · OWASP ZAP / Burp Suite readiness · CI security automation
**Method:** Read-only, evidence-based code & configuration audit across `Servers/`, `Clients/`, `AIGateway/`, `EvalServer/`, `EvaluationModule/`, `GRSModule/`, `kubernetes/`, `ansible/`, `.github/`

---

## Executive Summary

**Overall posture: GOOD architecture, MODERATE residual risk.** VerifyWise is unusually mature for its stage — refresh-token rotation with theft detection, fail-closed rate limiting, a near-complete OpenAPI spec, a textbook authenticated ZAP API scan, tenant-isolation integration tests, and well-documented RLS rollout plans. The platform is **not** exposed by obvious injection/XSS holes (explicitly verified clean).

The risk concentrates in four themes:

1. **Committed secrets** — `.env.prod`, `.env.dev`, `kubernetes/dev/secrets.env` were tracked in git (remediated: untracked in this branch; rotation still required).
2. **Enforcement gaps** — RLS policies installed but inert (app connects as table owner, `app.current_org` never set); several security scans existed but could not fail the build.
3. **Authorization consistency** — a dead-code SuperAdmin guard left a privilege-escalation path in `PATCH /api/users/:id`; many write routes lacked `authorize()` checks.
4. **Coverage gaps** — AIGateway & GRSModule had no CI; Python dependencies largely unpinned and unscanned; ~150 tenant-scoped tables deferred from isolation coverage.

### Severity Rollup (at time of audit)

| Severity | Count | Headline items |
|---|---|---|
| Critical | 1 | Production secrets committed to git |
| High | 9 | RLS inert; superuser DB role; privilege escalation via `roleId:5`; tracked env files; RBAC gaps; NodePort TLS bypass; unbounded multer uploads; AIGateway/GRSModule zero CI; Python dep blind spot |
| Medium | 13 | localStorage access tokens; no MFA; non-blocking scans; report-only CSP; error-message leakage; no global rate limiter; SSO config IDOR; SuperAdmin cross-org reads unaudited |
| Low | 10 | Timing-unsafe key comparisons; JWT expiry non-standard; password policy; swagger.old.yaml; k8s securityContext gaps; action pinning |

---

## 1. RLS & Multi-Tenant Data Isolation

**Verdict:** RLS existed but was **inert**. Phase 1 (migration `20260720100200-rls-policies-registry-tables.js`) installs `ENABLE ROW LEVEL SECURITY` + `tenant_isolation` policy on 33 registry tables, gated on `current_setting('app.current_org')`. Phase 2 was not implemented: `app.current_org` was never set in runtime code, and the app connects as the table owner, which bypasses RLS.

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| 1.1 | **High** | RLS policies installed but never enforced (owner connection + unset GUC) | `Servers/database/migrations/20260720100200-rls-policies-registry-tables.js:10-12`; `docs/technical/security/rls-rollout.md:3` | Execute Phase 2 per `rls-rollout.md`: non-owner `verifywise_app` role + `SET LOCAL app.current_org` per request |
| 1.2 | **High** | App connects to Postgres as superuser/owner (`postgres`) in all services | `Servers/.env.example:18`, `AIGateway/.env.example:1`, `EvalServer/.env.example:9`, `docker-compose.yml:9-10` | Dedicated non-superuser runtime role; owner role for migrations only |
| 1.3 | **High** | ~150 tenant-scoped tables deferred from isolation coverage | `docs/technical/security/rls-rollout.md:63-68`; `Servers/scripts/auditTenantIsolationCoverage.ts:73` | Burn down `deferredScopedTables` in waves; prioritize PII/secret-bearing tables |
| 1.4 | Medium | Unauthenticated SSO config lookup returns IdP `tenantId`/`clientId` for arbitrary org ID | `Servers/routes/ssoConfig.route.ts:26`; `Servers/controllers/ssoConfig.ctrl.ts:114-132` | Resolve org from email domain or return only `{isEnabled}` |
| 1.5 | Medium | SuperAdmin cross-org reads via `X-Organization-Id` unrestricted/unaudited | `Servers/middleware/auth.middleware.ts:192-199` | Record cross-org reads in audit ledger centrally |
| 1.6 | Medium | Python service tenant isolation trusts spoofable headers; AIGateway key check not constant-time | `AIGateway/src/middlewares/tenant.py:31-36`, `auth.py:8-12` | Network-policy isolation; `hmac.compare_digest` |
| 1.7 | Medium | Some util queries lack org filters, relying on controller pre-checks | `Servers/utils/user.utils.ts:138,402,541,583`; `slackWebhook.utils.ts:132` | RLS backstops all; add org predicates in utils |
| 1.8 | Low | `audit_ledger` hash-fix UPDATE lacks org filter | `Servers/utils/auditLedger.utils.ts:190` | Add `AND organization_id = :organizationId` |
| 1.9 | Low | Compliance endpoints fail-open when `req.organizationId` missing | `Servers/controllers/compliance.ctrl.ts:88,154` | Fail closed |

**Done well:** deny-by-default tenant runbook; correct RLS policy design; JWT-derived org verified against live DB; controllers never trust client org IDs; CI schema-drift gate; 27-file isolation test matrix.

---

## 2. Authentication & Authorization

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| 2.1 | **High** | Org Admin can self-escalate to SuperAdmin via `PATCH /api/users/:id` with `roleId: 5`; guard only in never-routed `updateUserRole` | `Servers/controllers/user.ctrl.ts:906-977`, guard `:1446`; `Servers/routes/user.route.ts:205` | Reject `roleId === 5` in `updateUserById`; integration test |
| 2.2 | **High** | Tracked environment files in git | `git ls-files`: `.env.dev`, `.env.prod`, `kubernetes/dev/secrets.env` | Untrack + rotate all secrets |
| 2.3 | **High** | RBAC inconsistent — many write/admin routes require only `authenticateJWT` | `Servers/routes/aiApp.route.ts:22-37`, `aiApproval.route.ts:17-18`, `aiContent.route.ts:17`, `aiAudit.route.ts:13`, `agentDiscovery.route.ts:30-45` | `authorize([...])` on every write route |
| 2.4 | Medium | Access token in `localStorage` (redux-persist) | `Clients/src/application/redux/store.ts:36-39` | In-memory + httpOnly cookie; or shorter TTL + strict CSP |
| 2.5 | Medium | No MFA, no per-account lockout | `Servers/routes/user.route.ts:146-152` | TOTP MFA for Admin/SuperAdmin; per-account backoff |
| 2.6 | Medium | Access tokens not revocable server-side | `Servers/middleware/auth.middleware.ts:144-161` | Shorter TTL or denylist on sensitive routes |
| 2.7 | Low | Non-constant-time shared-secret comparisons | `Servers/routes/internal.route.ts:28`; `AIGateway/src/middlewares/auth.py:11` | `crypto.timingSafeEqual` / `hmac.compare_digest` |
| 2.8 | Low | `ignoreExpiration: true` + custom `expire`; algorithms not pinned | `Servers/utils/jwt.utils.ts:55-61,94-106` | Pin `algorithms: ["HS256"]` |
| 2.9 | Low | Password policy: max 20 chars, no special char; bcrypt cost 10; registration debug logging | `userValidation.utils.ts:72-114`; `user.model.ts:208`; `register.middleware.ts:47-55` | Max 128, special char, cost 12, remove debug logs |
| 2.10 | Low | Unauthenticated `/api/organizations/exists`, `/api/version` | `organization.route.ts:53`; `version.route.ts:23` | Acceptable if intentional |

**Done well:** refresh-token rotation + reuse detection; fail-closed rate limiters; revocable API tokens; live role-consistency check; hardened password reset; Python services fail closed; webhook HMAC; no hardcoded secrets in source.

---

## 3. HTTPS / TLS & Transport Security

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| 3.1 | **Critical** | Production/dev env files with secrets committed to git | `.env.prod`, `.env.dev`, `kubernetes/dev/secrets.env`; `.gitignore:6` only exact `.env` | Untrack, rotate, gitignore `.env.*` with `!.env.*.example` |
| 3.2 | **High** | NodePort services expose plain-HTTP services on all node IPs | `kubernetes/.k8s/nodeport-services.yaml:19,39,59,79` | Delete or dev-gate; ClusterIP + ingress only |
| 3.3 | **High** | Alternate ingress: CORS `*` **with** credentials; TLS annotations commented | `kubernetes/.k8s/ingress.yaml:13-21,33-37` | Quarantine as dev-only |
| 3.4 | Medium | Frontend nginx: no HSTS, HTTP-only | `Clients/nginx.conf:2,8-15` | Document invariant; HSTS at TLS layers |
| 3.5 | Medium | CSP report-only + `unsafe-inline`; `connect-src` allows any `http:` | `Clients/nginx.conf:15` | Tighten + enforce |
| 3.6 | Medium | TLS versions/ciphers pinned only in docs | `docs/deployment/SECURITY_HARDENING_GUIDE.md:72` | `ssl_protocols TLSv1.2 TLSv1.3` in deployed configs |
| 3.7 | Medium | Refresh cookie `SameSite=None` in production | `Servers/utils/auth.utils.ts:64-70` | Lax/Strict if same-site; Origin check |
| 3.8 | Low | Realistic example secrets in `secrets-example.yaml` | `kubernetes/.k8s/secrets-example.yaml:35-36` | Obvious placeholders |
| 3.9 | Low | K8s `containerPort: 30` typo; missing `securityContext` | `kubernetes/base/deployment.yaml:135` | Fix port; add hardening |
| 3.10 | Info | Internal service traffic plain HTTP | `docker-compose.yml:53` | Acceptable (same network + internal key) |

---

## 4. OWASP ZAP / Burp Suite Readiness

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| 4.1 | **High** | 5 unbounded `multer.memoryStorage()` configs → memory-exhaustion DoS | `Servers/routes/aiTrustCentre.route.ts:4`, `eu.route.ts:4`, `iso42001.route.ts:5`, `iso27001.route.ts:5`, `nist_ai_rmf.route.ts:24` | Shared bounded upload factory |
| 4.2 | **High** | ZAP baseline can never fail (`-I \|\| true`) | `.github/workflows/zap-baseline.yml:132,141` vs `.zap/rules.tsv:19-25` | Honor rules.tsv FAIL thresholds |
| 4.3 | Medium | API drift checker not in CI | `Servers/scripts/checkApiDrift.ts` | Add to `backend-checks.yml` |
| 4.4 | Medium | Raw `error.message` in 500 responses (7 controllers) | `policy-linked-objects.ctrl.ts:177`, `githubToken.ctrl.ts` ×4, `aiDetection.ctrl.ts`, `aiDetectionSuppression.ctrl.ts` | Generic 500 message |
| 4.5 | Medium | No global rate limiter (~690/706 endpoints unprotected) | `Servers/middleware/rateLimit.middleware.ts:47-98` | Loose global limiter in `app.ts` |
| 4.6 | Low | Swagger UI in non-prod — verify staging env | `Servers/app.ts:257-259` | Confirm staging `NODE_ENV=production` |
| 4.7 | Info | Stale `swagger.old.yaml` committed | `Servers/swagger.old.yaml` | Delete |

**Verified CLEAN:** SQL injection, XSS (DOMPurify), CORS allowlist, stack-trace leakage, webhook HMAC, Python service exposure.

### ZAP/Burp test plan
- **ZAP CI:** PR baseline honoring FAIL rules; nightly authenticated API scan + drift check; weekly authenticated UI full scan; targeted public-surface active scan.
- **Burp manual priority:** file uploads → tenant IDOR → AuthZ matrix → auth flows → LLM proxy surface → public share/intake.

---

## 5. CI Security Scanning Automation

**Existing:** npm audit (backend, blocking) · dependency-review (non-blocking) · tenant-isolation tests (blocking) · gitleaks (blocking) · Semgrep (non-blocking) · Trivy IaC (blocking) · Trivy images on release (blocking) · ZAP baseline (non-blocking) · ZAP API scan (blocking) · pytest EvalServer/EvaluationModule · Dependabot (npm×2, pip×1, docker×2, actions).

| # | Severity | Gap | Remediation |
|---|---|---|---|
| 5.1 | **High** | AIGateway & GRSModule zero CI | Add pytest workflows |
| 5.2 | **High** | Python dep blind spot: no pip-audit, Dependabot 1/4 pip dirs, unpinned reqs | pip-audit everywhere; extend Dependabot; hash pinning |
| 5.3 | **High** | Semgrep/dependency-review/ZAP baseline non-blocking | Flip to blocking after triage |
| 5.4 | Medium | No CodeQL | Add `codeql.yml` |
| 5.5 | Medium | Frontend npm audit not on PRs | Move into PR job |
| 5.6 | Medium | No SBOM | CycloneDX/anchore on release |
| 5.7 | Medium | Pre-commit prettier-only | gitleaks `--staged` |
| 5.8 | Medium | No CODEOWNERS | Add + required checks |
| 5.9 | Low-Med | Nightly images unscanned | Trivy in `docker-image-test.yml` |
| 5.10 | Low | Mutable action tags; `registry: ghcr` typo | SHA-pin; fix typo |

---

## Remediation Roadmap

- **P0:** purge/rotate secrets · fix `roleId:5` escalation · bound multer uploads
- **P1:** RLS Phase 2 + runtime DB role · RBAC sweep · NodePort removal · flip CI gates · pip-audit + Dependabot + Python CI
- **P2:** deferred-table burndown · MFA/lockout · enforced CSP · CodeQL/SBOM/CODEOWNERS · first Burp engagement · global rate limiter · generic 500s · constant-time comparisons

*Remediation implementation is tracked in commit history on this branch (2026-07-21 onward).*

---

## Remediation Status (2026-07-21) — 24 commits on `mo-374-jul-20-advanced-security-scanning`

### ✅ Remediated

| Finding | Fix | Commit |
|---|---|---|
| 3.1/2.2 Critical secrets in git | Untracked `.env.dev`, `.env.prod`, `kubernetes/dev/secrets.env`; gitignore extended | `832df5fef` |
| 2.1 SuperAdmin escalation (BFLA) | `roleId===5` rejected + SuperAdmin-role modification blocked + role-existence validation in `updateUserById`; 6 new tests | `ab6e09bda` |
| 4.1 Unbounded multer uploads | Shared `createMemoryUpload()` factory (30MB/10 files/MIME allowlist) applied to all 5 routes + `file.route.ts` | `a234fbbd7` |
| 2.3 RBAC gaps | `authorize()` enforced on aiApp/aiApproval/aiContent/aiAudit/agentDiscovery write routes | `3b963ba2a` |
| 4.4 Raw `error.message` in 500s | Generic messages in all 7 controllers | `315afba81` |
| 2.7/1.6 Timing-unsafe key comparisons | `crypto.timingSafeEqual` + `hmac.compare_digest` | `8dcd814f8` |
| 5.3 Non-blocking CI gates | dependency-review + Semgrep (baseline-diff) now blocking | `e1eb5ed0d`, `75300976c` |
| 4.2 ZAP baseline never failed | rules.tsv FAIL rules honored (backend scan); config mount fixed | `510f0afa0` |
| 5.2 Python dep blind spot | pip-audit in all Python CI; Dependabot pip ×4 + docker ×4 | `f51dd80db` |
| 5.1 AIGateway/GRSModule zero CI | New `aigateway-checks.yml` + `grsmodule-checks.yml` (pytest + pip-audit) | `f51dd80db` |
| 5.5/4.3 Frontend audit + API drift | npm audit on PRs; `check:api-drift` confirmed in backend CI | `d79b26134` |
| 5.4/5.6/5.8 CodeQL, SBOM, CODEOWNERS | New workflows + `.github/CODEOWNERS` | `633417f67` |
| 5.9/5.10 Nightly images + registry typo | Trivy on nightly `:test` images; `ghcr.io` fixed | `c04863190` |
| 1.1/1.2 RLS inert + superuser role | Phase 2 implemented behind `RLS_ENFORCEMENT_ENABLED` (default off): `verifywise_app` role migration, per-request `SET LOCAL app.current_org`, 11 middleware tests | `e0466153f` |
| 4.5 No global rate limiter | `generalApi` limiter (300 req/min prod) before route mounts; webhooks/health exempt | `4d9eeb9ae` |
| 2.8 JWT alg not pinned | `algorithms: ["HS256"]` on all verifications | `ac0bd44c6` |
| 2.9 Password policy | Max 128 chars, bcrypt cost 12, debug logging removed (backend + frontend in sync) | `bfb74ddd5` |
| 3.2/3.3 NodePort + wildcard CORS ingress | NodePort manifest deleted; dev-template ingress locked to app origin; placeholder example secrets | `65733b12f` |
| 3.9 K8s hardening | `containerPort: 30` → 80; `allowPrivilegeEscalation: false` + drop ALL caps | `434055c9b` |
| 3.6 TLS versions in docs only | TLSv1.2/1.3 pinned in ansible template + prod ingress | `93a8c9328` |
| 3.5 CSP `connect-src http:` | Removed; Report-Only → enforced promotion path documented | `166c27d17` |
| 1.8/1.9/1.4 Backend lows | Audit-ledger UPDATE org-scoped; compliance fail-closed; SSO exposure justified/documented | `22e18b7e9` |
| 1.5 SuperAdmin cross-org unaudited | Fire-and-forget audit-ledger logging on every cross-org access | `1d402804c` |
| 5.7/4.7 Pre-commit + stale spec | gitleaks staged scan in husky hook; `swagger.old.yaml` deleted | `95867aed4` |

### ⏳ Remaining (requires infra/credentials or larger projects)

1. **Secret rotation + history purge** (3.1): all previously committed secrets must be rotated and history purged with `git filter-repo` — requires coordination (force-push).
2. **RLS flag activation**: before setting `RLS_ENFORCEMENT_ENABLED=true`, complete the pre-enable checklist in `docs/technical/security/rls-rollout.md` (auth-middleware lookups run before request RLS context; background jobs don't set the GUC) and provision `verifywise_app` credentials.
3. **Deferred-table burndown** (1.3): ~150 scoped tables in `deferredScopedTables` — wave-based project.
4. **MFA + account lockout** (2.5); **access-token storage/revocation** (2.4/2.6) — product-level changes.
5. **Enforced CSP without `unsafe-inline`** (3.5) — needs violation-report triage.
6. **Non-root container images** — Dockerfiles need `USER` directives before `runAsNonRoot` can be set (TODOs in `kubernetes/base/deployment.yaml`).
7. **First manual Burp engagement** per the test plan in §4; weekly authenticated ZAP UI scan.
8. **SHA-pinning GitHub Actions** (5.10); branch-protection/required-checks configuration on GitHub (cannot be done from the repo).
9. **Expect initial CI failures**: the newly-blocking gates (dependency-review, Semgrep, pip-audit, npm audit) will flag the existing backlog (GitHub reports 23 high vulns on the default branch) — triage is the next operational task.
