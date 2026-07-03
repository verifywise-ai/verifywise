"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * mrm_thresholds: the regulatory core. A threshold is defined per (model, metric),
 * optionally per segment/window. On each ingested point VerifyWise finds the
 * matching active threshold(s), computes pass/breach, and records an evaluation.
 *
 * `op` maps to the spec's comparison operators (>, >=, <, <=, outside):
 *   gt/gte/lt/lte compare `value_num`; `outside` uses the band [value_lo, value_hi].
 * Safe enum labels (gt/gte/lt/lte/outside) are used in place of symbols.
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
          CREATE TYPE verifywise.enum_mrm_threshold_op AS ENUM (
            'gt', 'gte', 'lt', 'lte', 'outside'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_threshold_severity AS ENUM (
            'warn', 'high', 'critical'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_breach_action AS ENUM (
            'notify', 'notify_flag_revalidation'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_thresholds (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          metric VARCHAR(100) NOT NULL,
          -- NULL segment = 'overall'; NULL window = any window.
          segment VARCHAR(100),
          window VARCHAR(50),
          op verifywise.enum_mrm_threshold_op NOT NULL,
          -- value_num is used by gt/gte/lt/lte; value_lo/value_hi form the 'outside' band.
          value_num DOUBLE PRECISION,
          value_lo DOUBLE PRECISION,
          value_hi DOUBLE PRECISION,
          severity verifywise.enum_mrm_threshold_severity NOT NULL DEFAULT 'warn',
          breach_action verifywise.enum_mrm_breach_action NOT NULL DEFAULT 'notify',
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          -- Guarantee a threshold is evaluatable: scalar ops need value_num; the
          -- 'outside' band needs a valid lo<hi pair. Blocks silently-broken rows
          -- (e.g. op='outside' with no bounds) from ever reaching the evaluator.
          CONSTRAINT chk_mrm_threshold_values CHECK (
            (op IN ('gt', 'gte', 'lt', 'lte') AND value_num IS NOT NULL)
            OR
            (op = 'outside' AND value_lo IS NOT NULL AND value_hi IS NOT NULL AND value_lo < value_hi)
          )
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_thresholds_org
          ON verifywise.mrm_thresholds(organization_id);
        -- Evaluation lookup: given a point, find matching thresholds for (org, model, metric).
        CREATE INDEX IF NOT EXISTS idx_mrm_thresholds_org_model_metric
          ON verifywise.mrm_thresholds(organization_id, model_inventory_id, metric);
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
        "DROP TABLE IF EXISTS verifywise.mrm_thresholds CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_breach_action;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_threshold_severity;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_threshold_op;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
