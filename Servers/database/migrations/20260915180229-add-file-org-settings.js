"use strict";

/**
 * file_org_settings — org-wide default retention policy for files. One row
 * per org, lazily created; a missing row means "no default" (uploads leave
 * expiry_date NULL). Follows the mrm_org_settings pattern.
 *
 * default_retention_policy uses verifywise.enum_retention_policy (created
 * in 20260915161108-move-evidence-expiry-retention-to-files.js). Applied
 * at file INSERT time: uploads without an explicit expiry/retention inherit
 * the org default; explicit values on subsequent metadata updates override
 * (see files.expiry_date + files.retention_policy precedence in
 * repositories/file.repository.ts:updateFileMetadata).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.file_org_settings (
        organization_id INTEGER PRIMARY KEY
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        default_retention_policy verifywise.enum_retention_policy NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.file_org_settings CASCADE;",
    );
  },
};
