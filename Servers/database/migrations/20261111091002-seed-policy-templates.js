"use strict";

const { SYSTEM_POLICY_TEMPLATES } = require("../seeders/systemPolicyTemplates.js");

/**
 * Seeds the system policy template library into policy_templates.
 *
 * Idempotent per name: the unique index on (COALESCE(organization_id, 0),
 * name) covers the system rows because they all share organization_id NULL,
 * so ON CONFLICT DO NOTHING makes a re-run a no-op. The legacy static ids are
 * preserved (the seeder module carries them) so deep links built against the
 * old Clients/public/data/PolicyTemplates.json ids keep resolving.
 *
 * content is the full policy body HTML, copied verbatim from the static file
 * the in-product editor previously read — the TipTap editor consumes it
 * exactly the way it consumed the JSON entry's content field.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const tpl of SYSTEM_POLICY_TEMPLATES) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.policy_templates
             (id, organization_id, name, category, description, content, tags,
              is_system_template, is_active)
           VALUES
             (:id, NULL, :name, :category, :description, :content, ARRAY[:tags]::text[],
              true, true)
           ON CONFLICT (COALESCE(organization_id, 0), name) DO NOTHING`,
          {
            replacements: {
              id: tpl.id,
              name: tpl.name,
              category: tpl.category,
              description: tpl.description,
              content: tpl.content,
              tags: tpl.tags,
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
      }

      // The library's legacy ids (1..35, non-contiguous) were inserted
      // explicitly, which does not advance the SERIAL sequence — the next
      // org-owned template would receive id 1 and collide. Park the sequence
      // above the highest id actually present.
      await queryInterface.sequelize.query(
        `SELECT setval(
           'verifywise.policy_templates_id_seq',
           COALESCE((SELECT MAX(id) FROM verifywise.policy_templates), 1)
         )`,
        { transaction: t },
      );

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const names = SYSTEM_POLICY_TEMPLATES.map((t) => t.name);
    await queryInterface.sequelize.query(
      `DELETE FROM verifywise.policy_templates
        WHERE is_system_template = true AND name = ANY(ARRAY[:names]::varchar[])`,
      { replacements: { names } },
    );
  },
};
