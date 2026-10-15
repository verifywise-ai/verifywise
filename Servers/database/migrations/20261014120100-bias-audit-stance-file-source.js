"use strict";

/**
 * Lets a generated bias-audit stance PDF be stored in the existing files
 * table, which carries tenant isolation and access control already.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the
 * type and migrating every column that uses it, which is not worth the risk
 * for a fix-forward migration. Same rationale as
 * 20260904013000-add-evidence-expired-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_files_source
         ADD VALUE IF NOT EXISTS 'Bias audit stance report';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
