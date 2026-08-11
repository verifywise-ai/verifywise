"use strict";

/**
 * Phase 2 widens ai_blocks_config from three booleans to seven.
 *
 * The backfill is NOT a blanket false. sectionSummaries and riskAnalysis
 * reproduce output aiSummarizer already emits whenever ANY legacy block was on
 * (per-section AI boxes and the risk-highlights box), so on those rows they
 * backfill to true — otherwise every existing schedule silently loses shipped
 * output on its next run. complianceGap and vendorRisk are genuinely new work
 * and always backfill to false, so nobody wakes up paying for analysis they
 * never asked for.
 *
 * No column change — ai_blocks_config is unconstrained JSONB.
 */
const NEW_KEYS = `
  jsonb_build_object(
    'sectionSummaries', ai_blocks_config @> '{"executiveSummary":true}'::jsonb
                     OR ai_blocks_config @> '{"keyFindings":true}'::jsonb
                     OR ai_blocks_config @> '{"recommendedActions":true}'::jsonb,
    'riskAnalysis',     ai_blocks_config @> '{"executiveSummary":true}'::jsonb
                     OR ai_blocks_config @> '{"keyFindings":true}'::jsonb
                     OR ai_blocks_config @> '{"recommendedActions":true}'::jsonb,
    'complianceGap', false,
    'vendorRisk',    false
  )`;

module.exports = {
  async up(queryInterface) {
    for (const table of ["report_template_versions", "scheduled_reports"]) {
      await queryInterface.sequelize.query(`
        UPDATE verifywise.${table}
           SET ai_blocks_config = ${NEW_KEYS} || COALESCE(ai_blocks_config, '{}'::jsonb)
         WHERE jsonb_typeof(COALESCE(ai_blocks_config, '{}'::jsonb)) = 'object';
      `);
    }
  },

  async down(queryInterface) {
    for (const table of ["report_template_versions", "scheduled_reports"]) {
      await queryInterface.sequelize.query(`
        UPDATE verifywise.${table}
           SET ai_blocks_config = ai_blocks_config
                 - 'sectionSummaries' - 'riskAnalysis' - 'complianceGap' - 'vendorRisk'
         WHERE jsonb_typeof(COALESCE(ai_blocks_config, '{}'::jsonb)) = 'object';
      `);
    }
  },
};
