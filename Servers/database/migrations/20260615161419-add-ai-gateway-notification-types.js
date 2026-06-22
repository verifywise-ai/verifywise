"use strict";

/**
 * Extend `enum_notification_type` with the AI Gateway notification values.
 *
 * The TS enum `NotificationType` (`Servers/domain.layer/interfaces/i.notification.ts`)
 * declares six `ai_gateway_*` values, but the matching Postgres enum type was
 * never extended. As a result every
 *   `INSERT INTO notifications (..., type, ...)` with an `ai_gateway_*` type
 * failed with:
 *   "invalid input value for enum enum_notification_type: 'ai_gateway_...'".
 *
 * The error is caught as non-fatal where notifications are sent, so it was
 * silent — but functionally the AI Gateway could never deliver an in-app
 * notification (budget warnings, guardrail spikes, config changes, and the
 * new approval-pending notice all failed at the insert).
 *
 * This adds all six values so the existing budget/guardrail/config-change
 * notifications work too, not just approval_pending.
 *
 * Postgres 12+ allows `ALTER TYPE ... ADD VALUE`. Down is a no-op: removing a
 * value from a Postgres enum requires recreating the type and migrating every
 * column that uses it, which is risky for a fix-forward migration.
 */

const AI_GATEWAY_NOTIFICATION_TYPES = [
  "ai_gateway_budget_warning",
  "ai_gateway_budget_exhausted",
  "ai_gateway_guardrail_spike",
  "ai_gateway_config_change",
  "ai_gateway_virtual_key_budget_exhausted",
  "ai_gateway_approval_pending",
];

module.exports = {
  async up(queryInterface) {
    for (const value of AI_GATEWAY_NOTIFICATION_TYPES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS '${value}';`,
      );
    }

    // The notifications.entity_type column uses a separate enum that is also
    // missing the AI Gateway value, so every ai_gateway notification failed on
    // entity_type even once the type value existed.
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_entity_type ADD VALUE IF NOT EXISTS 'ai_gateway';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
