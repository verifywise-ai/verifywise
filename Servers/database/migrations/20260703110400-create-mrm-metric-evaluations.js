"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * mrm_metric_evaluations: the immutable evaluation audit. One row per
 * (ingested point x matching threshold) evaluation. Append-only.
 *
 * It references the ingested point (metric_id) and the threshold (threshold_id),
 * AND stores a `threshold_snapshot` JSONB of the threshold's op/value/severity
 * at evaluation time — so a later threshold change never rewrites history.
 *
 * `status`:
 *   ok            = evaluated, within threshold
 *   warn          = warn-severity breach
 *   breach        = high/critical breach
 *   no_threshold  = point stored with no matching active threshold (first-class state)
 *
 * When status = no_threshold, threshold_id is NULL. If a threshold is later
 * deleted, threshold_id is SET NULL but the snapshot preserves what was evaluated.
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
          CREATE TYPE verifywise.enum_mrm_eval_status AS ENUM (
            'ok', 'warn', 'breach', 'no_threshold'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_metric_evaluations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          metric_id INTEGER NOT NULL REFERENCES verifywise.mrm_metrics(id) ON DELETE CASCADE,
          -- NULL = no_threshold case, or the threshold was later deleted (snapshot preserves it).
          threshold_id INTEGER REFERENCES verifywise.mrm_thresholds(id) ON DELETE SET NULL,
          status verifywise.enum_mrm_eval_status NOT NULL,
          -- Frozen copy of the threshold (op/value/severity) at evaluation time.
          threshold_snapshot JSONB,
          evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_metric_evaluations_org
          ON verifywise.mrm_metric_evaluations(organization_id);
        -- History read path: all evaluations for a given ingested point.
        CREATE INDEX IF NOT EXISTS idx_mrm_metric_evaluations_org_metric
          ON verifywise.mrm_metric_evaluations(organization_id, metric_id);
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
        "DROP TABLE IF EXISTS verifywise.mrm_metric_evaluations CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS verifywise.enum_mrm_eval_status;", {
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
