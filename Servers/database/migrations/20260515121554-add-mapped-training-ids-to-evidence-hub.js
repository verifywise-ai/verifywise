"use strict";

/**
 * Adds mapped_training_ids INTEGER[] column to evidence_hub so an evidence
 * record can be associated with one or more entries from the training registry,
 * mirroring the existing mapped_model_ids relationship to model inventory.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        ADD COLUMN IF NOT EXISTS mapped_training_ids INTEGER[];
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        DROP COLUMN IF EXISTS mapped_training_ids;
    `);
  },
};
