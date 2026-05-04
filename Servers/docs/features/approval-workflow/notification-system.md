# Real-time Notification System

## Overview

The notification system delivers real-time approval workflow updates using Server-Sent Events (SSE) and Redis Pub/Sub. It ensures instant delivery across multiple server instances while maintaining security and multi-tenant isolation.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Backend Server (Publisher)                   │
│                                                                 │
│  1. User approves request                                      │
│     ↓                                                           │
│  2. Transaction commits                                         │
│     ↓                                                           │
│  3. notifyStepApprovers()                                      │
│     ↓                                                           │
│  4. sendNotification()                                         │
│     ↓                                                           │
│  5. redisClient.publish("approval-notifications", {...})       │
│                                                                 │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │         Redis Server                │
        │   Channel: "approval-notifications" │
        │                                     │
        │   Message Format:                   │
        │   {                                 │
        │     tenantId: "a4ayc80OGd",        │
        │     userId: 2,                      │
        │     notification: {                 │
        │       title: "New Approval Request",│
        │       message: "...",               │
        │       type: "approval_request",     │
        │       entityId: 14                  │
        │     }                               │
        │   }                                 │
        └────────────┬────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│  Server 1        │    │  Server 2        │
│  (Subscriber)    │    │  (Subscriber)    │
│                  │    │                  │
│  Redis           │    │  Redis           │
│  Subscriber      │    │  Subscriber      │
│  listening       │    │  listening       │
│     ↓            │    │     ↓            │
│  Find SSE        │    │  Find SSE        │
│  connection      │    │  connection      │
│  for user        │    │  for user        │
│     ↓            │    │     ↓            │
│  connections     │    │  connections     │
│  .get(           │    │  .get(           │
│   "tenantId:     │    │   "tenantId:     │
│    userId")      │    │    userId")      │
│     ↓            │    │     ↓            │
│  Found? ✓        │    │  Not found ✗     │
│     ↓            │    │                  │
│  response.write( │    │                  │
│   `data: {...}`) │    │                  │
└────────┬─────────┘    └──────────────────┘
         │
         ▼
┌────────────────────┐
│  User 2 Browser    │
│                    │
│  SSE Stream        │
│  Reader            │
│     ↓              │
│  Parse message     │
│     ↓              │
│  displayNotification()│
│     ↓              │
│  showAlert()       │
│     ↓              │
│  fetchApprovalCounts()│
│                    │
└────────────────────┘
```

---

## Components

### 1. SSE Endpoint (Backend)

**Location**: `controllers/notification.ctrl.ts`

#### Connection Setup

```typescript
export const streamNotifications = async (req: Request, res: Response): Promise<void> => {
  const { userId, tenantId } = req;

  // Validate authentication
  if (!userId || !tenantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Setup SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  const connectionKey = `${tenantId}:${userId}`;

  // Store connection
  connections.set(connectionKey, {
    response: res,
    tenantId: tenantId,
    userId: userId,
    connectedAt: new Date(),
  });

  console.log(`SSE connection established: ${connectionKey}`);

  // Send initial connection success message
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
    }
  }, 30000); // Every 30 seconds

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    connections.delete(connectionKey);
    console.log(`SSE connection closed: ${connectionKey}`);
  });
};
```

**Key Points**:

- Connection keyed by `${tenantId}:${userId}` for security
- Heartbeat prevents timeout and detects disconnections
- Auto-cleanup on connection close

---

### 2. Connection Storage

**Location**: `controllers/notification.ctrl.ts`

```typescript
interface ConnectionData {
  response: Response;
  tenantId: string;
  userId: number;
  connectedAt: Date;
}

const connections = new Map<string, ConnectionData>();

export const getConnection = (key: string): ConnectionData | undefined => {
  return connections.get(key);
};

export const getActiveConnections = (): number => {
  return connections.size;
};
```

**Stale Connection Cleanup**:

```typescript
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 3600000; // 1 hour

  for (const [key, data] of connections.entries()) {
    if (now - data.connectedAt.getTime() > staleThreshold) {
      console.warn(`Cleaning up stale connection: ${key}`);
      connections.delete(key);
    }
  }
}, 60000); // Check every minute
```

---

### 3. Notification Service (Publisher)

**Location**: `services/notification.service.ts`

#### Send Notification

```typescript
export const sendNotification = async (
  tenantId: string,
  userId: number,
  notification: Notification,
): Promise<void> => {
  try {
    console.log(`📤 Publishing notification to Redis:`, {
      tenantId,
      userId,
      type: notification.type,
      title: notification.title,
    });

    // Publish to Redis - all server instances will receive
    const result = await redisClient.publish(
      "approval-notifications",
      JSON.stringify({
        tenantId,
        userId,
        notification,
        timestamp: new Date().toISOString(),
      }),
    );

    console.log(`✅ Notification published (${result} subscribers received)`);
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    throw error;
  }
};
```

#### Notify Step Approvers

```typescript
export const notifyStepApprovers = async (
  tenantId: string,
  requestId: number,
  stepNumber: number,
  requestName: string,
): Promise<void> => {
  try {
    // Get approvers for this step
    const approverIds = await getApproversForStep(tenantId, requestId, stepNumber);

    console.log(
      `Notifying ${approverIds.length} approvers for Step ${stepNumber} of request: ${requestName}`,
    );

    // Send notification to each approver
    const notificationPromises = approverIds.map((approverId) =>
      sendNotification(tenantId, approverId, {
        title: "New Approval Request",
        message: `${requestName} - You are an approver for Step ${stepNumber}`,
        type: "approval_request",
        entityId: requestId,
        entityType: "use_case",
      }),
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error("Error notifying step approvers:", error);
    throw error;
  }
};
```

#### Get Approvers Query

```typescript
const getApproversForStep = async (
  tenantId: string,
  requestId: number,
  stepNumber: number,
): Promise<number[]> => {
  console.log(
    `🔍 Fetching approvers for step ${stepNumber}, request ${requestId}, tenant ${tenantId}`,
  );

  const approvers = (await sequelize.query(
    `SELECT DISTINCT asa.approver_id
     FROM "${tenantId}".approval_step_approvers asa
     INNER JOIN "${tenantId}".approval_workflow_steps aws
       ON asa.workflow_step_id = aws.id
     INNER JOIN "${tenantId}".approval_requests ar
       ON aws.workflow_id = ar.workflow_id
     WHERE ar.id = :requestId
       AND aws.step_number = :stepNumber`,
    {
      replacements: { requestId, stepNumber },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ approver_id: number }>;

  console.log(
    `✅ Found ${approvers.length} approvers:`,
    approvers.map((a) => a.approver_id),
  );
  return approvers.map((a) => a.approver_id);
};
```

---

### 4. Redis Subscriber

**Location**: `services/notificationSubscriber.service.ts`

#### Setup Subscriber

```typescript
export const setupNotificationSubscriber = async (): Promise<void> => {
  try {
    // Create a duplicate Redis client for subscribing
    const subscriber = redisClient.duplicate();

    console.log("📡 Connecting notification subscriber to Redis...");

    // Wait for ready
    subscriber.on("ready", () => {
      console.log("✅ Notification subscriber connected to Redis");
    });

    // Handle errors
    subscriber.on("error", (error) => {
      console.error("❌ Redis subscriber error:", error);
    });

    // Subscribe to the channel
    await subscriber.subscribe("approval-notifications");

    // Listen for messages
    subscriber.on("message", (channel: string, message: string) => {
      if (channel !== "approval-notifications") {
        return;
      }

      console.log("📥 Received message from Redis channel");

      try {
        const payload = JSON.parse(message);
        const { tenantId, userId, notification } = payload;

        console.log(
          `📨 Processing notification for tenant=${tenantId}, user=${userId}, type=${notification?.type}`,
        );

        // SECURITY: Validate message format
        if (!tenantId || !userId || !notification) {
          console.error("Security: Invalid notification message format", payload);
          return;
        }

        const connectionKey = `${tenantId}:${userId}`;
        const connectionData = getConnection(connectionKey);

        if (connectionData) {
          console.log(`✅ Found active connection for ${connectionKey}`);

          // SECURITY: Double-check tenant matches
          if (connectionData.tenantId !== tenantId) {
            console.error(
              `Security: Tenant mismatch! Stored: ${connectionData.tenantId}, Message: ${tenantId}`,
            );
            return;
          }

          // SECURITY: Verify userId matches
          if (connectionData.userId !== userId) {
            console.error(
              `Security: User mismatch! Stored: ${connectionData.userId}, Message: ${userId}`,
            );
            return;
          }

          // Safe to send notification
          try {
            connectionData.response.write(`data: ${JSON.stringify(notification)}\n\n`);
            console.log(`📬 Notification delivered to ${connectionKey}: ${notification.type}`);
          } catch (error) {
            console.error(`Error sending notification to ${connectionKey}:`, error);
          }
        } else {
          console.log(`⚠️ No active connection for ${connectionKey} - user may not be online`);
        }
      } catch (error) {
        console.error("Error processing notification message:", error);
      }
    });

    console.log("📬 Notification subscriber subscribed to approval-notifications channel");
  } catch (error) {
    console.error("❌ Failed to setup notification subscriber:", error);
    throw error;
  }
};
```

**Called in**: `index.ts` on server startup

```typescript
// Setup Redis subscriber for notifications
await setupNotificationSubscriber();
```

---

### 5. Frontend SSE Client

**Location**: `Clients/src/application/hooks/useNotifications.ts`

#### Connect to SSE

```typescript
const connect = useCallback(async () => {
  if (!enabled || !authToken) {
    console.log("⏸️ Notifications not enabled or no auth token");
    return;
  }

  try {
    const url = `${ENV_VARs.URL}/api/notifications/stream`;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    console.log("🔌 Connecting to SSE endpoint with Authorization header...");

    // Use fetch() instead of EventSource to send Authorization header
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "text/event-stream",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    isConnectedRef.current = true;
    console.log("✅ SSE connection established");

    // Read the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Process the stream
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log("📡 SSE stream ended");
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete messages (separated by \n\n)
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || ""; // Keep incomplete in buffer

      for (const message of messages) {
        if (!message.trim()) continue;

        // Parse SSE message format
        const lines = message.split("\n");
        let data = "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            data = line.substring(6); // Remove "data: " prefix
          } else if (line.startsWith(":")) {
            continue; // Ignore comments (heartbeat)
          }
        }

        if (data) {
          try {
            const notification: Notification = JSON.parse(data);
            console.log("📬 Received notification:", notification);
            displayNotification(notification);
          } catch (error) {
            console.error("❌ Error parsing notification:", error);
          }
        }
      }
    }

    // Stream ended, reconnect if not manually disconnected
    isConnectedRef.current = false;
    if (autoReconnect && !isManuallyDisconnectedRef.current) {
      console.log(`🔄 Reconnecting in ${reconnectDelay}ms...`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectDelay);
    }
  } catch (error: any) {
    isConnectedRef.current = false;

    if (error.name === "AbortError") {
      console.log("🔌 SSE connection aborted");
      return;
    }

    console.error("❌ SSE connection error:", error);

    if (autoReconnect && !isManuallyDisconnectedRef.current) {
      console.log(`🔄 Reconnecting in ${reconnectDelay}ms...`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectDelay);
    }
  }
}, [enabled, authToken, autoReconnect, reconnectDelay, displayNotification]);
```

#### Display Notification

```typescript
const displayNotification = useCallback(
  (notification: Notification) => {
    // Skip "connected" type
    if (notification.type === "connected") {
      console.log("📡 SSE connection established");
      return;
    }

    // Call onNotification callback if provided
    if (onNotification) {
      onNotification(notification);
    }

    // Map notification types to alert variants
    const alertVariants: Record<string, "success" | "info" | "warning" | "error"> = {
      approval_request: "info",
      approval_approved: "success",
      approval_rejected: "error",
      approval_complete: "success",
    };

    const variant = alertVariants[notification.type] || "info";

    // Show alert
    showAlert({
      variant,
      title: notification.title,
      body: notification.message || "You have a new notification",
    });
  },
  [onNotification],
);
```

#### Auto-connect on Mount

```typescript
useEffect(() => {
  connect();

  return () => {
    disconnect();
  };
}, [connect, disconnect]);
```

---

## Notification Types

### 1. approval_request

Sent when a new approval request reaches a step.

**Trigger**: Use-case created OR previous step approved
**Recipients**: Step approvers
**Alert**: Blue (info)

```typescript
{
  title: "New Approval Request",
  message: "Use Case: Q1 Campaign - You are an approver for Step 1",
  type: "approval_request",
  entityId: 14,
  entityType: "use_case"
}
```

### 2. approval_complete

Sent when all approvals are complete.

**Trigger**: Final step approved
**Recipients**: Requester (who created the use-case)
**Alert**: Green (success)

```typescript
{
  title: "Request Approved",
  message: "Your request \"Use Case: Q1 Campaign\" has been approved",
  type: "approval_complete",
  entityId: 14
}
```

### 3. approval_rejected

Sent when a request is rejected.

**Trigger**: Any approver rejects
**Recipients**: Requester
**Alert**: Red (error)

```typescript
{
  title: "Request Rejected",
  message: "Your request \"Use Case: Q1 Campaign\" has been rejected",
  type: "approval_rejected",
  entityId: 14
}
```

### 4. connected (internal)

Sent on connection establishment (not shown to user).

```typescript
{
  type: "connected";
}
```

---

## Security

### Multi-Tenant Isolation

**Connection Key**: `${tenantId}:${userId}`

- Each tenant's users are isolated
- Cannot receive notifications from other tenants

**Double Validation**:

```typescript
// When storing connection
connections.set(connectionKey, {
  tenantId: tenantId, // Store for validation
  userId: userId,
});

// Before sending notification
if (connectionData.tenantId !== tenantId) {
  console.error("Security: Tenant mismatch!");
  return;
}
if (connectionData.userId !== userId) {
  console.error("Security: User mismatch!");
  return;
}
```

### Authentication

**JWT Required**: SSE endpoint requires valid JWT token

- Middleware: `authenticateJWT`
- Token validated before establishing connection
- User ID and tenant ID extracted from token

**Heartbeat Validation**:

- Heartbeat keeps connection alive
- If connection dies, automatically removed from map
- User must re-authenticate to reconnect

---

## Performance

### Redis Pub/Sub

**Advantages**:

- Single publish reaches all subscribers (O(1))
- No polling required
- Minimal memory overhead

**Message Size**: ~200-500 bytes per notification
**Throughput**: Can handle thousands of notifications/second

### SSE Connections

**Memory**: ~10-20 KB per active connection
**CPU**: Minimal (event-driven)
**Network**: ~100 bytes every 30 seconds (heartbeat)

**Scaling**:

- 1000 concurrent users ≈ 10-20 MB memory
- Can scale to tens of thousands of concurrent connections per server

### Connection Cleanup

**Automatic**:

- When browser closes/refreshes
- After 1 hour of inactivity (stale cleanup)
- On server shutdown

---

## Debugging

### Enable Logs

All components log extensively:

```bash
# Notification publishing
📤 Publishing notification to Redis: { tenantId, userId, type, title }
✅ Notification published (1 subscribers received)

# Redis subscriber
📥 Received message from Redis channel
📨 Processing notification for tenant=..., user=..., type=...
✅ Found active connection for tenantId:userId
📬 Notification delivered to tenantId:userId: approval_request

# SSE connection
🔌 SSE connection attempt: { userId, tenantId }
SSE connection established: tenantId:userId
SSE connection closed: tenantId:userId

# Frontend
🔌 Connecting to SSE endpoint with Authorization header...
✅ SSE connection established
📬 Received notification: { title, message, type }
```

### Check Active Connections

```typescript
import { getActiveConnections } from "./controllers/notification.ctrl";

console.log(`Active SSE connections: ${getActiveConnections()}`);
```

### Test Notification

```typescript
import { sendNotification } from "./services/notification.service";

await sendNotification(
  "a4ayc80OGd", // tenantId
  2, // userId
  {
    title: "Test",
    message: "This is a test notification",
    type: "approval_request",
    entityId: 999,
  },
);
```

---

## Troubleshooting

### User Not Receiving Notifications

**Check**:

1. User is logged in and SSE connected
   - Browser console: Look for "✅ SSE connection established"
   - Network tab: Check `/api/notifications/stream` is open

2. User ID matches
   - Server log: `📨 Processing notification for user=X`
   - Browser: JWT token decoded user ID

3. Tenant ID matches
   - Server: `tenantId` in logs
   - Frontend: Check Redux `auth.tenantId`

4. Approver is assigned to step
   - Query: `SELECT * FROM approval_step_approvers WHERE approver_id = X`

### Notifications Delayed

**Check**:

1. Transaction committed before notification?
   - Ensure `notifyStepApprovers()` called AFTER `transaction.commit()`

2. Redis subscriber running?
   - Server startup log: "📬 Notification subscriber subscribed..."

3. Network latency?
   - Check Redis server location

### Connection Drops

**Check**:

1. Heartbeat working?
   - Should see `: heartbeat\n\n` every 30 seconds

2. Nginx buffering?
   - Header set: `X-Accel-Buffering: no`

3. Browser DevTools open?
   - Some browsers throttle when DevTools closed

---

## Future Enhancements

1. **Notification History**: Store sent notifications in database
2. **Email Fallback**: Send email if user not online for X minutes
3. **Push Notifications**: Browser push notifications for offline users
4. **Notification Preferences**: User settings for which notifications to receive
5. **Batch Notifications**: Group multiple notifications
6. **Read Receipts**: Track when user saw notification
7. **In-app Notification Center**: Persistent notification list
