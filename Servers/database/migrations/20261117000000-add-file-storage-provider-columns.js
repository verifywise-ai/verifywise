"use strict";

/**
 * files.storage_provider / files.storage_key — pointer to file bytes stored
 * outside the database (S3-compatible object storage). Both NULL means the
 * bytes are in files.content, which is the historical default and remains
 * the behavior for every existing row. Additive and non-breaking: no data
 * movement, no changes to existing columns, no backfill. Readers treat NULL
 * storage_key as "bytes in content" (see services/storage).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.files
        ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1024) NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.files
        DROP COLUMN IF EXISTS storage_provider,
        DROP COLUMN IF EXISTS storage_key;
    `);
  },
};
