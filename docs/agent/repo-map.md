# VerifyWise Repo Map

> One-page steering map for agents and developers: what lives where, which rules apply, and what to read before touching an area.
> Consumed by the development-flow skills. For depth, always defer to the per-area `CLAUDE.md` and `CodeRules/`.

## Services

| Area | Path | Tech | Port | Rules of the house |
|------|------|------|------|--------------------|
| Backend | `Servers/` | Node 22, Express 4, TypeScript, Sequelize 6, BullMQ | 3000 | `Servers/CLAUDE.md` |
| Frontend | `Clients/` | React 19, TypeScript, Vite, MUI 7, Redux Toolkit, React Query | 5173 | `Clients/CLAUDE.md` |
| EvalServer | `EvalServer/` | FastAPI, Python 3.12, Alembic | 8000 | `EvalServer/CLAUDE.md` |
| AI Gateway | `AIGateway/` | FastAPI, Python 3.12, LiteLLM | 8100 | `AIGateway/CLAUDE.md` |
| EvaluationModule | `EvaluationModule/` | Python 3.12, DeepEval | — | pytest, `-m "not integration"` |
| GRS Module | `GRSModule/` | Python 3.12, uv-managed | — | `GRSModule/CLAUDE.md` |
| Python SDK | `sdks/python/` | Python, ruff | — | ruff check + format |
| Database | PostgreSQL 16 | shared schema `verifywise`, org_id isolation | 5432 | `docs/technical/architecture/multi-tenancy.md` |
| Cache/Queue | Redis + BullMQ | | 6379 | `Servers/CLAUDE.md` |
| Deploy | `kubernetes/`, `ansible/`, Docker | Helm chart in `kubernetes/helm/verifywise` | — | `docs/deployment/` |

## Layer flows (never skip a layer)

**Backend:** `routes/{entity}.route.ts` → `controllers/{entity}.ctrl.ts` → `services/` → `utils/{entity}.utils.ts` → `domain.layer/models/{entity}/` → PostgreSQL

Key backend dirs: `routes/`, `controllers/`, `services/`, `utils/`, `domain.layer/models/`, `middleware/`, `database/migrations/`, `jobs/`, `templates/`, `types/`, `structures/` (21 bundled frameworks), `extensions/` (9 built-in integrations), `mcp/` (deployment MCP server).

**Frontend (Clean Architecture):** `presentation/` (pages, components) → `application/` (hooks, repository, redux, contexts) → `domain/` (types, enums) → `infrastructure/` (axios)

A new page needs: component → page → repository → hook → route in `src/application/config/routes.tsx` → sidebar entry in `UnifiedSidebar/navConfig.ts` (enforced by `navConfig.test.ts`).

**Python services:** router → service → crud → model, Alembic migrations under `src/database/migrations/versions/`.

## Non-negotiable cross-cutting rules

- **Multi-tenancy:** every tenant-scoped table has `organization_id`; every query filters by it (`req.organizationId`); application SQL uses unqualified table names, migration DDL uses the `verifywise.` prefix. Read `docs/technical/security/tenant-isolation.md` before adding/modifying org-scoped tables or endpoints — and update the tenant-isolation registry + test matrix (`Servers/tests/integration/tenant-isolation/`).
- **Auth:** JWT payload carries `id, email, organizationId, tenantId, roleName, expire`. Protect routes with `authenticateJWT`. Frontend gates UI on permission **keys** (`useCan("vendor.edit")`), never role names; new keys go in both `Clients/src/application/constants/permissions.ts` and `Servers/config/rolePermissions.config.ts` (`permissions.test.ts` enforces the match).
- **API docs are generated:** after route changes run `npm run generate:swagger && npm run generate:endpoints` in `Servers/` and commit both outputs; CI fails on drift.
- **Logging/responses (backend):** `logProcessing`/`logSuccess`/`logFailure` + `STATUS_CODE[xxx](...)`; custom exceptions in `domain.layer/exceptions/custom.exception.ts`.
- **UI:** prefer house components over raw MUI (`StandardModal`, `CustomizableButton`, `SearchBox`, `Table/TableFilter`); design tokens only — **no hex literals in screens** (`noHexInScreens.test.ts` fails; exceptions in `themes/hexAllowList.ts`); sentence case everywhere; 34px control height defaults.
- **Naming:** camelCase vars/functions, PascalCase components/classes, UPPER_SNAKE_CASE constants, snake_case DB tables and Python vars, kebab-case API endpoints.

## When working on X, read Y (before writing code)

| Area of work | Read first |
|---|---|
| Any new feature end-to-end | `docs/technical/guides/adding-new-feature.md` |
| New bundled framework | `docs/technical/guides/adding-new-framework.md` |
| Backend pattern question | `Servers/CLAUDE.md` + `CodeRules/04-backend/` |
| Frontend pattern question | `Clients/CLAUDE.md` + `CodeRules/03-react/` |
| FastAPI work | `CodeRules/05-python/` |
| Migrations (backend) | `Servers/CLAUDE.md` § Database & Migrations |
| Multi-tenancy / RLS / org scoping | `docs/technical/security/tenant-isolation.md` |
| A business domain (risks, vendors, incidents, evidence, …) | `docs/technical/domains/<domain>.md` (19 domains — index in root `CLAUDE.md`) |
| Design/styling | `CodeRules/09-design-system/` + `docs/technical/guides/design-tokens.md` |
| Tests | `CodeRules/07-testing/` + `docs/feature-inventory/testing-playbook.md` |
| PR process | `CodeRules/08-workflow/` + `CodeRules/checklists/pr-checklist.md` |
| Which CI checks to run locally | `docs/agent/ci-local-parity.md` |

## Checklists & templates (use, don't re-derive)

- `CodeRules/checklists/pr-checklist.md` — pre-submission
- `CodeRules/checklists/component-checklist.md` — React component
- `CodeRules/checklists/api-endpoint-checklist.md` — backend endpoint
- `CodeRules/checklists/security-review-checklist.md` — security review
- `CodeRules/examples/` — React component, Express controller, custom hook, FastAPI router templates

## Git & PR conventions

- Branch per feature/fix off `develop`: `feature/…`, `fix/…`, `docs/…`. Never commit to `master`/`develop` directly.
- Commits: `type(scope): description` — types: feat, fix, docs, style, refactor, test, chore.
- PR title follows the same format; link the issue (`Fixes #xxx`); fill `.github/pull_request_template.md`; keep PRs focused (< ~400 lines preferred).
- Coverage targets: Clients 50/40/45/50, Servers 30/25/25/40 (see CI matrix).
