'use strict';

/**
 * Controls Hub — Master Control Change History
 *
 * Tracks every create/update/delete event on master_controls and their
 * framework mappings. Mirrors the shape of the other *_change_history tables
 * (e.g. vendor_change_history, fria_change_history) so the generic
 * change-history utilities in `utils/changeHistory.base.utils.ts` can be
 * reused without per-entity branches.
 *
 * Rows are written by `recordEntityChange` / `recordMultipleFieldChanges`
 * via the ENTITY_CONFIGS registry entry for "master_control".
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.master_control_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          master_control_id INTEGER NOT NULL,
          action VARCHAR(20),
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          changed_by_user_id INTEGER,
          changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcch_org
          ON verifywise.master_control_change_history(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcch_master_control
          ON verifywise.master_control_change_history(master_control_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcch_changed_at
          ON verifywise.master_control_change_history(changed_at DESC);
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.master_control_change_history CASCADE;`,
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
