"use strict";

// When each change notice reached this deployment. A user whose account is newer
// than that never saw what the notice describes, so the notice is skipped for
// them (rules.ts decideShow). One row per notice id; deployment-wide, not per
// organization, because a release reaches every organization at once.
//
// On a fresh install no organization member has ever logged in, so nobody has
// seen the previous look: the release is stored as -infinity and every account
// counts as newer. On an upgrade it is the time this migration ran.
//
// A later notice adds its id in a migration of its own, using the same INSERT.
const NOTICE_IDS = [
  "new-look-2026-11",
  "home-2026-11",
  "ai-trust-index-2026-11",
  "llm-evals-2026-11",
  "ai-gateway-2026-11",
  "agent-controls-2026-11",
  "ai-detection-2026-11",
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.change_notice_releases (
        notice_id VARCHAR(64) PRIMARY KEY,
        released_at TIMESTAMPTZ NOT NULL
      );
    `);
    await queryInterface.sequelize.query(
      `
      INSERT INTO verifywise.change_notice_releases (notice_id, released_at)
      SELECT id,
             CASE WHEN EXISTS (
               SELECT 1
                 FROM verifywise.users u
                 JOIN verifywise.organization_members om ON om.user_id = u.id
                WHERE u.last_login IS NOT NULL
             ) THEN NOW() ELSE '-infinity'::timestamptz END
        FROM unnest(ARRAY[:ids]::varchar[]) AS id
      ON CONFLICT (notice_id) DO NOTHING;
    `,
      { replacements: { ids: NOTICE_IDS } },
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.change_notice_releases;`);
  },
};
