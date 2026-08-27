"use strict";

/**
 * Removes the legacy SuperAdmin role (role_id = 5) in favour of the
 * super_admins mapping table as the single source of truth. Bootstrap
 * SuperAdmin users end up with role_id = NULL and organization_id = NULL,
 * identified purely by their row in super_admins.
 *
 * A DEFERRABLE CONSTRAINT TRIGGER on users prevents accidentally leaving a
 * user with (role_id IS NULL, organization_id IS NULL) without a matching
 * super_admins row. A BEFORE DELETE trigger on super_admins prevents
 * revoking a pure superadmin (no role / no org), which would orphan them.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`DROP INDEX IF EXISTS verifywise.idx_users_superadmin_unique;`);

    await sql.query(`UPDATE verifywise.users SET role_id = NULL WHERE role_id = 5;`);

    // Stale pending invites for the retired SuperAdmin role can't be redeemed
    // under the elected-overlay model, and their FK blocks the role delete.
    await sql.query(`DELETE FROM verifywise.invitations WHERE role_id = 5;`);

    await sql.query(`DELETE FROM verifywise.roles WHERE id = 5;`);

    await sql.query(`
      CREATE OR REPLACE FUNCTION verifywise.check_orphan_user_has_superadmin()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.role_id IS NULL AND NEW.organization_id IS NULL THEN
          IF NOT EXISTS (SELECT 1 FROM verifywise.super_admins WHERE user_id = NEW.id) THEN
            RAISE EXCEPTION
              'user % has NULL role_id and organization_id but no super_admins mapping', NEW.id;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql.query(`
      DROP TRIGGER IF EXISTS users_orphan_superadmin_check ON verifywise.users;
      CREATE CONSTRAINT TRIGGER users_orphan_superadmin_check
      AFTER INSERT OR UPDATE OF role_id, organization_id ON verifywise.users
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION verifywise.check_orphan_user_has_superadmin();
    `);

    await sql.query(`
      CREATE OR REPLACE FUNCTION verifywise.protect_orphan_superadmin_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM verifywise.users
          WHERE id = OLD.user_id AND role_id IS NULL AND organization_id IS NULL
        ) THEN
          RAISE EXCEPTION
            'cannot revoke SuperAdmin from user % (no role/org, would be orphaned)', OLD.user_id;
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql.query(`
      DROP TRIGGER IF EXISTS super_admins_orphan_delete_check ON verifywise.super_admins;
      CREATE TRIGGER super_admins_orphan_delete_check
      BEFORE DELETE ON verifywise.super_admins
      FOR EACH ROW EXECUTE FUNCTION verifywise.protect_orphan_superadmin_delete();
    `);
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.query(
      `DROP TRIGGER IF EXISTS super_admins_orphan_delete_check ON verifywise.super_admins;`,
    );
    await sql.query(`DROP TRIGGER IF EXISTS users_orphan_superadmin_check ON verifywise.users;`);
    await sql.query(`DROP FUNCTION IF EXISTS verifywise.protect_orphan_superadmin_delete();`);
    await sql.query(`DROP FUNCTION IF EXISTS verifywise.check_orphan_user_has_superadmin();`);
    await sql.query(
      `INSERT INTO verifywise.roles (id, name, description) VALUES (5, 'SuperAdmin', 'System-wide administrator') ON CONFLICT DO NOTHING;`,
    );
    // NOTE: cannot restore role_id=5 on the bootstrap user automatically —
    // that data is lost by the forward migration.
  },
};
