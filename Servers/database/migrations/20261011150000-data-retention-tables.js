"use strict";

/**
 * Data retention: per-organization settings, a run log, and the append-only
 * checkpoints the audit ledger prune writes before it deletes anything.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.data_retention_settings (
          organization_id INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          audit_retention_months INTEGER NULL CHECK (audit_retention_months IN (12, 24, 36, 60, 84, 120)),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by INTEGER NULL REFERENCES verifywise.users(id) ON DELETE SET NULL
        );
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.data_retention_runs (
          id BIGSERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          record_type VARCHAR(40) NOT NULL CHECK (record_type IN (
            'audit_records', 'ai_gateway_guardrail_logs', 'ai_gateway_spend_logs', 'mrm_metrics',
            'shadow_ai_events', 'shadow_ai_daily_rollups', 'shadow_ai_alert_history')),
          ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          cutoff TIMESTAMPTZ NULL,
          deleted_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'capped', 'failed')),
          error TEXT NULL
        );
      `);
      await run(`
        CREATE INDEX IF NOT EXISTS idx_data_retention_runs_org_type_ran
          ON verifywise.data_retention_runs (organization_id, record_type, ran_at DESC);
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.audit_ledger_retention_checkpoints (
          id BIGSERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          pruned_through_id BIGINT NOT NULL,
          anchor_hash CHAR(64) NOT NULL,
          cutoff TIMESTAMPTZ NOT NULL,
          rows_deleted INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_txid BIGINT NOT NULL DEFAULT txid_current()
        );
      `);
      await run(`
        CREATE INDEX IF NOT EXISTS idx_ledger_checkpoints_org_through
          ON verifywise.audit_ledger_retention_checkpoints (organization_id, pruned_through_id DESC);
      `);

      await run(`
        CREATE OR REPLACE FUNCTION verifywise.ledger_checkpoint_append_only()
        RETURNS trigger LANGUAGE plpgsql AS $func$
        BEGIN
          IF TG_OP = 'DELETE'
             AND NOT EXISTS (SELECT 1 FROM verifywise.organizations WHERE id = OLD.organization_id) THEN
            RETURN OLD;  -- organization cascade
          END IF;
          RAISE EXCEPTION 'audit_ledger_retention_checkpoints is append-only';
        END;
        $func$;
      `);
      await run(`
        CREATE TRIGGER trg_ledger_checkpoint_no_update
          BEFORE UPDATE ON verifywise.audit_ledger_retention_checkpoints
          FOR EACH ROW EXECUTE FUNCTION verifywise.ledger_checkpoint_append_only();
      `);
      await run(`
        CREATE TRIGGER trg_ledger_checkpoint_no_delete
          BEFORE DELETE ON verifywise.audit_ledger_retention_checkpoints
          FOR EACH ROW EXECUTE FUNCTION verifywise.ledger_checkpoint_append_only();
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      // A checkpoint is the only record that an organization's oldest ledger
      // rows were pruned on purpose, and verifyChain starts from its anchor.
      // Dropping the table after a prune would lose that record and make every
      // pruned ledger fail verification, so refuse to roll back once any exist.
      const [[{ present }]] = await run(
        `SELECT to_regclass('verifywise.audit_ledger_retention_checkpoints') IS NOT NULL AS present;`,
      );
      const [[{ has_rows: hasRows }]] = present
        ? await run(
            `SELECT EXISTS (SELECT 1 FROM verifywise.audit_ledger_retention_checkpoints) AS has_rows;`,
          )
        : [[{ has_rows: false }]];
      if (hasRows) {
        throw new Error(
          "Cannot roll back data retention tables: audit_ledger_retention_checkpoints has rows. " +
            "They record audit ledger prunes; dropping them would make pruned ledgers fail verification.",
        );
      }
      await run(
        `DROP TRIGGER IF EXISTS trg_ledger_checkpoint_no_delete ON verifywise.audit_ledger_retention_checkpoints;`,
      );
      await run(
        `DROP TRIGGER IF EXISTS trg_ledger_checkpoint_no_update ON verifywise.audit_ledger_retention_checkpoints;`,
      );
      await run(`DROP FUNCTION IF EXISTS verifywise.ledger_checkpoint_append_only();`);
      await run(`DROP TABLE IF EXISTS verifywise.audit_ledger_retention_checkpoints;`);
      await run(`DROP TABLE IF EXISTS verifywise.data_retention_runs;`);
      await run(`DROP TABLE IF EXISTS verifywise.data_retention_settings;`);
    });
  },
};
