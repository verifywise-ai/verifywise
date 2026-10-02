"use strict";

module.exports = {
  async up(queryInterface) {
    // Demote before indexing. risk_links has never shipped, but this migration
    // has run in local dev databases that may already hold two confirmed
    // parents for one child — a hard index failure there breaks a teammate's
    // `migrate` for no gain. Keep the most recently decided parent per child.
    // Demotion, not deletion: a dismissed row is restorable from the panel's
    // "Show dismissed" view, so nobody loses a judgement.
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risk_links
         SET status = 'dismissed'
       WHERE relation_type = 'inherits_from'
         AND status = 'confirmed'
         AND id NOT IN (
           SELECT DISTINCT ON (source_risk_id) id
             FROM verifywise.risk_links
            WHERE relation_type = 'inherits_from' AND status = 'confirmed'
            ORDER BY source_risk_id, decided_at DESC NULLS LAST, id DESC
         );
    `);

    // source_risk_id is the child, so uniqueness on it IS "one parent per
    // child". Not scoped by organization_id: a risk id belongs to exactly one
    // organization, so adding it would only weaken the key.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_single_parent_idx
        ON verifywise.risk_links (source_risk_id)
        WHERE relation_type = 'inherits_from' AND status = 'confirmed';
    `);
  },

  async down(queryInterface) {
    // Does not restore demoted rows — which row was demoted is not recorded,
    // and the rows are still present and visible under "Show dismissed".
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS verifywise.risk_links_single_parent_idx;",
    );
  },
};
