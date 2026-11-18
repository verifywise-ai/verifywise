"use strict";

/**
 * A model risk outlives its model.
 *
 * model_risks.model_id referenced model_inventories ON DELETE CASCADE, so
 * deleting a model deleted every risk of it, archived ones too, with their
 * risk links and no change history, even when the user chose "Keep risks".
 *
 * up(): replaces the foreign key with one that sets model_id to NULL. A kept
 * risk stays in the model risks list with no model; "Delete risks too"
 * archives the risks in the application before the model goes.
 *
 * down(): restores ON DELETE CASCADE. Risks that lost their model while the
 * new key was in place keep model_id NULL.
 *
 * The constraint is found in pg_constraint rather than by name, so an install
 * whose key was created under another name is handled too. model_id is
 * already nullable.
 */

const replaceModelIdForeignKey = (onDelete) => `
  DO $$
  DECLARE
    fk record;
  BEGIN
    FOR fk IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.conrelid = 'verifywise.model_risks'::regclass
         AND c.contype = 'f'
         AND c.confrelid = 'verifywise.model_inventories'::regclass
         AND a.attname = 'model_id'
    LOOP
      EXECUTE format('ALTER TABLE verifywise.model_risks DROP CONSTRAINT %I', fk.conname);
    END LOOP;
    ALTER TABLE verifywise.model_risks
      ADD CONSTRAINT model_risks_model_id_fkey
      FOREIGN KEY (model_id) REFERENCES verifywise.model_inventories(id) ON DELETE ${onDelete};
  END $$;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(replaceModelIdForeignKey("SET NULL"));
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(replaceModelIdForeignKey("CASCADE"));
  },
};
