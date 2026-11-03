# GlitchTip (self-hosted Sentry-compatible error tracking)

Issue **#4682 (stack part)**: the observability stack gets a
[GlitchTip](https://glitchtip.com) service. GlitchTip speaks the **Sentry
SDK protocol**, so the backend (Node/Express), frontend (React) and AI
Gateway (FastAPI) can report exceptions with the standard Sentry SDKs —
no app-side GlitchTip integration needed, only a `SENTRY_DSN` per service.

> **TODO(metric-wiring) / app-pod follow-up:** the Sentry SDKs are **not
> installed in app code yet** (today only `TODO: Send to error tracking
> service` comments exist, e.g. `Clients/src/application/utils/secureLogger.utils.ts:74`
> and the React error boundaries). The wiring contract is:
> - Backend (`Servers`): `@sentry/node` initialized after `initObservability()`
>   in `Servers/index.ts`, reading `SENTRY_DSN`.
> - Frontend (`Clients`): `@sentry/react` initialized in the app entry,
>   reading `VITE_SENTRY_DSN`.
> - AI Gateway (`AIGateway`): `sentry-sdk[fastapi]` reading `SENTRY_DSN`.

## Compose services to add

The root `docker-compose.observability.yml` is owned by the CI/compose
workflow — add these snippets there.

### 1. Database (dedicated Postgres — do NOT share the app DB)

```yaml
  glitchtip-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: glitchtip
      POSTGRES_USER: ${GLITCHTIP_DB_USER:-glitchtip}
      POSTGRES_PASSWORD: ${GLITCHTIP_DB_PASSWORD:?set GLITCHTIP_DB_PASSWORD}
    volumes:
      - glitchtip_db_data:/var/lib/postgresql/data
    restart: unless-stopped
```

### 2. Migration job (runs once on deploy / before web starts)

```yaml
  glitchtip-migrate:
    image: glitchtip/glitchtip:latest
    command: migrate
    environment: &glitchtip-env
      SECRET_KEY: ${GLITCHTIP_SECRET_KEY:?set GLITCHTIP_SECRET_KEY}
      DATABASE_URL: postgres://${GLITCHTIP_DB_USER:-glitchtip}:${GLITCHTIP_DB_PASSWORD:?}@glitchtip-db:5432/glitchtip
      EMAIL_URL: ${GLITCHTIP_EMAIL_URL:-consolemail://}
      GLITCHTIP_DOMAIN: ${GLITCHTIP_DOMAIN:-http://localhost:8000}
      DEFAULT_FROM_EMAIL: ${GLITCHTIP_FROM_EMAIL:-glitchtip@verifywise.local}
    depends_on:
      - glitchtip-db
    restart: "no"
```

### 3. Web

```yaml
  glitchtip:
    image: glitchtip/glitchtip:latest
    environment: *glitchtip-env
      # Optional: reuse an existing Redis on the compose network for the task
      # queue; if unset, GlitchTip falls back to DB-backed tasks. Only add
      #   REDIS_URL: redis://redis:6379/1
      # if the stack already runs a Redis service you may point at.
      PORT: 8000
    depends_on:
      - glitchtip-db
    ports:
      # Front with the same TLS reverse proxy as Grafana (3001).
      - "8000:8000"
    restart: unless-stopped
```

…and add `glitchtip_db_data:` to the compose `volumes:` section.

## DSN wiring (per VerifyWise deployment)

In GlitchTip's UI, create one project per component, then set:

| Component | Env var | Example value |
|-----------|---------|---------------|
| Backend (`Servers/.env`) | `SENTRY_DSN` | `http://<public-key>@glitchtip.example.com/1` |
| Frontend (`Clients/.env.production`) | `VITE_SENTRY_DSN` | `http://<public-key>@glitchtip.example.com/2` |
| AI Gateway (`AIGateway/.env`) | `SENTRY_DSN` | `http://<public-key>@glitchtip.example.com/3` |

The DSN host must be **reachable from end-user browsers** for frontend
reports — use the public TLS domain (`GLITCHTIP_DOMAIN`), not the internal
compose name.

## How the smoke suite points at it

The e2e/smoke suite asserts that an intentional test error (raised by a
dedicated `/internal/sentry-test` route or by calling the SDK directly in the
test) lands in GlitchTip's API:

```bash
# after triggering the test error in the app:
curl -sf -u "${GLITCHTIP_ADMIN_TOKEN}" \
  "https://glitchtip.example.com/api/0/projects/verifywise/backend/issues/?query=sentry-test" \
  | grep -q sentry-test
```

For CI, provision `${GLITCHTIP_ADMIN_TOKEN}` as an organization auth token in
GlitchTip (Settings → Auth Tokens) rather than scraping credentials.

## Env vars introduced

| Variable | Purpose |
|----------|---------|
| `GLITCHTIP_SECRET_KEY` | Django secret key (required). |
| `GLITCHTIP_DB_USER` / `GLITCHTIP_DB_PASSWORD` | Dedicated Postgres credentials (password required). |
| `GLITCHTIP_DOMAIN` | Public URL of the GlitchTip web UI / DSN host. |
| `GLITCHTIP_EMAIL_URL` | e.g. `smtp://user:pass@mail:25` (`consolemail://` = log only). |
| `GLITCHTIP_FROM_EMAIL` | Sender for GlitchTip notification emails. |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | App-side DSNs (one per project, from the GlitchTip UI). |
| `GLITCHTIP_ADMIN_TOKEN` | Smoke-suite/CI API token (created in the UI, not in git). |
