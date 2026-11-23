"use strict";

/**
 * Vendors: recompute stored vendor risk levels and vendor risk scores.
 *
 * The server now computes both on every write (vendor risk level from
 * likelihood and severity, calculateRiskLevel in Servers/utils/riskLevel.utils.ts;
 * vendor risk score from the four scorecard answers, calculateVendorRiskScore in
 * Servers/utils/vendorScorecard.utils.ts). Until now the client sent them and the
 * server stored whatever it got, so stored values can be stale (likelihood
 * changed, level not) or not a level at all. This brings every row in line with
 * the formulas, which are copied here as they are at this date.
 *
 * - vendorrisks.risk_level: score = likelihood (1-5) + 3 * severity (1-5);
 *   <= 4 "No risk", <= 8 "Low risk", <= 12 "Medium risk", <= 16 "High risk",
 *   else "Very high risk". A row without a likelihood or severity keeps its level.
 * - vendors.risk_score: 100 * (0.3 sensitivity + 0.3 criticality + 0.2 past
 *   issues + 0.2 regulatory exposure), each answer over its scale's maximum,
 *   rounded. NULL ("Not assessed") when no answer is set, where it used to be 0.
 *
 * updated_at is left alone and trg_vendorrisks_flag_stale is switched off
 * for the level update: this is a correction, not an edit, so risks that
 * inherit from a vendor risk are not flagged "parent level changed" and
 * nobody is notified. down() is a no-op: the values it replaced were wrong
 * and cannot be told apart.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.vendorrisks DISABLE TRIGGER trg_vendorrisks_flag_stale;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.vendorrisks vr
            SET risk_level = CASE
                  WHEN calc.score <= 4 THEN 'No risk'
                  WHEN calc.score <= 8 THEN 'Low risk'
                  WHEN calc.score <= 12 THEN 'Medium risk'
                  WHEN calc.score <= 16 THEN 'High risk'
                  ELSE 'Very high risk'
                END
           FROM (
             SELECT id,
                    (CASE likelihood::text
                       WHEN 'Rare' THEN 1 WHEN 'Unlikely' THEN 2 WHEN 'Possible' THEN 3
                       WHEN 'Likely' THEN 4 WHEN 'Almost certain' THEN 5 END)
                    + 3 * (CASE risk_severity::text
                       WHEN 'Negligible' THEN 1 WHEN 'Minor' THEN 2 WHEN 'Moderate' THEN 3
                       WHEN 'Major' THEN 4 WHEN 'Catastrophic' THEN 5 END) AS score
               FROM verifywise.vendorrisks
           ) calc
          WHERE vr.id = calc.id
            AND calc.score IS NOT NULL
            AND vr.risk_level IS DISTINCT FROM CASE
                  WHEN calc.score <= 4 THEN 'No risk'
                  WHEN calc.score <= 8 THEN 'Low risk'
                  WHEN calc.score <= 12 THEN 'Medium risk'
                  WHEN calc.score <= 16 THEN 'High risk'
                  ELSE 'Very high risk'
                END;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.vendorrisks ENABLE TRIGGER trg_vendorrisks_flag_stale;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE verifywise.vendors v
            SET risk_score = CASE
                  WHEN v.data_sensitivity IS NULL AND v.business_criticality IS NULL
                   AND v.past_issues IS NULL AND v.regulatory_exposure IS NULL THEN NULL
                  ELSE ROUND((
                      COALESCE(CASE v.data_sensitivity::text
                        WHEN 'None' THEN 0 WHEN 'Internal only' THEN 1
                        WHEN 'Personally identifiable information (PII)' THEN 2
                        WHEN 'Financial data' THEN 4 WHEN 'Health data (e.g. HIPAA)' THEN 5
                        WHEN 'Model weights or AI assets' THEN 3
                        WHEN 'Other sensitive data' THEN 2 END, 0) / 5.0 * 0.3
                    + COALESCE(CASE v.business_criticality::text
                        WHEN 'Low (vendor supports non-core functions)' THEN 1
                        WHEN 'Medium (affects operations but is replaceable)' THEN 2
                        WHEN 'High (critical to core services or products)' THEN 3 END, 0) / 3.0 * 0.3
                    + COALESCE(CASE v.past_issues::text
                        WHEN 'None' THEN 0
                        WHEN 'Minor incident (e.g. small delay, minor bug)' THEN 1
                        WHEN 'Major incident (e.g. data breach, legal issue)' THEN 3 END, 0) / 3.0 * 0.2
                    + COALESCE(CASE v.regulatory_exposure::text
                        WHEN 'None' THEN 0 WHEN 'GDPR (EU)' THEN 1 WHEN 'HIPAA (US)' THEN 1
                        WHEN 'SOC 2' THEN 1 WHEN 'ISO 27001' THEN 1 WHEN 'EU AI act' THEN 1
                        WHEN 'CCPA (california)' THEN 1 WHEN 'Other' THEN 1 END, 0) / 1.0 * 0.2
                  ) * 100)::int
                END;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    // No-op: see the header.
  },
};
