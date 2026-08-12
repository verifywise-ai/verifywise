"use strict";

const { SYSTEM_REPORT_TEMPLATES } = require("../seeders/systemReportTemplates.js");

/**
 * Seeds the system report template library.
 *
 * Idempotent per slug: 20260619191640 already inserted three of these, and
 * report_templates.slug carries a unique index from 20260720163044, so an
 * existing system row is skipped rather than duplicated. It is reactivated on
 * the way past, so an undo/redo round trip leaves the library visible: down()
 * deactivates instead of deleting, and getTemplatesQuery in
 * utils/reportTemplate.utils.ts lists only `is_active = true` rows.
 *
 * Framework ids are resolved BY NAME the way 20260302111132 does. A template
 * naming a framework this install does not have is skipped with a log line
 * rather than seeded with a dangling id.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const frameworkRows = await queryInterface.sequelize.query(
        `SELECT id, name FROM verifywise.frameworks`,
        { type: queryInterface.sequelize.QueryTypes.SELECT, transaction: t },
      );
      const idByName = new Map(frameworkRows.map((f) => [f.name, Number(f.id)]));

      for (const tpl of SYSTEM_REPORT_TEMPLATES) {
        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.report_templates
            WHERE slug = :slug AND is_system_template = true`,
          {
            replacements: { slug: tpl.slug },
            type: queryInterface.sequelize.QueryTypes.SELECT,
            transaction: t,
          },
        );
        if (existing.length) {
          await queryInterface.sequelize.query(
            `UPDATE verifywise.report_templates
                SET is_active = true, updated_at = NOW()
              WHERE slug = :slug AND is_system_template = true
                AND is_active = false`,
            { replacements: { slug: tpl.slug }, transaction: t },
          );
          continue;
        }

        const missing = tpl.frameworkNames.filter((n) => !idByName.has(n));
        if (missing.length) {
          // eslint-disable-next-line no-console
          console.log(
            `[seed-templates] skipping "${tpl.slug}": framework(s) not installed: ${missing.join(", ")}`,
          );
          continue;
        }

        const frameworkIds = tpl.frameworkNames.map((n) => `native:${idByName.get(n)}`);

        const inserted = await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_templates
             (organization_id, name, slug, description, category, default_scope,
              supported_scopes, recommended_frequency, is_system_template, is_active)
           VALUES (NULL, :name, :slug, :description, :category, :defaultScope,
              '["project","organization"]', :freq, true, true)
           RETURNING id`,
          {
            replacements: {
              name: tpl.name,
              slug: tpl.slug,
              description: tpl.description,
              category: tpl.category,
              defaultScope: tpl.defaultScope,
              freq: tpl.recommendedFrequency,
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
        const templateId = inserted[0][0].id;

        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_template_versions
             (template_id, version, sections_config, ai_blocks_config, framework_config,
              format_config, schedule_defaults, delivery_defaults, config_schema_version)
           VALUES (:tid, 1, :sections, :ai, :frameworks, '{"format":"pdf"}', :sched,
              '{"saveToStorage":true,"sendEmailLink":true,"attachFile":false}', 1)`,
          {
            replacements: {
              tid: templateId,
              sections: JSON.stringify({ sections: tpl.sections }),
              ai: JSON.stringify(tpl.ai),
              frameworks: JSON.stringify({ frameworkIds }),
              sched: JSON.stringify({
                frequency: tpl.recommendedFrequency,
                hour: 9,
                minute: 0,
                timezone: "UTC",
              }),
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
      }

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  /**
   * Deactivates rather than deletes. scheduled_reports.template_id is
   * NOT NULL REFERENCES report_templates(id) with no ON DELETE clause, so
   * NO ACTION applies: deleting a template any organization has scheduled from
   * raises a foreign key violation and the whole rollback fails.
   */
  async down(queryInterface) {
    const { SYSTEM_REPORT_TEMPLATES: tpls } = require("../seeders/systemReportTemplates.js");
    const slugs = tpls
      .map((t) => t.slug)
      .filter(
        (s) =>
          !["daily-governance-pulse", "weekly-executive-brief", "compliance-evidence-gap"].includes(
            s,
          ),
      );
    await queryInterface.sequelize.query(
      `UPDATE verifywise.report_templates
          SET is_active = false, updated_at = NOW()
        WHERE is_system_template = true AND slug = ANY(ARRAY[:slugs]::varchar[])`,
      { replacements: { slugs } },
    );
  },
};
