"use strict";

/**
 * Adds "ai_app" to the entity_type allowlist on both custom_fields tables.
 * Drops + re-adds the CHECK constraints because the allowlist is baked into
 * them (see 20260528140140-add-model-risk-to-custom-fields-allowlist).
 * The tables live in the verifywise schema, as in that migration.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.custom_field_definitions
        DROP CONSTRAINT IF EXISTS cfd_entity_type_allowed,
        ADD CONSTRAINT cfd_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task','model_risk','ai_app'
          ));

      ALTER TABLE verifywise.custom_field_values
        DROP CONSTRAINT IF EXISTS cfv_entity_type_allowed,
        ADD CONSTRAINT cfv_entity_type_allowed
          CHECK (entity_type IN (
            'vendor','policy','project','project_risk',
            'vendor_risk','model_inventory','task','model_risk','ai_app'
          ));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.custom_field_values WHERE entity_type = 'ai_app';
      DELETE FROM verifywise.custom_field_definitions WHERE entity_type = 'ai_app';

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
};
