"use strict";

/**
 * Approval workflow SLA, escalation, and risk-based auto-approval: columns.
 *
 * - approval_workflow_steps / approval_request_steps gain sla_hours
 *   (wall-clock hours the step may stay active) and escalation_user_id
 *   (designated user notified once when the step is overdue). Request steps
 *   snapshot both at creation so in-flight requests are unaffected by later
 *   workflow edits. ON DELETE SET NULL: a deleted escalation target simply
 *   disables escalation instead of blocking user deletion.
 * - approval_request_steps also gains due_at / escalated_at (the sweep's
 *   idempotency marker) and step_details, which the Sequelize model and
 *   interface already declared but no migration ever created.
 * - approval_workflows gains auto_approve_max_risk: the highest AI risk
 *   classification (ordered Minimal < Limited < High < Prohibited) a use_case
 *   request may carry and still be auto-approved. GPAI / General Risk /
 *   missing values are never auto-approved; the CHECK confines the column to
 *   the four orderable values.
 * - approval_requests gains auto_approved_at / auto_approval_risk_level so a
 *   system-made approval stays auditable without a users-table actor.
 *
 * New timestamps are TIMESTAMP WITH TIME ZONE so sweep comparisons against
 * NOW() are timezone-safe. Tables absent on an install are skipped.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_workflows') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_workflows
               ADD COLUMN IF NOT EXISTS auto_approve_max_risk VARCHAR(50);
             IF NOT EXISTS (
               SELECT 1 FROM pg_constraint
               WHERE conname = 'approval_workflows_auto_approve_max_risk_check'
             ) THEN
               ALTER TABLE verifywise.approval_workflows
                 ADD CONSTRAINT approval_workflows_auto_approve_max_risk_check
                 CHECK (auto_approve_max_risk IN ('Minimal risk', 'Limited risk', 'High risk', 'Prohibited'));
             END IF;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_workflow_steps') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_workflow_steps
               ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
               ADD COLUMN IF NOT EXISTS escalation_user_id INTEGER
                 REFERENCES verifywise.users(id) ON DELETE SET NULL;
             IF NOT EXISTS (
               SELECT 1 FROM pg_constraint
               WHERE conname = 'approval_workflow_steps_sla_hours_check'
             ) THEN
               ALTER TABLE verifywise.approval_workflow_steps
                 ADD CONSTRAINT approval_workflow_steps_sla_hours_check
                 CHECK (sla_hours > 0);
             END IF;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_request_steps') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_request_steps
               ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
               ADD COLUMN IF NOT EXISTS escalation_user_id INTEGER
                 REFERENCES verifywise.users(id) ON DELETE SET NULL,
               ADD COLUMN IF NOT EXISTS due_at TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS step_details JSONB;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_requests') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_requests
               ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMP WITH TIME ZONE,
               ADD COLUMN IF NOT EXISTS auto_approval_risk_level VARCHAR(50);
           END IF;
         END $$;`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_workflows') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_workflows
               DROP CONSTRAINT IF EXISTS approval_workflows_auto_approve_max_risk_check,
               DROP COLUMN IF EXISTS auto_approve_max_risk;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_workflow_steps') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_workflow_steps
               DROP CONSTRAINT IF EXISTS approval_workflow_steps_sla_hours_check,
               DROP COLUMN IF EXISTS sla_hours,
               DROP COLUMN IF EXISTS escalation_user_id;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_request_steps') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_request_steps
               DROP COLUMN IF EXISTS sla_hours,
               DROP COLUMN IF EXISTS escalation_user_id,
               DROP COLUMN IF EXISTS due_at,
               DROP COLUMN IF EXISTS escalated_at,
               DROP COLUMN IF EXISTS step_details;
           END IF;
         END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DO $$
         BEGIN
           IF to_regclass('verifywise.approval_requests') IS NOT NULL THEN
             ALTER TABLE verifywise.approval_requests
               DROP COLUMN IF EXISTS auto_approved_at,
               DROP COLUMN IF EXISTS auto_approval_risk_level;
           END IF;
         END $$;`,
        { transaction },
      );
    });
  },
};
