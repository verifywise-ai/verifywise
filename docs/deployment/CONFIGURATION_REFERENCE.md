# Configuration Reference

Complete reference for all VerifyWise configuration options.

---

## Environment variables

All configuration is managed through environment variables. Create a `.env` file in the project root.

---

## Core settings

### Application mode

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode (`development`, `production`) | `development` | Yes |

```bash
NODE_ENV=production
```

Demo data is not controlled by an environment variable. An Admin seeds it from
the app — the setup prompt shown on first login offers "Add demo data", which
calls `POST /api/autoDrivers`. The same endpoint backs the CLI seeder
(`cd Servers && npm run seed:demo -- --org <id> --with-use-cases`).

---

## Network configuration

### Ports

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BACKEND_PORT` | Backend API port | `3000` | Yes |
| `FRONTEND_PORT` | Frontend web server port | `8080` | Yes |
| `LLM_EVALS_PORT` | Evaluation server port | `8000` | No |

### URLs

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BACKEND_URL` | Full URL to backend API | `http://localhost:3000` | Yes |
| `FRONTEND_URL` | Full URL to frontend | `http://localhost:8080` | Yes |
| `HOST` | Bind address | `localhost` | No |

```bash
BACKEND_PORT=3000
FRONTEND_PORT=8080
BACKEND_URL=https://api.example.com
FRONTEND_URL=https://app.example.com
```

---

## Database configuration

### PostgreSQL

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | PostgreSQL hostname | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | Yes |
| `DB_NAME` | Database name | `verifywise` | Yes |
| `DB_USER` | Database username | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_SSL` | Enable SSL connection | `false` | No |
| `LOCAL_DB_PORT` | Host port for Docker mapping | `5433` | No |

```bash
DB_HOST=postgres.internal
DB_PORT=5432
DB_NAME=verifywise
DB_USER=verifywise_app
DB_PASSWORD=secure_password_here
DB_SSL=true
```

### Redis

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_HOST` | Redis hostname | `redis` | No |
| `REDIS_PORT` | Redis port | `6379` | No |
| `REDIS_URL` | Full Redis connection URL | `redis://redis:6379/0` | No |

```bash
REDIS_URL=redis://redis.internal:6379/0
```

---

## Authentication

### JWT tokens

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret for signing access tokens | - | Yes |
| `REFRESH_TOKEN_SECRET` | Secret for signing refresh tokens | - | Yes |

**Security requirements:**
- Minimum 64 characters (hex format recommended)
- Unique per environment
- Never share between applications

```bash
# Generate with: openssl rand -hex 64
JWT_SECRET=a1b2c3d4e5f6...64_hex_characters
REFRESH_TOKEN_SECRET=f6e5d4c3b2a1...64_hex_characters
```

### Token lifetimes (hardcoded)

| Token type | Lifetime | Notes |
|------------|----------|-------|
| Access token | 1 hour | Sent in Authorization header |
| Refresh token | 30 days | Stored in HTTP-only cookie |

---

## Encryption

### Data encryption

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENCRYPTION_KEY` | Key for encrypting sensitive data | - | Recommended |
| `ENCRYPTION_ALGORITHM` | Encryption algorithm | `aes-256-cbc` | No |
| `ENCRYPTION_PASSWORD` | Legacy encryption password | - | No |

**Used for:**
- LLM API key storage
- Integration credentials

```bash
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your-32-character-encryption-key
```

**Warning:** Changing `ENCRYPTION_KEY` after data is encrypted will make that data unreadable. You must re-save any encrypted credentials after changing this value.

---

## Multi-tenancy

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MULTI_TENANCY_ENABLED` | Enable multi-tenant mode | `false` | No |

When enabled:
- Each organization gets a separate PostgreSQL schema
- Tenant context is derived from JWT token
- Data is isolated between organizations

```bash
MULTI_TENANCY_ENABLED=true
```

---

## Email configuration

### Provider selection

| Variable | Description | Options | Required |
|----------|-------------|---------|----------|
| `EMAIL_PROVIDER` | Email service provider | `resend`, `smtp`, `exchange-online`, `exchange-onprem`, `amazon-ses` | Yes |
| `EMAIL_ID` | Sender email address | - | Yes |

### Resend (default)

```bash
EMAIL_PROVIDER=resend
EMAIL_ID=noreply@example.com
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

### Generic SMTP

```bash
EMAIL_PROVIDER=smtp
EMAIL_ID=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp_user
SMTP_PASS=smtp_password
SMTP_SECURE=false
```

### Exchange Online (Office 365)

```bash
EMAIL_PROVIDER=exchange-online
EMAIL_ID=noreply@company.onmicrosoft.com
EXCHANGE_ONLINE_USER=noreply@company.onmicrosoft.com
EXCHANGE_ONLINE_PASS=app_password_here
EXCHANGE_ONLINE_TENANT_ID=optional_tenant_id
```

### Exchange On-Premises

```bash
EMAIL_PROVIDER=exchange-onprem
EMAIL_ID=noreply@company.com
EXCHANGE_ONPREM_HOST=mail.company.com
EXCHANGE_ONPREM_PORT=587
EXCHANGE_ONPREM_USER=username
EXCHANGE_ONPREM_PASS=password
EXCHANGE_ONPREM_DOMAIN=COMPANY
EXCHANGE_ONPREM_SECURE=false
```

### Amazon SES

```bash
EMAIL_PROVIDER=amazon-ses
EMAIL_ID=noreply@example.com
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SES_SECRET_ACCESS_KEY=secret_key_here
AWS_SES_API_VERSION=2010-12-01
SES_CONFIGURATION_SET=optional_config_set
```

---

## Integrations

### Slack

| Variable | Description | Required |
|----------|-------------|----------|
| `SLACK_CLIENT_ID` | Slack OAuth client ID | For Slack integration |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret | For Slack integration |
| `SLACK_URL` | Slack OAuth URL | No (has default) |
| `SLACK_API_URL` | Slack API URL | No (has default) |
| `SLACK_USER_OAUTH_TOKEN` | User OAuth token | For Slack integration |
| `SLACK_BOT_TOKEN` | Bot token | For Slack integration |

```bash
SLACK_CLIENT_ID=123456789.123456789
SLACK_CLIENT_SECRET=abcdef123456
SLACK_USER_OAUTH_TOKEN=xoxp-...
SLACK_BOT_TOKEN=xoxb-...
```

### AI Gateway

The backend and the EvalServer call the AI Gateway's internal API with a shared key. Set the same value on the backend, the AI Gateway and the EvalServer, including any separate worker process or container (it runs the daily retention job). Both sides trim surrounding whitespace, and a whitespace-only value counts as not set.

| Variable | Description | Required |
|----------|-------------|----------|
| `AI_GATEWAY_URL` | Internal URL of the AI Gateway, used for every gateway call and the `/health` check | No (default `http://127.0.0.1:8100`) |
| `AI_GATEWAY_INTERNAL_KEY` | Shared secret sent as `x-internal-key` from the backend and the EvalServer to the AI Gateway. Set the same value in `Servers/.env`, the AI Gateway's environment and the EvalServer's environment | Yes, when the AI Gateway runs; always for the EvalServer |
| `MCP_AUDIT_RETENTION_DAYS` | Default number of days to keep Agent Control logs for organizations that have not set their own period in **Settings > Data retention**. Zero or less keeps logs indefinitely for those organizations | No (default `30`) |
| `MCP_AUDIT_RETENTION_MIN_DAYS` | Shortest period an organization may set for Agent Control logs. Not applied to `MCP_AUDIT_RETENTION_DAYS` | No (default `7`) |
| `GUARDRAILS_PRELOAD_PII` | Set on the AI Gateway. Loads the PII detection engine (Presidio and its spaCy model) in the background when the gateway starts, so the first PII guardrail scan does not wait for it. Set to `false` to load it on first use instead | No (default `true`) |

The default is the IPv4 loopback address. If the AI Gateway listens only on the IPv6 loopback (`::1`), set `AI_GATEWAY_URL=http://[::1]:8100`.

```bash
# Generate once and set on the backend, the AI Gateway and the EvalServer
AI_GATEWAY_INTERNAL_KEY=$(openssl rand -hex 32)
```

What happens when the key is missing or does not match:

- **AI Gateway:** refuses to start when `AI_GATEWAY_INTERNAL_KEY` is empty or a placeholder.
- **EvalServer:** refuses to start when `AI_GATEWAY_INTERNAL_KEY` is empty or a placeholder, because it runs every cloud model (tested models, judges, scorers, Arena, report summaries) through the AI Gateway. It also needs `AI_GATEWAY_URL` when the gateway is not on its own host, and `ENCRYPTION_KEY` (the backend's value) to read stored gateway keys for report summaries. On Helm with `secrets.existingSecret`, that Secret must contain both `AI_GATEWAY_INTERNAL_KEY` and `ENCRYPTION_KEY`, or the eval-server pod will not start.
- **Every internal route:** the gateway checks this key on all `/internal/*` calls from the backend and fails closed. The key is checked before the request body is validated against the route's schema, but after the body is read and decoded as JSON, so a request whose body is not valid JSON gets 422 even without the key. A missing or wrong key gets 401 with code `internal_key_rejected`. With no key configured every internal route answers 503 with code `internal_key_not_configured`. That is defence in depth, since the gateway refuses to start without a key.
- **Backend and worker:** each logs one startup warning when `AI_GATEWAY_INTERNAL_KEY` is not set and the gateway is in use: `AI_GATEWAY_URL` is set, or a gateway answers `/health` at the default address within 2 seconds. The daily retention job also logs a refusal once per run.
- **Log retention:** when the gateway refuses the daily purge over the key, the retention job records the guardrail and spend log cleanups as failed, and **Settings > Data retention** shows "Purge refused: internal key not configured" (key missing on either side) or "Purge refused: internal key rejected" (keys differ) in the Last cleanup column. No logs are deleted until the key is fixed.

### BrandFetch (frontend)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_BRANDFETCH_API_KEY` | BrandFetch API key for logo fetching | No |

```bash
VITE_BRANDFETCH_API_KEY=bf_xxxxxxxxxx
```

---

## Evaluation server

Configuration for the Python-based evaluation service.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LLM_EVALS_URL` | URL to evaluation server | `http://eval_server:8000` | No |
| `LLM_EVALS_PORT` | Evaluation server port | `8000` | No |

The evaluation server also requires database access:

```bash
# In EvalServer/.env
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=verifywise
BACKEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379/0
```

---

## Logging

Configuration for server logging (self-hosted deployments only).

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_RETENTION_DAYS` | Number of days to keep daily-rotated server log files | `14` | No |

Server logs are rotated daily and stored in the tenant log directory. The `LOG_RETENTION_DAYS` setting controls how many days of log files are retained before older files are automatically deleted.

```bash
# Keep server logs for 30 days
LOG_RETENTION_DAYS=30
```

**Notes:**
- Must be a whole number >= 1
- Invalid values (0, negative, decimals, non-numeric) fall back to the default of 14 days
- Intended for self-hosted deployments, where you control the environment
- Each daily file also rolls over to a new file when it reaches 10 MB; retention counts days, not files

---

## Docker Compose variables

These variables are used by Docker Compose for service configuration.

### Service dependencies

| Service | Depends on | Health check |
|---------|------------|--------------|
| backend | postgresdb, redis | pg_isready, redis-cli ping |
| frontend | backend | - |
| worker | postgresdb, redis | pg_isready, redis-cli ping |
| eval_server | backend, redis | - |

### Volume mounts

| Volume | Purpose | Container path |
|--------|---------|----------------|
| db | PostgreSQL data | /var/lib/postgresql/data |
| eval_uploads | Evaluation file uploads | /app/data/uploads |

---

## Security recommendations

### Production checklist

| Setting | Development | Production |
|---------|-------------|------------|
| `NODE_ENV` | development | production |
| `JWT_SECRET` | Any value | 64+ hex characters |
| `REFRESH_TOKEN_SECRET` | Any value | 64+ hex characters |
| `DB_PASSWORD` | Simple | Strong (16+ chars) |
| `DB_SSL` | false | true |
| URLs | localhost | HTTPS domains |

### Secret generation

```bash
# JWT secrets (64 hex characters = 256 bits)
openssl rand -hex 64

# Encryption key (32 characters minimum)
openssl rand -base64 32

# Database password
openssl rand -base64 24
```

---

## Example configurations

### Development

```bash
NODE_ENV=development

BACKEND_PORT=3000
FRONTEND_PORT=8080
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:8080

DB_HOST=localhost
DB_PORT=5432
DB_NAME=verifywise
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

REDIS_URL=redis://localhost:6379/0

JWT_SECRET=dev_jwt_secret_not_for_production
REFRESH_TOKEN_SECRET=dev_refresh_secret_not_for_production

EMAIL_PROVIDER=resend
EMAIL_ID=dev@example.com
```

### Production

```bash
NODE_ENV=production

BACKEND_PORT=3000
FRONTEND_PORT=8080
BACKEND_URL=https://api.verifywise.example.com
FRONTEND_URL=https://verifywise.example.com

DB_HOST=postgres.internal.example.com
DB_PORT=5432
DB_NAME=verifywise
DB_USER=verifywise_app
DB_PASSWORD=<strong-generated-password>
DB_SSL=true

REDIS_URL=redis://redis.internal.example.com:6379/0

JWT_SECRET=<64-hex-characters>
REFRESH_TOKEN_SECRET=<64-hex-characters>
ENCRYPTION_KEY=<32-character-key>

EMAIL_PROVIDER=amazon-ses
EMAIL_ID=noreply@verifywise.example.com
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=<access-key>
AWS_SES_SECRET_ACCESS_KEY=<secret-key>

MULTI_TENANCY_ENABLED=true
```

---

## Troubleshooting

### Common configuration errors

**Invalid JWT_SECRET:**
```
Error: secretOrPrivateKey must have a value
```
Solution: Ensure `JWT_SECRET` is set and not empty.

**Database connection failed:**
```
Error: ECONNREFUSED 127.0.0.1:5432
```
Solution: Verify `DB_HOST` and `DB_PORT` are correct. Check if PostgreSQL is running.

**Redis connection failed:**
```
Error: Redis connection to redis://localhost:6379 failed
```
Solution: Verify Redis is running and `REDIS_URL` is correct.

**Data retention shows "Purge refused: internal key not configured" or "...rejected":**
The daily cleanup of AI Gateway guardrail and spend logs was refused by the gateway. Solution: set the same `AI_GATEWAY_INTERNAL_KEY` on the backend and the AI Gateway, then restart both. See [AI Gateway](#ai-gateway).

**Email sending failed:**
```
Error: Invalid login credentials
```
Solution: Verify email provider credentials are correct. For Exchange Online, ensure you're using an app password if MFA is enabled.

---

## Additional resources

- [Security Hardening Guide](./SECURITY_HARDENING_GUIDE.md)
- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Authentication Architecture](../technical/architecture/authentication.md)
