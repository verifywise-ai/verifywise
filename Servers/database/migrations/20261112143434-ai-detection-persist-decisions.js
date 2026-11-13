"use strict";

/**
 * AI Detection: decisions that survive rescans.
 *
 * Adds:
 *   - verifywise.ai_detection_governance_decisions: the latest governance
 *     status (reviewed, approved, flagged, suppressed, accepted risk) a user
 *     set for a finding, stored per organization + repository + finding
 *     identity (finding type, name and provider, compared case-insensitively).
 *     Scan completion copies a matching decision onto the new scan's finding,
 *     unless the finding's risk has risen since the decision was made.
 *   - verifywise.ai_detection_suggested_risk_actions: what a user did with an
 *     LLM-suggested risk on a scan (added to the risk register, with the
 *     created risk's id, or ignored, with the reason).
 *
 * Both tables are organization-scoped and carry the standard tenant_isolation
 * RLS policy.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const sql = (text) => queryInterface.sequelize.query(text, { transaction });

      await sql(`
        CREATE TABLE IF NOT EXISTS verifywise.ai_detection_governance_decisions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          repository_key VARCHAR(512) NOT NULL,
          finding_type VARCHAR(100) NOT NULL,
          finding_name_key VARCHAR(255) NOT NULL,
          provider_key VARCHAR(100) NOT NULL DEFAULT '',
          governance_status VARCHAR(20) NOT NULL
            CHECK (governance_status IN ('reviewed', 'approved', 'flagged', 'suppressed', 'accepted_risk')),
          risk_rank SMALLINT NOT NULL DEFAULT 0,
          source_scan_id INTEGER
            REFERENCES verifywise.ai_detection_scans(id) ON DELETE SET NULL,
          decided_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT ai_detection_governance_decisions_identity_unique
            UNIQUE (organization_id, repository_key, finding_type, finding_name_key, provider_key)
        );
      `);

      await sql(`
        CREATE INDEX IF NOT EXISTS idx_ai_detection_governance_decisions_org_repo
          ON verifywise.ai_detection_governance_decisions (organization_id, repository_key);
      `);

      // Backfill: keep the reviews already made. For each repository + finding
      // identity, the most recently updated status becomes the stored decision.
      await sql(`
        INSERT INTO verifywise.ai_detection_governance_decisions (
          organization_id, repository_key, finding_type, finding_name_key, provider_key,
          governance_status, risk_rank, source_scan_id, decided_by, decided_at
        )
        SELECT DISTINCT ON (
          f.organization_id,
          LOWER(s.repository_owner || '/' || s.repository_name),
          f.finding_type,
          LOWER(f.name),
          LOWER(COALESCE(f.provider, ''))
        )
          f.organization_id,
          LOWER(s.repository_owner || '/' || s.repository_name),
          f.finding_type,
          LOWER(f.name),
          LOWER(COALESCE(f.provider, '')),
          f.governance_status,
          GREATEST(
            CASE LOWER(COALESCE(f.risk_level, ''))
              WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 0 END,
            CASE LOWER(COALESCE(f.severity, ''))
              WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4 ELSE 0 END
          ),
          f.scan_id,
          u.id,
          COALESCE(f.governance_updated_at, f.created_at, NOW())
        FROM verifywise.ai_detection_findings f
        JOIN verifywise.ai_detection_scans s
          ON s.id = f.scan_id AND s.organization_id = f.organization_id
        LEFT JOIN verifywise.users u ON u.id = f.governance_updated_by
        WHERE f.governance_status IN ('reviewed', 'approved', 'flagged', 'suppressed', 'accepted_risk')
          AND s.repository_owner IS NOT NULL
          AND s.repository_name IS NOT NULL
        ORDER BY
          f.organization_id,
          LOWER(s.repository_owner || '/' || s.repository_name),
          f.finding_type,
          LOWER(f.name),
          LOWER(COALESCE(f.provider, '')),
          f.governance_updated_at DESC NULLS LAST,
          f.id DESC
        ON CONFLICT DO NOTHING;
      `);

      await sql(`
        CREATE TABLE IF NOT EXISTS verifywise.ai_detection_suggested_risk_actions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          scan_id INTEGER NOT NULL
            REFERENCES verifywise.ai_detection_scans(id) ON DELETE CASCADE,
          suggestion_key VARCHAR(255) NOT NULL,
          risk_name VARCHAR(500) NOT NULL,
          action VARCHAR(20) NOT NULL CHECK (action IN ('added', 'ignored')),
          risk_id INTEGER REFERENCES verifywise.risks(id) ON DELETE SET NULL,
          ignore_reason VARCHAR(50)
            CHECK (ignore_reason IS NULL OR ignore_reason IN ('already_added', 'not_real_risk')),
          acted_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          acted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT ai_detection_suggested_risk_actions_unique
            UNIQUE (organization_id, scan_id, suggestion_key)
        );
      `);

      await sql(`
        ALTER TABLE verifywise.ai_detection_governance_decisions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.ai_detection_governance_decisions;
        CREATE POLICY tenant_isolation ON verifywise.ai_detection_governance_decisions
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);

        ALTER TABLE verifywise.ai_detection_suggested_risk_actions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.ai_detection_suggested_risk_actions;
        CREATE POLICY tenant_isolation ON verifywise.ai_detection_suggested_risk_actions
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
      `);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.ai_detection_suggested_risk_actions;
      DROP TABLE IF EXISTS verifywise.ai_detection_governance_decisions;
    `);
  },
};
