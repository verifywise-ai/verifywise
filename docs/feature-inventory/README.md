# VerifyWise Feature Inventory

This directory contains a complete, living inventory of VerifyWise features. It maps every user-facing capability to its code location, access path, and testing instructions.

## Files

| File | Purpose |
|---|---|
| `feature-matrix.md` | Master table of all features across modules with code locations, APIs, tests, and access paths. |
| `frontend-features.md` | Per-page breakdown of the React/TypeScript frontend: routes, components, actions, tests. |
| `backend-features.md` | Per-domain breakdown of the Express/Sequelize backend: routes, controllers, models, auth, tests. |
| `supporting-modules.md` | Standalone Python services/libraries: AIGateway, EvalServer, EvaluationModule, GRSModule. |
| `testing-playbook.md` | Step-by-step manual and automated testing instructions for each feature. |
| `automation-opportunities.md` | Features that are currently manually verified and are candidates for automation. |
| `automation-strategy.md` | Research and recommended strategy for intelligent, automated end-to-end feature validation. |

## How to use this inventory

1. **Find a feature** in `feature-matrix.md` by module or page.
2. **Read the page details** in `frontend-features.md` or `backend-features.md`.
3. **Follow the test steps** in `testing-playbook.md`.
4. **Check automation candidates** in `automation-opportunities.md`.

## Legend

- **Route** — URL path in the frontend or API.
- **Access** — Required role or authentication state.
- **Backend API** — Express route(s) that power the feature.
- **Models** — Sequelize entities involved.
- **Tests** — Existing automated test files.
- **User Guide** — Link to `shared/user-guide-content` or `docs/user-guide-audit` article if present.

## Maintenance notes

- Generated from source-of-truth code files (see `Clients/src/application/config/routes.tsx`, `Servers/app.ts`, `Servers/routes/*.route.ts`, `Clients/e2e/*.spec.ts`).
- Gaps and drift from existing user-guide articles are explicitly flagged.
- Update this inventory when adding new routes, pages, or features.
