# Slack Services Documentation

## Table of Contents

- [Overview](#overview)
- [Notification Service](#notification-service)
- [Producer Service](#producer-service)
- [Worker Service](#worker-service)
- [Architecture](#architecture)

## Overview

The Slack services layer handles all interactions with the Slack API, including message sending, bot management, and scheduled notifications using a job queue system.

**Components:**

1. **slackNotificationService.ts** - Direct Slack API interactions
2. **slackProducer.ts** - Job queue producer for scheduled notifications
3. **slackWorker.ts** - Background worker for processing notification jobs

## Notification Service

**Location:** `Servers/services/slack/slackNotificationService.ts`

### Overview

Handles direct communication with Slack Web API for sending messages and managing bot permissions.

### Functions

#### inviteBotToChannel

Invites the VerifyWise bot to a Slack channel (required for private channels).

**Signature:**

```typescript
async function inviteBotToChannel(
  accessToken: string,
  channelId: string,
  botUserId: string,
): Promise<{ success: boolean }>;
```

**Parameters:**

- `accessToken`: User OAuth token (not bot token)
- `channelId`: Slack channel ID
- `botUserId`: Bot user ID to invite

**Behavior:**

1. Creates Slack Web API client with user token
2. Checks if channel is private
3. Invites bot to channel if private
4. Logs success or failure

**Returns:**

```typescript
{
  success: true;
}
```

**Throws:**

- Error if channel not found
- Error if user lacks permission
- Error if bot already in channel

**Usage:**
Called automatically during webhook creation to ensure bot has access.

---

#### getClient

Internal helper to create authenticated Slack Web API client.

**Signature:**

```typescript
function getClient(accessToken: string, iv: string): WebClient;
```

**Parameters:**

- `accessToken`: Encrypted access token
- `iv`: Initialization vector for decryption

**Behavior:**

1. Decrypts access token using IV
2. Creates WebClient with decrypted token
3. Throws if decryption fails

**Returns:** Authenticated Slack WebClient instance

**Security:**

- Token is decrypted from encrypted storage
- Decryption error prevents client creation

---

#### sendSlackNotification

Sends notifications to multiple Slack channels based on routing type.

**Signature:**

```typescript
async function sendSlackNotification(
  params: { userId: number; routingType: string },
  message: any,
): Promise<void>;
```

**Parameters:**

- `params.userId`: User ID owning the integrations
- `params.routingType`: Type of notification to route
- `message`: Message object with title and message fields

**Behavior:**

1. Queries database for integrations with matching routing type
2. Sends message to all matching channels in parallel
3. Logs any errors but doesn't throw

---

#### sendImmediateMessage

Sends a single message to a specific Slack channel.

**Signature:**

```typescript
async function sendImmediateMessage(
  integration: ISlackWebhook,
  message: any,
): Promise<{
  success: boolean;
  messageId?: string;
  channel?: string;
}>;
```

**Parameters:**

- `integration`: Slack webhook configuration
- `message`: Message object with title and message

**Behavior:**

1. Creates authenticated Slack client
2. Formats message using Block Kit
3. Sends message via `chat.postMessage`
4. Logs message ID and channel
5. Handles channel errors by deactivating webhook

**Returns:**

```typescript
{
  success: true,
  messageId: "1234567890.123456",
  channel: "C1234567890"
}
```

**Error Handling:**

- `channel_not_found`: Deactivates webhook
- `is_archived`: Deactivates webhook
- Other errors: Throws exception

---

#### formatSlackMessage

Formats a message object into Slack Block Kit format.

**Signature:**

```typescript
function formatSlackMessage(data: any): {
  text: string;
  blocks: Array<any>;
};
```

**Parameters:**

- `data.title`: Message title
- `data.message`: Message body (supports markdown)

**Returns:**
Slack message object with Block Kit formatting:

```typescript
{
  text: "A message from VerifyWise",
  blocks: [
    {
      type: "header",
      text: { type: "plain_text", text: "Title" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "Message body" }
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "📅 2025-10-09 12:30:45 UTC" }
      ]
    }
  ]
}
```

**Block Types:**

1. **Header Block**: Bold title
2. **Section Block**: Message with markdown support
3. **Context Block**: UTC timestamp

---

### Dependencies

**External:**

- `@slack/web-api`: Official Slack SDK
  - `WebClient`: API client

**Internal:**

- `tools/createSecureValue`: Encryption utilities
- `utils/logger/fileLogger`: Logging
- `utils/slackWebhook.utils`: Database queries
- `controllers/slackWebhook.ctrl`: Webhook deactivation

---

## Producer Service

**Location:** `Servers/services/slack/slackProducer.ts`

### Overview

Manages a BullMQ job queue for scheduling recurring Slack notifications.

### notificationQueue

Redis-backed job queue for Slack notifications.

**Configuration:**

```typescript
const notificationQueue = new Queue("slack-notifications", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
});
```

**Queue Name:** `slack-notifications`

---

### scheduleDailyNotification

Schedules recurring notification jobs.

**Signature:**

```typescript
async function scheduleDailyNotification(): Promise<void>;
```

**Behavior:**

Upserts the `slack-notification-policy` job scheduler. The upsert is idempotent by scheduler id, so every backend start (on every replica) can call it; the queue is never emptied, so a notification job another replica is running is left alone.

**Scheduled Jobs:**

#### Policy Due Soon Notification

**Job Name:** `slack-notification-policy`

**Schedule:** Every day at 9:00 AM UTC

- Cron: `0 9 * * *`

**Job Data:**

```typescript
{
  type: "policies";
}
```

**Configuration:**

- `upsertJobScheduler("slack-notification-policy", { pattern: "0 9 * * *" }, ...)`
- `removeOnComplete`: true
- `removeOnFail`: false

**Purpose:**
Sends daily reminders about policies approaching review dates.

**Example:**

```typescript
await scheduleDailyNotification();
// Schedules daily policy reminders at 9 AM UTC
```

**Usage:**
Called during application startup to initialize scheduled jobs.

---

### Dependencies

**Environment Variables:**

- `REDIS_HOST`: Redis server host (default: 127.0.0.1)
- `REDIS_PORT`: Redis server port (default: 6379)

---

## Worker Service

**Location:** `Servers/services/slack/slackWorker.ts`

### Overview

Background worker that processes notification jobs from the BullMQ queue.

### createNotificationWorker

Creates and configures a BullMQ worker to process notification jobs.

**Signature:**

```typescript
function createNotificationWorker(): Worker;
```

**Configuration:**

```typescript
const worker = new Worker(
  "slack-notifications",
  async (job: Job) => { ... },
  { connection: redisConnection }
);
```

**Queue Name:** `slack-notifications` (matches producer)

**Redis Connection:**

```typescript
const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
});
```

---

### Job Processing

**Job Handler:**

```typescript
async (job: Job) => {
  if (job.data.type === "policies") {
    const userId = await sendPolicyDueSoonNotification();
    return { success: true, sentAt: new Date().toISOString(), userId };
  } else {
    throw new Error(`Unknown job type: ${job.data.type}`);
  }
};
```

**Supported Job Types:**

1. **policies**: Sends policy due soon notifications

**Return Value:**

```typescript
{
  success: true,
  sentAt: "2025-10-09T09:00:00.000Z",
  userId: 1
}
```

---

### Event Handlers

#### completed

Triggered when a job completes successfully.

**Handler:**

```typescript
worker.on("completed", (job) => {
  const userId = job.returnvalue?.userId;
  logSuccess({
    eventType: "Update",
    description: "Completed Job Processing",
    functionName: "createNotificationWorker",
    fileName: "slackWorker.ts",
    userId,
  });
});
```

**Logged Information:**

- Event type: Update
- Description: Job completion
- User ID from job result

---

#### failed

Triggered when a job fails.

**Handler:**

```typescript
worker.on("failed", (job, err) => {
  logFailure({
    eventType: "Update",
    description: "Processed Jobs",
    functionName: "createNotificationWorker",
    fileName: "slackWorker.ts",
    error: err,
  });
});
```

**Logged Information:**

- Event type: Update
- Error details

---

### Dependencies

**External:**

- `bullmq`: Job queue library
  - `Worker`: Worker process
  - `Job`: Job type
- `ioredis`: Redis client

**Internal:**

- `services/slack/policyDueSoonNotification`: Notification logic
- `utils/logger/logHelper`: Logging utilities

**Environment Variables:**

- `REDIS_HOST`: Redis server host
- `REDIS_PORT`: Redis server port

---
