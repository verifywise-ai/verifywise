"use strict";

/**
 * ai_apps.required_training_id — the training record an AI app requires,
 * as a FK to trainingregistar (#5260). The legacy free-text
 * required_training column stays for backward compatibility: the client
 * sends both (name for old readers, id for new ones) and the id wins.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_apps
        ADD COLUMN IF NOT EXISTS required_training_id INTEGER
          REFERENCES verifywise.trainingregistar(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_apps
        DROP COLUMN IF EXISTS required_training_id;
    `);
  },
};
