"use strict";
/**
 * Extend enum_notification_type with 'regulations_tracker' and
 * enum_notification_entity_type with 'regulation_country' for the Regulations
 * Tracker weekly digest notifications. Without these, every INSERT INTO
 * notifications from syncRegulationsTracker fails with
 * "invalid input value for enum ...", aborting the weekly run.
 * Postgres 12+ allows ALTER TYPE ... ADD VALUE. Down is a no-op (removing an
 * enum value requires recreating the type — risky for a fix-forward migration).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'regulations_tracker';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE verifywise.enum_notification_entity_type ADD VALUE IF NOT EXISTS 'regulation_country';
    `);
  },
  async down() { /* No-op: enum value removal requires type recreation. */ },
};
