"use strict";

/**
 * Use case lifecycle (#5187).
 *
 * projects.status stays what it is (a project-management state). The lifecycle
 * lives in its own column so the two never fight:
 *
 *   in_review → planned → live → retired
 *
 * New columns on projects:
 *   - lifecycle_stage           VARCHAR + CHECK (not a Postgres enum, so AI apps
 *                               can reuse the same values without a shared type)
 *   - go_live_date              DATE the use case went live
 *   - retired_at                when it was retired
 *   - last_confirmed_at/_by     last "still live?" confirmation by a person
 *   - confirmation_reminded_at  last "still live?" email, so the daily sweep
 *                               emails once per period, not once per day
 *   - department                free text; there is no org-level department list
 *
 * Backfill, only where the meaning is unambiguous:
 *   - an open (Pending) approval request → in_review. Status 'Under review'
 *     alone is not enough: intake approval has always created use cases with
 *     that status after the review was done.
 *   - status 'Closed' → retired (retired_at stays NULL: the real date is unknown)
 *   - everything else → planned. 'Completed' is NOT mapped to live: it can mean
 *     "delivery finished" as easily as "in production", and a backfilled live
 *     row with no go-live date would be flagged stale and emailed on day one.
 *     Owners mark live in one click.
 *
 * lifecycle_org_settings holds the org-wide "still live?" interval (30/90/180
 * days, default 90). One row per org, lazily created; a missing row means the
 * default. Shared by every entity that has a lifecycle (use cases now, AI apps
 * next), so it is not named after use cases.
 */

const STAGES = ["in_review", "planned", "live", "retired"];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TYPE verifywise.enum_notification_type
           ADD VALUE IF NOT EXISTS 'lifecycle_confirmation_due';`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) NOT NULL DEFAULT 'planned',
           ADD COLUMN IF NOT EXISTS go_live_date DATE NULL,
           ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP WITH TIME ZONE NULL,
           ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMP WITH TIME ZONE NULL,
           ADD COLUMN IF NOT EXISTS last_confirmed_by INTEGER NULL
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS confirmation_reminded_at TIMESTAMP WITH TIME ZONE NULL,
           ADD COLUMN IF NOT EXISTS department VARCHAR(255) NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           DROP CONSTRAINT IF EXISTS projects_lifecycle_stage_check;
         ALTER TABLE verifywise.projects
           ADD CONSTRAINT projects_lifecycle_stage_check
           CHECK (lifecycle_stage IN (${STAGES.map((s) => `'${s}'`).join(", ")}));`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects p
            SET lifecycle_stage = CASE
              WHEN EXISTS (
                  SELECT 1 FROM verifywise.approval_requests ar
                   WHERE ar.organization_id = p.organization_id
                     AND ar.entity_type::text = 'use_case'
                     AND ar.entity_id = p.id
                     AND ar.status::text = 'Pending'
                ) THEN 'in_review'
              WHEN p.status::text = 'Closed' THEN 'retired'
              ELSE 'planned'
            END;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_projects_org_lifecycle_stage
           ON verifywise.projects (organization_id, lifecycle_stage);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.lifecycle_org_settings (
           organization_id INTEGER PRIMARY KEY
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           confirmation_interval_days INTEGER NOT NULL DEFAULT 90
             CHECK (confirmation_interval_days IN (30, 90, 180)),
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
           updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
         );`,
        { transaction },
      );

      // Same tenant_isolation policy as the other registry tables
      // (20260720100200). Inert while the app connects as the table owner.
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.lifecycle_org_settings ENABLE ROW LEVEL SECURITY;
         DROP POLICY IF EXISTS tenant_isolation ON verifywise.lifecycle_org_settings;
         CREATE POLICY tenant_isolation ON verifywise.lifecycle_org_settings
           USING (organization_id = current_setting('app.current_org', true)::int)
           WITH CHECK (organization_id = current_setting('app.current_org', true)::int);`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.lifecycle_org_settings CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.idx_projects_org_lifecycle_stage;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           DROP CONSTRAINT IF EXISTS projects_lifecycle_stage_check,
           DROP COLUMN IF EXISTS lifecycle_stage,
           DROP COLUMN IF EXISTS go_live_date,
           DROP COLUMN IF EXISTS retired_at,
           DROP COLUMN IF EXISTS last_confirmed_at,
           DROP COLUMN IF EXISTS last_confirmed_by,
           DROP COLUMN IF EXISTS confirmation_reminded_at,
           DROP COLUMN IF EXISTS department;`,
        { transaction },
      );
      // The 'lifecycle_confirmation_due' notification type stays: Postgres
      // cannot drop an enum value, and an unused value is harmless (same as
      // 'file_expiring' in 20260915161108).
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
