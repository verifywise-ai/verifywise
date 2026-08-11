"use strict";

/**
 * report_templates.slug has no uniqueness guard. Harmless while every
 * template is a system template inserted by an idempotent seed; a real
 * problem the moment orgs can create their own, because two custom
 * templates in one org could collide silently.
 *
 * COALESCE(organization_id, 0) rather than a plain (organization_id, slug)
 * index: system templates carry organization_id IS NULL, and NULLs never
 * compare equal in a unique index, so a plain index would leave them
 * unconstrained.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_templates_org_slug
        ON verifywise.report_templates (COALESCE(organization_id, 0), slug);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.uq_report_templates_org_slug;
    `);
  },
};
