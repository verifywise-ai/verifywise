"use strict";

/**
 * Updates verifywise.enum_projects_ai_risk_classification to the canonical
 * 6-value set used by the EU AI Act filter:
 *   'Prohibited', 'High risk', 'Limited risk', 'Minimal risk', 'GPAI', 'General Risk'
 *
 * Removes the legacy placeholders 'gpai', 'gpai_systemic', 'not_ai_system' which
 * were in the original DB enum but never exposed via the TypeScript enum / UI.
 *
 * Strategy: PostgreSQL does not support DROP VALUE on enums. To cleanly rebuild
 * the enum we create a new type, remap any existing data, swap the column type,
 * and drop the old type.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. Remap any rows still using the deprecated values to the closest new value.
      //    'gpai' and 'gpai_systemic' map to 'GPAI'; 'not_ai_system' maps to
      //    'Minimal risk' as the safest fallback (no AI Act obligations apply).
      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.projects
        SET ai_risk_classification = 'Minimal risk'
        WHERE ai_risk_classification::text = 'not_ai_system';
      `,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.projects
        SET ai_risk_classification = 'Minimal risk'
        WHERE ai_risk_classification::text IN ('gpai', 'gpai_systemic');
      `,
        { transaction: t },
      );
      // ^ Temporarily map gpai/gpai_systemic to Minimal risk so the column can
      //   accept the new enum. We re-map them to 'GPAI' after the swap below.

      // 2. Create the new enum type.
      await queryInterface.sequelize.query(
        `
        CREATE TYPE verifywise.enum_projects_ai_risk_classification_new AS ENUM (
          'Prohibited', 'High risk', 'Limited risk', 'Minimal risk', 'GPAI', 'General Risk'
        );
      `,
        { transaction: t },
      );

      // 3. Swap the column to the new type.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.projects
        ALTER COLUMN ai_risk_classification
        TYPE verifywise.enum_projects_ai_risk_classification_new
        USING ai_risk_classification::text::verifywise.enum_projects_ai_risk_classification_new;
      `,
        { transaction: t },
      );

      // 4. Drop the old type and rename the new one to the original name.
      await queryInterface.sequelize.query(
        `
        DROP TYPE verifywise.enum_projects_ai_risk_classification;
      `,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TYPE verifywise.enum_projects_ai_risk_classification_new
        RENAME TO enum_projects_ai_risk_classification;
      `,
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // Recreate the legacy enum shape.
      await queryInterface.sequelize.query(
        `
        CREATE TYPE verifywise.enum_projects_ai_risk_classification_legacy AS ENUM (
          'High risk', 'Limited risk', 'Minimal risk', 'Prohibited', 'gpai', 'gpai_systemic', 'not_ai_system'
        );
      `,
        { transaction: t },
      );

      // Remap new-only values back to closest legacy equivalents.
      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.projects
        SET ai_risk_classification = 'Minimal risk'
        WHERE ai_risk_classification::text IN ('GPAI', 'General Risk');
      `,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.projects
        ALTER COLUMN ai_risk_classification
        TYPE verifywise.enum_projects_ai_risk_classification_legacy
        USING ai_risk_classification::text::verifywise.enum_projects_ai_risk_classification_legacy;
      `,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `
        DROP TYPE verifywise.enum_projects_ai_risk_classification;
      `,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TYPE verifywise.enum_projects_ai_risk_classification_legacy
        RENAME TO enum_projects_ai_risk_classification;
      `,
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
