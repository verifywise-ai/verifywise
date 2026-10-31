"use strict";

/**
 * AI apps lifecycle (#5193): the same in_review → planned → live → retired
 * lifecycle, dates and "still live?" check as use cases (#5187), sharing the
 * org interval in lifecycle_org_settings.
 *
 * ai_apps.status stays an approval state (draft, under_review, approved,
 * restricted, banned). Departments already live in ai_apps_departments.
 *
 * Backfill, only where the meaning is unambiguous:
 *   - status under_review → in_review
 *   - status banned → retired (a banned app is not in use; retired_at stays
 *     NULL because the real date is unknown)
 *   - everything else → planned. "approved" is not mapped to live: approval
 *     says an app may be used, not that it is, and a backfilled live row with
 *     no go-live date would be flagged stale on the first run.
 *
 * Also creates ai_app_change_history (generic change-history shape) so the
 * lifecycle actions are recorded, and adds 'ai_app' to the notification
 * entity type for the "still live?" reminder.
 */

const STAGES = ["in_review", "planned", "live", "retired"];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TYPE verifywise.enum_notification_entity_type ADD VALUE IF NOT EXISTS 'ai_app';`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ai_apps
           ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) NOT NULL DEFAULT 'planned',
           ADD COLUMN IF NOT EXISTS go_live_date DATE NULL,
           ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP WITH TIME ZONE NULL,
           ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMP WITH TIME ZONE NULL,
           ADD COLUMN IF NOT EXISTS last_confirmed_by INTEGER NULL
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS confirmation_reminded_at TIMESTAMP WITH TIME ZONE NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ai_apps DROP CONSTRAINT IF EXISTS ai_apps_lifecycle_stage_check;
         ALTER TABLE verifywise.ai_apps
           ADD CONSTRAINT ai_apps_lifecycle_stage_check
           CHECK (lifecycle_stage IN (${STAGES.map((s) => `'${s}'`).join(", ")}));`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE verifywise.ai_apps
            SET lifecycle_stage = CASE status
              WHEN 'under_review' THEN 'in_review'
              WHEN 'banned' THEN 'retired'
              ELSE 'planned'
            END;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_apps_org_lifecycle_stage
           ON verifywise.ai_apps (organization_id, lifecycle_stage);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ai_app_change_history (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           ai_app_id INTEGER NOT NULL REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
           field_name VARCHAR(255),
           old_value TEXT,
           new_value TEXT,
           action VARCHAR(50),
           changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
           changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
           created_at TIMESTAMP NOT NULL DEFAULT NOW(),
           changed_by_system BOOLEAN NOT NULL DEFAULT FALSE
         );
         CREATE INDEX IF NOT EXISTS idx_ai_app_change_history_org_changed
           ON verifywise.ai_app_change_history (organization_id, changed_at);
         CREATE INDEX IF NOT EXISTS idx_ai_app_change_history_app
           ON verifywise.ai_app_change_history (ai_app_id);`,
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
        "DROP TABLE IF EXISTS verifywise.ai_app_change_history;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.idx_ai_apps_org_lifecycle_stage;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ai_apps
           DROP CONSTRAINT IF EXISTS ai_apps_lifecycle_stage_check,
           DROP COLUMN IF EXISTS lifecycle_stage,
           DROP COLUMN IF EXISTS go_live_date,
           DROP COLUMN IF EXISTS retired_at,
           DROP COLUMN IF EXISTS last_confirmed_at,
           DROP COLUMN IF EXISTS last_confirmed_by,
           DROP COLUMN IF EXISTS confirmation_reminded_at;`,
        { transaction },
      );
      // 'ai_app' stays in enum_notification_entity_type: Postgres cannot drop
      // an enum value, and an unused value is harmless.
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
