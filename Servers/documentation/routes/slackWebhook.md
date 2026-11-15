# SlackWebhook Routes Documentation

## Table of Contents

- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Request/Response Examples](#requestresponse-examples)

## Overview

The Slack extension routes manage the organization's Slack connections. Connections belong to the organization, not to the Admin who connected them: every Admin of the organization sees and manages the same list.

**Location:** `Servers/extensions/slack/slack.route.ts`

**Base Path:** `/api/extensions/slack/oauth/workspaces`

**Router:** Express Router

This is the only mount. The legacy `/api/slackWebhooks` router was removed.

## API Endpoints

### GET /oauth/workspaces

Retrieves the Slack connections of the caller's organization.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Query Parameters:**

- `channel` (optional): Filter by channel name

A `userId` query parameter is ignored.

**Controller:** `getAllSlackWebhooks`

**Success Response:** 200 OK

```json
{
  "status": "success",
  "data": [
    {
      "id": 123,
      "team_name": "VerifyWise Team",
      "channel": "#notifications",
      "is_active": true
    }
  ]
}
```

---

### GET /oauth/workspaces/:id

Retrieves one connection of the caller's organization. Another organization's id answers 404.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Path Parameters:**

- `id` (required): Webhook ID

**Controller:** `getSlackWebhookById`

**Success Response:** 200 OK

```json
{
  "status": "success",
  "data": {
    "id": 123,
    "team_name": "VerifyWise Team",
    "channel": "#notifications",
    "is_active": true
  }
}
```

---

### POST /oauth/workspaces

Creates a connection from the Slack OAuth `code`. The owner and organization come from the token. New connections are organization-wide. Rate-limited by `slackWorkspaceCreateLimiter` (10 per hour).

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Request Body:**

```json
{
  "code": "1234567890.abcdef"
}
```

**Controller:** `createNewSlackWebhook`

**Success Response:** 201 Created

```json
{
  "status": "success",
  "data": {
    "id": 123,
    "team_name": "VerifyWise Team",
    "channel": "#notifications",
    "is_active": true
  }
}
```

---

### PATCH /oauth/workspaces/:id

Updates a connection. The body may contain only `routing_type` (an array of known routing types) and/or `is_active` (boolean); anything else answers 400. Saving `routing_type` also makes the connection organization-wide. Another organization's id answers 404.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Path Parameters:**

- `id` (required): Webhook ID to update

**Request Body:**

```json
{
  "is_active": true,
  "routing_type": ["Membership and roles", "Evidence and task alerts"]
}
```

**Controller:** `updateSlackWebhookById`

**Success Response:** 202 Accepted

```json
{
  "status": "success",
  "data": {
    "id": 123,
    "is_active": true,
    "routing_type": ["Membership and roles", "Evidence and task alerts"]
  }
}
```

---

### POST /oauth/workspaces/:id/send

Sends a test message to this connection's channel. An inactive connection answers 400.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Path Parameters:**

- `id` (required): Webhook ID

**Request Body:**

```json
{
  "title": "Test Notification",
  "message": "This is a test message from VerifyWise"
}
```

**Controller:** `sendSlackMessage`

**Success Response:** 200 OK

```json
{
  "status": "success",
  "data": {
    "success": true,
    "messageId": "1234567890.123456",
    "channel": "C1234567890"
  }
}
```

---

### DELETE /oauth/workspaces/:id

Deletes a connection of the caller's organization. Another organization's id answers 404.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Controller:** `deleteSlackWebhookById`

**Success Response:** 204 No Content
