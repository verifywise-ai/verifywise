"use strict";

/**
 * The Colorado AI Act framework description cited "SB 21-169", which is
 * Colorado's insurance unfair-discrimination law. The Colorado Artificial
 * Intelligence Act is SB 24-205. The description is copied into the shared
 * frameworks row when the framework is created, so the stored text needs the
 * same correction as the structure file.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.frameworks
         SET description = REPLACE(description, '(SB 21-169)', '(SB 24-205)')
       WHERE description LIKE '%Colorado Artificial Intelligence Act (SB 21-169)%';
    `);
  },

  async down() {
    // Data correction: rolling back must not reintroduce the wrong citation,
    // and installs seeded after this change were never wrong. No-op.
  },
};
