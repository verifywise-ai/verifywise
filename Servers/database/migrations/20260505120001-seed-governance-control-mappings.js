"use strict";

/**
 * Seed Governance Control Mappings & Scenarios
 *
 * Populates core cross-framework mappings based on:
 * - NIST AI RMF Crosswalk to ISO 42001 (2024)
 * - EU AI Compass mapping documentation
 * - ISO 27001:2022 / ISO 42001 Annex SL alignment
 *
 * Framework IDs (from frameworks table):
 *   1 = EU AI Act
 *   2 = ISO 42001
 *   3 = ISO 27001
 *   4 = NIST AI RMF
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // ========================================
      // CORE CONTROL MAPPINGS (~50 mappings)
      // ========================================
      await queryInterface.sequelize.query(
        `
        INSERT INTO verifywise.governance_control_mappings
          (source_framework_id, source_control_type, source_control_identifier, target_framework_id, target_control_type, target_control_identifier, mapping_strength, mapping_direction, domain_tag, rationale, source_reference, confidence_score)
        VALUES
          -- Risk Management domain
          (1, 'control_category', 'Art.9', 2, 'clause', 'Clause 6.1', 'direct', 'bidirectional', 'risk_management', 'Both require systematic AI risk identification and assessment', 'NIST Crosswalk 2024', 0.95),
          (1, 'control_category', 'Art.9', 3, 'clause', 'Clause 6.1', 'partial', 'bidirectional', 'risk_management', 'ISO 27001 risk assessment is information-security-scoped; AI Act is broader', 'ISO 42001 Annex SL', 0.70),
          (1, 'control_category', 'Art.9', 4, 'function', 'GOVERN-1', 'direct', 'bidirectional', 'risk_management', 'GOVERN-1 establishes AI risk management process aligned with Art.9 requirements', 'NIST Crosswalk 2024', 0.90),
          (1, 'control_category', 'Art.9', 4, 'function', 'MAP-1', 'direct', 'bidirectional', 'risk_management', 'MAP-1 context establishment supports Art.9 risk identification', 'NIST Crosswalk 2024', 0.85),
          (2, 'clause', 'Clause 6.1', 4, 'function', 'GOVERN-1', 'direct', 'bidirectional', 'risk_management', 'Both establish systematic risk management governance', 'NIST Crosswalk 2024', 0.92),
          (2, 'clause', 'Clause 6.1', 3, 'clause', 'Clause 6.1', 'direct', 'bidirectional', 'risk_management', 'Annex SL harmonized risk assessment clauses', 'ISO 42001 Annex SL', 0.95),
          (3, 'clause', 'Clause 6.1', 4, 'function', 'GOVERN-1', 'partial', 'bidirectional', 'risk_management', 'NIST GOVERN aligns with ISO risk approach but AI-specific', 'NIST Crosswalk 2024', 0.75),

          -- Human Oversight domain
          (1, 'control_category', 'Art.14', 2, 'annex_category', 'Annex A.5', 'direct', 'bidirectional', 'human_oversight', 'Both require human oversight mechanisms for AI systems', 'EU AI Compass', 0.90),
          (1, 'control_category', 'Art.14', 4, 'subcategory', 'GOVERN-1.5', 'direct', 'bidirectional', 'human_oversight', 'GOVERN-1.5 addresses human oversight in AI governance', 'NIST Crosswalk 2024', 0.88),
          (2, 'annex_category', 'Annex A.5', 4, 'subcategory', 'GOVERN-1.5', 'direct', 'bidirectional', 'human_oversight', 'Both define human-in-the-loop requirements', 'NIST Crosswalk 2024', 0.85),

          -- Data Governance domain
          (1, 'control_category', 'Art.10', 2, 'annex_category', 'Annex A.7', 'direct', 'bidirectional', 'data_governance', 'Both address data quality and governance for AI training/operation', 'EU AI Compass', 0.92),
          (1, 'control_category', 'Art.10', 3, 'annex_category', 'Annex A.5.33', 'partial', 'forward', 'data_governance', 'ISO 27001 A.5.33 covers data protection; Art.10 is AI-training-specific', 'ISO 42001 Annex SL', 0.65),
          (1, 'control_category', 'Art.10', 4, 'function', 'MAP-2', 'direct', 'bidirectional', 'data_governance', 'MAP-2 addresses data requirements aligned with Art.10', 'NIST Crosswalk 2024', 0.87),
          (2, 'annex_category', 'Annex A.7', 4, 'function', 'MAP-2', 'direct', 'bidirectional', 'data_governance', 'Both address AI data lifecycle management', 'NIST Crosswalk 2024', 0.88),
          (2, 'annex_category', 'Annex A.7', 3, 'annex_category', 'Annex A.5.33', 'partial', 'bidirectional', 'data_governance', 'Overlapping data protection requirements', 'ISO 42001 Annex SL', 0.70),

          -- Transparency domain
          (1, 'control_category', 'Art.13', 2, 'clause', 'Clause 9', 'direct', 'bidirectional', 'transparency', 'Both require transparent reporting and performance evaluation', 'EU AI Compass', 0.85),
          (1, 'control_category', 'Art.13', 4, 'category', 'MEASURE-2', 'direct', 'bidirectional', 'transparency', 'MEASURE-2 evaluates AI transparency aligned with Art.13', 'NIST Crosswalk 2024', 0.88),
          (2, 'clause', 'Clause 9', 4, 'category', 'MEASURE-2', 'direct', 'bidirectional', 'transparency', 'Both address performance evaluation and transparency', 'NIST Crosswalk 2024', 0.85),
          (2, 'clause', 'Clause 9', 3, 'clause', 'Clause 9.1', 'direct', 'bidirectional', 'transparency', 'Annex SL harmonized monitoring/measurement/evaluation', 'ISO 42001 Annex SL', 0.90),

          -- Technical Documentation domain
          (1, 'control_category', 'Art.11', 2, 'annex_category', 'Annex A.4', 'direct', 'bidirectional', 'documentation', 'Both require comprehensive AI system documentation', 'EU AI Compass', 0.92),
          (1, 'control_category', 'Art.11', 3, 'annex_category', 'Annex A.5.37', 'partial', 'forward', 'documentation', 'ISO 27001 documented procedures partially satisfy Art.11', 'ISO 42001 Annex SL', 0.60),
          (1, 'control_category', 'Art.11', 4, 'category', 'GOVERN-4', 'direct', 'bidirectional', 'documentation', 'GOVERN-4 documentation requirements align with Art.11', 'NIST Crosswalk 2024', 0.87),
          (2, 'annex_category', 'Annex A.4', 4, 'category', 'GOVERN-4', 'direct', 'bidirectional', 'documentation', 'Both require AI system documentation and records', 'NIST Crosswalk 2024', 0.90),
          (2, 'annex_category', 'Annex A.4', 3, 'annex_category', 'Annex A.5.37', 'partial', 'bidirectional', 'documentation', 'Overlapping documentation requirements', 'ISO 42001 Annex SL', 0.65),

          -- Accuracy/Robustness domain
          (1, 'control_category', 'Art.15', 2, 'annex_category', 'Annex A.7', 'direct', 'bidirectional', 'accuracy_robustness', 'Art.15 accuracy/robustness maps to Annex A.7 data quality controls', 'EU AI Compass', 0.85),
          (1, 'control_category', 'Art.15', 3, 'annex_category', 'Annex A.8.25', 'partial', 'forward', 'accuracy_robustness', 'Secure development lifecycle partially addresses robustness', 'ISO 42001 Annex SL', 0.60),
          (1, 'control_category', 'Art.15', 4, 'category', 'MEASURE-1', 'direct', 'bidirectional', 'accuracy_robustness', 'MEASURE-1 addresses AI accuracy and performance measurement', 'NIST Crosswalk 2024', 0.90),
          (1, 'control_category', 'Art.15', 4, 'category', 'MEASURE-3', 'direct', 'bidirectional', 'accuracy_robustness', 'MEASURE-3 addresses AI robustness and reliability', 'NIST Crosswalk 2024', 0.88),
          (2, 'annex_category', 'Annex A.7', 4, 'category', 'MEASURE-1', 'direct', 'bidirectional', 'accuracy_robustness', 'Both measure AI system performance', 'NIST Crosswalk 2024', 0.85),

          -- Incident Management domain
          (1, 'control_category', 'Art.73', 3, 'annex_category', 'Annex A.5.26', 'direct', 'bidirectional', 'incident_management', 'Both require incident response procedures', 'EU AI Compass', 0.88),
          (1, 'control_category', 'Art.73', 4, 'subcategory', 'GOVERN-4.3', 'direct', 'bidirectional', 'incident_management', 'GOVERN-4.3 incident response aligns with Art.73 reporting', 'NIST Crosswalk 2024', 0.85),
          (3, 'annex_category', 'Annex A.5.26', 4, 'subcategory', 'GOVERN-4.3', 'direct', 'bidirectional', 'incident_management', 'Both address incident management processes', 'NIST Crosswalk 2024', 0.87),

          -- Security domain
          (1, 'control_category', 'Art.15', 2, 'annex_category', 'Annex A.6', 'partial', 'forward', 'security', 'Art.15 cybersecurity partially maps to Annex A.6 AI security', 'EU AI Compass', 0.75),
          (1, 'control_category', 'Art.15', 3, 'clause', 'Clause 8.1', 'partial', 'forward', 'security', 'ISO 27001 operational planning supports Art.15 security requirements', 'ISO 42001 Annex SL', 0.70),
          (1, 'control_category', 'Art.15', 4, 'function', 'MAP-3', 'partial', 'bidirectional', 'security', 'MAP-3 benefits/costs includes security considerations', 'NIST Crosswalk 2024', 0.72),
          (2, 'annex_category', 'Annex A.6', 3, 'clause', 'Clause 8.1', 'direct', 'bidirectional', 'security', 'Annex SL harmonized operational controls', 'ISO 42001 Annex SL', 0.88),
          (2, 'annex_category', 'Annex A.6', 4, 'category', 'MEASURE-3', 'partial', 'bidirectional', 'security', 'MEASURE-3 includes security testing and evaluation', 'NIST Crosswalk 2024', 0.75),
          (3, 'clause', 'Clause 8.1', 4, 'function', 'MAP-3', 'partial', 'bidirectional', 'security', 'Both address operational security planning', 'NIST Crosswalk 2024', 0.70),

          -- Monitoring domain
          (1, 'control_category', 'Art.72', 2, 'clause', 'Clause 9.1', 'direct', 'bidirectional', 'monitoring', 'Both require ongoing monitoring and measurement', 'EU AI Compass', 0.88),
          (1, 'control_category', 'Art.72', 3, 'clause', 'Clause 9.1', 'direct', 'bidirectional', 'monitoring', 'ISO 27001 monitoring clause aligns with Art.72 post-market surveillance', 'ISO 42001 Annex SL', 0.82),
          (1, 'control_category', 'Art.72', 4, 'category', 'MANAGE-3', 'direct', 'bidirectional', 'monitoring', 'MANAGE-3 addresses ongoing AI monitoring', 'NIST Crosswalk 2024', 0.87),
          (2, 'clause', 'Clause 9.1', 3, 'clause', 'Clause 9.1', 'direct', 'bidirectional', 'monitoring', 'Annex SL harmonized monitoring clause', 'ISO 42001 Annex SL', 0.95),
          (2, 'clause', 'Clause 9.1', 4, 'category', 'MANAGE-3', 'direct', 'bidirectional', 'monitoring', 'Both address continuous monitoring requirements', 'NIST Crosswalk 2024', 0.85),
          (3, 'clause', 'Clause 9.1', 4, 'category', 'MANAGE-3', 'partial', 'bidirectional', 'monitoring', 'NIST MANAGE-3 is AI-specific monitoring', 'NIST Crosswalk 2024', 0.75),

          -- Accountability domain
          (1, 'control_category', 'Art.16-27', 2, 'clause', 'Clause 5', 'direct', 'bidirectional', 'accountability', 'Both establish leadership and accountability requirements', 'EU AI Compass', 0.85),
          (1, 'control_category', 'Art.16-27', 3, 'clause', 'Clause 5', 'direct', 'bidirectional', 'accountability', 'Leadership commitment and organizational accountability', 'ISO 42001 Annex SL', 0.82),
          (1, 'control_category', 'Art.16-27', 4, 'category', 'GOVERN-2', 'direct', 'bidirectional', 'accountability', 'GOVERN-2 establishes accountability structures for AI', 'NIST Crosswalk 2024', 0.88),
          (2, 'clause', 'Clause 5', 3, 'clause', 'Clause 5', 'direct', 'bidirectional', 'accountability', 'Annex SL harmonized leadership clause', 'ISO 42001 Annex SL', 0.95),
          (2, 'clause', 'Clause 5', 4, 'category', 'GOVERN-2', 'direct', 'bidirectional', 'accountability', 'Both address AI governance accountability', 'NIST Crosswalk 2024', 0.87),
          (3, 'clause', 'Clause 5', 4, 'category', 'GOVERN-2', 'partial', 'bidirectional', 'accountability', 'NIST GOVERN-2 is AI-specific accountability', 'NIST Crosswalk 2024', 0.72)
      ON CONFLICT DO NOTHING;
      `,
        { transaction },
      );

      // ========================================
      // BUILT-IN SCENARIOS (10 scenarios)
      // ========================================
      await queryInterface.sequelize.query(
        `
        INSERT INTO verifywise.governance_scenarios
          (organization_id, name, description, industry, use_case_type, region, recommended_framework_ids, priority_order, rationale, is_builtin)
        VALUES
          (NULL, 'EU High-Risk AI Provider', 'Organizations deploying high-risk AI systems in the European Union as providers', 'technology', 'high_risk_ai', 'eu', ARRAY[1,2,4], '{"primary": 1, "secondary": [2], "supplementary": [4]}', 'EU AI Act is mandatory for high-risk AI providers in the EU. ISO 42001 provides the management system structure. NIST AI RMF supplements with detailed risk practices.', TRUE),
          (NULL, 'EU General-Purpose AI', 'Organizations deploying general-purpose AI models in the EU', 'technology', 'general_purpose_ai', 'eu', ARRAY[1,2], '{"primary": 1, "secondary": [2], "supplementary": []}', 'EU AI Act has specific GPAI provisions. ISO 42001 provides operational framework.', TRUE),
          (NULL, 'US AI Governance', 'US-based organizations seeking AI governance best practices', 'technology', 'high_risk_ai', 'us', ARRAY[4,2], '{"primary": 4, "secondary": [2], "supplementary": []}', 'NIST AI RMF is the primary US framework. ISO 42001 adds international credibility.', TRUE),
          (NULL, 'Healthcare AI - EU', 'Healthcare organizations deploying AI in the EU', 'healthcare', 'high_risk_ai', 'eu', ARRAY[1,3,2], '{"primary": 1, "secondary": [3], "supplementary": [2]}', 'EU AI Act mandatory for healthcare AI (high-risk). ISO 27001 critical for health data security. ISO 42001 for management system.', TRUE),
          (NULL, 'Financial Services AI', 'Financial institutions deploying AI for decision-making', 'finance', 'high_risk_ai', 'global', ARRAY[3,4,2], '{"primary": 3, "secondary": [4], "supplementary": [2]}', 'ISO 27001 primary for financial data security. NIST AI RMF for AI-specific risks. ISO 42001 for management system certification.', TRUE),
          (NULL, 'Public Sector AI - EU', 'Government and public sector AI deployments in the EU', 'public_sector', 'high_risk_ai', 'eu', ARRAY[1,2,3], '{"primary": 1, "secondary": [2, 3], "supplementary": []}', 'EU AI Act mandatory for public sector AI. ISO 42001 and ISO 27001 for structured compliance.', TRUE),
          (NULL, 'Global Enterprise AI', 'Large enterprises with global AI deployments', 'technology', 'high_risk_ai', 'global', ARRAY[2,1,4,3], '{"primary": 2, "secondary": [1, 4], "supplementary": [3]}', 'ISO 42001 as universal foundation. EU AI Act for EU operations. NIST for US operations. ISO 27001 for security baseline.', TRUE),
          (NULL, 'Limited-Risk AI', 'Organizations deploying limited-risk AI with transparency obligations only', 'technology', 'limited_risk', 'eu', ARRAY[1,2], '{"primary": 1, "secondary": [2], "supplementary": []}', 'EU AI Act transparency requirements only. ISO 42001 for voluntary best practices.', TRUE),
          (NULL, 'US Healthcare AI', 'US healthcare organizations deploying AI systems', 'healthcare', 'high_risk_ai', 'us', ARRAY[4,3,2], '{"primary": 4, "secondary": [3], "supplementary": [2]}', 'NIST AI RMF primary for US context. ISO 27001 for HIPAA alignment. ISO 42001 for comprehensive AI management.', TRUE),
          (NULL, 'APAC AI Governance', 'Organizations in Asia-Pacific seeking AI governance alignment', 'technology', 'high_risk_ai', 'apac', ARRAY[2,4], '{"primary": 2, "secondary": [4], "supplementary": []}', 'ISO 42001 widely recognized in APAC. NIST AI RMF supplements with practical guidance.', TRUE)
      ON CONFLICT DO NOTHING;
      `,
        { transaction },
      );

      // ========================================
      // SCENARIO RULES
      // ========================================
      await queryInterface.sequelize.query(
        `
        INSERT INTO verifywise.governance_scenario_rules
          (scenario_id, rule_type, rule_operator, rule_value, weight)
        VALUES
          -- EU High-Risk AI Provider (scenario 1)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'EU High-Risk AI Provider'), 'region', 'equals', 'eu', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'EU High-Risk AI Provider'), 'risk_level', 'equals', 'high', 0.85),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'EU High-Risk AI Provider'), 'industry', 'equals', 'technology', 0.50),

          -- EU General-Purpose AI (scenario 2)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'EU General-Purpose AI'), 'region', 'equals', 'eu', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'EU General-Purpose AI'), 'use_case_type', 'equals', 'general_purpose_ai', 0.95),

          -- US AI Governance (scenario 3)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'US AI Governance'), 'region', 'equals', 'us', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'US AI Governance'), 'industry', 'equals', 'technology', 0.50),

          -- Healthcare AI - EU (scenario 4)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Healthcare AI - EU'), 'industry', 'equals', 'healthcare', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Healthcare AI - EU'), 'region', 'equals', 'eu', 0.85),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Healthcare AI - EU'), 'data_type', 'contains', 'health', 0.70),

          -- Financial Services AI (scenario 5)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Financial Services AI'), 'industry', 'equals', 'finance', 0.95),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Financial Services AI'), 'data_type', 'contains', 'financial', 0.70),

          -- Public Sector AI - EU (scenario 6)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Public Sector AI - EU'), 'industry', 'equals', 'public_sector', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Public Sector AI - EU'), 'region', 'equals', 'eu', 0.85),

          -- Global Enterprise AI (scenario 7)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Global Enterprise AI'), 'region', 'equals', 'global', 0.80),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Global Enterprise AI'), 'deployment_scale', 'equals', 'enterprise', 0.85),

          -- Limited-Risk AI (scenario 8)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Limited-Risk AI'), 'risk_level', 'equals', 'limited', 0.95),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'Limited-Risk AI'), 'region', 'equals', 'eu', 0.70),

          -- US Healthcare AI (scenario 9)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'US Healthcare AI'), 'industry', 'equals', 'healthcare', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'US Healthcare AI'), 'region', 'equals', 'us', 0.85),

          -- APAC AI Governance (scenario 10)
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'APAC AI Governance'), 'region', 'equals', 'apac', 0.90),
          ((SELECT id FROM verifywise.governance_scenarios WHERE name = 'APAC AI Governance'), 'industry', 'equals', 'technology', 0.50)
      ON CONFLICT DO NOTHING;
      `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Clean up activations that reference built-in scenarios first (if table exists)
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.governance_scenario_activations
         WHERE scenario_id IN (SELECT id FROM verifywise.governance_scenarios WHERE is_builtin = TRUE);`,
        { transaction },
      );
      await queryInterface.sequelize.query(`DELETE FROM verifywise.governance_scenario_rules;`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.governance_scenarios WHERE is_builtin = TRUE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(`DELETE FROM verifywise.governance_control_mappings;`, {
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
