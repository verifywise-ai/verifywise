/**
 * Runs before every test file (setupFilesAfterEnv in jest.config.js). For a file under
 * tests/integration/ it refuses a target that is the database of Servers/.env, whatever started
 * Jest: see assertSafeIntegrationRun in testDatabaseGuard.js.
 */
const { assertSafeIntegrationRun } = require("./testDatabaseGuard");

assertSafeIntegrationRun({ testPath: expect.getState().testPath });
