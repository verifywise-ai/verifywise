"use strict";

/**
 * External use case owners (#5256): a person with a name and an email but no
 * VerifyWise account can own a use case and receive email notices.
 *
 * projects.owner is already nullable (ON DELETE SET NULL). There is deliberately
 * no CHECK requiring an owner or an external email: deleting a user sets owner
 * to NULL, and such a check would make that delete fail. The rule is enforced
 * when a use case is created or updated (utils/externalOwner.utils.ts).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.projects
        ADD COLUMN IF NOT EXISTS external_owner_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS external_owner_email VARCHAR(254);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.projects
        DROP COLUMN IF EXISTS external_owner_email,
        DROP COLUMN IF EXISTS external_owner_name;
    `);
  },
};
