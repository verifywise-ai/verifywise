"use strict";

/**
 * Vendor research agent: one row per research run on a vendor, and one row per
 * risk finding that a run produced. A finding is a candidate for the vendor risk
 * register and stays "pending" until a person accepts or dismisses it.
 *
 * Both tables are tenant-scoped. Deleting the organization or the vendor deletes
 * its runs and findings; deleting a run deletes its findings.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS verifywise.vendor_research_runs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
          trigger_type VARCHAR(10) NOT NULL CHECK (trigger_type IN ('auto', 'manual')),
          status VARCHAR(10) NOT NULL DEFAULT 'queued'
            CHECK (status IN ('queued', 'running', 'completed', 'failed')),
          categories TEXT[] NOT NULL DEFAULT '{}',
          category_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
          evidence JSONB,
          search_provider VARCHAR(255),
          model VARCHAR(255),
          prompt_version VARCHAR(255),
          searches_used INTEGER NOT NULL DEFAULT 0,
          duplicates_dropped INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          requested_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ
        );`,
        // Two clicks, one run: a vendor has at most one queued or running run.
        `CREATE UNIQUE INDEX IF NOT EXISTS vendor_research_runs_active_uniq
           ON verifywise.vendor_research_runs (organization_id, vendor_id)
           WHERE status IN ('queued', 'running');`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_runs_vendor_created
           ON verifywise.vendor_research_runs (organization_id, vendor_id, created_at DESC);`,
        // The daily run cap counts an organization's runs since a point in time.
        `CREATE INDEX IF NOT EXISTS idx_vendor_research_runs_org_created
           ON verifywise.vendor_research_runs (organization_id, created_at);`,

        `CREATE TABLE IF NOT EXISTS verifywise.vendor_risk_findings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
          run_id INTEGER NOT NULL REFERENCES verifywise.vendor_research_runs(id) ON DELETE CASCADE,
          category VARCHAR(30) NOT NULL
            CHECK (category IN ('security_incidents', 'certifications', 'legal_regulatory', 'ai_specific')),
          risk_description TEXT NOT NULL,
          impact_description TEXT NOT NULL,
          action_plan TEXT NOT NULL,
          likelihood verifywise.enum_vendorrisks_likelihood NOT NULL,
          risk_severity verifywise.enum_vendorrisks_risk_severity NOT NULL,
          risk_level VARCHAR(255) NOT NULL,
          confidence VARCHAR(10) NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
          sources JSONB NOT NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'accepted', 'dismissed')),
          dismissed_reason VARCHAR(20)
            CHECK (dismissed_reason IN ('not_applicable', 'already_covered', 'inaccurate', 'accepted_risk', 'other')),
          dismissed_note TEXT,
          accepted_vendor_risk_id INTEGER REFERENCES verifywise.vendorrisks(id) ON DELETE SET NULL,
          decided_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          decided_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_risk_findings_org_status_created
           ON verifywise.vendor_risk_findings (organization_id, status, created_at DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_vendor_risk_findings_org_vendor
           ON verifywise.vendor_risk_findings (organization_id, vendor_id);`,
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
    // Findings reference runs, so they go first.
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.vendor_risk_findings;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.vendor_research_runs;`);
  },
};
