"use strict";

// The reasons a finding can be dismissed for. Two are new: `wrong_vendor` (the sources are about
// another company) and `outdated` (the sources are too old to matter). The CHECK constraint came
// with the column and has a name Postgres chose, so it is found by what it checks.
const REASONS_BEFORE = [
  "not_applicable",
  "already_covered",
  "inaccurate",
  "accepted_risk",
  "other",
];
const REASONS_AFTER = [
  "not_applicable",
  "already_covered",
  "inaccurate",
  "accepted_risk",
  "wrong_vendor",
  "outdated",
  "other",
];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

const replaceConstraint = async (queryInterface, reasons) => {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE found RECORD;
    BEGIN
      FOR found IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'verifywise.vendor_risk_findings'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%dismissed_reason%'
      LOOP
        EXECUTE format('ALTER TABLE verifywise.vendor_risk_findings DROP CONSTRAINT %I', found.conname);
      END LOOP;
    END $$;
  `);
  await queryInterface.sequelize.query(`
    ALTER TABLE verifywise.vendor_risk_findings
      ADD CONSTRAINT vendor_risk_findings_dismissed_reason_check
      CHECK (dismissed_reason IN (${list(reasons)}));
  `);
};

module.exports = {
  async up(queryInterface) {
    await replaceConstraint(queryInterface, REASONS_AFTER);
  },
  async down(queryInterface) {
    // A finding dismissed for a new reason would break the old constraint: it becomes `other`.
    await queryInterface.sequelize.query(`
      UPDATE verifywise.vendor_risk_findings
      SET dismissed_reason = 'other'
      WHERE dismissed_reason IN ('wrong_vendor', 'outdated');
    `);
    await replaceConstraint(queryInterface, REASONS_BEFORE);
  },
};
