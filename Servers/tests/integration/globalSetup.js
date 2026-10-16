const { Client } = require("pg");
const { execSync } = require("node:child_process");
const { loadEnv } = require("../../database/config/loadEnv");
const { assertSafeTestDatabase, readDevDbName } = require("../testDatabaseGuard");

module.exports = async function globalSetup() {
  // Same loader and precedence as database/config/config.js (exported env >
  // .env.test > .env), so the name checked below is the one the test workers
  // will connect to. The workers inherit this process's environment, including
  // the record of where DB_NAME came from (for the guard's messages).
  const { envTestPath, envTestLoaded, dbNameSource } = loadEnv({ nodeEnv: "test" });

  // Refuse to run against anything but a dedicated test database, before the
  // build and migrations below touch it.
  //
  // This suite truncates every table it touches, and .env.test is gitignored,
  // so a fresh clone can easily end up pointing at the development database —
  // on 2026-07-28 that destroyed a developer's local data.
  //
  // The check is on the database name, not on whether .env.test exists: CI has
  // neither that file nor Servers/.env and injects DB_* into the environment,
  // where a file-existence check fails while proving nothing about what is
  // about to be truncated. See tests/testDatabaseGuard.js.
  const devDbName = readDevDbName();

  const dbName = process.env.DB_NAME;
  assertSafeTestDatabase({
    dbName,
    devDbName,
    envTestPath,
    source: dbNameSource,
    envTestExists: envTestLoaded,
  });

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: "postgres",
  });

  await client.connect();

  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (res.rows.length === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }

  await client.end();

  execSync("npm run build", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });

  execSync("npx sequelize db:migrate", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
};
