import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
      // React Compiler rules that predate the working lint hook (hundreds of
      // existing findings). Warn so they stay visible without blocking
      // commits; raise each back to "error" once its findings are fixed.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
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
        {
          selector: "Literal[value=/^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/]",
          message: "Use a theme token instead of a hardcoded color. See StyleGuide → Tokens.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Needs `new Error(msg, { cause })`, which the ES2020 lib in
      // tsconfig.app.json does not type.
      "preserve-caught-error": "off",
    },
  },
  {
    // Declaration files augment third-party types (MUI theme, Vitest
    // matchers): empty extending interfaces, unused generic parameters that
    // must match the original declaration, and triple-slash references are
    // how that is done.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    // palette.ts, the StyleGuide, and tests still contain color literals
    // (chart, editor, swatches, fixtures). Scale hex lives in
    // shared/design-tokens/primitives.ts and palette.ts. Product screens keep the hex rule as a
    // warning so the existing backlog does not fail lint.
    files: [
      "src/presentation/themes/palette.ts",
      "src/presentation/pages/StyleGuide/**/*.{ts,tsx}",
      "**/*.{test,spec}.{ts,tsx}",
      "**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
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
    },
  },
  {
    // Playwright: fixtures receive a `use` callback (not React's `use`) and
    // take an empty `{}` when they need no other fixtures.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "no-empty-pattern": "off",
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
);
