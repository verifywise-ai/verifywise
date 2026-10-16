const base = require("./jest.config");

/**
 * Config for the database-backed suites under tests/integration/, which the
 * default jest.config.js excludes.
 *
 * globalSetup and the guard setup file live here, not on the npm script
 * command lines, so every use of this config is guarded, including a direct
 * `npx jest --config jest.integration.config.js <file>`:
 *
 *   - globalSetup refuses anything but a dedicated test database before it
 *     builds the backend or runs migrations;
 *   - setupDatabaseGuard.ts checks current_database() on every connection the
 *     app's sequelize opens, before a suite can seed, DELETE or TRUNCATE.
 *
 * The rate-limiter suites need no database and run in CI without one, so
 * test:ratelimit uses jest.ratelimit.config.js, which has neither.
 *
 * @type {import("jest").Config}
 */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["/helpers/"],
  globalSetup: "<rootDir>/tests/integration/globalSetup.js",
  setupFilesAfterEnv: [
    ...(base.setupFilesAfterEnv ?? []),
    "<rootDir>/tests/integration/setupDatabaseGuard.ts",
  ],
};
