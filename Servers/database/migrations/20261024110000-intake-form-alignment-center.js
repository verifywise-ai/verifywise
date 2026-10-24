"use strict";

/**
 * Center the public intake forms that are left-aligned.
 *
 * Until now every form created in the builder was saved with the default
 * design settings, whose alignment was "left", so nearly every public form
 * rendered against the left edge of a wide screen. The default is now
 * "center". A saved "left" cannot be told apart from one picked on purpose,
 * so all of them move to "center"; a form owner can pick left again in the
 * Design panel.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.intake_forms
      SET design_settings = jsonb_set(design_settings, '{alignment}', '"center"')
      WHERE design_settings->>'alignment' = 'left';
    `);
  },

  // Which forms were left-aligned before is not recorded, so there is nothing
  // to restore.
  async down() {},
};
