"use strict";

/**
 * Phase 6 — Compliance Autopilot (issue 3813)
 *
 * Creates ai_workflow_runs: one row per workflow execution. The workflow
 * engine (services/workflows/engine.ts) persists every run's lifecycle here
 * (pending -> running -> awaiting_approval -> completed/failed/cancelled),
 * the current step pointer, the trigger payload, the accumulated per-step
 * results, and a link to the approval a paused run is waiting on.
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.ai_workflow_runs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          workflow_type VARCHAR(100) NOT NULL,
          trigger_name VARCHAR(255),
          trigger_payload JSONB NOT NULL DEFAULT '{}',
          state VARCHAR(50) NOT NULL DEFAULT 'pending',
          current_step INTEGER NOT NULL DEFAULT 0,
          results JSONB NOT NULL DEFAULT '[]',
          error TEXT,
          awaiting_approval_id UUID
            REFERENCES verifywise.ai_action_approvals(id) ON DELETE SET NULL,
          started_by INTEGER REFERENCES verifywise.users(id),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_org
           ON verifywise.ai_workflow_runs(organization_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_state
           ON verifywise.ai_workflow_runs(state);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_awaiting_approval
           ON verifywise.ai_workflow_runs(awaiting_approval_id);`,
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
        `DROP TABLE IF EXISTS verifywise.ai_workflow_runs;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
