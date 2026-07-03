"use strict";

/**
 * MRM (Model Risk Management) — Branch 3 (revalidation triggers)
 *
 * mrm_revalidation_events: the immutable audit log of EVERY revalidation
 * trigger firing. Append-only. One row per firing, including no-ops where a
 * revalidation was already open for the model (created_validation = false).
 *
 * The 4 trigger sources (breach, material_change, tier_increase, scheduled) all
 * converge on one task-creation path. Whether that path opened a new validation
 * task or annotated an already-open one, the firing is recorded here so
 * examiners can see the full trigger history — not just the surviving task.
 *
 * `resulting_validation_id` points at the mrm_validations row the firing opened
 * (or annotated); it is NULL when the firing no-op'd and no task is associated.
 * ON DELETE SET NULL preserves the audit row if that validation is later removed.
 *
 * `source_ref` (JSONB) carries optional audit context — the breach evaluation
 * id, the change record, the old/new tier, etc.
 *
 * Tenant-scoped by organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_revalidation_trigger_source AS ENUM (
            'breach', 'material_change', 'tier_increase', 'scheduled'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_revalidation_events (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          trigger_source verifywise.enum_mrm_revalidation_trigger_source NOT NULL,
          -- Human-readable: what fired it (e.g. PSI breached 0.20 threshold, re-tiered 2 to 1).
          reason TEXT,
          -- The validation task this firing opened or annotated; NULL if it no-op'd.
          -- SET NULL keeps the audit row if the task is later removed.
          resulting_validation_id INTEGER REFERENCES verifywise.mrm_validations(id) ON DELETE SET NULL,
          -- true = opened a new task; false = no-op / annotated an already-open task.
          created_validation BOOLEAN NOT NULL DEFAULT false,
          -- Optional audit context (breach evaluation id, change record, old/new tier).
          source_ref JSONB,
          fired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_revalidation_events_org
          ON verifywise.mrm_revalidation_events(organization_id);
        -- Per-model event history read path (org-scoped, newest first).
        CREATE INDEX IF NOT EXISTS idx_mrm_revalidation_events_org_model_fired
          ON verifywise.mrm_revalidation_events(organization_id, model_inventory_id, fired_at);
      `,
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
        "DROP TABLE IF EXISTS verifywise.mrm_revalidation_events CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_revalidation_trigger_source;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
