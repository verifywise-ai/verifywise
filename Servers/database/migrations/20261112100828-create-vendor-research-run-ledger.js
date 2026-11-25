"use strict";

/**
 * The ledger of the daily research run cap: one row per research run that started, kept per
 * organization and not per vendor.
 *
 * The daily cap (VENDOR_RESEARCH_DAILY_RUN_CAP) counted rows of vendor_research_runs, and those
 * rows go with their vendor (ON DELETE CASCADE): deleting a vendor took its runs out of the count,
 * also a run that had searched and called a model, and one still running keeps spending until it
 * ends. The research data itself must still go with the vendor, so the spend is kept here instead.
 * A row holds the organization, the id of the run and when the run was created, and nothing of the
 * vendor: no vendor id, no name. run_id has no foreign key on purpose, so that the row outlives the
 * run. The row goes with the organization.
 *
 * markRunRunningQuery (utils/vendorResearch.utils.ts) writes a row in the statement that starts the
 * run, and drops the organization's rows older than seven days, a bounded number at a time.
 * countRunsSinceQuery counts the rows whose run no longer exists on top of the runs that count.
 *
 * The backfill adds a row for every run of the last 48 hours that started, so the runs of a vendor
 * that is deleted right after the deploy still count. The table takes the tenant_isolation policy
 * of the other vendor research tables (see 20261111223040).
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS verifywise.vendor_research_run_ledger (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          run_id INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );`,
        `CREATE INDEX IF NOT EXISTS vendor_research_run_ledger_org_created_idx
           ON verifywise.vendor_research_run_ledger (organization_id, created_at);`,
        `CREATE UNIQUE INDEX IF NOT EXISTS vendor_research_run_ledger_run_uniq
           ON verifywise.vendor_research_run_ledger (run_id);`,
        `ALTER TABLE verifywise.vendor_research_run_ledger ENABLE ROW LEVEL SECURITY;`,
        `DROP POLICY IF EXISTS tenant_isolation ON verifywise.vendor_research_run_ledger;`,
        `CREATE POLICY tenant_isolation ON verifywise.vendor_research_run_ledger
           USING (organization_id = current_setting('app.current_org', true)::int)
           WITH CHECK (organization_id = current_setting('app.current_org', true)::int);`,
        `INSERT INTO verifywise.vendor_research_run_ledger (organization_id, run_id, created_at)
           SELECT organization_id, id, created_at FROM verifywise.vendor_research_runs
            WHERE started_at IS NOT NULL AND created_at >= NOW() - INTERVAL '48 hours'
         ON CONFLICT (run_id) DO NOTHING;`,
      ];
      for (const statement of statements) {
        await queryInterface.sequelize.query(statement, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.vendor_research_run_ledger;`,
    );
  },
};
