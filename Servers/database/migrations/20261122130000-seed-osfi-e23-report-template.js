"use strict";

/**
 * Seeds the OSFI E-23 completeness system report template.
 *
 * Idempotent per slug, like 20260729221814-seed-system-report-template-library:
 * an existing system row is reactivated rather than duplicated, and down()
 * deactivates instead of deleting, because scheduled_reports.template_id
 * references report_templates(id) with NO ACTION on delete.
 *
 * Two differences from the library seed:
 *  - supported_scopes is ["organization"]. The report describes the whole
 *    model risk programme, and the server refuses a project-scoped E-23 run.
 *  - framework_config names native:26 directly. OSFI E-23 is a bundled
 *    framework whose id is fixed by its structure file
 *    (Servers/structures/OSFI-E-23/osfi-e23.structure.ts), not a SERIAL value.
 *
 * The template seeds even when no organization has added E-23; the report then
 * shows its "no framework" notices.
 *
 * parameters_config.fields is a JSON copy of E23_PARAMETER_FIELDS in
 * services/reporting/e23/e23Parameters.ts. Migrations must not import
 * TypeScript, so the copy lives here and
 * database/seeders/__tests__/osfiE23ReportTemplate.test.ts asserts the two are
 * equal.
 */

const ORG_ONLY = ["organization"];

const section = (reportSectionKey, label, defaultEnabled = true) => ({
  key: reportSectionKey,
  reportSectionKey,
  label,
  core: false,
  defaultEnabled,
  supportedScopes: ORG_ONLY,
});

const E23_TEMPLATE = {
  slug: "osfi-e23-completeness",
  name: "OSFI E-23 completeness report",
  description:
    "Self-assessment of the OSFI Guideline E-23 checklist set against the model risk management records: program completeness, model risk status, where the checklist and the data disagree, and an internal fix-it list.",
  category: "compliance",
  defaultScope: "organization",
  supportedScopes: ORG_ONLY,
  recommendedFrequency: "quarterly",
  frameworkConfig: { frameworkIds: ["native:26"] },
  sections: [
    section("frameworkRequirements", "Framework requirements"),
    section("mrmFleet", "Model risk management status"),
    section("e23Contradictions", "Where the checklist and the data disagree"),
    section("e23FixItList", "Fix-it list (internal document)"),
    section("mrmInventoryAppendix", "Model inventory appendix", false),
    section("signOff", "Sign-off"),
  ],
  ai: {
    sectionSummaries: false,
    executiveSummary: true,
    keyFindings: true,
    recommendedActions: true,
    riskAnalysis: false,
    complianceGap: false,
    vendorRisk: false,
    e23Gap: true,
  },
  parametersConfig: {
    kind: "osfi_e23",
    fields: [
      { key: "periodStart", label: "Period start", type: "date", required: true },
      { key: "periodEnd", label: "Period end", type: "date", required: true },
      {
        key: "institutionName",
        label: "Institution name",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "accountableExecutiveName",
        label: "Accountable executive name",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "accountableExecutiveTitle",
        label: "Accountable executive title",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "headOfValidationName",
        label: "Head of validation name",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "headOfValidationTitle",
        label: "Head of validation title",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "preparedByName",
        label: "Prepared by name",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "preparedByTitle",
        label: "Prepared by title",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "audience",
        label: "Audience",
        type: "select",
        required: true,
        options: [
          { value: "osfi", label: "OSFI supervisory review" },
          { value: "board", label: "Board of directors" },
        ],
      },
      { key: "scopeNote", label: "Scope note", type: "textarea", required: false, maxLength: 1000 },
      { key: "isFinal", label: "Final version", type: "boolean", required: false },
    ],
  },
  // A valid quarterly schedule config (anchorMonth is required for quarterly).
  scheduleDefaults: {
    frequency: "quarterly",
    hour: 9,
    minute: 0,
    timezone: "UTC",
    dayOfMonth: 1,
    anchorMonth: 1,
  },
};

module.exports = {
  E23_TEMPLATE,

  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const existing = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.report_templates
          WHERE slug = :slug AND is_system_template = true`,
        {
          replacements: { slug: E23_TEMPLATE.slug },
          type: queryInterface.sequelize.QueryTypes.SELECT,
          transaction: t,
        },
      );
      if (existing.length) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.report_templates
              SET is_active = true, updated_at = NOW()
            WHERE slug = :slug AND is_system_template = true
              AND is_active = false`,
          { replacements: { slug: E23_TEMPLATE.slug }, transaction: t },
        );
        await t.commit();
        return;
      }

      const inserted = await queryInterface.sequelize.query(
        `INSERT INTO verifywise.report_templates
           (organization_id, name, slug, description, category, default_scope,
            supported_scopes, recommended_frequency, is_system_template, is_active)
         VALUES (NULL, :name, :slug, :description, :category, :defaultScope,
            :scopes, :freq, true, true)
         RETURNING id`,
        {
          replacements: {
            name: E23_TEMPLATE.name,
            slug: E23_TEMPLATE.slug,
            description: E23_TEMPLATE.description,
            category: E23_TEMPLATE.category,
            defaultScope: E23_TEMPLATE.defaultScope,
            scopes: JSON.stringify(E23_TEMPLATE.supportedScopes),
            freq: E23_TEMPLATE.recommendedFrequency,
          },
          type: queryInterface.sequelize.QueryTypes.INSERT,
          transaction: t,
        },
      );
      const templateId = inserted[0][0].id;

      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.report_template_versions
           (template_id, version, sections_config, ai_blocks_config, framework_config,
            parameters_config, format_config, schedule_defaults, delivery_defaults,
            config_schema_version)
         VALUES (:tid, 1, :sections, :ai, :frameworks, :parameters, '{"format":"pdf"}', :sched,
            '{"saveToStorage":true,"sendEmailLink":true,"attachFile":false}', 1)`,
        {
          replacements: {
            tid: templateId,
            sections: JSON.stringify({ sections: E23_TEMPLATE.sections }),
            ai: JSON.stringify(E23_TEMPLATE.ai),
            frameworks: JSON.stringify(E23_TEMPLATE.frameworkConfig),
            parameters: JSON.stringify(E23_TEMPLATE.parametersConfig),
            sched: JSON.stringify(E23_TEMPLATE.scheduleDefaults),
          },
          type: queryInterface.sequelize.QueryTypes.INSERT,
          transaction: t,
        },
      );

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  /** Deactivates rather than deletes; see the note at the top. */
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE verifywise.report_templates
          SET is_active = false, updated_at = NOW()
        WHERE is_system_template = true AND slug = :slug`,
      { replacements: { slug: E23_TEMPLATE.slug } },
    );
  },
};
