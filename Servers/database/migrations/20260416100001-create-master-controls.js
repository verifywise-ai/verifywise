'use strict';

/**
 * Controls Hub — Master Controls Table
 *
 * Creates the core table backing the cross-framework unified controls library.
 * A master control is an organization-scoped control that can be mapped to one
 * or more framework requirements (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF).
 *
 * Related migrations:
 *  - 20260416100002: master_control_framework_mappings (mappings join table)
 *  - 20260416100003: master_control_change_history (audit log)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.master_controls (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,

          title VARCHAR(255) NOT NULL,
          description TEXT,

          status VARCHAR(30) NOT NULL DEFAULT 'Waiting',
          risk_review VARCHAR(30),

          owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,

          due_date TIMESTAMP WITH TIME ZONE,
          implementation_details TEXT,

          is_demo BOOLEAN NOT NULL DEFAULT FALSE,

          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_master_controls_org
          ON verifywise.master_controls(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_master_controls_org_status
          ON verifywise.master_controls(organization_id, status);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_master_controls_owner
          ON verifywise.master_controls(owner);
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
        `DROP TABLE IF EXISTS verifywise.master_controls CASCADE;`,
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
