/**
 * Integration-suite backstop, loaded by jest.integration.config.js
 * (setupFilesAfterEnv); nothing in the application imports it.
 *
 * Every new connection the app's sequelize instance (database/db.ts) opens in
 * an integration test file is checked against the test-database rule
 * (tests/testDatabaseGuard.js) before any query runs on it, so suites that
 * DELETE, seed or migrate through it are covered as well as cleanupDatabase().
 * Each connection asks Postgres for its own current_database(), uncached, and a
 * refused connection is closed before the error fails the query that wanted it.
 *
 * Not covered here: raw pg clients or other Sequelize instances a suite builds
 * itself (none do today), and child processes such as the sequelize CLI, which
 * globalSetup and runMigrations() check by DB_NAME before spawning them.
 *
 * The hook is added inside a module factory rather than by importing db.ts
 * here, so the real sequelize (and its models) is constructed only when a test
 * file actually loads database/db.ts; suites that never touch the database pay
 * nothing. A test file's own jest.mock of database/db replaces this factory,
 * which is fine: a mocked sequelize opens no connections.
 */

jest.mock("../../database/db", () => {
  const actual = jest.requireActual<typeof import("../../database/db")>("../../database/db");
  // Models imported by db.ts import db.ts back, which re-enters this factory
  // while db.ts is still evaluating. Hand them the live (still filling)
  // exports object; the outer call adds the hook once sequelize exists.
  if (!actual.sequelize) return actual;
  const { assertConnectionIsTestDatabase } =
    require("./databaseGuard") as typeof import("./databaseGuard");
  actual.sequelize.addHook(
    "afterConnect",
    "integrationTestDatabaseGuard",
    assertConnectionIsTestDatabase as (connection: unknown) => Promise<void>,
  );
  return actual;
});
