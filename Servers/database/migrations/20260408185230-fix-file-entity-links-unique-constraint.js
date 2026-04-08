'use strict';

/**
 * Fix file_entity_links unique constraint to include organization_id.
 *
 * The ON CONFLICT clause in file.repository.ts references
 * (organization_id, file_id, framework_type, entity_type, entity_id)
 * but the existing constraint only covers
 * (file_id, framework_type, entity_type, entity_id).
 */
module.exports = {
  async up(queryInterface) {
    // Drop the old constraint (without organization_id)
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.file_entity_links
        DROP CONSTRAINT IF EXISTS file_entity_links_file_id_framework_type_entity_type_entity_id_key;
    `);

    // Create the new constraint that matches the ON CONFLICT specification
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.file_entity_links
        ADD CONSTRAINT file_entity_links_org_file_framework_entity_uq
        UNIQUE (organization_id, file_id, framework_type, entity_type, entity_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.file_entity_links
        DROP CONSTRAINT IF EXISTS file_entity_links_org_file_framework_entity_uq;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.file_entity_links
        ADD CONSTRAINT file_entity_links_file_id_framework_type_entity_type_entity_id_key
        UNIQUE (file_id, framework_type, entity_type, entity_id);
    `);
  }
};
