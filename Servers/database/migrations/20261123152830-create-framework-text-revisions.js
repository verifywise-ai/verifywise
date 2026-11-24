"use strict";

/**
 * The text revision of each bundled framework that this database's struct
 * tables hold (services/frameworkTextSync).
 *
 * On startup the sync writes a framework's registry text only when the
 * running build's textRevision is at least the stored one, then records it.
 * A rollback, or an older instance restarting during a rolling update, has a
 * lower revision and leaves the newer wording alone.
 *
 * Global, like the struct tables it describes: no organization_id. A missing
 * row means revision 0, so the first start after this migration syncs every
 * framework once and records its revision.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.framework_text_revisions (
        framework_id INTEGER PRIMARY KEY
          REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.framework_text_revisions;`,
    );
  },
};
