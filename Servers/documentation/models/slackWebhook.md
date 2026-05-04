# SlackWebhook Model Documentation

## Table of Contents

- [Overview](#overview)
- [Model Definition](#model-definition)
- [Database Schema](#database-schema)
- [Properties](#properties)
- [Security Features](#security-features)

## Overview

The SlackWebhook model represents a Slack workspace integration in the VerifyWise system. It stores encrypted credentials, channel information, and notification routing configuration for sending messages to Slack channels.

**Location:** `Servers/domain.layer/models/slackNotification/slackWebhook.model.ts`

## Model Definition

```typescript
@Table({
  tableName: "slack_webhooks",
  timestamps: true,
  underscored: true,
})
export class SlackWebhookModel extends Model<SlackWebhookModel> implements ISlackWebhook
```

## Database Schema

**Table Name:** `slack_webhooks`

**Indexes:**

- `team_id` - For querying by Slack workspace
- `channel_id` - For querying by channel
- `is_active` - For filtering active integrations

**Foreign Keys:**

- `user_id` → `users.id` (SET NULL on delete, CASCADE on update)

## Properties

| Property            | Type                             | Description                                          | Encrypted | Required |
| ------------------- | -------------------------------- | ---------------------------------------------------- | --------- | -------- |
| `id`                | `number`                         | Primary key, auto-incrementing                       | No        | Auto     |
| `access_token`      | `string`                         | Slack OAuth access token                             | Yes       | Yes      |
| `access_token_iv`   | `string`                         | Initialization vector for token encryption           | No        | Auto     |
| `scope`             | `string`                         | OAuth scopes granted to the app                      | No        | Yes      |
| `user_id`           | `number`                         | Foreign key to users table                           | No        | Optional |
| `team_name`         | `string`                         | Slack workspace name                                 | No        | Yes      |
| `team_id`           | `string`                         | Slack workspace ID                                   | No        | Yes      |
| `channel`           | `string`                         | Slack channel name (e.g., "#general")                | No        | Yes      |
| `channel_id`        | `string`                         | Slack channel ID                                     | No        | Yes      |
| `configuration_url` | `string`                         | URL to manage webhook in Slack                       | No        | Yes      |
| `url`               | `string`                         | Webhook URL                                          | Yes       | Yes      |
| `url_iv`            | `string`                         | Initialization vector for URL encryption             | No        | Auto     |
| `created_at`        | `Date`                           | Timestamp of creation                                | No        | Auto     |
| `updated_at`        | `Date`                           | Timestamp of last update                             | No        | Auto     |
| `is_active`         | `boolean`                        | Whether integration is active                        | No        | Yes      |
| `routing_type`      | `SlackNotificationRoutingType[]` | Array of notification types to route to this channel | No        | Optional |

## Security Features

### Encryption

Two sensitive fields are encrypted at rest:

1. **access_token**
   - Encrypted using AES-256-GCM
   - Initialization vector stored in `access_token_iv`
   - Required for sending messages via Slack API

2. **url**
   - Webhook URL encrypted using AES-256-GCM
   - Initialization vector stored in `url_iv`
   - Prevents unauthorized access to webhook endpoint

**Encryption Implementation:**

```typescript
const { iv: accessTokeniv, value: accessToken } = encryptText(access_token.trim());
const { iv: ivUrl, value: encryptedUrl } = encryptText(url.trim());
```

## Notification Routing Types

The `routing_type` field is an array of enum values:

```typescript
enum SlackNotificationRoutingType {
  MEMBERSHIP_AND_ROLES = "Membership and roles",
  PROJECTS_AND_ORGANIZATIONS = "Projects and organizations",
  POLICY_REMINDERS_AND_STATUS = "Policy reminders and status",
  EVIDENCE_AND_TASK_ALERTS = "Evidence and task alerts",
  CONTROL_OR_POLICY_CHANGES = "Control or policy changes",
}
```
