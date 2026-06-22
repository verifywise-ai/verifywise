"use strict";

/**
 * Tracks scenario activations and links them to the tasks created.
 *
 * Note: This migration runs AFTER 20260505120000-create-governance-os-tables.js
 * to ensure the governance_scenarios table exists before the FK is created.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_scenario_activations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          scenario_id INTEGER NOT NULL REFERENCES verifywise.governance_scenarios(id) ON DELETE CASCADE,
          activated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          activated_at TIMESTAMPTZ DEFAULT NOW(),
          deactivated_at TIMESTAMPTZ,
          tasks_created INTEGER DEFAULT 0,
          frameworks_assigned INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_governance_scenario_activations_org ON verifywise.governance_scenario_activations (organization_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_governance_scenario_activations_scenario ON verifywise.governance_scenario_activations (scenario_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_governance_scenario_activations_status ON verifywise.governance_scenario_activations (organization_id, status);`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.governance_scenario_activations;`,
    );
  },
};
