const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset({
  diagnostics: false,
}).transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/utils/localStoragePolyfill.ts"],
  transform: {
    ...tsJestTransformCfg,
    // ai >= 7 and its transitive deps ship ESM-only builds, so Jest must
    // transform them. sanitize-html >= 2.17.7 pulls in ESM-only builds of
    // htmlparser2 v12 and its dom* / entities deps, so those need the same
    // treatment. transformIgnorePatterns below allowlists those packages.
    "node_modules[\\\\/].+\\.js$": ["ts-jest", { diagnostics: false }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(ai|@ai-sdk|@workflow|@standard-schema|sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|entities|domelementtype)/)",
  ],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  // tests/integration/ truncates the database it connects to, so a plain
  // `npx jest <pattern>` must never pick it up: on 2026-10-15 `npx jest
  // reporting` matched an integration file, skipped globalSetup's guard and
  // wiped the development database. The integration scripts use
  // jest.integration.config.js, which lifts this exclusion.
  testPathIgnorePatterns: ["/helpers/", "/tests/integration/"],
  moduleNameMapper: {
    "^http-proxy-middleware$": "<rootDir>/tests/integration/__mocks__/http-proxy-middleware.js",
    "^jsdom$": "<rootDir>/tests/integration/__mocks__/jsdom.js",
    "^\.\/routes\/automation\.route\.js$": "<rootDir>/routes/automation.route.ts",
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text", "html", "json-summary"],
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/", "/tests/", "/coverage/"],
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 25,
      functions: 25,
      lines: 40,
    },
  },
  forceExit: true,
};
