# SlackWebhook Routes Documentation

## Table of Contents

- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Request/Response Examples](#requestresponse-examples)

## Overview

The Slack extension routes manage the organization's Slack connections. Connections belong to the organization, not to the Admin who connected them: every Admin of the organization sees and manages the same list. Two more routes let a user list and remove their own legacy connections that have no organization.

**Location:** `Servers/extensions/slack/slack.route.ts`

**Base Path:** `/api/extensions/slack`

**Router:** Express Router

`/api/slackWebhooks` (`Servers/routes/slackWebhook.route.ts`) is a deprecated legacy alias with the same six operations (`GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/send`), the same handlers and the same Admin-only, organization-scoped behaviour. It does not have the `/oauth/unlinked` routes. It is kept per ADR 0001 and slated for removal; the client uses the extension path.

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

The client sends this only after Slack returned to `/extensions/slack/settings` with a `state` that matches the one it stored before the redirect. The server exchanges the code with Slack using the redirect URI `${FRONTEND_URL}/extensions/slack/settings`.

**Controller:** `createNewSlackWebhook`

**Error Responses:**

- 400: `code` is missing, not a string, blank or longer than 512 characters ("A Slack authorization code is required"); checked before Slack is called.
- 400: Slack refused the code (used, expired or issued for another app). The message is fixed ("Slack did not accept the authorization code. Add Slack again."); Slack's own error is only logged.

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

---

### GET /oauth/unlinked

Lists the caller's own connections with no organization: legacy connections the organization backfill could not assign. They send nothing. The query filters by the caller's user id, not the organization, and runs through the `SECURITY DEFINER` function `verifywise.slack_unlinked_connections`, because the RLS policy hides rows with no organization.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Controller:** `getUnlinkedSlackConnections`

**Success Response:** 200 OK

```json
{
  "status": "success",
  "data": [
    {
      "id": 45,
      "team_name": "VerifyWise Team",
      "channel": "#notifications",
      "created_at": "2025-03-02T10:15:00.000Z"
    }
  ]
}
```

No token or webhook URL is returned.

---

### DELETE /oauth/unlinked/:id

Removes one of the caller's own connections with no organization, through `verifywise.delete_unlinked_slack_connection`. Another user's row, a connection that belongs to an organization and a missing id all answer 404. A bad id answers 400.

**Authentication:** JWT, Slack extension enabled, `extension.admin` (Admin)

**Path Parameters:**

- `id` (required): Connection ID

**Controller:** `deleteUnlinkedSlackConnection`

**Success Response:** 204 No Content
