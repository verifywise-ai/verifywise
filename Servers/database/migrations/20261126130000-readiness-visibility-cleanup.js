"use strict";

/**
 * Clean up readiness visibility written before the calculate endpoints
 * normalized it:
 *
 * 1. Any visibility other than "public" or "private" (the endpoints used to
 *    store whatever string they were sent, "all" included) becomes "public".
 *    Such rows matched no visibility filter, so nobody could see or delete
 *    them.
 * 2. Control scores take the visibility of the framework score in the same
 *    scope (organization, framework, use case, person). The upserts used to
 *    keep the first run's visibility, so control rows first written by a
 *    later run could disagree with the framework score the person sees, and
 *    deleting that calculation removed rows under the other visibility.
 * 3. A check constraint keeps any other value out of all three tables.
 *
 * Idempotent. down() drops the constraints only: the rows changed here
 * cannot be told apart from rows written correctly since.
 */

const TABLES = ["framework_readiness_scores", "control_readiness_scores", "readiness_history"];

const constraintName = (table) => `chk_${table}_visibility`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of TABLES) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.${table}
              SET visibility = 'public'
            WHERE visibility IS DISTINCT FROM 'public'
              AND visibility IS DISTINCT FROM 'private';`,
          { transaction },
        );
      }

      // uq_fw_readiness_full (framework, project, creator, organization; not
      // visibility) allows one framework row per scope, so each control row
      // matches at most one.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.control_readiness_scores c
            SET visibility = f.visibility
           FROM verifywise.framework_readiness_scores f
          WHERE f.organization_id = c.organization_id
            AND f.framework_type = c.framework_type
            AND COALESCE(f.project_id, 0) = COALESCE(c.project_id, 0)
            AND COALESCE(f.created_by, 0) = COALESCE(c.created_by, 0)
            AND c.visibility <> f.visibility;`,
        { transaction },
      );

      for (const table of TABLES) {
        const name = constraintName(table);
        await queryInterface.sequelize.query(
          `ALTER TABLE verifywise.${table} DROP CONSTRAINT IF EXISTS ${name};
           ALTER TABLE verifywise.${table}
             ADD CONSTRAINT ${name} CHECK (visibility IN ('public', 'private'));`,
          { transaction },
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
