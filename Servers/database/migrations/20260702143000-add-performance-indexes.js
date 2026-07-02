"use strict";
// Adds indexes for the highest-impact query paths identified in the
// performance audit: file version history, full-text search, policy list/
// due-soon queries, AI detection findings by scan, and audit ledger filters.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_files_org_file_group
        ON verifywise.files (organization_id, file_group_id);

      CREATE INDEX IF NOT EXISTS idx_files_content_search
        ON verifywise.files USING GIN (content_search);

      CREATE INDEX IF NOT EXISTS idx_policy_manager_org
        ON verifywise.policy_manager (organization_id);

      CREATE INDEX IF NOT EXISTS idx_policy_manager_org_next_review
        ON verifywise.policy_manager (organization_id, next_review_date)
        WHERE next_review_date IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_ai_detection_findings_scan
        ON verifywise.ai_detection_findings (organization_id, scan_id);

      CREATE INDEX IF NOT EXISTS idx_audit_ledger_org_entity_entry
        ON verifywise.audit_ledger (organization_id, entity_type, entry_type, id DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_files_org_file_group;
      DROP INDEX IF EXISTS verifywise.idx_files_content_search;
      DROP INDEX IF EXISTS verifywise.idx_policy_manager_org;
      DROP INDEX IF EXISTS verifywise.idx_policy_manager_org_next_review;
      DROP INDEX IF EXISTS verifywise.idx_ai_detection_findings_scan;
      DROP INDEX IF EXISTS verifywise.idx_audit_ledger_org_entity_entry;
    `);
  },
};
