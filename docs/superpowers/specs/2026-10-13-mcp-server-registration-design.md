# MCP server registration: make it work (phase 1)

**Date:** 2026-10-13
**Status:** Approved; written spec reviewed 2026-10-13 (review delegated by the user)
**Branch:** `fix/mcp-server-registration` (from `develop` @ `47fa3cf37`)

## Problem

Registering an MCP server under AI Gateway → MCP servers saves a row and does
nothing else. Discovery (connect, `initialize`, `tools/list`, store tools, set
health) exists in the gateway but nothing calls it: the "Discover tools" button
has been hard-disabled with a "Coming soon" tooltip since the feature shipped in
April 2026. Registered servers therefore show Health "Unknown" and Tools "—"
forever, and agents on the MCP proxy (`POST /v1/mcp`) see none of their tools.
A customer reported exactly this for their server "Test MCP" (`api_key` auth).

Five defects sit behind the disabled button and would surface as soon as
discovery is switched on:

1. **API keys are sent blank.** The form saves `{header_name, api_key}`; the
   gateway's `_build_auth_headers` reads `header` and `key`, so every `api_key`
   server is called with an empty `x-api-key` header. Bearer (`token`) works.
2. **Credentials are exposed.** `auth_config` is plain JSONB, and the list and
   get endpoints return it unmasked with no Admin check.
3. **Disabled servers still advertise tools.** `get_all_tools` filters on
   `t.is_active` only, so the proxy's `tools/list` shows tools from disabled
   servers (calls to them are blocked).
4. **The Tools column is always empty.** The page reads `tool_count`, but no
   server query returns it, so a server shows "—" even after discovery. List and
   get responses now include the count of active tools.
5. **The copy overpromises.** The empty state and the user guide promise
   automatic discovery, periodic health checks and bypassing unhealthy servers.
   None of it exists.

Open PR #4968 (bug sweep) carried five #4908 commits that overlapped this
work: background discovery on create (`935c62473`) and its test (`929c9ca32`),
the enabled button and new empty-state copy (`5d1cd01f4`), its test
(`bc3ff43d7`) and the de/fr/es strings (`df19d5b41`). Background discovery
there only logged failures, and none of the credential defects were fixed.
**Decision:** this branch owns discovery, the button and the copy. The #4908
work was reverted on #4968 in `3203b1443` (one revert commit, no history
rewrite), so the two PRs do not conflict.

## Goals

- An admin registers a server and immediately learns whether it works: tools
  found, or the specific reason it could not connect.
- Existing servers, including "Test MCP", work without re-entering credentials.
- Server credentials are encrypted at rest and never returned in full.
- Agents see only tools from active servers.
- The UI copy and user guide describe what the product actually does.

## Non-goals (phase 2 and later)

Scheduled health checks and bypassing unhealthy servers; OAuth sign-in to
servers; namespacing tool names by server; hiding tools an agent may not call;
resources, prompts and stdio transport; the July 2026 MCP spec revision.

## Design

### 1. When discovery runs

Discovery runs **inline during the save, bounded by a 10-second budget**, so the
admin gets a definite result in the same request. The server is always saved,
whatever discovery returns.

| Trigger | Runs discovery |
|---|---|
| Create, server active | Yes |
| Edit whose body has a `url` or `auth_type` different from the stored value, or any `auth_config`, server active | Yes |
| Edit that sets `is_active` from false to true | Yes |
| Edit of name, slug, description or metadata only | No |
| Server inactive after the edit | No (`skipped`) |
| "Discover tools" button (Admin) | Yes, 30-second budget |

Create and PATCH responses gain a `discovery` object:

```json
{ "server": { ... },
  "discovery": { "status": "success" | "failed" | "skipped",
                 "tools_discovered": 12,
                 "error": null | "The server rejected the credentials (HTTP 401)" } }
```

The existing `POST /mcp/servers/{id}/discover` keeps its 502-on-failure
contract, with the friendly message as `detail`.

**Budget scope.** The budget bounds only the network phase (`initialize`,
`notifications/initialized`, every `tools/list` page). Discovery is split into
`fetch_server_tools` (network, wrapped in `asyncio.wait_for`) and
`store_discovered_tools` (database upsert and deactivation, never cancelled),
so a timeout can never leave a half-written tool list.

**Outcome recording.** Success sets `health_status = 'healthy'`, clears
`last_discovery_error`, stamps `last_health_check_at`. Failure sets `unhealthy`,
stores the friendly message in `last_discovery_error` (max 500 chars, never
contains secrets), stamps `last_health_check_at`. The health update filters on
`organization_id` as well as `id`.

**Friendly errors.** A single mapper turns discovery exceptions into messages:

| Cause | Message |
|---|---|
| HTTP 401/403 | The server rejected the credentials (HTTP 401) |
| Other HTTP 4xx/5xx | The server returned HTTP 5xx |
| Timeout / budget exceeded | The server did not respond within 10 seconds |
| Connection or DNS error | Could not connect to the server address |
| JSON-RPC error | The server returned an error: `<message>` (truncated) |
| Unparseable body | The server's reply was not a valid MCP response |

**Protocol fixes in discovery.** After a successful `initialize`, send
`notifications/initialized` (with the `Mcp-Session-Id` if one was issued) before
`tools/list`. Follow `nextCursor` until absent, capped at 20 pages to bound a
misbehaving server. Behaviour otherwise unchanged: upsert by
(org, server, tool_name), deactivate tools no longer advertised, never touch an
existing tool's `risk_level` or `requires_approval`.

### 2. Credentials

**Stored shape.** `auth_config` JSONB holds only encrypted secrets plus the
non-secret header name:

| `auth_type` | Stored `auth_config` |
|---|---|
| `none` | `{}` |
| `bearer` | `{"token_enc": "<iv:tag:ct>"}` |
| `api_key` | `{"header": "X-API-Key", "key_enc": "<iv:tag:ct>"}` |

Encryption uses the gateway's existing `utils/encryption.py` (AES-256-GCM, the
helper already used for provider API keys).

**Writes.** Create and PATCH accept either field spelling: `token`; `header` or
`header_name`; `key` or `api_key`. A normalizer maps them to the stored shape
and encrypts. Rules:

- `api_key` without a header name defaults to `X-API-Key`.
- PATCH without `auth_config` keeps the stored credentials.
- PATCH that changes `auth_type` to `bearer` or `api_key` must include the new
  secret, else 400 "Enter the credentials for the new auth type".
- PATCH that changes `auth_type` to `none` clears `auth_config`.
- PATCH with `auth_type` unchanged and an `api_key` header but no key keeps
  the stored key and updates the header. The form sends `{header}` alone when
  only the header name was edited, and nothing when both fields are untouched.

**Reads.** List and get responses never include `auth_config`. Instead:

- Admins: `auth_header` (api_key only) and `auth_secret_hint` (`mask_api_key`
  output, e.g. `abcd...wxyz`).
- Everyone else: neither field.
- Everyone: `last_discovery_error` (it never contains secrets), so the
  "Unhealthy" tooltip works for every role.

**Use.** `_build_auth_headers` is the only place secrets are decrypted. It reads
`token_enc` / `key_enc`; for rows not yet migrated it falls back to plaintext
`token`, `key` or `api_key` and to `header` or `header_name`. Both discovery and
`forward_tool_call` go through it.

**Migration `a0013`.**
- Adds `last_discovery_error TEXT NULL` to `ai_gateway_mcp_servers`.
- Rewrites each row's `auth_config` into the stored shape above, encrypting
  plaintext secrets and renaming `header_name` → `header`. Rows already in the
  new shape are left alone, so the migration is idempotent.
- Requires `ENCRYPTION_KEY`. If any row needs encrypting and the key is missing,
  the migration fails with a clear message rather than leaving mixed data.
- Downgrade decrypts back to `{token}` / `{header, key}` and drops the column.

### 3. Tool list, UI and docs

**Proxy tool list.** `get_all_tools` gains `active_servers_only: bool = False`;
the proxy's `tools/list` passes `True` (adds `AND s.is_active = true`). The
admin tool catalog keeps showing every tool, so admins can still see and
configure tools of a disabled server.

**MCP servers page** (`Clients/src/presentation/pages/AIGateway/MCPServers/`):
- "Discover tools" enabled. The page has no role gating today (non-Admins see
  every action and get the gateway's 403 as an error toast); this phase keeps
  that behaviour rather than adding role gating to one button. Shows a spinner
  while running; success toast "12 tools found"; failure toast with the
  message.
- Save shows "Server saved. 12 tools found", or "Server saved, but discovery
  failed: <message>" as a warning, or "Server saved" when skipped.
- An "Unhealthy" status shows `last_discovery_error` in a tooltip.
- Edit form: secret fields are empty with helper text "Leave blank to keep the
  current key" (or token); the current `auth_secret_hint` is shown beside it.
- Empty-state copy: "Register an MCP server to make its tools available through
  the gateway. Tools are discovered when you save a server, and you can run
  discovery again at any time." No claims about periodic checks or bypassing.
- New strings get de/fr/es translations (`i18n:audit:strict`).

**User guide** (`shared/user-guide-content/content/ai-gateway/`): correct
`mcp-overview.ts`, `mcp-servers.ts`, `mcp-tools.ts` to say discovery runs on
save and on demand; no periodic health checks yet; unhealthy servers are not
bypassed; tools no longer advertised are deactivated; disabled servers' tools
are hidden from agents. Mirror changed files to
`~/website/verifywise/content/user-guide/` (uncommitted).

**Technical doc:** update the MCP server registration part of
`docs/technical/domains/agent-control.md`.

## Testing

Gateway pytest (new file `AIGateway/tests/test_18_mcp_server_registration.py`,
following the fake-DB style of the existing MCP tests):

- Credential normalizer: both spellings, default header, encrypt round trip.
- PATCH rules: keep on omission, required on auth-type change, clear on `none`.
- Responses: no `auth_config`; hint for Admin; nothing for non-Admin.
- `_build_auth_headers`: encrypted rows and legacy plaintext rows.
- Discovery triggers per the table in section 1, including `skipped`.
- Budget exceeded → `failed` with the timeout message, server still saved.
- Error mapper: each row of the friendly-errors table.
- Discovery protocol: `notifications/initialized` sent; `nextCursor` followed;
  page cap honoured (fake transport via `httpx.MockTransport`).
- Proxy `tools/list` excludes tools of inactive servers; catalog does not.

Migration: `alembic upgrade head`, `downgrade -1`, `upgrade head` on the local
DB with a plaintext `api_key` row and a plaintext `bearer` row, checked by query.

Frontend vitest: replace the "discover button is disabled" assertion with tests
for the enabled button, its result toasts, the save result messages, the
Unhealthy tooltip and the "leave blank to keep" helper.

Manual end to end: register the dev test server (`AIGateway/test_mcp_server.py`,
FastMCP Streamable HTTP) with api_key auth and with bearer auth, confirm tools
appear and health is Healthy, call one tool through `/v1/mcp` with an agent key;
then repeat with one public MCP server; then confirm a wrong key gives the 401
message.

Gates: gateway pytest; `cd Servers && npm run build && npm run format-check`;
`cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint`;
full `npx vitest run` after the last code commit; `npx prettier --check` on
changed client files (the untracked `Clients/dist-analyze/` breaks
`format-check`).

## Risks

- **Migration needs `ENCRYPTION_KEY` in the gateway environment.** Deployments
  that run provider API keys already have it; one without it fails loudly at
  migration time rather than silently.
- **Saves now make an outbound call.** Bounded at 10 seconds; the server is
  saved regardless. Server URLs are admin-entered, so this adds no new
  server-side request surface beyond what the existing discover endpoint has.
- **#4968 history:** its branch now carries the #4908 commits plus their
  revert. Net effect on those files is zero.
