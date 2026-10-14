"use strict";

/**
 * Org-scoped keyset reads of the audit ledger (export batches, list).
 *
 * A plain CREATE INDEX: it blocks ledger inserts while it builds, which is
 * brief for a ledger this size. CONCURRENTLY was considered and rejected:
 * migrations run in the container start path, where it would wait on every
 * older transaction (delaying startup), and a failed concurrent build leaves
 * an INVALID index that IF NOT EXISTS would then silently keep.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_ledger_org_id ON verifywise.audit_ledger (organization_id, id);`,
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.idx_audit_ledger_org_id;`,
    );
  },
};
