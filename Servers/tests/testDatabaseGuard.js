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

module.exports = { assertSafeTestDatabase };
