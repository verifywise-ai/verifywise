import { Client } from "pg";

async function main() {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || "5432");

  if (!user || !password) {
    console.error("Error: DB_USER and DB_PASSWORD environment variables must be set.");
    console.error(
      "Example: DB_USER=postgres DB_PASSWORD=yourpassword npx ts-node scripts/resetTestDb.ts",
    );
    process.exit(1);
  }

  const admin = new Client({
    user,
    password,
    host,
    port,
    database: "postgres",
  });
  await admin.connect();

  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = 'verifywise_test' AND pid <> pg_backend_pid()`,
  );

  await admin.query(`DROP DATABASE IF EXISTS "verifywise_test"`);
  await admin.query(`CREATE DATABASE "verifywise_test"`);

  console.log("verifywise_test reset");
  await admin.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
