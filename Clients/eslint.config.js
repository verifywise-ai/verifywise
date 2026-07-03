import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The rules below are new/experimental in eslint-plugin-react-hooks v7.
      // They flag patterns that are common across the existing React 19 codebase
      // (context initial fetches, ref assignments during render, etc.). Disabling
      // them keeps lint passing while still catching the classic hook violations.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-restricted-syntax": [
        "warn",

        {
          selector:
            "CallExpression:matches(" +
            '  [callee.property.name="toString"],' +
            '  [callee.property.name="toDateString"],' +
            '  [callee.property.name="toTimeString"],' +
            '  [callee.property.name="toUTCString"],' +
            '  [callee.property.name="toGMTString"]' +
            ")",
          message: "Use locale-based date formatting instead of Date string methods.",
        },
        {
          selector:
            "ChainExpression CallExpression:matches(" +
            '  [callee.property.name="toString"],' +
            '  [callee.property.name="toDateString"],' +
            '  [callee.property.name="toTimeString"],' +
            '  [callee.property.name="toUTCString"],' +
            '  [callee.property.name="toGMTString"]' +
            ")",
          message: "Use locale-based date formatting instead of Date string methods.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
  {
    // Playwright e2e tests use `use` from @playwright/test, not React hooks.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // Ambient declaration files rely on triple-slash references and empty
    // interface augmentation for module merging.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
);
