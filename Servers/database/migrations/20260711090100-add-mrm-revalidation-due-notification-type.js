"use strict";

/**
 * MRM alerts (gaps #2+#3) — extend enum_notification_type with the
 * overdue-validation value so the revalidation sweep can deliver an in-app
 * notification when a periodic validation is overdue and idle.
 *
 * Reuses entity_type = 'model' (already present), so no entity-type change.
 * Down is a no-op: removing a Postgres enum value requires recreating the type
 * and migrating every column that uses it — risky for a fix-forward migration.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'mrm_revalidation_due';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
