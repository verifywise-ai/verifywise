"use strict";

/**
 * Extend `enum_notification_entity_type` to include `'ai_action'`.
 *
 * The TS enum `NotificationEntityType.AI_ACTION = "ai_action"`
 * (`Servers/domain.layer/interfaces/i.notification.ts:81`) was added so the
 * Approval Gateway could notify admins when an AI advisor write operation
 * enters `pending_approval` (see `Servers/advisor/approval/approvalGateway.ts:674`),
 * but the matching Postgres enum type was never extended.
 *
 * Result: every `INSERT INTO notifications (..., entity_type, ...)` with
 * `entity_type='ai_action'` failed with
 *   "invalid input value for enum enum_notification_entity_type: 'ai_action'".
 * The error was caught as non-fatal in the gateway and logged, but
 * functionally fatal: admins never saw the approval request in the UI, so
 * pending AI-action approvals could never be acted on.
 *
 * Postgres 12+ allows `ALTER TYPE ... ADD VALUE` inside a transaction.
 * Project DB image is `postgres:16.8` (docker-compose.yml:5).
 *
 * Down is intentionally a no-op: removing a value from a Postgres enum
 * requires recreating the type and migrating every column that uses it,
 * which is risky for a fix-forward migration. Leaving the value in place
 * on rollback is harmless.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE verifywise.enum_notification_entity_type
        ADD VALUE IF NOT EXISTS 'ai_action';
    `);
  },

  async down() {
    // No-op. See header comment.
  },
};
