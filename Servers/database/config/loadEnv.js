const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

/**
 * Servers/ (the directory holding .env and .env.test), from this file. The
 * compiled copy lives under dist/database/config/, so step out of dist/.
 */
const root = path.resolve(__dirname, "../..");
const SERVERS_ROOT = path.basename(root) === "dist" ? path.dirname(root) : root;

/** Parsed env file, or undefined when it does not exist. */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return undefined;
  return dotenv.parse(fs.readFileSync(file, "utf8"));
}

/** @type {{ key: string, result: ReturnType<typeof loadEnv> } | undefined} */
let loaded;

/**
 * Load environment files into process.env: the single loader for the backend.
 * index.ts and jobs/worker.ts import it (through ./env.js) first, and
 * config.js calls it before reading DB_* (it captures them at import time).
 *
 * Under NODE_ENV=test: variables already exported > Servers/.env.test >
 * Servers/.env. dotenv never overwrites a set variable, so loading .env.test
 * then .env, without override, gives that order, and an explicit
 * `DB_NAME=... npx jest` still wins. Which of the three set DB_NAME is
 * returned as dbNameSource, for the test-database guard's messages.
 *
 * Outside NODE_ENV=test: exactly what `import "dotenv/config"` did (the
 * working directory's .env, quiet unless DOTENV_QUIET/DOTENV_CONFIG_QUIET).
 *
 * Idempotent: a repeat call with the same options returns the first result.
 *
 * @param {object} [options]
 * @param {string|undefined} [options.nodeEnv]  Defaults to process.env.NODE_ENV.
 * @param {string} [options.serversRoot]        Directory holding .env and .env.test.
 * @param {string} [options.cwdEnvPath]         Outside NODE_ENV=test, the .env to load
 *   instead of the working directory's (tests only).
 * @returns {{ envTestPath: string, envTestLoaded: boolean,
 *   dbNameSource: "environment"|".env.test"|".env"|undefined }}
 */
function loadEnv({ nodeEnv = process.env.NODE_ENV, serversRoot = SERVERS_ROOT, cwdEnvPath } = {}) {
  const key = JSON.stringify([nodeEnv, serversRoot, cwdEnvPath]);
  if (loaded && loaded.key === key) return loaded.result;

  const quietEnv = process.env.DOTENV_QUIET ?? process.env.DOTENV_CONFIG_QUIET;
  const quiet = quietEnv ?? true;
  const envTestPath = path.join(serversRoot, ".env.test");

  let result;
  if (nodeEnv !== "test") {
    dotenv.config(cwdEnvPath ? { path: cwdEnvPath, quiet } : { quiet });
    result = { envTestPath, envTestLoaded: false, dbNameSource: undefined };
  } else {
    // Exported counts even when empty: dotenv keeps it, so pg would get it.
    let dbNameSource = process.env.DB_NAME !== undefined ? "environment" : undefined;
    const envTest = dotenv.config({ path: envTestPath, quiet });
    if (!dbNameSource && process.env.DB_NAME !== undefined) dbNameSource = ".env.test";
    dotenv.config({ path: path.join(serversRoot, ".env"), quiet });
    if (!dbNameSource && process.env.DB_NAME !== undefined) dbNameSource = ".env";
    result = { envTestPath, envTestLoaded: !envTest.error, dbNameSource };
  }
  loaded = { key, result };
  return result;
}

module.exports = { loadEnv, readEnvFile, SERVERS_ROOT };
