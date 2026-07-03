"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * mrm_metrics: the ingested metric time-series. Append-only / immutable — a
 * corrected value is a NEW point (its own `at` / received_at), never an
 * overwrite, so the audit trail shows what was known when.
 *
 * `at`          = when the metric pertains to (supports honest backfill)
 * `received_at` = when VerifyWise received the push
 * `segment`     = per-segment monitoring; defaults to 'overall'
 * `context`     = arbitrary caller metadata (sample size, source job); never evaluated
 *
 * Idempotency: UNIQUE (organization_id, model_inventory_id, metric, segment, window, at_bucket)
 * where at_bucket = date_trunc('second', at).
 * A re-POST of the same logical point collides here — making a customer's retry-safe
 * cron trivial and preventing double-counting a breach. `window` and `segment` are
 * NOT NULL with concrete defaults ('' / 'overall') so the dedup is guaranteed at the
 * DB level (NULLs are treated as DISTINCT in a Postgres UNIQUE, which would otherwise
 * let window-less retries slip through).
 *
 * Tenant-scoped by organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_metrics (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          metric VARCHAR(100) NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          -- When the metric pertains to (not when it was sent). Raw value kept for display.
          at TIMESTAMP WITH TIME ZONE NOT NULL,
          -- Idempotency is keyed on the second-truncated timestamp, not the raw at value:
          -- otherwise sub-second jitter between an initial send and a retry (one carries
          -- microseconds, one does not) would defeat dedup. Monitoring cadence is never
          -- sub-second, so second-granularity is the correct logical-point identity.
          at_bucket TIMESTAMP WITH TIME ZONE GENERATED ALWAYS AS (date_trunc('second', at)) STORED,
          -- NOT NULL with an empty-string sentinel: Postgres treats NULL as DISTINCT in a
          -- UNIQUE, which would break idempotency for the (common) window-less point. A
          -- concrete default guarantees dedup at the DB level, not just in app code.
          window VARCHAR(50) NOT NULL DEFAULT '',
          segment VARCHAR(100) NOT NULL DEFAULT 'overall',
          context JSONB DEFAULT '{}'::jsonb,
          -- Which token wrote this point (audit). SET NULL if the token is later hard-deleted.
          ingestion_token_id INTEGER REFERENCES verifywise.mrm_ingestion_tokens(id) ON DELETE SET NULL,
          received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          -- Idempotency / dedup key (§5). Re-POST of the same logical point collides here.
          UNIQUE (organization_id, model_inventory_id, metric, segment, window, at_bucket)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_metrics_org
          ON verifywise.mrm_metrics(organization_id);
        -- Time-series read path: latest values / trend for (org, model, metric) over time.
        CREATE INDEX IF NOT EXISTS idx_mrm_metrics_org_model_metric_at
          ON verifywise.mrm_metrics(organization_id, model_inventory_id, metric, at);
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
      await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.mrm_metrics CASCADE;", {
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
