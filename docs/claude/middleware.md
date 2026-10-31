# Middleware Reference

## Rate Limiting

File: `Servers/middleware/rateLimit.middleware.ts`

Production limits. The ones written `relaxed ? … : …` in
`buildRateLimitConfigs` are raised only when `NODE_ENV` is an explicit dev/test
value; email, Slack, file, scan and risk-suggestion limits never are.

| Limiter | Window | Max Requests | Use Case |
|---------|--------|--------------|----------|
| `generalApiLimiter` | 1 min | 300 | Global per-IP ceiling, mounted ahead of all routes |
| `authLimiter` | 15 min | 5 | Register, password reset, change password |
| `loginLimiter` | 1 min | 5 | Login and login-microsoft |
| `tokenRefreshLimiter` | 15 min | 60 | Access-token refresh |
| `fileOperationsLimiter` | 15 min | 100 | File upload, download, delete |
| `aiDetectionScanLimiter` | 60 min | 10 | AI code scanning |
| `riskSuggestionsAiLimiter` | 60 min | 10, per user | LLM-backed risk suggestions |
| `mrmIngestionLimiter` | 15 min | 5000, per token | MRM metric ingestion pushes |
| `webhookLimiter` | 1 min | 100 | Inbound signed webhooks |
| `virtualKeyProxyLimiter` | 1 min | 3000 | `/v1` virtual key proxy, mounted ahead of `generalApiLimiter` (the gateway enforces per-key RPM and budget) |
| `passwordResetEmailLimiter`, `inviteEmailLimiter`, `invitationResendLimiter` | 1 min | 5 each | Outbound email |
| `slackWebhookCreateLimiter`, `slackWorkspaceCreateLimiter` | 60 min | 10 each | Slack setup |
| `healthCheckLimiter` | 1 min | 1000 | Health probe |

Build new limiters with `createRateLimiter(RATE_LIMIT_CONFIGS.<name>)`, never
inline `rateLimit()` in a route file (see `tests/integration/rate-limiting/`).

```typescript
import {
  authLimiter,
  generalApiLimiter,
  fileOperationsLimiter,
  aiDetectionScanLimiter,
} from "../middleware/rateLimit.middleware";

router.post("/login", authLimiter, loginController);
router.post("/upload", fileOperationsLimiter, uploadController);
router.post("/scans", aiDetectionScanLimiter, startScanController);
```

Response on limit exceeded: 429 with `RateLimit-*` headers and the body
`{ message: "Too Many Requests", data: <limiter message> }`. The one exception
is `virtualKeyProxyLimiter`, which answers `{ detail: <limiter message> }`
(`gatewayErrorBody`) so `/v1` clients get the AI Gateway's error shape for
every error.

---

## Access Control (RBAC)

File: `Servers/middleware/accessControl.middleware.ts`

| Role | ID | Permissions |
|------|-----|-------------|
| Admin | 1 | Full system access |
| Reviewer | 2 | Read + approve/reject |
| Editor | 3 | Read + write |
| Auditor | 4 | Read only |

```typescript
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

router.delete("/users/:id", authenticateJWT, authorize(["Admin"]), deleteUser);
router.patch("/data/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateData);
```

Common role groups:
```typescript
const ALL_ROLES = ["Admin", "Editor", "Reviewer", "Auditor"];
const WRITE_ROLES = ["Admin", "Editor"];
const ADMIN_ONLY = ["Admin"];
const REVIEW_ROLES = ["Admin", "Reviewer"];
```

---

## Redis Configuration

File: `Servers/database/redis.ts`

```typescript
import IORedis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";

const redisClient = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export default redisClient;
```

### Pub/Sub for Notifications

```typescript
import redisClient from "../database/redis";

// Publish
await redisClient.publish("in-app-notifications", JSON.stringify({
  tenantId, userId, notification,
}));

// Subscribe
const subscriber = redisClient.duplicate();
await subscriber.subscribe("in-app-notifications");
subscriber.on("message", (channel, message) => {
  const data = JSON.parse(message);
});
```

### BullMQ Queues

```typescript
import { Queue, Worker } from "bullmq";
import { REDIS_URL } from "../database/redis";

const myQueue = new Queue("my-queue", { connection: { url: REDIS_URL } });
const worker = new Worker("my-queue", async (job) => {
  // Process job
}, { connection: { url: REDIS_URL } });
```

---

## JWT Auth Middleware (Detail)

File: `Servers/middleware/auth.middleware.ts`

Security layers:
1. Token presence - Bearer token extraction
2. JWT verification - Signature validation
3. Expiration check - Token not expired
4. Payload validation - Required fields present
5. Organization membership - User belongs to claimed org
6. Role consistency - Role hasn't changed since token issued
7. Tenant hash validation - Defense against SQL injection

Request properties set after middleware:
```typescript
req.userId         // number - User ID
req.role           // string - "Admin" | "Reviewer" | "Editor" | "Auditor"
req.tenantId       // string - Tenant hash (e.g., "a1b2c3d4e5")
req.organizationId // number - Organization ID
```

Error responses: 400 (no token), 401 (verification failed), 403 (wrong org/role), 406 (expired), 500 (server error).

---

## Extension Gate Middleware

File: `Servers/middleware/requireExtensionEnabled.middleware.ts`

```typescript
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";

router.use(authenticateJWT);
router.use(requireExtensionEnabled("dataset-bulk-upload"));
```

Checks `extension_enablements` for the caller's organization. Responses: 401 if there is no `req.organizationId`, 404 "Extension '`<key>`' not found in catalog" for an unknown key, and 403 "Extension '`<key>`' is not enabled for this organization" when the extension is not enabled. Every router under `Servers/extensions/<key>/` uses it. See `docs/technical/infrastructure/extensions.md`.

---

## Request Context (AsyncLocalStorage)

File: `Servers/utils/context/context.ts`

```typescript
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  userId: number;
  tenantId: string;
  organizationId: number;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
```

Initialized in auth middleware, accessed anywhere:
```typescript
const context = asyncLocalStorage.getStore();
// context.userId, context.tenantId, context.organizationId
```

Use cases: automatic tenant context in logging, request tracing, audit trails.
