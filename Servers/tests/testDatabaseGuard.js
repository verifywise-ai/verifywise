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
 * dotenv does not overwrite variables already present in process.env, so an
 * explicitly exported DB_NAME survives .env being loaded later by the app — the
 * name checked here is the name the app's sequelize instance will use.
 */

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

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const SERVERS_DIR = path.resolve(__dirname, "..");
const INTEGRATION_DIR = `${path.sep}tests${path.sep}integration${path.sep}`;

/**
 * DB_NAME from a dotenv file, or undefined when the file is absent or does not name one. Only the
 * name is read, so nothing else in the file is kept.
 */
function dbNameInFile(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return dotenv.parse(fs.readFileSync(filePath, "utf8")).DB_NAME || undefined;
}

/** DB_NAME from Servers/.env: the development database, which no test may truncate. */
function devDatabaseName(serversDir = SERVERS_DIR) {
  return dbNameInFile(path.join(serversDir, ".env"));
}

/**
 * The database a test process will use, as database/db.ts resolves it: DB_NAME from the environment
 * (dotenv never overwrites a variable that is set), else the DB_NAME of Servers/.env.test when
 * NODE_ENV is "test" (that file overrides), else the DB_NAME of Servers/.env.
 */
function effectiveDatabaseName(env = process.env, serversDir = SERVERS_DIR) {
  const fromTestFile =
    env.NODE_ENV === "test" ? dbNameInFile(path.join(serversDir, ".env.test")) : undefined;
  return fromTestFile ?? (env.DB_NAME || undefined) ?? dbNameInFile(path.join(serversDir, ".env"));
}

/**
 * Called before each test file runs (tests/integrationDatabaseSetup.js). The guard in globalSetup
 * covers `npm run test:integration`, but a plain `npx jest <pattern>` runs the integration files under
 * the default config, with no globalSetup, against the database of Servers/.env, and their
 * afterEach truncates it (2026-11-01: 108 fixture organizations in a developer's database). Files
 * outside tests/integration/ are not checked.
 *
 * @param {object} args
 * @param {string} args.testPath      Absolute path of the test file about to run.
 * @param {NodeJS.ProcessEnv} [args.env]
 * @param {string} [args.serversDir]
 */
function assertSafeIntegrationRun({ testPath, env = process.env, serversDir = SERVERS_DIR }) {
  if (typeof testPath !== "string" || !testPath.includes(INTEGRATION_DIR)) return;
  // A file that reaches no database at all (none is named anywhere) has nothing to protect: only
  // the target that is the development database is refused here, as globalSetup refuses it.
  const dbName = effectiveDatabaseName(env, serversDir);
  if (dbName === undefined) return;
  if (dbName === devDatabaseName(serversDir)) {
    throw new Error(
      `Refusing to run ${path.basename(testPath)}: its database is "${dbName}", the same database ` +
        "as Servers/.env.\n" +
        "The integration suite truncates every table it touches, and a plain `npx jest <pattern>` " +
        "runs these files against the database that Servers/.env names (a developer's local data " +
        "was destroyed that way on 2026-07-28, and 108 fixture organizations were written into one " +
        "on 2026-11-01).\n" +
        "Run them with `npm run test:integration` and a dedicated DB_NAME, or leave tests/integration " +
        "out of the run (`--testPathIgnorePatterns=/tests/integration/`).",
    );
  }
  assertSafeTestDatabase({
    dbName,
    devDbName: devDatabaseName(serversDir),
    envTestPath: path.join(serversDir, ".env.test"),
    hasEnvTest: false,
  });
}

/**
 * Called before a destructive statement, with the name of the database the connection is really
 * on. It catches what the environment check cannot: a connection that was configured some other way.
 *
 * @param {object} args
 * @param {string|undefined} args.connectedDbName
 * @param {string} [args.serversDir]
 */
function assertConnectedDatabaseIsNotDev({ connectedDbName, serversDir = SERVERS_DIR }) {
  assertSafeTestDatabase({
    dbName: connectedDbName,
    devDbName: devDatabaseName(serversDir),
    envTestPath: path.join(serversDir, ".env.test"),
    hasEnvTest: false,
  });
}

module.exports = {
  assertSafeTestDatabase,
  assertSafeIntegrationRun,
  assertConnectedDatabaseIsNotDev,
  effectiveDatabaseName,
  devDatabaseName,
};
