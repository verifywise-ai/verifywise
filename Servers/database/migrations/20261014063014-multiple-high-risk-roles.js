"use strict";

/**
 * A use case can hold more than one EU AI Act role: Provider, Deployer or
 * both. projects.type_of_high_risk_role (one enum value) becomes
 * projects.high_risk_roles (text[]), and eu_ai_act_classifications gets the
 * list next to its single role column, which stays and keeps the derived
 * value for older records.
 *
 * text[] rather than an array of the enum: Sequelize handles enum arrays
 * poorly and raw SQL would need casts and an empty-array special case.
 *
 * The enum type verifywise.enum_projects_type_of_high_risk_role is kept: down
 * needs it.
 *
 * Down is lossy: a use case with both roles keeps only Provider.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ADD COLUMN high_risk_roles TEXT[] NOT NULL DEFAULT '{}',
           ADD CONSTRAINT projects_high_risk_roles_check
             CHECK (high_risk_roles <@ ARRAY['Provider', 'Deployer']::text[]);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects
            SET high_risk_roles = ARRAY[type_of_high_risk_role::text]
          WHERE type_of_high_risk_role IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects DROP COLUMN type_of_high_risk_role;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.eu_ai_act_classifications
           ADD COLUMN roles TEXT[] NOT NULL DEFAULT '{}',
           ADD CONSTRAINT eu_ai_act_classifications_roles_check
             CHECK (roles <@ ARRAY['Provider', 'Deployer']::text[]);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.eu_ai_act_classifications
            SET roles = ARRAY[role::text]
          WHERE role IS NOT NULL;`,
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
        `ALTER TABLE verifywise.projects
           ADD COLUMN type_of_high_risk_role verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction },
      );
      // Lossy: a use case with both roles keeps Provider only.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects
            SET type_of_high_risk_role = (CASE
                  WHEN 'Provider' = ANY(high_risk_roles) THEN 'Provider'
                  WHEN 'Deployer' = ANY(high_risk_roles) THEN 'Deployer'
                END)::verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects DROP COLUMN high_risk_roles;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.eu_ai_act_classifications DROP COLUMN roles;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
