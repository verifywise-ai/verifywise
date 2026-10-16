/**
 * Guard for the integration suite's target database.
 *
 * The suite truncates every table it touches, so it may only ever run against
 * a dedicated test database. One rule decides that, everywhere it is checked
 * (checkDatabaseName below): the database
 *
 *   1. is named (DB_NAME set / current_database() answered),
 *   2. is not the database Servers/.env names (the development database), and
 *   3. has "test" as a name token: verifywise_test, verifywise_mrm_test and
 *      test_verifywise pass; verifywise_attestations, latest, contest_app and
 *      verifywise_testing_prod do not.
 *
 * Rule 2 alone is not enough: CI has neither .env.test nor .env and injects
 * DB_* into the environment, and a developer can export DB_NAME or point
 * .env.test at a database Servers/.env does not name. Rule 3 alone is not
 * enough either: Servers/.env can itself name a "test" database.
 *
 * The rule is enforced at three points:
 *
 *   - globalSetup (assertSafeTestDatabase), on DB_NAME, before it builds the
 *     backend or runs migrations. jest.integration.config.js declares it, so
 *     any run of that config is covered, not just the npm scripts.
 *   - setupDatabaseGuard.ts (assertSafeToTruncate), on current_database() of
 *     every new connection the app's sequelize opens in an integration suite.
 *   - cleanupDatabase() (assertSafeToTruncate), on current_database(), right
 *     before it truncates.
 *
 * Under NODE_ENV=test, database/config/loadEnv.js decides DB_NAME (exported
 * env > Servers/.env.test > Servers/.env), and globalSetup uses the same
 * loader, so the name checked first is the name the workers connect to.
 */

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const DEV_ENV_PATH = path.resolve(__dirname, "../.env");

/** "test" as a whole token of the name, delimited by start/end, "_" or "-". */
const TEST_NAME_TOKEN = /(^|[_-])test([_-]|$)/i;

/** DB_NAME from Servers/.env (the development database), or undefined if there is no such file. */
function readDevDbName() {
  if (!fs.existsSync(DEV_ENV_PATH)) return undefined;
  return dotenv.parse(fs.readFileSync(DEV_ENV_PATH, "utf8")).DB_NAME;
}

/** @param {string} name */
function isTestDatabaseName(name) {
  return TEST_NAME_TOKEN.test(name);
}

/**
 * The single policy. Returns why the database is unsafe for the integration
 * suite, or null when it is safe.
 *
 * @param {object} args
 * @param {string|undefined} args.name       The target or connected database.
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 * @returns {"unnamed"|"development"|"not-test"|null}
 */
function checkDatabaseName({ name, devDbName }) {
  if (!name) return "unnamed";
  if (devDbName && name === devDbName) return "development";
  if (!isTestDatabaseName(name)) return "not-test";
  return null;
}

const NOT_TEST_RULE =
  'only databases with "test" as a separate word in the name (e.g. verifywise_test, ' +
  "verifywise_mrm_test) may be used by the integration suite, which truncates them";

/**
 * globalSetup's check of DB_NAME, before anything touches the database.
 *
 * @param {object} args
 * @param {string|undefined} args.dbName     Target database (process.env.DB_NAME).
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 * @param {string} args.envTestPath          Absolute path to Servers/.env.test, for messages.
 * @param {boolean} [args.hasEnvTest]        Whether .env.test was loaded.
 */
function assertSafeTestDatabase({ dbName, devDbName, envTestPath, hasEnvTest = true }) {
  const fix =
    `Point DB_NAME in ${envTestPath}${hasEnvTest ? "" : " (create it)"} at a dedicated test ` +
    "database, e.g. verifywise_test, or export DB_NAME in the environment.";

  switch (checkDatabaseName({ name: dbName, devDbName })) {
    case "unnamed":
      throw new Error(`Integration tests have no target database: DB_NAME is not set.\n${fix}`);
    case "development":
      throw new Error(
        `Refusing to run: DB_NAME="${dbName}" is the same database as Servers/.env.\n` +
          "The integration suite truncates it — this is how a developer's local data was " +
          `destroyed on 2026-07-28 and again on 2026-10-15.\n${fix}`,
      );
    case "not-test":
      throw new Error(`Refusing to run against DB_NAME="${dbName}": ${NOT_TEST_RULE}.\n${fix}`);
    default:
  }
}

/**
 * The check on a live connection, before it is used or truncated.
 *
 * @param {object} args
 * @param {string|undefined} args.currentDb  SELECT current_database() on the live connection.
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 */
function assertSafeToTruncate({ currentDb, devDbName }) {
  const fix =
    "Run integration tests with `npm run test:integration` (or jest.integration.config.js), " +
    "and point DB_NAME in Servers/.env.test (or the environment) at a dedicated test " +
    "database, e.g. verifywise_test.";

  switch (checkDatabaseName({ name: currentDb, devDbName })) {
    case "unnamed":
      throw new Error(`Refusing to truncate: could not tell which database is connected.\n${fix}`);
    case "development":
      throw new Error(
        `Refusing to truncate "${currentDb}": it is the same database as Servers/.env (the ` +
          `development database).\n${fix}`,
      );
    case "not-test":
      throw new Error(`Refusing to truncate "${currentDb}": ${NOT_TEST_RULE}.\n${fix}`);
    default:
  }
}

module.exports = {
  assertSafeTestDatabase,
  assertSafeToTruncate,
  checkDatabaseName,
  isTestDatabaseName,
  readDevDbName,
};
