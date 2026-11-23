"use strict";

/**
 * Vendor research: which LLM keys an organization's runs use. An administrator can choose one key
 * for the research loop and another for the analysis; a choice that is NULL means the newest key
 * (for the research) or the key of the research (for the analysis), which is what runs did before
 * the choice existed. One row per organization, written when an administrator first chooses.
 *
 * Deleting a key empties a choice that named it, and deleting the organization deletes its row.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.vendor_research_settings (
        organization_id INTEGER PRIMARY KEY
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        research_llm_key_id INTEGER
          REFERENCES verifywise.llm_keys(id) ON DELETE SET NULL,
        analysis_llm_key_id INTEGER
          REFERENCES verifywise.llm_keys(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.vendor_research_settings;
    `);
  },
};
