/**
 * Guard for the integration suite's target database.
 *
 * The suite truncates every table it touches, so it may only ever run against
 * a dedicated test database. One rule decides that, everywhere it is checked
 * (checkDatabaseName below): the database
 *
 *   1. is named (DB_NAME set / current_database() answered),
 *   2. is not the database Servers/.env names (the development database), and
 *   3. has "test" or "tests" as a name token, optionally followed by digits,
 *      delimited by the start/end of the name, "_" or "-" (TEST_NAME_TOKEN):
 *      verifywise_test, verifywise_tests, verifywise_test2, verifywise_mrm_test
 *      and test_verifywise pass; verifywise_attestations, latest, contest_app,
 *      verifywise_testing_prod, verifywisetest and vw_testdb do not.
 *
 * Rule 2 alone is not enough: CI has neither .env.test nor .env and injects
 * DB_* into the environment, and a developer can export DB_NAME or point
 * .env.test at a database Servers/.env does not name. Rule 3 alone is not
 * enough either: Servers/.env can itself name a "test" database.
 *
 * Where the rule is enforced (also listed in
 * docs/feature-inventory/testing-playbook.md, "Database guard errors"):
 *
 *   - globalSetup (assertSafeTestDatabase) on DB_NAME, before it builds the
 *     backend or runs migrations, for every run of jest.integration.config.js;
 *   - runMigrations() in tests/integration/helpers.ts, on the DB_NAME the
 *     sequelize CLI child will resolve, before it spawns it;
 *   - tests/integration/setupDatabaseGuard.ts, on current_database() of every
 *     new connection the app's sequelize instance (database/db.ts) opens in an
 *     integration test file, uncached;
 *   - cleanupDatabase(), on current_database() (cached per test file, in
 *     tests/integration/databaseGuard.ts), right before it truncates.
 *
 * Raw pg clients and other Sequelize instances a suite creates itself are not
 * checked by the connection hook; nothing in tests/integration does that today.
 */

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const DEV_ENV_PATH = path.resolve(__dirname, "../.env");

/** "test"/"tests" (+ optional digits) as a whole token, delimited by start/end, "_" or "-". */
const TEST_NAME_TOKEN = /(^|[_-])tests?\d*([_-]|$)/i;

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
  'the name must contain "test" or "tests" as a separate word, optionally followed by ' +
  'digits, between "_" or "-" or at either end (verifywise_test, verifywise_tests, ' +
  "verifywise_test2, verifywise_mrm_test, test_verifywise; not verifywisetest, " +
  "vw_testdb or verifywise_testing_prod), because the integration suite truncates it";

/**
 * Where DB_NAME came from and how to fix it there.
 *
 * @param {object} origin
 * @param {"environment"|".env.test"|".env"|undefined} origin.source  From loadEnv / resolveTestDbName.
 * @param {string} origin.envTestPath     Absolute path to Servers/.env.test.
 * @param {boolean} [origin.envTestExists]
 */
function fixAdvice({ source, envTestPath, envTestExists = true }) {
  switch (source) {
    case "environment":
      return (
        "DB_NAME is exported in the environment, which overrides .env.test and .env. " +
        `Run \`unset DB_NAME\` to use ${envTestPath}, or export a dedicated test database, ` +
        "e.g. DB_NAME=verifywise_test."
      );
    case ".env.test":
      return (
        `DB_NAME comes from ${envTestPath}. Change it there to a dedicated test database, ` +
        "e.g. DB_NAME=verifywise_test."
      );
    case ".env":
      return (
        `DB_NAME comes from Servers/.env (your development settings) because ${envTestPath} ` +
        `${envTestExists ? "does not set DB_NAME" : "does not exist"}. ` +
        `${envTestExists ? "Add" : "Create it with"} DB_NAME=verifywise_test (or another ` +
        "dedicated test database)."
      );
    default:
      return (
        `DB_NAME is not exported and neither ${envTestPath} nor Servers/.env sets it. ` +
        `Add DB_NAME=verifywise_test to ${envTestPath}${envTestExists ? "" : " (create it)"}, ` +
        "or export DB_NAME."
      );
  }
}

/**
 * The check of a DB_NAME before anything connects to it: globalSetup, and
 * runMigrations() before it spawns the sequelize CLI.
 *
 * @param {object} args
 * @param {string|undefined} args.dbName     Target database.
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 * @param {string} args.envTestPath          Absolute path to Servers/.env.test, for messages.
 * @param {"environment"|".env.test"|".env"|undefined} [args.source]  Where dbName came from.
 * @param {boolean} [args.envTestExists]     Whether Servers/.env.test exists.
 */
function assertSafeTestDatabase({ dbName, devDbName, envTestPath, source, envTestExists = true }) {
  const fix = fixAdvice({ source, envTestPath, envTestExists });

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
 * @param {{ source?: "environment"|".env.test"|".env", envTestPath: string, envTestExists?: boolean }} [args.origin]
 *   Where this process's DB_NAME came from, when known, to point at the fix.
 */
function assertSafeToTruncate({ currentDb, devDbName, origin }) {
  const fix =
    "Run integration tests with `npm run test:integration` (or jest.integration.config.js). " +
    (origin
      ? fixAdvice(origin)
      : "Point DB_NAME in Servers/.env.test (or the environment) at a dedicated test " +
        "database, e.g. verifywise_test.");

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
  fixAdvice,
  isTestDatabaseName,
  readDevDbName,
};
