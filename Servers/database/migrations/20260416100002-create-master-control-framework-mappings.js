'use strict';

/**
 * Controls Hub — Master Control ↔ Framework Mappings
 *
 * Junction table that links a master_control row to one or more concrete
 * framework requirement rows. The frontend renders this as a matrix:
 *
 *                | EU AI Act | ISO 42001 | ISO 27001 | NIST AI RMF
 *   -------------|-----------|-----------|-----------|------------
 *   Master Ctl A |   [chips] |  [chips]  |     -     |   [chips]
 *
 * framework_entity_type distinguishes which struct table the
 * framework_entity_id refers to. Supported types:
 *   - control_eu                 → controls_struct_eu
 *   - subcontrol_eu              → subcontrols_struct_eu
 *   - subclause_struct_iso       → subclauses_struct_iso     (ISO 42001)
 *   - annex_category_iso         → annexcategories_struct_iso (ISO 42001)
 *   - subcategory_nist           → nist_ai_rmf_subcategories_struct
 *   - iso27001_subclause         → subclauses_struct_iso27001
 *   - iso27001_annex_category    → annexcontrols_struct_iso27001
 *
 * The unique constraint prevents duplicate mappings for the same tuple within
 * an organization.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.master_control_framework_mappings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,

          master_control_id INTEGER NOT NULL
            REFERENCES verifywise.master_controls(id) ON DELETE CASCADE,

          framework VARCHAR(32) NOT NULL,
          framework_entity_type VARCHAR(48) NOT NULL,
          framework_entity_id INTEGER NOT NULL,

          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

          CONSTRAINT uq_master_control_mapping
            UNIQUE (master_control_id, framework, framework_entity_type, framework_entity_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcfm_org
          ON verifywise.master_control_framework_mappings(organization_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcfm_master_control
          ON verifywise.master_control_framework_mappings(master_control_id);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_mcfm_framework_entity
          ON verifywise.master_control_framework_mappings(framework, framework_entity_type, framework_entity_id);
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
        `DROP TABLE IF EXISTS verifywise.master_control_framework_mappings CASCADE;`,
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
