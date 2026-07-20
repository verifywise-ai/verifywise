"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * Extend `enum_notification_type` with the MRM metric-breach value so an
 * in-app notification can be delivered when an ingested metric breaches a
 * threshold. Without this, `INSERT INTO notifications (..., type, ...)` with
 * `mrm_metric_breach` would fail with:
 *   "invalid input value for enum enum_notification_type: 'mrm_metric_breach'".
 *
 * The breach notification reuses the existing `entity_type = 'model'` value
 * (already present in enum_notification_entity_type), so no entity-type change
 * is needed.
 *
 * Postgres 12+ allows `ALTER TYPE ... ADD VALUE`. Down is a no-op: removing a
 * value from a Postgres enum requires recreating the type and migrating every
 * column that uses it, which is risky for a fix-forward migration.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'mrm_metric_breach';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
