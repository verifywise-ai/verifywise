"use strict";

/**
 * RLS Phase 2: dedicated non-owner runtime role `verifywise_app`.
 *
 * Creates a LOGIN role with the minimum privileges the application needs at
 * runtime (SELECT/INSERT/UPDATE/DELETE on all tables in the verifywise
 * schema, USAGE on its sequences) plus default privileges so tables/sequences
 * created by future owner-run migrations are automatically accessible.
 *
 * The owner role (DB_USER) remains the migration/maintenance role. The
 * runtime switches to `verifywise_app` only when RLS_ENFORCEMENT_ENABLED=true
 * and DB_APP_USER/DB_APP_PASSWORD are set (see database/config/config.js and
 * docs/technical/security/rls-rollout.md, Phase 2).
 *
 * Behavior today: UNCHANGED unless the runtime env vars are pointed at the
 * new role. Once the app connects as `verifywise_app` (a non-owner), the
 * Phase 1 `tenant_isolation` policies apply to it.
 *
 * The role password is read from the DB_APP_PASSWORD env var — never
 * hardcoded. When DB_APP_PASSWORD is unset, the migration SKIPS role
 * creation with a warning (safe: RLS enforcement defaults to off, so the
 * role is unused) unless RLS_ENFORCEMENT_ENABLED=true, in which case it
 * fails fast — the role is mandatory for enforcement.
 */
module.exports = {
  async up(queryInterface) {
    const password = process.env.DB_APP_PASSWORD;
    if (!password) {
      const enforcementEnabled = process.env.RLS_ENFORCEMENT_ENABLED === "true";
      if (enforcementEnabled) {
        throw new Error(
          "DB_APP_PASSWORD environment variable is required to create the " +
            "verifywise_app runtime role when RLS_ENFORCEMENT_ENABLED=true. " +
            "Set it in Servers/.env (never commit the value) and re-run the migration.",
        );
      }
      console.warn(
        "[rls-app-role] DB_APP_PASSWORD not set — skipping verifywise_app role " +
          "creation (RLS enforcement is disabled; the role is unused). Set " +
          "DB_APP_PASSWORD and re-run this migration before enabling " +
          "RLS_ENFORCEMENT_ENABLED.",
      );
      return;
    }

    // Idempotent role creation: NOLOGIN first, then LOGIN + password applied
    // via ALTER ROLE so re-runs keep credentials in sync without failing on
    // an existing role.
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verifywise_app') THEN
          CREATE ROLE verifywise_app NOLOGIN;
        END IF;
      END $$;
    `);

    // Password is bound via replacements — never interpolated into SQL.
    await queryInterface.sequelize.query(`ALTER ROLE verifywise_app LOGIN PASSWORD :password;`, {
      replacements: { password },
    });

    // Minimum runtime privileges + default privileges for future objects
    // created by the owner role (current_user = the migration runner).
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO verifywise_app', current_database());
        EXECUTE 'GRANT USAGE ON SCHEMA verifywise TO verifywise_app';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA verifywise TO verifywise_app';
        EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA verifywise TO verifywise_app';
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA verifywise
           GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO verifywise_app',
          current_user
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA verifywise
           GRANT USAGE, SELECT ON SEQUENCES TO verifywise_app',
          current_user
        );
      END $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verifywise_app') THEN
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA verifywise
             REVOKE ALL ON TABLES FROM verifywise_app',
            current_user
          );
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA verifywise
             REVOKE ALL ON SEQUENCES FROM verifywise_app',
            current_user
          );
          EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA verifywise FROM verifywise_app';
          EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA verifywise FROM verifywise_app';
          EXECUTE 'REVOKE USAGE ON SCHEMA verifywise FROM verifywise_app';
          EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM verifywise_app', current_database());
          DROP ROLE verifywise_app;
        END IF;
      END $$;
    `);
  },
};
