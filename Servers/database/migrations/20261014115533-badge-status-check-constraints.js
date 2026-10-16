"use strict";

/**
 * CHECK constraints for badge columns that are still free text.
 *
 * Native enums are left alone (vendors.review_status, model_risks.risk_level,
 * model_risks.status, project-risk severity).
 *
 * Allow-lists match:
 * - file.model.ts ReviewStatus
 * - policiesValidation.utils.ts POLICY_STATUS_ENUM and POLICY_REVIEW_STATUS_ENUM
 * - ai-incident-management.enum.ts
 * - detection finding keys: severity critical/high/medium/low, risk_level high/medium/low
 *
 * Known spelling aliases are rewritten first. Any other value fails the
 * migration with a sample of the offending rows.
 */

const CHECKS = [
  {
    table: "files",
    column: "review_status",
    name: "files_review_status_check",
    allowed: ["draft", "pending_review", "approved", "rejected", "expired", "superseded"],
  },
  {
    table: "policy_manager",
    column: "status",
    name: "policy_manager_status_check",
    allowed: ["Draft", "Under Review", "Approved", "Published", "Archived", "Deprecated"],
  },
  {
    table: "policy_manager",
    column: "review_status",
    name: "policy_manager_review_status_check",
    allowed: ["pending_review", "approved", "changes_requested"],
  },
  {
    table: "ai_incident_managements",
    column: "severity",
    name: "ai_incident_managements_severity_check",
    allowed: ["Minor", "Serious", "Very serious"],
  },
  {
    table: "ai_incident_managements",
    column: "status",
    name: "ai_incident_managements_status_check",
    allowed: ["Open", "Investigating", "Mitigated", "Closed", "Suspended", "Emergency action"],
  },
  {
    table: "ai_incident_managements",
    column: "approval_status",
    name: "ai_incident_managements_approval_status_check",
    allowed: ["Pending", "Approved", "Rejected", "Not required"],
  },
  {
    table: "ai_detection_findings",
    column: "severity",
    name: "ai_detection_findings_severity_check",
    allowed: ["critical", "high", "medium", "low"],
  },
  {
    table: "ai_detection_findings",
    column: "risk_level",
    name: "ai_detection_findings_risk_level_check",
    allowed: ["high", "medium", "low"],
  },
];

function quoteList(values) {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}

async function normalizeAliases(queryInterface, transaction) {
  const options = { transaction };
  await queryInterface.sequelize.query(
    `
    UPDATE verifywise.ai_incident_managements
    SET severity = 'Very serious'
    WHERE severity = 'Very Serious';
  `,
    options,
  );
  await queryInterface.sequelize.query(
    `
    UPDATE verifywise.ai_incident_managements
    SET approval_status = 'Not required'
    WHERE approval_status = 'Not Required';
  `,
    options,
  );
  await queryInterface.sequelize.query(
    `
    UPDATE verifywise.ai_detection_findings
    SET severity = lower(severity)
    WHERE severity IS NOT NULL
      AND severity <> lower(severity)
      AND lower(severity) IN ('critical', 'high', 'medium', 'low');
  `,
    options,
  );
  await queryInterface.sequelize.query(
    `
    UPDATE verifywise.ai_detection_findings
    SET risk_level = lower(risk_level)
    WHERE risk_level IS NOT NULL
      AND risk_level <> lower(risk_level)
      AND lower(risk_level) IN ('high', 'medium', 'low');
  `,
    options,
  );
}

async function assertAllowed(queryInterface, check, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `
    SELECT id, ${check.column} AS value
    FROM verifywise.${check.table}
    WHERE ${check.column} IS NOT NULL
      AND ${check.column} NOT IN (${quoteList(check.allowed)})
    LIMIT 20;
  `,
    { transaction },
  );

  if (Array.isArray(rows) && rows.length > 0) {
    const sample = rows.map((row) => `${row.id}=${JSON.stringify(row.value)}`).join(", ");
    throw new Error(
      `Cannot add CHECK ${check.name} on verifywise.${check.table}.${check.column}: ` +
        `rows are outside the allow-list (sample: ${sample}).`,
    );
  }
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await normalizeAliases(queryInterface, transaction);

      for (const check of CHECKS) {
        await assertAllowed(queryInterface, check, transaction);
        await queryInterface.sequelize.query(
          `
          ALTER TABLE verifywise.${check.table}
            ADD CONSTRAINT ${check.name}
            CHECK (${check.column} IS NULL OR ${check.column} IN (${quoteList(check.allowed)}));
        `,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    for (const check of [...CHECKS].reverse()) {
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.${check.table}
          DROP CONSTRAINT IF EXISTS ${check.name};
      `);
    }
  },
};
