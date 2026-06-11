"use strict";

/**
 * Adds "model_risk" to the entity_type allowlist on both custom_fields tables.
 * Drops + re-adds the CHECK constraints because the allowlist is baked into
 * them by the original 20260520164729 migration.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.custom_field_definitions
        DROP CONSTRAINT IF EXISTS cfd_entity_type_allowed,
        ADD CONSTRAINT cfd_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task','model_risk'
          ));

      ALTER TABLE verifywise.custom_field_values
        DROP CONSTRAINT IF EXISTS cfv_entity_type_allowed,
        ADD CONSTRAINT cfv_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task','model_risk'
          ));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.custom_field_values WHERE entity_type = 'model_risk';
      DELETE FROM verifywise.custom_field_definitions WHERE entity_type = 'model_risk';

      ALTER TABLE verifywise.custom_field_definitions
        DROP CONSTRAINT IF EXISTS cfd_entity_type_allowed,
        ADD CONSTRAINT cfd_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task'
          ));

      ALTER TABLE verifywise.custom_field_values
        DROP CONSTRAINT IF EXISTS cfv_entity_type_allowed,
        ADD CONSTRAINT cfv_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task'
          ));
    `);
  },
};
