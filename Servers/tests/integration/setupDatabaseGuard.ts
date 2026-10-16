/**
 * Integration-suite backstop: every connection the app's sequelize opens is
 * checked against the test-database rule (tests/testDatabaseGuard.js) before
 * any query runs on it, so suites that DELETE, seed or migrate directly are
 * covered as well as cleanupDatabase(). Loaded only by jest.integration.config.js
 * (setupFilesAfterEnv); nothing in the application imports it.
 *
 * The verdict is cached per test file (assertConnectedToTestDatabase), so only
 * the first connections cost a query. A refusal fails the connection, and with
 * it whatever query asked for one.
 */

import { sequelize } from "../../database/db";
import { assertConnectedToTestDatabase } from "./helpers";

sequelize.addHook("afterConnect", "integrationTestDatabaseGuard", async (connection: unknown) => {
  await assertConnectedToTestDatabase(async () => {
    const result = await (
      connection as { query: (sql: string) => Promise<{ rows: { name?: string }[] }> }
    ).query("SELECT current_database() AS name");
    return result.rows[0]?.name;
  });
});
