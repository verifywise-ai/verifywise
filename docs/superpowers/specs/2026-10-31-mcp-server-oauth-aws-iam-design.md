# MCP server authentication: OAuth client credentials and AWS IAM

**Date:** 2026-10-31
**Status:** draft, awaiting approval
**Branch:** `feature/mcp-server-oauth-aws-iam` (own PR, off `develop`)

## Why

Admins register upstream MCP servers in AI Gateway → MCP → Servers
(`/ai-gateway/mcp/servers`). Agent Control proxies tool calls to them. Today a
server can only authenticate with nothing, a static bearer token or a static API
key. The first server the user needs to connect is the **AWS-managed AWS MCP
Server** (`https://aws-mcp.<region>.api.aws/mcp`). It does not accept a static
key; it wants a short-lived OAuth access token. Many enterprise MCP servers
(for example ones behind Amazon Bedrock AgentCore Gateway with Cognito) want
an OAuth client-credentials token instead.

Success: an Admin adds the AWS MCP Server with AWS credentials, discovery lists
its tools, agents call them through Agent Control, and nobody has to paste a
fresh token every hour. When the credentials stop working, the Servers page
says so.

## What the user decided

- Two new authentication options: **AWS IAM** and **OAuth (client credentials)**.
- Endpoint discovery for OAuth follows the MCP authorization spec (RFC 9728
  protected-resource metadata, then RFC 8414 authorization-server metadata),
  with manual entry as a fallback and override.
- The interactive **Connect** button (authorization code + PKCE) is **out of
  scope** for this PR and becomes a follow-up. Reason: AWS MCP Server only
  accepts authorization-code clients that registered through its restricted
  dynamic client registration ("approved agents", public redirect URIs only),
  so a self-hosted gateway cannot use that flow without AWS approving it.
- When a connection breaks (token request fails), the Servers page shows a
  warning.

## Facts this design rests on (verified 2026-10-31)

- AWS MCP Server headless auth: the caller signs a request to AWS Sign-In with
  AWS credentials (SigV4, signing name `signin`) and gets a bearer token back.
  botocore 1.43.123 ships it as `signin.CreateOAuth2TokenWithIAM`
  (`POST /v1/token?x-amz-client-auth-method=iam`), input `grantType` +
  `resource`, output `accessToken`, `tokenType`, `expiresIn`. AWS's own CLI
  example uses `--grant-type client_credentials --resource aws-mcp.amazonaws.com`.
- The token lasts the shorter of one hour or the remaining AWS session; there
  is **no refresh token**, so the client requests a new one when it expires.
- The IAM principal needs `signin:CreateOAuth2Token` (AWS managed policy
  `AWSMCPSignInOAuthAccessPolicy`). Every MCP call is then evaluated against
  that principal's own IAM policies, and CloudTrail logs it.
- Sources: AWS Security Blog "Introducing OAuth support for AWS MCP Server"
  (2026-07-09), AWS Sign-In user guide "Configure OAuth access to AWS MCP
  Server", botocore `data/signin/2023-01-01/service-2.json`.
- **Not yet proven end to end:** that the token from `CreateOAuth2TokenWithIAM`
  is accepted by `aws-mcp.<region>.api.aws/mcp` as `Authorization: Bearer`.
  Step 1 of the build is a throwaway check against a real AWS account (see
  *Build order*).

## Goals

1. `auth_type = "aws_iam"`: Admin enters region, access key ID and secret
   access key (optionally a session token). The gateway obtains, caches and
   renews the access token and sends it as a bearer token.
2. `auth_type = "oauth"`: Admin enters client ID and client secret, optional
   scope, and optionally the token URL. If the token URL is blank, the gateway
   discovers it. The gateway obtains, caches and renews the access token.
3. Both work everywhere the existing types do: tool discovery on save, manual
   "Discover", and proxied tool calls (`forward_tool_call`).
4. Failures to get a token are visible on the Servers page (the existing
   health chip turns to its error state, the tooltip says why in plain words).
5. Secrets are encrypted at rest exactly like today (`utils.encryption`,
   AES-256-GCM) and never returned by the API; Admins see a masked hint.

## Non-goals

- Authorization code / PKCE / the Connect button (follow-up).
- Per-user tokens. The gateway keeps one credential per server per
  organization, as today.
- Dynamic client registration.
- Assuming an IAM role (`sts:AssumeRole`) on top of the access key. Possible
  follow-up.
- Temporary AWS credentials (session tokens). They expire within hours, so a
  server set up with them would break on a schedule. Long-term access keys
  only until AssumeRole lands. (My call.)
- Using the gateway's own AWS identity (default credential chain, instance
  role). It needs host pinning and a deployment flag to be safe on a
  multi-tenant install; follow-up if a self-hosted customer asks. (My call.)
- Token exchange, mTLS client auth, `private_key_jwt`.
- Signing every MCP request with SigV4 directly (AWS MCP Server uses bearer
  tokens; AgentCore SigV4 inbound is a separate follow-up if a customer needs it).

## Anti-goals (failure even if it "works")

- A secret, access token or AWS key in a log line, an API response, an audit
  record or an error message.
- On a multi-tenant (hosted) deployment, one organization reaching AWS with
  the **host's** AWS identity. The boto3 client is always built with the
  stored keys explicitly; the default credential chain is never consulted.
- The gateway sending an OAuth client secret to a host the Admin never saw.
  A discovered token URL is only ever used after the Admin has seen it in the
  form and saved it.
- Token or discovery URLs that let an Admin make the gateway call internal
  addresses (SSRF). Every outbound URL goes through
  `assert_safe_outbound_url`, including discovered ones.

## Constraints from the existing code

- `ai_gateway_mcp_servers.auth_type` is `VARCHAR(20)`. Hence the short values
  `oauth` and `aws_iam`. **No migration needed**: `auth_config` is JSONB.
- `utils/mcp_credentials.py` is the single owner of the stored shape:
  `normalize_auth_config` (write path, keeps a stored secret when the field is
  left blank on edit and the type is unchanged), `build_auth_headers` (the only
  place secrets are decrypted for use), `public_auth_fields` (masked hints,
  Admins only). New types plug into these.
- `build_auth_headers` is synchronous and called from
  `services/mcp_proxy_service.py` (`fetch_server_tools`, `forward_tool_call`).
  Getting a token is network I/O, so header building for the new types becomes
  async. Keep the existing sync function for the static types and add an async
  entry point used by both call sites.
- Discovery failures are already stored in `health_status` /
  `last_discovery_error` and shown by the health chip in
  `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx`.
- Client UI strings need de/fr/es entries (`i18n:audit:strict`). House
  components only (`Select`, `Field`, etc. already used on the page).
- New gateway test files must be added to the self-contained list in
  `.github/workflows/aigateway-checks.yml` and to `AIGateway/CLAUDE.md`.

## Design

### Stored shapes (`auth_config`)

```
aws_iam -> {"region": "us-east-1",
            "access_key_id": "AKIA...",            # not secret, shown in full
            "secret_access_key_enc": "<iv:tag:ct>",
            "resource": "aws-mcp.amazonaws.com"}   # default, overridable
oauth   -> {"client_id": "...",
            "client_secret_enc": "<iv:tag:ct>",
            "token_url": "https://...",             # entered or discovered
            "token_url_source": "manual" | "discovered",
            "scope": "...",                         # optional
            "resource": "https://...",              # optional; default = server URL
            "auth_method": "client_secret_basic" | "client_secret_post"}
```

Edit semantics match today: a blank secret field on edit with the same type
keeps the stored secret; switching type requires the new credentials.

### Getting a token

New module `services/mcp_token_service.py`:

- `async get_access_token(org_id, server) -> str`
  - **Cache**: in-process dict keyed by `(org_id, server_id, fingerprint)`,
    where the fingerprint is a hash of the stored `auth_config`, so editing
    the credentials invalidates the cache automatically. Entry is reused until
    60 s before `expires_in`. A per-key `asyncio.Lock` stops a burst of tool
    calls from fetching N tokens at once. Tokens are never written to Redis
    or the database. (My call: in-memory is simpler and keeps bearer tokens
    out of shared storage; each worker fetching its own token once an hour is
    cheap.)
  - **aws_iam**: boto3 `signin` client with explicit credentials and region,
    `create_o_auth2_token_with_iam(grantType="client_credentials",
    resource=cfg.resource)`, run in a thread (`asyncio.to_thread`) since boto3
    is synchronous. Region defaults from the server URL host
    (`aws-mcp.<region>.api.aws`) when the admin leaves it blank. The client
    is constructed with `aws_access_key_id`/`aws_secret_access_key` passed
    explicitly and an empty botocore session, so env vars, profiles and the
    instance role can never leak in (unit test asserts this).
  - **oauth**: `POST token_url` with `grant_type=client_credentials`, `scope`,
    `resource` (RFC 8707, the MCP spec asks clients to send it), client auth by
    `auth_method` (default `client_secret_basic`). httpx, same timeout budget
    as discovery. Expect `access_token`, `expires_in` (default 3600 if absent).
- `invalidate(org_id, server_id)`: drop the cached token.
- Errors raise `TokenError` with an admin-readable message and **no secrets**:
  e.g. "AWS rejected the credentials (InvalidClientTokenId)", "The IAM user is
  missing permission signin:CreateOAuth2Token", "The token endpoint returned
  401 invalid_client". Map the common AWS error codes and OAuth `error` values;
  anything else becomes "Couldn't get an access token (HTTP 502)".

### OAuth endpoint discovery

Runs **only from the form**, never silently on save, so the Admin sees the
token URL before any secret is sent to it (my call; the reviewer pointed out
that metadata can name a token host on another origin, and a compromised
server could otherwise harvest the client secret). The form runs it
automatically when OAuth is chosen and the server URL is filled in, and again
from a "Find token URL" link; the result fills the Token URL field and the
discovered host is shown next to it. Saving an `oauth` server requires a
token URL. Steps, each URL checked with
`assert_safe_outbound_url`, total budget = `ON_SAVE_DISCOVERY_SECONDS`:

1. `GET`/`POST` the server URL unauthenticated; if it answers 401 with
   `WWW-Authenticate: Bearer resource_metadata="..."`, use that URL.
   Otherwise try `<origin>/.well-known/oauth-protected-resource<path>` then
   `<origin>/.well-known/oauth-protected-resource`.
2. From the protected-resource metadata take `authorization_servers[0]`.
3. Fetch `/.well-known/oauth-authorization-server<path>` (RFC 8414), then
   `/.well-known/openid-configuration` (OIDC; this is what Cognito publishes).
4. Take `token_endpoint`; if `token_endpoint_auth_methods_supported` lacks
   `client_secret_basic` but has `client_secret_post`, set `auth_method` to post.
5. Return `token_url` and `auth_method` to the form, which saves them with
   `token_url_source = "discovered"` (or `"manual"` if the Admin edited it).

If discovery fails, the form shows what was tried and asks the Admin to enter
the token URL by hand.

### Proxy integration

- `build_auth_headers_async(org_id, server)` in `mcp_credentials` (or the token
  service): static types delegate to the existing sync function; `oauth` and
  `aws_iam` return `{"Authorization": f"Bearer {token}"}`.
- `fetch_server_tools` and `forward_tool_call` call the async version.
- If the MCP server answers **401** to a call made with a cached token, the
  proxy invalidates the cache, gets a fresh token and retries **once**.
- A `TokenError` during discovery is recorded like any discovery failure
  (`health_status = "unhealthy"`, `last_discovery_error` = the message).
- During a tool call (my calls, matching `routers/mcp_proxy.py` today):
  - the agent gets the existing generic JSON-RPC `-32603` error; the
    admin-facing detail (IAM permission names, AWS error codes) is logged and
    audited, not sent to the agent;
  - `TokenError` does **not** count toward the circuit breaker, because the
    breaker protects against a failing upstream server, and a credential
    problem is not one; counting it would also stop the recovery below;
  - the server is marked unhealthy with the token message, but only when its
    status actually changes (an in-process "last written" flag per server),
    so a broken credential does not add a DB write to every call. Other
    upstream failures keep today's behaviour (no health write).
  - The next successful token fetch, on a call or on discovery, sets the
    server back to healthy the same way (one write on change).

### API

No new routes except the discovery helper:
`POST /internal/mcp/servers/discover-oauth` (Admin), body `{url}`, returns
`{token_url, auth_method}` or a 400 with the reason. Proxied by the existing
Express `/api/ai-gateway/*` passthrough.

`public_auth_fields` additions (Admins only): `aws_iam` → `aws_region`,
`aws_access_key_id`, `auth_secret_hint` (masked secret key); `oauth` →
`oauth_client_id`, `oauth_token_url`, `oauth_token_url_source`,
`oauth_scope`, `auth_secret_hint`.

### UI (AI Gateway → MCP → Servers → Add/Edit server)

`AUTH_TYPE_ITEMS` gains "OAuth (client credentials)" and "AWS IAM".

- **AWS IAM**: Region (prefilled from the URL), Access key ID, Secret access
  key (password field; "Current key: …abcd. Leave blank to keep it." on edit).
  Helper text: use long-term keys of an IAM user that has
  `signin:CreateOAuth2Token`; tool calls run with that user's permissions.
- **OAuth**: Client ID, Client secret, Scope (optional), Token URL (filled by
  discovery as described above, editable, required to save), a "Find token
  URL" link, Advanced: client authentication method, resource.
- List view: auth column shows "OAuth" / "AWS IAM". Health chip unchanged;
  its tooltip already shows `last_discovery_error`, which now carries the
  token message. (My call: no new "Needs reconnecting" state, because there is
  nothing to reconnect without the Connect flow; the existing chip plus a
  clear message is the warning.)
- All strings sentence case, de/fr/es added.

### Docs

- `AIGateway/CLAUDE.md`: auth types, env flag, new test files.
- `docs/technical/domains/agent-control.md`: credentials section.
- User guide (`shared/user-guide-content/...` MCP servers article): how to add
  AWS MCP Server (IAM policy, region, what the agent can do), how to add an
  OAuth server. Mirror to the website per the docs workflow.

### Dependencies

`boto3` (pinned, a version whose botocore includes the `signin` service;
1.43.x verified) added to `AIGateway/requirements.txt`. Check the Docker image
build and the image vulnerability scan still pass.

## Testing

Unit (self-contained, added to CI list):
- `mcp_credentials`: normalize/keep-secret/switch-type/public fields for both
  new types; `oauth` without a token URL rejected.
- AWS client built with explicit keys only: with `AWS_ACCESS_KEY_ID` etc. set
  in the test environment, the stored keys are still the ones used.
- Token service: cache hit, expiry renewal, fingerprint invalidation,
  concurrent requests share one fetch, error mapping (AWS `ClientError` codes,
  OAuth `error` bodies), nothing secret in messages. boto3 stubbed with
  `botocore.stub.Stubber`; OAuth via `httpx.MockTransport`.
- Discovery: 401 + `resource_metadata` header, well-known fallbacks, OIDC
  fallback, SSRF rejection of a discovered internal URL, auth-method choice.
- Proxy: 401 → invalidate → one retry; second 401 surfaces the error; token
  failure marks the server unhealthy once (not per call), does not trip the
  circuit breaker, and the agent sees only the generic error.
- Router: create/update with both types, discover-oauth route Admin-only.

Client: vitest for the form (fields per type, keep-secret hints, discovery
link fills the field), plus typecheck, `i18n:audit:strict`, format-check.

Manual: the AWS spike below, and a browser check of the form.

## Build order

1. **Spike (throwaway, not committed):** with real AWS credentials from the
   user, call `CreateOAuth2TokenWithIAM` and then `tools/list` on
   `https://aws-mcp.us-east-1.api.aws/mcp` with the bearer token. Confirms the
   resource value and the token's acceptance. Needs: an IAM user/role with
   `AWSMCPSignInOAuthAccessPolicy`. The user runs the script with their own
   AWS profile, so no keys pass through the assistant. Steps 2–5 for OAuth
   do not depend on the spike and can start in parallel.
2. Credentials + token service + tests.
3. Discovery + tests.
4. Proxy integration + tests.
5. Router + UI + i18n + tests.
6. Docs, gates (gateway pytest CI list, Servers build if touched, Clients
   typecheck/i18n/format/vitest), /code-review, browser check, push. PR only
   when the user asks.

## Left to the builder

Exact module boundaries, error-message wording (plain, sentence case, no
secrets), and test file names, within the above.
