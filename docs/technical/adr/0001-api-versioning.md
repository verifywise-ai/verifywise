# ADR 0001: API Versioning Strategy

- **Status:** Accepted
- **Date:** 2026-10-29
- **Branch:** `refactor/api-versioning-and-app-decomposition`

## Context

The VerifyWise backend (`Servers/`) exposes ~868 endpoints through ~130 Express routers,
all mounted in a flat list under unversioned `/api/*` paths in `Servers/app.ts`. This
structure has several limitations:

- **No versioning policy.** Contract changes ship in place, so any breaking change is a
  silent client break for the frontend, cross-service consumers (EvalServer, AIGateway),
  and external integrators.
- **`app.ts` mixes concerns.** Application initialization (CORS, helmet, body parsing,
  CSRF, i18n, metrics, rate limiting, health probes) is interleaved with the entire route
  registry, making the file hard to audit and risky to edit.
- **Inconsistent path conventions.** camelCase (`/api/projectRisks`) and kebab-case
  (`/api/ai-incident-managements`) paths coexist.
- **One precedent exists.** `/api/v1/shadow-ai` mounts an ingestion router with the version
  segment applied at application mount level; the router itself uses relative paths.
- **`/v1` (without `/api`) is occupied.** The OpenAI-compatible AI Gateway virtual-key
  proxy is mounted at `/v1` (`Servers/app.ts:305`), so `/api/v1` is the only safe version
  prefix shape for the application API.

## Decision

### 1. Legacy freeze

All existing unversioned `/api/*` endpoints constitute the **legacy API surface**. Their
paths, behavior, authentication, and mount order are preserved exactly. Legacy endpoints
receive bug fixes only; no new endpoints and no contract changes are added to unversioned
paths.

### 2. `/api/v1` for new and changed contracts

Any new endpoint, and any endpoint whose request/response contract changes, is introduced
under `/api/v1/...`. New v1 paths use kebab-case resource names.

### 3. Prefix at mount level

The `/api/v1` prefix is applied at the application mount level, never inside router path
definitions (precedent: `/api/v1/shadow-ai`). Routers keep relative paths so they can be
mounted under any prefix without edits.

### 4. Versioned routers live in `Servers/routes/v1/`

One file per domain resource (`routes/v1/<resource>.route.ts`), registered through a single
v1 registry module (`routes/v1/index.ts`) — an `express.Router()` that mounts each v1
router with the exact two-arg form `router.use("/<resource>", <identifier>)`. The registry
is mounted once at `/api/v1` in `app.ts`.

### 5. No route duplication

When an existing legacy endpoint needs a v1 contract change, the v1 router is a thin
adapter that reuses the existing controller/service logic; only the changed contract
surface (validation, shape, status codes) is versioned. When nothing about a contract
changes, no v1 copy is created — clients keep using the legacy path.

### 6. Backward compatibility and migration

Legacy endpoints are never removed or renamed without the deprecation process below.
Migrating a legacy endpoint family to v1 is a separate, narrowly scoped, individually
approved change. **There is no mass migration** — routers move to v1 only as they are
touched by normal work or when a narrowly scoped change requires it.

### 7. Deprecation (generator-supported)

- **Criteria:** a replacement version exists and covers the legacy contract; usage is
  observably low or owned by clients we control.
- **Mechanism:** a deprecation list maintained alongside the swagger generator
  (`Servers/scripts/apiDeprecations.ts`) that sets `deprecated: true` and prepends a
  Sunset notice to the operation description **before** the generator's
  `Requires role: ...` suffix. Hand-editing `swagger.yaml` is forbidden
  (`Servers/CLAUDE.md` — the file is generated), and a hand-appended note breaks the
  generator's role-note strip regex, causing unbounded description growth on each
  regeneration.
- **Communication:** release notes plus the deprecated marking in Swagger UI. Removal only
  after at least one minor release cycle, in a dedicated PR with regression coverage
  proving replacement parity.
- **Observability:** the request metrics middleware labels routes as
  `req.baseUrl + route.path` (`Servers/middleware/requestMetrics.middleware.ts`), so
  per-route request counts from the existing metrics/logging pipeline drive deprecation
  decisions.

### 8. OpenAPI conventions

- One merged spec (`Servers/swagger.yaml`, generated — never hand-edited);
  `servers: [{url: /api}]` unchanged. v1 paths appear as `/v1/<resource>/...`, exactly as
  `/v1/shadow-ai/events` does today.
- Versioned operations carry version-aware tags of the form `v1: <Resource>`. Legacy
  operations keep their existing tags — relabeling them would be documentation churn
  without behavior change.
- In `Servers/scripts/generateEndpointsTs.ts`, `v1: <Resource>` tags map back to the
  existing resource export group, keeping `docs/api-docs/src/config/endpoints.ts` stable.
- Endpoints are never documented as versioned unless their actual paths and routing
  behavior support that claim.

### 9. Authentication, authorization, and middleware consistency

v1 routers follow the same conventions as legacy routers: `authenticateJWT`
(plus `authorize(...)` / `superAdminOnly` where required) applied per route, or via
`router.use(...)` for fully protected routers. API-key or signature auth is reserved for
documented machine-ingestion surfaces. v1 mounts sit behind the same global middleware
stack (CORS, helmet, conditional body parsing, CSRF, i18n, metrics, global rate limiter) —
there is no separate v1 middleware stack. Error handling follows the existing controller
`STATUS_CODE[...]` patterns.

### 10. Raw-body trap

The conditional `express.json` exclusions in `Servers/app.ts` match **legacy URL
substrings** (`/api/deepeval/`, `/api/bias_and_fairness/`, `/api/webhooks/`). Migrating one
of those routers under `/api/v1` changes its URL, silently re-enabling JSON parsing on
endpoints that expect raw bodies. Any such migration must update the exclusion list in the
same PR. (The `/^\/v1/` exclusion for the AI Gateway proxy is anchored at path start and
does not match `/api/v1/...`; v1 endpoints receive `express.json` exactly as legacy ones
do.)

### 11. Testing requirements

Every new v1 router ships with route tests covering authentication (401 without token),
authorization (403 with the wrong role, where applicable), tenant isolation (cross-org
access denied), and the happy path. Migrating a legacy router to v1 additionally requires a
parity test proving the legacy path still responds identically.

## Consequences

- Two URL families (legacy `/api/*` and `/api/v1/*`) coexist indefinitely; documentation
  must distinguish them.
- The swagger generator (`Servers/scripts/generateSwagger.ts`) gains a multi-file
  registration parser that understands `app.ts`, legacy registration modules, and the
  `routes/v1/index.ts` registry. The CI drift gate (`backend-checks.yml`) continues to
  enforce regeneration.
- `Servers/app.ts` shrinks to initialization and top-level mounts; legacy registrations
  move to grouped modules under `Servers/routes/legacy/` (registration modules only —
  router files do not move).
- A future v2 repeats this pattern (`Servers/routes/v2/`, `/api/v2` mount) with its own
  ADR addendum.
