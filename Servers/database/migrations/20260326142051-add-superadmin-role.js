'use strict';

const bcrypt = require('bcrypt');

/**
 * Super-Admin Role Migration
 *
 * 1. Inserts SuperAdmin role (id=5) into verifywise.roles
 * 2. Makes organization_id nullable on verifywise.users (super-admin has no org)
 * 3. Adds partial unique index to enforce single super-admin
 * 4. Seeds super-admin user from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🚀 Adding SuperAdmin role...');

      // 1. Insert SuperAdmin role
      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.roles (id, name, description)
        VALUES (5, 'SuperAdmin', 'System-level administrator with cross-org access.')
        ON CONFLICT (id) DO NOTHING;
      `, { transaction });

      // Reset sequence to cover new role
      await queryInterface.sequelize.query(`
        SELECT setval('verifywise.roles_id_seq', GREATEST((SELECT MAX(id) FROM verifywise.roles), 5));
      `, { transaction });

      // 2. Make organization_id nullable on users
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.users ALTER COLUMN organization_id DROP NOT NULL;
      `, { transaction });

      // 3. Partial unique index — only one super-admin allowed
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_superadmin_unique
        ON verifywise.users (role_id) WHERE role_id = 5;
      `, { transaction });

      // 4. Seed super-admin user from env vars
      const email = process.env.SUPERADMIN_EMAIL;
      const password = process.env.SUPERADMIN_PASSWORD;

      const [[{ count }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS count FROM verifywise.organizations;
      `, { transaction });

      if (count <= 0 && (!email || !password)) {
        throw new Error(
          'SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are required. ' +
          'Set them in your .env file and re-run the migration.'
        );
      } else {
        if (password && password.length < 8) {
          throw new Error(
            'SUPERADMIN_PASSWORD must be at least 8 characters.'
          );
        }
      }

      if (email && password) {
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert super-admin (ON CONFLICT on the partial unique index)
        await queryInterface.sequelize.query(`
          INSERT INTO verifywise.users (name, surname, email, password_hash, role_id, organization_id, created_at, last_login, is_demo)
          VALUES ('Super', 'Admin', :email, :passwordHash, 5, NULL, NOW(), NOW(), false)
          ON CONFLICT ((role_id)) WHERE role_id = 5 DO NOTHING;
        `, {
          replacements: { email, passwordHash },
          transaction,
        });

        console.log(`✅ Super-admin user seeded with email: ${email}`);
      }

      await transaction.commit();
      console.log('✅ SuperAdmin role migration completed!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ SuperAdmin migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Rolling back SuperAdmin role...');

      // Delete super-admin user
      await queryInterface.sequelize.query(`
        DELETE FROM verifywise.users WHERE role_id = 5;
      `, { transaction });

      // Drop partial unique index
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS verifywise.idx_users_superadmin_unique;
      `, { transaction });

      // Restore NOT NULL on organization_id (set any NULLs first)
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.users ALTER COLUMN organization_id SET NOT NULL;
      `, { transaction });

      // Delete SuperAdmin role
      await queryInterface.sequelize.query(`
        DELETE FROM verifywise.roles WHERE id = 5;
      `, { transaction });

      await transaction.commit();
      console.log('✅ SuperAdmin role rollback completed!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ SuperAdmin rollback failed:', error);
      throw error;
    }
  },
};
