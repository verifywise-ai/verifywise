/**
 * Guard for the integration suite's target database.
 *
 * The suite truncates every table it touches. The invariant is therefore not
 * "Servers/.env.test exists" but "the database we are about to truncate is not
 * the one Servers/.env names". Those differ in both directions:
 *
 *   - CI has neither .env.test nor .env and injects DB_* into the environment.
 *     A file-existence check fails there while proving nothing.
 *   - A developer can have .env.test and still have pointed it at the
 *     development database, which a file-existence check waves through.
 *
 * Under NODE_ENV=test, database/config/config.js loads Servers/.env.test with
 * override, and globalSetup does the same, so the name checked here is the name
 * the app's sequelize instance will use. Without .env.test (CI), the DB_* the
 * environment injects are used unchanged.
 *
 * globalSetup only runs when jest is started through the integration scripts.
 * assertSafeToTruncate() is the backstop that cleanupDatabase() runs against
 * the database it is actually connected to, however jest was started.
 */

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const DEV_ENV_PATH = path.resolve(__dirname, "../.env");

/** DB_NAME from Servers/.env (the development database), or undefined if there is no such file. */
function readDevDbName() {
  if (!fs.existsSync(DEV_ENV_PATH)) return undefined;
  return dotenv.parse(fs.readFileSync(DEV_ENV_PATH, "utf8")).DB_NAME;
}

/**
 * @param {object} args
 * @param {string|undefined} args.dbName     Target database (process.env.DB_NAME).
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 * @param {string} args.envTestPath          Absolute path to Servers/.env.test, for messages.
 * @param {boolean} [args.hasEnvTest]        Whether .env.test was loaded.
 */
function assertSafeTestDatabase({ dbName, devDbName, envTestPath, hasEnvTest = true }) {
  if (!dbName) {
    throw new Error(
      "Integration tests have no target database: DB_NAME is not set.\n" +
        `Set it in ${envTestPath} (copy Servers/.env and point DB_NAME at a dedicated test ` +
        "database, e.g. verifywise_test) or export it in the environment.",
    );
  }

  if (devDbName && devDbName === dbName) {
    const source = hasEnvTest ? envTestPath : "the environment";
    throw new Error(
      `Refusing to run: ${source} sets DB_NAME="${dbName}", the same database as Servers/.env.\n` +
        "The integration suite truncates it — this is how a developer's local data was destroyed " +
        "on 2026-07-28.\n" +
        `Point ${hasEnvTest ? envTestPath : `${envTestPath} (create it)`} at a dedicated test ` +
        "database instead.",
    );
  }
}

/**
 * Refuse to TRUNCATE unless the connected database is plainly a test database:
 * its name contains "test" and it is not the database Servers/.env names.
 *
 * @param {object} args
 * @param {string|undefined} args.currentDb  SELECT current_database() on the live connection.
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 */
function assertSafeToTruncate({ currentDb, devDbName }) {
  const fix =
    "Run integration tests with `npm run test:integration`, and point DB_NAME in " +
    "Servers/.env.test (or the environment) at a dedicated test database, e.g. verifywise_test.";

  if (!currentDb) {
    throw new Error(`Refusing to truncate: could not tell which database is connected.\n${fix}`);
  }
  if (devDbName && currentDb === devDbName) {
    throw new Error(
      `Refusing to truncate "${currentDb}": it is the same database as Servers/.env (the ` +
        `development database).\n${fix}`,
    );
  }
  if (!/test/i.test(currentDb)) {
    throw new Error(
      `Refusing to truncate "${currentDb}": only databases whose name contains "test" may be ` +
        `truncated by the integration suite.\n${fix}`,
    );
  }
}

module.exports = { assertSafeTestDatabase, assertSafeToTruncate, readDevDbName };
