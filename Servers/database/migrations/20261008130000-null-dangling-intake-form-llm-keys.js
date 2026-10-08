"use strict";

/**
 * intake_forms.llm_key_id has no foreign key, so deleting an LLM key left
 * forms pointing at a key that no longer exists. The builder then showed no
 * key but still tried to call the LLM. Clear the dangling references; the
 * key delete path now does the same going forward.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.intake_forms f
         SET llm_key_id = NULL
       WHERE f.llm_key_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM verifywise.llm_keys k
            WHERE k.id = f.llm_key_id
              AND k.organization_id = f.organization_id
         );
    `);
  },

  async down() {
    // Data cleanup of references to keys that no longer exist: nothing to restore.
  },
};
