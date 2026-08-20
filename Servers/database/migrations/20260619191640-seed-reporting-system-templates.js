"use strict";

const SECTIONS = {
  daily: [
    {
      key: "current_high_risks",
      reportSectionKey: "projectRisks",
      label: "Current high / critical risks",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "overdue_tasks",
      reportSectionKey: "projectRisks",
      label: "Currently overdue / due-soon tasks",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "open_incidents",
      reportSectionKey: "incidentManagement",
      label: "Open / unresolved incidents",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "vendor_reviews",
      reportSectionKey: "vendors",
      label: "Vendor reviews due soon",
      core: false,
      defaultEnabled: false,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "policy_due",
      reportSectionKey: "policyManager",
      label: "Policy reviews due soon",
      core: false,
      defaultEnabled: false,
      supportedScopes: ["project", "organization"],
    },
  ],
  weekly: [
    {
      key: "ai_portfolio",
      reportSectionKey: "models",
      label: "AI portfolio overview",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["organization", "project"],
    },
    {
      key: "risk_posture",
      reportSectionKey: "projectRisks",
      label: "Risk posture",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["organization", "project"],
    },
    {
      key: "compliance_progress",
      reportSectionKey: "compliance",
      label: "Compliance progress",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["organization", "project"],
    },
    {
      key: "incidents_summary",
      reportSectionKey: "incidentManagement",
      label: "Incidents summary",
      core: false,
      defaultEnabled: true,
      supportedScopes: ["organization", "project"],
    },
  ],
  compliance: [
    {
      key: "framework_progress",
      reportSectionKey: "clausesAndAnnexes",
      label: "Framework control progress",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "missing_evidence",
      reportSectionKey: "compliance",
      label: "Missing evidence",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
    {
      key: "incomplete_assessments",
      reportSectionKey: "assessment",
      label: "Incomplete assessments",
      core: true,
      defaultEnabled: true,
      supportedScopes: ["project", "organization"],
    },
  ],
};
// Behaviour-preserving base: the five blocks aiSummarizer already produced pre-Phase-2.
const AI_BASE = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

const TEMPLATES = [
  // Has a vendor_reviews (vendors) section -> vendorRisk analyzer is what covers it.
  {
    name: "Daily Governance Pulse",
    slug: "daily-governance-pulse",
    category: "operational",
    default_scope: "project",
    recommended_frequency: "daily",
    sections: SECTIONS.daily,
    desc: "Daily operational governance digest: current high risks, overdue tasks, open incidents.",
    ai: { ...AI_BASE, vendorRisk: true },
  },
  {
    name: "Weekly Executive Brief",
    slug: "weekly-executive-brief",
    category: "executive",
    default_scope: "organization",
    recommended_frequency: "weekly",
    sections: SECTIONS.weekly,
    desc: "Weekly AI governance posture for leadership.",
    ai: { ...AI_BASE },
  },
  // Named after and described as the complianceGap analyzer's own purpose -> ship it on.
  {
    name: "Compliance Evidence Gap",
    slug: "compliance-evidence-gap",
    category: "compliance",
    default_scope: "project",
    recommended_frequency: "weekly",
    sections: SECTIONS.compliance,
    desc: "Audit readiness and framework evidence gaps.",
    ai: { ...AI_BASE, complianceGap: true },
  },
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const tpl of TEMPLATES) {
        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.report_templates WHERE slug = :slug AND is_system_template = true`,
          {
            replacements: { slug: tpl.slug },
            type: queryInterface.sequelize.QueryTypes.SELECT,
            transaction: t,
          },
        );
        if (existing.length) continue;
        const inserted = await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_templates
             (organization_id, name, slug, description, category, default_scope, supported_scopes, recommended_frequency, is_system_template, is_active)
           VALUES (NULL, :name, :slug, :description, :category, :default_scope, '["project","organization"]', :freq, true, true)
           RETURNING id`,
          {
            replacements: {
              name: tpl.name,
              slug: tpl.slug,
              description: tpl.desc,
              category: tpl.category,
              default_scope: tpl.default_scope,
              freq: tpl.recommended_frequency,
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
        const templateId = inserted[0][0].id;
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.report_template_versions
             (template_id, version, sections_config, ai_blocks_config, format_config, schedule_defaults, delivery_defaults, config_schema_version)
           VALUES (:tid, 1, :sections, :ai, '{"format":"pdf"}', :sched, '{"saveToStorage":true,"sendEmailLink":true,"attachFile":false}', 1)`,
          {
            replacements: {
              tid: templateId,
              sections: JSON.stringify({ sections: tpl.sections }),
              ai: JSON.stringify(tpl.ai),
              sched: JSON.stringify({
                frequency: tpl.recommended_frequency,
                hour: 9,
                minute: 0,
                timezone: "UTC",
              }),
            },
            type: queryInterface.sequelize.QueryTypes.INSERT,
            transaction: t,
          },
        );
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM verifywise.report_templates WHERE is_system_template = true AND slug IN ('daily-governance-pulse','weekly-executive-brief','compliance-evidence-gap');`,
    );
  },
};
