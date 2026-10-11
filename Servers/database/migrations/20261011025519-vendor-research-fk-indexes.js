"use strict";

/**
 * Indexes behind the foreign keys of vendor_risk_findings.
 *
 * Postgres runs the action of a foreign key (CASCADE, SET NULL) once for each deleted parent row,
 * and without an index on the child column each run scans the whole table. This table holds the
 * findings of every tenant, so deleting a vendor, a vendor risk or an organization would cost time
 * in proportion to everybody's findings, not only the deleting tenant's:
 *
 * - run_id: deleting a run (cascaded from its vendor or organization) deletes its findings.
 * - vendor_id: deleting a vendor deletes its findings. The indexes of the first migration all lead
 *   with organization_id, so a lookup on vendor_id alone cannot use them.
 * - accepted_vendor_risk_id: deleting a vendor risk sets the column to NULL. Most findings are
 *   never accepted, so only the rows that point at a risk are indexed.
 *
 * vendor_research_runs already has an index that starts with vendor_id, and decided_by and
 * requested_by get none: deleting a user is rare.
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
