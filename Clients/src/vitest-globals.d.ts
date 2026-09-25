/// <reference path="../node_modules/vitest/globals.d.ts" />

// Type augmentation for @testing-library/jest-dom matchers under Vitest 5.
// jest-dom's own vitest augmentation (types/vitest.d.ts) targets Vitest 4's
// single-generic `Assertion<T>` shape; Vitest 5 declares
// `Assertion<R extends void | Promise<void> = void, T = unknown>`, so the
// published augmentation no longer merges. We re-declare it here with the
// matching signature, reusing jest-dom's TestingLibraryMatchers type from
// its public "/matchers" entry point (runtime registration happens in
// src/test/setup.ts via `import "@testing-library/jest-dom"`).
import jestDomMatchers from "@testing-library/jest-dom/matchers";

type JestDomMatchers<R> = jestDomMatchers.TestingLibraryMatchers<any, R>;

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends JestDomMatchers<R> {}
  interface AsymmetricMatchersContaining extends JestDomMatchers<any> {}
}
