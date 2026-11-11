"use strict";

/**
 * policy_templates — organisation-owned policy templates (VW-CQ-09).
 *
 * Mirrors the report_templates tenancy model from 20260619190359: a NULL
 * organization_id marks a system-wide template shared by every tenant; an
 * integer marks a template that tenant owns and may edit or delete. Rows are
 * created from the seeded system library, duplicated from a system template,
 * authored from scratch, or captured from an existing policy_manager row
 * ("Save as template").
 *
 * name uniqueness is per-tenant, and the system rows share organization_id
 * NULL — a plain UNIQUE (organization_id, name) would let two system rows
 * carry the same name because NULL != NULL in Postgres. The unique index
 * therefore coalesces NULL to 0, the same trick the report-template slug
 * index avoids needing because its slugs are globally unique by construction.
 *
 * RLS mirrors 20260801133236's SHARED_ROW_TABLES treatment of
 * report_templates exactly: USING admits the shared (NULL org) rows plus the
 * caller's own, WITH CHECK stays strict so a tenant cannot write a shared
 * row. Behaviour today is unchanged (the app connects as the table owner,
 * which ignores RLS without FORCE), this only installs the net.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.policy_templates (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          description TEXT,
          content TEXT NOT NULL DEFAULT '',
          tags TEXT[] NOT NULL DEFAULT '{}',
          is_system_template BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_templates_org_name
          ON verifywise.policy_templates (COALESCE(organization_id, 0), name);
        CREATE INDEX IF NOT EXISTS idx_policy_templates_org
          ON verifywise.policy_templates(organization_id);
      `,
        { transaction: t },
      );

      // Same policy as report_templates in 20260801133236: USING admits the
      // cross-tenant shared rows (organization_id IS NULL), WITH CHECK does
      // not let a tenant write one.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.policy_templates ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.policy_templates;
        CREATE POLICY tenant_isolation ON verifywise.policy_templates
          USING (organization_id IS NULL
                 OR organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
      `,
        { transaction: t },
      );

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.policy_templates;
    `);
  },
};
