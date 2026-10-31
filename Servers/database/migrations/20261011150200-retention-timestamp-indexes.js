"use strict";

/**
 * Org-scoped timestamp indexes so the retention job's "oldest rows first"
 * deletes and cutoff counts do not scan whole tables.
 *
 * Plain CREATE INDEX: it blocks writes while it builds, which is brief at
 * these sizes. CONCURRENTLY was considered and rejected: migrations run in the
 * container start path, where it would wait on every older transaction
 * (delaying startup), and a failed concurrent build leaves an INVALID index
 * that IF NOT EXISTS would then silently keep.
 *
 * Each table is skipped when it does not exist in this deployment.
 */
// Table and column names interpolated into the SQL below come only from this hard-coded list.
const TARGETS = [
  ...[
    "vendor",
    "vendor_risk",
    "project_risk",
    "policy",
    "incident",
    "use_case",
    "model_inventory",
    "model_risk",
    "file",
    "task",
    "training",
  ].map((prefix) => ({ table: `${prefix}_change_history`, col: "changed_at" })),
  { table: "dataset_change_histories", col: "changed_at" },
  { table: "fria_change_history", col: "changed_at" },
  { table: "project_change_history", col: "changed_at" },
  { table: "framework_change_history", col: "changed_at" },
  { table: "evidence_hub_change_history", col: "changed_at" },
  { table: "model_lifecycle_change_history", col: "created_at" },
  { table: "event_logs", col: "timestamp" },
  { table: "file_access_logs", col: "access_date" },
  { table: "audit_ledger", col: "occurred_at" },
];

module.exports = {
  async up(queryInterface) {
    for (const { table, col } of TARGETS) {
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF to_regclass('verifywise.${table}') IS NOT NULL THEN
            CREATE INDEX IF NOT EXISTS idx_${table}_org_${col}
              ON verifywise.${table} (organization_id, ${col});
          END IF;
        END $$;
      `);
    }
  },
  async down(queryInterface) {
    for (const { table, col } of TARGETS) {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_${table}_org_${col};`,
      );
    }
  },
};
