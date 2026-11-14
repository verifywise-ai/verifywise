"use strict";

// "Very Low risk" -> "Very low risk" on the current risk level enum, so the
// stored spelling matches the inherent level and the rest of the UI.
// Guarded by a pg_enum check so it is safe to run twice.
const rename = async (queryInterface, from, to) => {
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'verifywise'
          AND t.typname = 'enum_projectrisks_current_risk_level'
          AND e.enumlabel = '${from}'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'verifywise'
          AND t.typname = 'enum_projectrisks_current_risk_level'
          AND e.enumlabel = '${to}'
      ) THEN
        ALTER TYPE verifywise.enum_projectrisks_current_risk_level
          RENAME VALUE '${from}' TO '${to}';
      END IF;
    END
    $$;
  `);
};

module.exports = {
  async up(queryInterface) {
    await rename(queryInterface, "Very Low risk", "Very low risk");
  },
  async down(queryInterface) {
    await rename(queryInterface, "Very low risk", "Very Low risk");
  },
};
