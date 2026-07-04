"use strict";

/**
 * Add organization_id to governance_control_mappings
 *
 * Converts the shared mapping table into a tenant-scoped table so that
 * cross-framework mappings are isolated per organization. Existing mappings
 * are backfilled to the first organization in the database (or 1 if the
 * table is empty) to preserve historical data.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_control_mappings
         ADD COLUMN IF NOT EXISTS organization_id INTEGER;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_gcm_organization
         ON verifywise.governance_control_mappings(organization_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_gcm_org_source_framework
         ON verifywise.governance_control_mappings(organization_id, source_framework_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_gcm_org_target_framework
         ON verifywise.governance_control_mappings(organization_id, target_framework_id);`,
        { transaction },
      );

      // Backfill existing mappings. Prefer the smallest real organization id.
      // If the organizations table is empty, the existing mappings are orphaned
      // and are removed so the NOT NULL / foreign-key constraints can be applied
      // safely.
      const [orgResult] = await queryInterface.sequelize.query(
        `SELECT MIN(id) as min_id FROM verifywise.organizations`,
        { transaction },
      );
      const minOrgId = orgResult[0]?.min_id;

      if (minOrgId) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.governance_control_mappings
           SET organization_id = :minOrgId
           WHERE organization_id IS NULL`,
          { transaction, replacements: { minOrgId } },
        );
      } else {
        await queryInterface.sequelize.query(`DELETE FROM verifywise.governance_control_mappings`, {
          transaction,
        });
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_control_mappings
         ALTER COLUMN organization_id SET NOT NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_control_mappings
         ADD CONSTRAINT fk_gcm_organization
         FOREIGN KEY (organization_id) REFERENCES verifywise.organizations(id) ON DELETE CASCADE;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_control_mappings
         DROP CONSTRAINT IF EXISTS fk_gcm_organization;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_gcm_org_target_framework;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_gcm_org_source_framework;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_gcm_organization;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_control_mappings
         DROP COLUMN IF EXISTS organization_id;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
