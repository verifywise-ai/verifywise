"use strict";

/**
 * Clean up readiness visibility written before the calculate endpoints
 * normalized it. Every step fails closed: a row that may have been meant
 * private is never made public.
 *
 * 1. Values that only differ in case or spacing (" Private", "PUBLIC") take
 *    the value they spell.
 * 2. Any other value (the endpoints used to store whatever string they were
 *    sent, "all" included) becomes private, so its owner can see and delete
 *    it. Such rows matched no visibility filter, so nobody could. A row with
 *    no creator becomes public instead: a private row nobody owns is visible
 *    to no one.
 * 3. A calculation (framework score plus the control scores in its scope:
 *    organization, framework, use case, person) whose rows disagree becomes
 *    private as a whole when any of them is private. The upserts used to keep
 *    the first run's visibility, so control rows first written by a later run
 *    could disagree with the framework score the person sees. In a scope with
 *    no creator the control rows take the framework score's visibility.
 * 4. A check constraint keeps any other value out of all three tables.
 *
 * Idempotent. down() drops the constraints only: the rows changed here
 * cannot be told apart from rows written correctly since.
 */

const TABLES = ["framework_readiness_scores", "control_readiness_scores", "readiness_history"];

const constraintName = (table) => `chk_${table}_visibility`;

// uq_fw_readiness_full (framework, project, creator, organization; not
// visibility) allows one framework row per scope, so a control row matches at
// most one.
const SAME_SCOPE = `f.organization_id = c.organization_id
            AND f.framework_type = c.framework_type
            AND COALESCE(f.project_id, 0) = COALESCE(c.project_id, 0)
            AND COALESCE(f.created_by, 0) = COALESCE(c.created_by, 0)`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      for (const table of TABLES) {
        await run(
          `UPDATE verifywise.${table}
              SET visibility = lower(btrim(visibility))
            WHERE lower(btrim(visibility)) IN ('public', 'private')
              AND visibility NOT IN ('public', 'private');`,
        );
        await run(
          `UPDATE verifywise.${table}
              SET visibility = CASE WHEN created_by IS NULL THEN 'public' ELSE 'private' END
            WHERE visibility IS NULL OR visibility NOT IN ('public', 'private');`,
        );
      }

      // A private control row makes its calculation private.
      await run(
        `UPDATE verifywise.framework_readiness_scores f
            SET visibility = 'private'
          WHERE f.visibility = 'public'
            AND f.created_by IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM verifywise.control_readiness_scores c
               WHERE ${SAME_SCOPE} AND c.visibility = 'private'
            );`,
      );
      // So does a private framework row; without a creator, follow the framework row.
      await run(
        `UPDATE verifywise.control_readiness_scores c
            SET visibility = f.visibility
           FROM verifywise.framework_readiness_scores f
          WHERE ${SAME_SCOPE}
            AND c.visibility <> f.visibility
            AND (f.visibility = 'private' OR f.created_by IS NULL);`,
      );

      for (const table of TABLES) {
        const name = constraintName(table);
        await run(
          `ALTER TABLE verifywise.${table} DROP CONSTRAINT IF EXISTS ${name};
           ALTER TABLE verifywise.${table}
             ADD CONSTRAINT ${name} CHECK (visibility IN ('public', 'private'));`,
        );
      }
    });
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.${table} DROP CONSTRAINT IF EXISTS ${constraintName(table)};`,
      );
    }
  },
};
