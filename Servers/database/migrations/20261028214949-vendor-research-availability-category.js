"use strict";

// The categories a finding can have. Two are new: `availability` (an outage or a lasting
// degradation of the vendor's service) and `financial_health` (the vendor's solvency, kept here so
// that one migration widens the constraint for both). The CHECK constraint came with the table and
// has a name Postgres chose, so it is found by what it checks.
const CATEGORIES_BEFORE = [
  "security_incidents",
  "certifications",
  "legal_regulatory",
  "ai_specific",
];
const CATEGORIES_AFTER = [...CATEGORIES_BEFORE, "availability", "financial_health"];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

const replaceConstraint = async (queryInterface, categories) => {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE found RECORD;
    BEGIN
      FOR found IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'verifywise.vendor_risk_findings'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%security_incidents%'
      LOOP
        EXECUTE format('ALTER TABLE verifywise.vendor_risk_findings DROP CONSTRAINT %I', found.conname);
      END LOOP;
    END $$;
  `);
  await queryInterface.sequelize.query(`
    ALTER TABLE verifywise.vendor_risk_findings
      ADD CONSTRAINT vendor_risk_findings_category_check
      CHECK (category IN (${list(categories)}));
  `);
};

module.exports = {
  async up(queryInterface) {
    await replaceConstraint(queryInterface, CATEGORIES_AFTER);
  },
  async down(queryInterface) {
    // A finding of a new category cannot be kept under the old constraint, and no old category is
    // the truth about it: it is deleted. The vendor risk that an accepted finding made is not.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.vendor_risk_findings
      WHERE category IN (${list(["availability", "financial_health"])});
    `);
    await replaceConstraint(queryInterface, CATEGORIES_BEFORE);
  },
};
