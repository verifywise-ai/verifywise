"use strict";

/**
 * Add the 'Retired' terminal status to the model inventory status enum.
 *
 * `ModelInventoryStatus` (Servers/domain.layer/enums/model-inventory-status.enum.ts)
 * declares RETIRED = "Retired" for models that have been decommissioned, but the
 * matching Postgres enum type was created in 20260226234300-base-enums-and-roles.js
 * without it. Without this value, any write with status 'Retired' fails with:
 *   "invalid input value for enum enum_model_inventories_status: 'Retired'".
 *
 * This migration contains ONLY this statement: `ALTER TYPE ... ADD VALUE`
 * cannot be mixed with other DDL in the same transaction block.
 *
 * Postgres 12+ allows `ALTER TYPE ... ADD VALUE`. Down is a no-op: removing a
 * value from a Postgres enum requires recreating the type and migrating every
 * column that uses it, which is risky for a fix-forward migration.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_model_inventories_status ADD VALUE IF NOT EXISTS 'Retired';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
