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
