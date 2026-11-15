# Plan: Route-Level Authentication Tests for Six Routers

Branch: `test/audit-unauthenticated-router-auth`
Status: reviewed by independent plan subagent; amendments 1–7 incorporated.

## Key design decision: test style

Two existing styles exist:
1. `Servers/routes/__tests__/` — bare Express app + supertest, external middleware/controllers mocked with `jest.mock`. Fast, no DB. But: mocked middleware means removing real protection would NOT fail the test.
2. `Servers/tests/integration/` — real app + real Postgres. Heavy; requires `.env.test` DB.

**Chosen approach: style 1 (bare app + supertest) but WITHOUT mocking the auth mechanism under test.** For all six routers, the auth logic lives *inside* the router file, its controller, or a service function (not in shared external middleware like `authenticateJWT`), so we can mount the real router and mock only DB/service boundaries. Tests therefore fail if the protection is removed, while staying deterministic and DB-free.

## Cross-cutting requirements (from review)

- **`req.t` stub (amendment 2):** shadowAi and webhook controllers build error bodies via `req.t!(...)`. On a bare app without i18n, `req.t` is undefined → TypeError → 500 (shadowAi, outside try/catch) or 200 "Internal processing error" (webhook, inside catch). Every new file asserting error bodies installs `req.t = (s) => s` middleware first (precedent: `routes/__tests__/integration/user.profilePhoto.access.test.ts:79-81`). internal.route uses plain `{error:"Unauthorized"}`, no stub needed, but harmless to keep consistent.
- **Imports:** use `@jest/globals` import style per existing `routes/__tests__` files (amendment 7).
- **Runner:** files under `routes/__tests__/` run under default `npm test` (integration ignore pattern doesn't match). Each file must mock import-time DB hazards (`database/db`) before importing routers.

## Per-router plan

### A. `Servers/routes/__tests__/internal.route.test.ts`
Auth: `verifyInternalKey` inline in `internal.route.ts:27-41` — `x-internal-key` header vs `getGatewayInternalKey()` (`utils/aiGatewayConfig`, reads `process.env.AI_GATEWAY_INTERNAL_KEY`, trimmed, per call — amendment 6: set that env var; verify util doesn't throw at import).
- Mount real router (`express.json()` + router). Mock ONLY `services/aiGateway/aiGatewayNotifications` and `utils/monitoringConfig.utils` (DB access for `/observability-config`).
- Set `process.env.AI_GATEWAY_INTERNAL_KEY = "test-internal-key"` in beforeAll; restore after.
- Cases:
  - POST `/ai-gateway/notify` no header → 401 `{error:"Unauthorized"}`
  - wrong key → 401; key of different length (length-guard branch) → 401
  - env var unset → 401 even with a header sent (fail-closed)
  - valid key + `{type, organization_id}` → 200 `{ok:true}`; mocked notification service called with org id from body
  - valid key + missing `type`/`organization_id` → 400
  - GET `/observability-config` no key → 401 and body must NOT contain `auth_header`; valid key → 200 (mocked config)
- Tenant note: tenant (`organization_id`) is caller-supplied body input by design (single instance-wide internal secret; gateway is a trusted internal caller). Test documents this contract. Observation, not a vuln.

### B. `Servers/routes/__tests__/telemetry.route.test.ts`
Intentionally public (docblock: "intentionally unauthenticated and bounded"). Single `POST /` → always 204.
- **Amendment 3:** without OTel initialized, `isObservabilityEnabled()` is false → early 204, making bounding/clamp tests vacuous. Therefore: mock `../observability/otel` with `isObservabilityEnabled: () => true` (keep any other exports needed real/stubbed), and mock `@opentelemetry/api` + `@opentelemetry/api-logs` to capture `counter.add` / `histogram.record` / `logger.emit`.
- Cases (all → 204):
  - no auth header at all → 204 (locks in intentional public contract; fails if auth added)
  - missing/empty `events` → 204
  - >50 events → 204 and captured counter adds bounded to ≤50 events
  - oversized strings clamped to 512 chars in captured emissions
- No tenant isolation applicable (no tenant identity exists). Stated explicitly in test comments.

### C. `Servers/routes/__tests__/version.route.test.ts`
Public static `GET /` → 200 `{version: string}` (may be `"unknown"` if version.json not found from ts-jest `__dirname` — assert string, not value).
- Mount real router; assert unauthenticated GET → 200 with string version. No auth, no tenant scope. Small file.

### D. `Servers/routes/__tests__/shadowAiIngestion.route.test.ts`
Auth inline in `shadowAiIngestion.ctrl.ts`: `x-api-key` header presence (real controller code), then `validateApiKeyWithCache` (`utils/shadowAiApiKey.utils.ts:182`), which contains the format regex `^vw_sk_\d+_[a-f0-9]{48}$` (utils:184) and DB hash lookup.
- **Amendment 1 (corrects plan's factual error):** the regex is in the util, NOT the controller. Do NOT mock `shadowAiApiKey.utils`. Instead `jest.mock("../database/db")` and stub `sequelize.query` + `sequelize.transaction` (commit/rollback — ctrl:164 uses transactions). Keep `validateApiKeyWithCache` and its regex REAL. Also mock `shadowAiToolMatcher.service`, `shadowAiModelExtractor.service`, `shadowAiAlertNotification.service`, `shadowAiConfig.utils` (`getSettingsQuery` — otherwise silent DB error; acceptable but intentional), and `shadowAiIngestion.utils` as needed.
- Cases:
  - missing `x-api-key` → 401 "Missing X-API-Key header" (real controller check)
  - malformed key (regex fail) → 401 "Invalid or revoked API key" — exercises REAL regex, no DB query issued (assert `sequelize.query` not called with lookup)
  - well-formed but unknown key (DB returns no rows) → 401 — exercises real hash + lookup
  - valid key (DB returns active row for org 1) + valid events → 200; insert received org 1
  - tenant isolation: event fields attempting to smuggle a different organization_id ignored — insert receives org from key (1), never from body
  - empty events array + valid key → 200 `{ingested: 0}`
- Fails-if-removed: deleting header check, regex, or DB validation breaks corresponding 401 tests.

### E. `virtualKeyProxy.route.ts` — DEVIATION (amendment 5)
Confirmed: Express layer is pure byte-forwarding proxy, NO Node-side auth by design; API-key auth lives in Python AIGateway (`AIGateway/src/routers/proxy.py:124-133`, `proxy_service.py`). Gap confirmed: `AIGateway/tests/` has NO proxy-auth test (missing/invalid key → 401, cross-tenant).
- **Node side (small, optional gap-fill):** Jest maps `http-proxy-middleware` to a stub, so header-forwarding fidelity is untestable in Node (vacuous under stub). Extend existing `virtualKeyProxyForwarding.test.ts` ONLY for genuinely uncovered Node-owned behavior after gap check: `Expect` header stripping, 415/502 error shapes. No new file if gap check shows coverage exists.
- **Python side (real deliverable):** add `AIGateway/tests/test_proxy_auth.py` (pytest, follow existing AIGateway test conventions, mock DB lookup): missing `Authorization` → 401; wrong prefix → 401; malformed/unknown `sk-vw-...` key → 401; valid key → proceeds; cross-tenant: key of org A cannot resolve org B's endpoint (endpoint resolution is org-scoped, org derived from key not request).
- Requires user approval of this deviation from "six files under Servers/routes/__tests__/".

### F. `Servers/routes/__tests__/webhook.route.test.ts`
Auth: HMAC-SHA256 `X-Hub-Signature-256: sha256=<hex>` over raw body vs per-repo `webhook_secret`, `verifyGitHubSignature` (`services/webhook.service.ts:54-65`, timingSafeEqual + length guard).
- Mount real router with `express.raw({type:"application/json"})` as route file does. Mock ONLY `utils/aiDetectionRepository.utils` (`getRepositoryByOwnerNameForWebhook` → repo with known secret, org 1).
- **Amendment 4:** `handlePushEvent`/`handlePullRequestEvent` live in the SAME module as `verifyGitHubSignature`. Partial-mock `services/webhook.service` via `jest.requireActual` + override only handlers (or `jest.spyOn` on handler exports). NEVER mock `verifyGitHubSignature`. Also: `webhookLimiter` is real in the router — ensure `NODE_ENV=test` (relaxes limiter, rateLimit.middleware.ts:36-39) or mock the limiter to avoid order-dependent 429s.
- Compute real HMACs in-test with `crypto.createHmac("sha256", secret)`.
- Cases:
  - missing `X-Hub-Signature-256` → 401 (repo lookup happens first — mock returns repo)
  - malformed signature (no `sha256=` prefix / bad hex) → 401
  - valid format, wrong secret → 401
  - body tampered after signing → 401 (proves signature covers payload)
  - valid signature + `ping` → 200 `{message:"pong"}`
  - valid signature, repo not registered (mock null) → 200 by design (documented GitHub-retry behavior)
  - tenant isolation: tenant resolved from matched repo row; valid signature for repo A (org 1) → dispatched scan context org = 1, never from payload
  - 400 paths: missing `X-GitHub-Event`, invalid JSON body

## Quality gates per file
- Exact production status codes + error bodies.
- Positive controls (valid credential succeeds) so tests can't pass via unrelated failures.
- Never mock the auth mechanism itself; only DB/service boundaries mocked.
- Deterministic: env vars set/restored, `NODE_ENV=test`, no network, no DB.

## Validation commands
- Per file: `cd Servers && npx jest routes/__tests__/<file> --forceExit`
- Python: `cd AIGateway && venv/bin/pytest tests/test_proxy_auth.py` (or repo's pytest convention)
- Final: `cd Servers && npm test`, `npx tsc --noEmit` (or `npm run build`), `npx eslint routes/__tests__`, Prettier check per repo config; AIGateway pytest suite.

## Implementation order (checkpoint after each)
1. Batch 1: internal + version + telemetry (no DB mocks)
2. Batch 2: webhook
3. Batch 3: shadowAiIngestion
4. Batch 4: virtualKeyProxy (Python test + Node gap-fill)
