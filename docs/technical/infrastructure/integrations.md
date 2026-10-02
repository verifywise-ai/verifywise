# External Integrations

## Overview

VerifyWise integrates with external services for AI model management, notifications, repository access, and LLM capabilities. All integrations use encrypted credential storage and follow multi-tenant isolation patterns.

## Integrations Summary

| Integration | Purpose | Auth Method |
|-------------|---------|-------------|
| MLflow (extension) | AI/ML model registry sync | None/Basic/Token |
| GitHub | Private repository access | PAT (encrypted) |
| Slack (extension) | Team notifications | OAuth + Webhooks |
| LLM Providers | AI advisor capabilities | API Keys (encrypted) |

---

## MLflow Integration

MLflow, Azure AI Foundry, Slack and Jira Assets are **extensions**. An Admin enables and configures them per organization. See [Extensions](./extensions.md) for the catalog, config storage, gate middleware and routes.

### Purpose

Pulls experiment runs from an MLflow tracking server into the Model inventory **MLFlow** tab.

### Configuration

Stored in `extension_enablements.configuration` for the `mlflow` extension. `password` and `api_token` are encrypted and never returned to the client. Fields: `tracking_server_url`, `auth_method` (`none` / `basic` / `token`), `username`, `password`, `api_token`, `verify_ssl` (default true), `timeout` (1–600 seconds, default 30). The service reads them with `ExtensionService.getRuntimeConfiguration("mlflow", organizationId)`.

Synced runs are stored in `mlflow_model_records`.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/extensions/mlflow/test-connection` | Test connection (catalog route, Admin) |
| PATCH | `/api/extensions/mlflow/configuration` | Save configuration (catalog route, Admin) |
| GET | `/api/extensions/mlflow/models` | List synced models |
| GET | `/api/extensions/mlflow/models/:modelId` | One synced model |
| POST | `/api/extensions/mlflow/sync` | Sync now |

### Sync

Sync is manual only (**Sync** button → `POST /sync`). No scheduled MLflow sync job exists.

---

## GitHub Integration

### Purpose

Provides access to private repositories for AI Detection scanning service.

### Database Schema

```
github_tokens
├── id (PK, SERIAL)
├── encrypted_token (TEXT NOT NULL)
├── token_name (VARCHAR, default: 'GitHub Personal Access Token')
├── created_by (FK → users)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── last_used_at (TIMESTAMP)
```

### API Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/integrations/github/token` | Admin | Get token status |
| POST | `/integrations/github/token` | Admin | Save token |
| DELETE | `/integrations/github/token` | Admin | Delete token |
| POST | `/integrations/github/token/test` | Admin | Test token |

### Token Formats

Supported GitHub PAT formats:
- **Classic:** `ghp_...` (40+ chars)
- **Fine-grained:** `github_pat_...` (30+ chars)
- **OAuth legacy:** 40 hex characters

### Token Test Response

```json
{
  "valid": true,
  "scopes": ["repo", "read:org"],
  "rate_limit": {
    "limit": 5000,
    "remaining": 4999,
    "reset": "2025-01-17T11:00:00Z"
  }
}
```

### Security

- Token encrypted with AES-256-CBC
- Never returned to frontend (only status)
- Admin-only access
- Usage tracking via `last_used_at`

---

## Slack Integration

### Purpose

Sends team notifications for automation events, alerts, and updates.

### Database Schema

```
slack_webhooks (public schema)
├── id (PK, SERIAL)
├── access_token (TEXT, encrypted)
├── access_token_iv (TEXT)
├── scope (TEXT NOT NULL)
├── user_id (FK → users)
├── team_name (TEXT NOT NULL)
├── team_id (TEXT NOT NULL)
├── channel (TEXT NOT NULL)
├── channel_id (TEXT NOT NULL)
├── configuration_url (TEXT NOT NULL)
├── url (TEXT, encrypted)
├── url_iv (TEXT)
├── is_active (BOOLEAN, default: true)
├── routing_type (ARRAY)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### API Endpoints

Slack is the `slack` extension. The client uses the gated extension routes:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/extensions/slack/oauth/workspaces` | List webhooks |
| GET | `/api/extensions/slack/oauth/workspaces/:id` | Get webhook |
| POST | `/api/extensions/slack/oauth/workspaces` | Connect workspace (OAuth code exchange) |
| PATCH | `/api/extensions/slack/oauth/workspaces/:id` | Update webhook (routing, active) |
| DELETE | `/api/extensions/slack/oauth/workspaces/:id` | Delete webhook |
| POST | `/api/extensions/slack/oauth/workspaces/:id/send` | Send message |

The legacy `/api/slackWebhooks` mount serves the same handlers but is **not** gated by the extension. Notification delivery (`services/slack/`) reads `slack_webhooks` directly and does not check whether the extension is enabled.

### OAuth Flow

1. User initiates Slack OAuth from frontend
2. Slack redirects with authorization code
3. Backend exchanges code for access token
4. Token and webhook URL encrypted and stored
5. Bot invited to selected channel

### Message Format

```json
{
  "text": "Notification from VerifyWise",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "Title" } },
    { "type": "section", "text": { "type": "mrkdwn", "text": "Message body" } },
    { "type": "context", "elements": [{ "type": "mrkdwn", "text": "📅 Timestamp" }] }
  ]
}
```

### Routing Types

Notifications can be routed to different channels based on event type (configured per webhook).

### Rate Limiting

- Workspace connection (`POST /api/extensions/slack/oauth/workspaces`): 10 requests per hour

---

## LLM Provider Integration

### Purpose

Manages API keys for LLM providers used by the AI Advisor system.

### Database Schema

```
llm_keys
├── id (PK, SERIAL)
├── key (TEXT NOT NULL, UNIQUE)
├── name (ENUM: Anthropic/OpenAI/OpenRouter)
├── url (TEXT)
├── model (TEXT NOT NULL)
└── created_at (TIMESTAMP)
```

### Supported Providers

| Provider | API URL |
|----------|---------|
| Anthropic | `https://api.anthropic.com/v1` |
| OpenAI | `https://api.openai.com/v1/` |
| OpenRouter | `https://openrouter.ai/api/v1/` |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/llm-keys/` | List all keys (masked) |
| GET | `/llm-keys/:name` | Get by provider |
| POST | `/llm-keys/` | Create key |
| PATCH | `/llm-keys/:id` | Update key |
| DELETE | `/llm-keys/:id` | Delete key |

### Key Masking

Keys returned to frontend are masked:
```
Original: sk-ant-api03-abc123...xyz789
Masked:   ****...789
```

### Create Key Request

```json
{
  "name": "Anthropic",
  "key": "sk-ant-api03-...",
  "model": "claude-3-opus-20240229"
}
```

---

## Security Patterns

### Encryption at Rest

All sensitive credentials use AES-256-CBC encryption:

```typescript
// Encryption
const { iv, value } = encrypt(plaintext);

// Decryption
const { data, success } = decrypt({ iv, value });
```

Extension secret config fields (MLflow, Azure AI Foundry) are the exception. They use `encrypt` / `decrypt` from `utils/encryption.utils.ts` (AES-256-GCM, key from `ENCRYPTION_KEY`). See [Extensions](./extensions.md#secrets-and-validation).

### Secret Handling

| Integration | Storage | Frontend Access |
|-------------|---------|-----------------|
| MLflow | Encrypted secret fields in `extension_enablements.configuration` | Non-secret fields only |
| GitHub | Encrypted token | Status only |
| Slack | Encrypted token + URL | Status only |
| LLM Keys | Plain (unique constraint) | Masked (last 4 chars) |

### Access Control

| Integration | Required Role |
|-------------|---------------|
| MLflow | Admin to configure; any user of an org with the extension enabled to read/sync |
| GitHub | Admin |
| Slack | Authenticated, extension enabled (user-scoped) |
| LLM Keys | Authenticated |

---

## Environment Variables

```bash
# Slack OAuth
SLACK_API_URL=https://slack.com/api/oauth.v2.access
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
FRONTEND_URL=https://app.verifywise.ai

# Encryption
ENCRYPTION_KEY=32-byte-key-for-aes-256

```

---

## Key Files

### MLflow

| File | Purpose |
|------|---------|
| `extensions/mlflow/mlflow.route.ts` | Routes (gated) |
| `extensions/mlflow/mlflow.ctrl.ts` | Controller |
| `extensions/mlflow/mlflow.service.ts` | Config, test connection, sync |

### GitHub

| File | Purpose |
|------|---------|
| `routes/githubIntegration.route.ts` | Routes |
| `controllers/githubToken.ctrl.ts` | Controller |
| `utils/githubToken.utils.ts` | Utilities |
| `domain.layer/models/githubToken/` | Model |

### Slack

| File | Purpose |
|------|---------|
| `extensions/slack/slack.route.ts` | Routes (gated) |
| `routes/slackWebhook.route.ts` | Legacy routes (ungated) |
| `controllers/slackWebhook.ctrl.ts` | Controller |
| `services/slack/slackNotificationService.ts` | Notification service |
| `domain.layer/models/slackNotification/` | Model |

### LLM Keys

| File | Purpose |
|------|---------|
| `routes/llmKey.route.ts` | Routes |
| `controllers/llmKey.ctrl.ts` | Controller |
| `utils/llmKey.utils.ts` | Utilities |
| `domain.layer/models/llmKey/` | Model |

---

## Related Documentation

- [Automations](./automations.md) - Uses Slack for notifications
- [Model Inventory](../domains/models.md) - Receives MLflow data
- [Extensions](./extensions.md) - Enablement and configuration for MLflow, Slack and the other extensions
- [AI Detection](../domains/ai-detection.md) - Uses GitHub integration
