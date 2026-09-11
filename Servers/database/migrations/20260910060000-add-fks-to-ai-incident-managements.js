"use strict";

/**
 * Issue #4583 — Link AI incidents to the affected system and owner via FK.
 *
 * `ai_incident_managements` captured the affected system (`ai_project`,
 * `model_system_version`) and people (`reporter`, `approved_by`) as free
 * text, with no relational integrity. This migration adds three nullable
 * foreign keys so an incident can be linked to a model inventory entry
 * and/or a project (use case), and assigned to a user:
 *
 *   model_inventory_id INTEGER REFERENCES verifywise.model_inventories(id)
 *   project_id         INTEGER REFERENCES verifywise.projects(id)
 *   assignee_id        INTEGER REFERENCES verifywise.users(id)
 *
 * Design decisions (ADR-1, docs/plans/MULTI_AGENT_PLAN_issue-4583.md):
 * - ON DELETE SET NULL (not CASCADE): incidents are EU AI Act Art. 73
 *   compliance records; deleting a model inventory row or a user must not
 *   silently erase incident history. Precedent in the same base migration:
 *   model_risks.owner ... ON DELETE SET NULL.
 * - All columns are NULLABLE: existing incidents remain valid, no forced
 *   backfill. Free-text columns are kept for backward compatibility; the
 *   FKs become the source of truth going forward.
 *
 * Runs after 20260226234302-tenant-tables.js (which creates the table), so
 * it applies cleanly on a fresh database and as an upgrade.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      ALTER TABLE verifywise.ai_incident_managements
        ADD COLUMN model_inventory_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE SET NULL,
        ADD COLUMN project_id INTEGER REFERENCES verifywise.projects(id) ON DELETE SET NULL,
        ADD COLUMN assignee_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL;
      `,
    );

    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_incidents_model_inventory
        ON verifywise.ai_incident_managements (organization_id, model_inventory_id);`,
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_incidents_project
        ON verifywise.ai_incident_managements (organization_id, project_id);`,
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_incidents_assignee
        ON verifywise.ai_incident_managements (organization_id, assignee_id);`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.idx_ai_incidents_assignee;`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.idx_ai_incidents_project;`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.idx_ai_incidents_model_inventory;`,
    );
    await queryInterface.sequelize.query(
      `
      ALTER TABLE verifywise.ai_incident_managements
        DROP COLUMN IF EXISTS assignee_id,
        DROP COLUMN IF EXISTS project_id,
        DROP COLUMN IF EXISTS model_inventory_id;
      `,
    );
  },
};
