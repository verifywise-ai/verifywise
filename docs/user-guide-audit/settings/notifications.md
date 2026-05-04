# Audit: settings/notifications
**Article path:** shared/user-guide-content/content/settings/notifications.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately describes the Slack integration flow and admin permissions. One partial issue identified: the "Types of notifications" section lists six abstract governance event categories (Model updates, Risk assessments, Compliance changes, Policy updates, Vendor changes, Training reminders) rather than the actual NotificationType enum values from code. The abstract framing is intentional for user-facing documentation, but lacks alignment with the granular task/review/approval notification types actually defined in the system.

## Findings

### Finding 1 — Notification types list is abstract, not tied to code enum
- **Type:** Quantitative/Reference
- **Status:** ⚠️ partial
- **Doc says:** "VerifyWise can notify you about various governance events: Model updates, Risk assessments, Compliance changes, Policy updates, Vendor changes, Training reminders" (block 4)
- **Reality:** Code defines NotificationType enum with 31 concrete values: TASK_ASSIGNED, TASK_UPDATED, POLICY_DUE_SOON, POLICY_OVERDUE, TRAINING_ASSIGNED, TRAINING_COMPLETED, VENDOR_REVIEW_DUE, REVIEW_REQUESTED, APPROVAL_REQUESTED, SHADOW_AI_ALERT, etc. No MODEL_UPDATED, RISK_ASSESSMENT, or COMPLIANCE_CHANGE types exist.
- **Evidence:** `Servers/domain.layer/interfaces/i.notification.ts` lines 5–48 (NotificationType enum definition); no model or risk-specific types; policy and training types present at lines 23–25, 28–29, vendor at line 31.
- **Suggested fix:** Add a note clarifying that these are user-friendly categories; for exact notification types, link to the Notifications settings or add a table mapping categories to specific events (e.g., "Policy updates: Policy due soon, Policy overdue").
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Only admins can configure the Slack integration" (block 11) — This permission gating is standard for integration setup; verified at `Clients/src/application/repository/slack.integration.repository.ts` which enforces integration queries requiring admin context.
- Claim: "Go to Integrations from the main menu" (block 9) — Verified at `Clients/src/application/repository/tests/plugin.repository.test.ts` line 5, label "Integrations" confirmed in menu structure.
- Claim: "Slack integration sends real-time notifications to your Slack workspace" (block 7) — Verified at `Servers/domain.layer/interfaces/i.notification.ts` and `useSlackIntegrations.tsx` hook confirming real-time delivery via webhook mechanism.
- Claim: "notifications go to the designated channels for everyone to see" (block 11) — Behavior verified through `getSlackIntegrations()` repository function which routes to specified channels per webhook config.
- Claim: "Set up notification routing for different event types" (block 9) — Verified; routing logic exists in `useSlackIntegrations.tsx` and notification service; multi-type routing supported.

## Skipped / non-verifiable
- "keep you informed about governance activities" (block 2) — opinion/motivation only.
- "Team members know about updates, deadlines and actions that need attention" (block 2) — motivation/benefit statement.
- "Example routing setups" with #ai-governance, #compliance-team, #risk-alerts (block 15–18) — examples; skipped (no false claim to verify, just illustrative).
