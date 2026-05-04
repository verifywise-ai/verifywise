# Frontend Automated Test Plan

## 1. Document Control

- **Project:** VerifyWise
- **Repository:** https://verifywise.ai/
- **Version:** 1.0

## 2. Purpose

This document defines the automated testing approach for the frontend application using Jest, React Testing Library, User Event (and related tooling) for unit and integration tests and Playwright to E2E tests. It describes what will be tested, how tests will be organized, quality gates, and how tests run in CI.

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

- **Test Runner:** Jest
- **UI Testing:** React Testing Library + @testing-library/user-event
- **API Mocking:** MSW (preferred) or jest mocks
- **Coverage:** Jest coverage reports
- **Optional:** jest-axe for accessibility checks

### 6. Network Mocking

- Use **MSW** to mock API at the network level for component/integration tests.
- Unit tests may mock modules directly using `jest.mock()` when appropriate.

### 7. Naming Conventions

- ComponentName.test.tsx

## 8. Coverage Targets

- Overall thresholds:
  - Statements: 80%
  - Functions: 80%
  - Lines: 80%

## 9. CI/CD Execution

- TODO all implementations bellow after tests be runnning;
- Tests run on:
  - Pull requests (required)
  - Main branch merges
- Commands:
  - `test` (fast feedback)
  - `test:ci` (coverage + reporting)
- Artifacts:
  - Coverage summary

## 10. Deliverables

- `TEST_PLAN.md` (this document)
- Coverage report in CI
- Test results summary in PR checks
