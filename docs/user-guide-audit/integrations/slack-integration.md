# Audit: integrations/slack-integration
**Article path:** shared/user-guide-content/content/integrations/slack-integration.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The Slack integration article is mostly accurate in describing workflow and permissions. However, the list of "available notification types" in the article (6 types) does not match the actual routing types defined in the codebase enum (5 types with different names). The article's notification type list appears aspirational rather than reflecting current implementation.

## Findings
### Finding 1 — Notification types list does not match code enum
- **Type:** Quantitative / Reference
- **Status:** ❌ wrong
- **Doc says:** "You can route these notification types to specific channels: Model updates, Risk alerts, Compliance updates, Policy changes, Vendor updates, Training notifications" (block 156–157)
- **Reality:** Code enum `SlackNotificationRoutingType` defines exactly 5 routing types: `MEMBERSHIP_AND_ROLES`, `PROJECTS_AND_ORGANIZATIONS`, `POLICY_REMINDERS_AND_STATUS`, `EVIDENCE_AND_TASK_ALERTS`, `CONTROL_OR_POLICY_CHANGES`
- **Evidence:** `/Users/gorkemcetin/verifywise/Servers/dist/domain.layer/enums/slack.enum.js` lines 6–11 (SlackNotificationRoutingType enum definition); code calls `getSlackWebhookByIdAndRoutingType(userId, routingType)` at `/Users/gorkemcetin/verifywise/Servers/dist/services/slack/slackNotificationService.js`
- **Suggested fix:** Update the article's notification types list to match the enum: Membership and roles, Projects and organizations, Policy reminders and status, Evidence and task alerts, Control or policy changes
- **Confidence:** high

## Verified claims (sampled)
- Claim: "The Slack integration lets VerifyWise send real-time notifications about AI governance activities to your Slack workspace" (block 13) — verified; code calls `sendSlackNotification` with `Promise.all` and immediate sends, no batching or delay at `slackNotificationService.js`
- Claim: "Send different notification types to specific channels" (block 25, bold) — verified; code traces `getSlackWebhookByIdAndRoutingType(userId, routingType)` routing by type at `slackNotificationService.js`
- Claim: "Notifications go out in real-time as events happen in VerifyWise. There's no batching or delay." (block 288) — verified; code uses `sendImmediateMessage` (no batching logic) at `slackNotificationService.js`
- Claim: "VerifyWise requests the following Slack permissions: channels:read, chat:write, incoming-webhook, groups:read" (blocks 69–72) — ❓ unverifiable; permissions defined in OAuth scope (external to codebase, not checked)
- Claim: "These permissions let VerifyWise send notifications but don't give it access to read your messages or user data" (block 77, negative claim) — ✅ verified; code only uses `chat.postMessage` API call, no message read methods invoked at `slackNotificationService.js`

## Skipped / non-verifiable
- "Help you automate data sync" (block 13) — opinion/motivation only
- "Keep your team updated without requiring them to log into VerifyWise" (block 27) — motivational framing
- "Plan your routing accordingly so the right people have visibility" (block 268) — guidance/opinion
- "Notification messages use standard formats designed to be clear and actionable" (block 278) — design rationale; code confirms standard format (header + section + context blocks) but "actionable" is subjective
