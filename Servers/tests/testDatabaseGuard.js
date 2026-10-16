/**
 * Guard for the integration suite's target database.
 *
 * The suite truncates every table it touches, so it may only ever run against
 * a dedicated test database. One rule (checkDatabaseName) decides that: the
 * database
 *
 *   1. is named, with a non-blank name (an exported empty DB_NAME makes pg
 *      connect to the database named after the user);
 *   2. is not the database Servers/.env names (the development database);
 *   3. has "test" or "tests" as a name token, optionally followed by digits,
 *      delimited by the start/end of the name, "_" or "-" (TEST_NAME_TOKEN):
 *      verifywise_test, verifywise_tests, verifywise_test2, verifywise_mrm_test
 *      and test_verifywise pass; verifywise_attestations, latest, contest_app,
 *      verifywise_testing_prod, verifywisetest and vw_testdb do not.
 *
 * It is checked in two places, both only under jest.integration.config.js:
 *
 *   - globalSetup (assertSafeTestDatabase), on DB_NAME, before it builds the
 *     backend or runs migrations;
 *   - database/db.ts's afterConnect hook (installConnectionGuard), on
 *     current_database() of every new connection the app's sequelize opens,
 *     uncached. db.ts installs it only when NODE_ENV=test and
 *     VERIFYWISE_INTEGRATION_GUARD=1, which jest.integration.config.js sets.
 *
 * Raw pg clients or other Sequelize instances a suite creates itself are not
 * covered; nothing in tests/integration does that today.
 */

const path = require("node:path");
const { readEnvFile, SERVERS_ROOT } = require("../database/config/loadEnv");

/** "test"/"tests" (+ optional digits) as a whole token, delimited by start/end, "_" or "-". */
const TEST_NAME_TOKEN = /(^|[_-])tests?\d*([_-]|$)/i;

/** DB_NAME from Servers/.env (the development database), or undefined if there is no such file. */
function readDevDbName() {
  return readEnvFile(path.join(SERVERS_ROOT, ".env"))?.DB_NAME;
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
 * @returns {"unnamed"|"blank"|"development"|"not-test"|null}
 */
function checkDatabaseName({ name, devDbName }) {
  if (name === undefined || name === null) return "unnamed";
  if (!name.trim()) return "blank";
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
 * Where DB_NAME came from (loadEnv's dbNameSource) and how to fix it there.
 *
 * @param {object} origin
 * @param {"environment"|".env.test"|".env"|undefined} origin.source
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
 * globalSetup's check of DB_NAME, before anything touches the database.
 *
 * @param {object} args
 * @param {string|undefined} args.dbName     Target database (process.env.DB_NAME).
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 * @param {string} args.envTestPath          Absolute path to Servers/.env.test, for messages.
 * @param {"environment"|".env.test"|".env"|undefined} [args.source]  loadEnv's dbNameSource.
 * @param {boolean} [args.envTestExists]     Whether Servers/.env.test exists.
 */
function assertSafeTestDatabase({ dbName, devDbName, envTestPath, source, envTestExists = true }) {
  const fix = fixAdvice({ source, envTestPath, envTestExists });

  switch (checkDatabaseName({ name: dbName, devDbName })) {
    case "unnamed":
      throw new Error(`Integration tests have no target database: DB_NAME is not set.\n${fix}`);
    case "blank":
      throw new Error(
        "Integration tests have no target database: DB_NAME is set but empty, so Postgres " +
          `would connect to the database named after DB_USER.\n${fix}`,
      );
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

const CONNECTION_FIX =
  "Run integration tests with `npm run test:integration`, and point DB_NAME at a dedicated " +
  "test database, e.g. verifywise_test (exported DB_NAME > Servers/.env.test > Servers/.env).";

/**
 * The check on a live connection, before it is used or truncated.
 *
 * @param {object} args
 * @param {string|undefined} args.currentDb  SELECT current_database() on the live connection.
 * @param {string|undefined} args.devDbName  DB_NAME from Servers/.env, if that file exists.
 */
function assertSafeToTruncate({ currentDb, devDbName }) {
  switch (checkDatabaseName({ name: currentDb, devDbName })) {
    case "unnamed":
    case "blank":
      throw new Error(
        `Refusing to truncate: could not tell which database is connected.\n${CONNECTION_FIX}`,
      );
    case "development":
      throw new Error(
        `Refusing to truncate "${currentDb}": it is the same database as Servers/.env (the ` +
          `development database).\n${CONNECTION_FIX}`,
      );
    case "not-test":
      throw new Error(`Refusing to truncate "${currentDb}": ${NOT_TEST_RULE}.\n${CONNECTION_FIX}`);
    default:
  }
}

/**
 * afterConnect hook body: asks the new raw pg connection which database it
 * reached, every time (pools are small), and closes a refused connection
 * before throwing — sequelize leaves a connection open when the hook fails.
 *
 * @param {{ query: (sql: string) => Promise<{ rows: { name?: string }[] }>, end?: () => unknown }} connection
 */
async function assertConnectionIsTestDatabase(connection) {
  try {
    const result = await connection.query("SELECT current_database() AS name");
    assertSafeToTruncate({ currentDb: result.rows[0]?.name, devDbName: readDevDbName() });
  } catch (error) {
    try {
      await connection.end?.();
    } catch {
      // The refusal is what matters; the connection is unusable either way.
    }
    throw error;
  }
}

/** Called by database/db.ts under the integration config only. */
function installConnectionGuard(sequelize) {
  sequelize.addHook("afterConnect", "integrationTestDatabaseGuard", assertConnectionIsTestDatabase);
}

module.exports = {
  assertConnectionIsTestDatabase,
  assertSafeTestDatabase,
  assertSafeToTruncate,
  checkDatabaseName,
  installConnectionGuard,
  isTestDatabaseName,
  readDevDbName,
};
