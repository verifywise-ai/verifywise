const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { execSync } = require("node:child_process");
const { assertSafeTestDatabase, readDevDbName } = require("../testDatabaseGuard");

module.exports = async function globalSetup() {
  const envTestPath = path.resolve(__dirname, "../../.env.test");
  // override matches database/config/config.js, so the name checked below is
  // the one the test workers will connect to.
  const loaded = dotenv.config({ path: envTestPath, override: true });

  // Refuse to run against the development database.
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
  assertSafeTestDatabase({ dbName, devDbName, envTestPath, hasEnvTest: !loaded.error });

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
