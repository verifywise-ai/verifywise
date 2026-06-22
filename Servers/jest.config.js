const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset({
  diagnostics: false,
}).transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  testPathIgnorePatterns: ["/helpers/"],
  moduleNameMapper: {
    "^http-proxy-middleware$": "<rootDir>/tests/integration/__mocks__/http-proxy-middleware.js",
    "^jsdom$": "<rootDir>/tests/integration/__mocks__/jsdom.js",
    "^\.\/routes\/automation\.route\.js$": "<rootDir>/routes/automation.route.ts",
  },
  forceExit: true,
};
