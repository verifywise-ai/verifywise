const dotenv = require("dotenv");

// Load .env files from CWD (Servers/) so this works whether running from
// source or from dist/.  db.ts also loads these, but config.js is imported
// first (as an ES import) and captures process.env at module-load time,
// so we must load here too.
dotenv.config();
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: envFile, override: true });

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    schema: "verifywise",
    migrationStorageTableSchema: "verifywise",
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    schema: "verifywise",
    migrationStorageTableSchema: "verifywise",
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
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
