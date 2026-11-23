"use strict";

/**
 * Indexes behind the foreign keys of the research tables.
 *
 * Postgres runs the action of a foreign key (CASCADE, SET NULL) once for each deleted parent row,
 * and without an index on the child column each run scans the whole table. These tables hold the
 * rows of every tenant, so deleting a vendor, a vendor risk or an organization would cost time in
 * proportion to everybody's rows, not only the deleting tenant's:
 *
 * - vendor_risk_findings.run_id: deleting a run (cascaded from its vendor or organization) deletes
 *   its findings.
 * - vendor_risk_findings.vendor_id: deleting a vendor deletes its findings. The indexes of the
 *   first migration all lead with organization_id, so a lookup on vendor_id alone cannot use them.
 * - vendor_risk_findings.accepted_vendor_risk_id: deleting a vendor risk sets the column to NULL.
 *   Most findings are never accepted, so only the rows that point at a risk are indexed.
 * - vendor_research_runs.vendor_id: deleting a vendor deletes its runs. The three indexes of the
 *   first migration (the unique index of the active run, the vendor-and-created index and the
 *   organization-and-created index) all lead with organization_id too, so that delete cannot use
 *   any of them.
 *
 * vendor_research_runs.requested_by and vendor_risk_findings.decided_by get none: deleting a user
 * is rare.
 *
 * Its own migration, because the first one may have run on a database already. IF NOT EXISTS keeps
 * it safe to run twice.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `CREATE INDEX IF NOT EXISTS idx_vendor_risk_findings_run
           ON verifywise.vendor_risk_findings (run_id);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_risk_findings_vendor
           ON verifywise.vendor_risk_findings (vendor_id);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_risk_findings_accepted_risk
           ON verifywise.vendor_risk_findings (accepted_vendor_risk_id)
           WHERE accepted_vendor_risk_id IS NOT NULL;`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_runs_vendor
           ON verifywise.vendor_research_runs (vendor_id);`,
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
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const name of [
        "idx_vendor_research_runs_vendor",
        "idx_vendor_risk_findings_accepted_risk",
        "idx_vendor_risk_findings_vendor",
        "idx_vendor_risk_findings_run",
      ]) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS verifywise.${name};`, {
          transaction,
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
