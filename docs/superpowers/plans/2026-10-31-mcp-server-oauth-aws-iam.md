# MCP server OAuth + AWS IAM authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admins register MCP servers that authenticate with OAuth client credentials or AWS IAM (AWS Sign-In tokens for the AWS-managed AWS MCP Server), with tokens fetched, cached and renewed by the gateway.

**Architecture:** Two new `auth_type` values (`oauth`, `aws_iam`) plug into the existing single owner of credentials, `AIGateway/src/utils/mcp_credentials.py`. A new token service turns a stored config into a cached bearer token (httpx for OAuth, boto3 `signin` for AWS). The proxy's discovery and tool-call paths switch to an async header builder with one retry on 401. A form-only discovery route finds an OAuth token URL from the MCP server URL.

**Tech Stack:** FastAPI, httpx, boto3/botocore (new), pytest; React 19 + MUI 7 + house components, vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-mcp-server-oauth-aws-iam-design.md`

Worktree: `/Users/gorkemcetin/verifywise-mcp-oauth`, branch `feature/mcp-server-oauth-aws-iam`. Python: `AIGateway/venv` from the main checkout (`/Users/gorkemcetin/verifywise/AIGateway/venv/bin/python`) — run pytest from `AIGateway/` as `<venv>/bin/python -m pytest <file> -q`; install boto3 into it with `<venv>/bin/pip install "boto3==1.43.123"` (botocore 1.43.123 ships the `signin` service).

## Global Constraints

- `auth_type` values are exactly `"oauth"` and `"aws_iam"` (column is `VARCHAR(20)`; no migration).
- Stored shapes, exactly:
  - `aws_iam -> {"region", "access_key_id", "secret_access_key_enc", "resource"}` (`resource` default `"aws-mcp.amazonaws.com"`)
  - `oauth -> {"client_id", "client_secret_enc", "token_url", "token_url_source": "manual"|"discovered", "scope"?, "resource"?, "auth_method": "client_secret_basic"|"client_secret_post"}`
- Secrets encrypted with `utils.encryption.encrypt`; decrypted only inside `mcp_credentials` / the token service. Never in logs, API responses, audit text, error messages or the agent's JSON-RPC error.
- boto3 client always built with explicit `aws_access_key_id`/`aws_secret_access_key`; never the default credential chain. No session tokens, no AssumeRole, no default credentials.
- Every outbound URL (token URL, metadata URLs, server URL) passes `utils.safe_outbound_url.assert_safe_outbound_url`.
- `TokenError` subclasses `Exception`, **not** `ValueError` (the proxy maps `ValueError` to "Invalid params").
- Token fetch failures: agent sees the generic `-32603 "Internal error"`; not counted by `CircuitBreaker`; server health written only when it changes.
- Cache reuse until 60 s before expiry; `expires_in` missing → 3600; `expires_in <= 60` → use once, don't cache.
- AWS token call: `signin.create_oauth2_token_with_iam(grantType="client_credentials", resource=cfg["resource"])`, output `accessToken`, `expiresIn`.
- UI: sentence case, house components, de/fr/es for every new string (`i18n:audit:strict`), 30px controls.
- Gates before push: AIGateway pytest on the CI list; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check` and vitest on touched folders; /code-review; never `gh pr create` without the user asking.

## Review Focus

1. Admin edits an OAuth server, leaves the secret blank and changes the token URL → stored secret kept, cached token for the old config not reused. (Task 1 + Task 2 tests.)
2. Token endpoint answers 200 with no `access_token`, or non-JSON, or HTML → `TokenError("The token endpoint did not return an access token")`, nothing cached. (Task 2.)
3. Ten tool calls arrive at once on a cold cache → exactly one token request. (Task 2.)
4. Admin types a token URL like `http://169.254.169.254/...` or `http://localhost` → rejected at save (400) and refused again at fetch time. (Tasks 1, 2.)
5. A pasted AWS secret with a trailing newline/space, or a lowercase-invalid region → trimmed / rejected with a plain message at save. (Task 1.)

---

### Task 1: Stored shapes for `oauth` and `aws_iam`

**Files:**
- Modify: `AIGateway/src/utils/mcp_credentials.py`
- Test: `AIGateway/tests/test_18_mcp_credentials.py` (extend)

**Interfaces:**
- Produces:
  - `SUPPORTED_AUTH_TYPES = ("none", "bearer", "api_key", "oauth", "aws_iam")`
  - `TOKEN_AUTH_TYPES = ("oauth", "aws_iam")`
  - `DEFAULT_AWS_MCP_RESOURCE = "aws-mcp.amazonaws.com"`
  - `normalize_auth_config(auth_type, incoming, stored) -> dict` now handles both (incoming field names: oauth `client_id`, `client_secret`, `token_url`, `token_url_source`, `scope`, `resource`, `auth_method`; aws_iam `region`, `access_key_id`, `secret_access_key`, `resource`).
  - `token_secret(auth_type, cfg) -> str` (decrypted client secret / AWS secret key; "" if none).
  - `config_fingerprint(auth_type, cfg) -> str` — sha256 hex of `auth_type` + `json.dumps(cfg, sort_keys=True)`.
  - `public_auth_fields` adds: aws_iam → `aws_region`, `aws_access_key_id`, `auth_secret_hint`; oauth → `oauth_client_id`, `oauth_token_url`, `oauth_token_url_source`, `oauth_scope`, `auth_secret_hint`.
  - `build_auth_headers` returns `{}` for token types (the async builder in Task 4 handles them); `migrate_stored_config`/`legacy_config` return `{}` for them (unchanged behaviour for unknown types).

- [ ] **Step 1: Write failing tests** in a new `class TestTokenTypes`:
  - `test_oauth_encrypts_secret_and_keeps_fields`: `normalize_auth_config("oauth", {"client_id": " app ", "client_secret": " s3cret\n", "token_url": "https://auth.example.com/oauth2/token", "scope": "mcp"}, None)` → `client_id == "app"`, `decrypt(cfg["client_secret_enc"]) == "s3cret"`, `token_url_source == "manual"`, `auth_method == "client_secret_basic"`, `"client_secret" not in cfg`.
  - `test_oauth_requires_token_url`: missing `token_url` → `CredentialError` with message `"Enter the token URL, or use Find token URL"`.
  - `test_oauth_rejects_internal_token_url`: `token_url="http://169.254.169.254/latest"` → `CredentialError` (wrap `UnsafeOutboundUrlError` text).
  - `test_oauth_edit_keeps_secret_when_blank`: stored from the first test, incoming `{"client_id": "app", "token_url": "https://auth.example.com/v2/token"}` → secret kept, `token_url` updated, and `config_fingerprint` differs from the stored one.
  - `test_aws_iam_shape`: `normalize_auth_config("aws_iam", {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": " abc/def+ghi \n"}, None)` → `{"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key_enc": <decrypts to "abc/def+ghi">, "resource": "aws-mcp.amazonaws.com"}`.
  - `test_aws_iam_rejects_bad_region`: region `"US East"` → `CredentialError("Enter an AWS region such as us-east-1")`; region regex `^[a-z]{2}(-[a-z]+)+-\d+$`.
  - `test_aws_iam_requires_both_keys`: missing access key id or secret on create → `CredentialError("Enter the access key ID and secret access key")`.
  - `test_public_fields_token_types`: admin sees `oauth_client_id`, `oauth_token_url`, masked `auth_secret_hint` (not containing the secret); non-admin gets `{}`; aws_iam shows `aws_region`, `aws_access_key_id`.
  - `test_build_auth_headers_token_types_empty`: `build_auth_headers("oauth", cfg) == {}`.
- [ ] **Step 2: Run** `<venv>/bin/python -m pytest tests/test_18_mcp_credentials.py -q` → new tests FAIL.
- [ ] **Step 3: Implement** in `mcp_credentials.py`. Keep the static-type code paths as they are; add a `_normalize_token_type(auth_type, incoming, stored)` branch. Validate `token_url` with `assert_safe_outbound_url` and re-raise as `CredentialError`. `auth_method` only accepts the two values (else default basic). Update the module docstring's "Stored shape" list.
- [ ] **Step 4: Run** the file → all PASS (existing tests unchanged).
- [ ] **Step 5: Commit** `feat(ai-gateway): stored credential shapes for OAuth and AWS IAM MCP servers`.

---

### Task 2: Token service

**Files:**
- Create: `AIGateway/src/services/mcp_token_service.py`
- Modify: `AIGateway/requirements.txt` (add `boto3==1.43.123`)
- Test: `AIGateway/tests/test_23_mcp_token_service.py`

**Interfaces:**
- Consumes: `TOKEN_AUTH_TYPES`, `token_secret`, `config_fingerprint` (Task 1).
- Produces:
  - `class TokenError(Exception)` — `str(e)` is admin-readable, secret-free.
  - `async def get_access_token(auth_type: str, cfg: dict, *, transport: httpx.AsyncBaseTransport | None = None) -> str`
  - `def invalidate(auth_type: str, cfg: dict) -> None`
  - `async def auth_headers_for(auth_type: str, cfg: dict, *, transport=None) -> dict` — static types → `build_auth_headers(...)`; token types → `{"Authorization": f"Bearer {token}"}`.
  - Module seam for tests: `_aws_client_factory(region, access_key_id, secret_access_key)` returning a boto3 `signin` client (tests monkeypatch it and use `botocore.stub.Stubber`).
  - `TOKEN_TIMEOUT_SECONDS = 10`.

- [ ] **Step 1: Write failing tests** (`httpx.MockTransport` for OAuth; `Stubber` on a real `boto3.client("signin", region_name="us-east-1", aws_access_key_id="x", aws_secret_access_key="y")` for AWS; clear the cache in an autouse fixture via a `_reset_cache()` helper):
  - `test_oauth_basic_auth_request`: request is `POST token_url`, header `Authorization: Basic base64("app:s3cret")`, form body has `grant_type=client_credentials`, `scope=mcp`; `resource` present only when set in cfg. Returns the token.
  - `test_oauth_post_auth_method`: `auth_method="client_secret_post"` → `client_id`/`client_secret` in the form body, no Basic header.
  - `test_cache_reused_then_renewed`: first fetch `expires_in=3600`; second call makes no request; after monkeypatching `time.monotonic` past 3540 s a new request is made.
  - `test_short_expiry_not_cached`: `expires_in=30` → two calls, two requests.
  - `test_fingerprint_change_refetches`: same client, different `token_url` → new request.
  - `test_concurrent_cold_calls_fetch_once`: `asyncio.gather` of 10 calls → transport called once.
  - `test_missing_access_token`: 200 `{"token_type": "bearer"}` and 200 `text/html` → `TokenError("The token endpoint did not return an access token")`; cache empty afterwards.
  - `test_oauth_error_mapping`: 401 `{"error": "invalid_client"}` → message `"The token endpoint rejected the client ID or secret (invalid_client)"`; 400 `{"error": "invalid_scope"}` → `"The token endpoint rejected the request (invalid_scope)"`; 500 → `"Couldn't get an access token (HTTP 500)"`; `httpx.ConnectError` → `"Could not connect to the token endpoint"`. None of the messages contain `"s3cret"`.
  - `test_token_url_rechecked_at_fetch`: cfg with `token_url="http://127.0.0.1/token"` (bypassing normalize) → `TokenError` mentioning the address is not allowed; transport not called.
  - `test_aws_token`: Stubber expects `CreateOAuth2TokenWithIAM` with `{"grantType": "client_credentials", "resource": "aws-mcp.amazonaws.com"}`, responds `{"accessToken": "tok", "tokenType": "Bearer", "expiresIn": 3600}` → `"tok"`; factory called with the stored region/key id and the decrypted secret.
  - `test_aws_ignores_env_credentials`: with `AWS_ACCESS_KEY_ID=ENVKEY` set via monkeypatch, the factory still receives the stored key id.
  - `test_aws_error_mapping`: Stubber `add_client_error` with `InvalidClientTokenId`/`UnrecognizedClientException` → `"AWS rejected the access key (InvalidClientTokenId)"`; `AccessDeniedException` → `"The IAM user is missing permission signin:CreateOAuth2Token"`; other code `X` → `"AWS Sign-In returned an error (X)"`.
  - `test_auth_headers_for`: bearer type → existing header; oauth → `{"Authorization": "Bearer tok"}`.
  - `test_invalidate`: after `invalidate`, next call fetches again.
- [ ] **Step 2: Run** `<venv>/bin/pip install "boto3==1.43.123"` then the test file → FAIL (module missing).
- [ ] **Step 3: Implement** `mcp_token_service.py`:
  - Cache: `dict[str, tuple[str, float]]` keyed by `config_fingerprint`, value `(token, expires_at_monotonic)`; `dict[str, asyncio.Lock]` per key; reuse while `now < expires_at - 60`.
  - OAuth: `httpx.AsyncClient(timeout=TOKEN_TIMEOUT_SECONDS, transport=transport)`; re-check `assert_safe_outbound_url(token_url)`; parse JSON defensively.
  - AWS: `await asyncio.to_thread(client.create_oauth2_token_with_iam, grantType="client_credentials", resource=cfg.get("resource") or DEFAULT_AWS_MCP_RESOURCE)`; map `botocore.exceptions.ClientError` codes as tested; `EndpointConnectionError` → `"Could not connect to AWS Sign-In"`.
  - Log failures with `logger.warning("MCP token fetch failed: %s", message)` — message only.
- [ ] **Step 4: Run** the test file → PASS.
- [ ] **Step 5: Commit** `feat(ai-gateway): token service for OAuth and AWS IAM MCP servers` (include requirements.txt).

---

### Task 3: OAuth token URL discovery + route

**Files:**
- Create: `AIGateway/src/services/mcp_oauth_discovery.py`
- Modify: `AIGateway/src/routers/mcp_servers.py` (new route, declared **before** `/{server_id}` routes)
- Test: `AIGateway/tests/test_24_mcp_oauth_discovery.py`

**Interfaces:**
- Produces:
  - `class OAuthDiscoveryError(Exception)` — message lists what was tried, no secrets.
  - `async def discover_token_endpoint(server_url: str, *, transport=None, budget_seconds: float = ON_SAVE_DISCOVERY_SECONDS) -> dict` returning `{"token_url": str, "auth_method": "client_secret_basic"|"client_secret_post", "issuer": str}`.
  - Route `POST /mcp/servers/discover-oauth` (Admin; body `{"url"}`) → 200 with the dict above, 400 `{"detail": <message>}` on `OAuthDiscoveryError` / unsafe URL.

- [ ] **Step 1: Write failing tests** with `httpx.MockTransport`:
  - `test_resource_metadata_from_www_authenticate`: `POST https://mcp.example.com/mcp` → 401 with `WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"`; that doc lists `authorization_servers: ["https://auth.example.com"]`; `https://auth.example.com/.well-known/oauth-authorization-server` returns `token_endpoint` → result token_url and issuer `https://auth.example.com`.
  - `test_well_known_fallback_paths`: server answers 404/200 without the header; `/.well-known/oauth-protected-resource/mcp` 404, `/.well-known/oauth-protected-resource` 200 → works.
  - `test_oidc_fallback_for_cognito`: AS metadata 404, `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc/.well-known/openid-configuration` 200 → token_url from it (issuer has a path: RFC 8414 path-insertion URL tried first, then `<issuer>/.well-known/openid-configuration`).
  - `test_auth_method_post_when_basic_unsupported`: `token_endpoint_auth_methods_supported: ["client_secret_post"]` → `"client_secret_post"`; absent → basic.
  - `test_discovered_internal_url_rejected`: metadata names `authorization_servers: ["http://10.0.0.5"]` → `OAuthDiscoveryError` and no request to 10.0.0.5.
  - `test_nothing_found_message`: all 404 → message `"Couldn't find the token URL from this server address. Enter it by hand."`.
  - Router (follow `tests/test_20_mcp_servers_router.py` style): non-Admin → 403; Admin success → 200 dict; failure → 400 with the message.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the step order from the spec (*OAuth endpoint discovery* 1–4), every URL through `assert_safe_outbound_url`, whole thing under `asyncio.wait_for(budget_seconds)`; timeout → `OAuthDiscoveryError("The server did not respond within N seconds")`.
- [ ] **Step 4: Run** → PASS; also run `tests/test_20_mcp_servers_router.py` → PASS.
- [ ] **Step 5: Commit** `feat(ai-gateway): discover an MCP server's OAuth token URL`.

---

### Task 4: Proxy integration (discovery, tool calls, health)

**Files:**
- Modify: `AIGateway/src/services/mcp_proxy_service.py` (`fetch_server_tools`, `forward_tool_call`, `describe_discovery_error`)
- Modify: `AIGateway/src/routers/mcp_proxy.py` (tool-call `try` around `forward_tool_call`, outer handlers)
- Modify: `AIGateway/src/services/mcp_token_service.py` (health-on-change helper)
- Test: `AIGateway/tests/test_25_mcp_token_proxy.py`

**Interfaces:**
- Consumes: `auth_headers_for`, `invalidate`, `TokenError`, `TOKEN_AUTH_TYPES`.
- Produces:
  - `async def note_token_outcome(org_id: int, server_id: int, error: str | None) -> None` in the token service: calls `mcp_servers_crud.record_discovery_result(org_id, server_id, error)` only when `error` differs from the last value written for `(org_id, server_id)` in this process (initial state "unknown" → first outcome is written); swallows and logs DB errors.

- [ ] **Step 1: Write failing tests** (MockTransport upstream; monkeypatch `get_access_token`/token transport; monkeypatch `mcp_servers_crud.record_discovery_result` with a recorder):
  - `test_fetch_tools_uses_bearer_token`: oauth server → upstream sees `Authorization: Bearer tok`.
  - `test_401_invalidates_and_retries_once`: upstream 401 on first `initialize`, 200 after; token fetched twice; one retry only — a second 401 raises `httpx.HTTPStatusError`.
  - `test_static_types_no_retry`: bearer type 401 → no retry (unchanged behaviour).
  - `test_discovery_records_token_error`: `get_access_token` raises `TokenError("AWS rejected the access key (InvalidClientTokenId)")` → `run_discovery` returns failed with exactly that message stored.
  - `test_tool_call_token_error_generic_to_agent`: through the `/v1/mcp` handler (follow existing proxy tests' fixtures) → JSON-RPC error `-32603 "Internal error"`, audit text is the token message, `CircuitBreaker.record_failure` not called, `note_token_outcome` called with the message.
  - `test_note_token_outcome_writes_on_change_only`: error, same error, same error, None, None → 2 writes (`error`, then `None`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - Replace `**_build_auth_headers(...)` in both functions with `**(await auth_headers_for(auth_type, auth_config))`; delete the now-unused `_build_auth_headers` wrapper.
  - 401 retry: wrap the body of each function in a local `async def _attempt()`; on `httpx.HTTPStatusError` with status 401 and `auth_type in TOKEN_AUTH_TYPES`, `invalidate(auth_type, auth_config)` and call `_attempt()` once more. For `fetch_server_tools`, the 401 surfaces via `_rpc_result` → `raise_for_status`.
  - `describe_discovery_error`: `TokenError` → `str(exc)` (truncated like the rest).
  - `mcp_proxy.py`: in the inner `try`, add `except TokenError: raise` before `except ValueError: raise` (so it skips `CircuitBreaker.record_failure`). On success after the call, `await note_token_outcome(org_id, server_id, None)` only when `tool.get("auth_type") in TOKEN_AUTH_TYPES`. In the outer handlers add `except TokenError as e:` before `except ValueError`: `await _audit("error", str(e), True)`, `await note_token_outcome(org_id, server_id, str(e))`, return `_jsonrpc_error(msg_id, -32603, "Internal error")`.
- [ ] **Step 4: Run** the new file plus `tests/test_19_mcp_discovery.py tests/test_21_safe_outbound_url.py tests/test_22_monitor_mode.py tests/test_mcp_hook_*.py` → PASS.
- [ ] **Step 5: Commit** `feat(ai-gateway): use OAuth and AWS IAM tokens for MCP discovery and tool calls`.

---

### Task 5: Servers form and list (Clients)

**Files:**
- Create: `Clients/src/presentation/pages/AIGateway/MCPServers/MCPServerAuthFields.tsx`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx` (form state, `AUTH_TYPE_ITEMS`, payload builder, list auth label; move the existing bearer/api_key field JSX into the new component)
- Modify: `Clients/src/i18n/modules/*.ts` used by this page (de/fr/es for every new string)
- Test: `Clients/src/presentation/pages/AIGateway/MCPServers/index.test.tsx` (extend)

**Interfaces:**
- Consumes: API fields from Task 1 (`aws_region`, `aws_access_key_id`, `oauth_client_id`, `oauth_token_url`, `oauth_token_url_source`, `oauth_scope`, `auth_secret_hint`) and the route from Task 3 (`POST /ai-gateway/mcp/servers/discover-oauth`).
- Produces: `MCPServerAuthFields` props `{ form, setForm, editingServer, keepsStoredSecret, onFindTokenUrl, findingTokenUrl, tokenUrlNote }`.

UI copy (exact, sentence case):
- Auth type items: `"OAuth (client credentials)"` (`oauth`), `"AWS IAM"` (`aws_iam`). List label: `"OAuth"`, `"AWS IAM"`.
- OAuth fields: `"Client ID"`, `"Client secret"`, `"Scope (optional)"`, `"Token URL"`, link `"Find token URL"`, note after discovery `"Found at {host}. Check this is your identity provider before saving."`, discovery failure shows the API message. Advanced (collapsed, `"Advanced"`): `"Client authentication"` select (`"Basic (header)"` / `"In request body"`), `"Resource (optional)"`.
- AWS fields: `"Region"`, `"Access key ID"`, `"Secret access key"`, helper `"Use the long-term access key of an IAM user with the AWSMCPSignInOAuthAccessPolicy policy. Tool calls run with that user's permissions."`
- Keep-secret hints reuse the existing pattern: `"Current secret: {hint}. Leave blank to keep it."`

- [ ] **Step 1: Write failing tests:**
  - `it("submits an OAuth server with client credentials")`: choose OAuth, fill fields → POST payload `auth_config` equals `{client_id, client_secret, token_url, token_url_source: "manual", scope, auth_method: "client_secret_basic"}`.
  - `it("finds the token URL and marks it discovered")`: mocked discover route returns `{token_url: "https://auth.example.com/token", auth_method: "client_secret_post", issuer: "https://auth.example.com"}` → field filled, note shows `auth.example.com`, payload has `token_url_source: "discovered"` and `auth_method: "client_secret_post"`; editing the URL afterwards flips it to `"manual"`.
  - `it("runs token URL discovery when OAuth is chosen and the URL is filled")` → discover route called once.
  - `it("prefills the AWS region from an aws-mcp URL")`: URL `https://aws-mcp.eu-central-1.api.aws/mcp` → region field `eu-central-1`; payload `{region, access_key_id, secret_access_key}`.
  - `it("keeps the stored secret when the field is left blank on edit")` for oauth: payload omits `client_secret`; hint text visible.
  - `it("labels OAuth and AWS IAM servers in the list")`.
- [ ] **Step 2: Run** `cd Clients && npx vitest run src/presentation/pages/AIGateway/MCPServers` → FAIL.
- [ ] **Step 3: Implement.** Form state adds `oauth_client_id, oauth_client_secret, oauth_token_url, oauth_token_url_source, oauth_scope, oauth_resource, oauth_auth_method, aws_region, aws_access_key_id, aws_secret_access_key`. Region prefill regex `^https://aws-mcp\.([a-z0-9-]+)\.api\.aws/`; only fills an empty region. Auto-discovery fires once per (OAuth selected, URL value) when the token URL is empty, debounced 600 ms. Use the page's existing `Field`/`Select`/`CustomizableButton`/link components; no raw MUI inputs.
- [ ] **Step 4: Run** vitest on the folder → PASS; `npm run typecheck && npm run i18n:audit:strict && npm run format-check` → clean.
- [ ] **Step 5: Commit** `feat(ai-gateway): OAuth and AWS IAM options in the MCP server form`.

---

### Task 6: Docs, CI list, final gates

**Files:**
- Modify: `.github/workflows/aigateway-checks.yml` (add `tests/test_23_mcp_token_service.py tests/test_24_mcp_oauth_discovery.py tests/test_25_mcp_token_proxy.py` next to `test_18`)
- Modify: `AIGateway/CLAUDE.md` (self-contained list; a short "MCP server credentials" note: auth types, token cache, no default AWS credentials; bump Last Updated)
- Modify: `docs/technical/domains/agent-control.md` (credentials section)
- Modify: the MCP servers user-guide article under `shared/user-guide-content/content/` (find with `grep -rl "Bearer token" shared/user-guide-content`): how to add AWS MCP Server (IAM user + `AWSMCPSignInOAuthAccessPolicy`, region, URL `https://aws-mcp.us-east-1.api.aws/mcp`) and an OAuth server. Run the humanizer skill on new prose. Mirror to `~/website/verifywise/content/user-guide/` (do not commit the website).

- [ ] **Step 1:** Edit the files above.
- [ ] **Step 2: Run** the full CI pytest command from `aigateway-checks.yml` with the venv → all PASS; Clients gates + `npx vitest run src/presentation/pages/AIGateway` → PASS.
- [ ] **Step 3: Commit** `docs(ai-gateway): OAuth and AWS IAM for MCP servers`.
- [ ] **Step 4:** /code-review on the branch, fix findings, browser check of the form on a local stack (OAuth discovery against a MockTransport isn't possible in the browser — check field behaviour, payloads in the network panel, and the health chip message by pointing an OAuth server at a token URL that 401s), then `git push` (background). No PR until the user asks.
