"use strict";

/**
 * SuperAdmin is an overlay on top of a normal user account: a row in
 * verifywise.super_admins grants a user cross-org SuperAdmin capabilities in
 * addition to their normal org role. Existing bootstrap SuperAdmins
 * (users.role_id = 5) are seeded so the app boots with the same access set
 * it had before the mapping existed.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.super_admins (
        user_id INTEGER PRIMARY KEY REFERENCES verifywise.users(id) ON DELETE CASCADE
      );
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.super_admins (user_id)
      SELECT id FROM verifywise.users WHERE role_id = 5
      ON CONFLICT (user_id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.super_admins;");
  },
};
