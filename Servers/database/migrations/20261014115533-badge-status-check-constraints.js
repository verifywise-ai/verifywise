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
 * Values are rewritten first when they match an allowed value or a known
 * legacy alias once case, whitespace, underscores and hyphens are ignored
 * ("Very Serious", "In review", "pending review"). The counts are logged. Any
 * other value fails the migration with a sample of the offending rows.
 *
 * Edited after release (v2.6.2): deployments with legacy "In review" policies
 * failed here. The transaction rolled back, so nothing was half-applied, and
 * the edited version runs on the next start. Where it already ran, it is not
 * re-run. Each constraint is dropped before it is added, in case one was added
 * by hand to get past that failure.
 *
 * The rewrites are one-way: down() drops the constraints only.
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
    // Saved by the policy form until it switched to "Under Review" (0e996b746)
    aliases: { "in review": "Under Review" },
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
    // Legacy tier that isCriticalIncidentSeverity() already treats as "Very serious"
    aliases: { critical: "Very serious" },
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

function quote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteList(values) {
  return values.map(quote).join(", ");
}

// Case, whitespace (tabs and newlines too), underscores and hyphens are ignored
// when matching. matchKey() and matchKeySql() must agree.
function matchKey(value) {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function matchKeySql(column) {
  return `btrim(regexp_replace(lower(${column}), '[[:space:]_-]+', ' ', 'g'))`;
}

async function normalizeValues(queryInterface, transaction) {
  for (const check of CHECKS) {
    const targets = new Map(check.allowed.map((value) => [matchKey(value), value]));
    for (const [alias, value] of Object.entries(check.aliases || {})) {
      targets.set(matchKey(alias), value);
    }
    const cases = [...targets]
      .map(([key, value]) => `WHEN ${quote(key)} THEN ${quote(value)}`)
      .join(" ");

    const [rows] = await queryInterface.sequelize.query(
      `
      UPDATE verifywise.${check.table}
      SET ${check.column} = CASE ${matchKeySql(check.column)} ${cases} END
      WHERE ${check.column} IS NOT NULL
        AND ${check.column} NOT IN (${quoteList(check.allowed)})
        AND ${matchKeySql(check.column)} IN (${quoteList([...targets.keys()])})
      RETURNING id;
    `,
      { transaction },
    );
    if (rows.length > 0) {
      console.log(
        `badge-status-check-constraints: rewrote ${rows.length} verifywise.${check.table}.${check.column} value(s) to the allowed spelling`,
      );
    }
  }
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
      await normalizeValues(queryInterface, transaction);

      for (const check of CHECKS) {
        await assertAllowed(queryInterface, check, transaction);
        await queryInterface.sequelize.query(
          `
          ALTER TABLE verifywise.${check.table}
            DROP CONSTRAINT IF EXISTS ${check.name};
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
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const check of [...CHECKS].reverse()) {
        await queryInterface.sequelize.query(
          `
          ALTER TABLE verifywise.${check.table}
            DROP CONSTRAINT IF EXISTS ${check.name};
        `,
          { transaction },
        );
      }
    });
  },
};
