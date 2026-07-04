const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { execSync } = require("node:child_process");

module.exports = async function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

  const dbName = process.env.DB_NAME || "verifywise_test";

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
