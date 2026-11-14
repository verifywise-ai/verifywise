"use strict";

// When each change notice reached this deployment. A user whose account is newer
// than that never saw what the notice describes, so the notice is skipped for
// them (rules.ts decideShow). One row per notice id; deployment-wide, not per
// organization, because a release reaches every organization at once.
//
// The release is the time this migration runs, or the earliest view of the
// notice already stored if that is earlier (a deployment that served the notice
// before this table existed). On a fresh install the migrations run before any
// organization member exists, so every account is newer and nobody sees a notice.
//
// A later notice adds its id in a migration of its own, using the same INSERT.
// changeNoticeReleases.test.ts fails when a CHANGE_NOTICES id has no release row.
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
      SELECT n.notice_key,
             LEAST(NOW(), (
               SELECT MIN((up.preferences->'change_notices'->(n.notice_key)->>'first_seen_at')::timestamptz)
                 FROM verifywise.user_preferences up
             ))
        FROM unnest(ARRAY[:ids]::text[]) AS n(notice_key)
      ON CONFLICT (notice_id) DO NOTHING;
    `,
      { replacements: { ids: NOTICE_IDS } },
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.change_notice_releases;`);
  },
};
