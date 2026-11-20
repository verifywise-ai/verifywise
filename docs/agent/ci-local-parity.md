# CI Local Parity Matrix

> Single source of truth for reproducing GitHub Actions checks locally before opening a PR.
> Consumed by the `verify-pr` skill. Keep this in sync with `.github/workflows/` — if a workflow changes, change this file in the same PR.

Every workflow in `.github/workflows/` is **path-filtered**: a check only runs in CI when the PR touches its paths. Mirror that locally — detect affected areas from the diff and run only the relevant sections:

```bash
git diff --name-only origin/develop...HEAD
```

Legend: **[must]** = run locally before every PR · **[ci-ok]** = acceptable to leave to CI (expensive, needs services, or duplicated by a lighter local check)

---

## Clients/ — `frontend-checks.yml`

| Check | Local command (run in `Clients/`) | Gate |
|-------|-----------------------------------|------|
| Prettier | `npm run format-check` | [must] |
| TypeScript | `npm run typecheck` | [must] — ⚠️ `npm run build` does NOT run tsc; a green build hides type errors |
| ESLint (errors only) | `npm run lint -- --quiet` | [must] — warnings are non-blocking in CI |
| i18n audit | `npm run i18n:audit:strict` | [must] |
| Unit & component tests | `npx vitest run --coverage` | [must] — CI shards 4-way and merges; local single run is equivalent. Coverage thresholds: statements 50, branches 40, functions 45, lines 50 |
| Dependency audit | `npm audit --audit-level=high --omit=dev` + `node ../scripts/security/npm-audit-gate.js .` | [must] |
| nginx proxy routes | `scripts/test-nginx-proxy.sh` | [must] — only when `ansible/templates/verifywise-nginx.conf.j2` or nginx config changes |
| Production build | `npm run build` | [ci-ok] — covered by `docker-image.yml`; run if touching build config |
| Flake check (3× suite) | `npx vitest run --retry=0` ×3 | [ci-ok] — workflow_dispatch only |

## Servers/ — `backend-checks.yml`

| Check | Local command (run in `Servers/`) | Gate |
|-------|-----------------------------------|------|
| Prettier (changed files) | `npx prettier --check <changed files>` | [must] — CI checks only files changed vs base branch |
| TypeScript build | `npm run build` | [must] — this IS the type check for Servers |
| ESLint | `npm run lint` | [must] — errors fail; ~3.5k `no-explicit-any` warnings are tolerated |
| Rate-limiter suite | `npm run test:ratelimit` | [must] |
| i18n audits | `npm run i18n:audit:strict` && `npm run test:i18n-scripts` && `npm run i18n:check-en` | [must] |
| API docs drift | `npm run generate:swagger` && `npm run generate:endpoints` then `git diff --exit-code -- swagger.yaml ../docs/api-docs/src/config/endpoints.ts` | [must] when any route/controller changes — commit the regenerated files |
| Route/spec drift | `npm run check:api-drift` | [must] |
| Unit tests + coverage | `npm run test:coverage` | [must] — thresholds: statements 30, branches 25, functions 25, lines 40. Note: `npm run test` / `test:unit` **excludes** `tests/integration/` |
| Tenant-isolation integration tests | `npm run test:integration -- --testPathPatterns=tenant-isolation` | [ci-ok] — needs local Postgres 16 with CI env vars (see workflow env block); mandatory locally when adding/modifying an org-scoped table |
| Regression integration suites | `npm run test:integration -- --testPathPatterns='tests/integration/(...)'` | [ci-ok] — see workflow for the anchored regex |
| Smoke + schema-drift audit | `npm run test:smoke` && `npx ts-node scripts/auditTenantIsolationCoverage.ts` | [ci-ok] |
| Dependency audit | `npm audit --audit-level=high --omit=dev` + `node ../scripts/security/npm-audit-gate.js .` | [must] |
| Enum drift | `npm run check:enum-drift` | [must] when touching enums/labels |

## AIGateway/ — `aigateway-checks.yml`

| Check | Local command (run in `AIGateway/`) | Gate |
|-------|-------------------------------------|------|
| Install | `python -m venv .venv` (if missing) + `.venv/bin/python -m pip install -r requirements.txt` — presidio-anonymizer is installed `--no-deps` in CI (caps `cryptography<49`, project needs `>=50`); see workflow lines 57–66 | setup |
| Dependency audit | `.venv/bin/python -m pip install pip-audit` + run `pip-audit` per workflow | [must] |
| Unit tests | `.venv/bin/python -m pytest tests/unit tests/test_cache_service.py tests/test_cost_service.py ...` (full list in workflow) | [must] |

## EvalServer/ + EvaluationModule/ — `evalserver-checks.yml`

| Check | Local command | Gate |
|-------|---------------|------|
| EvalServer deps + audit | `pip install -r requirements-test.txt` + `python -m pip_audit -r requirements.txt` | [must] |
| EvalServer tests | `python -m pytest tests/ -v --ignore=tests/test_integration_openrouter.py -m "not integration"` | [must] |
| EvaluationModule deps + audit | venv + `pip install -r requirements.txt` + `pip install respx` + pip-audit (nltk CVE suppression — see workflow) | [must] |
| EvaluationModule tests | `.venv/bin/python -m pytest tests/ -v -m "not integration"` (run in `EvaluationModule/`) | [must] |

## GRSModule/ — `grsmodule-checks.yml`

| Check | Local command (run in `GRSModule/`) | Gate |
|-------|-------------------------------------|------|
| Deps | `uv sync --frozen` | setup |
| Dependency audit | `uv export --frozen --no-hashes --no-dev -o requirements-ci.txt` + `uv run --with pip-audit pip-audit -r requirements-ci.txt --ignore-vuln CVE-2026-112395 --ignore-vuln CVE-2026-112397` (see workflow for full suppression list) | [must] |
| Tests | `uv run pytest tests/ -v --ignore=tests/llm/test_bedrock.py` | [must] |

## sdks/python/ — `python-sdk-checks.yml`

| Check | Local command (run in `sdks/python/`) | Gate |
|-------|---------------------------------------|------|
| Install | `pip install -e ".[all,dev]"` | setup |
| Ruff lint + format | `python -m ruff check .` && `python -m ruff format --check .` | [must] |
| Tests | `python -m pytest -v` | [must] |

## Repo-wide

| Check | Local command | Gate |
|-------|---------------|------|
| Secret scanning (`gitleaks.yml`) | `gitleaks detect --no-git --source . --config .gitleaks.toml --redact --exit-code 1` | [must] — also runs automatically in the pre-commit hook as `gitleaks protect --staged` (warns and skips if gitleaks not installed) |
| Semgrep SAST (`semgrep.yml`) | `semgrep scan` with the repo config | [ci-ok] — heavyweight; CI blocks on findings |
| CodeQL (`codeql.yml`) | — | [ci-ok] — CI only |
| E2E Playwright (`e2e-tests.yml`) | `cd Clients && npm run test:e2e` — needs backend + frontend + Postgres + Redis + seeded data running | [ci-ok] — full stack required; for a fast local signal run the canary journey `Clients/e2e/canary/canary.spec.ts` |
| Docker image builds + Trivy (`docker-image*.yml`) | `docker build` per service Dockerfile | [ci-ok] — run when touching Dockerfiles |
| IaC scan (`iac-scan.yml`) | `helm lint kubernetes/helm/verifywise`; `promtool check config observability/prometheus.yml`; `promtool check rules observability/alerts.yml` | [must] when touching `kubernetes/**` or `observability/**`, else skip |
| Dependency review (license policy) | — | [ci-ok] — GitHub-only action; avoid adding GPL-3.0/AGPL-3.0 deps |

## Pre-commit hook (`.husky/pre-commit`) — already automatic

1. `gitleaks protect --staged` (soft — warns if gitleaks missing)
2. `lint-staged` in both `Servers/` and `Clients/`
3. If a commit touches route/API-docs inputs (`Servers/app.ts`, `Servers/routes/**`, `Servers/extensions/**/*.route.ts`, swagger/endpoints generators), regenerates `swagger.yaml` + `endpoints.ts` and stages them — fails the commit if generation fails

---

## Maintenance rule

This matrix drifts when workflows drift. Any PR that changes a `run:` block in `.github/workflows/` must update this file in the same commit. The `verify-pr` skill refuses to treat this file as stale-tolerant: if `.github/workflows/` has a newer mtime than this document, re-derive the affected section before trusting it.
