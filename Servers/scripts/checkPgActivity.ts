import { Client } from "pg";

async function main() {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || "5432");
  const database = process.env.DB_NAME || "verifywise_test";

  if (!user || !password) {
    console.error("Error: DB_USER and DB_PASSWORD environment variables must be set.");
    console.error(
      "Example: DB_USER=postgres DB_PASSWORD=yourpassword npx ts-node scripts/checkPgActivity.ts",
    );
    process.exit(1);
  }

  const client = new Client({
    user,
    password,
    host,
    port,
    database,
  });
  await client.connect();
  const res = await client.query(
    `SELECT pid, state, query_start, query
     FROM pg_stat_activity
     WHERE datname = $1`,
    [database],
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
