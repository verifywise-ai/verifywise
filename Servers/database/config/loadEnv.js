const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

/**
 * Servers/ (the directory holding .env and .env.test), from this file. The
 * compiled copy lives under dist/database/config/, so step out of dist/.
 */
const root = path.resolve(__dirname, "../..");
const SERVERS_ROOT = path.basename(root) === "dist" ? path.dirname(root) : root;

/**
 * Where DB_NAME came from, carried to child processes (jest workers, the
 * sequelize CLI) so they report the original source instead of "exported".
 * Format: "<source>:<DB_NAME>". Trusted only while DB_NAME still matches.
 */
const SOURCE_MARKER = "VERIFYWISE_DB_NAME_SOURCE";

/** @typedef {"environment"|".env.test"|".env"} EnvSource */

/** Same default as `import "dotenv/config"`: quiet unless DOTENV_QUIET / DOTENV_CONFIG_QUIET say otherwise. */
function quietOption(env) {
  const quiet = env.DOTENV_QUIET != null ? env.DOTENV_QUIET : env.DOTENV_CONFIG_QUIET;
  return quiet != null ? quiet : true;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return undefined;
  return dotenv.parse(fs.readFileSync(file, "utf8"));
}

/** A DB_NAME already in the environment: really exported, or inherited from a parent's loadEnv. */
function exportedSource(env) {
  const marker = env[SOURCE_MARKER];
  if (marker) {
    const sep = marker.indexOf(":");
    const source = marker.slice(0, sep);
    if (marker.slice(sep + 1) === env.DB_NAME && (source === ".env.test" || source === ".env")) {
      return source;
    }
  }
  return "environment";
}

/**
 * Which value DB_NAME resolves to under NODE_ENV=test for a process started
 * with `env`, and where it comes from, without loading anything: exported >
 * Servers/.env.test > Servers/.env. It only reads the two files, so it can
 * also answer for a child process before it is spawned.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]   Environment the process starts with.
 * @param {string} [options.serversRoot]      Directory holding .env and .env.test.
 * @returns {{ dbName: string|undefined, source: EnvSource|undefined, envTestPath: string, envTestExists: boolean }}
 */
function resolveTestDbName({ env = process.env, serversRoot = SERVERS_ROOT } = {}) {
  const envTestPath = path.join(serversRoot, ".env.test");
  const fromEnvTest = readEnvFile(envTestPath);
  const envTestExists = fromEnvTest !== undefined;

  if (env.DB_NAME) {
    return { dbName: env.DB_NAME, source: exportedSource(env), envTestPath, envTestExists };
  }
  if (fromEnvTest && fromEnvTest.DB_NAME) {
    return { dbName: fromEnvTest.DB_NAME, source: ".env.test", envTestPath, envTestExists };
  }
  const fromEnv = readEnvFile(path.join(serversRoot, ".env"));
  if (fromEnv && fromEnv.DB_NAME) {
    return { dbName: fromEnv.DB_NAME, source: ".env", envTestPath, envTestExists };
  }
  return { dbName: undefined, source: undefined, envTestPath, envTestExists };
}

/** @type {ReturnType<typeof loadEnv> | undefined} */
let loaded;

/**
 * Load environment files into process.env. The single loader for the backend:
 * index.ts and jobs/worker.ts import it (through ./env.js) before anything
 * else, and database/config/config.js calls it before reading DB_*.
 *
 * Under NODE_ENV=test the precedence is: variables already exported in the
 * environment > Servers/.env.test > Servers/.env. dotenv never overwrites a
 * variable that is already set, so loading .env.test first and .env second,
 * both without override, gives exactly that order. An explicit
 * `DB_NAME=... npx jest` therefore still wins, and CI (no files, DB_* injected)
 * is unaffected. Where DB_NAME came from is recorded (dbNameSource) for the
 * test-database guard's messages.
 *
 * This has to run before anything reads DB_*: config.js captures them at
 * import time. The entry points used to `import "dotenv/config"` first, which
 * loaded Servers/.env before this ran, so .env.test could never win for the
 * API or the worker (and a NODE_ENV=test backend for local E2E used the dev
 * database).
 *
 * Outside NODE_ENV=test this is exactly what `import "dotenv/config"` did: the
 * working directory's .env, quiet by default.
 *
 * Idempotent: a call without options returns the first call's result without
 * loading again. Calls with options (tests, globalSetup) always load; loading
 * twice is harmless because nothing is overridden.
 *
 * @param {object} [options]
 * @param {string|undefined} [options.nodeEnv]  Defaults to process.env.NODE_ENV.
 * @param {string} [options.serversRoot]        Directory holding .env and .env.test.
 * @param {string} [options.cwdEnvPath]         Outside NODE_ENV=test, the .env to load
 *   instead of the working directory's (tests only).
 * @returns {{ envTestPath: string, envTestLoaded: boolean, dbNameSource: EnvSource|undefined }}
 */
function loadEnv(options) {
  if (!options && loaded) return loaded;
  const { nodeEnv = process.env.NODE_ENV, serversRoot = SERVERS_ROOT, cwdEnvPath } = options || {};
  const quiet = quietOption(process.env);
  const envTestPath = path.join(serversRoot, ".env.test");

  let result;
  if (nodeEnv !== "test") {
    dotenv.config(cwdEnvPath ? { path: cwdEnvPath, quiet } : { quiet });
    result = { envTestPath, envTestLoaded: false, dbNameSource: undefined };
  } else {
    const { source } = resolveTestDbName({ env: process.env, serversRoot });
    const envTest = dotenv.config({ path: envTestPath, quiet });
    dotenv.config({ path: path.join(serversRoot, ".env"), quiet });
    if (source && process.env.DB_NAME) {
      process.env[SOURCE_MARKER] = `${source}:${process.env.DB_NAME}`;
    }
    result = { envTestPath, envTestLoaded: !envTest.error, dbNameSource: source };
  }
  if (!options) loaded = result;
  return result;
}

module.exports = { loadEnv, resolveTestDbName, SERVERS_ROOT, SOURCE_MARKER };
