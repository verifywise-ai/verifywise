const path = require("path");
const dotenv = require("dotenv");

/**
 * Servers/ (the directory holding .env and .env.test), from this file. The
 * compiled copy lives under dist/database/config/, so step out of dist/.
 */
const root = path.resolve(__dirname, "../..");
const SERVERS_ROOT = path.basename(root) === "dist" ? path.dirname(root) : root;

/**
 * Load environment files into process.env.
 *
 * Under NODE_ENV=test the precedence is: variables already exported in the
 * environment > Servers/.env.test > Servers/.env. dotenv never overwrites a
 * variable that is already set, so loading .env.test first and .env second,
 * both without override, gives exactly that order. An explicit
 * `DB_NAME=... npx jest` therefore still wins, and CI (no files, DB_* injected)
 * is unaffected.
 *
 * This has to run before anything reads DB_*: database/config/config.js
 * captures them at import time. Loading .env.test later (db.ts used to) never
 * reached the connection, so a plain `npx jest <pattern>` that matched an
 * integration file connected to the development database and truncated it
 * (2026-10-15).
 *
 * Outside NODE_ENV=test this is the plain `dotenv.config()` it always was
 * (Servers/.env from the working directory), so development and production
 * are unchanged.
 *
 * @param {object} [options]
 * @param {string|undefined} [options.nodeEnv]  Defaults to process.env.NODE_ENV.
 * @param {string} [options.serversRoot]        Directory holding .env and .env.test.
 * @returns {{ envTestPath: string, envTestLoaded: boolean }}
 */
function loadEnv({ nodeEnv = process.env.NODE_ENV, serversRoot = SERVERS_ROOT } = {}) {
  const envTestPath = path.join(serversRoot, ".env.test");
  if (nodeEnv !== "test") {
    dotenv.config();
    return { envTestPath, envTestLoaded: false };
  }
  const envTest = dotenv.config({ path: envTestPath });
  dotenv.config({ path: path.join(serversRoot, ".env") });
  return { envTestPath, envTestLoaded: !envTest.error };
}

module.exports = { loadEnv, SERVERS_ROOT };
