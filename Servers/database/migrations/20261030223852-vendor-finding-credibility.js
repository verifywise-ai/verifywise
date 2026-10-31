"use strict";

/**
 * Vendor research: the credibility of a finding, computed from its sources by
 * services/vendorResearch/credibility.ts, beside the confidence the model gave.
 *
 * - `vendor_risk_findings.credibility` (low, medium or high) and `credibility_basis` (the rule that
 *   applied and what it read: categories, publishers, record matches, readings, the date of the
 *   data, as codes and parameters) are new and nullable: a finding of a run without the vendor
 *   risk database flag has neither.
 * - `vendor_risk_findings.confidence` drops NOT NULL now and goes in a later migration, once every
 *   finding has a credibility. A new column and not a rename: a rename would keep old values under
 *   a name another rule now gives.
 * - `vendor_research_runs.coverage` says which public databases a run checked and with what
 *   outcome, and `registry_version` which source registry classified its sources.
 *
 * The down gives every finding without a confidence its credibility (or low), restores NOT NULL
 * and drops the new columns.
 */

const LABELS = ["low", "medium", "high"];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const statements = [
        `ALTER TABLE verifywise.vendor_risk_findings
           ADD COLUMN IF NOT EXISTS credibility VARCHAR(10)
             CONSTRAINT vendor_risk_findings_credibility_check CHECK (credibility IN (${list(LABELS)})),
           ADD COLUMN IF NOT EXISTS credibility_basis JSONB;`,
        `ALTER TABLE verifywise.vendor_risk_findings ALTER COLUMN confidence DROP NOT NULL;`,
        `ALTER TABLE verifywise.vendor_research_runs
           ADD COLUMN IF NOT EXISTS coverage JSONB,
           ADD COLUMN IF NOT EXISTS registry_version VARCHAR(10);`,
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
      const statements = [
        `UPDATE verifywise.vendor_risk_findings
           SET confidence = COALESCE(confidence, credibility, 'low')
           WHERE confidence IS NULL;`,
        `ALTER TABLE verifywise.vendor_risk_findings ALTER COLUMN confidence SET NOT NULL;`,
        `ALTER TABLE verifywise.vendor_risk_findings
           DROP COLUMN IF EXISTS credibility_basis,
           DROP COLUMN IF EXISTS credibility;`,
        `ALTER TABLE verifywise.vendor_research_runs
           DROP COLUMN IF EXISTS registry_version,
           DROP COLUMN IF EXISTS coverage;`,
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
};
