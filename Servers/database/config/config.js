const path = require("path");
const dotenv = require("dotenv");

// Under NODE_ENV=test, Servers/.env.test must win over Servers/.env, and it has
// to be loaded here: this module captures DB_NAME at import time, so loading
// .env.test anywhere later (db.ts used to) never reaches the connection. A plain
// `npx jest <pattern>` that matched an integration file therefore connected to
// the development database and truncated it (2026-10-15). Resolved from this
// file so it does not depend on cwd; the dist/ hop covers the compiled copy.
if (process.env.NODE_ENV === "test") {
  const root = path.resolve(__dirname, "../..");
  const serversRoot = path.basename(root) === "dist" ? path.dirname(root) : root;
  dotenv.config({ path: path.join(serversRoot, ".env.test"), override: true });
}
dotenv.config();

// RLS Phase 2 runtime-role split (docs/technical/security/rls-rollout.md):
// when enforcement is enabled AND dedicated app-role credentials exist, the
// runtime connects as the non-owner `verifywise_app` role so the Phase 1 RLS
// policies apply to it. The owner role (DB_USER/DB_PASSWORD) remains the
// migration/maintenance role — run migrations with the flag off.
const rlsEnabled = (process.env.RLS_ENFORCEMENT_ENABLED ?? "").trim().toLowerCase() === "true";
const useAppRole = rlsEnabled && !!process.env.DB_APP_USER;
const username = useAppRole ? process.env.DB_APP_USER : process.env.DB_USER;
const password = useAppRole ? process.env.DB_APP_PASSWORD : process.env.DB_PASSWORD;

module.exports = {
  development: {
    username,
    password,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    schema: "verifywise",
    migrationStorageTableSchema: "verifywise",
  },
  test: {
    username,
    password,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    schema: "verifywise",
    migrationStorageTableSchema: "verifywise",
  },
  production: {
    username,
    password,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    schema: "verifywise",
    migrationStorageTableSchema: "verifywise",
    ...(process.env.DB_SSL === "true"
      ? {
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: process.env.REJECT_UNAUTHORIZED === "true",
            },
          },
        }
      : {
          dialectOptions: {
            ssl: false,
          },
        }),
  },
};
