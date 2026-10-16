const base = require("./jest.config");

/**
 * The rate-limiter verification suites (npm run test:ratelimit). They mock the
 * limiter store and need no database, and CI runs them in a job that has none,
 * so this config deliberately has no globalSetup (which would build, migrate
 * and demand a test database) and no database guard setup file.
 *
 * limiter-wiring is excluded: it builds the real app, which needs a database
 * and ENCRYPTION_KEY, so it runs with jest.integration.config.js instead.
 *
 * @type {import("jest").Config}
 */
module.exports = {
  ...base,
  testMatch: ["**/tests/integration/rate-limiting/**/*.test.ts"],
  testPathIgnorePatterns: ["/helpers/", "limiter-wiring"],
};
