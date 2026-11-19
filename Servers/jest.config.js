const { createDefaultPreset } = require("ts-jest");

// Transpile-only: tsconfig.jest.json sets isolatedModules, so ts-jest compiles
// each file on its own instead of building a TypeScript program per worker.
// Type errors are caught by `npm run build`, not by the test run.
const tsJestOptions = { diagnostics: false, tsconfig: "<rootDir>/tsconfig.jest.json" };

const tsJestTransformCfg = createDefaultPreset(tsJestOptions).transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  globalSetup: "<rootDir>/tests/compileDesignTokens.js",
  setupFiles: ["<rootDir>/utils/localStoragePolyfill.ts"],
  transform: {
    ...tsJestTransformCfg,
    // ai >= 7 and its transitive deps ship ESM-only builds, so Jest must
    // transform them. sanitize-html >= 2.17.7 pulls in ESM-only builds of
    // htmlparser2 v12 and its dom* / entities deps, so those need the same
    // treatment. @ai-sdk/provider-utils (via ai >= 7.0.171) imports
    // zod/v4/locales/en, which is ESM because zod is a type:module package,
    // so zod needs transforming too. transformIgnorePatterns below
    // allowlists those packages.
    "node_modules[\\\\/].+\\.js$": ["ts-jest", tsJestOptions],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(ai|@ai-sdk|@workflow|@standard-schema|sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|entities|domelementtype|zod)/)",
  ],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  testPathIgnorePatterns: ["/helpers/"],
  moduleNameMapper: {
    "^http-proxy-middleware$": "<rootDir>/tests/integration/__mocks__/http-proxy-middleware.js",
    "^jsdom$": "<rootDir>/tests/integration/__mocks__/jsdom.js",
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
