/**
 * Central inventory of `data-testid` attributes used by the Playwright E2E
 * suite. Keeping the strings here (in the source tree) lets the frontend and
 * tests share a single source of truth.
 */

export const testIds = {
  overview: {
    newUseCaseButton: "new-use-case-button",
  },
  createProject: {
    titleInput: "create-project-title-input",
    ownerSelect: "create-project-owner-select",
    riskClassificationSelect: "create-project-risk-classification-select",
    highRiskRoleSelect: "create-project-high-risk-role-select",
    membersAutocomplete: "create-project-members-autocomplete",
    goalInput: "create-project-goal-input",
    submitButton: "create-project-submit-button",
  },
  deadlineBanner: {
    warningBanner: "deadline-warning-banner",
  },
} as const;

export type TestIds = typeof testIds;
