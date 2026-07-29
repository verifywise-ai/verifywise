const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { execSync } = require("node:child_process");

module.exports = async function globalSetup() {
  const envTestPath = path.resolve(__dirname, "../../.env.test");
  const loaded = dotenv.config({ path: envTestPath });

  // Refuse to run against the development database.
  //
  // This suite truncates every table it touches. When .env.test is absent,
  // dotenv fails silently, Servers/database/db.ts cannot override DB_NAME, and
  // the app's sequelize instance — the one cleanupDatabase() uses — points at
  // whatever .env says. On 2026-07-28 that destroyed a developer's local data.
  // .env.test is gitignored, so a fresh clone hits exactly this path.
  if (loaded.error) {
    throw new Error(
      `Integration tests need ${envTestPath}, which does not exist.\n` +
        "Without it the suite truncates the database named in Servers/.env — your development data.\n" +
        "Create it by copying Servers/.env and setting DB_NAME to a dedicated test database, e.g. verifywise_test.",
    );
  }

  const dbName = process.env.DB_NAME;
  if (!dbName) {
    throw new Error(`${envTestPath} does not set DB_NAME. Refusing to run: see the note above.`);
  }

  // Second belt: .env.test could exist and still name the dev database.
  const devEnv = dotenv.parse(
    require("node:fs").readFileSync(path.resolve(__dirname, "../../.env"), "utf8"),
  );
  if (devEnv.DB_NAME && devEnv.DB_NAME === dbName) {
    throw new Error(
      `Refusing to run: .env.test sets DB_NAME="${dbName}", the same database as Servers/.env.\n` +
        "The integration suite truncates it. Point .env.test at a dedicated test database.",
    );
  }

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
