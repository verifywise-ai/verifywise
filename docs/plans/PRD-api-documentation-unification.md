# Product Requirements Document: Unify API Documentation & Eliminate Code/Swagger Drift

## 1. Problem Statement

The VerifyWise backend (`Servers/`) maintains API documentation in three places that have diverged:

- `Servers/swagger.yaml` documents roughly 280 of ~560 registered Express endpoints.
- `Servers/endpoints.ts` (used by the frontend API layer) covers 187 endpoints and is generated from `swagger.yaml`.
- `Servers/swagger.generated.yaml` is stale and no longer trustworthy.
- 26 endpoints apply the `authenticateJWT` middleware but are missing the `bearerAuth` security declaration in the OpenAPI spec.
- 4 assessment endpoints are still listed in `swagger.yaml` but commented out in `Servers/routes/assessment.route.ts`.

This drift creates frontend/backend contract mismatches, forces engineers to maintain docs manually, and leaves security requirements undocumented. It slows onboarding, increases integration bugs, and weakens security review coverage.

## 2. Goals & Success Metrics

| Goal | Success Metric |
|------|----------------|
| Establish a single source of truth (SSOT) for API contracts | Exactly one authoritative definition drives every consumer: OpenAPI spec, frontend endpoint registry, and (optionally) Swagger UI |
| Keep code and OpenAPI synchronized | 100% of registered Express routes have a matching OpenAPI operation; CI fails on any unmatched route |
| Fix security documentation gaps | 0 protected endpoints (those using `authenticateJWT`) are missing `bearerAuth` in the OpenAPI spec |
| Resolve stale assessment endpoints | The 4 commented-out assessment endpoints are either re-enabled in code and documented, or removed from `swagger.yaml` and generated artifacts |
| Embed the approach in team process | `Servers/CLAUDE.md` and `.github/pull_request_template.md` are updated with the agreed workflow and checklist |

**Target outcome:** Zero manual doc drift; any mismatch is caught in CI before merge.

## 3. Scope

In scope for this initiative:

- Selecting the SSOT approach for backend API contracts.
- Generating or validating `Servers/swagger.yaml` from the SSOT.
- Generating `Servers/endpoints.ts` (or its successor) from `Servers/swagger.yaml`.
- Adding a CI check that fails when a registered route lacks a matching OpenAPI operation.
- Auditing and fixing `bearerAuth` declarations for all JWT-protected endpoints.
- Deciding the fate of the 4 stale assessment endpoints and updating code/docs accordingly.
- Updating `Servers/CLAUDE.md` with the API documentation workflow.
- Updating `.github/pull_request_template.md` with an API documentation checklist item.
- (Optional but recommended) Serving Swagger UI from the generated `swagger.yaml` if not already enabled.

## 4. Out of Scope

Explicitly out of scope:

- Rewriting controllers, business logic, or route behavior beyond what is required to fix the 4 stale assessment endpoints.
- Replacing Express with another framework.
- Changing the frontend API call patterns (e.g., switching from repository files to a generated client library).
- Documenting non-HTTP internal service contracts (e.g., BullMQ jobs, WebSocket events, Python service callbacks) unless they already have Express routes.
- Adding request/response schemas for every endpoint in the first pass; schema coverage is a follow-up quality effort.
- Migrating authentication mechanisms or changing JWT behavior.

## 5. User Stories

### Story 1 — Backend developer adding a new endpoint
> As a backend developer, I want the API docs to be generated from the code I already write, so that I do not have to remember to update a separate YAML file.

**Acceptance criteria:**
- A new route registered in `Servers/routes/*.route.ts` appears in `Servers/swagger.yaml` after running the generation command.
- If the route uses `authenticateJWT`, the generated OpenAPI operation includes `security: [bearerAuth: []]`.
- CI fails if the route is not reflected in the generated spec.

### Story 2 — Frontend developer consuming the API
> As a frontend developer, I want `endpoints.ts` to be regenerated automatically from the same source the backend uses, so that I can trust the method, path, and auth flag for every API call.

**Acceptance criteria:**
- `endpoints.ts` is produced from `Servers/swagger.yaml` as part of the build or CI pipeline.
- The generated registry contains the same number of operations as the OpenAPI spec.
- There are no hand-edited differences between the registry and the spec.

### Story 3 — Security reviewer
> As a security reviewer, I want every JWT-protected endpoint to declare `bearerAuth` security in the OpenAPI spec, so that external consumers and auditors can see which endpoints require authentication.

**Acceptance criteria:**
- The number of protected endpoints missing `bearerAuth` is 0.
- A CI linter/validator rejects any protected operation without a security declaration.
- The OpenAPI spec lists only one security scheme: `bearerAuth` (JWT).

## 6. SSOT Options Analysis

| Approach | Description | Pros | Cons | Recommendation |
|----------|-------------|------|------|----------------|
| **A. Code-first** | Use Express route files (plus JSDoc annotations, decorators, or a route registry) as SSOT. Generate `swagger.yaml` from the code, then derive `endpoints.ts` from `swagger.yaml`. | Fits existing architecture (routes already define methods/paths/middleware). Minimizes duplicate maintenance. Guarantees code and docs stay synchronized by construction. Can reuse the current `generateEndpointsTs.ts` logic by simply flipping the first step. | Requires an initial investment in a route scanner or metadata format. Controller response/request types may need richer metadata to produce full schemas. | **Recommended** |
| **B. Spec-first** | Keep `swagger.yaml` as SSOT and generate `endpoints.ts` (and possibly route stubs) from it. | OpenAPI becomes the canonical contract; easy for external stakeholders to review. | Reverses the current workflow: engineers must edit YAML before code, which is error-prone and conflicts with the existing Express-first development pattern. Does not solve the “code drifted from YAML” problem unless routes are also generated, which would be a large architectural change. | Not recommended for this codebase |
| **C. Serve Swagger UI** | Use `swagger-ui-express` to render `swagger.yaml` at runtime, while keeping `endpoints.ts` generated from the same YAML. | Improves discoverability for developers and QA. Low effort if `swagger.yaml` is already correct. | Does not define the SSOT or fix drift on its own; it is a presentation layer, not a synchronization mechanism. | Adopt as a companion to Approach A, not as the SSOT |

### Recommendation

**Adopt Approach A (code-first) with Approach C (Swagger UI) as the delivery layer.**

The VerifyWise backend is already organized around Express route files, controllers, and a generated endpoint registry. Making the route layer the SSOT lets the team continue writing routes normally while a generator produces `swagger.yaml`. That generated spec then feeds the existing `generateEndpointsTs.ts` pipeline. This introduces the least disruption, enforces synchronization through generation, and can be validated in CI by comparing registered routes against generated operations.

## 7. Functional Requirements

1. **SSOT selection** — The route definitions in `Servers/routes/*.route.ts` (augmented with metadata such as JSDoc annotations, decorators, or a route registry) are the single source of truth for endpoint existence, HTTP method, path, and middleware.
2. **OpenAPI generation** — A reproducible command or script generates `Servers/swagger.yaml` from the SSOT.
3. **Endpoint registry generation** — `Servers/endpoints.ts` is regenerated from `Servers/swagger.yaml` and is never edited by hand.
4. **CI drift check** — A CI job fails if a route exists in the Express application without a matching operation in the generated `swagger.yaml`.
5. **Security declaration correctness** — Every operation corresponding to a route that uses `authenticateJWT` declares `security: [bearerAuth: []]`.
6. **Stale assessment endpoint resolution** — For each of the 4 commented-out assessment endpoints, the team either (a) re-enables the route and documents it, or (b) removes it from `swagger.yaml` and any generated artifacts.
7. **Swagger UI availability** — The backend serves Swagger UI from the generated `swagger.yaml` at a documented path (e.g., `/api/docs`).
8. **Documentation workflow** — `Servers/CLAUDE.md` describes how to add a route, regenerate docs, and verify the result.
9. **PR template update** — `.github/pull_request_template.md` includes a checkbox requiring that any new/modified endpoint is reflected in the generated OpenAPI spec and has the correct `bearerAuth` declaration.
10. **Build integration** — The generation commands are wired into `npm`/`pnpm` scripts and documented so engineers can run them locally.

## 8. Non-Functional Requirements

- **Performance:** Generating `swagger.yaml` and `endpoints.ts` must complete in under 30 seconds on developer hardware and in CI.
- **Security:** The generation process must not expose secrets, internal environment variables, or undocumented admin endpoints. Swagger UI must be served without exposing JWTs or tokens in example values.
- **Maintainability:** The generator code must be version-controlled, tested, and follow the existing `CodeRules/04-backend/` and `CodeRules/02-typescript/` conventions.
- **Reliability:** The CI drift check must produce a clear, actionable error message listing the route method, path, and file that lacks documentation.
- **Compatibility:** The generated `swagger.yaml` must remain OpenAPI 3.0.x compatible and must not break existing consumers.

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The route scanner cannot reliably detect all route variations (sub-routers, dynamic imports, middleware aliases). | High — CI drift check produces false negatives/positives. | Start with a conservative scanner; validate against the known ~560 endpoints. Add unit tests for the scanner. Allow an explicit allow-list for edge cases rather than disabling the check. |
| Controllers lack sufficient type/metadata to generate useful request/response schemas. | Medium — spec is accurate but shallow. | Accept schema coverage as a follow-up. First milestone is route/method/auth parity; schemas can be enriched incrementally with Zod/JSDoc. |
| Frontend relies on hand-edited fields in `endpoints.ts` that the generator does not preserve. | Medium — regenerated file breaks frontend build. | Audit the current `endpoints.ts` output before generation. If extra metadata is needed, extend the generator or the OpenAPI `x-*` extensions, not the hand-edited file. |
| Serving Swagger UI in production exposes endpoint shapes to attackers. | Low/Medium — information disclosure. | Restrict Swagger UI to non-production environments or gate it behind authentication/authorization. Document the decision in `Servers/CLAUDE.md`. |
| Large one-time migration of 280+ endpoints creates a huge PR. | High — difficult review and high conflict risk. | Break the work into small commits: (1) scanner + generator, (2) regenerate and fix auth gaps, (3) stale assessment cleanup, (4) CI check, (5) doc/template updates. Prefer one file per commit where possible. |

## 10. Open Questions

1. Should the route metadata be expressed as JSDoc comments above route definitions, as TypeScript decorators, or as a separate route registry module?
2. Do we want to generate request/response schemas from Zod validation schemas, JSDoc types, or controller return types?
3. Should Swagger UI be exposed in production, or only in development/staging?
4. Are there any intentionally undocumented routes (e.g., internal health checks, admin debug routes) that should be excluded from the drift check?
5. What is the desired output format and location for the generated `endpoints.ts` — keep `Servers/endpoints.ts`, move it to `docs/api-docs/src/config/endpoints.ts`, or both?
6. Should the 4 stale assessment endpoints be re-implemented, or permanently removed from the product surface?
