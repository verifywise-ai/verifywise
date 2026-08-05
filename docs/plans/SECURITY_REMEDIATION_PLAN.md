# Security & Quality Remediation Plan

## 0. Snapshot

Data fetched from GitHub Security API on the current branch.

| Source | Open | High/Critical | Medium | Low |
|--------|------|---------------|--------|-----|
| Dependabot | 14 | 5 | 9 | 0 |
| Code Scanning | 293 | 90 (error) | 68 (warning) | 135 (note) |

Tools represented: **Trivy** (197), **Semgrep OSS** (77), **CodeQL** (19).

---

## 1. Agent Roster Assignments

| Agent | File | Owns |
|-------|------|------|
| Application Security (AppSec) Engineer | `agents/application-security-engineer.md` | Triage, threat validation, injection/path/crypto rules, false-positive review |
| Backend Platform Engineer | `agents/backend-platform-engineer.md` | `Servers/` TypeScript/Express fixes (Sequelize injection, sendfile, rate limiting, JWT/crypto) |
| Senior Frontend Developer | `agents/senior-frontend-developer.md` | `Clients/` and `GRSModule/ui/frontend/` dependency + frontend SAST fixes |
| AI/ML Engineer | `agents/ai-ml-engineer.md` | `EvalServer/`, `AIGateway/`, `GRSModule/ui/backend/` Python fixes |
| DevOps Engineer | `agents/devops-engineer.md` | `kubernetes/`, Dockerfiles, Trivy KSV misconfigurations |
| Platform Engineer | `agents/platform-engineer.md` | Developer-platform / shared tooling hardening |
| API Platform Engineer | `agents/api-platform-engineer.md` | API-level rate limiting, gateway, and route hardening |

---

## 2. Workstreams

### Wave 1 — Quick Wins (low risk, high noise reduction)

#### W1.1 Dependency Upgrades (Dependabot)
**Owner agents:** Senior Frontend Developer, Backend Platform Engineer, DevOps Engineer (docs)

| Package | Vuln range | Fixed in | Manifest(s) | Severity | Action |
|---------|------------|----------|-------------|----------|--------|
| `undici` | `>=7.0.0,<7.29.0` | `7.29.0` | `Clients/package-lock.json`, `GRSModule/ui/frontend/package-lock.json` | 7 medium + 1 high | `npm update undici` or override; run tests |
| `hono` | `<4.12.34` | `4.12.34` | `Servers/package-lock.json` | medium | bump `hono` in `Servers/package.json` |
| `xlsx` (SheetJS) | `<0.20.2` (ReDoS) | `0.20.3` | `Clients/package.json`, `Servers/package.json` | high | Bump CDN tarball to `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; run spreadsheet tests. |
| `react-router` | `>=7.12.0,<8.3.0` | `8.3.0` | `Clients/package-lock.json`, `GRSModule/ui/frontend/package-lock.json`, `docs/api-docs/package-lock.json` | high | **No 7.x patch exists.** App uses standard BrowserRouter/Data-mode APIs (no unstable RSC APIs), so exploit path is not reachable. Major v8 migration tracked separately; otherwise dismiss as non-exploitable with justification. |

**Acceptance criteria:**
- `npm audit` passes for the affected workspaces with no open `undici`/`hono`/`xlsx` alerts.
- `Clients` and `Servers` spreadsheet import/export tests pass after `xlsx` bump.
- `hono` and `undici` bumps verified by build/tests.
- React Router alert triaged: either migrate to v8, or document non-exploitability (no RSC APIs used) and dismiss the alert.
- EvaluationModule `huggingface-hub` alert triaged: `>=1.26.0` conflicts with `deepeval<4.2.0` (`click<8.4.0` vs `click>=8.4.2`). Decision tracked; do not merge a broken dependency bump.

> **Wave 1 status (completed)**
> - `undici` and `hono` resolved.
> - `xlsx` bumped to CDN `0.20.3`; `npm audit` no longer flags `xlsx` in `Clients`/`Servers`.
> - `GRSModule/ui/frontend` transitive `babel/core` and `brace-expansion` findings fixed via `npm audit fix`.
> - `react-router` migrated to v8.3.0 in `Clients`, `GRSModule/ui/frontend`, and `docs/api-docs`; all builds and the full `Clients` test suite (5,170 tests) pass.
> - EvaluationModule `huggingface-hub` capped to `<1.16.3` to avoid the `deepeval<4.2.0` / `click>=8.4.2` conflict; the Dependabot PR should be closed/dismissed and revisited when `deepeval` loosens its `click` constraint.
> - Remaining open dependency risk: `Servers` has 2 low-severity `@ai-sdk/provider-utils` alerts via `@mastra/core`.

---

### Wave 2 — Injection & Path Traversal (high severity)

#### W2.1 Python SQLAlchemy `text()` misuse
**Owner agents:** AI/ML Engineer, Application Security Engineer
- 58 Semgrep alerts across `EvalServer/src/`, `AIGateway/src/crud/`, and migration scripts.
- Replace raw `text()` with parameterized `text(...).bindparams(...)` or ORM queries.
- Validate migration scripts do not execute user-controlled strings.

#### W2.2 Python path injection
**Owner agents:** AI/ML Engineer
- 16 CodeQL alerts in `GRSModule/ui/backend/routers/results.py`, `services/watcher.py`, `services/snapshot.py`, `services/path_utils.py`.
- Use `os.path.realpath`, whitelist allowed directories, reject `..` and null bytes.

#### W2.3 Python subprocess injection
**Owner agents:** AI/ML Engineer
- 2 alerts in `GRSModule/ui/backend/services/runner.py`.
- Replace shell strings with argument lists; validate inputs.

#### W2.4 Sequelize injection (Node)
**Owner agents:** Backend Platform Engineer
- 2 Semgrep alerts in `Servers/controllers/shareLink.ctrl.ts`.
- Use parameterized replacements in Sequelize `where` clauses.

#### W2.5 Regex injection
**Owner agents:** Senior Frontend Developer
- 1 CodeQL alert in `Clients/scripts/i18n-audit.mjs`.
- Escape dynamic input before building RegExp.

**Acceptance criteria:**
- All listed injection/path alerts close in the next GitHub scan.
- New unit/integration tests added for each sanitization pattern.

---

### Wave 3 — Cryptography & Secrets

#### W3.1 Authenticated encryption
**Owner agents:** AI/ML Engineer, Backend Platform Engineer
- `python.cryptography.security.mode-without-authentication` in `AIGateway/src/utils/encryption.py` and `EvalServer/src/controllers/reports.py`.
- Replace unauthenticated modes with AES-GCM or equivalent.
- `javascript.node-crypto.security.gcm-no-tag-length` in `Servers/utils/secretEncryption.utils.ts` — specify `authTagLength: 16`.

#### W3.2 Bcrypt hash false positives
**Owner agents:** Application Security Engineer
- 4 Semgrep alerts in mock data (`users.mock.data.ts`, `users.md`, `SQL_Commands.sql`).
- Mark as **false positive** (test/demo data) or move hashes to a test-only fixture excluded from scanning.

#### W3.3 Hardcoded JWT secret false positive
**Owner agents:** Application Security Engineer
- 1 alert in `Servers/utils/__tests__/jwt.utils.test.ts`.
- Confirm it is test-only and dismiss/annotate.

**Acceptance criteria:**
- Crypto alerts resolved or documented as false positives with dismissal justifications.
- No production code uses unauthenticated encryption modes.

---

### Wave 4 — Kubernetes & Container Hardening

**Owner agents:** DevOps Engineer, Platform Engineer, Application Security Engineer

Trivy KSV alerts (197 total). Grouped themes:

| Theme | KSV IDs | Action |
|-------|---------|--------|
| Run as non-root | KSV-0012, KSV-0020, KSV-0021 | Add `runAsNonRoot: true`, `runAsUser`/`runAsGroup` > 10000 |
| Capabilities | KSV-0003, KSV-0004, KSV-0106, KSV-0022 | Drop all, add only `NET_BIND_SERVICE` if needed |
| Resource limits | KSV-0011, KSV-0015, KSV-0016, KSV-0018 | Add CPU/memory requests/limits |
| Image policy | KSV-0013, KSV-0125 | Pin tags, use trusted registry |
| Config hygiene | KSV-0001, KSV-01010, KSV-0110, KSV-0117 | Avoid default namespace, bind to non-privileged ports, move secrets out of ConfigMaps |
| Dockerfile healthchecks | DS-0026 | Add `HEALTHCHECK` to all service Dockerfiles |

**Acceptance criteria:**
- All Trivy KSV alerts either fixed or accepted with documented risk decision.
- Kubernetes manifests render with `kubectl apply --dry-run=client`.
- Local dev still works after securityContext changes.

---

### Wave 5 — API & Frontend SAST

**Owner agents:** Backend Platform Engineer, API Platform Engineer, Senior Frontend Developer

| Rule | Location | Action |
|------|----------|--------|
| `js/missing-rate-limiting` | Servers routes | Apply existing rate-limit middleware to unprotected routes |
| `javascript.express.security.audit.express-res-sendfile` | `Servers/routes/plugin.route.ts` | Resolve path with `realpath` and validate inside allowed root |
| `javascript.express.security.audit.xss.direct-response-write` | `Servers/controllers/fileManager.ctrl.ts` | Set safe `Content-Type`, ensure output is not user-controlled HTML |
| `javascript.lang.security.spawn-git-clone` | `Servers/services/aiDetection.service.ts` | Validate repository URL against allowlist, use argument list |
| `typescript.react.security.audit.react-dangerouslysetinnerhtml` | `Clients/src/presentation/components/RichTextRenderer/index.tsx` | Confirm DOMPurify sanitization or replace with safe renderer |
| `py/stack-trace-exposure` | `AIGateway/src/routers/prompts.py`, `mcp_proxy.py` | Return generic errors to clients, log details server-side |
| `python.lang.security.audit.dynamic-urllib-use-detected` | `AIGateway/tests/e2e_mock_agentic_system.py` | Review and constrain dynamic URL construction |

**Acceptance criteria:**
- Each alert closed in the next scan.
- Existing functional tests pass.

---

## 3. Proposed Implementation Order

1. **Wave 1** — dependency bumps to reduce Dependabot noise quickly.
2. **Wave 2** — injection/path fixes (highest code risk).
3. **Wave 3** — crypto/secrets (compliance-critical).
4. **Wave 4** — Kubernetes/container hardening (ops risk).
5. **Wave 5** — remaining API/frontend SAST cleanup.

Each wave should be its own PR (or set of PRs) so CI stays green and scans rerun cleanly before the next wave.

---

## 4. Immediate Next Steps

1. Confirm whether to proceed with Wave 1 first, or if a specific alert/blocker should be prioritized.
2. Decide React Router strategy (upgrade to v8, pin safe override, or accept risk with mitigation).
3. Decide Kubernetes default-namespace and root-user policy for local dev manifests.
4. Assign each wave to the relevant agent and create a `TASK_BOARD-*` artifact.
