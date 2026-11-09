"use strict";

/**
 * A user can belong to several organizations, with a different role in each.
 *
 * - organization_members(organization_id, user_id, role_id, joined_at) holds
 *   one row per membership. users becomes identity only: users.organization_id
 *   and users.role_id are copied into it, then dropped.
 * - The superadmin invariant moves from "NULL role and NULL org" to
 *   "zero memberships". A user with no membership must have a super_admins
 *   row (deferred, checked at commit, so a transaction can add the user then
 *   the membership, or delete the last membership then the user). A pure
 *   superadmin (zero memberships) cannot have their super_admins row revoked.
 * - The tenant_isolation RLS policy moves from users to organization_members.
 *
 * down() puts each user back into their earliest membership; any further
 * memberships are lost.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE verifywise.organization_members (
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES verifywise.roles(id),
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (organization_id, user_id)
      );
    `);
    await sql.query(
      `CREATE INDEX idx_organization_members_user_id ON verifywise.organization_members(user_id);`,
    );

    await sql.query(`
      INSERT INTO verifywise.organization_members (organization_id, user_id, role_id, joined_at)
      SELECT organization_id, id, role_id, created_at
      FROM verifywise.users
      WHERE organization_id IS NOT NULL;
    `);

    // The old trigger is declared UPDATE OF role_id, organization_id, so it
    // must go before those columns can be dropped.
    await sql.query(`DROP TRIGGER users_orphan_superadmin_check ON verifywise.users;`);

    await sql.query(`
      CREATE OR REPLACE FUNCTION verifywise.check_orphan_user_has_superadmin()
      RETURNS TRIGGER AS $$
      DECLARE
        target_user_id INTEGER;
      BEGIN
        IF TG_TABLE_NAME = 'users' THEN
          target_user_id := NEW.id;
        ELSE
          target_user_id := OLD.user_id;
        END IF;

        -- A deleted user has nothing left to check.
        IF EXISTS (SELECT 1 FROM verifywise.users WHERE id = target_user_id)
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.organization_members WHERE user_id = target_user_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.super_admins WHERE user_id = target_user_id
           ) THEN
          RAISE EXCEPTION
            'user % has no organization membership and no super_admins mapping', target_user_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql.query(`
      CREATE CONSTRAINT TRIGGER users_orphan_superadmin_check
      AFTER INSERT ON verifywise.users
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION verifywise.check_orphan_user_has_superadmin();
    `);
    await sql.query(`
      CREATE CONSTRAINT TRIGGER organization_members_orphan_superadmin_check
      AFTER DELETE ON verifywise.organization_members
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION verifywise.check_orphan_user_has_superadmin();
    `);

    await sql.query(`
      CREATE OR REPLACE FUNCTION verifywise.protect_orphan_superadmin_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM verifywise.users WHERE id = OLD.user_id)
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.organization_members WHERE user_id = OLD.user_id
           ) THEN
          RAISE EXCEPTION
            'cannot revoke SuperAdmin from user % (no organization membership, would be orphaned)',
            OLD.user_id;
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // users.organization_id carries the tenant_isolation policy; it moves to
    // the table that now holds a user's organizations.
    await sql.query(`DROP POLICY tenant_isolation ON verifywise.users;`);
    await sql.query(`ALTER TABLE verifywise.users DISABLE ROW LEVEL SECURITY;`);
    await sql.query(`ALTER TABLE verifywise.organization_members ENABLE ROW LEVEL SECURITY;`);
    await sql.query(`
      CREATE POLICY tenant_isolation ON verifywise.organization_members
      USING (organization_id = current_setting('app.current_org', true)::int)
      WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);

    await sql.query(`
      ALTER TABLE verifywise.users
        DROP COLUMN organization_id,
        DROP COLUMN role_id;
    `);
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      ALTER TABLE verifywise.users
        ADD COLUMN role_id INTEGER REFERENCES verifywise.roles(id),
        ADD COLUMN organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE;
    `);
    await sql.query(
      `CREATE INDEX IF NOT EXISTS idx_users_organization_id ON verifywise.users(organization_id);`,
    );

    await sql.query(`
      UPDATE verifywise.users u
      SET organization_id = m.organization_id, role_id = m.role_id
      FROM (
        SELECT DISTINCT ON (user_id) user_id, organization_id, role_id
        FROM verifywise.organization_members
        ORDER BY user_id, joined_at ASC, organization_id ASC
      ) m
      WHERE m.user_id = u.id;
    `);

    await sql.query(
      `DROP TRIGGER organization_members_orphan_superadmin_check ON verifywise.organization_members;`,
    );
    await sql.query(`DROP TRIGGER users_orphan_superadmin_check ON verifywise.users;`);

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

    await sql.query(`ALTER TABLE verifywise.users ENABLE ROW LEVEL SECURITY;`);
    await sql.query(`
      CREATE POLICY tenant_isolation ON verifywise.users
      USING (organization_id = current_setting('app.current_org', true)::int)
      WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);

    await sql.query(`DROP TABLE verifywise.organization_members;`);
  },
};
