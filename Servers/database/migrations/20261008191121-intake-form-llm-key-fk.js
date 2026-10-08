"use strict";

/**
 * intake_forms.llm_key_id had no foreign key, so deleting an LLM key left
 * forms pointing at a key that no longer exists. The builder then showed no
 * key but still tried to call the LLM.
 *
 * 1. Clear references to keys that do not exist in the form's organization.
 * 2. Add the foreign key with ON DELETE SET NULL so a deleted key clears
 *    itself from forms from now on.
 */

const CONSTRAINT = "intake_forms_llm_key_id_fkey";

module.exports = {
  async up(queryInterface) {
    // One transaction: if adding the constraint fails, the cleanup is rolled
    // back with it instead of leaving the data half migrated.
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
      UPDATE verifywise.intake_forms f
         SET llm_key_id = NULL
       WHERE f.llm_key_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM verifywise.llm_keys k
            WHERE k.id = f.llm_key_id
              AND k.organization_id = f.organization_id
         );
    `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = '${CONSTRAINT}'
             AND conrelid = 'verifywise.intake_forms'::regclass
        ) THEN
          ALTER TABLE verifywise.intake_forms
            ADD CONSTRAINT ${CONSTRAINT}
            FOREIGN KEY (llm_key_id) REFERENCES verifywise.llm_keys(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    // The cleared references pointed at keys that no longer exist: nothing to restore.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_forms DROP CONSTRAINT IF EXISTS ${CONSTRAINT};
    `);
  },
};
