"use strict";

/**
 * Sent-record race guard for vendor research notices: one notice per (organization, user, run).
 * A run belongs to one vendor, so the run id is enough to tell one notice from the next. Two
 * concurrent attempts to announce the same run collide; the notifier treats that 23505 as a
 * suppressed duplicate.
 *
 * Its own migration, after the one that adds the enum value the predicate names.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_vendor_research_findings_uniq
        ON verifywise.notifications (
          organization_id,
          user_id,
          (metadata->>'run_id')
        )
        WHERE type = 'vendor_research_findings';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.notifications_vendor_research_findings_uniq;
    `);
  },
};
