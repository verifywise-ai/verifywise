"use strict";

/**
 * A stance can be generated from an attested profile, not only from a run.
 *
 * An out-of-scope determination ("Scope determination", spec open question 1)
 * has no run: the run path refuses a profile outside the rule, because there
 * are no figures to compute. Its stance is therefore keyed on the attested
 * profile it records. This is the one schema change the controller's
 * "carry 8" ruling accepts, on a table not yet in production.
 *
 *  - profile_id is nullable and ON DELETE SET NULL. A stance is an immutable
 *    record that already carries profile_version and question_set_version, so
 *    it stays readable if the profile row goes (in practice only through a
 *    project delete, which removes the stance too).
 *
 *  - CHECK (run_id IS NULL OR profile_id IS NULL): a stance is run-based or
 *    profile-based, never both. Run stances leave profile_id NULL.
 *
 *  - The partial unique index is keyed on profile_id IS NOT NULL, not on
 *    run_id IS NULL. A run stance's run_id becomes NULL when its run is
 *    deleted (ON DELETE SET NULL, spec Review Focus 5). An index keyed on
 *    run_id IS NULL would then cover orphaned run stances, and if those also
 *    carried a profile_id they would collide with the profile's own stance
 *    versions. Run stances never carry a profile_id, so an orphaned run stance
 *    stays outside this index.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        ALTER TABLE verifywise.bias_audit_stances
          ADD COLUMN profile_id INTEGER NULL
            REFERENCES verifywise.aedt_profiles(id) ON DELETE SET NULL;
      `);

      await run(`
        ALTER TABLE verifywise.bias_audit_stances
          ADD CONSTRAINT bias_audit_stances_run_or_profile_ck
            CHECK (run_id IS NULL OR profile_id IS NULL);
      `);

      await run(`
        CREATE UNIQUE INDEX bias_audit_stances_profile_version_uq
          ON verifywise.bias_audit_stances (profile_id, version)
          WHERE profile_id IS NOT NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      // Profile stances have no run, so with the column gone they would cite
      // nothing and are removed. Their PDF files rows stay (pdf_file_id has
      // no foreign key) and keep the stance source, so they stay hidden from
      // the file lists and refused by the file delete paths.
      await run(`DELETE FROM verifywise.bias_audit_stances WHERE profile_id IS NOT NULL;`);
      await run(`DROP INDEX IF EXISTS verifywise.bias_audit_stances_profile_version_uq;`);
      await run(`
        ALTER TABLE verifywise.bias_audit_stances
          DROP CONSTRAINT IF EXISTS bias_audit_stances_run_or_profile_ck;
      `);
      await run(`ALTER TABLE verifywise.bias_audit_stances DROP COLUMN IF EXISTS profile_id;`);
    });
  },
};
