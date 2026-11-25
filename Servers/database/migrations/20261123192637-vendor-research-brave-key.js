"use strict";

/**
 * Vendor research: `vendor_research_settings.brave_api_key_encrypted`, the organization's Brave
 * Search API key, encrypted with `utils/encryption.utils.ts` (AES-256-GCM). NULL means no key, and
 * the research keeps searching the way it did before. The settings read and write name their
 * columns, so this one never reaches a response.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.vendor_research_settings
         ADD COLUMN IF NOT EXISTS brave_api_key_encrypted TEXT NULL;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_settings DROP COLUMN IF EXISTS brave_api_key_encrypted;",
    );
  },
};
