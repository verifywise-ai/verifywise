# Middleware Reference

## Rate Limiting

File: `Servers/middleware/rateLimit.middleware.ts`

| Limiter | Window | Max Requests | Use Case |
|---------|--------|--------------|----------|
| `authLimiter` | 15 min | 5 | Login, registration, password reset |
| `generalApiLimiter` | 15 min | 100 | Standard API endpoints |
| `fileOperationsLimiter` | 15 min | 50 | File upload/download |
| `aiDetectionScanLimiter` | 60 min | 10 | AI code scanning |

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

Response on limit exceeded: 429 with `RateLimit-*` headers.

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

## Plugin Guard Middleware

File: `Servers/middleware/pluginGuard.middleware.ts`

```typescript
import { requirePlugin } from "../middleware/pluginGuard.middleware";

router.use(requirePlugin("dataset-bulk-upload"));
router.post("/upload", requirePlugin("my-plugin"), uploadHandler);
```

Returns 404 if plugin not installed, 401 if no tenant context.

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
