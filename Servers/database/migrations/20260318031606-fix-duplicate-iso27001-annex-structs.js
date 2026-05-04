"use strict";

/**
 * Remove duplicate annex_struct_iso27001 records that have no
 * annexcontrols_struct_iso27001 children. These orphans were
 * created by a double-insert in the seed migration and cause
 * "No matching controls" in the ISO 27001 annexes UI.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.annex_struct_iso27001
      WHERE id NOT IN (
        SELECT DISTINCT annex_id FROM verifywise.annexcontrols_struct_iso27001
      )
    `);
  },

  async down() {
    // No-op: the deleted rows were duplicates with no children
  },
};
