require("dotenv").config();

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
