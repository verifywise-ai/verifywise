# Frontend Automated Test Plan

## 1. Document Control

- **Project:** VerifyWise
- **Repository:** https://verifywise.ai/
- **Version:** 1.0

## 2. Purpose

This document defines the automated testing approach for the frontend application using Vitest, Testing Library, and MSW for unit and integration tests, and Playwright for end-to-end tests. It describes what will be tested, how tests will be organized, quality gates, and how tests run in CI. Command names match the `scripts` section of `Clients/package.json`.

## 3. Scope

### 3.1 In Scope

- Unit tests for:
  - Utility functions
  - Hooks
  - State management logic (reducers/selectors)
  - Data transformation and validation logic
- Component tests for:
  - UI components (rendering, props, conditional states)
  - User interactions (click, type, submit, navigation)
  - Error and loading states
- Integration tests for:
  - Feature flows across multiple components
  - API interactions (mocked)
  - Form validation + submission flows
- End-to-end tests for:
  - User access the application
  - Authentication flow (login/logout)
  - Navigation between routes and protected routes
  - Core features flow

### 3.2 Out of Scope for now

- Cross-browser/device testing
- Performance/load testing
- Backend and infrastructure testing

## 4. Test Strategy

### 4.1 Test Levels

- **Unit:** isolated tests, no DOM if possible
- **Component:** React Testing Library (RTL), user-event
- **Integration:** RTL + mocked API layer, verifies feature flows

### 4.2 Guiding Principles

- Test behavior, not implementation details.
- Keep tests deterministic: no real network, no real time unless controlled.
- Minimize snapshots; use them only for stable UI output.
- Tests will be done inside each folder to facilitate the visualization of each file tested

## 5. Tooling

- **Test Runner:** Vitest
- **UI Testing:** Testing Library (`@testing-library/react`, `@testing-library/user-event`)
- **API Mocking:** MSW
- **End-to-end:** Playwright (`@playwright/test`)
- **Coverage:** Vitest coverage (`vitest run --coverage`)

### 6. Network Mocking

- Use **MSW** to mock API at the network level for component/integration tests.
- Unit tests may mock modules directly using `vi.mock()` when appropriate.

### 7. Naming Conventions

- ComponentName.test.tsx

## 8. Coverage Targets

- Overall thresholds:
  - Statements: 80%
  - Functions: 80%
  - Lines: 80%

## 9. CI/CD Execution

- Tests run on pull requests. Frontend unit and component tests use `npx vitest run` (see `.github/workflows/frontend-checks.yml`). End-to-end tests use Playwright (see `.github/workflows/e2e-tests.yml`).
- Commands (from `Clients/package.json`):
  - `npm run test` — `vitest watch`. Watch mode; the process does not exit.
  - `npx vitest run` — one-shot run. Use this when the process must exit (local checks and CI).
  - `npm run test:ci` and `npm run test:coverage` — `vitest run --coverage`
  - `npm run test:e2e` — `playwright test`
  - `npm run test:e2e:headed` — `playwright test --headed`
  - `npm run test:e2e:debug` — `playwright test --debug`
- Artifacts:
  - Coverage summary

## 10. Deliverables

- `PLAN_TESTS.md` (this document)
- Coverage report in CI
- Test results summary in PR checks
