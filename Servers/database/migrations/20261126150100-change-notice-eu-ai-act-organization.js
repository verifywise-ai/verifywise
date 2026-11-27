"use strict";

// Release row for the change notice "eu-ai-act-organization-2026-11"
// (Clients/src/presentation/components/ChangeNotice/notices.ts): the
// organization-wide EU AI Act obligations moved from each use case to EU AI Act
// (organization) on the Frameworks page. Users created after released_at never
// see it (docs/technical/frontend/change-notice.md).

const NOTICE_IDS = ["eu-ai-act-organization-2026-11"];

module.exports = {
  async up(queryInterface) {
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
    await queryInterface.sequelize.query(
      `DELETE FROM verifywise.change_notice_releases WHERE notice_id IN (:ids);`,
      { replacements: { ids: NOTICE_IDS } },
    );
  },
};
