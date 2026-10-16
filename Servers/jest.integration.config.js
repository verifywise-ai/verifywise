const base = require("./jest.config");

/**
 * Config for the database-backed suites under tests/integration/, which the
 * default jest.config.js excludes. Every use of this config is guarded,
 * including a direct `npx jest --config jest.integration.config.js <file>`:
 *
 *   - globalSetup refuses anything but a dedicated test database before it
 *     builds the backend or runs migrations;
 *   - the flag below makes database/db.ts check current_database() on every
 *     new connection its sequelize opens (tests/testDatabaseGuard.js), and
 *     close a refused one. Set here, at config load, so jest's test processes
 *     inherit it.
 *
 * The rate-limiter suites need no database and run in CI without one, so
 * test:ratelimit uses jest.ratelimit.config.js, which has neither.
 *
 * @type {import("jest").Config}
 */
process.env.VERIFYWISE_INTEGRATION_GUARD = "1";

module.exports = {
  ...base,
  testPathIgnorePatterns: ["/helpers/"],
  globalSetup: "<rootDir>/tests/integration/globalSetup.js",
};
