"use strict";

/**
 * Evidence hub change history (issue #4915).
 *
 * The change-history config defined `evidence_hub` (table
 * evidence_hub_change_history) but no migration ever created the table and
 * nothing wrote to it — the entry was dead. Evidence hub edits are real
 * (updateEvidenceById), so this migration creates the table with the same
 * generic shape as use_case_change_history, plus the changed_by_system column
 * 20261005130617 adds to the other history tables (idempotent there), and the
 * (organization_id, changed_at) index the retention prune uses.
 *
 * The genuinely dead entries `project` (superseded by use_case) and
 * `framework` (no production edit endpoint; its table also never existed) are
 * removed from changeHistory.config.ts instead.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.evidence_hub_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          evidence_hub_id INTEGER NOT NULL REFERENCES verifywise.evidence_hub(id) ON DELETE CASCADE,
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          action VARCHAR(50),
          changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          changed_by_system BOOLEAN NOT NULL DEFAULT FALSE
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_evidence_hub_change_history_org_changed
          ON verifywise.evidence_hub_change_history (organization_id, changed_at);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.evidence_hub_change_history;`,
        { transaction },
      );
    });
  },
};
