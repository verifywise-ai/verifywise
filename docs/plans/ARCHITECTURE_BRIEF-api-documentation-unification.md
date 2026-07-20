# Architecture Brief: API Documentation Unification

## 1. Executive Summary

Adopt a **code-first, route-as-SSOT** model for the VerifyWise backend: route files in `Servers/routes/*.route.ts` become the authoritative source of endpoint existence, HTTP method, path, and `authenticateJWT` usage. A hardened generator produces `Servers/swagger.yaml`, and the existing `Servers/scripts/generateEndpointsTs.ts` regenerates `docs/api-docs/src/config/endpoints.ts` from that YAML. A CI drift check compares every registered Express route against the generated OpenAPI paths and fails on mismatch.

## 2. Assumptions

- The backend remains Express + TypeScript; no framework migration is planned.
- Routes are registered in `Servers/app.ts` via `app.use("/api/...", <router>)` and defined in `Servers/routes/*.route.ts` using `router.get/post/put/patch/delete(...)`.
- JWT protection is applied by the `authenticateJWT` middleware (either per-route or via `router.use(authenticateJWT)`).
- `swagger-ui-express` and `yamljs` are already present in `Servers/package.json` dependencies/devDependencies.
- Frontend API calls continue to live in `Clients/src/application/repository/*.repository.ts`; we do **not** replace them with a generated client in this initiative.
- The existing generator scripts (`Servers/scripts/generateSwagger.ts` and `Servers/scripts/generateEndpointsTs.ts`) are the starting point, but they are not yet robust enough to be the SSOT.
- `Servers/swagger.yaml` is the file consumed by `Servers/app.ts` for Swagger UI and by the frontend doc generator.

## 3. Affected System Layers & Files

| Layer | Files / Directories | Nature of Change |
|-------|---------------------|------------------|
| Route definitions | `Servers/routes/*.route.ts` | Add/adjust metadata so the scanner can reliably extract method, path, auth, and tag; un-comment or remove the 4 stale assessment endpoints. |
| App wiring | `Servers/app.ts` | Confirm Swagger UI path (`/api/docs`) and ensure it loads the generated `swagger.yaml`. |
| Generators | `Servers/scripts/generateSwagger.ts` | Harden scanner (sub-routers, dynamic imports, middleware aliases), change output target to `Servers/swagger.yaml`, add `bearerAuth` inference, preserve existing tags/summaries where possible. |
| Generators | `Servers/scripts/generateEndpointsTs.ts` | Keep input as `Servers/swagger.yaml`; extend output format if frontend needs extra fields. |
| Generated artifacts | `Servers/swagger.yaml`, `Servers/swagger.generated.yaml`, `docs/api-docs/src/config/endpoints.ts` | `swagger.yaml` becomes the committed generated spec; `swagger.generated.yaml` is deprecated/removed; `endpoints.ts` is regenerated and committed. |
| CI/CD | `.github/workflows/backend-checks.yml` | Add drift-check job. |
| Documentation | `Servers/CLAUDE.md` | Add route + doc generation workflow. |
| PR process | `.github/pull_request_template.md` | Add API-doc checklist item. |
| Tests | `Servers/scripts/__tests__/` (new) or `Servers/tests/` | Add unit tests for the scanner and drift checker. |

## 4. High-Level Approach

1. **Harden the route scanner.**
   - Start from `Servers/scripts/generateSwagger.ts`.
   - Improve parsing of `app.ts` route mappings (handle `import x from "./routes/x.route"` and `import x from "./routes/x.route.js"`, function-call routers such as `deepEvalRoutes()`, and inline health check).
   - Improve route-file parsing to handle multi-line route definitions, router-level `router.use(authenticateJWT)`, sub-routers, and common middleware aliases (`authorize`, `superAdminOnly`, `upload.*`, rate limiters).

2. **Make `Servers/swagger.yaml` the generated output.**
   - Change `generateSwagger.ts` to overwrite `Servers/swagger.yaml` instead of `Servers/swagger.generated.yaml`.
   - Infer `security: [{ bearerAuth: [] }]` whenever `authenticateJWT` or `superAdminOnly` is detected.
   - Preserve a manually curated tag map and add an operation-id uniqueness strategy.

3. **Regenerate the frontend endpoint registry.**
   - Run `Servers/scripts/generateEndpointsTs.ts` against the new `swagger.yaml` to produce `docs/api-docs/src/config/endpoints.ts`.
   - Verify the output count matches the OpenAPI operation count (currently ~554–556 operations).

4. **Resolve the 4 stale assessment endpoints.**
   - For each commented-out route in `Servers/routes/assessment.route.ts` (`createAssessment`, `saveAnswers`, `updateAssessmentById`, `updateAnswers`, `deleteAssessmentById` — 5 imports commented, 4 route calls), decide with Product whether to re-enable and wire controllers or delete from `swagger.yaml`/generated artifacts.

5. **Audit and fix the 26 missing `bearerAuth` declarations.**
   - Use the hardened generator to re-emit `swagger.yaml`; any remaining gap is flagged by a security linter.
   - Manually fix edge cases (e.g., routes the scanner cannot detect) by adding minimal JSDoc or a route metadata hint.

6. **Add a CI drift check.**
   - Add a new script (e.g., `Servers/scripts/checkApiDrift.ts`) that loads the Express app, enumerates registered routes, and compares them to operations in `swagger.yaml`.
   - The check fails with a clear, actionable list of: method, full path, source route file.

7. **Serve Swagger UI from the generated spec.**
   - `Servers/app.ts` already mounts `swaggerUi.serve`/`swaggerUi.setup(swaggerDoc)` at `/api/docs`; ensure `swaggerDoc` is loaded from the freshly generated `swagger.yaml`.

8. **Update process documentation.**
   - Update `Servers/CLAUDE.md` with the add-route → regenerate → verify workflow.
   - Update `.github/pull_request_template.md` with a checkbox requiring OpenAPI reflection and correct `bearerAuth`.

9. **Add generator tests.**
   - Unit tests for `parseIndexFile`, `parseRouteFile`, tag derivation, auth inference, and the drift checker.

## 5. SSOT Decision Rationale

**Confirm the PRD recommendation: code-first with the route layer as SSOT.**

The existing codebase already organises API surface around Express route files. Choosing the route layer as SSOT has three decisive advantages for VerifyWise:

1. **Least disruption.** The team keeps writing `router.get/post(...)` as today; no workflow inversion to YAML-first is required. The existing `Servers/scripts/generateSwagger.ts` proves the approach is feasible.
2. **Drift prevention by construction.** Because docs are generated from the same code that registers routes, the CI drift check becomes a simple comparison rather than a manual audit.
3. **Reuses existing pipeline.** Once `swagger.yaml` is generated from code, the existing `Servers/scripts/generateEndpointsTs.ts` can continue producing `docs/api-docs/src/config/endpoints.ts` unchanged.

**Challenges to address:** The current scanner is fragile (it missed ~16 operations when comparing `swagger.yaml` 556 ops to `swagger.generated.yaml` 544 ops). It must be hardened before it can be trusted as the SSOT. Spec-first was rejected because it would force engineers to edit YAML before code, reintroducing the very drift problem this initiative aims to eliminate.

## 6. Data Model / API Contract Changes

No database schema or business-logic contract changes are expected.

Two specific contract hygiene items:

- **26 protected endpoints missing `bearerAuth`.** These will gain `security: [{ bearerAuth: [] }]` in `swagger.yaml` once the generator infers auth from `authenticateJWT`. No runtime behavior changes.
- **4 stale assessment endpoints.** `Servers/routes/assessment.route.ts` currently has commented-out calls for `createAssessment`, `saveAnswers`, `updateAssessmentById`, `updateAnswers`, and `deleteAssessmentById` (5 controller imports are commented, 4 route registrations are commented). These still appear in `Servers/swagger.yaml`. Product must decide for each endpoint whether to:
  - (a) re-enable the route, implement/verify the controller, and keep it documented; or
  - (b) permanently remove it from `swagger.yaml` and generated artifacts.

## 7. Tooling & Dependencies

Most tools are already present in `Servers/package.json`:

| Tool | Purpose | Already Present? |
|------|---------|------------------|
| `swagger-ui-express` | Serve Swagger UI at `/api/docs` | Yes (dependency + `@types/swagger-ui-express`) |
| `yamljs` | Load and write YAML | Yes (dependency + `@types/yamljs`) |
| `swagger-jsdoc` | Optional: JSDoc-to-OpenAPI annotations for edge-case metadata | Yes (devDependency) |
| `openapi-types` | TypeScript types for OpenAPI 3.0 objects | Not present — add as devDependency |
| `yaml` (npm package) | More robust YAML stringification than `yamljs` if needed | Not present — optional add |
| Custom TypeScript scanner (`Servers/scripts/generateSwagger.ts` hardened) | Route-to-OpenAPI generation | Existing — must harden |
| Custom drift checker (`Servers/scripts/checkApiDrift.ts`) | Compare Express routes to OpenAPI operations | New |
| Jest / ts-jest | Unit tests for generators | Yes |

No new runtime dependencies are strictly required; only `openapi-types` (devDependency) is recommended for type safety.

## 8. CI Drift Check Design

A new CI job in `.github/workflows/backend-checks.yml` runs after `npm run build`:

1. **Generate the spec.**
   ```bash
   npm run generate:swagger   # hardened generateSwagger.ts → Servers/swagger.yaml
   npm run generate:endpoints # generateEndpointsTs.ts → docs/api-docs/src/config/endpoints.ts
   ```

2. **Run the drift checker.**
   ```bash
   npm run check:api-drift    # Servers/scripts/checkApiDrift.ts
   ```

3. **What the checker does:**
   - Imports `createApp` from `Servers/app.ts` (without starting the server) and walks the Express route stack, collecting `(method, fullPath)` tuples.
   - Loads `Servers/swagger.yaml` and collects `(method, path)` tuples.
   - Ignores a configurable allow-list (e.g., `/health`, static/swagger UI paths, intentionally undocumented internal/debug routes).
   - Reports any Express route without a matching OpenAPI operation, and any OpenAPI operation without a matching Express route.
   - Exits with code `1` if mismatches exist, printing the source route file for each mismatch.

4. **Security lint step (same job or separate):**
   - Loads `Servers/swagger.yaml`.
   - For every operation, if the corresponding Express route uses `authenticateJWT`, the operation must declare `security: [{ bearerAuth: [] }]`.
   - Fails if any protected operation is missing the security declaration.

## 9. Breaking Change Assessment

| Consumer | Risk | Mitigation |
|----------|------|------------|
| Frontend repository files (`Clients/src/application/repository/*.repository.ts`) | Low to Medium. If `docs/api-docs/src/config/endpoints.ts` is regenerated with different variable names, path casing, or missing entries, any code/tests that import it will break. Today only test files import it, but this must be verified before merge. | Run a full frontend type-check after regeneration; freeze the public shape of `Endpoint`, `Parameter`, and `Response` interfaces. |
| Swagger UI consumers | Low. The generated `swagger.yaml` remains OpenAPI 3.0.x and keeps `/api/docs` path. | Validate with `swagger-ui-express` and a basic smoke test. |
| External API consumers | Low. No runtime routes change; only documentation accuracy improves. | Communicate that docs are now generated from code, not hand-edited. |
| CI / build scripts | Medium. New `generate:swagger`, `generate:endpoints`, and `check:api-drift` scripts must be added to `Servers/package.json`. | Add scripts before enforcing them; run them in CI only after the generated spec is stable. |

## 10. Technical Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | The route scanner cannot reliably parse all ~560 route variations (sub-routers, dynamic imports, factory routers, middleware aliases, `.js` imports). | High — CI drift check produces false negatives/positives. | Start with the existing `generateSwagger.ts` scanner, add unit tests for each route file shape, validate output count against the known ~560 endpoints, and maintain an explicit allow-list for edge cases rather than disabling the check. |
| 2 | Regenerating `swagger.yaml` loses richer hand-written metadata (descriptions, examples, schemas, tags) currently present in `Servers/swagger.yaml`. | Medium — docs become shallow. | Merge strategy: generated skeleton (paths, methods, auth) plus curated overlays for descriptions/schemas; or accept shallow first pass and enrich incrementally with JSDoc/`x-*` extensions. |
| 3 | `docs/api-docs/src/config/endpoints.ts` changes shape and breaks consumers/tests. | Medium — frontend build or tests fail. | Audit all imports before regeneration; keep the exported interfaces stable; add a frontend type-check step to CI if not already present. |
| 4 | Swagger UI in production exposes endpoint shapes and security metadata. | Low/Medium — information disclosure. | Default to serving Swagger UI only when `NODE_ENV !== "production"`, or gate it behind authentication/authorization; document the decision in `Servers/CLAUDE.md`. |
| 5 | Large one-time regeneration of 280+ documented operations creates an unreviewable PR. | High — merge conflicts and review fatigue. | Break the work into small, reviewable PRs: (1) scanner hardening + tests, (2) regenerate `swagger.yaml` and fix auth gaps, (3) stale assessment cleanup, (4) CI drift check + scripts, (5) docs/template updates. |

## 11. Preliminary Task Decomposition

| # | Task | Dependencies | Suggested Assignee |
|---|------|--------------|-------------------|
| 1 | Audit current `swagger.yaml` vs. `swagger.generated.yaml` vs. registered routes; identify gaps and scanner misses. | — | Senior Backend |
| 2 | Harden `Servers/scripts/generateSwagger.ts`: robust `app.ts` parsing, route-file parsing, auth inference, tag map, operation-id uniqueness, output to `Servers/swagger.yaml`. | #1 | Senior Backend |
| 3 | Add unit tests for the scanner (`Servers/scripts/__tests__/generateSwagger.test.ts` or equivalent). | #2 | Senior Backend / QA Engineer |
| 4 | Implement `Servers/scripts/checkApiDrift.ts` and add `generate:swagger`, `generate:endpoints`, `check:api-drift` scripts to `Servers/package.json`. | #2 | Senior Backend |
| 5 | Decide fate of 4 stale assessment endpoints with Product; update `Servers/routes/assessment.route.ts` and generated docs accordingly. | #2 | Senior Backend + Product Manager |
| 6 | Regenerate `Servers/swagger.yaml` and `docs/api-docs/src/config/endpoints.ts`; fix the 26 missing `bearerAuth` declarations and any scanner-induced mismatches. | #2, #5 | Senior Backend |
| 7 | Add CI drift-check and security-lint steps to `.github/workflows/backend-checks.yml`. | #4, #6 | DevOps |
| 8 | Run full backend build + tests + frontend type-check against regenerated artifacts. | #6, #7 | QA Engineer |
| 9 | Update `Servers/CLAUDE.md` with the route/doc workflow; update `.github/pull_request_template.md` with API-doc checklist. | #6, #7 | Senior Backend / Technical Writer |
| 10 | Deprecate and remove `Servers/swagger.generated.yaml`; update `.prettierignore` if needed. | #6 | Senior Backend |

## 12. Open Questions for Product Manager / Stakeholders

1. **Stale assessment endpoints:** Should the 4 commented-out assessment endpoints (`createAssessment`, `saveAnswers`, `updateAssessmentById`, `updateAnswers`, `deleteAssessmentById`) be re-enabled and implemented, or permanently removed from the API surface and docs?
2. **Swagger UI exposure:** Should Swagger UI remain available in production, or be restricted to development/staging only?
3. **Schema depth priority:** Is it acceptable for the first-pass generated `swagger.yaml` to contain only path/method/auth/tags with shallow request/response schemas, with richer schemas added incrementally later?
4. **Intentionally undocumented routes:** Are there any internal/debug routes (e.g., `/api/internal/*`, super-admin diagnostics) that should be explicitly excluded from the drift check?
5. **Frontend endpoint registry:** The current `docs/api-docs/src/config/endpoints.ts` is generated but appears to be consumed mainly by documentation/tests, not by the main frontend repository layer. Should this initiative also generate a registry inside `Clients/src/` for frontend use, or keep the current separation?
