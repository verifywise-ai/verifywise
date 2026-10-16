const base = require("./jest.config");

/**
 * Config for the database-backed suites under tests/integration/, which the
 * default jest.config.js excludes. Use it only through the package.json
 * scripts (test:integration, test:smoke, test:ratelimit) so the suites that
 * need a database also get globalSetup's guard and migrations.
 *
 * @type {import("jest").Config}
 */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["/helpers/"],
};
