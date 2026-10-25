# MCP governance tools and OAuth sign-in — design

Date: 2026-10-25. Branch: `feat/mcp-governance-tools`.

## Intent

A VerifyWise user should be able to add VerifyWise as a custom connector in the
grok.com chat (and in Grok Bot), sign in as themselves, and then ask questions
and take actions on their governance data in plain language:

- "List the high risks linked to vendor Acme."
- "Which ISO 42001 items are still open on the Payments use case?"
- "Create a task for Ana to review risk 42 by Friday."

Today `/api/mcp` only serves super-admin org/user administration, accepts only a
pasted API token, and answers a missing token with 400. grok.com custom
connectors only connect to servers that implement the MCP authorization spec
(OAuth 2.1 with discovery, dynamic client registration and PKCE), so the
connector fails with "connection failed". This design fixes both: governance
tools for every org member, and a standard OAuth sign-in. Anything that speaks
the same spec (ChatGPT, claude.ai connectors, Cursor) benefits too.

## Goals

1. Org-scoped governance tools on `/api/mcp`, reads and writes, for any org
   member, limited to what that user may already do in the app.
2. OAuth 2.1 sign-in for MCP clients: protected resource metadata, authorization
   server metadata, dynamic client registration, authorization code + PKCE,
   refresh tokens with rotation, revocation.
3. Keep the pasted bearer API token working (Grok Bot, Claude Code, scripts).
4. A consent screen in the app ("Grok wants to access your VerifyWise data as
   <you>") and a place to see and revoke connected apps.

## Non-goals

- New business logic. Tools wrap existing advisor functions and utils.
- Deletes through MCP. No delete tools in v1.
- Letting non-Admins mint API tokens (OAuth covers them).
- Super-admin tools over OAuth. Super-admin tools stay API-token only.
- A public catalog listing on grok.com.

## Anti-goals (failure even if it works)

- A tool returns data the same user could not see in the app (another org,
  a project they are not a member of where the app filters by membership, a
  task they cannot see).
- A write succeeds that the app's REST route would refuse for that user.
- A third-party chat gets cross-tenant power, or tokens that never expire.
- Tokens or secrets stored in plain text.

## Constraints and facts (verified on develop `e31e0b5ab`)

- `Servers/routes/mcp.route.ts`: stateless Streamable HTTP, `enableJsonResponse`,
  `router.use(authenticateJWT, superAdminOnly)`; mounted at `Servers/app.ts:446`.
- `Servers/mcp/server.ts` `buildMcpServer(caller)` registers `ToolDef[]`
  (`Servers/mcp/tool.ts`: `name, title, description, inputSchema (zod raw
  shape), handler(args, caller)`); no annotations yet.
- `authenticateJWT` (`Servers/middleware/auth.middleware.ts`): missing token →
  400 "Token not found"; API tokens are JWTs with `type:"api_token"`, checked
  against hashed `api_tokens` rows; sets `req.userId`, `req.role` (name),
  `req.organizationId`, `req.isSuperAdmin`, and runs the ALS/RLS context.
- `@modelcontextprotocol/sdk` 1.32.1 ships `mcpAuthRouter`, `requireBearerAuth`,
  `OAuthServerProvider`, `OAuthRegisteredClientsStore`
  (`dist/esm/server/auth`). `mcpAuthRouter` serves
  `/.well-known/oauth-authorization-server`, `/authorize`, `/token`,
  `/register`, `/revoke` relative to its mount and the protected resource
  metadata at `/.well-known/oauth-protected-resource<resource path>`.
- Advisor layer `Servers/advisor/`: read functions
  `fn(params, organizationId, userId?)`; write executors registered by
  `createWriteToolFn` in `writeToolExecutors` (`Map<toolName, (params, orgId)>`),
  normally routed through an in-app approval gateway that returns UI cards.
- Permission check usable from a tool: `userHasPermission(orgId, userId, key)`
  (`Servers/utils/userPermission.utils.ts:27`), fails closed, handles custom
  roles. Project visibility rule: `getUserProjects({userId, role}, orgId)`
  (`Servers/utils/project.utils.ts:98`). Task visibility:
  `getTasksQuery({userId, role}, orgId, …)` (`Servers/utils/task.utils.ts:206`).
- Production routing: only `/api` and `/v1` reach the backend; `/.well-known/*`
  falls through to the SPA in `Clients/nginx.conf`,
  `ansible/templates/verifywise-nginx.conf.j2`, Helm and k8s ingress. The
  app.verifywise.ai host nginx is hand-maintained (see
  `docs/prod-host-nginx-fixes-2026-10-21.md` style).
- Body parsing is JSON only (`app.ts:180-202`); the OAuth token endpoint
  needs `application/x-www-form-urlencoded`.
- CORS allows only HOST/localhost origins; grok.com calls are server-to-server
  (no Origin), so they pass.
- New org-scoped tables must be registered in
  `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`.

## Decided design

### 1. Endpoint and identity

- `/api/mcp` stays the one MCP endpoint. Drop the router-wide `superAdminOnly`.
- New auth middleware for the MCP route accepts either:
  - an OAuth access token issued by our authorization server, or
  - an existing bearer API token / session JWT, via the existing
    `authenticateJWT` logic.
  On no/invalid token it answers **401** with
  `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/api/mcp"`
  (the SDK's `requireBearerAuth` does this; wrap our verifier around it).
- The resolved caller is `{ userId, organizationId, roleName, isSuperAdmin,
  authKind: "oauth" | "api_token" | "session", clientName? }`, bound
  server-side at `buildMcpServer` time, never taken from tool arguments.
  OAuth tokens re-check on each request that the user still exists, still
  belongs to the org, and the grant is not revoked; the role name is read live
  (not from the token), as `authenticateJWT` does.
- Super-admin tools (`organizationTools`, `userTools`) are registered only when
  `isSuperAdmin && authKind !== "oauth"`. Governance tools are registered for
  every caller with an organization.

### 2. OAuth authorization server

- Implemented with the SDK: our `OAuthServerProvider` + clients store, served
  through `mcpAuthRouter` (or its handlers mounted individually where the
  paths below require it).
- **Issuer and paths.** Endpoints live under `/api/oauth/*` so they pass the
  existing `/api/` proxy rule: `/api/oauth/authorize`, `/api/oauth/token`,
  `/api/oauth/register`, `/api/oauth/revoke`. Metadata documents must be at
  root `/.well-known/...`:
  - `/.well-known/oauth-protected-resource/api/mcp` (and plain
    `/.well-known/oauth-protected-resource`)
  - `/.well-known/oauth-authorization-server` and
    `/.well-known/oauth-authorization-server/api/oauth` (path-inserted form for
    issuer `<origin>/api/oauth`); also `/.well-known/openid-configuration`
    variants returning the same AS metadata, because some clients probe them.
  The builder chooses the exact issuer string as long as every published
  `issuer` matches the URL it is served from per RFC 8414.
- **Public origin.** The issuer/resource URLs come from a configured public
  base URL (existing env such as `FRONTEND_URL`/`HOST`-derived; builder picks
  the existing one used for email links), never from the request Host header.
- **Proxy routing.** Add `location ^~ /.well-known/oauth-` (and
  `/.well-known/openid-configuration`) → backend in `Clients/nginx.conf` and
  `ansible/templates/verifywise-nginx.conf.j2`; add a `/.well-known` path to
  the backend in Helm `templates/ingress.yaml` and `kubernetes/ingress.yaml`.
  Write `docs/prod-host-nginx-mcp-oauth.md` with the exact block for the
  hand-maintained app.verifywise.ai host (the user/ops applies it).
- **Dynamic client registration** (`/api/oauth/register`): public clients
  (`token_endpoint_auth_method: none`) and confidential clients both accepted.
  Redirect URIs: `https://…` any host; `http://localhost`/`127.0.0.1` any port;
  private-use custom schemes (e.g. `cursor://…`) accepted (Grok Bot uses one).
  Reject `http://` to non-loopback, `javascript:`, `data:`, `file:`. Rate
  limited. Clients are global (not org-scoped): a registration grants nothing
  until a user consents.
- **Authorize** (`GET /api/oauth/authorize`): the SDK validates client,
  redirect URI, PKCE S256 and state, then calls `provider.authorize`, which
  stores a short-lived pending request (10 min) and redirects the browser to
  the SPA consent page `/oauth/consent?request=<opaque id>`.
- **Consent page** (SPA, requires login; login must return to it afterwards):
  shows client name, redirect host, the signed-in user, their organization and
  role, and plain text "can read and change data you can access in
  VerifyWise". Approve → `POST /api/oauth/consent/:request` (session JWT +
  CSRF as for any app write) → backend creates an authorization code (single
  use, 5 min, bound to client, redirect URI, PKCE challenge, user, org,
  resource) and returns the redirect URL; the page navigates to it. Deny →
  redirect with `error=access_denied`.
- **Token** (`POST /api/oauth/token`, form-encoded): code + PKCE verifier →
  access token (opaque random, 1 hour) + refresh token (opaque random,
  30 days, rotated on every use; reuse of a rotated refresh token revokes the
  whole grant). Refresh keeps user/org/client binding.
- **Storage**: all codes and tokens stored as SHA-256 hashes, never raw. New
  tables (sequelize migration, `verifywise` schema):
  - `oauth_clients` (global): client_id, hashed secret (nullable), metadata
    JSON (name, redirect_uris, grant types), created_at, last_used_at.
  - `oauth_grants` (org-scoped): id, organization_id, user_id, client_id,
    created_at, last_used_at, revoked_at.
  - `oauth_authorization_codes` (org-scoped): code_hash, grant/user/org,
    client_id, redirect_uri, code_challenge, resource, expires_at,
    consumed_at.
  - `oauth_tokens` (org-scoped): token_hash, kind (access/refresh), grant_id,
    family/parent for rotation, expires_at, revoked_at.
  - Pending authorization requests (pre-consent) can live in a table or Redis;
    builder's call, 10-minute TTL.
  Register org-scoped tables in `tenantIsolation.registry.ts`.
- **Revocation**: `/api/oauth/revoke` (RFC 7009); revoking from the app UI
  revokes the grant and every token in it. Removing a user from the org or
  deleting the user kills their grants (cascade or the per-request check).
- **Body parsing**: `express.urlencoded({ extended: false })` scoped to
  `/api/oauth` only.
- **Rate limits**: register and token endpoints get their own limiters
  (reuse `createRateLimiter` in `Servers/middleware/rateLimit.middleware.ts`).

### 3. Governance tools

New files under `Servers/mcp/tools/` (one per domain). Each tool: zod raw
shape, a clear description written for an LLM, MCP annotations
(`readOnlyHint: true` for reads; `destructiveHint: false`,
`idempotentHint` as appropriate for writes), and returns compact JSON via
`result()`.

**Access rules (apply in every tool):**
- Reads: same visibility as the app's REST GET for that user. Where the app
  filters by project membership or role (projects/use cases, tasks), the tool
  uses the same util (`getUserProjects`, `getTasksQuery`) with the caller's
  real `userId` and role — not the advisor's `userId: 0, role: "Admin"`
  shortcuts. For project-scoped results (risks by project, framework status
  for a project), a non-Admin can only name a project returned by
  `getUserProjects`. Org-wide lists the app already shows every member
  (vendors, vendor risks, models, model risks, policies, incidents, evidence)
  stay org-wide.
- Writes: the tool checks the same permission key as the REST route
  (`risks.edit`, `vendor.edit`, `model.edit`, `task.edit`, `policy.edit`,
  `useCase.edit`) with `userHasPermission(orgId, userId, key)`. Where the REST
  route has no `authorize()` (incidents, framework status updates), the tool
  refuses roles that are read-only in the app (Auditor / any role without an
  edit key — builder uses the closest existing key and documents it).
- Writes run the advisor executor from `writeToolExecutors` directly (no
  in-app approval card; the MCP client is responsible for confirming with
  its user) after the permission check, and append an audit ledger entry
  (`appendToAuditLedger`) with the real `userId`, the tool name, the client
  name and the entity id. Where an executor does not record change history
  with the user, the MCP layer's audit entry is the record.
- Errors come back as `isError` tool results with a plain message; no stack
  traces or SQL.

**v1 tool list** (names are final unless the builder finds a clash):

Reads
- `whoami` — user, organization, role, auth kind.
- `list_use_cases` — visible projects/use cases, with ids.
- `list_risks` — filters: use case id, risk level (incl. "high" =
  High/Very high risk), severity, mitigation status, owner, limit.
- `get_risk` — one risk by id (visibility as above).
- `list_vendors` — filters: name substring, review status, criticality.
- `list_vendor_risks` — filters: vendor id or vendor name, severity
  (incl. "high" = Major/Catastrophic or risk_level High/Very high), limit.
- `list_models`, `list_model_risks` — filters: model id, level, status.
- `get_framework_status` — framework (ISO 42001, ISO 27001, EU AI Act,
  NIST AI RMF, and the bundled frameworks), use case id, `only_open`
  (open = not Implemented/Audited for 8-status frameworks; not Done for EU
  AI Act). Returns items with id, reference, title, status, owner, due date.
- `list_policies`, `list_incidents`, `list_tasks`, `list_evidence`.
- `search` — wraps `wiseSearch` with the caller's real `userId`.

Writes
- `create_risk`, `update_risk` (incl. status change, owner).
- `create_vendor_risk`, `update_vendor_risk`.
- `update_model_risk`.
- `create_task`, `update_task`.
- `create_incident`, `update_incident`.
- `update_framework_item` — set status/owner/notes of a clause, annex,
  control or subcategory; framework + item id.

The builder may merge or split tools if an underlying function forces it, as
long as the two example questions in "Intent" each resolve in at most two
tool calls.

### 4. Frontend

- Route `/oauth/consent` (lazy, in `Clients/src/application/config/routes.tsx`),
  requires login. Fix Login to honour the `from` location set by
  `ProtectedRoute` so the user lands back on the consent page with its query.
- Consent page uses house components (`CustomizableButton`, theme tokens,
  sentence case, i18n de/fr/es).
- Settings: a "Connected apps" section listing the user's grants (client
  name, created, last used) with Revoke. Backed by
  `GET /api/oauth/grants` and `DELETE /api/oauth/grants/:id` (own grants;
  Admins may see/revoke all grants in their org).
- Super-admin `McpConnect` page: unchanged behaviour, but text updated so it
  is clear the downloaded token is for super-admin tools.
- User guide: a "Connect an AI assistant" article in
  `shared/user-guide-content/` (Grok chat, Grok Bot, ChatGPT/Claude) with the
  URL `https://<your host>/api/mcp`. Mirror to the website per the usual
  workflow.

## Builder-check answers (2026-10-25)

- **Organizational frameworks** (ISO 42001, ISO 27001, NIST AI RMF are
  `is_organizational`, attached only to the organizational project):
  `get_framework_status` ignores `use_case_id` for them and returns the
  org-wide status. The "on the Payments use case" wording in Intent is loose;
  the acceptance question is "which ISO 42001 items are still open". (Builder's
  call, recorded.)
- **Who sees organizational framework status**: org-wide for every org member,
  matching the app — the `/iso-42001`, `/iso-27001`, NIST routes have no
  `authorize()` and no membership check. The general rule ("same as the app's
  REST GET") wins over the `getUserProjects` example wherever they disagree.
- **`update_task`**: copy REST exactly — no `task.edit` key on update; apply
  the controller's per-user task visibility (`updateTaskByIdQuery` with real
  `userId` and role). `create_task` checks `task.edit` like `POST /tasks`.
- **Attribution**: inject the real `userId` as `_userId` into advisor
  executors (as `Servers/advisor/toolBridge.ts:198` does) plus the MCP audit
  ledger entry naming the client. Entity change history is not extended to
  show the client name in v1.
- **Org-level connector switch (Admins turn third-party connectors off / limit
  roles)**: OPEN — user decision pending. Plan so it can be added in the
  authorize/consent step and the per-request check without a token migration.

## Left to the builder

- Exact table columns/indexes, pending-request storage, token formats (opaque
  random, base64url, ≥32 bytes).
- Exact issuer string and which `.well-known` variants to serve, within the
  rules above; verify against the MCP authorization spec version the SDK
  targets.
- Mapping each tool to the best existing function; small adapters where the
  advisor function lacks a filter (e.g. vendor name → id).
- Where `writeToolExecutors` lacks an executor (e.g. bundled-framework item
  update), call the existing util used by the REST route.

## Verification

- Unit tests (Jest, `npm run test`, never `npx jest` without
  `--testPathIgnorePatterns=/tests/integration/`): provider (DCR validation,
  PKCE, code single use/expiry, refresh rotation + reuse detection,
  revocation), MCP auth middleware (401 + `WWW-Authenticate`, API token path,
  OAuth path, revoked grant), tool access rules (non-member project refused,
  Auditor write refused, permission key checked, org binding), tool
  registration (super-admin tools absent for OAuth callers).
- Frontend: vitest for consent page and connected apps; typecheck, i18n
  strict, format-check, build.
- End to end locally: run backend + frontend, use the MCP Inspector or
  `npx @modelcontextprotocol/inspector` against `http://localhost:3000/api/mcp`
  to complete discovery → register → consent → token → `tools/list` →
  `list_risks`. Then, once deployed, add the connector on grok.com and ask
  the two example questions.
- Gates: Servers build/format/test, Clients typecheck/i18n/format/build,
  Semgrep 1.178.0 against `origin/develop`.
