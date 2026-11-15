# SlackWebhook Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Controller Functions](#controller-functions)
- [Error Handling](#error-handling)
- [Logging](#logging)
- [Dependencies](#dependencies)

## Overview

The SlackWebhook controller manages all HTTP request handling for Slack webhook operations, including OAuth flow, CRUD operations, and message sending functionality.

**Location:** `Servers/controllers/slackWebhook.ctrl.ts`

**Mounted at:** `/api/extensions/slack/oauth/workspaces` and `/api/extensions/slack/oauth/unlinked` (`Servers/extensions/slack/slack.route.ts`), plus the deprecated `/api/slackWebhooks` alias for the workspace handlers. Every route needs JWT, the Slack extension enabled for the caller's organization, and `extension.admin` (Admin).

**Organization scope:** Slack connections belong to the organization. Every handler takes the user and organization from the token (`req.userId`, `req.organizationId`) and ignores any `userId` in the body or query. Reads, updates, deletes and sends filter by `organization_id`, so another organization's id answers 404.

**Responsibilities:**

- Handle Slack OAuth 2.0 authorization flow
- Manage webhook CRUD operations with transactions
- Send test and notification messages to Slack
- Validate and sanitize all inputs
- Log all operations for audit trail
- Handle errors with appropriate status codes

## Controller Functions

### getAllSlackWebhooks

Retrieves the Slack connections of the caller's organization, optionally filtered by channel.

**HTTP Method:** GET
**Endpoint:** `/api/extensions/slack/oauth/workspaces`
**Authentication:** JWT, extension enabled, Admin

**Query Parameters:**

| Parameter | Type     | Required | Description                  |
| --------- | -------- | -------- | ---------------------------- |
| `channel` | `string` | No       | Optional channel name filter |

**Response:**

Success (200):

```json
{
  "status": "success",
  "data": [
    {
      "id": 123,
      "scope": "chat:write,channels:read",
      "user_id": 1,
      "team_name": "VerifyWise Team",
      "team_id": "T1234567890",
      "channel": "#notifications",
      "channel_id": "C1234567890",
      "created_at": "2025-09-16T10:30:00Z",
      "is_active": true,
      "routing_type": ["Membership and roles"],
      "delivery_scope": "organization"
    }
  ]
}
```

`user_id` is the Admin who connected the workspace. `delivery_scope` is `organization` or `user` (a connection from before organization ownership that posts only its owner's events until its routing is saved). The response does not include `organization_id`.

---

### getSlackWebhookById

Retrieves one connection of the caller's organization by its ID.

**HTTP Method:** GET
**Endpoint:** `/api/extensions/slack/oauth/workspaces/:id`
**Authentication:** JWT, extension enabled, Admin

**Path Parameters:**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `id`      | `number` | Yes      | Webhook ID  |

**Response:**

- Success (200): Slack Webhook Data
- Error (404): Not Found

**Exceptions:**

- `ValidationException` (400): Invalid ID format
- `NotFoundException` (404): Webhook not found
- Generic errors (500): Database or system errors

---

### createNewSlackWebhook

Creates a new Slack webhook after validating OAuth code with Slack API.

**HTTP Method:** POST
**Endpoint:** `/api/extensions/slack/oauth/workspaces`
**Authentication:** JWT, extension enabled, Admin

**Request Body:**

| Field  | Type     | Required | Description                         |
| ------ | -------- | -------- | ----------------------------------- |
| `code` | `string` | Yes      | OAuth authorization code from Slack |

**OAuth Flow:**

1. Client stores a random `state` in `sessionStorage` and redirects the same tab to Slack's authorize URL with that `state`, the bot scopes `incoming-webhook,chat:write,chat:write.public,channels:read,groups:read` and the user scopes `channels:read,groups:read,groups:write.invites`
2. User authorizes the app and selects a channel
3. Slack redirects back to `/extensions/slack/settings` with `code` and `state` (or `error` when the user cancels)
4. Client clears the query string, checks `state` against the stored value and, only on a match, sends the code to this endpoint
5. Server checks `code` (a non-empty string of at most 512 characters, else 400 before Slack is called) and exchanges it for an access token
6. Server creates the connection for the caller's organization (owner and organization from the token, `delivery_scope` defaults to `organization`) and invites the bot to the channel

Rate-limited by `slackWorkspaceCreateLimiter` (10 per hour).

**Response:**

- 201: Created
- 400: `code` missing, blank or over 512 characters ("A Slack authorization code is required")
- 400: Slack answered `bad_redirect_uri` or `redirect_uri_mismatch` ("Slack rejected the return address. FRONTEND_URL must match the address you open VerifyWise at.")
- 400: Slack returned no user token, because the user scopes were not granted ("Slack did not grant the permissions VerifyWise needs. Add Slack again and allow every permission."); nothing is saved and the bot invite is not attempted
- 400: Slack refused the code for any other reason ("Slack did not accept the authorization code. Add Slack again.")
- Slack's own error is logged, never returned
- 500: Server error (including `SLACK_API_URL` not set or Slack unreachable)

**Slack API Call:**

The function makes a POST request to:

```
https://slack.com/api/oauth.v2.access
```

With parameters:

- `client_id`: Slack app client ID
- `client_secret`: Slack app client secret
- `code`: Authorization code from client
- `redirect_uri`: `${FRONTEND_URL}/extensions/slack/settings`, with trailing slashes dropped from `FRONTEND_URL` (`slackRedirectUri`)

**Transaction Handling:**

- All database operations wrapped in transaction
- Automatic rollback on any error
- Commit only on complete success

**Post-creation Actions:**

1. Validate webhook data
2. Encrypt sensitive fields
3. Save to database
4. Invite bot to channel
5. Log event

**Exceptions:**

- `ValidationException` (400): Invalid webhook data
- `BusinessLogicException` (403): Business rule violation
- Generic errors (500): OAuth failure or database errors

---

### validateSlackOAuth

Internal function that exchanges OAuth code for access token.

**Signature:**

```typescript
async function validateSlackOAuth(code: string): Promise<any>;
```

**Parameters:**

- `code`: OAuth authorization code

**Returns:** Slack OAuth response containing:

- `access_token`: Bot access token
- `scope`: Granted scopes
- `team`: Workspace information
- `incoming_webhook`: Webhook details
- `authed_user`: User who authorized; its `access_token` (the user token) invites the bot into the channel
- `bot_user_id`: Bot user ID

**Throws:**

- `ValidationException` with a fixed message when Slack answers with anything but `ok: true`: a redirect URI message for `bad_redirect_uri` or `redirect_uri_mismatch`, the "did not accept the authorization code" message otherwise. Slack's error code is logged (filtered to letters, digits and underscores, at most 64 characters) and never sent to the client.
- `ValidationException` with the "did not grant the permissions" message when the answer has no `authed_user.access_token`
- A generic `Error` when `SLACK_API_URL` is not set, the request fails or the body is not JSON

**Environment Variables Required:**

- `SLACK_API_URL`: Slack OAuth token URL
- `SLACK_CLIENT_ID`: App client ID
- `SLACK_CLIENT_SECRET`: App client secret
- `FRONTEND_URL`: Base URL for redirect URI

---

### updateSlackWebhookById

Updates a connection's routing or active status. Saving `routing_type` also sets `delivery_scope = 'organization'`, so a connection that predates organization ownership starts posting the organization's events. Changing only `is_active` leaves the scope as it is.

**HTTP Method:** PATCH
**Endpoint:** `/api/extensions/slack/oauth/workspaces/:id`
**Authentication:** JWT, extension enabled, Admin

**Path Parameters:**

| Parameter | Type     | Required | Description          |
| --------- | -------- | -------- | -------------------- |
| `id`      | `number` | Yes      | Webhook ID to update |

**Request Body:**

| Field          | Type       | Required | Description                                                                |
| -------------- | ---------- | -------- | -------------------------------------------------------------------------- |
| `is_active`    | `boolean`  | No       | Active status                                                              |
| `routing_type` | `string[]` | No       | Array of known notification routing types (`SlackNotificationRoutingType`) |

Any other field, a non-boolean `is_active` or an unknown routing type answers 400.

**Example Request:**

```json
{
  "is_active": true,
  "routing_type": ["Membership and roles", "Evidence and task alerts"]
}
```

**Response:**

- 202: Accepted
- 400: Invalid ID or body
- 404: Connection not found in the caller's organization
- 500: Server error

**Transaction Handling:**

- Validates webhook exists before update
- Updates and validates data
- Commits or rolls back transaction

**Exceptions:**

- `ValidationException` (400): Invalid update data
- `BusinessLogicException` (403): Business rule violation
- `NotFoundException` (404): Webhook not found
- Generic errors (500): Database errors

---

### sendSlackMessage

Sends a test message to a Slack channel via webhook.

**HTTP Method:** POST
**Endpoint:** `/api/extensions/slack/oauth/workspaces/:id/send`
**Authentication:** JWT, extension enabled, Admin

**Path Parameters:**

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `id`      | `number` | Yes      | Webhook ID  |

**Request Body:**

| Field     | Type     | Required | Description   |
| --------- | -------- | -------- | ------------- |
| `title`   | `string` | Yes      | Message title |
| `message` | `string` | Yes      | Message body  |

**Example Request:**

```json
{
  "title": "Test Notification",
  "message": "This is a test message from VerifyWise"
}
```

**Response:**

Success (200): Slack Notification Sent

Error (500):

```json
{
  "message": "channel_not_found"
}
```

**Message Format:**

The message is sent using Slack's Block Kit format:

- Header block with title
- Section block with message text (supports markdown)
- Context block with timestamp in UTC

**Validation:**

- Connection must exist in the caller's organization (404 otherwise)
- Connection must be active (`is_active: true`); an inactive one answers 400

**Error Handling:**

- `is_archived`: Channel has been archived
- `channel_not_found`: Channel deleted or inaccessible
- Both errors deactivate the connection (`deactivateSlackWebhookQuery` in `sendImmediateMessage`, by id and organization)

**Exceptions:**

- `ValidationException` (400): Invalid webhook ID
- `NotFoundException` (404): Webhook not found
- Generic errors (500): Slack API errors

---

### deleteSlackWebhookById

Deletes a connection of the caller's organization.

**HTTP Method:** DELETE
**Endpoint:** `/api/extensions/slack/oauth/workspaces/:id`
**Authentication:** JWT, extension enabled, Admin

**Response:**

- 204: Deleted
- 400: Invalid ID
- 404: Connection not found in the caller's organization
- 500: Server error

### getUnlinkedSlackConnections

Lists the caller's own connections with no organization (legacy rows the organization backfill could not assign). They send nothing. Filtered by `req.userId`, not the organization, through `getUnlinkedSlackConnectionsQuery`, which reads the `SECURITY DEFINER` function `verifywise.slack_unlinked_connections` because the RLS policy hides rows with no organization.

**HTTP Method:** GET
**Endpoint:** `/api/extensions/slack/oauth/unlinked`
**Authentication:** JWT, extension enabled, Admin

**Response:**

- 200: Array of `{ id, team_name, channel, created_at }` (no token or URL)
- 500: Server error

---

### deleteUnlinkedSlackConnection

Removes one of the caller's own connections with no organization, through `deleteUnlinkedSlackConnectionQuery` (`verifywise.delete_unlinked_slack_connection`). Logs a `Delete` event; that audit write is best effort, so a failing write is logged and the answer stays 204.

**HTTP Method:** DELETE
**Endpoint:** `/api/extensions/slack/oauth/unlinked/:id`
**Authentication:** JWT, extension enabled, Admin

**Response:**

- 204: Deleted
- 400: Invalid ID
- 404: No such unlinked connection of the caller (missing, another user's, or linked to an organization)
- 500: Server error

## Error Handling

### Exception Types

1. **ValidationException (400)**
   - Invalid input data
   - Missing required fields
   - Invalid ID format

2. **BusinessLogicException (403)**
   - Business rule violations
   - Authorization failures

3. **NotFoundException (404)**
   - Webhook not found
   - Resource doesn't exist

4. **Generic Errors (500)**
   - Database errors
   - External API failures
   - Unexpected exceptions

## Dependencies

### Internal Dependencies

- `domain.layer/models/slackNotification/slackWebhook.model`: Data model
- `domain.layer/exceptions/custom.exception`: Custom exception classes
- `services/slack/slackNotificationService`: Message sending logic
- `utils/slackWebhook.utils`: Database query utilities
- `utils/statusCode.utils`: HTTP status code helpers
- `utils/logger/fileLogger`: File-based logging
- `utils/logger/dbLogger`: Database event logging
- `database/db`: Sequelize instance for transactions

### Environment Variables

Required configuration:

- `SLACK_API_URL`: Slack OAuth API endpoint
- `SLACK_CLIENT_ID`: Slack app client ID
- `SLACK_CLIENT_SECRET`: Slack app client secret
- `FRONTEND_URL`: Frontend base URL for OAuth redirect

## Related Files

- **Routes:** `Servers/extensions/slack/slack.route.ts`
- **Model:** `Servers/domain.layer/models/slackNotification/slackWebhook.model.ts`
- **Service:** `Servers/services/slack/slackNotificationService.ts`
- **Utils:** `Servers/utils/slackWebhook.utils.ts`
- **Interface:** `Servers/domain.layer/interfaces/i.slackWebhook.ts`
