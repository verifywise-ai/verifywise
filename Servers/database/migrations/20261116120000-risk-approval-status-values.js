"use strict";

/**
 * Risk approval status takes the incident approval values (audit decision 5,
 * ruling K1): Pending, Approved, Rejected, Not required. Default Not required.
 *
 * Existing values are matched with case, whitespace, underscores and hyphens
 * ignored (as in 20261014115533-badge-status-check-constraints.js):
 * - Approved, Rejected, Not required keep their canonical spelling.
 * - Pending and "Requires review" become Pending when the risk has an
 *   approver, Not required otherwise.
 * - Anything else (NULL, "", mitigation values such as "In Progress" or
 *   "Completed") becomes Not required.
 *
 * Then DEFAULT 'Not required', NOT NULL and the CHECK risks_approval_status_check.
 * No notifications are sent. The rewrites are one-way: down() drops the
 * CHECK, NOT NULL and DEFAULT only.
 */

const TABLE = "verifywise.risks";
const CHECK_NAME = "risks_approval_status_check";
const ALLOWED = ["Pending", "Approved", "Rejected", "Not required"];
const DEFAULT_VALUE = "Not required";

function quote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

// Case, whitespace (tabs and newlines too), underscores and hyphens are ignored
// when matching. Must agree with normalizeRiskApprovalStatus().
function matchKey(value) {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function matchKeySql(column) {
  return `btrim(regexp_replace(lower(${column}), '[[:space:]_-]+', ' ', 'g'))`;
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const key = matchKeySql("approval_status");
      const [rows] = await queryInterface.sequelize.query(
        `
        UPDATE ${TABLE}
        SET approval_status = CASE
          WHEN ${key} = ${quote(matchKey("Approved"))} THEN 'Approved'
          WHEN ${key} = ${quote(matchKey("Rejected"))} THEN 'Rejected'
          WHEN ${key} IN (${quote(matchKey("Pending"))}, ${quote(matchKey("Requires review"))})
            AND risk_approval IS NOT NULL THEN 'Pending'
          ELSE ${quote(DEFAULT_VALUE)}
        END
        WHERE approval_status IS NULL
          OR approval_status NOT IN (${ALLOWED.map(quote).join(", ")})
          OR (approval_status = 'Pending' AND risk_approval IS NULL)
        RETURNING id;
      `,
        { transaction },
      );
      if (rows.length > 0) {
        console.log(
          `risk-approval-status-values: rewrote ${rows.length} verifywise.risks.approval_status value(s)`,
        );
      }

      await queryInterface.sequelize.query(
        `
        ALTER TABLE ${TABLE}
          ALTER COLUMN approval_status SET DEFAULT ${quote(DEFAULT_VALUE)};
        ALTER TABLE ${TABLE}
          ALTER COLUMN approval_status SET NOT NULL;
        ALTER TABLE ${TABLE}
          DROP CONSTRAINT IF EXISTS ${CHECK_NAME};
        ALTER TABLE ${TABLE}
          ADD CONSTRAINT ${CHECK_NAME}
          CHECK (approval_status IN (${ALLOWED.map(quote).join(", ")}));
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE ${TABLE}
          DROP CONSTRAINT IF EXISTS ${CHECK_NAME};
        ALTER TABLE ${TABLE}
          ALTER COLUMN approval_status DROP NOT NULL;
        ALTER TABLE ${TABLE}
          ALTER COLUMN approval_status DROP DEFAULT;
      `,
        { transaction },
      );
    });
  },
};
