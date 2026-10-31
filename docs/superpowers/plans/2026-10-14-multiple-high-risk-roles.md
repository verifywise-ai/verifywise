# Multiple high-risk roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a use case hold the EU AI Act roles Provider, Deployer or both, and make every reader of the role (requirements filter, questionnaire, intake, screens, exports, automations, change history, API) work with the list.

**Architecture:** `projects.type_of_high_risk_role` (one enum value) becomes `projects.high_risk_roles TEXT[]`, stored normalised (no duplicates, Provider then Deployer). One backend helper module (`Servers/utils/highRiskRoles.utils.ts`) owns normalising, the derived legacy value, the SQL array fragment, the API write rule and intake answer resolution; every write path and every row leaving the data layer goes through it. The API keeps `type_of_high_risk_role` as a derived, deprecated field so existing clients keep working and cannot silently drop a role. The frontend gets a matching helper module and one shared multi-select field.

**Tech Stack:** Node 22, Express 4, TypeScript, Sequelize 6 (raw SQL), PostgreSQL, Jest 30, express-validator 7; React 19, MUI 7, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-multiple-high-risk-roles-design.md`

## Global Constraints

- Work on branch `feature/multiple-high-risk-roles`. Do not create branches or worktrees. Do not push. Do not open a PR.
- Stage files by explicit path only (`git add <paths>`). Never `git add -A` / `git add .`: the repo has many untracked files that must not be committed.
- One commit per task at least. Format `type(scope): description` plus a body saying what changed and why. Never mention Claude or AI in commits.
- Roles are exactly `Provider` and `Deployer` (`HighRiskRole` enum, unchanged). Stored and displayed order is Provider, then Deployer. Display separator is `", "` ("Provider, Deployer").
- The legacy single value is derived: `Provider` if the list contains Provider, `Deployer` if it contains only Deployer, `null` if empty.
- Write rule: `high_risk_roles` replaces the list; `type_of_high_risk_role: X` keeps the list when it already holds X, else sets `[X]`; `null` clears; both present and disagreeing → 400.
- Required message (frontend and backend validator): `Select at least one high-risk role when EU AI Act is selected.`
- Label for the field everywhere: `High-risk roles`.
- Migrations: generate the timestamp with `date +%Y%m%d%H%M%S`; use the `verifywise.` prefix in DDL; raw SQL via `queryInterface.sequelize.query` inside one transaction; run with `cd Servers && npm run build && npx sequelize db:migrate` (dev DB postgresql@16 on :5432, database `verifywise`); verify up, down, up.
- Never run the sequelize CLI against the test database by hand. The integration harness (`npm run test:integration`) migrates the test database itself; that is the only allowed path.
- Never write temporary `.ts` files under `Servers/` (`npm run watch` restarts the backend on any change). Scratch scripts and query outputs go in `/private/tmp/claude-501/-Users-gorkemcetin-verifywise/e99e65fd-3923-494e-9c4c-e3d01ce6cd1d/scratchpad/`.
- Application SQL uses unqualified table names and `organization_id` in every tenant query.
- Sequelize expands an array replacement into a comma list and turns `[]` into `NULL`. Never write `= ANY(:x)` or `SET col = :x` for an array. Use `highRiskRolesArraySql()` (Task 1), which returns `ARRAY[:name]::text[]` for a non-empty list and the literal `'{}'::text[]` for an empty one; never bind an empty array.
- UI: sentence case; VerifyWise components (`AutoCompleteField` with `multiple`, via the new `HighRiskRolesField`); theme values, no hardcoded colours; pixel-string spacing (`gap: "8px"`), never MUI numeric multipliers. Every new user-facing string needs de, fr and es entries in `Clients/src/i18n/translations.ts`.
- `Clients/src/presentation/components/CreateProjectForm` and `Clients/src/domain/interfaces/i.form.ts` (`CreateProjectFormValues`) are dead code; leave them alone.
- Backend gate, from the package dir: `cd Servers && npm run build && npm run format-check && npm run test`.
- Frontend gate, from the package dir: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx vitest run <paths>`. Do not use `npm run format-check` in Clients (untracked `Clients/dist-analyze` breaks it); run `npx prettier --check <changed files>` instead. Never grep-filter typecheck output.
- API docs gate: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`; enum gate: `cd Servers && npm run check:enum-drift`.
- User guide edits in `shared/user-guide-content/` are copied (not committed) to `~/website/verifywise/content/user-guide/content/`.
- Never commit competitor names or hints in code, comments, docs or commit messages; check the staged diff before each commit.
- Review is run by the controller after each task; implementers do not open PRs or run `/code-review` themselves.

## Deliberate decisions where the spec was loose

- **Saved single-role answers (spec §2).** The spec says `validateAnswers` accepts a string for any `multi_select` question. Two existing tests deliberately reject a string for other multi-select questions (`transparency`, `essential_services_use`). This plan adds `acceptsSingleValue: true` to the role question only, so a saved `"deployer"` validates and comes back as `["deployer"]` while the existing rule holds for every other question.
- **Empty list in the filter.** The spec says the filter "skips the role condition" for an empty list. This plan uses `r.name = ANY('{}'::text[])`, which matches nothing — the same result with one SQL shape and no empty-array binding.
- **Backend "EU AI Act → at least one role" rule.** `validateCompleteProjectWithBusinessRules` and `validateUpdateProjectWithBusinessRules` in `projectValidation.utils.ts` are not called by any route today (only `aiRiskClassificationIneligibility`, `extractFrameworkIds` and `EU_AI_ACT_FRAMEWORK_ID` are imported). The server has never enforced "role required with EU AI Act"; the forms do. This plan converts those functions to the list (so they stay correct and the final grep is clean) but does not wire them into routes: doing so would make previously valid API calls fail (success criterion 3) and would break intake approval of an "Out of scope" result, which attaches the EU AI Act framework with no role. Wiring it in is a separate decision for the user.
- **Use case list grouping by role** groups by role list: a use case with both roles appears in both the Provider and the Deployer group (`useTableGrouping` accepts a list); one with no role is in "Unknown".

## Review Focus

1. **A client that reads the derived `type_of_high_risk_role` and writes it back** (`PATCH {type_of_high_risk_role: "Provider"}` on a use case with both roles) must keep both roles. Pinned in Task 3, Step 1 (`keeps both roles when an older client writes back the derived role`).
2. **An empty role list reaching SQL** (a use case with no role in the requirements filter, a create with no role, a wizard result with no role) must not bind `[]` (Sequelize makes it `NULL`) and must match no role-filtered category. Pinned in Task 2, Step 1 (eu.utils and project.utils SQL tests) and the Task 2 integration test.
3. **A stored questionnaire run whose `role` is the string `"deployer"`** (every run saved before deploy) must still validate on approval, on resubmission prefill and in the public risk step, and score exactly as before. Pinned in Task 4, Step 1 (validate, intakeStep, score tests and the resubmission prefill in 1g) and Task 5, Step 1 (approval tests).
4. **The same roles in another order** (`["Deployer","Provider"]` saved over `["Provider","Deployer"]`) must record no change-history entry and add no "changed" line to the project-updated automation. Pinned in Task 3, Step 1 (change history) and Task 6, Step 1 (automation summary).
5. **An intake select whose option values are codes** (`opt_1` labelled "Provider", `opt_2` labelled "Importer") mapped to the role field must resolve by label, and the unmatched option must be visible to the reviewer. Pinned in Task 5, Step 1 (preview) and Task 10, Step 1 (review dialog note).

---

## File structure

Backend
- Create `Servers/utils/highRiskRoles.utils.ts` — all role logic (normalise, legacy, format, SQL fragment, row decoration, write rule, intake resolution). Pure: imports only the enum and `ValidationException`.
- Create `Servers/database/migrations/<TS>-multiple-high-risk-roles.js` — column switch on `projects` and `eu_ai_act_classifications`.
- Modify `Servers/domain.layer/models/project/project.model.ts`, `Servers/domain.layer/interfaces/i.project.ts`, `Servers/domain.layer/models/project/project.mock.data.ts`.
- Modify `Servers/utils/project.utils.ts` (INSERT, UPDATE, get, list), `Servers/utils/eu.utils.ts` (filter), `Servers/utils/approvalRequest.utils.ts`, `Servers/utils/euAiActClassification.utils.ts`, `Servers/utils/user.utils.ts`, `Servers/utils/automation/project.automation.utils.ts`, `Servers/utils/validations/projectValidation.utils.ts`.
- Modify `Servers/controllers/project.ctrl.ts`, `Servers/controllers/euAiActClassification.ctrl.ts`, `Servers/controllers/intakeForm.ctrl.ts`, `Servers/controllers/shareLink.ctrl.ts`, `Servers/middleware/validators/project.validator.ts`, `Servers/config/changeHistory.config.ts`.
- Modify `Servers/services/euAiActClassification/{types,questionnaire.v2,validate,score.v2}.ts`.
- Modify `Servers/extensions/jira-assets/jiraAssets.service.ts`, `Servers/advisor/functions/useCaseFunctions.ts`, `Servers/infrastructure.layer/driver/autoDriver.driver.ts`, `Servers/scripts/seeds/sql/seed_risk_links_demo.sql`.
- Tests: new `Servers/utils/__tests__/highRiskRoles.utils.test.ts`, `Servers/utils/__tests__/project.highRiskRoles.test.ts`, `Servers/utils/__tests__/changeHistory.highRiskRoles.test.ts`, `Servers/utils/__tests__/project.automation.utils.test.ts`, `Servers/utils/validations/projectValidation.highRiskRoles.spec.ts`, `Servers/middleware/__tests__/project.validator.test.ts`, `Servers/tests/integration/euVisibleCategories.highRiskRoles.test.ts`; extend existing eu.utils, euAiActClassification utils/ctrl, intake risk-step, project ctrl, questionnaire and Jira tests.

Frontend
- Create `Clients/src/application/utils/highRiskRoles.ts` — role helpers mirroring the backend, plus legacy input mapping.
- Create `Clients/src/presentation/components/Inputs/HighRiskRolesField/index.tsx` — the one multi-select used by both use case forms and the intake review dialog.
- Modify types/DTOs/ports/mapper/models, `Forms/ProjectForm`, `ProjectView/ProjectSettings`, `EuAiActQuestionnaire/QuestionView.tsx`, `ProjectsList`, `ProjectTableView`, `EntityGraph/DetailSidebar.tsx`, `RequestorApprovalModal/entityTypeConfig.tsx`, `ComplianceTracker/1.0ComplianceTracker/index.tsx`, `Automations`, `IntakeFormBuilder/{types.ts,SubmissionPreviewModal.tsx,EuAiActClassificationPanel.tsx}`, `application/repository/intakeForm.repository.ts`, `i18n/translations.ts`, e2e fixtures.

Docs: user guide (two files + mirror), `docs/technical/domains/use-cases.md`, `docs/technical/domains/readiness.md`, `docs/technical/architecture/database-schema.md`, `Servers/SQL_Commands.sql`, `Servers/docs/schema.dbml`, `Servers/documentation/{models,utils,mocks}/project.md`, `Servers/swagger.yaml`, `Servers/docs/api/projects-openapi.yaml`.

**Intermediate state (accepted):** after Task 2 the column is gone and the API no longer applies a legacy `type_of_high_risk_role` write until Task 3 lands (it is ignored, not an error). After Task 2 the Jira Assets view reports `type_of_high_risk_role: null` until Task 6. Build, unit tests and integration tests stay green after every task.

---

### Task 1: Backend role helpers

**Files:**
- Create: `Servers/utils/highRiskRoles.utils.ts`
- Test: `Servers/utils/__tests__/highRiskRoles.utils.test.ts`

**Interfaces:**
- Consumes: `HighRiskRole` from `Servers/domain.layer/enums/high-risk-role.enum.ts` (`DEPLOYER = "Deployer"`, `PROVIDER = "Provider"`); `ValidationException(message, field?, value?)` from `Servers/domain.layer/exceptions/custom.exception.ts`.
- Produces (all exported from `Servers/utils/highRiskRoles.utils.ts`):
  - `HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[]` — `[PROVIDER, DEPLOYER]`
  - `HIGH_RISK_ROLE_MAPPING = "type_of_high_risk_role"` — the intake `entityFieldMapping` key saved in form schemas
  - `isHighRiskRole(value: unknown): value is HighRiskRole`
  - `normalizeHighRiskRoles(input: unknown): HighRiskRole[]`
  - `legacyHighRiskRole(roles: unknown): HighRiskRole | null`
  - `formatHighRiskRoles(roles: unknown): string`
  - `sameHighRiskRoles(a: unknown, b: unknown): boolean`
  - `highRiskRolesArraySql(roles: unknown, name: string): { sql: string; replacements: Record<string, HighRiskRole[]> }`
  - `withLegacyHighRiskRole<T extends object | null | undefined>(row: T): T`
  - `resolveHighRiskRolesWrite(body: { high_risk_roles?: unknown; type_of_high_risk_role?: unknown }, currentRoles: unknown): HighRiskRole[] | undefined`
  - `highRiskRolesFromEntityData(data: Record<string, unknown>): HighRiskRole[]`
  - `resolveMappedHighRiskRoles(answer: unknown, options?: ReadonlyArray<{ value: string; label: string }>): { roles: HighRiskRole[]; unmatched: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `Servers/utils/__tests__/highRiskRoles.utils.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import {
  HIGH_RISK_ROLE_ORDER,
  formatHighRiskRoles,
  highRiskRolesArraySql,
  highRiskRolesFromEntityData,
  isHighRiskRole,
  legacyHighRiskRole,
  normalizeHighRiskRoles,
  resolveHighRiskRolesWrite,
  resolveMappedHighRiskRoles,
  sameHighRiskRoles,
  withLegacyHighRiskRole,
} from "../highRiskRoles.utils";

const { PROVIDER, DEPLOYER } = HighRiskRole;

describe("normalizeHighRiskRoles", () => {
  it("orders Provider before Deployer and drops duplicates", () => {
    expect(normalizeHighRiskRoles(["Deployer", "Provider", "Deployer"])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
  });

  it("reads a single legacy value as a one-item list", () => {
    expect(normalizeHighRiskRoles("Deployer")).toEqual([DEPLOYER]);
  });

  it("returns an empty list for null, undefined and unknown values", () => {
    expect(normalizeHighRiskRoles(null)).toEqual([]);
    expect(normalizeHighRiskRoles(undefined)).toEqual([]);
    expect(normalizeHighRiskRoles(["Importer", "provider", 1])).toEqual([]);
  });

  it("exposes the fixed order", () => {
    expect(HIGH_RISK_ROLE_ORDER).toEqual([PROVIDER, DEPLOYER]);
    expect(isHighRiskRole("Provider")).toBe(true);
    expect(isHighRiskRole("provider")).toBe(false);
  });
});

describe("legacyHighRiskRole and formatHighRiskRoles", () => {
  it("derives Provider when the list holds Provider", () => {
    expect(legacyHighRiskRole([DEPLOYER, PROVIDER])).toBe(PROVIDER);
  });

  it("derives Deployer when the list holds only Deployer, and null when empty", () => {
    expect(legacyHighRiskRole([DEPLOYER])).toBe(DEPLOYER);
    expect(legacyHighRiskRole([])).toBeNull();
    expect(legacyHighRiskRole(null)).toBeNull();
  });

  it("formats in the fixed order and compares as a set", () => {
    expect(formatHighRiskRoles([DEPLOYER, PROVIDER])).toBe("Provider, Deployer");
    expect(formatHighRiskRoles([])).toBe("");
    expect(sameHighRiskRoles([DEPLOYER, PROVIDER], [PROVIDER, DEPLOYER])).toBe(true);
    expect(sameHighRiskRoles([DEPLOYER], [PROVIDER, DEPLOYER])).toBe(false);
  });
});

describe("highRiskRolesArraySql", () => {
  it("binds a non-empty list inside ARRAY[...]::text[], normalised", () => {
    expect(highRiskRolesArraySql([DEPLOYER, PROVIDER, DEPLOYER], "roles")).toEqual({
      sql: "ARRAY[:roles]::text[]",
      replacements: { roles: [PROVIDER, DEPLOYER] },
    });
  });

  it("never binds an empty list: it is the literal '{}'", () => {
    expect(highRiskRolesArraySql([], "roles")).toEqual({ sql: "'{}'::text[]", replacements: {} });
    expect(highRiskRolesArraySql(null, "roles")).toEqual({
      sql: "'{}'::text[]",
      replacements: {},
    });
  });
});

describe("withLegacyHighRiskRole", () => {
  it("adds the derived role to a plain row and normalises the list", () => {
    const row = withLegacyHighRiskRole({ id: 1, high_risk_roles: [DEPLOYER, PROVIDER] });
    expect(row).toEqual({
      id: 1,
      high_risk_roles: [PROVIDER, DEPLOYER],
      type_of_high_risk_role: PROVIDER,
    });
  });

  it("writes to dataValues too, so a spread of dataValues carries it", () => {
    const row = { dataValues: { id: 2, high_risk_roles: [DEPLOYER] } } as any;
    withLegacyHighRiskRole(row);
    expect(row.dataValues.type_of_high_risk_role).toBe(DEPLOYER);
    expect(row.type_of_high_risk_role).toBe(DEPLOYER);
  });

  it("treats a missing list as empty and passes null through", () => {
    expect(withLegacyHighRiskRole({ id: 3 } as any)).toMatchObject({
      high_risk_roles: [],
      type_of_high_risk_role: null,
    });
    expect(withLegacyHighRiskRole(null)).toBeNull();
  });
});

describe("resolveHighRiskRolesWrite", () => {
  it("returns undefined when neither field is sent", () => {
    expect(resolveHighRiskRolesWrite({}, [PROVIDER])).toBeUndefined();
  });

  it("replaces the list with high_risk_roles, normalised", () => {
    expect(resolveHighRiskRolesWrite({ high_risk_roles: ["Deployer", "Provider"] }, [])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(resolveHighRiskRolesWrite({ high_risk_roles: null }, [PROVIDER])).toEqual([]);
  });

  it("keeps the list when the legacy role is already in it", () => {
    expect(
      resolveHighRiskRolesWrite({ type_of_high_risk_role: "Provider" }, [PROVIDER, DEPLOYER]),
    ).toEqual([PROVIDER, DEPLOYER]);
  });

  it("replaces the list with the legacy role when it is not in it", () => {
    expect(resolveHighRiskRolesWrite({ type_of_high_risk_role: "Deployer" }, [PROVIDER])).toEqual([
      DEPLOYER,
    ]);
  });

  it("clears the list when the legacy role is null", () => {
    expect(resolveHighRiskRolesWrite({ type_of_high_risk_role: null }, [PROVIDER])).toEqual([]);
  });

  it("accepts both fields when they agree", () => {
    expect(
      resolveHighRiskRolesWrite(
        { high_risk_roles: ["Provider", "Deployer"], type_of_high_risk_role: "Deployer" },
        [],
      ),
    ).toEqual([PROVIDER, DEPLOYER]);
    expect(
      resolveHighRiskRolesWrite({ high_risk_roles: [], type_of_high_risk_role: null }, []),
    ).toEqual([]);
  });

  it("rejects both fields when they disagree", () => {
    expect(() =>
      resolveHighRiskRolesWrite(
        { high_risk_roles: ["Provider"], type_of_high_risk_role: "Deployer" },
        [],
      ),
    ).toThrow(ValidationException);
    expect(() =>
      resolveHighRiskRolesWrite({ high_risk_roles: ["Provider"], type_of_high_risk_role: null }, []),
    ).toThrow(ValidationException);
  });

  it("rejects unknown roles in either field", () => {
    expect(() => resolveHighRiskRolesWrite({ high_risk_roles: ["Importer"] }, [])).toThrow(
      ValidationException,
    );
    expect(() => resolveHighRiskRolesWrite({ high_risk_roles: "Provider" }, [])).toThrow(
      ValidationException,
    );
    expect(() => resolveHighRiskRolesWrite({ type_of_high_risk_role: "Importer" }, [])).toThrow(
      ValidationException,
    );
  });
});

describe("highRiskRolesFromEntityData", () => {
  it("prefers the list and falls back to the legacy single role", () => {
    expect(highRiskRolesFromEntityData({ high_risk_roles: ["Deployer", "Provider"] })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(highRiskRolesFromEntityData({ type_of_high_risk_role: "Deployer" })).toEqual([
      DEPLOYER,
    ]);
    expect(highRiskRolesFromEntityData({})).toEqual([]);
  });
});

describe("resolveMappedHighRiskRoles", () => {
  const options = [
    { value: "opt_1", label: "Provider" },
    { value: "opt_2", label: "Importer" },
    { value: "deployer", label: "We use it" },
  ];

  it("matches an option by its label when the stored value is a code", () => {
    expect(resolveMappedHighRiskRoles("opt_1", options)).toEqual({
      roles: [PROVIDER],
      unmatched: [],
    });
  });

  it("matches an option by its value, case-insensitively", () => {
    expect(resolveMappedHighRiskRoles(["deployer"], options)).toEqual({
      roles: [DEPLOYER],
      unmatched: [],
    });
    expect(resolveMappedHighRiskRoles("PROVIDER", [])).toEqual({ roles: [PROVIDER], unmatched: [] });
  });

  it("returns both roles from a multi-select and lists unmatched options by label", () => {
    expect(resolveMappedHighRiskRoles(["deployer", "opt_2", "opt_1"], options)).toEqual({
      roles: [PROVIDER, DEPLOYER],
      unmatched: ["Importer"],
    });
  });

  it("returns nothing for an empty answer", () => {
    expect(resolveMappedHighRiskRoles(undefined, options)).toEqual({ roles: [], unmatched: [] });
    expect(resolveMappedHighRiskRoles("", options)).toEqual({ roles: [], unmatched: [] });
    expect(resolveMappedHighRiskRoles([], options)).toEqual({ roles: [], unmatched: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest utils/__tests__/highRiskRoles.utils.test.ts`
Expected: FAIL with `Cannot find module '../highRiskRoles.utils'`.

- [ ] **Step 3: Write the implementation**

Create `Servers/utils/highRiskRoles.utils.ts`:

```ts
/**
 * EU AI Act roles of a use case. A use case holds Provider, Deployer or both,
 * stored in projects.high_risk_roles (text[]) without duplicates, Provider
 * first. Every write path and every project row leaving the data layer goes
 * through these helpers.
 */
import { HighRiskRole } from "../domain.layer/enums/high-risk-role.enum";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/** Storage and display order. */
export const HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[] = [
  HighRiskRole.PROVIDER,
  HighRiskRole.DEPLOYER,
];

/** The intake entityFieldMapping key for the roles; saved form schemas use it. */
export const HIGH_RISK_ROLE_MAPPING = "type_of_high_risk_role";

export const isHighRiskRole = (value: unknown): value is HighRiskRole =>
  typeof value === "string" && (HIGH_RISK_ROLE_ORDER as readonly string[]).includes(value);

const asList = (input: unknown): unknown[] =>
  Array.isArray(input) ? input : input === null || input === undefined ? [] : [input];

/**
 * The stored form of a role list: known roles only, no duplicates, Provider
 * first. A single value (the legacy column, an old API body) reads as a
 * one-item list.
 */
export const normalizeHighRiskRoles = (input: unknown): HighRiskRole[] => {
  const values = asList(input);
  return HIGH_RISK_ROLE_ORDER.filter((role) => values.includes(role));
};

/**
 * The single role older API clients read as type_of_high_risk_role: Provider
 * when the list holds Provider, Deployer when it holds only Deployer, else null.
 */
export const legacyHighRiskRole = (roles: unknown): HighRiskRole | null =>
  normalizeHighRiskRoles(roles)[0] ?? null;

/** "Provider, Deployer"; "" for no roles. */
export const formatHighRiskRoles = (roles: unknown): string =>
  normalizeHighRiskRoles(roles).join(", ");

/** Same roles, whatever the order or duplicates. */
export const sameHighRiskRoles = (a: unknown, b: unknown): boolean =>
  formatHighRiskRoles(a) === formatHighRiskRoles(b);

/**
 * A role list as a SQL text[] expression. Sequelize expands an array
 * replacement into a bare comma list and turns [] into NULL, so the list goes
 * inside ARRAY[...] and an empty list is the literal '{}' with nothing bound.
 * Use it for writes (`SET high_risk_roles = ${sql}`) and reads
 * (`= ANY(${sql})`, which matches nothing for an empty list). `name` is a
 * replacement name chosen by the caller, never user input.
 */
export const highRiskRolesArraySql = (
  roles: unknown,
  name: string,
): { sql: string; replacements: Record<string, HighRiskRole[]> } => {
  const list = normalizeHighRiskRoles(roles);
  if (list.length === 0) return { sql: "'{}'::text[]", replacements: {} };
  return { sql: `ARRAY[:${name}]::text[]`, replacements: { [name]: list } };
};

/**
 * Normalises high_risk_roles on a project row read with SELECT * and adds the
 * derived type_of_high_risk_role. Without it a reader of the removed column
 * gets undefined and the value silently disappears. Sequelize model instances
 * get both on dataValues too, so `{ ...row.dataValues }` carries them.
 * Mutates and returns the row; null and undefined pass through.
 */
export function withLegacyHighRiskRole<T extends object | null | undefined>(row: T): T {
  if (!row) return row;
  const values = (row as { dataValues?: Record<string, unknown> }).dataValues;
  const roles = normalizeHighRiskRoles((values ?? (row as Record<string, unknown>)).high_risk_roles);
  const derived = { high_risk_roles: roles, type_of_high_risk_role: roles[0] ?? null };
  if (values) Object.assign(values, derived);
  Object.assign(row, derived);
  return row;
}

const invalidRoles = (field: string, value: unknown) =>
  new ValidationException(
    `${field} must name only these roles: ${HIGH_RISK_ROLE_ORDER.join(", ")}`,
    field,
    value,
  );

/**
 * The role list a create or update stores, from either request field:
 * - high_risk_roles replaces the list (null clears it);
 * - type_of_high_risk_role X keeps the current list when it already holds X,
 *   so a client that writes back the derived value cannot drop a role, and
 *   otherwise sets [X]; null clears the list;
 * - both present and disagreeing is a ValidationException (400).
 * Returns undefined when the request sends neither field: leave the list alone.
 */
export const resolveHighRiskRolesWrite = (
  body: { high_risk_roles?: unknown; type_of_high_risk_role?: unknown },
  currentRoles: unknown,
): HighRiskRole[] | undefined => {
  const list = body.high_risk_roles;
  const legacy = body.type_of_high_risk_role;
  if (list === undefined && legacy === undefined) return undefined;
  const legacyIsEmpty = legacy === null || legacy === "";
  if (legacy !== undefined && !legacyIsEmpty && !isHighRiskRole(legacy)) {
    throw invalidRoles("type_of_high_risk_role", legacy);
  }

  if (list !== undefined) {
    const values = list === null ? [] : list;
    if (!Array.isArray(values) || !values.every(isHighRiskRole)) {
      throw invalidRoles("high_risk_roles", list);
    }
    const roles = normalizeHighRiskRoles(values);
    const agrees =
      legacy === undefined ||
      (legacyIsEmpty ? roles.length === 0 : roles.includes(legacy as HighRiskRole));
    if (!agrees) {
      throw new ValidationException(
        "type_of_high_risk_role does not match high_risk_roles; send only high_risk_roles",
        "type_of_high_risk_role",
        legacy,
      );
    }
    return roles;
  }

  if (legacyIsEmpty) return [];
  const current = normalizeHighRiskRoles(currentRoles);
  return current.includes(legacy as HighRiskRole) ? current : [legacy as HighRiskRole];
};

/**
 * Roles from intake entity data: the list when present, else the single
 * legacy role an older review dialog or API client sent.
 */
export const highRiskRolesFromEntityData = (data: Record<string, unknown>): HighRiskRole[] =>
  normalizeHighRiskRoles(
    Array.isArray(data.high_risk_roles) ? data.high_risk_roles : data.type_of_high_risk_role,
  );

/**
 * Roles named by an intake answer mapped to the role field. A select stores
 * the option's value, so each value is resolved to its label and a role
 * matches either, case-insensitively. Selected options that name no role come
 * back by label so the reviewer can see them before approving.
 */
export const resolveMappedHighRiskRoles = (
  answer: unknown,
  options: ReadonlyArray<{ value: string; label: string }> = [],
): { roles: HighRiskRole[]; unmatched: string[] } => {
  const matched: HighRiskRole[] = [];
  const unmatched: string[] = [];
  for (const raw of asList(answer)) {
    const value = String(raw);
    if (value.trim() === "") continue;
    const label = options.find((option) => option.value === value)?.label ?? value;
    const role = HIGH_RISK_ROLE_ORDER.find((candidate) =>
      [label, value].some((text) => text.trim().toLowerCase() === candidate.toLowerCase()),
    );
    if (role) matched.push(role);
    else unmatched.push(label);
  }
  return { roles: normalizeHighRiskRoles(matched), unmatched };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/highRiskRoles.utils.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Gate**

Run: `cd Servers && npm run build && npx prettier --check utils/highRiskRoles.utils.ts utils/__tests__/highRiskRoles.utils.test.ts`
Expected: build succeeds; prettier reports no issues (run `npx prettier --write` on the two files if it does, then re-check).

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/highRiskRoles.utils.ts Servers/utils/__tests__/highRiskRoles.utils.test.ts
git commit -m "feat(use-cases): helpers for a list of EU AI Act roles" -m "Adds Servers/utils/highRiskRoles.utils.ts, the single place that knows how a
use case's high-risk roles are stored and read:

- normalizeHighRiskRoles: known roles only, no duplicates, Provider first
- legacyHighRiskRole: the derived single role older API clients read
- highRiskRolesArraySql: ARRAY[:name]::text[], or the literal '{}' so an
  empty list is never bound (Sequelize would turn [] into NULL)
- withLegacyHighRiskRole: decorates SELECT * project rows with the derived
  field so readers of the removed column do not silently get undefined
- resolveHighRiskRolesWrite: the API write rule for either field
- resolveMappedHighRiskRoles: intake answers matched by option label or value

No caller uses them yet."
```

---

### Task 2: Store roles as a list (migration, model and every SQL reader)

**Files:**
- Create: `Servers/database/migrations/<TS>-multiple-high-risk-roles.js` (`<TS>` from Step 3)
- Modify: `Servers/domain.layer/models/project/project.model.ts:54-58` (column) and `:185-215` (`toJSON`)
- Modify: `Servers/domain.layer/interfaces/i.project.ts:14`
- Modify: `Servers/domain.layer/models/project/project.mock.data.ts:2,16,31`
- Modify: `Servers/utils/project.utils.ts` (`getUserProjects` 93-122, `getProjectByIdQuery` 182-239, `createNewProjectQuery` 329-370, `updateProjectByIdQuery` 573-622)
- Modify: `Servers/utils/user.utils.ts:495-507` (`getUserProjects`)
- Modify: `Servers/utils/eu.utils.ts:632-711` (`getVisibleEuCategoryIdsForProject`)
- Modify: `Servers/utils/approvalRequest.utils.ts:496,559`
- Modify: `Servers/utils/euAiActClassification.utils.ts:96-120` (`setUseCaseClassificationQuery`)
- Modify: `Servers/controllers/euAiActClassification.ctrl.ts:144-151`
- Modify: `Servers/controllers/project.ctrl.ts:295`
- Modify: `Servers/controllers/intakeForm.ctrl.ts:1472`
- Modify: `Servers/infrastructure.layer/driver/autoDriver.driver.ts:25,83,614,644`
- Modify: `Servers/scripts/seeds/sql/seed_risk_links_demo.sql:25-33`
- Modify: `Servers/tests/integration/report-scope-authorization.test.ts:39-43`, `report-scope-membership.test.ts:17-21`, `report-run-visibility.test.ts:31-35`
- Test: create `Servers/utils/__tests__/project.highRiskRoles.test.ts`, `Servers/tests/integration/euVisibleCategories.highRiskRoles.test.ts`; modify `Servers/utils/__tests__/eu.utils.test.ts`, `Servers/utils/__tests__/euAiActClassification.utils.test.ts`, `Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts`, `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`

**Interfaces:**
- Consumes (Task 1): `normalizeHighRiskRoles`, `legacyHighRiskRole`, `highRiskRolesArraySql`, `withLegacyHighRiskRole`, `highRiskRolesFromEntityData`.
- Produces:
  - DB: `projects.high_risk_roles TEXT[] NOT NULL DEFAULT '{}'` with CHECK `projects_high_risk_roles_check`; `projects.type_of_high_risk_role` dropped; `eu_ai_act_classifications.roles TEXT[] NOT NULL DEFAULT '{}'` with CHECK `eu_ai_act_classifications_roles_check`.
  - `ProjectModel.high_risk_roles: HighRiskRole[]`; `ProjectModel.toJSON()` returns `high_risk_roles` and derived `type_of_high_risk_role`.
  - `IProjectAttributes.high_risk_roles?: HighRiskRole[]`; `IProjectAttributes.type_of_high_risk_role?: HighRiskRole | null` (derived, read-only meaning).
  - `createNewProjectQuery` / `updateProjectByIdQuery` accept `high_risk_roles` on the project argument; `type_of_high_risk_role` is no longer written.
  - `setUseCaseClassificationQuery(useCaseId: number, level: string, roles: readonly string[], userId: number, organizationId: number, transaction: Transaction): Promise<boolean>` — a non-empty `roles` replaces the list, an empty one leaves it unchanged.

- [ ] **Step 1: Write the failing tests**

1a. Create `Servers/utils/__tests__/project.highRiskRoles.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { createNewProjectQuery, getProjectByIdQuery, updateProjectByIdQuery } from "../project.utils";
import { sequelize } from "../../database/db";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = {} as any;

/** A row as Sequelize returns it with mapToModel: the values live on dataValues. */
const modelRow = (values: Record<string, unknown>) => ({ ...values, dataValues: { ...values } });

function mockDb(row: Record<string, unknown>) {
  query.mockImplementation(async (sql: string, opts: any = {}) => {
    if (sql.startsWith("SELECT id FROM users"))
      return opts.replacements.userIds.map((id: number) => ({ id }));
    if (sql.startsWith("SELECT id FROM frameworks")) return [[], 0];
    if (sql.includes("nextval('project_uc_id_seq')")) return [{ next_id: 1 }];
    if (sql.startsWith("INSERT INTO projects (")) return [modelRow(row)];
    if (sql.includes("FOR UPDATE")) return [{ id: 1 }];
    if (sql.startsWith("UPDATE projects SET")) return [modelRow(row)];
    if (sql.startsWith("SELECT * FROM projects")) return [modelRow(row)];
    if (sql.includes("FROM projects_frameworks")) return [[], 0];
    if (sql.includes("FROM automation_triggers")) return [[], 0];
    return [];
  });
}

const call = (prefix: string) => {
  const found = query.mock.calls.find((c) => String(c[0]).startsWith(prefix));
  if (!found) throw new Error(`no query starting with ${prefix}`);
  return { sql: String(found[0]), replacements: (found[1] as any).replacements };
};

describe("project.utils high-risk roles", () => {
  beforeEach(() => query.mockReset());

  it("inserts the roles normalised through ARRAY[...]::text[]", async () => {
    mockDb({ id: 1, high_risk_roles: ["Provider", "Deployer"] });
    const created = await createNewProjectQuery(
      { project_title: "P", owner: 1, high_risk_roles: ["Deployer", "Provider", "Deployer"] } as any,
      [],
      [],
      1,
      1,
      transaction,
    );
    const insert = call("INSERT INTO projects (");
    expect(insert.sql).toContain("ARRAY[:high_risk_roles]::text[]");
    expect(insert.sql).not.toContain("type_of_high_risk_role");
    expect(insert.replacements.high_risk_roles).toEqual(["Provider", "Deployer"]);
    expect((created.dataValues as any).type_of_high_risk_role).toBe("Provider");
  });

  it("inserts no roles as the literal '{}' without binding an empty array", async () => {
    mockDb({ id: 1, high_risk_roles: [] });
    await createNewProjectQuery({ project_title: "P", owner: 1 } as any, [], [], 1, 1, transaction);
    const insert = call("INSERT INTO projects (");
    expect(insert.sql).toContain("'{}'::text[]");
    expect(insert.replacements).not.toHaveProperty("high_risk_roles");
  });

  it("updates the roles through ARRAY[...]::text[] and returns the derived role", async () => {
    mockDb({ id: 1, high_risk_roles: ["Deployer"] });
    const updated = await updateProjectByIdQuery(
      1,
      { high_risk_roles: ["Deployer"] } as any,
      undefined,
      1,
      transaction,
    );
    const update = call("UPDATE projects SET");
    expect(update.sql).toContain("high_risk_roles = ARRAY[:high_risk_roles]::text[]");
    expect(update.replacements.high_risk_roles).toEqual(["Deployer"]);
    expect(updated?.type_of_high_risk_role).toBe("Deployer");
  });

  it("clears the roles with the literal '{}'", async () => {
    mockDb({ id: 1, high_risk_roles: [] });
    await updateProjectByIdQuery(1, { high_risk_roles: [] } as any, undefined, 1, transaction);
    expect(call("UPDATE projects SET").sql).toContain("high_risk_roles = '{}'::text[]");
  });

  it("leaves the roles alone when the update does not send them", async () => {
    mockDb({ id: 1, high_risk_roles: ["Provider"] });
    await updateProjectByIdQuery(1, { project_title: "Q" } as any, undefined, 1, transaction);
    expect(call("UPDATE projects SET").sql).not.toContain("high_risk_roles");
  });

  it("adds the derived role to a use case read by id", async () => {
    mockDb({ id: 1, high_risk_roles: ["Deployer", "Provider"] });
    const project = (await getProjectByIdQuery(1, 1)) as any;
    expect(project.type_of_high_risk_role).toBe("Provider");
    expect(project.dataValues.high_risk_roles).toEqual(["Provider", "Deployer"]);
  });
});
```

1b. Append to `Servers/utils/__tests__/eu.utils.test.ts` (add `getVisibleEuCategoryIdsForProject` to the existing import from `"../eu.utils"`):

```ts
describe("getVisibleEuCategoryIdsForProject role filter", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const projectRead = () => mockQuery.mock.calls[0] as unknown as [string, any];
  const categoriesRead = () => mockQuery.mock.calls[1] as unknown as [string, any];

  it("reads the role list, not the removed single-role column", async () => {
    mockQuery.mockResolvedValueOnce([[{ roles: ["Provider"], tier: "High risk" }], 0] as any);
    mockQuery.mockResolvedValueOnce([[{ id: 3 }], 0] as any);
    await getVisibleEuCategoryIdsForProject(10, 1);
    expect(projectRead()[0]).toContain("p.high_risk_roles AS roles");
    expect(projectRead()[0]).not.toContain("type_of_high_risk_role");
  });

  it("matches a role-filtered category for any of the use case's roles", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ roles: ["Deployer", "Provider"], tier: "High risk" }],
      0,
    ] as any);
    mockQuery.mockResolvedValueOnce([[{ id: 3 }, { id: 7 }], 0] as any);
    await expect(getVisibleEuCategoryIdsForProject(10, 1)).resolves.toEqual([3, 7]);
    const [sql, opts] = categoriesRead();
    expect(sql).toContain("r.name = ANY(ARRAY[:roles]::text[])");
    expect(opts.replacements).toMatchObject({
      tier: "High risk",
      applyRoleFilter: true,
      roles: ["Provider", "Deployer"],
    });
  });

  it("never binds an empty list: no roles matches no role-filtered category", async () => {
    mockQuery.mockResolvedValueOnce([[{ roles: [], tier: "High risk" }], 0] as any);
    mockQuery.mockResolvedValueOnce([[{ id: 3 }], 0] as any);
    await getVisibleEuCategoryIdsForProject(10, 1);
    const [sql, opts] = categoriesRead();
    expect(sql).toContain("r.name = ANY('{}'::text[])");
    expect(opts.replacements).not.toHaveProperty("roles");
  });
});
```

1c. Create `Servers/tests/integration/euVisibleCategories.highRiskRoles.test.ts`:

```ts
jest.setTimeout(60000);

/**
 * The requirements filter against the real EU AI Act structure: a use case
 * with both roles sees the union of what each role sees, and a use case with
 * no role sees only the categories that apply whatever the role.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import {
  cleanupDatabase,
  createTestOrganization,
  createTestUser,
  seedFrameworks,
} from "./helpers";
import { createTestProjectFramework } from "../factories";
import { getVisibleEuCategoryIdsForProject } from "../../utils/eu.utils";

const EU_AI_ACT_FRAMEWORK_ID = 1;

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

/** A High risk use case with these roles and the EU AI Act; returns its projects_frameworks id. */
async function euUseCase(orgId: number, ownerId: number, roles: string[]): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
        goal, last_updated, last_updated_by, organization_id)
     VALUES (:title, :ownerId, NOW(), 'High risk', CAST(:roles AS text[]),
             'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    {
      replacements: {
        title: `Roles ${roles.join("+") || "none"}`,
        ownerId,
        orgId,
        roles: `{${roles.join(",")}}`,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return createTestProjectFramework(orgId, rows[0].id, EU_AI_ACT_FRAMEWORK_ID);
}

const visible = async (orgId: number, projectFrameworkId: number) =>
  (await getVisibleEuCategoryIdsForProject(projectFrameworkId, orgId)).sort((a, b) => a - b);

describe("getVisibleEuCategoryIdsForProject with several high-risk roles", () => {
  it("shows the union of the Provider and Deployer categories for both roles", async () => {
    const orgId = await createTestOrganization();
    const userId = await createTestUser(orgId, 1, `roles-${Date.now()}@example.com`, "Passw0rd!");

    const provider = await visible(orgId, await euUseCase(orgId, userId, ["Provider"]));
    const deployer = await visible(orgId, await euUseCase(orgId, userId, ["Deployer"]));
    const both = await visible(orgId, await euUseCase(orgId, userId, ["Provider", "Deployer"]));
    const none = await visible(orgId, await euUseCase(orgId, userId, []));

    // The High risk tier has role-specific categories, so the roles differ.
    expect(provider).not.toEqual(deployer);
    expect(both).toEqual([...new Set([...provider, ...deployer])].sort((a, b) => a - b));
    // No role: only categories every role sees.
    expect(none.every((id) => provider.includes(id) && deployer.includes(id))).toBe(true);
    expect(none.length).toBeLessThan(Math.min(provider.length, deployer.length));
  });
});
```

1d. In `Servers/utils/__tests__/euAiActClassification.utils.test.ts`, replace the test `"updates only the classification columns of a use case in the organization"` with:

```ts
  it("updates only the classification columns of a use case in the organization", async () => {
    query.mockResolvedValue([[{ id: 3 }], 1]);
    await expect(
      setUseCaseClassificationQuery(3, "High risk", ["Deployer", "Provider"], 7, 5, {} as any),
    ).resolves.toBe(true);
    expect(sql()).toContain("UPDATE projects SET ai_risk_classification = :level");
    expect(sql()).toContain("high_risk_roles = ARRAY[:roles]::text[]");
    expect(replacements().roles).toEqual(["Provider", "Deployer"]);
    expect(sql()).toContain("WHERE organization_id = :organizationId AND id = :useCaseId");
  });

  it("leaves the roles unchanged when the result names none", async () => {
    query.mockResolvedValue([[{ id: 3 }], 1]);
    await setUseCaseClassificationQuery(3, "Out of scope", [], 7, 5, {} as any);
    expect(sql()).not.toContain("high_risk_roles");
    expect(replacements()).not.toHaveProperty("roles");
  });
```

1e. In `Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts`, in `"saves a run, sets the level and role, and records history in one transaction"`, change the expected third argument of `setUseCaseClassificationQuery` from `"Provider"` to `["Provider"]`.

1f. In `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`, every assertion on `projects.createNewProjectQuery.mock.calls[0][0]` that uses `type_of_high_risk_role: "<Role>"` becomes `high_risk_roles: ["<Role>"]` (four places: the tests `"treats a run with an unknown questionnaire version as no run"`, `"keeps the reviewer's role when the computed role is empty"`, `"sets the computed level and role, copies the run and records history"`, `"treats a run whose stored answers no longer validate as no run on approval"`). The request bodies (`confirmedEntityData: { type_of_high_risk_role: "Provider" }`) stay as they are: they exercise the legacy input.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest utils/__tests__/project.highRiskRoles.test.ts utils/__tests__/eu.utils.test.ts utils/__tests__/euAiActClassification.utils.test.ts controllers/__tests__/euAiActClassification.ctrl.test.ts controllers/__tests__/intakeForm.riskStep.test.ts`
Expected: FAIL — INSERT still names `type_of_high_risk_role`, filter SQL has no `ANY(`, `setUseCaseClassificationQuery` receives a string, `createNewProjectQuery` receives `type_of_high_risk_role`.

- [ ] **Step 3: Snapshot the visible categories before migrating**

Write `/private/tmp/claude-501/-Users-gorkemcetin-verifywise/e99e65fd-3923-494e-9c4c-e3d01ce6cd1d/scratchpad/visible-before.sql`:

```sql
SET search_path TO verifywise;
SELECT pf.id AS project_framework_id, array_agg(cc.id ORDER BY cc.id) AS visible
FROM projects_frameworks pf
JOIN projects p ON p.id = pf.project_id AND p.organization_id = pf.organization_id
JOIN frameworks f ON f.id = pf.framework_id AND f.name = 'EU AI Act'
JOIN controlcategories_struct_eu cc ON cc.framework_id = f.id
WHERE EXISTS (SELECT 1 FROM controlcategories_struct_eu__risk_tiers cct
              JOIN eu_act_risk_tiers rt ON rt.id = cct.risk_tier_id
              WHERE cct.control_category_id = cc.id AND rt.name = 'General Risk')
   OR (EXISTS (SELECT 1 FROM controlcategories_struct_eu__risk_tiers cct
               JOIN eu_act_risk_tiers rt ON rt.id = cct.risk_tier_id
               WHERE cct.control_category_id = cc.id
                 AND rt.name = p.ai_risk_classification::text)
       AND (p.ai_risk_classification::text NOT IN ('High risk', 'GPAI')
            OR EXISTS (SELECT 1 FROM controlcategories_struct_eu__roles ccr
                       JOIN eu_act_roles r ON r.id = ccr.role_id
                       WHERE ccr.control_category_id = cc.id
                         AND r.name = p.type_of_high_risk_role::text)))
GROUP BY pf.id
ORDER BY pf.id;
```

Write `visible-after.sql` in the same folder: identical, except the last role condition reads `AND r.name = ANY(p.high_risk_roles)))`.

Run (from the repo root):

```bash
SP=/private/tmp/claude-501/-Users-gorkemcetin-verifywise/e99e65fd-3923-494e-9c4c-e3d01ce6cd1d/scratchpad
DBU=$(grep '^DB_USER=' Servers/.env | cut -d= -f2)
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -f "$SP/visible-before.sql" > "$SP/visible-before.out"
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -c "SELECT type_of_high_risk_role, count(*) FROM verifywise.projects GROUP BY 1 ORDER BY 1;" > "$SP/roles-before.out"
wc -l "$SP/visible-before.out"; cat "$SP/roles-before.out"
```

Expected: one line per EU AI Act project framework; role counts (on 2026-10-13 the dev DB had `Deployer|8` and `|2`).

- [ ] **Step 4: Create the migration**

Run `TS=$(date +%Y%m%d%H%M%S); echo $TS` and create `Servers/database/migrations/${TS}-multiple-high-risk-roles.js`:

```js
"use strict";

/**
 * A use case can hold more than one EU AI Act role: Provider, Deployer or
 * both. projects.type_of_high_risk_role (one enum value) becomes
 * projects.high_risk_roles (text[]), and eu_ai_act_classifications gets the
 * list next to its single role column, which stays and keeps the derived
 * value for older records.
 *
 * text[] rather than an array of the enum: Sequelize handles enum arrays
 * poorly and raw SQL would need casts and an empty-array special case.
 *
 * The enum type verifywise.enum_projects_type_of_high_risk_role is kept: down
 * needs it.
 *
 * Down is lossy: a use case with both roles keeps only Provider.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ADD COLUMN high_risk_roles TEXT[] NOT NULL DEFAULT '{}',
           ADD CONSTRAINT projects_high_risk_roles_check
             CHECK (high_risk_roles <@ ARRAY['Provider', 'Deployer']::text[]);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects
            SET high_risk_roles = ARRAY[type_of_high_risk_role::text]
          WHERE type_of_high_risk_role IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects DROP COLUMN type_of_high_risk_role;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.eu_ai_act_classifications
           ADD COLUMN roles TEXT[] NOT NULL DEFAULT '{}',
           ADD CONSTRAINT eu_ai_act_classifications_roles_check
             CHECK (roles <@ ARRAY['Provider', 'Deployer']::text[]);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.eu_ai_act_classifications
            SET roles = ARRAY[role::text]
          WHERE role IS NOT NULL;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ADD COLUMN type_of_high_risk_role verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction },
      );
      // Lossy: a use case with both roles keeps Provider only.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects
            SET type_of_high_risk_role = (CASE
                  WHEN 'Provider' = ANY(high_risk_roles) THEN 'Provider'
                  WHEN 'Deployer' = ANY(high_risk_roles) THEN 'Deployer'
                END)::verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects DROP COLUMN high_risk_roles;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.eu_ai_act_classifications DROP COLUMN roles;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
```

- [ ] **Step 5: Model and interface**

In `Servers/domain.layer/models/project/project.model.ts`, replace the `type_of_high_risk_role` column (lines 54-58) with:

```ts
  /** EU AI Act roles, normalised: no duplicates, Provider first. */
  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: false,
    defaultValue: [],
  })
  high_risk_roles!: HighRiskRole[];
```

Add the import `import { legacyHighRiskRole, normalizeHighRiskRoles } from "../../../utils/highRiskRoles.utils";` and, in `toJSON()`, replace `type_of_high_risk_role: this.type_of_high_risk_role,` with:

```ts
      high_risk_roles: normalizeHighRiskRoles(this.high_risk_roles),
      // Deprecated: the single role older API clients read (Provider when present).
      type_of_high_risk_role: legacyHighRiskRole(this.high_risk_roles),
```

In `Servers/domain.layer/interfaces/i.project.ts`, replace line 14 with:

```ts
  /** EU AI Act roles, normalised: no duplicates, Provider first. */
  high_risk_roles?: HighRiskRole[];
  /**
   * Deprecated, derived from high_risk_roles (Provider when present, else
   * Deployer, else null). Never stored.
   */
  type_of_high_risk_role?: HighRiskRole | null;
```

In `Servers/domain.layer/models/project/project.mock.data.ts`, replace `type_of_high_risk_role: HighRiskRole.DEPLOYER,` with `high_risk_roles: [HighRiskRole.DEPLOYER],` and `type_of_high_risk_role: HighRiskRole.PROVIDER,` with `high_risk_roles: [HighRiskRole.PROVIDER],`.

- [ ] **Step 6: project.utils and user.utils**

In `Servers/utils/project.utils.ts` add:

```ts
import {
  highRiskRolesArraySql,
  normalizeHighRiskRoles,
  withLegacyHighRiskRole,
} from "./highRiskRoles.utils";
```

`getUserProjects` (end of the function) becomes:

```ts
  const projects = await sequelize.query(finalQuery, {
    replacements,
    model: ProjectModel,
    mapToModel: true,
    type: QueryTypes.SELECT,
    transaction,
  });
  projects.forEach((project) => withLegacyHighRiskRole(project));
  return projects;
```

`getProjectByIdQuery`: replace `const project = result[0];` with `const project = withLegacyHighRiskRole(result[0]);`.

`createNewProjectQuery`: before `const result = await sequelize.query(` add

```ts
  // Sequelize would turn [] into NULL, so the roles go in as an SQL fragment.
  const roles = highRiskRolesArraySql(project.high_risk_roles, "high_risk_roles");
```

In the INSERT, replace the column `type_of_high_risk_role` with `high_risk_roles` and the value `:type_of_high_risk_role` with `${roles.sql}`; in `replacements` delete `type_of_high_risk_role: project.type_of_high_risk_role || null,` and add `...roles.replacements,` as the last entry. After `const createdProject = result[0];` add `withLegacyHighRiskRole(createdProject);`.

`updateProjectByIdQuery`: remove `"type_of_high_risk_role",` from the field list and replace the block from `const setClause = [` through `.join(", ");` with:

```ts
  const setParts = [
    "project_title",
    "owner",
    "start_date",
    "ai_risk_classification",
    "goal",
    "geography",
    "target_industry",
    "description",
    "last_updated",
    "last_updated_by",
    "status",
    "use_case_category",
    "use_case_purpose",
    "use_case_audience",
    "deployment_context",
  ]
    .filter((f) => {
      // Include fields that are explicitly provided, including null, 0, or empty string
      if (project[f as keyof ProjectModel] !== undefined) {
        updateProject[f as keyof ProjectModel] = project[f as keyof ProjectModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`);
  if (project.high_risk_roles !== undefined) {
    // Sequelize would turn [] into NULL, so the roles go in as an SQL fragment.
    const roles = highRiskRolesArraySql(
      normalizeHighRiskRoles(project.high_risk_roles),
      "high_risk_roles",
    );
    setParts.push(`high_risk_roles = ${roles.sql}`);
    Object.assign(updateProject, roles.replacements);
  }
  const setClause = setParts.join(", ");
```

After the `if (!updatedProject) return null;` guard add `withLegacyHighRiskRole(updatedProject);` so the returned `{ ...updatedProject.dataValues, members }` and the automation replacements carry the derived role.

In `Servers/utils/user.utils.ts`, `getUserProjects` becomes:

```ts
export const getUserProjects = async (userId: number, organizationId: number) => {
  const result = await sequelize.query(
    `SELECT p.* FROM projects p
     INNER JOIN projects_members pm ON p.id = pm.project_id AND pm.organization_id = :organizationId
     WHERE p.organization_id = :organizationId AND pm.user_id = :user_id`,
    {
      replacements: { user_id: userId, organizationId },
      mapToModel: true,
      model: ProjectModel,
    },
  );
  result.forEach((project) => withLegacyHighRiskRole(project));
  return result;
};
```

with `import { withLegacyHighRiskRole } from "./highRiskRoles.utils";`.

- [ ] **Step 7: Requirements filter**

In `Servers/utils/eu.utils.ts` add `import { highRiskRolesArraySql } from "./highRiskRoles.utils";`. Update the doc comment above `getVisibleEuCategoryIdsForProject` to say `high_risk_roles` (a role-filtered category matches when its role is any of the use case's roles; no roles matches none) and replace the function body with:

```ts
  const [[project]] = (await sequelize.query(
    `SELECT p.high_risk_roles AS roles, p.ai_risk_classification AS tier
     FROM projects p
     JOIN projects_frameworks pf ON pf.project_id = p.id
       AND pf.organization_id = p.organization_id
     WHERE pf.id = :projectFrameworkId
       AND pf.organization_id = :organizationId
     LIMIT 1;`,
    {
      replacements: { projectFrameworkId, organizationId },
      ...(transaction ? { transaction } : {}),
    },
  )) as [{ roles: string[] | null; tier: string }[], number];

  const ROLE_FILTERED_TIERS = new Set(["High risk", "GPAI"]);
  const applyRoleFilter = ROLE_FILTERED_TIERS.has(project.tier);
  // ANY('{}'::text[]) matches nothing: a use case with no role sees no
  // role-filtered category, as a null role did.
  const roles = highRiskRolesArraySql(project.roles, "roles");

  const [rows] = (await sequelize.query(
    `SELECT cc.id
     FROM controlcategories_struct_eu cc
     JOIN frameworks f ON f.id = cc.framework_id
     WHERE f.name = 'EU AI Act'
       AND (
         EXISTS (
           SELECT 1 FROM controlcategories_struct_eu__risk_tiers cct
           JOIN eu_act_risk_tiers rt ON rt.id = cct.risk_tier_id
           WHERE cct.control_category_id = cc.id
             AND rt.name = 'General Risk'
         )
         OR (
           EXISTS (
             SELECT 1 FROM controlcategories_struct_eu__risk_tiers cct
             JOIN eu_act_risk_tiers rt ON rt.id = cct.risk_tier_id
             WHERE cct.control_category_id = cc.id
               AND rt.name = :tier
           )
           AND (
             :applyRoleFilter = FALSE
             OR EXISTS (
               SELECT 1 FROM controlcategories_struct_eu__roles ccr
               JOIN eu_act_roles r ON r.id = ccr.role_id
               WHERE ccr.control_category_id = cc.id
                 AND r.name = ANY(${roles.sql})
             )
           )
         )
       );`,
    {
      replacements: {
        tier: project.tier,
        applyRoleFilter,
        ...roles.replacements,
      },
      ...(transaction ? { transaction } : {}),
    },
  )) as [{ id: number }[], number];

  return rows.map((r) => r.id);
```

- [ ] **Step 8: Approval request and classification write-back**

`Servers/utils/approvalRequest.utils.ts`: in `getApprovalRequestByIdQuery` replace `p.type_of_high_risk_role,` with `p.high_risk_roles,`, and replace `const request = requestData as any;` with `const request = withLegacyHighRiskRole(requestData as any);` plus the import `import { withLegacyHighRiskRole } from "./highRiskRoles.utils";`.

`Servers/utils/euAiActClassification.utils.ts`: add `import { highRiskRolesArraySql, normalizeHighRiskRoles } from "./highRiskRoles.utils";` and replace `setUseCaseClassificationQuery` with:

```ts
/**
 * Set a use case's level, and its roles when the questionnaire named any,
 * without going through the general project update, which also rewrites
 * members and fires the project-updated automation. An empty role list leaves
 * the stored roles unchanged (an Out of scope result names no role).
 */
export const setUseCaseClassificationQuery = async (
  useCaseId: number,
  level: string,
  roles: readonly string[],
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const roleList = normalizeHighRiskRoles(roles);
  const rolesWrite = highRiskRolesArraySql(roleList, "roles");
  const rolesClause = roleList.length > 0 ? `high_risk_roles = ${rolesWrite.sql},` : "";
  const [rows] = (await sequelize.query(
    `UPDATE projects SET ai_risk_classification = :level, ${rolesClause}
       last_updated = NOW(), last_updated_by = :userId
     WHERE organization_id = :organizationId AND id = :useCaseId
     RETURNING id`,
    {
      replacements: { level, userId, organizationId, useCaseId, ...rolesWrite.replacements },
      transaction,
    },
  )) as [Array<{ id: number }>, number];
  return rows.length > 0;
};
```

`Servers/controllers/euAiActClassification.ctrl.ts`: in the `setUseCaseClassificationQuery(` call, replace the argument `result.role,` with `result.role ? [result.role] : [],` (Task 4 switches it to `result.roles`).

- [ ] **Step 9: Remaining compile and data fixes**

`Servers/controllers/project.ctrl.ts` (in `createProject`, the `recordUseCaseCreation` data): replace `type_of_high_risk_role: createdProject.type_of_high_risk_role,` with

```ts
            // An empty list is no value, so creation records no roles line.
            high_risk_roles: createdProject.high_risk_roles?.length
              ? createdProject.high_risk_roles
              : undefined,
```

`Servers/controllers/intakeForm.ctrl.ts` (approval, `createNewProjectQuery` argument): replace `type_of_high_risk_role: (entityData.type_of_high_risk_role as string as any) || undefined,` with `high_risk_roles: highRiskRolesFromEntityData(entityData),` and add `import { highRiskRolesFromEntityData } from "../utils/highRiskRoles.utils";`.

`Servers/infrastructure.layer/driver/autoDriver.driver.ts`: each `type_of_high_risk_role: HighRiskRole.DEPLOYER,` (three places) becomes `high_risk_roles: [HighRiskRole.DEPLOYER],`.

`Servers/scripts/seeds/sql/seed_risk_links_demo.sql`: in the `INSERT INTO projects` column list replace `type_of_high_risk_role` with `high_risk_roles`, and in the five value rows replace `'Deployer'` with `'{Deployer}'` and `'Provider'` with `'{Provider}'`.

`Servers/tests/integration/report-scope-authorization.test.ts`, `report-scope-membership.test.ts`, `report-run-visibility.test.ts`: in each `seedProject` INSERT replace the column `type_of_high_risk_role` with `high_risk_roles` and the value `'Deployer'` with `'{Deployer}'`.

Check nothing else names the column in SQL:

Run: `cd Servers && git grep -n "type_of_high_risk_role" -- '*.ts' '*.js' '*.sql' ':!database/migrations' ':!dist'`
Expected: hits only in `utils/highRiskRoles.utils.ts`, `domain.layer/models/project/project.model.ts` (toJSON), `domain.layer/interfaces/i.project.ts`, `config/changeHistory.config.ts`, `utils/validations/projectValidation.utils.ts`, `utils/automation/project.automation.utils.ts`, `middleware/validators/project.validator.ts`, `controllers/euAiActClassification.ctrl.ts` (history, Task 4), `controllers/intakeForm.ctrl.ts` (computed role merge, Task 5), `extensions/jira-assets/jiraAssets.service.ts` (Task 6), tests and `scripts/checkEnumLabelDrift.ts`/`generateEnumManifest.ts` (enum names only). No hit inside an SQL string.

- [ ] **Step 10: Run the unit tests and the build**

Run: `cd Servers && npx jest utils/__tests__/project.highRiskRoles.test.ts utils/__tests__/eu.utils.test.ts utils/__tests__/euAiActClassification.utils.test.ts controllers/__tests__/euAiActClassification.ctrl.test.ts controllers/__tests__/intakeForm.riskStep.test.ts && npm run build && npm run format-check && npm run test`
Expected: all PASS; build succeeds. If a `domain.layer/tests/*.spec.ts` that mocks `sequelize-typescript` fails with `DataType.ARRAY is not a function` because it now loads `project.model.ts`, add `ARRAY: jest.fn(), TEXT: "TEXT"` to that file's `DataType` mock.

- [ ] **Step 11: Migrate up, check, down, check, up**

```bash
SP=/private/tmp/claude-501/-Users-gorkemcetin-verifywise/e99e65fd-3923-494e-9c4c-e3d01ce6cd1d/scratchpad
DBU=$(grep '^DB_USER=' Servers/.env | cut -d= -f2)
cd Servers && npm run build && npx sequelize db:migrate && cd ..
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -f "$SP/visible-after.sql" > "$SP/visible-after.out"
diff "$SP/visible-before.out" "$SP/visible-after.out" && echo SAME-VISIBLE
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -c "SELECT high_risk_roles, count(*) FROM verifywise.projects GROUP BY 1 ORDER BY 1;"
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -c "SELECT roles, role, count(*) FROM verifywise.eu_ai_act_classifications GROUP BY 1, 2;"
psql -h localhost -p 5432 -U "$DBU" -d verifywise -c "BEGIN; UPDATE verifywise.projects SET high_risk_roles = '{Importer}' WHERE id = (SELECT min(id) FROM verifywise.projects); ROLLBACK;"
```

Expected: `SAME-VISIBLE`; role counts match `roles-before.out` (`{Deployer}|8`, `{}|2` on 2026-10-13); the last command fails with `violates check constraint "projects_high_risk_roles_check"`.

```bash
cd Servers && npx sequelize db:migrate:undo && cd ..
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -c "SELECT type_of_high_risk_role, count(*) FROM verifywise.projects GROUP BY 1 ORDER BY 1;" | diff "$SP/roles-before.out" - && echo SAME-ROLES
cd Servers && npx sequelize db:migrate && cd ..
psql -h localhost -p 5432 -U "$DBU" -d verifywise -At -f "$SP/visible-after.sql" | diff "$SP/visible-before.out" - && echo SAME-VISIBLE-AGAIN
```

Expected: `SAME-ROLES`, then `SAME-VISIBLE-AGAIN`. The dev DB ends migrated up.

**The dev database is shared.** Once it is migrated up, a backend started from `develop` (or any branch without this migration) fails on every project read and write, because `projects.type_of_high_risk_role` no longer exists. To work on another branch, roll this migration back first from this branch: `cd Servers && npm run build && npx sequelize db:migrate:undo` (lossy only for use cases given both roles). Say in the task report that the dev DB is now migrated up.

- [ ] **Step 12: Run the integration tests touched here**

Run: `cd Servers && npm run test:integration -- tests/integration/euVisibleCategories.highRiskRoles.test.ts tests/integration/report-scope-authorization.test.ts tests/integration/report-scope-membership.test.ts tests/integration/report-run-visibility.test.ts`
Expected: PASS. The harness builds, migrates the test database named in `Servers/.env.test` and refuses to touch the dev database. If the harness cannot run here (no test database server, missing `.env.test`), say so in the task report with the error, and keep Step 11's `SAME-VISIBLE` diff plus the unit tests as the evidence; do not run the sequelize CLI against the test database by hand.

- [ ] **Step 13: Commit**

```bash
git add Servers/database/migrations/*-multiple-high-risk-roles.js \
  Servers/domain.layer/models/project/project.model.ts Servers/domain.layer/interfaces/i.project.ts \
  Servers/domain.layer/models/project/project.mock.data.ts Servers/utils/project.utils.ts \
  Servers/utils/user.utils.ts Servers/utils/eu.utils.ts Servers/utils/approvalRequest.utils.ts \
  Servers/utils/euAiActClassification.utils.ts Servers/controllers/euAiActClassification.ctrl.ts \
  Servers/controllers/project.ctrl.ts Servers/controllers/intakeForm.ctrl.ts \
  Servers/infrastructure.layer/driver/autoDriver.driver.ts Servers/scripts/seeds/sql/seed_risk_links_demo.sql \
  Servers/tests/integration/report-scope-authorization.test.ts Servers/tests/integration/report-scope-membership.test.ts \
  Servers/tests/integration/report-run-visibility.test.ts Servers/tests/integration/euVisibleCategories.highRiskRoles.test.ts \
  Servers/utils/__tests__/project.highRiskRoles.test.ts Servers/utils/__tests__/eu.utils.test.ts \
  Servers/utils/__tests__/euAiActClassification.utils.test.ts \
  Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts Servers/controllers/__tests__/intakeForm.riskStep.test.ts
git status --short Servers/domain.layer/tests   # add any spec whose DataType mock you extended in Step 10
git commit -m "feat(use-cases): store EU AI Act roles as a list" -m "projects.type_of_high_risk_role becomes projects.high_risk_roles (text[],
CHECK Provider/Deployer). The migration backfills one-item lists, drops the
old column and keeps its enum type for the down migration, which is lossy for
use cases with both roles (Provider is kept). eu_ai_act_classifications gets a
roles list next to its single role.

Every SQL reader of the old column moves in the same change: project create
and update, the requirements filter (a category matches any of the use case's
roles; no roles matches none, as a null role did), approval request details,
the questionnaire write-back, seeds and integration fixtures. Arrays are bound
through highRiskRolesArraySql so an empty list is never bound as NULL.

Project rows leaving the data layer are decorated with the derived
type_of_high_risk_role, and ProjectModel.toJSON returns both fields, so API
responses keep their shape.

Verified on the dev database: visible EU AI Act categories per project are
identical before and after, and up/down/up restores the role counts."
```

---

### Task 3: API write rule, validation, change history and API docs

**Files:**
- Modify: `Servers/controllers/project.ctrl.ts` (`createProject` 215-229, `updateProjectById` 523-530)
- Modify: `Servers/middleware/validators/project.validator.ts:41-46`
- Modify: `Servers/utils/validations/projectValidation.utils.ts` (139-175, 389-519, 663-687, 718-855)
- Modify: `Servers/config/changeHistory.config.ts:420-457` (`use_case`)
- Modify: `Servers/swagger.yaml` (components `CreateProjectRequest`, `UpdateProjectRequest`, `Project`), `Servers/docs/api/projects-openapi.yaml` (lines ~710, ~785, ~855); regenerate `docs/api-docs/src/config/endpoints.ts` if the generator changes it
- Test: modify `Servers/controllers/__tests__/project.ctrl.test.ts`; create `Servers/middleware/__tests__/project.validator.test.ts`, `Servers/utils/validations/projectValidation.highRiskRoles.spec.ts`, `Servers/utils/__tests__/changeHistory.highRiskRoles.test.ts`

**Interfaces:**
- Consumes (Task 1): `resolveHighRiskRolesWrite`, `isHighRiskRole`, `formatHighRiskRoles`. (Task 2): `createNewProjectQuery`/`updateProjectByIdQuery` write `project.high_risk_roles`; `IProjectAttributes.high_risk_roles`.
- Produces:
  - `POST /projects` and `PATCH /projects/:id` accept `high_risk_roles: ("Provider"|"Deployer")[] | null` and the legacy `type_of_high_risk_role`; a disagreeing pair is 400.
  - `validateHighRiskRoles(value: unknown, isOrganizational?: boolean, frameworkIds?: number[]): ValidationResult` and `HIGH_RISK_ROLES_REQUIRED_MESSAGE` exported from `projectValidation.utils.ts` (replaces `validateTypeOfHighRiskRole`).
  - `validateRiskClassificationConsistency(aiRiskClassification: AiRiskClassification, highRiskRoles: readonly unknown[]): ValidationResult`.
  - Change history field `high_risk_roles`, label `"High-risk roles"`, compared as a set and shown as "Provider, Deployer".

- [ ] **Step 1: Write the failing tests**

1a. In `Servers/controllers/__tests__/project.ctrl.test.ts`, add inside `describe("createProject", ...)`:

```ts
    it("stores the role list normalised and drops the legacy field", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], high_risk_roles: ["Deployer", "Provider"] },
      });
      await createProject(req, createRes());
      const stored = mockCreate.mock.calls[0][0] as any;
      expect(stored.high_risk_roles).toEqual(["Provider", "Deployer"]);
      expect(stored).not.toHaveProperty("type_of_high_risk_role");
    });

    it("turns a legacy single role into a one-item list", async () => {
      mockCreate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const req = createReq({
        body: { project_title: "P1", owner: 1, framework: [], type_of_high_risk_role: "Deployer" },
      });
      await createProject(req, createRes());
      expect((mockCreate.mock.calls[0][0] as any).high_risk_roles).toEqual(["Deployer"]);
    });

    it("rejects a legacy role that disagrees with the list, writing nothing", async () => {
      const req = createReq({
        body: {
          project_title: "P1",
          owner: 1,
          framework: [],
          high_risk_roles: ["Provider"],
          type_of_high_risk_role: "Deployer",
        },
      });
      const res = createRes();
      await createProject(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreate).not.toHaveBeenCalled();
    });
```

and inside `describe("updateProjectById", ...)`:

```ts
    const updateWith = async (body: object, stored: string[]) => {
      mockGetById.mockResolvedValue({ ...buildProject(), owner: 1, high_risk_roles: stored } as any);
      mockGetMembers.mockResolvedValue([] as any);
      mockUpdate.mockResolvedValue({ ...buildProject(), owner: 1, members: [] } as any);
      const res = createRes();
      await updateProjectById(createReq({ params: { id: "1" }, body }), res);
      return res;
    };

    it("keeps both roles when an older client writes back the derived role", async () => {
      await updateWith({ type_of_high_risk_role: "Provider" }, ["Provider", "Deployer"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual(["Provider", "Deployer"]);
    });

    it("replaces the list when the legacy role is not in it", async () => {
      await updateWith({ type_of_high_risk_role: "Deployer" }, ["Provider"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual(["Deployer"]);
    });

    it("clears the list when the legacy role is null", async () => {
      await updateWith({ type_of_high_risk_role: null }, ["Provider"]);
      expect((mockUpdate.mock.calls[0][1] as any).high_risk_roles).toEqual([]);
    });

    it("replaces the list with high_risk_roles and never passes the legacy field on", async () => {
      await updateWith({ high_risk_roles: ["Deployer", "Provider"] }, ["Provider"]);
      const passed = mockUpdate.mock.calls[0][1] as any;
      expect(passed.high_risk_roles).toEqual(["Provider", "Deployer"]);
      expect(passed).not.toHaveProperty("type_of_high_risk_role");
    });

    it("leaves the roles alone when neither field is sent", async () => {
      await updateWith({ project_title: "P2" }, ["Provider"]);
      expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("high_risk_roles");
    });

    it("returns 400 and rolls back when the two fields disagree", async () => {
      const res = await updateWith(
        { high_risk_roles: ["Provider"], type_of_high_risk_role: "Deployer" },
        ["Provider"],
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect((await openedTransaction()).rollback).toHaveBeenCalled();
    });
```

1b. Create `Servers/middleware/__tests__/project.validator.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import { validateCreateProject, validateUpdateProject } from "../validators/project.validator";

const app = express();
app.use(express.json());
app.post("/projects", validateCreateProject, (_req, res) => res.status(200).json({ ok: true }));
app.patch("/projects/:id", validateUpdateProject, (_req, res) =>
  res.status(200).json({ ok: true }),
);

const base = { project_title: "P", owner: 1, start_date: "2026-01-01T00:00:00.000Z" };
const fields = (body: any): string[] => body.data.errors.map((e: { field: string }) => e.field);

describe("project validator: high-risk roles", () => {
  it("accepts both roles on create and on update", async () => {
    await supertest(app)
      .post("/projects")
      .send({ ...base, high_risk_roles: ["Provider", "Deployer"] })
      .expect(200);
    await supertest(app).patch("/projects/1").send({ high_risk_roles: ["Deployer"] }).expect(200);
  });

  it("accepts null and an empty list", async () => {
    await supertest(app).patch("/projects/1").send({ high_risk_roles: null }).expect(200);
    await supertest(app).patch("/projects/1").send({ high_risk_roles: [] }).expect(200);
  });

  it("rejects an unknown role", async () => {
    const res = await supertest(app)
      .patch("/projects/1")
      .send({ high_risk_roles: ["Provider", "Importer"] })
      .expect(400);
    expect(fields(res.body)).toContain("high_risk_roles[1]");
  });

  it("rejects a single string instead of a list", async () => {
    const res = await supertest(app)
      .patch("/projects/1")
      .send({ high_risk_roles: "Provider" })
      .expect(400);
    expect(fields(res.body)).toContain("high_risk_roles");
  });

  it("still accepts the legacy single role", async () => {
    await supertest(app)
      .patch("/projects/1")
      .send({ type_of_high_risk_role: "Provider" })
      .expect(200);
  });
});
```

1c. Create `Servers/utils/validations/projectValidation.highRiskRoles.spec.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import {
  HIGH_RISK_ROLES_REQUIRED_MESSAGE,
  sanitizeProjectDataForOrganizational,
  validateCompleteProject,
  validateHighRiskRoles,
  validateRiskClassificationConsistency,
  validateUpdateProject,
} from "./projectValidation.utils";

const EU_AI_ACT = [1];
const ISO_42001 = [2];

describe("validateHighRiskRoles", () => {
  it("requires at least one role when EU AI Act is selected", () => {
    expect(validateHighRiskRoles([], false, EU_AI_ACT)).toEqual({
      isValid: false,
      message: HIGH_RISK_ROLES_REQUIRED_MESSAGE,
      code: "REQUIRED_FIELD",
    });
    expect(validateHighRiskRoles(["Provider", "Deployer"], false, EU_AI_ACT)).toEqual({
      isValid: true,
    });
  });

  it("normalises duplicates away instead of rejecting them", () => {
    expect(validateHighRiskRoles(["Provider", "Provider"], false, EU_AI_ACT).isValid).toBe(true);
  });

  it("rejects unknown roles and a non-list", () => {
    expect(validateHighRiskRoles(["Importer"], false, EU_AI_ACT).code).toBe("INVALID_ENUM");
    expect(validateHighRiskRoles("Provider", false, EU_AI_ACT).code).toBe("INVALID_ENUM");
  });

  it("requires an empty list when EU AI Act is not selected", () => {
    expect(validateHighRiskRoles([], false, ISO_42001).isValid).toBe(true);
    expect(validateHighRiskRoles(["Provider"], false, ISO_42001).code).toBe(
      "HIGH_RISK_ROLE_WITHOUT_EU_AI_ACT",
    );
  });

  it("requires an empty list for organizational projects", () => {
    expect(validateHighRiskRoles(null, true, ISO_42001).isValid).toBe(true);
    expect(validateHighRiskRoles(["Deployer"], true, ISO_42001).code).toBe(
      "ORGANIZATIONAL_PROJECT_HIGH_RISK_ROLE_NOT_NULL",
    );
  });
});

describe("project validation with high_risk_roles", () => {
  it("reports the roles field on create", () => {
    const errors = validateCompleteProject({
      project_title: "P",
      owner: 1,
      start_date: "2026-01-01",
      goal: "G",
      framework: EU_AI_ACT,
      ai_risk_classification: "High risk",
      high_risk_roles: [],
    });
    expect(errors).toContainEqual({
      field: "high_risk_roles",
      message: HIGH_RISK_ROLES_REQUIRED_MESSAGE,
      code: "REQUIRED_FIELD",
    });
  });

  it("checks the roles on update only when they are sent", () => {
    const current = { is_organizational: false, framework: [{ framework_id: 1 }] };
    expect(validateUpdateProject({ project_title: "P" }, current)).toEqual([]);
    expect(validateUpdateProject({ high_risk_roles: ["Importer"] }, current)).toContainEqual(
      expect.objectContaining({ field: "high_risk_roles", code: "INVALID_ENUM" }),
    );
  });

  it("empties the roles of an organizational project", () => {
    expect(
      sanitizeProjectDataForOrganizational({ is_organizational: true, high_risk_roles: ["Provider"] })
        .high_risk_roles,
    ).toEqual([]);
  });

  it("accepts any list of valid roles for a high-risk system", () => {
    expect(
      validateRiskClassificationConsistency(AiRiskClassification.HIGH_RISK, ["Provider", "Deployer"])
        .isValid,
    ).toBe(true);
    expect(
      validateRiskClassificationConsistency(AiRiskClassification.HIGH_RISK, ["Importer"]).isValid,
    ).toBe(false);
  });
});
```

1d. Create `Servers/utils/__tests__/changeHistory.highRiskRoles.test.ts`:

```ts
import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../auditLedger.utils", () => ({ appendToAuditLedger: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { trackEntityChanges } from "../changeHistory.base.utils";

describe("use case change history for high-risk roles", () => {
  it("records nothing when the same roles come back in another order", async () => {
    await expect(
      trackEntityChanges(
        "use_case",
        { high_risk_roles: ["Provider", "Deployer"] },
        { high_risk_roles: ["Deployer", "Provider"] },
      ),
    ).resolves.toEqual([]);
  });

  it("records a change as two lists in the fixed order", async () => {
    await expect(
      trackEntityChanges(
        "use_case",
        { high_risk_roles: ["Deployer"] },
        { high_risk_roles: ["Deployer", "Provider"] },
      ),
    ).resolves.toEqual([
      { fieldName: "High-risk roles", oldValue: "Deployer", newValue: "Provider, Deployer" },
    ]);
  });

  it("shows no roles as a dash", async () => {
    await expect(
      trackEntityChanges("use_case", { high_risk_roles: [] }, { high_risk_roles: ["Provider"] }),
    ).resolves.toEqual([{ fieldName: "High-risk roles", oldValue: "-", newValue: "Provider" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest controllers/__tests__/project.ctrl.test.ts middleware/__tests__/project.validator.test.ts utils/validations/projectValidation.highRiskRoles.spec.ts utils/__tests__/changeHistory.highRiskRoles.test.ts`
Expected: FAIL — the controller passes `type_of_high_risk_role` through, the validator has no `high_risk_roles` rules, `validateHighRiskRoles` does not exist, history does not track `high_risk_roles`.

- [ ] **Step 3: Controller write rule**

In `Servers/controllers/project.ctrl.ts` add `import { resolveHighRiskRolesWrite } from "../utils/highRiskRoles.utils";`.

`createProject`: replace the start of the `try` block

```ts
    const newProject: Partial<ProjectModel> & {
      members: number[] | undefined;
      framework: number[];
      enable_ai_data_insertion: boolean;
    } = projectData;
```

with

```ts
    // Either role field may be sent; store the resolved list only.
    const highRiskRoles = resolveHighRiskRolesWrite(projectData, []) ?? [];
    delete projectData.type_of_high_risk_role;
    const newProject: Partial<ProjectModel> & {
      members: number[] | undefined;
      framework: number[];
      enable_ai_data_insertion: boolean;
    } = { ...projectData, high_risk_roles: highRiskRoles };
```

`updateProjectById`: directly after `delete updatedProject.id;` add

```ts
    // Either role field may be sent. Resolve them against the stored list, so a
    // client that writes back the derived single role cannot drop the other one.
    const highRiskRoles = resolveHighRiskRolesWrite(updateData, existingProject.high_risk_roles);
    delete updateData.type_of_high_risk_role;
    if (highRiskRoles === undefined) delete updatedProject.high_risk_roles;
    else updatedProject.high_risk_roles = highRiskRoles;
```

(`updateData` is `req.body`, typed `any`; `updatedProject` is the same object.) A `ValidationException` thrown here reaches the existing `catch`, which rolls back and returns 400.

- [ ] **Step 4: Request validator**

In `Servers/middleware/validators/project.validator.ts`, directly after the `body("type_of_high_risk_role")` chain add:

```ts
  body("high_risk_roles")
    .optional({ nullable: true })
    .isArray()
    .withMessage("high_risk_roles must be an array of high-risk roles"),
  body("high_risk_roles.*")
    .isIn(Object.values(HighRiskRole))
    .withMessage(`each high-risk role must be one of: ${Object.values(HighRiskRole).join(", ")}`),
```

- [ ] **Step 5: Validation utilities to the list**

In `Servers/utils/validations/projectValidation.utils.ts` add `import { isHighRiskRole } from "../highRiskRoles.utils";` and replace `validateTypeOfHighRiskRole` (lines 139-175) with:

```ts
/** Shown when EU AI Act is selected and no role is. Same text as the forms. */
export const HIGH_RISK_ROLES_REQUIRED_MESSAGE =
  "Select at least one high-risk role when EU AI Act is selected.";

/**
 * Validates the high-risk role list. Only Provider and Deployer; duplicates
 * are normalised away by the write path, not rejected here. With EU AI Act
 * selected (non-organizational) at least one role is required; otherwise, and
 * for organizational projects, the list must be empty.
 */
export const validateHighRiskRoles = (
  value: unknown,
  isOrganizational?: boolean,
  frameworkIds?: number[],
): ValidationResult => {
  const roles = value === undefined || value === null ? [] : value;
  if (!Array.isArray(roles) || !roles.every(isHighRiskRole)) {
    return {
      isValid: false,
      message: `High-risk roles must be a list of: ${HIGH_RISK_ROLE_ENUM.join(", ")}`,
      code: "INVALID_ENUM",
    };
  }

  const ineligibility = aiRiskClassificationIneligibility(isOrganizational, frameworkIds);
  if (ineligibility === "ORGANIZATIONAL_PROJECT_AI_RISK_NOT_NULL") {
    return roles.length === 0
      ? { isValid: true }
      : {
          isValid: false,
          message: "High-risk roles must be empty for organizational projects",
          code: "ORGANIZATIONAL_PROJECT_HIGH_RISK_ROLE_NOT_NULL",
        };
  }
  if (ineligibility === "AI_RISK_WITHOUT_EU_AI_ACT") {
    return roles.length === 0
      ? { isValid: true }
      : {
          isValid: false,
          message: "High-risk roles must be empty when EU AI Act is not selected",
          code: "HIGH_RISK_ROLE_WITHOUT_EU_AI_ACT",
        };
  }

  return roles.length > 0
    ? { isValid: true }
    : { isValid: false, message: HIGH_RISK_ROLES_REQUIRED_MESSAGE, code: "REQUIRED_FIELD" };
};
```

Then, in the same file:
- Both doc comments that say "ai_risk_classification and type_of_high_risk_role are validated conditionally" say `high_risk_roles`.
- `validateCompleteProject`: replace the `type_of_high_risk_role` block with

```ts
  // Validate high_risk_roles conditionally
  const highRiskRolesValidation = validateHighRiskRoles(
    data.high_risk_roles,
    isOrganizational,
    frameworkIds,
  );
  if (!highRiskRolesValidation.isValid) {
    errors.push({
      field: "high_risk_roles",
      message: highRiskRolesValidation.message || "High-risk roles validation failed",
      code: highRiskRolesValidation.code || "VALIDATION_FAILED",
    });
  }
```

- `sanitizeProjectDataForOrganizational`: `sanitizedData.type_of_high_risk_role = null;` becomes `sanitizedData.high_risk_roles = [];`.
- `validateUpdateProject`: in `updateFields` replace `"type_of_high_risk_role"` with `"high_risk_roles"`; replace the `if (data.type_of_high_risk_role !== undefined) { ... }` block with

```ts
  if (data.high_risk_roles !== undefined) {
    const highRiskRolesValidation = validateHighRiskRoles(
      data.high_risk_roles,
      isOrganizational,
      frameworkIds,
    );
    if (!highRiskRolesValidation.isValid) {
      errors.push({
        field: "high_risk_roles",
        message: highRiskRolesValidation.message || "High-risk roles validation failed",
        code: highRiskRolesValidation.code || "VALIDATION_FAILED",
      });
    }
  }
```

- `validateRiskClassificationConsistency` becomes

```ts
/**
 * Validates that AI risk classification is consistent with the high-risk roles
 */
export const validateRiskClassificationConsistency = (
  aiRiskClassification: AiRiskClassification,
  highRiskRoles: readonly unknown[],
): ValidationResult => {
  // Business rule: a high-risk system's roles must all be valid roles.
  if (
    aiRiskClassification === AiRiskClassification.HIGH_RISK &&
    !highRiskRoles.every(isHighRiskRole)
  ) {
    return {
      isValid: false,
      message: "High-risk AI classification requires valid high-risk role designations",
      code: "INCONSISTENT_RISK_CLASSIFICATION",
    };
  }

  // For minimal/limited risk systems, we accept any role designation
  // as they might still need role definition for compliance tracking
  return { isValid: true };
};
```

- `validateCompleteProjectWithBusinessRules`: the consistency block becomes

```ts
    // Check risk classification consistency (only for non-organizational projects)
    const highRiskRoles = Array.isArray(data.high_risk_roles) ? data.high_risk_roles : [];
    if (!data.is_organizational && data.ai_risk_classification && highRiskRoles.length > 0) {
      const consistencyCheck = validateRiskClassificationConsistency(
        data.ai_risk_classification,
        highRiskRoles,
      );
      if (!consistencyCheck.isValid) {
        errors.push({
          field: "high_risk_roles",
          message: consistencyCheck.message || "Risk classification is inconsistent",
          code: consistencyCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
```

- `validateUpdateProjectWithBusinessRules`: replace `newTypeOfHighRiskRole` and its block with

```ts
    const newHighRiskRoles: unknown[] =
      data.high_risk_roles !== undefined
        ? Array.isArray(data.high_risk_roles)
          ? data.high_risk_roles
          : []
        : Array.isArray(currentProject.high_risk_roles)
          ? currentProject.high_risk_roles
          : [];

    // Only check risk classification consistency for non-organizational projects
    if (!newIsOrganizational && newAiRiskClassification && newHighRiskRoles.length > 0) {
      const consistencyCheck = validateRiskClassificationConsistency(
        newAiRiskClassification,
        newHighRiskRoles,
      );
      if (!consistencyCheck.isValid) {
        errors.push({
          field: data.high_risk_roles !== undefined ? "high_risk_roles" : "ai_risk_classification",
          message: consistencyCheck.message || "Risk classification is inconsistent",
          code: consistencyCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
```

- `HighRiskRole` is still imported for `HIGH_RISK_ROLE_ENUM`; confirm with `npm run build` (noUnusedLocals) that no import is left unused.

- [ ] **Step 6: Change history**

In `Servers/config/changeHistory.config.ts` add `import { formatHighRiskRoles } from "../utils/highRiskRoles.utils";` and, in the `use_case` entry: replace `"type_of_high_risk_role",` in `fieldsToTrack` with `"high_risk_roles",`; replace the label `type_of_high_risk_role: "Type of high-risk role",` with `high_risk_roles: "High-risk roles",`; add to `fieldFormatters`:

```ts
      // Compared as a set: the formatter sorts Provider first, so a reorder
      // formats the same and records nothing.
      high_risk_roles: async (value: unknown): Promise<string> =>
        formatHighRiskRoles(value) || "-",
```

- [ ] **Step 7: API docs**

In `Servers/swagger.yaml`, `components.schemas`:
- In `CreateProjectRequest.properties` and `UpdateProjectRequest.properties`, replace the `type_of_high_risk_role:` entry with:

```yaml
        high_risk_roles:
          type: array
          nullable: true
          items:
            $ref: '#/components/schemas/HighRiskRole'
          description: 'EU AI Act roles of the use case: Provider, Deployer or both. Replaces the stored list; duplicates are removed and the list is stored as Provider, Deployer. null or [] clears it.'
          example:
            - Provider
            - Deployer
        type_of_high_risk_role:
          deprecated: true
          nullable: true
          description: 'Deprecated: use high_risk_roles. A role already in the use case''s list leaves the list unchanged; another role replaces the list with that one role; null clears it. Rejected with 400 when sent with a high_risk_roles list it does not match.'
          allOf:
            -
              $ref: '#/components/schemas/HighRiskRole'
```

- In `Project.properties`, add before `type_of_high_risk_role`:

```yaml
        high_risk_roles:
          type: array
          items:
            $ref: '#/components/schemas/HighRiskRole'
          description: 'EU AI Act roles of the use case, Provider first. Empty when none is set.'
          example:
            - Provider
            - Deployer
```

  and add to the existing `Project.properties.type_of_high_risk_role` (keep its `oneOf`) the lines `deprecated: true` and `description: 'Deprecated, derived from high_risk_roles: Provider when the list contains Provider, Deployer when it contains only Deployer, null when empty.'`.

Make the same three edits in `Servers/docs/api/projects-openapi.yaml` (its `type_of_high_risk_role` entries at ~710, ~785 and ~855; that file uses double-quoted `$ref` strings).

Then run: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: generation succeeds, the hand-written schema edits survive in `swagger.yaml` (the generator preserves components), `check:api-drift` passes. `git diff --stat ../docs/api-docs/src/config/endpoints.ts` shows whatever the generator changed; commit it if changed.

- [ ] **Step 8: Run the tests and the gate**

Run: `cd Servers && npx jest controllers/__tests__/project.ctrl.test.ts middleware/__tests__/project.validator.test.ts utils/validations/projectValidation.highRiskRoles.spec.ts utils/__tests__/changeHistory.highRiskRoles.test.ts && npm run build && npm run format-check && npm run test`
Expected: PASS; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add Servers/controllers/project.ctrl.ts Servers/middleware/validators/project.validator.ts \
  Servers/utils/validations/projectValidation.utils.ts Servers/config/changeHistory.config.ts \
  Servers/swagger.yaml Servers/docs/api/projects-openapi.yaml \
  Servers/controllers/__tests__/project.ctrl.test.ts Servers/middleware/__tests__/project.validator.test.ts \
  Servers/utils/validations/projectValidation.highRiskRoles.spec.ts \
  Servers/utils/__tests__/changeHistory.highRiskRoles.test.ts
git diff --quiet -- docs/api-docs/src/config/endpoints.ts || git add docs/api-docs/src/config/endpoints.ts
git commit -m "feat(use-cases): accept a list of high-risk roles in the API" -m "POST and PATCH /projects accept high_risk_roles (a list of Provider and
Deployer) next to the legacy type_of_high_risk_role:

- high_risk_roles replaces the list, normalised
- type_of_high_risk_role X keeps the list when it already holds X, so a
  client that reads the derived value and writes it back cannot drop a
  role; another X sets [X]; null clears
- both fields present and disagreeing is a 400

The request validator checks the list's shape. The project validation
utilities move to the list (they are not wired into a route today; that is
unchanged). Change history tracks high_risk_roles as a set, shown as
'Provider, Deployer', so reordering records nothing. Swagger and the
projects OpenAPI file document the list and mark the single role deprecated."
```

---

### Task 4: Questionnaire: role as a multi-select, scorer and run storage

**Files:**
- Modify: `Servers/services/euAiActClassification/types.ts` (`Question`, `ClassificationResult`)
- Modify: `Servers/services/euAiActClassification/questionnaire.v2.ts:83-102` (role question)
- Modify: `Servers/services/euAiActClassification/validate.ts`
- Modify: `Servers/services/euAiActClassification/score.v2.ts:290-335,466-482`
- Modify: `Servers/utils/euAiActClassification.utils.ts` (`ClassificationRun`, `NewClassificationRun`, `RUN_COLUMNS`, `insertClassificationRunQuery`)
- Modify: `Servers/controllers/euAiActClassification.ctrl.ts:118-171`
- Modify: `Servers/controllers/intakeForm.ctrl.ts:230-253` (`persistIntakeRiskRun`), `:1488-1504` (approval insert)
- Test: modify `Servers/services/euAiActClassification/__tests__/{validate,score.v2,intakeStep}.test.ts`, `Servers/utils/__tests__/euAiActClassification.utils.test.ts`, `Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts`, `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`, `Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts`

**Interfaces:**
- Consumes (Task 1): `formatHighRiskRoles`, `sameHighRiskRoles`, `legacyHighRiskRole`, `highRiskRolesArraySql`. (Task 2): `setUseCaseClassificationQuery(useCaseId, level, roles: readonly string[], ...)`.
- Produces:
  - `Question.acceptsSingleValue?: boolean` — a `multi_select` question that was `single_select` in saved answers.
  - `ClassificationResult.roles: ClassificationRole[]` (Provider first, always set by the scorer) next to `role: ClassificationRole | null` (= `roles[0] ?? null`).
  - `StoredClassificationResult = Omit<ClassificationResult, "roles"> & { roles?: ClassificationRole[] }` — what `ClassificationRun.result` holds; results stored before this change have no `roles`, so readers use `result.roles ?? result.role`.
  - `toRoles(answer: string | string[] | undefined): ClassificationRole[]` exported from `score.v2.ts`.
  - `validateAnswers` returns a saved string answer to an `acceptsSingleValue` question as a one-item array.
  - `ClassificationRun.roles: ClassificationRole[]`; `NewClassificationRun = Omit<ClassificationRun, "id" | "organizationId" | "createdAt" | "role">` — callers pass `roles`; the insert stores `roles` and the derived `role`.

- [ ] **Step 1: Write the failing tests**

1a. `Servers/services/euAiActClassification/__tests__/validate.test.ts`: change the first test's expectation to `expect(answers).toEqual({ ...MINIMAL, role: ["deployer"] });` (its title stays) and add inside the `describe`:

```ts
  it("accepts a saved single-role answer and returns it as a one-item list", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: "deployer" });
    expect(errors).toEqual([]);
    expect(answers.role).toEqual(["deployer"]);
  });

  it("accepts both roles", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      role: ["provider", "deployer"],
    });
    expect(errors).toEqual([]);
    expect(answers.role).toEqual(["provider", "deployer"]);
  });

  it("rejects a role given twice and an unanswered role", () => {
    expect(
      validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: ["provider", "provider"] }).errors,
    ).toEqual(['duplicate answer "provider" for question "role"']);
    expect(validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: [] }).errors).toEqual([
      'question "role" is not answered',
    ]);
  });
```

1b. `Servers/services/euAiActClassification/__tests__/score.v2.test.ts`: add at the end of the top-level `describe("scoreV2", ...)`:

```ts
  describe("a use case with both roles", () => {
    const articles = (r: { obligations: { article: string }[] }) =>
      r.obligations.map((o) => o.article);
    const keys = (r: { obligations: { article: string; text: string }[] }) =>
      r.obligations.map((o) => `${o.article}|${o.text}`);

    it("returns both roles, Provider first, and Provider as the single role", () => {
      const result = score({ role: ["deployer", "provider"] });
      expect(result.roles).toEqual(["Provider", "Deployer"]);
      expect(result.role).toBe("Provider");
    });

    it("lists the high-risk obligations of both roles once each, Provider first", () => {
      const provider = score({ role: ["provider"], annex_iii_areas: ["employment"], employment_use: ["recruitment"] });
      const deployer = score({ role: ["deployer"], annex_iii_areas: ["employment"], employment_use: ["recruitment"] });
      const both = score({
        role: ["provider", "deployer"],
        annex_iii_areas: ["employment"],
        employment_use: ["recruitment"],
      });
      expect(both.level).toBe("High risk");
      expect(new Set(keys(both)).size).toBe(keys(both).length);
      expect(keys(both)).toEqual(expect.arrayContaining([...keys(provider), ...keys(deployer)]));
      expect(articles(both).indexOf("Article 9")).toBeLessThan(articles(both).indexOf("Article 26(1)"));
    });

    it("lists a duty the roles share only once (Annex I Section B)", () => {
      const result = score({ role: ["provider", "deployer"], safety_function: "section_b" });
      expect(result.obligations.filter((o) => o.article !== "Article 4")).toHaveLength(1);
    });

    it("keeps the transparency obligations of both roles", () => {
      const result = score({ role: ["provider", "deployer"], transparency: ["interacts", "deepfake"] });
      expect(articles(result)).toEqual(expect.arrayContaining(["Article 50(1)", "Article 50(4)"]));
    });
  });

  it("scores a saved single-role string exactly like the one-item list", () => {
    expect(score({ role: "deployer", safety_function: "section_a" })).toEqual(
      score({ role: ["deployer"], safety_function: "section_a" }),
    );
    expect(score({ role: "provider", transparency: ["interacts", "deepfake"] }).roles).toEqual([
      "Provider",
    ]);
  });
```

(`annex_iii_areas: ["employment"]` with `employment_use: ["recruitment"]` is the Annex III high-risk path the existing tests at `score.v2.test.ts:159-160` already use; without a `profiling` or `derogation` answer the scorer treats it as high risk.)

1c. `Servers/services/euAiActClassification/__tests__/intakeStep.test.ts`: add

```ts
  it("accepts a single-role answer from a form opened before the role became a list", () => {
    const outcome = prepareIntakeRiskStep(true, ANSWERS); // role: "deployer"
    expect(outcome.ok && outcome.prepared?.answers.role).toEqual(["deployer"]);
    expect(outcome.ok && outcome.prepared?.result.roles).toEqual(["Deployer"]);
  });
```

1d. `Servers/utils/__tests__/euAiActClassification.utils.test.ts`: in `"scopes inserts to the organization and serialises JSON"` replace `role: "Deployer",` in the run with `roles: ["Deployer"],` and add the assertions:

```ts
    expect(sql()).toContain("ARRAY[:roles]::text[]");
    expect(replacements().roles).toEqual(["Deployer"]);
    expect(replacements().role).toBe("Deployer");
```

and add:

```ts
  it("stores no roles as the literal '{}' and a null single role", async () => {
    query.mockResolvedValue([{ id: 1 }]);
    await insertClassificationRunQuery(
      {
        useCaseId: 3,
        intakeSubmissionId: null,
        questionnaireVersion: 2,
        roles: [],
        answers: { scope: "research_only" },
        result: { level: "Out of scope" } as any,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: 7,
      },
      5,
    );
    expect(sql()).toContain("'{}'::text[]");
    expect(replacements()).not.toHaveProperty("roles");
    expect(replacements().role).toBeNull();
  });
```

1e. `Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts`, test `"saves a run, sets the level and role, and records history in one transaction"`: the mocked project gets `high_risk_roles: ["Deployer"]` instead of `type_of_high_risk_role: "Deployer"`; expect the run `toMatchObject({ ..., roles: ["Provider"] })` (drop `role: "Provider"`); expect `setUseCaseClassificationQuery` called with `(3, "High risk", ["Provider"], 7, 5, expect.anything())`; the history entry becomes `{ fieldName: "High-risk roles", oldValue: "Deployer", newValue: "Provider" }`. Add:

```ts
  it("records no roles change when the questionnaire gives the stored roles", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      ai_risk_classification: "High risk",
      high_risk_roles: ["Provider"],
      dataValues: { framework: EU_FRAMEWORK },
    });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(true);
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, res());
    expect(recordMultipleFieldChanges).not.toHaveBeenCalled();
  });

  it("sets both roles from a two-role answer", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      high_risk_roles: ["Deployer"],
      dataValues: { framework: EU_FRAMEWORK },
    });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(true);
    const answers = { ...MINIMAL, role: ["provider", "deployer"] };
    await classifyUseCase(req({ params: { id: "3" }, body: { answers } }) as any, res());
    expect((setUseCaseClassificationQuery as jest.Mock<any>).mock.calls[0][2]).toEqual([
      "Provider",
      "Deployer",
    ]);
    expect((recordMultipleFieldChanges as jest.Mock<any>).mock.calls[0][3]).toContainEqual({
      fieldName: "High-risk roles",
      oldValue: "Deployer",
      newValue: "Provider, Deployer",
    });
  });
```

1f. `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`, test `"stores and shows the computed role, not the role stored with the run"`: replace `expect(runs.insertClassificationRunQuery.mock.calls[0][0].role).toBe("Deployer");` with `expect(runs.insertClassificationRunQuery.mock.calls[0][0].roles).toEqual(["Deployer"]);`. In `"%s: stores a server-scored run and returns no classification"` add `expect(run.roles).toEqual(["Deployer"]);`.

1g. Same file, `describe("public form with a resubmission token", ...)`, test `"returns the previous risk answers when the step is on"` (around line 533): `validateAnswers` now returns the saved `role: "deployer"` as a list, so the resubmission prefill returns the array. Replace

```ts
    expect(data.previousRiskAnswers).toEqual(ANSWERS);
```

with

```ts
    // A run saved with a single-role string comes back as a one-item list.
    expect(data.previousRiskAnswers).toEqual({ ...ANSWERS, role: ["deployer"] });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest services/euAiActClassification utils/__tests__/euAiActClassification.utils.test.ts controllers/__tests__/euAiActClassification.ctrl.test.ts controllers/__tests__/intakeForm.riskStep.test.ts`
Expected: FAIL — a string role still validates without being converted, results have no `roles`, the insert has no `roles` column.

- [ ] **Step 3: Types and questionnaire**

`Servers/services/euAiActClassification/types.ts`: in `Question` add after `inputType`:

```ts
  /**
   * A multi_select question that used to be single_select: a saved single
   * answer (a string) still validates and is read as a one-item list.
   */
  acceptsSingleValue?: boolean;
```

and in `ClassificationResult` replace `role: ClassificationRole | null;` with:

```ts
  /** The roles the answers name, Provider first. Always set by the scorer. */
  roles: ClassificationRole[];
  /** Deprecated single role: Provider when present, else Deployer, else null. */
  role: ClassificationRole | null;
```

and add after the `ClassificationResult` interface:

```ts
/**
 * A result as stored in eu_ai_act_classifications.result (JSONB). Results
 * stored before the role list existed have no `roles`; read them with
 * `result.roles ?? result.role`.
 */
export type StoredClassificationResult = Omit<ClassificationResult, "roles"> & {
  roles?: ClassificationRole[];
};
```

`Servers/services/euAiActClassification/questionnaire.v2.ts`: the role question becomes (options and `showWhen` unchanged; the version is not bumped):

```ts
  {
    id: "role",
    text: "What is your role for this AI system? Select all that apply.",
    articleRef: "Article 3(3) and 3(4)",
    inputType: "multi_select",
    acceptsSingleValue: true,
    options: [
      {
        value: "provider",
        label: "Provider",
        description:
          "We develop the system, or have it developed, and place it on the market or put it into service under our name.",
      },
      {
        value: "deployer",
        label: "Deployer",
        description: "We use the system under our authority in a professional activity.",
      },
    ],
    showWhen: [[{ questionId: "scope", anyOf: ["in_scope"] }]],
  },
```

- [ ] **Step 4: Validation leniency for saved single-role answers**

In `Servers/services/euAiActClassification/validate.ts`, replace

```ts
    if (question.inputType === "multi_select" && !Array.isArray(value)) {
```

with

```ts
    if (
      question.inputType === "multi_select" &&
      !Array.isArray(value) &&
      !(question.acceptsSingleValue && typeof value === "string")
    ) {
```

and in the final loop replace `answers[question.id] = answer;` with

```ts
      // A saved single answer to a question that became multi-select is read
      // as a one-item list, so it scores and pre-fills like a new answer.
      answers[question.id] =
        question.inputType === "multi_select" && !Array.isArray(answer) ? [answer] : answer;
```

- [ ] **Step 5: Scorer**

In `Servers/services/euAiActClassification/score.v2.ts`:

Replace `highRiskObligations` with:

```ts
const highRiskObligations = (
  routes: Set<HighRiskRoute>,
  roles: ClassificationRole[],
): ClassificationReason[] => {
  const seen = new Set<string>();
  const obligations: ClassificationReason[] = [];
  // Provider first; a duty both roles share (same article and text) is listed once.
  for (const role of roles) {
    for (const route of ROUTE_ORDER.filter((r) => routes.has(r))) {
      const list = role === "Provider" ? PROVIDER_OBLIGATIONS[route] : DEPLOYER_OBLIGATIONS[route];
      for (const obligation of list) {
        const key = `${obligation.article}|${obligation.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        obligations.push({ ...obligation, appliesFrom: ROUTE_DATES[route] });
      }
    }
  }
  return obligations;
};
```

Replace `toRole` with:

```ts
const ROLE_ORDER: ClassificationRole[] = ["Provider", "Deployer"];
const ROLE_BY_ANSWER: Record<string, ClassificationRole> = {
  provider: "Provider",
  deployer: "Deployer",
};

/** The roles an answer names, Provider first. A string is a saved single-role answer. */
export const toRoles = (answer: string | string[] | undefined): ClassificationRole[] => {
  const named = asList(answer).map((value) => ROLE_BY_ANSWER[value]);
  return ROLE_ORDER.filter((role) => named.includes(role));
};
```

In `scoreV2`: `const role = toRole(answers.role);` becomes `const roles = toRoles(answers.role);`; the `result` builder returns `{ questionnaireVersion: 2, level, role: roles[0] ?? null, roles, reasons, obligations }`; the transparency filter becomes `.filter((t) => roles.length === 0 || roles.includes(TRANSPARENCY[t].role))`; and `highRiskObligations(routes, role)` becomes `highRiskObligations(routes, roles)`.

(Validated v2 answers always answer the role question when the system is in scope, so `roles` is never empty for a High risk result.)

- [ ] **Step 6: Run storage**

In `Servers/utils/euAiActClassification.utils.ts`:
- The file already imports `{ highRiskRolesArraySql, normalizeHighRiskRoles } from "./highRiskRoles.utils"`; change that line to `import { highRiskRolesArraySql, legacyHighRiskRole, normalizeHighRiskRoles } from "./highRiskRoles.utils";` (`normalizeHighRiskRoles` stays used by `setUseCaseClassificationQuery`).
- `ClassificationRun`: after `role: ClassificationRole | null;` add `roles: ClassificationRole[];` (the column is `NOT NULL DEFAULT '{}'` and was backfilled, so it is always present), and change `result: ClassificationResult;` to `result: StoredClassificationResult;` (import `StoredClassificationResult` from `../services/euAiActClassification` next to the existing imports) — old stored results lack `roles`. A freshly scored `ClassificationResult` is still assignable to it when inserting.
- `export type NewClassificationRun = Omit<ClassificationRun, "id" | "organizationId" | "createdAt" | "role">;` with the comment `/** The single role column is derived from roles on insert. */` above it.
- `RUN_COLUMNS`: `questionnaire_version AS "questionnaireVersion", role, roles, answers, result,`.
- `insertClassificationRunQuery`: before the query add `const roles = highRiskRolesArraySql(run.roles, "roles");`; the column list becomes `(organization_id, use_case_id, intake_submission_id, questionnaire_version, role, roles, answers, result, reviewer_level, reviewer_justification, reviewed_by, source, created_by)`; the values `(:organizationId, :useCaseId, :intakeSubmissionId, :questionnaireVersion, :role, ${roles.sql}, :answers, :result, :reviewerLevel, :reviewerJustification, :reviewedBy, :source, :createdBy)`; in `replacements` replace `role: run.role,` with `role: legacyHighRiskRole(run.roles),` and add `...roles.replacements,`.

- [ ] **Step 7: Callers**

`Servers/controllers/euAiActClassification.ctrl.ts` (`classifyUseCase`): add `import { formatHighRiskRoles, sameHighRiskRoles } from "../utils/highRiskRoles.utils";`; in the `insertClassificationRunQuery` argument replace `role: result.role,` with `roles: result.roles,`; in `setUseCaseClassificationQuery(` replace `result.role ? [result.role] : [],` with `result.roles,`; replace the role history block with

```ts
    if (result.roles.length > 0 && !sameHighRiskRoles(project.high_risk_roles, result.roles)) {
      changes.push({
        fieldName: "High-risk roles",
        oldValue: formatHighRiskRoles(project.high_risk_roles) || "-",
        newValue: formatHighRiskRoles(result.roles),
      });
    }
```

`Servers/controllers/intakeForm.ctrl.ts`: in `persistIntakeRiskRun` replace `role: prepared.result.role,` with `roles: prepared.result.roles,`; in the approval's `insertClassificationRunQuery` replace `role: classification.computed.role,` with `roles: classification.computed.roles,`.

`Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts` (compiled by `npm run build`): in the `insertClassificationRunQuery` call replace `role: "Deployer",` with `roles: ["Deployer"],` and add `roles: [],` to the `result` object next to `role: null,`.

- [ ] **Step 8: Run the tests and the gate**

Run: `cd Servers && npx jest services/euAiActClassification utils/__tests__/euAiActClassification.utils.test.ts controllers/__tests__/euAiActClassification.ctrl.test.ts controllers/__tests__/intakeForm.riskStep.test.ts && npm run build && npm run format-check && npm run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add Servers/services/euAiActClassification/types.ts Servers/services/euAiActClassification/questionnaire.v2.ts \
  Servers/services/euAiActClassification/validate.ts Servers/services/euAiActClassification/score.v2.ts \
  Servers/utils/euAiActClassification.utils.ts Servers/controllers/euAiActClassification.ctrl.ts \
  Servers/controllers/intakeForm.ctrl.ts \
  Servers/services/euAiActClassification/__tests__/validate.test.ts \
  Servers/services/euAiActClassification/__tests__/score.v2.test.ts \
  Servers/services/euAiActClassification/__tests__/intakeStep.test.ts \
  Servers/utils/__tests__/euAiActClassification.utils.test.ts \
  Servers/controllers/__tests__/euAiActClassification.ctrl.test.ts Servers/controllers/__tests__/intakeForm.riskStep.test.ts \
  Servers/tests/integration/tenant-isolation/eu-ai-act-classifications.isolation.test.ts
git commit -m "feat(eu-ai-act): let the questionnaire take both roles" -m "The role question becomes a multi-select ('What is your role for this AI
system? Select all that apply.') with the same options. The questionnaire
version is not bumped.

Saved answers hold the role as a string. validateAnswers accepts a string for
this question only (acceptsSingleValue) and returns it as a one-item list, so
pending intake approvals, resubmission prefills and the public risk step keep
their EU AI Act result; other multi-select questions still reject a string.

The scorer returns roles (Provider first) and the derived role. High-risk
obligations cover every role, a shared duty listed once; transparency
obligations keep any role in the list. Single-role answers score as before.

Classification runs store the roles list and the derived single role. The
wizard writes the list to the use case and records a 'High-risk roles'
history entry only when the set changes."
```

---

### Task 5: Intake: mapped role questions, approval with both roles, preview

**Files:**
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`buildEntityDataFromSubmission` 468-479, `getSubmissionPreview` 1121-1132, `approveSubmission` 1409-1413)
- Test: modify `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`

**Interfaces:**
- Consumes (Task 1): `HIGH_RISK_ROLE_MAPPING`, `resolveMappedHighRiskRoles`, `highRiskRolesFromEntityData`, `normalizeHighRiskRoles`, `sameHighRiskRoles`. (Task 4): `ClassificationResult.roles`.
- Produces (API, used by Task 10):
  - `GET /intake/submissions/:id/preview` → `entityPreview.high_risk_roles: ("Provider"|"Deployer")[]` and `entityPreview.high_risk_roles_unmatched: string[]` (labels) when the form maps a question to `type_of_high_risk_role`; the mapped value is no longer copied as `type_of_high_risk_role`.
  - `euAiActClassification.roles: ("Provider"|"Deployer")[]` next to `role`; `changedSinceSubmission` compares roles as a set.
  - `POST .../approve` reads `confirmedEntityData.high_risk_roles` (list) or the legacy `type_of_high_risk_role`; non-empty computed roles from the EU AI Act step replace them.

- [ ] **Step 1: Write the failing tests**

In `Servers/controllers/__tests__/intakeForm.riskStep.test.ts`:

1a. Add inside `describe("approval with the EU AI Act step", ...)`:

```ts
  it("gives the new use case both roles from a two-role run", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue({
      ...RUN,
      answers: { ...ANSWERS, role: ["provider", "deployer"] },
    });
    const r = await approve({ confirmedEntityData: { project_title: "P" } });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(projects.createNewProjectQuery.mock.calls[0][0].high_risk_roles).toEqual([
      "Provider",
      "Deployer",
    ]);
    expect(runs.insertClassificationRunQuery.mock.calls[0][0].roles).toEqual([
      "Provider",
      "Deployer",
    ]);
  });

  it("still approves a run saved with a single-role string, as Deployer", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(RUN); // answers.role === "deployer"
    const r = await approve({ confirmedEntityData: { project_title: "P" } });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(projects.createNewProjectQuery.mock.calls[0][0]).toMatchObject({
      ai_risk_classification: "Limited risk",
      high_risk_roles: ["Deployer"],
    });
    expect(projects.createNewProjectQuery.mock.calls[0][2]).toEqual([1]);
  });

  it("keeps the reviewer's role list when the run names no role", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue({
      ...RUN,
      answers: { scope: "research_only" },
      result: { ...RUN.result, level: "Out of scope", role: null },
    });
    await approve({
      confirmedEntityData: { project_title: "P", high_risk_roles: ["Deployer", "Provider"] },
    });
    expect(projects.createNewProjectQuery.mock.calls[0][0].high_risk_roles).toEqual([
      "Provider",
      "Deployer",
    ]);
  });

  it("preview resolves a mapped role question by option label and lists the rest", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
    intake.getSubmissionByIdQuery.mockResolvedValue({
      id: 9,
      status: "pending",
      formId: 1,
      entityType: "use_case",
      data: { f_role: ["opt_1", "opt_2", "deployer"] },
      submitterEmail: null,
    });
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      name: "F",
      entityType: "use_case",
      schema: {
        version: "1.0",
        fields: [
          {
            id: "f_role",
            type: "multiselect",
            label: "Your role",
            required: false,
            order: 0,
            entityFieldMapping: "type_of_high_risk_role",
            options: [
              { value: "opt_1", label: "Provider" },
              { value: "opt_2", label: "Importer" },
              { value: "deployer", label: "We use it" },
            ],
          },
        ],
      },
    });
    const r = res();
    await ctrl.getSubmissionPreview(req({ params: { id: "9" } }) as any, r);
    const preview = r.json.mock.calls[0][0].data.entityPreview;
    expect(preview.high_risk_roles).toEqual(["Provider", "Deployer"]);
    expect(preview.high_risk_roles_unmatched).toEqual(["Importer"]);
    expect(preview).not.toHaveProperty("type_of_high_risk_role");
  });

  it("preview returns the roles and compares them as a set", async () => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue({
      ...RUN,
      answers: { ...ANSWERS, role: ["deployer", "provider"] },
      result: { ...RUN.result, level: "Limited risk", role: "Provider", roles: ["Provider", "Deployer"] },
    });
    const r = res();
    await ctrl.getSubmissionPreview(req({ params: { id: "9" } }) as any, r);
    const panel = r.json.mock.calls[0][0].data.euAiActClassification;
    expect(panel.roles).toEqual(["Provider", "Deployer"]);
    expect(panel.changedSinceSubmission).toBe(false);
  });
```

(The resubmission-prefill expectation for a single-role string was already updated in Task 4, Step 1g.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.riskStep.test.ts`
Expected: FAIL — the preview copies the raw answer to `type_of_high_risk_role`, has no `roles`, approval does not take two computed roles.

- [ ] **Step 3: Implement**

In `Servers/controllers/intakeForm.ctrl.ts` the file already has `import { highRiskRolesFromEntityData } from "../utils/highRiskRoles.utils";`; replace that line with `import { HIGH_RISK_ROLE_MAPPING, highRiskRolesFromEntityData, resolveMappedHighRiskRoles, sameHighRiskRoles } from "../utils/highRiskRoles.utils";`.

`buildEntityDataFromSubmission` becomes:

```ts
function buildEntityDataFromSubmission(
  submissionData: Record<string, unknown>,
  formSchema: IIntakeFormSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of formSchema.fields) {
    if (!field.entityFieldMapping || submissionData[field.id] === undefined) continue;
    if (field.entityFieldMapping === HIGH_RISK_ROLE_MAPPING) {
      // A select stores option values; match each option by label or value.
      // Options that name no role are kept by label for the review dialog.
      const { roles, unmatched } = resolveMappedHighRiskRoles(
        submissionData[field.id],
        field.options,
      );
      result.high_risk_roles = roles;
      result.high_risk_roles_unmatched = unmatched;
      continue;
    }
    result[field.entityFieldMapping] = submissionData[field.id];
  }
  return result;
}
```

`getSubmissionPreview`, the `euAiActClassification` object becomes:

```ts
    const euAiActClassification = rescored
      ? {
          questionnaire: rescored.questionnaire,
          answers: rescored.run.answers,
          role: rescored.result.role,
          roles: rescored.result.roles,
          current: rescored.result,
          // Results stored before roles existed have only the single role.
          changedSinceSubmission:
            rescored.result.level !== rescored.run.result.level ||
            !sameHighRiskRoles(
              rescored.result.roles,
              rescored.run.result.roles ?? rescored.run.result.role,
            ),
          submittedAt: rescored.run.createdAt,
        }
      : null;
```

`approveSubmission`: replace

```ts
        ...(computed.role ? { type_of_high_risk_role: computed.role } : {}),
```

with

```ts
        // The step's roles win; with none (Out of scope) the reviewer's stay.
        ...(computed.roles.length > 0 ? { high_risk_roles: computed.roles } : {}),
```

Update the comment above (`The computed role replaces the dialog's role, which stays only when the result has no role`) to say "roles". The `createNewProjectQuery` argument already reads `high_risk_roles: highRiskRolesFromEntityData(entityData)`, which takes the list first and the legacy field second; leave it.

- [ ] **Step 4: Run the tests and the gate**

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.riskStep.test.ts && npm run build && npm run format-check && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/controllers/intakeForm.ctrl.ts Servers/controllers/__tests__/intakeForm.riskStep.test.ts
git commit -m "feat(intake): carry several high-risk roles from intake to the use case" -m "A form question mapped to the role field used to be copied as-is: a
select stores the option's value, so it only worked when the form author typed
'Provider' or 'Deployer' as values. Now each selected option is resolved to
its label and matched to a role by label or value, case-insensitively, and
works for select and multi-select questions. Options that name no role are
returned in entityPreview.high_risk_roles_unmatched for the review dialog.

On approval the EU AI Act step's roles (both, when the submitter chose both)
replace the reviewer's; with none (Out of scope) the reviewer's list stays,
and a legacy single role from an older dialog still works. The preview
returns the roles and compares them as a set when flagging a change since
submission. Runs saved with a single-role string still approve and prefill."
```

---

### Task 6: Other backend readers: automations, Jira Assets, share links, advisor

**Files:**
- Modify: `Servers/utils/automation/project.automation.utils.ts`
- Modify: `Servers/extensions/jira-assets/jiraAssets.service.ts:1404-1412`
- Modify: `Servers/controllers/shareLink.ctrl.ts` (both `resourceData = ...` assignments, ~800 and ~823)
- Modify: `Servers/advisor/functions/useCaseFunctions.ts` (`created` after the INSERT ~224; `updated` in the update tools ~269 and ~283)
- Test: create `Servers/utils/__tests__/project.automation.utils.test.ts`; modify `Servers/extensions/jira-assets/__tests__/jiraAssets.service.test.ts`

**Interfaces:**
- Consumes (Task 1): `formatHighRiskRoles`, `normalizeHighRiskRoles`, `legacyHighRiskRole`, `withLegacyHighRiskRole`.
- Produces:
  - Automation variables `{{project.type_of_high_risk_role}}` and `{{old_project.type_of_high_risk_role}}` render the full list ("Provider, Deployer"); the change summary line is `• High-risk roles: <old> → <new>` and compares sets.
  - Jira Assets use case view returns `high_risk_roles` and the derived `type_of_high_risk_role`.

- [ ] **Step 1: Write the failing tests**

1a. Create `Servers/utils/__tests__/project.automation.utils.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import {
  buildProjectReplacements,
  buildProjectUpdateReplacements,
} from "../automation/project.automation.utils";

const base = { id: 1, project_title: "P", goal: "G", owner_name: "A B", status: "In progress" };

describe("project automation replacements: high-risk roles", () => {
  it("renders every role in the existing variable", () => {
    const replacements = buildProjectReplacements({
      ...base,
      high_risk_roles: ["Deployer", "Provider"],
    });
    expect(replacements["project.type_of_high_risk_role"]).toBe("Provider, Deployer");
  });

  it("shows a change of roles as old and new lists", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Provider"] },
      { ...base, high_risk_roles: ["Provider", "Deployer"] },
    );
    expect(replacements.changes_summary).toContain("• High-risk roles: Provider → Provider, Deployer");
    expect(replacements["old_project.type_of_high_risk_role"]).toBe("Provider");
    expect(replacements["project.type_of_high_risk_role"]).toBe("Provider, Deployer");
  });

  it("adds no changed line when only the order differs", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Provider", "Deployer"] },
      { ...base, high_risk_roles: ["Deployer", "Provider"] },
    );
    expect(replacements.changes_summary).toContain("• High-risk roles: Provider, Deployer");
    expect(replacements.changes_summary).not.toContain("→ Provider, Deployer");
  });

  it("shows no roles as (empty) in a change", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Deployer"] },
      { ...base, high_risk_roles: [] },
    );
    expect(replacements.changes_summary).toContain("• High-risk roles: Deployer → (empty)");
  });
});
```

1b. In `Servers/extensions/jira-assets/__tests__/jiraAssets.service.test.ts`, add `getUseCaseByProjectId` to the import list from `"../jiraAssets.service"` and add at the end of the file:

```ts
describe("getUseCaseByProjectId", () => {
  it("returns the native use case's roles and the derived single role", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM jira_assets_use_cases"))
        return [{ id: 4, project_id: 50, uc_id: "UC-50", data: "{}" }];
      if (String(sql).includes("SELECT * FROM projects"))
        return [{ id: 50, project_title: "P", high_risk_roles: ["Deployer", "Provider"] }];
      return [];
    });
    const useCase = await getUseCaseByProjectId(50, 1);
    expect(useCase?.high_risk_roles).toEqual(["Provider", "Deployer"]);
    expect(useCase?.type_of_high_risk_role).toBe("Provider");
  });
});
```

(If the file's top-level `beforeEach` resets `mockQuery` with a default implementation, this `mockImplementation` overrides it for this test only, which is what is wanted.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest utils/__tests__/project.automation.utils.test.ts extensions/jira-assets/__tests__/jiraAssets.service.test.ts`
Expected: FAIL — the automation reads `type_of_high_risk_role`; Jira returns `type_of_high_risk_role: null` and no list.

- [ ] **Step 3: Implement**

`Servers/utils/automation/project.automation.utils.ts`: add at the top

```ts
import { formatHighRiskRoles } from "../highRiskRoles.utils";

/** A project's roles as "Provider, Deployer"; rows from before the list fall back to the single role. */
const rolesOf = (project: any): string =>
  formatHighRiskRoles(project.high_risk_roles ?? project.type_of_high_risk_role);
```

In `buildProjectReplacements`: `"project.type_of_high_risk_role": rolesOf(project),`.

In `buildProjectUpdateReplacements`: replace the `type_of_high_risk_role` block with

```ts
  // Compared as sets: rolesOf sorts Provider first, so a reorder is no change.
  const oldRoles = rolesOf(oldProject);
  const newRoles = rolesOf(newProject);
  if (oldRoles !== newRoles) {
    changes.push(`• High-risk roles: ${oldRoles || "(empty)"} → ${newRoles || "(empty)"}`);
  } else if (newRoles) {
    changes.push(`• High-risk roles: ${newRoles}`);
  }
```

and set `"project.type_of_high_risk_role": newRoles,` and `"old_project.type_of_high_risk_role": oldRoles,`.

`Servers/extensions/jira-assets/jiraAssets.service.ts`: add `import { legacyHighRiskRole, normalizeHighRiskRoles } from "../../utils/highRiskRoles.utils";` and in `getUseCaseByProjectId` replace `type_of_high_risk_role: nativeProject.type_of_high_risk_role ?? null,` with

```ts
    high_risk_roles: normalizeHighRiskRoles(nativeProject.high_risk_roles),
    // Deprecated single role, kept for existing Jira Assets mappings.
    type_of_high_risk_role: legacyHighRiskRole(nativeProject.high_risk_roles),
```

`Servers/controllers/shareLink.ctrl.ts`: add `import { withLegacyHighRiskRole } from "../utils/highRiskRoles.utils";`. Replace `resourceData = resourceResult; // Return array of records for table view (can be empty)` with

```ts
      // Project rows are SELECT *: add the derived single role for older readers.
      resourceData =
        resourceType === "project" ? resourceResult.map(withLegacyHighRiskRole) : resourceResult;
```

and `resourceData = resourceResult[0]; // Return single record` with

```ts
      resourceData =
        resourceType === "project" ? withLegacyHighRiskRole(resourceResult[0]) : resourceResult[0];
```

`Servers/advisor/functions/useCaseFunctions.ts`: add `import { withLegacyHighRiskRole } from "../../utils/highRiskRoles.utils";` and wrap the three `RETURNING *` rows the tools hand back:
- create (~224): `const created = withLegacyHighRiskRole((result as any)[0]?.[0] || (result as any)[0]);`
- update use case (~269) and update status (~283): each `const updated = (result as any)[0]?.[0] || (result as any)[0];` becomes `const updated = withLegacyHighRiskRole((result as any)[0]?.[0] || (result as any)[0]);`

- [ ] **Step 4: Grep every backend reader**

Run: `cd Servers && git grep -n -E "type_of_high_risk_role" -- '*.ts' '*.js' '*.sql' ':!database/migrations' ':!dist'`
Expected — every remaining hit is one of: the derived API field (`project.model.ts` toJSON, `jiraAssets.service.ts`, `highRiskRoles.utils.ts`), the legacy input (`project.validator.ts`, `project.ctrl.ts` resolution, `highRiskRoles.utils.ts`), the intake mapping key (`HIGH_RISK_ROLE_MAPPING`), the automation variable names (`project.automation.utils.ts`), the interface's deprecated field (`i.project.ts`), or tests. Fix any other hit (it is a reader that silently gets `undefined`).

Run: `cd Servers && git grep -n -E "\.type_of_high_risk_role" -- '*.ts' ':!**/__tests__/**' ':!**/*.spec.ts' ':!**/*.test.ts'`
Expected: only `project.automation.utils.ts` (`rolesOf` fallback), `highRiskRoles.utils.ts`, and `controllers/project.ctrl.ts` (`delete projectData.type_of_high_risk_role` in `createProject` and `delete updateData.type_of_high_risk_role` in `updateProjectById`). Those two `delete` lines are intentional — they stop the legacy field reaching the data layer after it is resolved — do not remove them.

- [ ] **Step 5: Run the tests and the gate**

Run: `cd Servers && npx jest utils/__tests__/project.automation.utils.test.ts extensions/jira-assets/__tests__/jiraAssets.service.test.ts && npm run build && npm run format-check && npm run test && npm run check:enum-drift`
Expected: PASS; `check:enum-drift` passes and `git status --short Servers/enum-manifest.json` shows no change (the `HighRiskRole` values did not change). If it changed, inspect the diff and commit it with this task only if it is a pure regeneration.

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/automation/project.automation.utils.ts Servers/extensions/jira-assets/jiraAssets.service.ts \
  Servers/controllers/shareLink.ctrl.ts Servers/advisor/functions/useCaseFunctions.ts \
  Servers/utils/__tests__/project.automation.utils.test.ts \
  Servers/extensions/jira-assets/__tests__/jiraAssets.service.test.ts
git commit -m "feat(use-cases): show every high-risk role in automations and integrations" -m "Readers of SELECT * project rows lose a removed column silently, so each
one now reads the list:

- automations: {{project.type_of_high_risk_role}} and the old_project
  variable render the full list ('Provider, Deployer'); the project-updated
  summary line reads 'High-risk roles: old -> new' and compares sets, so a
  reorder adds no changed line
- Jira Assets: the use case view returns high_risk_roles and keeps sending
  the derived single role for existing mappings
- share links and the advisor's created and updated use cases get the derived field

Existing automation templates keep working unchanged."
```

---

### Task 7: Frontend role helpers, types and mapper

**Files:**
- Create: `Clients/src/application/utils/highRiskRoles.ts`
- Test: create `Clients/src/application/utils/__tests__/highRiskRoles.test.ts`
- Modify: `Clients/src/domain/types/Project.ts:11-18`
- Modify: `Clients/src/application/dtos/project.dto.ts:30,77,103`
- Modify: `Clients/src/domain/models/Common/project/project.model.ts:11,32`
- Modify: `Clients/src/domain/ports/IProjectRepository.ts:16,31,43`
- Modify: `Clients/src/domain/types/euAiActClassification.ts` (`ClassificationResult`)
- Modify: `Clients/src/application/repository/intakeForm.repository.ts:23-30` (`EuAiActClassificationPreview`)
- Modify: `Clients/src/application/repository/entityGraph.repository.ts:13`
- Modify: `Clients/src/application/mappers/project.mapper.ts`
- Modify tests/fixtures: `Clients/src/application/mappers/tests/project.mappers.test.ts`, `Clients/src/application/mappers/tests/mocks/project.mappers.mocks.ts`, `Clients/src/test/factories/project.factory.ts:12`, `Clients/src/presentation/pages/ISO/Clause/__tests__/Clause.test.tsx:30`

**Interfaces:**
- Consumes: `HighRiskRole` from `Clients/src/domain/enums/highRiskRole.enum.ts` (`DEPLOYER = "Deployer"`, `PROVIDER = "Provider"`). The API (Tasks 2-5) sends `high_risk_roles` on projects, `roles` on classification results and previews.
- Produces (all exported from `Clients/src/application/utils/highRiskRoles.ts`):
  - `HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[]`
  - `HIGH_RISK_ROLES_REQUIRED_MESSAGE = "Select at least one high-risk role when EU AI Act is selected."`
  - `normalizeHighRiskRoles(input: unknown): HighRiskRole[]` — lenient: also maps legacy inputs (numbers 1 → Provider, 0 and 2 → Deployer; `not_applicable` → Deployer; pre-reduction names Distributor, Importer, Product manufacturer, Authorized representative → Provider; case-insensitive); drops unknown values
  - `formatHighRiskRoles(roles: unknown): string`
  - `projectHighRiskRoles(project: { high_risk_roles?: unknown; type_of_high_risk_role?: unknown } | null | undefined): HighRiskRole[]`
  - `classificationRoles(result: { roles?: unknown; role?: unknown } | null | undefined): HighRiskRole[]`
  - `highRiskRolesError(roles: unknown, hasEuAiAct: boolean): string`
  - `highRiskRolesPayload(roles: unknown, hasEuAiAct: boolean): HighRiskRole[]`
  - `highRiskRolesSortKey(project: { high_risk_roles?: unknown; type_of_high_risk_role?: unknown } | null | undefined): string`
  - `Project.high_risk_roles?: HighRiskRole[]`; `Project.type_of_high_risk_role?: HighRiskRole | null` (deprecated); `ClassificationResult.roles?: ClassificationRole[]`; `EuAiActClassificationPreview.roles?: ClassificationRole[]`
  - `mapHighRiskRoles(value: unknown): HighRiskRole[]` in `project.mapper.ts` (replaces `mapHighRiskRole`)

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/application/utils/__tests__/highRiskRoles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HighRiskRole } from "../../../domain/enums/highRiskRole.enum";
import {
  HIGH_RISK_ROLES_REQUIRED_MESSAGE,
  classificationRoles,
  formatHighRiskRoles,
  highRiskRolesError,
  highRiskRolesPayload,
  highRiskRolesSortKey,
  normalizeHighRiskRoles,
  projectHighRiskRoles,
} from "../highRiskRoles";

const { PROVIDER, DEPLOYER } = HighRiskRole;

describe("normalizeHighRiskRoles", () => {
  it("orders Provider first and drops duplicates", () => {
    expect(normalizeHighRiskRoles(["Deployer", "Provider", "Deployer"])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
  });

  it("maps legacy inputs", () => {
    expect(normalizeHighRiskRoles(1)).toEqual([PROVIDER]);
    expect(normalizeHighRiskRoles(0)).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles(2)).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("not_applicable")).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("deployer")).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("Product Manufacturer")).toEqual([PROVIDER]);
    expect(normalizeHighRiskRoles("Importer")).toEqual([PROVIDER]);
  });

  it("drops unknown values instead of defaulting to Provider", () => {
    expect(normalizeHighRiskRoles("InvalidString")).toEqual([]);
    expect(normalizeHighRiskRoles(99)).toEqual([]);
    expect(normalizeHighRiskRoles(null)).toEqual([]);
    expect(normalizeHighRiskRoles("")).toEqual([]);
  });
});

describe("display and form helpers", () => {
  it("formats in the fixed order", () => {
    expect(formatHighRiskRoles([DEPLOYER, PROVIDER])).toBe("Provider, Deployer");
    expect(formatHighRiskRoles([])).toBe("");
  });

  it("reads a project's list, falling back to the legacy single role", () => {
    expect(projectHighRiskRoles({ high_risk_roles: [DEPLOYER, PROVIDER] })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(projectHighRiskRoles({ type_of_high_risk_role: "Deployer" })).toEqual([DEPLOYER]);
    expect(projectHighRiskRoles({ high_risk_roles: [], type_of_high_risk_role: "Deployer" })).toEqual(
      [],
    );
    expect(projectHighRiskRoles(undefined)).toEqual([]);
  });

  it("reads a result's roles, falling back to the single role of an older result", () => {
    expect(classificationRoles({ roles: ["Provider", "Deployer"], role: "Provider" })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(classificationRoles({ role: "Deployer" })).toEqual([DEPLOYER]);
    expect(classificationRoles({ role: null })).toEqual([]);
  });

  it("requires a role only when EU AI Act is selected", () => {
    expect(highRiskRolesError([], true)).toBe(HIGH_RISK_ROLES_REQUIRED_MESSAGE);
    expect(highRiskRolesError([PROVIDER], true)).toBe("");
    expect(highRiskRolesError([], false)).toBe("");
  });

  it("sends the roles only when EU AI Act is selected", () => {
    expect(highRiskRolesPayload([DEPLOYER, PROVIDER], true)).toEqual([PROVIDER, DEPLOYER]);
    expect(highRiskRolesPayload([PROVIDER], false)).toEqual([]);
  });

  it("sorts by the joined list", () => {
    const keys = [
      { high_risk_roles: [DEPLOYER] },
      { high_risk_roles: [PROVIDER, DEPLOYER] },
      { high_risk_roles: [PROVIDER] },
      { high_risk_roles: [] },
    ].map(highRiskRolesSortKey);
    expect([...keys].sort()).toEqual(["", "deployer", "provider", "provider, deployer"]);
  });
});
```

In `Clients/src/application/mappers/tests/project.mappers.test.ts`: import `mapHighRiskRoles` instead of `mapHighRiskRole`, and replace the whole `describe("mapHighRiskRole", ...)` block with:

```ts
  describe("mapHighRiskRoles", () => {
    it("maps a list, ordered Provider first", () => {
      expect(mapHighRiskRoles(["Deployer", "Provider"])).toEqual([
        HighRiskRole.PROVIDER,
        HighRiskRole.DEPLOYER,
      ]);
    });
    it("maps legacy single values to a one-item list", () => {
      expect(mapHighRiskRoles(1)).toEqual([HighRiskRole.PROVIDER]);
      expect(mapHighRiskRoles(0)).toEqual([HighRiskRole.DEPLOYER]);
      expect(mapHighRiskRoles("Deployer")).toEqual([HighRiskRole.DEPLOYER]);
      expect(mapHighRiskRoles("not_applicable")).toEqual([HighRiskRole.DEPLOYER]);
      expect(mapHighRiskRoles("Distributor")).toEqual([HighRiskRole.PROVIDER]);
    });
    it("drops unknown values instead of defaulting to Provider", () => {
      expect(mapHighRiskRoles("InvalidString")).toEqual([]);
      expect(mapHighRiskRoles(99)).toEqual([]);
    });
  });
```

In the `mapProjectResponseDTOToProject` test add `expect(project.high_risk_roles).toEqual([HighRiskRole.PROVIDER]);` after the `type_of_high_risk_role` assertion; in the `mapProjectResponseDTOToModel` test add `expect(projectModel.high_risk_roles).toEqual([HighRiskRole.PROVIDER]);`. In the `mapCreateProjectFormToDTO` test replace `expect(result.type_of_high_risk_role).toBe(form.type_of_high_risk_role);` with `expect(result.high_risk_roles).toEqual([HighRiskRole.PROVIDER, HighRiskRole.DEPLOYER]);`.

In `Clients/src/application/mappers/tests/mocks/project.mappers.mocks.ts`, in the form builder replace `type_of_high_risk_role: 2,` with `high_risk_roles: [HighRiskRole.DEPLOYER, HighRiskRole.PROVIDER],` and add `import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";`. Leave the response DTO's `type_of_high_risk_role: 1` (it exercises the legacy input).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/application/utils/__tests__/highRiskRoles.test.ts src/application/mappers/tests/project.mappers.test.ts`
Expected: FAIL — module `../highRiskRoles` not found; `mapHighRiskRoles` not exported.

- [ ] **Step 3: Write the helpers**

Create `Clients/src/application/utils/highRiskRoles.ts`:

```ts
import { HighRiskRole } from "../../domain/enums/highRiskRole.enum";

/** Storage and display order, as on the server. */
export const HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[] = [
  HighRiskRole.PROVIDER,
  HighRiskRole.DEPLOYER,
];

/** Shown when EU AI Act is selected and no role is. Same text as the server. */
export const HIGH_RISK_ROLES_REQUIRED_MESSAGE =
  "Select at least one high-risk role when EU AI Act is selected.";

// Role names from before the reduction to Provider and Deployer (migration
// 20260421234619) collapse onto Provider, as the migration did.
const LEGACY_PROVIDER_NAMES = [
  "provider",
  "distributor",
  "importer",
  "product manufacturer",
  "authorized representative",
];

type WithRoles = { high_risk_roles?: unknown; type_of_high_risk_role?: unknown } | null | undefined;

/** One API or legacy value as a role, or null when it names none. */
const toHighRiskRole = (value: unknown): HighRiskRole | null => {
  if (typeof value === "number") {
    if (value === 1) return HighRiskRole.PROVIDER;
    return value === 0 || value === 2 ? HighRiskRole.DEPLOYER : null;
  }
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase().replace(/_/g, " ");
  if (name === "deployer" || name === "not applicable") return HighRiskRole.DEPLOYER;
  return LEGACY_PROVIDER_NAMES.includes(name) ? HighRiskRole.PROVIDER : null;
};

/** Known roles only, no duplicates, Provider first. A single value reads as a one-item list. */
export const normalizeHighRiskRoles = (input: unknown): HighRiskRole[] => {
  const values = Array.isArray(input)
    ? input
    : input === null || input === undefined || input === ""
      ? []
      : [input];
  const roles = values.map(toHighRiskRole);
  return HIGH_RISK_ROLE_ORDER.filter((role) => roles.includes(role));
};

/** "Provider, Deployer"; "" for no roles. */
export const formatHighRiskRoles = (roles: unknown): string =>
  normalizeHighRiskRoles(roles).join(", ");

/** A use case's roles: its list, or the single role of a response from before the list. */
export const projectHighRiskRoles = (project: WithRoles): HighRiskRole[] =>
  normalizeHighRiskRoles(project?.high_risk_roles ?? project?.type_of_high_risk_role);

/** The roles a classification names; results saved before the list have only role. */
export const classificationRoles = (
  result: { roles?: unknown; role?: unknown } | null | undefined,
): HighRiskRole[] => normalizeHighRiskRoles(result?.roles ?? result?.role);

/** The required-field message for the roles, or "" when they are valid. */
export const highRiskRolesError = (roles: unknown, hasEuAiAct: boolean): string =>
  hasEuAiAct && normalizeHighRiskRoles(roles).length === 0 ? HIGH_RISK_ROLES_REQUIRED_MESSAGE : "";

/** The roles to send on save: only with EU AI Act; otherwise none. */
export const highRiskRolesPayload = (roles: unknown, hasEuAiAct: boolean): HighRiskRole[] =>
  hasEuAiAct ? normalizeHighRiskRoles(roles) : [];

/** Sort key for tables: the joined list, lower case. */
export const highRiskRolesSortKey = (project: WithRoles): string =>
  formatHighRiskRoles(projectHighRiskRoles(project)).toLowerCase();
```

- [ ] **Step 4: Types, DTOs, models, ports**

`Clients/src/domain/types/Project.ts`: add `import { HighRiskRole } from "../enums/highRiskRole.enum";` and replace the `type_of_high_risk_role:` union (lines 11-18) with:

```ts
  /** EU AI Act roles, Provider first. Read it with projectHighRiskRoles(). */
  high_risk_roles?: HighRiskRole[];
  /** Deprecated single role derived by the server; read high_risk_roles instead. */
  type_of_high_risk_role?: HighRiskRole | null;
```

`Clients/src/application/dtos/project.dto.ts`: in `ProjectResponseDTO` add `high_risk_roles?: string[]; // EU AI Act roles, Provider first` above `type_of_high_risk_role` and mark that field with `/** @deprecated derived single role; use high_risk_roles */`. In `CreateProjectDTO` and `UpdateProjectDTO` replace `type_of_high_risk_role?: number | null;` with `high_risk_roles?: HighRiskRole[];` (import `HighRiskRole` from `../../domain/enums/highRiskRole.enum`).

`Clients/src/domain/models/Common/project/project.model.ts`: add the field `high_risk_roles?: HighRiskRole[];` above `type_of_high_risk_role?`, mark the latter `/** @deprecated derived single role */`, and in the constructor add `this.high_risk_roles = data.high_risk_roles;`.

`Clients/src/domain/ports/IProjectRepository.ts`: in `Project`, `CreateProjectDTO` and `UpdateProjectDTO` add `high_risk_roles?: string[];` after each `type_of_high_risk_role?: string;` and mark each `type_of_high_risk_role` with `/** @deprecated derived single role; use high_risk_roles */`.

`Clients/src/domain/types/euAiActClassification.ts`, `ClassificationResult`: add before `role`:

```ts
  /** The roles the answers name, Provider first. Results saved before the list lack it. */
  roles?: ClassificationRole[];
```

`Clients/src/application/repository/intakeForm.repository.ts`, `EuAiActClassificationPreview`: add `roles?: ClassificationRole[];` after `role`.

`Clients/src/application/repository/entityGraph.repository.ts`: in `useCases` add `high_risk_roles?: string[];` above `type_of_high_risk_role?: string;`.

- [ ] **Step 5: Mapper**

In `Clients/src/application/mappers/project.mapper.ts`: replace `mapHighRiskRole` with

```ts
/**
 * Converts the API roles (a list, or a legacy single value) to domain roles.
 * Unknown values are dropped rather than defaulted to Provider.
 */
export function mapHighRiskRoles(value: unknown): HighRiskRole[] {
  return normalizeHighRiskRoles(value);
}
```

with `import { normalizeHighRiskRoles } from "../utils/highRiskRoles";`. In `mapProjectResponseDTOToProject` and `mapProjectResponseDTOToModel` replace the `type_of_high_risk_role: mapHighRiskRole(...) as unknown as ...` entries with

```ts
    high_risk_roles: mapHighRiskRoles(dto.high_risk_roles ?? dto.type_of_high_risk_role),
    type_of_high_risk_role:
      mapHighRiskRoles(dto.high_risk_roles ?? dto.type_of_high_risk_role)[0] ?? null,
```

In `mapCreateProjectFormToDTO`, the parameter's `type_of_high_risk_role?: number | null;` becomes `high_risk_roles?: HighRiskRole[];` and the output's `type_of_high_risk_role: formValues.type_of_high_risk_role,` becomes `high_risk_roles: normalizeHighRiskRoles(formValues.high_risk_roles),`.

- [ ] **Step 6: Fixtures**

`Clients/src/test/factories/project.factory.ts`: replace `type_of_high_risk_role: "deployer",` with `high_risk_roles: [HighRiskRole.DEPLOYER],` and add `import { HighRiskRole } from "../../domain/enums/highRiskRole.enum";`.

`Clients/src/presentation/pages/ISO/Clause/__tests__/Clause.test.tsx`: replace `type_of_high_risk_role: "provider" as const,` with `high_risk_roles: [HighRiskRole.PROVIDER],` and import `HighRiskRole` from `../../../../../domain/enums/highRiskRole.enum`.

- [ ] **Step 7: Run the tests and the gate**

Run: `cd Clients && npx vitest run src/application/utils/__tests__/highRiskRoles.test.ts src/application/mappers/tests/project.mappers.test.ts src/presentation/pages/ISO/Clause && npm run typecheck && npm run lint -- --quiet && npx prettier --check src/application/utils/highRiskRoles.ts src/application/utils/__tests__/highRiskRoles.test.ts src/domain/types/Project.ts src/application/dtos/project.dto.ts src/domain/models/Common/project/project.model.ts src/domain/ports/IProjectRepository.ts src/domain/types/euAiActClassification.ts src/application/repository/intakeForm.repository.ts src/application/repository/entityGraph.repository.ts src/application/mappers/project.mapper.ts src/application/mappers/tests/project.mappers.test.ts src/application/mappers/tests/mocks/project.mappers.mocks.ts src/test/factories/project.factory.ts src/presentation/pages/ISO/Clause/__tests__/Clause.test.tsx`
Expected: PASS; typecheck 0 errors (read the whole output, do not filter it); lint 0 errors; prettier clean. If typecheck reports another fixture that sets `type_of_high_risk_role` to a lower-case string, change it to `high_risk_roles: [HighRiskRole.<ROLE>]` the same way.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/application/utils/highRiskRoles.ts Clients/src/application/utils/__tests__/highRiskRoles.test.ts \
  Clients/src/domain/types/Project.ts Clients/src/application/dtos/project.dto.ts \
  Clients/src/domain/models/Common/project/project.model.ts Clients/src/domain/ports/IProjectRepository.ts \
  Clients/src/domain/types/euAiActClassification.ts Clients/src/application/repository/intakeForm.repository.ts \
  Clients/src/application/repository/entityGraph.repository.ts Clients/src/application/mappers/project.mapper.ts \
  Clients/src/application/mappers/tests/project.mappers.test.ts \
  Clients/src/application/mappers/tests/mocks/project.mappers.mocks.ts \
  Clients/src/test/factories/project.factory.ts Clients/src/presentation/pages/ISO/Clause/__tests__/Clause.test.tsx
git commit -m "feat(use-cases): frontend types and helpers for a list of roles" -m "Adds application/utils/highRiskRoles.ts, mirroring the server helpers:
normalise (Provider first, no duplicates, legacy inputs mapped, unknown values
dropped), format as 'Provider, Deployer', read a project's or a
classification's roles with a fallback to the single role of older
responses, and the required rule and payload shared by the forms.

Project, DTOs, ports and the classification types carry high_risk_roles /
roles; the single role stays as a deprecated optional field. The mapper maps
to the list and no longer turns unknown values into Provider."
```

---

### Task 8: Role multi-select in the use case forms and the questionnaire

**Files:**
- Create: `Clients/src/presentation/components/Inputs/HighRiskRolesField/index.tsx`
- Test: create `Clients/src/presentation/components/Inputs/HighRiskRolesField/__tests__/HighRiskRolesField.test.tsx`
- Modify: `Clients/src/presentation/components/Forms/ProjectForm/constants.ts` (`FormValues`, `FormErrors`, `initialState`)
- Modify: `Clients/src/presentation/components/Forms/ProjectForm/index.tsx` (95, 161-169, 312-318, 461-472, 596, 984-998)
- Modify: `Clients/src/presentation/constants/formValidationFieldMaps.ts:10,21`
- Modify: `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx` (73-76, 140, 164, 183, 249, 344-348, 656-659, 738-757, 1449-1477, 1696-1712)
- Modify: `Clients/src/presentation/components/EuAiActQuestionnaire/QuestionView.tsx:30`
- Modify: `Clients/src/i18n/translations.ts`
- Test: modify `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.test.tsx`, `Clients/src/presentation/components/EuAiActQuestionnaire/__tests__/EuAiActQuestionnaire.test.tsx`, `Clients/src/presentation/components/Forms/ProjectForm/__tests__/ProjectForm.test.tsx`

**Interfaces:**
- Consumes (Task 7): `normalizeHighRiskRoles`, `formatHighRiskRoles`, `projectHighRiskRoles`, `classificationRoles`, `highRiskRolesError`, `highRiskRolesPayload`, `HIGH_RISK_ROLE_ORDER`. `AutoCompleteField` from `Clients/src/presentation/components/Inputs/Autocomplete` (props: `label`, `placeholder`, `error`, `isRequired`, `sx`, plus MUI `Autocomplete` props).
- Produces: `HighRiskRolesField` (default export) with props `{ id: string; value: HighRiskRole[]; onChange: (roles: HighRiskRole[]) => void; onBlur?: () => void; label?: string; error?: string; isRequired?: boolean; disabled?: boolean; sx?: SxProps<Theme> }` — `label` defaults to `"High-risk roles"`; pass `label=""` to hide it.

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/presentation/components/Inputs/HighRiskRolesField/__tests__/HighRiskRolesField.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { HighRiskRole } from "../../../../../domain/enums/highRiskRole.enum";
import HighRiskRolesField from "..";

function Harness({
  initial = [],
  onChange = vi.fn(),
}: {
  initial?: HighRiskRole[];
  onChange?: (roles: HighRiskRole[]) => void;
}) {
  const [roles, setRoles] = useState<HighRiskRole[]>(initial);
  return (
    <HighRiskRolesField
      id="roles"
      value={roles}
      onChange={(next) => {
        setRoles(next);
        onChange(next);
      }}
    />
  );
}

const openOptions = () => fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });

describe("HighRiskRolesField", () => {
  it("labels the field and shows the selected roles", () => {
    renderWithProviders(<Harness initial={[HighRiskRole.PROVIDER]} />);
    expect(screen.getByText("High-risk roles")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
  });

  it("adds a second role and reports both, Provider first", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[HighRiskRole.DEPLOYER]} onChange={onChange} />);
    openOptions();
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    expect(onChange).toHaveBeenLastCalledWith([HighRiskRole.PROVIDER, HighRiskRole.DEPLOYER]);
  });

  it("offers only the roles not selected yet", () => {
    renderWithProviders(<Harness initial={[HighRiskRole.PROVIDER]} />);
    openOptions();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("Provider")).toBeNull();
    expect(within(listbox).getByText("Deployer")).toBeInTheDocument();
  });

  it("shows the error", () => {
    renderWithProviders(
      <HighRiskRolesField
        id="roles"
        value={[]}
        onChange={vi.fn()}
        error="Select at least one high-risk role when EU AI Act is selected."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one high-risk role when EU AI Act is selected.",
    );
  });
});
```

In `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.test.tsx`:
- `baseProject`: `type_of_high_risk_role: null,` → `high_risk_roles: [],`.
- `euAiActProject`: `type_of_high_risk_role: "Deployer",` → `high_risk_roles: ["Deployer"],`.
- `"shows EU AI Act risk classification fields once that framework is applicable"`: `"Type of high risk role *"` → `"High-risk roles *"`.
- `"takes the level and role the wizard saved, without marking the form as changed"`: the body expectation `type_of_high_risk_role: "Provider",` → `high_risk_roles: ["Provider"],`.
- In the `RiskAnalysisModal` mock add a third button after `mock wizard save`:

```tsx
      <button
        type="button"
        onClick={() =>
          updateClassification({
            questionnaireVersion: 2,
            level: "High risk",
            role: "Provider",
            roles: ["Provider", "Deployer"],
            reasons: [],
            obligations: [],
          })
        }
      >
        mock wizard save both
      </button>
```

- Add these tests after the wizard test:

```tsx
  it("takes both roles from the wizard without marking the form as changed", async () => {
    useEuAiAct();
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.click(screen.getByText("mock wizard save both"));
    await waitFor(() => expect(screen.getByText("Provider")).toBeInTheDocument());
    expect(screen.getByText("Deployer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves a second role picked in the multi-select", async () => {
    useEuAiAct();
    mockUpdateProject.mockResolvedValue({ status: 202 });
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.keyDown(document.getElementById("high-risk-roles-input")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalled());
    expect(mockUpdateProject.mock.calls[0][0].body).toMatchObject({
      high_risk_roles: ["Provider", "Deployer"],
    });
    expect(mockUpdateProject.mock.calls[0][0].body).not.toHaveProperty("type_of_high_risk_role");
  });

  it("requires a role when EU AI Act is selected", async () => {
    mockUseFrameworks.mockReturnValue({
      filteredFrameworks: [euAiActFramework],
      allFrameworks: [euAiActFramework, iso42001Framework],
    });
    mockUseProjectData.mockReturnValue({
      project: { ...euAiActProject, high_risk_roles: [] },
    });
    renderWithProviders(<ProjectSettings />);
    await screen.findByText("AI risk classification *");
    fireEvent.change(screen.getByDisplayValue("Chatbot Assistant"), {
      target: { value: "Renamed Assistant" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Select at least one high-risk role when EU AI Act is selected."),
    ).toBeInTheDocument();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });
```

(Add `within` to the `@testing-library/react` import if it is not there. Clicking Save calls `updateProject` directly, as the existing wizard test shows.)

In `Clients/src/presentation/components/Forms/ProjectForm/__tests__/ProjectForm.test.tsx`:

The file's current mocks keep EU AI Act out of reach: `useFrameworks` returns `{ frameworks: [] }` (the component reads `allFrameworks`), and `useFormValidation`, `checkStringValidation` and `selectValidation` are stubbed, so `handleSubmit` would call an undefined `validateAll`. Change the mocks as follows (the existing "renders without crashing" test still passes with the real hook and validators):

- Replace the `useFrameworks` mock with

```tsx
vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    frameworks: [],
    allFrameworks: [{ id: 1, name: "EU AI Act", is_organizational: false }],
  }),
}));
```

- Delete the three `vi.mock` calls for `application/hooks/useFormValidation`, `application/validations/stringValidation` and `application/validations/selectValidation`.

Then add, below the existing `describe`:

```tsx
import { act, fireEvent, screen, within } from "@testing-library/react";
import { updateProject } from "../../../../../application/repository/project.repository";

/** A use case with EU AI Act, edited through the form; every other required field is valid. */
const euAiActUseCase = (roles: string[]) => ({
  id: 7,
  project_title: "Hiring tool",
  owner: 1,
  start_date: "2026-01-01T00:00:00.000Z",
  goal: "Screen candidates",
  geography: 1,
  ai_risk_classification: 2, // "High risk" item id in the form
  status: "In progress",
  is_organizational: false,
  members: [],
  monitored_regulations_and_standards: [{ _id: 1, name: "EU AI Act" }],
  high_risk_roles: roles,
});

function renderEditForm(roles: string[]) {
  const submitRef = { current: undefined } as React.MutableRefObject<(() => void) | undefined>;
  renderWithProviders(
    <ProjectForm
      onClose={vi.fn()}
      projectToEdit={euAiActUseCase(roles)}
      useStandardModal
      onSubmitRef={submitRef}
    />,
  );
  return submitRef;
}

const submit = async (submitRef: React.MutableRefObject<(() => void) | undefined>) => {
  await act(async () => {
    await (submitRef.current?.() as unknown as Promise<void>);
  });
};

describe("ProjectForm high-risk roles", () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockClear();
  });

  it("sends both roles, Provider first, when both are chosen", async () => {
    const submitRef = renderEditForm(["Deployer"]);
    fireEvent.keyDown(document.getElementById("high-risk-roles-input")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    await submit(submitRef);
    expect((vi.mocked(updateProject).mock.calls[0][0] as any).body.high_risk_roles).toEqual([
      "Provider",
      "Deployer",
    ]);
  });

  it("shows the required message and sends nothing when no role is chosen", async () => {
    const submitRef = renderEditForm([]);
    await submit(submitRef);
    expect(
      screen.getByText("Select at least one high-risk role when EU AI Act is selected."),
    ).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });
});
```

(Move the two new imports to the top of the file, next to the existing imports; `vi.mock` calls are hoisted, so the mocked `updateProject` is what the form calls.)

In `Clients/src/presentation/components/EuAiActQuestionnaire/__tests__/EuAiActQuestionnaire.test.tsx` add:

```tsx
  it("pre-fills a saved single answer to a multi-select question as a one-item selection", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness
        questionnaire={MULTI}
        initial={{ practices: "manipulation" }}
        onComplete={vi.fn()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Scoring"));
    expect(onChange).toHaveBeenLastCalledWith({ practices: ["manipulation", "scoring"] });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/components/Inputs/HighRiskRolesField src/presentation/pages/ProjectView/ProjectSettings/index.test.tsx src/presentation/components/Forms/ProjectForm src/presentation/components/EuAiActQuestionnaire`
Expected: FAIL — component missing; both forms still render a single select; the questionnaire drops a string answer to a multi-select.

- [ ] **Step 3: The shared field**

Create `Clients/src/presentation/components/Inputs/HighRiskRolesField/index.tsx`:

```tsx
import type { SxProps, Theme } from "@mui/material";
import AutoCompleteField from "../Autocomplete";
import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";
import {
  HIGH_RISK_ROLE_ORDER,
  normalizeHighRiskRoles,
} from "../../../../application/utils/highRiskRoles";

interface HighRiskRolesFieldProps {
  id: string;
  value: HighRiskRole[];
  onChange: (roles: HighRiskRole[]) => void;
  onBlur?: () => void;
  /** Defaults to "High-risk roles"; pass "" when the page renders its own label. */
  label?: string;
  error?: string;
  isRequired?: boolean;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** EU AI Act roles of a use case: Provider, Deployer or both. */
export default function HighRiskRolesField({
  id,
  value,
  onChange,
  onBlur,
  label = "High-risk roles",
  error,
  isRequired,
  disabled,
  sx,
}: HighRiskRolesFieldProps) {
  return (
    <AutoCompleteField<HighRiskRole, true>
      id={id}
      multiple
      label={label}
      placeholder={value.length === 0 ? "Select roles" : undefined}
      options={[...HIGH_RISK_ROLE_ORDER]}
      value={value}
      onChange={(_event, next) => onChange(normalizeHighRiskRoles(next))}
      onBlur={onBlur}
      getOptionLabel={(role) => role}
      filterSelectedOptions
      error={error}
      isRequired={isRequired}
      disabled={disabled}
      sx={sx}
    />
  );
}
```

- [ ] **Step 4: Create form (ProjectForm)**

`Clients/src/presentation/components/Forms/ProjectForm/constants.ts`: add `import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";`; in `FormValues` replace `type_of_high_risk_role: number | null;` with `high_risk_roles: HighRiskRole[];`; in `FormErrors` replace `typeOfHighRiskRole?: string;` with `highRiskRoles?: string;`; in `initialState` replace `type_of_high_risk_role: null,` with `high_risk_roles: [],`.

`Clients/src/presentation/constants/formValidationFieldMaps.ts`: in `PROJECT_FORM_FIELD_ORDER` replace `"type_of_high_risk_role",` with `"high_risk_roles",`; in `PROJECT_FORM_FIELD_IDS` replace `type_of_high_risk_role: "type-of-high-risk-role-input",` with `high_risk_roles: "high-risk-roles-input",`.

`Clients/src/presentation/components/Forms/ProjectForm/index.tsx`:
- imports: remove `import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";` if it becomes unused; add `import HighRiskRolesField from "../../Inputs/HighRiskRolesField";` and `import { highRiskRolesError, highRiskRolesPayload, projectHighRiskRoles } from "../../../../application/utils/highRiskRoles";`.
- edit-mode init: `type_of_high_risk_role: projectToEdit.type_of_high_risk_role || null,` → `high_risk_roles: projectHighRiskRoles(projectToEdit),`.
- validator: replace the `type_of_high_risk_role:` validator with

```tsx
      high_risk_roles: (v: unknown, vals: FormValues) =>
        highRiskRolesError(
          v,
          vals.monitored_regulations_and_standards.some((fw) => fw._id === 1),
        ),
```

- delete the `highRiskRoleItems` `useMemo` and remove `highRiskRoleItems` from the `handleSubmit` dependency list.
- in `handleSubmit`, replace the EU AI Act block with

```tsx
        // Add AI-specific fields only when EU AI Act is selected
        const hasEuAiAct = values.monitored_regulations_and_standards.some((fw) => fw._id === 1);
        body.high_risk_roles = highRiskRolesPayload(values.high_risk_roles, hasEuAiAct);
        body.ai_risk_classification = hasEuAiAct
          ? riskClassificationItems.find((item) => item._id === values.ai_risk_classification)?.name
          : null;
```

- replace the role `<Select id="type-of-high-risk-role-input" ... />` (Row 5) with

```tsx
                <HighRiskRolesField
                  id="high-risk-roles-input"
                  value={values.high_risk_roles}
                  onChange={(roles) => {
                    setValues((prev) => ({ ...prev, high_risk_roles: roles }));
                    clearFieldError("high_risk_roles");
                  }}
                  onBlur={handleFieldBlur("high_risk_roles")}
                  isRequired
                  error={errors.high_risk_roles}
                  sx={{ flex: 1 }}
                />
```

- [ ] **Step 5: Settings form (ProjectSettings)**

In `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx`:
- imports: keep the existing `import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";` (line 50) — it is still used, as the element type of `FormValues.highRiskRoles`. Add `import HighRiskRolesField from "../../../components/Inputs/HighRiskRolesField";` and `import { classificationRoles, formatHighRiskRoles, highRiskRolesError, highRiskRolesPayload, projectHighRiskRoles } from "../../../../application/utils/highRiskRoles";`.
- delete the module-level `highRiskRoleItems`.
- `FormValues`: `typeOfHighRiskRole: number | null;` → `highRiskRoles: HighRiskRole[];`. `FormErrors`: `typeOfHighRiskRole?: string;` → `highRiskRoles?: string;`. `initialState`: `typeOfHighRiskRole: null,` → `highRiskRoles: [],`.
- `isModified`: `values.typeOfHighRiskRole !== initialValuesRef.current.typeOfHighRiskRole ||` → `formatHighRiskRoles(values.highRiskRoles) !== formatHighRiskRoles(initialValuesRef.current.highRiskRoles) ||`.
- loading the project: replace the `typeOfHighRiskRole:` entry with `highRiskRoles: projectHighRiskRoles(project),`.
- validation: replace the `if (!values.typeOfHighRiskRole) { ... }` block with

```tsx
        const rolesError = highRiskRolesError(values.highRiskRoles, hasEuAiAct);
        if (rolesError) {
          newErrors.highRiskRoles = rolesError;
        }
```

- save: delete `selectedHighRiskRole` and in the body replace `type_of_high_risk_role: selectedHighRiskRole,` with `high_risk_roles: highRiskRolesPayload(values.highRiskRoles, hasEuAiAct),`.
- render: the role row becomes

```tsx
                      {/* High-risk roles Row */}
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                          High-risk roles *
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                          If you are not sure about the high risk role,&nbsp;
                          <VWLink
                            url="https://artificialintelligenceact.eu/high-level-summary/"
                            openInNewTab={true}
                          >
                            please see this link
                          </VWLink>
                        </Typography>
                      </Box>
                      <HighRiskRolesField
                        id="high-risk-roles-input"
                        label=""
                        value={values.highRiskRoles}
                        onChange={(roles) => {
                          setValues((prev) => ({ ...prev, highRiskRoles: roles }));
                          setErrors((prev) => ({ ...prev, highRiskRoles: "" }));
                        }}
                        error={errors.highRiskRoles}
                        sx={{ width: 400 }}
                      />
```

  (The helper text keeps its existing wording so its translations stay valid; `#888` is the colour the neighbouring rows already use.)
- wizard result (`updateClassification`): replace the role lines with

```tsx
            // The server stored the level, and the roles unless the result has
            // none, so both become the saved baseline and the form stays clean.
            const roles = classificationRoles(result);
            const saved = {
              riskClassification: level._id,
              highRiskRoles: roles.length > 0 ? roles : initialValuesRef.current.highRiskRoles,
            };
            initialValuesRef.current = { ...initialValuesRef.current, ...saved };
            // Same as picking them in the form: set the values and clear any
            // earlier "required" error on those fields.
            setValues((prev) => ({
              ...prev,
              riskClassification: saved.riskClassification,
              ...(roles.length > 0 ? { highRiskRoles: roles } : {}),
            }));
            setErrors((prevErrors) => ({
              ...prevErrors,
              riskClassification: "",
              ...(roles.length > 0 ? { highRiskRoles: "" } : {}),
            }));
```

- [ ] **Step 6: Questionnaire pre-fill**

In `Clients/src/presentation/components/EuAiActQuestionnaire/QuestionView.tsx` replace

```tsx
  const current = (Array.isArray(answer) ? answer : []) as string[];
```

with

```tsx
  // A saved single answer to a question that became multi-select (the role
  // question) is shown as a one-item selection.
  const current = (
    Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : []
  ) as string[];
```

- [ ] **Step 7: Translations**

In `Clients/src/i18n/translations.ts`, add directly after the `de: {` line:

```ts
    // High-risk roles (several EU AI Act roles per use case)
    "High-risk roles": "Hochrisiko-Rollen",
    "High-risk roles *": "Hochrisiko-Rollen *",
    "Select roles": "Rollen auswählen",
    "Select at least one high-risk role when EU AI Act is selected.":
      "Wählen Sie mindestens eine Hochrisiko-Rolle aus, wenn der EU AI Act ausgewählt ist.",
    "Not a high-risk role:": "Keine Hochrisiko-Rolle:",
    "Roles:": "Rollen:",
    "Provider, Deployer or both": "Anbieter, Betreiber oder beides",
    "Provider, Deployer": "Anbieter, Betreiber",
    "What is your role for this AI system? Select all that apply.":
      "Welche Rolle haben Sie für dieses KI-System? Wählen Sie alle zutreffenden aus.",
```

after the `fr: {` line:

```ts
    // High-risk roles (several EU AI Act roles per use case)
    "High-risk roles": "Rôles à haut risque",
    "High-risk roles *": "Rôles à haut risque *",
    "Select roles": "Sélectionner des rôles",
    "Select at least one high-risk role when EU AI Act is selected.":
      "Sélectionnez au moins un rôle à haut risque lorsque l'EU AI Act est sélectionné.",
    "Not a high-risk role:": "Pas un rôle à haut risque :",
    "Roles:": "Rôles :",
    "Provider, Deployer or both": "Fournisseur, déployeur ou les deux",
    "Provider, Deployer": "Fournisseur, Déployeur",
    "What is your role for this AI system? Select all that apply.":
      "Quel est votre rôle pour ce système d'IA ? Sélectionnez tout ce qui s'applique.",
```

and after the `es: {` line:

```ts
    // High-risk roles (several EU AI Act roles per use case)
    "High-risk roles": "Roles de alto riesgo",
    "High-risk roles *": "Roles de alto riesgo *",
    "Select roles": "Seleccionar roles",
    "Select at least one high-risk role when EU AI Act is selected.":
      "Seleccione al menos un rol de alto riesgo cuando la EU AI Act esté seleccionada.",
    "Not a high-risk role:": "No es un rol de alto riesgo:",
    "Roles:": "Roles:",
    "Provider, Deployer or both": "Proveedor, responsable del despliegue o ambos",
    "Provider, Deployer": "Proveedor, Responsable del despliegue",
    "What is your role for this AI system? Select all that apply.":
      "¿Cuál es su rol para este sistema de IA? Seleccione todos los que correspondan.",
```

`"Provider, Deployer"` is needed because the DOM translator matches whole text nodes, and that joined label is shown as one string in the use case table, its group headers, the entity graph sidebar, approval request details and the intake EU AI Act panel; the single words are already translated. Before adding, `grep -n '"Roles:"\|"Select roles"\|"High-risk roles"\|"Provider, Deployer"' Clients/src/i18n/translations.ts`: skip any key that already exists in that language block (a duplicate key fails typecheck). The strings used only in later tasks are added now so the dictionary changes once.

- [ ] **Step 8: Run the tests and the gate**

Run: `cd Clients && npx vitest run src/presentation/components/Inputs/HighRiskRolesField src/presentation/pages/ProjectView/ProjectSettings src/presentation/components/Forms/ProjectForm src/presentation/components/EuAiActQuestionnaire && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx prettier --check src/presentation/components/Inputs/HighRiskRolesField src/presentation/components/Forms/ProjectForm src/presentation/constants/formValidationFieldMaps.ts src/presentation/pages/ProjectView/ProjectSettings src/presentation/components/EuAiActQuestionnaire src/i18n/translations.ts`
Expected: PASS; typecheck 0 errors; i18n audit reports no gaps (add any string it lists, with the translations above or new ones in the same style); lint 0 errors; prettier clean.

- [ ] **Step 9: Commit**

```bash
git add Clients/src/presentation/components/Inputs/HighRiskRolesField \
  Clients/src/presentation/components/Forms/ProjectForm/constants.ts Clients/src/presentation/components/Forms/ProjectForm/index.tsx \
  Clients/src/presentation/components/Forms/ProjectForm/__tests__/ProjectForm.test.tsx \
  Clients/src/presentation/constants/formValidationFieldMaps.ts \
  Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx \
  Clients/src/presentation/pages/ProjectView/ProjectSettings/index.test.tsx \
  Clients/src/presentation/components/EuAiActQuestionnaire/QuestionView.tsx \
  Clients/src/presentation/components/EuAiActQuestionnaire/__tests__/EuAiActQuestionnaire.test.tsx \
  Clients/src/i18n/translations.ts
git commit -m "feat(use-cases): pick one or both high-risk roles in the use case forms" -m "The create form and the use case settings replace the single 'Type of high
risk role' select with a 'High-risk roles' multi-select (HighRiskRolesField,
built on AutoCompleteField). With EU AI Act selected at least one role is
required ('Select at least one high-risk role when EU AI Act is selected.');
saves send high_risk_roles. The settings page takes both roles from the
questionnaire result without marking the form as changed.

The questionnaire shows a saved single answer to the role question, now a
multi-select, as a one-item selection. New strings have de, fr and es
entries."
```

---

### Task 9: Show the role list in tables, exports, graph, approvals, tracker and automations

**Files:**
- Modify: `Clients/src/presentation/components/ProjectsList/ProjectsList.tsx:209-212,305,321`
- Modify: `Clients/src/presentation/components/ProjectsList/ProjectTableView.tsx:343-346,514`
- Modify: `Clients/src/presentation/pages/EntityGraph/DetailSidebar.tsx:278-284`
- Modify: `Clients/src/presentation/components/Modals/RequestorApprovalModal/entityTypeConfig.tsx:84,352`
- Modify: `Clients/src/presentation/pages/ComplianceTracker/1.0ComplianceTracker/index.tsx:132-152`
- Modify: `Clients/src/presentation/pages/Automations/components/ConfigurationPanel/index.tsx:543`, `Clients/src/presentation/pages/Automations/index.tsx:656,1134`
- Test: create `Clients/src/presentation/components/Modals/RequestorApprovalModal/__tests__/entityTypeConfig.highRiskRoles.test.ts`; modify `Clients/src/presentation/pages/ComplianceTracker/__tests__/ComplianceTracker.test.tsx`

**Interfaces:**
- Consumes (Task 7): `projectHighRiskRoles`, `formatHighRiskRoles`, `highRiskRolesSortKey`.
- Produces: `extractEntityDetails(requestData).highRiskRoles: string | undefined` (replaces `typeOfHighRiskRole`).

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/presentation/components/Modals/RequestorApprovalModal/__tests__/entityTypeConfig.highRiskRoles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractEntityDetails, getEntityTypeConfig } from "../entityTypeConfig";

describe("use case approval details: high-risk roles", () => {
  it("shows every role, Provider first", () => {
    const details = extractEntityDetails({
      entity_type: "use_case",
      project_title: "Hiring tool",
      high_risk_roles: ["Deployer", "Provider"],
    });
    expect(details.highRiskRoles).toBe("Provider, Deployer");
  });

  it("falls back to the single role of an older response and hides an empty list", () => {
    expect(
      extractEntityDetails({ entity_type: "use_case", type_of_high_risk_role: "Deployer" })
        .highRiskRoles,
    ).toBe("Deployer");
    expect(
      extractEntityDetails({ entity_type: "use_case", high_risk_roles: [] }).highRiskRoles,
    ).toBeUndefined();
  });

  it("labels the field", () => {
    expect(getEntityTypeConfig("use_case").fields).toContainEqual(
      expect.objectContaining({ key: "highRiskRoles", label: "High-risk roles" }),
    );
  });
});
```

(`extractEntityDetails` switches on `requestData.entity_type`; `use_case` is also its default branch.)

In `Clients/src/presentation/pages/ComplianceTracker/__tests__/ComplianceTracker.test.tsx` add `import { getComplianceProgress } from "../../../../application/repository/control_eu_act.repository";` (after the `vi.mock` calls) and:

```tsx
  it("reloads when the roles change, not when the same roles come back", async () => {
    const project = (roles: string[]) =>
      ({ ...mockProject, ai_risk_classification: "High risk", high_risk_roles: roles }) as any;
    const { rerender } = renderWithProviders(<ComplianceTracker project={project(["Provider"])} />);
    await waitFor(() => expect(vi.mocked(getComplianceProgress)).toHaveBeenCalledTimes(1));

    rerender(<ComplianceTracker project={project(["Provider"])} />);
    expect(vi.mocked(getComplianceProgress)).toHaveBeenCalledTimes(1);

    rerender(<ComplianceTracker project={project(["Deployer", "Provider"])} />);
    await waitFor(() => expect(vi.mocked(getComplianceProgress)).toHaveBeenCalledTimes(2));
  });
```

(import `waitFor` from `@testing-library/react`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/components/Modals/RequestorApprovalModal src/presentation/pages/ComplianceTracker`
Expected: FAIL — no `highRiskRoles` detail; the tracker does not reload on a role change.

- [ ] **Step 3: Implement**

`ProjectsList.tsx` (import `formatHighRiskRoles`, `projectHighRiskRoles` from `../../../application/utils/highRiskRoles`):
- group key: `case "role": return formatHighRiskRoles(projectHighRiskRoles(project)) || "Unknown";` (one group per combination, so each use case is counted once).
- export columns: `{ id: "type_of_high_risk_role", label: "Role" }` → `{ id: "high_risk_roles", label: "High-risk roles" }`.
- export rows: `type_of_high_risk_role: project.type_of_high_risk_role?.replace(/_/g, " ") || "-",` → `high_risk_roles: formatHighRiskRoles(projectHighRiskRoles(project)) || "-",`.

`ProjectTableView.tsx` (import `formatHighRiskRoles`, `highRiskRolesSortKey`, `projectHighRiskRoles`):
- sort: `case "role": aValue = highRiskRolesSortKey(a); bValue = highRiskRolesSortKey(b); break;`
- cell: `{project.type_of_high_risk_role?.replace(/_/g, " ") || "—"}` → `{formatHighRiskRoles(projectHighRiskRoles(project)) || "—"}`.

`DetailSidebar.tsx` (import `formatHighRiskRoles`, `projectHighRiskRoles` from `../../../application/utils/highRiskRoles`): replace the `type_of_high_risk_role` row with

```tsx
              {projectHighRiskRoles(rawData).length > 0 && (
                <DetailRow
                  icon={<User size={14} />}
                  label="High-risk roles"
                  value={formatHighRiskRoles(projectHighRiskRoles(rawData))}
                />
              )}
```

`entityTypeConfig.tsx` (import `formatHighRiskRoles`, `projectHighRiskRoles` from `../../../../application/utils/highRiskRoles`):
- field: `{ key: "typeOfHighRiskRole", label: "High Risk Role", icon: <PackageOpen size={14} /> },` → `{ key: "highRiskRoles", label: "High-risk roles", icon: <PackageOpen size={14} /> },`
- details: `typeOfHighRiskRole: requestData.type_of_high_risk_role,` → `highRiskRoles: formatHighRiskRoles(projectHighRiskRoles(requestData)) || undefined,`

`ComplianceTracker/1.0ComplianceTracker/index.tsx` (import `projectHighRiskRoles` from `../../../../application/utils/highRiskRoles`): before the fetch effect add

```tsx
  // A string key, so a re-fetched project with the same roles does not reload.
  const highRiskRolesKey = projectHighRiskRoles(project).join(",");
```

and in that effect's dependency list replace `project?.type_of_high_risk_role,` with `highRiskRolesKey,`; update the comment above the list to say "roles".

Automations: `ConfigurationPanel/index.tsx` line 543 `desc: "Type of high-risk role"` → `desc: "High-risk roles"`; `Automations/index.tsx` lines 656 and 1134 `• Type of High-Risk Role: {{project.type_of_high_risk_role}}` → `• High-risk roles: {{project.type_of_high_risk_role}}` (the variable name stays; it now renders every role).

- [ ] **Step 4: Run the tests and the gate**

Run: `cd Clients && npx vitest run src/presentation/components/Modals/RequestorApprovalModal src/presentation/pages/ComplianceTracker src/presentation/components/ProjectsList src/presentation/pages/EntityGraph src/presentation/pages/Automations && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx prettier --check src/presentation/components/ProjectsList src/presentation/pages/EntityGraph/DetailSidebar.tsx src/presentation/components/Modals/RequestorApprovalModal src/presentation/pages/ComplianceTracker src/presentation/pages/Automations`
Expected: PASS; 0 typecheck errors; no i18n gaps; lint and prettier clean.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/components/ProjectsList/ProjectsList.tsx \
  Clients/src/presentation/components/ProjectsList/ProjectTableView.tsx \
  Clients/src/presentation/pages/EntityGraph/DetailSidebar.tsx \
  Clients/src/presentation/components/Modals/RequestorApprovalModal/entityTypeConfig.tsx \
  Clients/src/presentation/components/Modals/RequestorApprovalModal/__tests__/entityTypeConfig.highRiskRoles.test.ts \
  Clients/src/presentation/pages/ComplianceTracker/1.0ComplianceTracker/index.tsx \
  Clients/src/presentation/pages/ComplianceTracker/__tests__/ComplianceTracker.test.tsx \
  Clients/src/presentation/pages/Automations/components/ConfigurationPanel/index.tsx \
  Clients/src/presentation/pages/Automations/index.tsx
git commit -m "feat(use-cases): show every high-risk role across the app" -m "The use case table, its sort and grouping, the CSV export, the entity graph
sidebar and approval request details show the roles as 'Provider, Deployer'
(older responses fall back to the single role). Grouping by role puts a use
case in each of its role groups.

The requirements tracker reloads when the roles change, keyed on a joined
string so a re-fetched project with the same roles does not reload.
Automation defaults label the line 'High-risk roles'."
```

---

### Task 10: Intake builder and review dialog

**Files:**
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/types.ts:265-270`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx` (imports, 427-436, 600-617)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/EuAiActClassificationPanel.tsx:40,78-82`
- Modify: `Clients/e2e/factories/api.factory.ts:236`, `Clients/e2e/fixtures/project.fixture.ts:51`, `Clients/e2e/global.setup.ts:62`, `Clients/e2e/risk-inheritance.setup.ts:45`, `Clients/e2e/use-cases.spec.ts:166-181`
- Test: create `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.highRiskRoles.test.tsx`; modify `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/analyzeMappingCoverage.test.ts`, `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/EuAiActClassificationPanel.test.tsx`

**Interfaces:**
- Consumes (Task 5, API): preview `entityPreview.high_risk_roles: string[]`, `entityPreview.high_risk_roles_unmatched: string[]`, `euAiActClassification.current.roles`. (Task 7): `normalizeHighRiskRoles`, `classificationRoles`. (Task 8): `HighRiskRolesField`.
- Produces: the review dialog sends `confirmedEntityData.high_risk_roles: HighRiskRole[]` for a form with a role mapping.

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.highRiskRoles.test.tsx`:

```tsx
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  getSubmissionPreview,
  approveSubmission,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));

function mockPreview(entityPreview: Record<string, unknown>) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending" },
      riskAssessment: null,
      entityPreview,
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: {
          version: "1.0",
          fields: [
            { id: "f1", label: "Title", type: "text", entityFieldMapping: "project_title" },
            {
              id: "f_role",
              label: "Your role",
              type: "multiselect",
              entityFieldMapping: "type_of_high_risk_role",
              options: [
                { value: "opt_1", label: "Provider" },
                { value: "opt_2", label: "Importer" },
              ],
            },
          ],
        },
      },
      euAiActClassification: null,
    },
  } as never);
}

const renderModal = () =>
  renderWithProviders(
    <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={5} onApproved={vi.fn()} />,
  );

describe("SubmissionPreviewModal high-risk roles mapping", () => {
  beforeEach(() => {
    vi.mocked(approveSubmission).mockReset();
    vi.mocked(approveSubmission).mockResolvedValue({ data: {} } as never);
  });

  it("shows the matched roles in a multi-select and lists options that are not roles", async () => {
    mockPreview({
      project_title: "Hiring tool",
      high_risk_roles: ["Provider"],
      high_risk_roles_unmatched: ["Importer"],
    });
    renderModal();
    expect(await screen.findByText("High-risk roles")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Not a high-risk role:")).toBeInTheDocument();
    expect(screen.getByText("Importer")).toBeInTheDocument();
  });

  it("sends the roles the reviewer picked", async () => {
    mockPreview({ project_title: "Hiring tool", high_risk_roles: ["Provider"] });
    renderModal();
    await screen.findByText("High-risk roles");
    fireEvent.keyDown(document.getElementById("entity-f_role")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Deployer"));
    fireEvent.click(screen.getByText("Approve and create use case"));
    await waitFor(() => expect(approveSubmission).toHaveBeenCalled());
    expect(vi.mocked(approveSubmission).mock.calls[0][1]?.confirmedEntityData).toMatchObject({
      high_risk_roles: ["Provider", "Deployer"],
    });
  });
});
```

In `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/analyzeMappingCoverage.test.ts` add to `describe("analyzeMappingCoverage type checks with the EU AI Act risk step on", ...)`:

```ts
  it.each(["select", "multiselect"] as const)("accepts a %s question mapped to the roles", (type) => {
    const field: FormField = {
      id: "f1",
      type,
      label: "Your role",
      entityFieldMapping: ROLE,
      order: 0,
    };
    expect(analyzeMappingCoverage([field], IntakeEntityType.USE_CASE).typeMismatches).toEqual([]);
  });
```

In `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/EuAiActClassificationPanel.test.tsx` add (inside its `describe`):

```tsx
  it("shows both roles when the result has two", () => {
    renderPanel({
      classification: {
        ...classification,
        roles: ["Provider", "Deployer"],
        current: { ...classification.current, roles: ["Provider", "Deployer"] },
      },
    });
    expect(screen.getByText("Roles:")).toBeInTheDocument();
    expect(screen.getByText("Provider, Deployer")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder`
Expected: FAIL — the role mapping renders a text field; multiselect is a type mismatch; the panel shows only one role.

- [ ] **Step 3: Builder mapping**

In `Clients/src/presentation/pages/IntakeFormBuilder/types.ts`, the `type_of_high_risk_role` entry of `ENTITY_FIELD_MAPPINGS[USE_CASE]` becomes (the `field` key stays: saved forms use it):

```ts
    {
      field: "type_of_high_risk_role",
      label: "High-risk roles",
      description: "Provider, Deployer or both",
      requiredFieldType: ["multiselect", "select"],
    },
```

- [ ] **Step 4: Review dialog**

In `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx`:
- imports: `import HighRiskRolesField from "../../components/Inputs/HighRiskRolesField";` and `import { classificationRoles, normalizeHighRiskRoles } from "../../../application/utils/highRiskRoles";`.
- below the imports: 

```tsx
/** The entity mapping for the use case's high-risk roles (the key saved forms use). */
const ROLE_MAPPING = "type_of_high_risk_role";
```

- `mappedFields` filter: replace the `type_of_high_risk_role` condition with

```tsx
      if (euAiAct && classificationRoles(euAiAct.current).length > 0 && field.entityFieldMapping === ROLE_MAPPING) {
        return false;
      }
```

- in `mappedFields.map((field) => { ... })`, before `const currentValue = ...`, add:

```tsx
                    if (fieldKey === ROLE_MAPPING) {
                      // The server matched the answer to roles; options that are
                      // not roles are listed so the reviewer can fix them.
                      const unmatched = previewData?.entityPreview?.high_risk_roles_unmatched;
                      return (
                        <Box
                          key={field.id}
                          sx={{ display: "flex", flexDirection: "column", gap: "4px" }}
                        >
                          <HighRiskRolesField
                            id={`entity-${field.id}`}
                            value={normalizeHighRiskRoles(editedEntityData.high_risk_roles)}
                            onChange={(roles) =>
                              setEditedEntityData((prev) => ({ ...prev, high_risk_roles: roles }))
                            }
                          />
                          {Array.isArray(unmatched) &&
                            unmatched.map((label) => (
                              <Typography
                                key={String(label)}
                                sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}
                              >
                                <span>Not a high-risk role:</span> <span>{String(label)}</span>
                              </Typography>
                            ))}
                        </Box>
                      );
                    }
```

- [ ] **Step 5: Panel**

In `Clients/src/presentation/pages/IntakeFormBuilder/EuAiActClassificationPanel.tsx`: import `classificationRoles` from `../../../application/utils/highRiskRoles`; destructure without `role` (`const { questionnaire, answers, current, changedSinceSubmission } = classification;`) and add `const roles = classificationRoles(current);`; replace the role line with

```tsx
        {roles.length > 0 && (
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
            <span>{roles.length > 1 ? "Roles:" : "Role:"}</span> <span>{roles.join(", ")}</span>
          </Typography>
        )}
```

- [ ] **Step 6: e2e fixtures to the list shape**

`Clients/e2e/factories/api.factory.ts`: in `CreateProjectPayload` replace `type_of_high_risk_role?: string;` with `high_risk_roles?: string[];`. In `Clients/e2e/fixtures/project.fixture.ts`, `Clients/e2e/global.setup.ts` and `Clients/e2e/risk-inheritance.setup.ts` replace `type_of_high_risk_role: "Deployer",` with `high_risk_roles: ["Deployer"],`.

`Clients/e2e/use-cases.spec.ts` (lines 166-181) still looks for the old "Type of high risk role" select. Replace that block with:

```ts
    // Pick a high-risk role in the multi-select if it is shown (EU AI Act selected)
    const highRiskRoles = page
      .getByText(/^High-risk roles/i)
      .locator("..")
      .getByRole("combobox");
    if (
      await highRiskRoles
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await highRiskRoles.first().click();
      const option = page.getByRole("option", { name: "Deployer" });
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
      // A multi-select stays open after a pick; close it before submitting.
      await page.keyboard.press("Escape");
    }
```


- [ ] **Step 7: Run the tests and the gate**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx prettier --check src/presentation/pages/IntakeFormBuilder e2e/factories/api.factory.ts e2e/fixtures/project.fixture.ts e2e/global.setup.ts e2e/risk-inheritance.setup.ts e2e/use-cases.spec.ts`
Expected: PASS (including the existing `SubmissionPreviewModal.riskStep.test.tsx`, whose role field `entity-f3` must still exist when no classification is shown and be hidden when one with a role is); typecheck 0 errors; no i18n gaps; lint and prettier clean.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/presentation/pages/IntakeFormBuilder/types.ts \
  Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx \
  Clients/src/presentation/pages/IntakeFormBuilder/EuAiActClassificationPanel.tsx \
  Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.highRiskRoles.test.tsx \
  Clients/src/presentation/pages/IntakeFormBuilder/__tests__/analyzeMappingCoverage.test.ts \
  Clients/src/presentation/pages/IntakeFormBuilder/__tests__/EuAiActClassificationPanel.test.tsx \
  Clients/e2e/factories/api.factory.ts Clients/e2e/fixtures/project.fixture.ts \
  Clients/e2e/global.setup.ts Clients/e2e/risk-inheritance.setup.ts Clients/e2e/use-cases.spec.ts
git commit -m "feat(intake): map select and multi-select questions to high-risk roles" -m "The builder accepts a select or multi-select question for the use case's
roles ('High-risk roles'). The review dialog shows the roles the server
matched in a multi-select instead of a free-text field, lists selected
options that are not roles ('Not a high-risk role: <label>') and sends the
reviewer's list on approval. The EU AI Act panel shows both roles when the
result has two. e2e fixtures create use cases with the list."
```

---

### Task 11: Documentation and schema copies

**Files:**
- Modify: `shared/user-guide-content/content/ai-governance/use-cases.ts:43,189,197`
- Modify: `shared/user-guide-content/content/ai-governance/intake-forms.ts:283,579,589`
- Copy (not committed): both files to `~/website/verifywise/content/user-guide/content/ai-governance/`
- Modify: `docs/technical/domains/use-cases.md:38,189,237,439,466` (+ new section)
- Modify: `docs/technical/domains/readiness.md:84`, `docs/technical/architecture/database-schema.md:176`
- Modify: `Servers/SQL_Commands.sql:72`, `Servers/docs/schema.dbml:29`
- Modify: `Servers/documentation/models/project.md:23-29,46`, `Servers/documentation/utils/project.md:54,109`, `Servers/documentation/mocks/project.md:30,49`

**Interfaces:** none (documentation).

- [ ] **Step 1: User guide**

`shared/user-guide-content/content/ai-governance/use-cases.ts`:
- line 43: `{ bold: 'Type of high risk role', text: 'Your organization\'s relationship to the AI system: Deployer, Provider, Distributor, Importer, Product manufacturer, or Authorized representative.' },` →

```ts
        { bold: 'High-risk roles', text: 'Your organization\'s EU AI Act role for the AI system: Provider, Deployer or both. Choose both when you build the system and also use it yourself. The use case then lists the requirements of both roles, and compliance progress, readiness and reports count them.' },
```

- line 189: `the role question asks whether you are the provider or the deployer.` → `the role question asks whether you are the provider, the deployer or both.`
- line 193: `the obligations that follow for your role` → `the obligations that follow for your roles` (both roles' obligations are listed once each).
- line 197: `its type of high risk role` → `its high-risk roles`.

`shared/user-guide-content/content/ai-governance/intake-forms.ts`:
- line 283: `{ text: '`type_of_high_risk_role`, high-risk role category' },` →

```ts
        { text: '`type_of_high_risk_role`, the use case\'s high-risk roles (Provider, Deployer or both). Map a select or multi-select question to it. Each selected option whose label or value is Provider or Deployer becomes a role; the review dialog lists any other selected option so you can correct the roles before approving.' },
```

- line 579: `{ text: 'The role (provider or deployer) the submitter chose' },` → `{ text: 'The roles (provider, deployer or both) the submitter chose' },`
- line 589: `the use case gets the chosen level and the role,` → `the use case gets the chosen level and the roles,`.

Read the surrounding lines first and keep the file's quoting style. Then mirror:

```bash
cp shared/user-guide-content/content/ai-governance/use-cases.ts ~/website/verifywise/content/user-guide/content/ai-governance/use-cases.ts
cp shared/user-guide-content/content/ai-governance/intake-forms.ts ~/website/verifywise/content/user-guide/content/ai-governance/intake-forms.ts
```

Do not commit in `~/website`.

- [ ] **Step 2: Technical docs**

`docs/technical/domains/use-cases.md`:
- line 38: `├── type_of_high_risk_role   # DEPLOYER, PROVIDER, DISTRIBUTOR, etc.` → `├── high_risk_roles          # text[]: Provider, Deployer or both (Provider first)`.
- line 189 (create request): `type_of_high_risk_role: string,  // Required` → `high_risk_roles?: ("Provider" | "Deployer")[], // replaces the list; or legacy type_of_high_risk_role`.
- line 237 (update request): `type_of_high_risk_role?: string,` → `high_risk_roles?: ("Provider" | "Deployer")[] | null,`.
- line 439 (CreateProjectDTO): `type_of_high_risk_role: number,` → `high_risk_roles?: HighRiskRole[],`.
- line 466: `(and \`type_of_high_risk_role\` when the answers name a role)` → `(and \`high_risk_roles\` when the answers name a role)`.
- Add a section before `## EU AI Act classification`:

```markdown
## High-risk roles

A use case holds its EU AI Act roles in `projects.high_risk_roles` (`TEXT[] NOT NULL DEFAULT '{}'`, CHECK: only `Provider` and `Deployer`). It is stored normalised: no duplicates, Provider first. All role logic lives in `Servers/utils/highRiskRoles.utils.ts` (frontend mirror: `Clients/src/application/utils/highRiskRoles.ts`).

- **API read:** project responses carry `high_risk_roles` and the deprecated, derived `type_of_high_risk_role`: `Provider` when the list contains Provider, `Deployer` when it contains only Deployer, `null` when empty. Rows read with `SELECT *` go through `withLegacyHighRiskRole` so readers of the old name do not silently get `undefined`.
- **API write:** `high_risk_roles` replaces the list. `type_of_high_risk_role: X` keeps the list when it already holds X (a client writing back the derived value cannot drop a role), otherwise sets `[X]`; `null` clears. Both fields present and disagreeing → 400.
- **SQL:** arrays are bound with `highRiskRolesArraySql` — `ARRAY[:name]::text[]`, or the literal `'{}'::text[]` for an empty list (Sequelize would bind `[]` as `NULL`).
- **Requirements filter:** `getVisibleEuCategoryIdsForProject` shows a High risk or GPAI category when its role is any of the use case's roles (`r.name = ANY(...)`); no roles shows none of those categories.
- **Questionnaire:** the role question is a multi-select. Answers saved when it was single-select (`role: "deployer"`) still validate (`acceptsSingleValue`) and are read as a one-item list. Results carry `roles` and the derived `role`.
- **Intake:** a select or multi-select question mapped to `type_of_high_risk_role` is matched option by option (label or value, case-insensitive); unmatched options are shown to the reviewer.
```

`docs/technical/domains/readiness.md` line 84: `` `ai_risk_classification` or `type_of_high_risk_role` `` → `` `ai_risk_classification` or `high_risk_roles` ``.

`docs/technical/architecture/database-schema.md` line 176: `type_of_high_risk_role high_risk_role_enum,` → `high_risk_roles TEXT[] NOT NULL DEFAULT '{}', -- 'Provider', 'Deployer' (CHECK)`.

- [ ] **Step 3: Schema copies and Servers documentation**

- `Servers/SQL_Commands.sql` line 72: `type_of_high_risk_role VARCHAR(255),` → `high_risk_roles TEXT[] NOT NULL DEFAULT '{}',`.
- `Servers/docs/schema.dbml` line 29: `type_of_high_risk_role varchar` → `high_risk_roles "text[]" [not null, default: '{}']`.
- `Servers/documentation/models/project.md`: replace the `type_of_high_risk_role:` union (lines 23-29) with `high_risk_roles: ("Provider" | "Deployer")[];` and the table row (line 46) with `| high_risk_roles        | text[] | EU AI Act roles: "Provider", "Deployer" or both (Provider first) |` (keep the table's column alignment as prettier leaves it).
- `Servers/documentation/utils/project.md` lines 54 and 109: `type_of_high_risk_role: string;` → `high_risk_roles: string[];`.
- `Servers/documentation/mocks/project.md` line 30: `type_of_high_risk_role: string;` → `high_risk_roles: string[];`; line 49: `type_of_high_risk_role: "deployer",` → `high_risk_roles: ["Deployer"],`.

- [ ] **Step 4: Check and commit**

Run: `cd Servers && npx prettier --check SQL_Commands.sql docs/schema.dbml documentation 2>/dev/null; cd .. && npx --prefix Clients prettier --check shared/user-guide-content/content/ai-governance/use-cases.ts shared/user-guide-content/content/ai-governance/intake-forms.ts docs/technical/domains/use-cases.md docs/technical/domains/readiness.md docs/technical/architecture/database-schema.md`
Expected: no issues reported for the files prettier handles (it skips `.sql` and `.dbml`). Fix formatting with `--write` if needed.

```bash
git add shared/user-guide-content/content/ai-governance/use-cases.ts shared/user-guide-content/content/ai-governance/intake-forms.ts \
  docs/technical/domains/use-cases.md docs/technical/domains/readiness.md docs/technical/architecture/database-schema.md \
  Servers/SQL_Commands.sql Servers/docs/schema.dbml \
  Servers/documentation/models/project.md Servers/documentation/utils/project.md Servers/documentation/mocks/project.md
git commit -m "docs(use-cases): document multiple high-risk roles" -m "The user guide replaces the outdated six-role list with Provider, Deployer
or both, and explains the multi-select role question and the intake mapping
of select and multi-select questions. The technical docs describe the
high_risk_roles column, the derived legacy field, the write rule, SQL binding
and the requirements filter. Schema copies and the Servers documentation name
the new column."
```

---

### Task 12: Final sweep and full gates

**Files:** none expected; fix anything the sweep finds in the file that owns it.

- [ ] **Step 1: Grep every remaining use of the old name**

Run: `git grep -n "type_of_high_risk_role" -- Servers Clients/src Clients/e2e shared ':!Servers/database/migrations' ':!Servers/dist'`
Expected — each remaining hit is one of:
- the derived API field: `Servers/domain.layer/models/project/project.model.ts` (toJSON), `Servers/extensions/jira-assets/jiraAssets.service.ts`, `Servers/utils/highRiskRoles.utils.ts`, `Servers/domain.layer/interfaces/i.project.ts`, Swagger/OpenAPI files;
- the legacy input: `Servers/middleware/validators/project.validator.ts`, `Servers/controllers/project.ctrl.ts` (deleting it from the body), `Servers/utils/highRiskRoles.utils.ts`, frontend helpers' fallback reads (`Clients/src/application/utils/highRiskRoles.ts`, `project.mapper.ts`), deprecated optional type fields;
- the intake mapping key: `HIGH_RISK_ROLE_MAPPING`, `ROLE_MAPPING` in `SubmissionPreviewModal.tsx`, `IntakeFormBuilder/types.ts` (`field` and `RISK_STEP_SET_FIELDS`), builder tests, `shared/.../intake-forms.ts`;
- the automation variable name (`project.automation.utils.ts`, `Automations/index.tsx`, `ConfigurationPanel/index.tsx`);
- dead code left alone on purpose: `Clients/src/presentation/components/CreateProjectForm/`, `Clients/src/domain/interfaces/i.form.ts`, `Clients/src/presentation/types/form.props.ts` (`typeOfHighRiskRole`);
- tests that exercise the legacy input.
Anything else is a missed reader: fix it in place and add it to this task's commit.

Run: `git grep -n "\.type_of_high_risk_role" -- Servers Clients/src ':!**/__tests__/**' ':!**/*.test.ts' ':!**/*.test.tsx' ':!**/*.spec.ts' ':!Servers/dist'`
Expected: only the helper fallbacks (`Servers/utils/highRiskRoles.utils.ts`, `Clients/src/application/utils/highRiskRoles.ts`, `Servers/utils/automation/project.automation.utils.ts`), `Clients/src/application/mappers/project.mapper.ts` (`dto.type_of_high_risk_role`, the legacy input fallback), `Servers/controllers/project.ctrl.ts` (`delete projectData.type_of_high_risk_role` and `delete updateData.type_of_high_risk_role`, intentional — do not remove them) and the dead `CreateProjectForm`.

- [ ] **Step 2: Backend gates**

Run: `cd Servers && npm run build && npm run format-check && npm run test && npm run check:enum-drift && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift && git status --short`
Expected: all pass; `git status` shows no change to `swagger.yaml`, `enum-manifest.json` or `docs/api-docs/src/config/endpoints.ts` (they were regenerated and committed in Tasks 3 and 6).

Run: `cd Servers && npm run test:integration -- tests/integration/euVisibleCategories.highRiskRoles.test.ts tests/integration/projects.test.ts tests/integration/report-scope-authorization.test.ts tests/integration/report-scope-membership.test.ts tests/integration/report-run-visibility.test.ts tests/integration/approval-workflows.test.ts`
Expected: PASS. If the harness cannot run here (no test database server, missing `Servers/.env.test`), report that with the exact error; never run the sequelize CLI against the test database by hand.

- [ ] **Step 3: Frontend gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx vitest run`
Expected: typecheck 0 errors (unfiltered output), no i18n gaps, lint 0 errors, every Vitest file passes. Then `cd Clients && git diff --name-only --relative develop... -- . | grep -E '\.(ts|tsx)$' | xargs npx prettier --check` reports no issues.

- [ ] **Step 4: Semgrep PR gate locally**

Run (repo root): `semgrep scan --config p/javascript --config p/typescript --config p/python --config p/security-audit --config p/secrets --metrics off --error --baseline-commit "$(git merge-base HEAD develop)"`
Expected: no new findings. If it flags a query built with `${roles.sql}` (`eu.utils.ts`, `project.utils.ts`, `euAiActClassification.utils.ts`), add above that `sequelize.query(` call the comment the repo already uses for the same situation, adapted:

```ts
      // The interpolated fragment is one of two constant strings from
      // highRiskRolesArraySql; every value is a bound replacement.
      // nosemgrep: <rule id from the finding>
```

then re-run until clean.

- [ ] **Step 5: Manual check against the running app**

With backend (`cd Servers && npm run watch`) and frontend (`cd Clients && npm run dev`) running against the dev database (log in as the local dev user):
1. Create a use case with EU AI Act and both roles; open its requirements tracker: the High risk categories of both roles are listed.
2. In the use case settings, remove Deployer and save: the tracker reloads with the Provider categories only; the change history shows `High-risk roles: Provider, Deployer → Provider`.
3. `curl -s -X PATCH http://localhost:3000/api/projects/<id> -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"type_of_high_risk_role":"Provider"}'` on a use case with both roles: the response still has `high_risk_roles: ["Provider","Deployer"]`.
4. Run the EU AI Act wizard choosing both roles: the result lists both roles' obligations once each, and the settings show both roles.
5. The use case list shows "Provider, Deployer", sorts and exports it.
Report what was checked and any difference from the expected result.

- [ ] **Step 6: Commit fixes, if any**

If Steps 1-5 changed files:

```bash
git add <each changed file by path>
git commit -m "fix(use-cases): <what the sweep found>" -m "<which reader or gate it was and how it is fixed>"
```

Do not push. Report the final `git log --oneline develop..HEAD`, and state in the report that the shared dev database (postgresql@16 on :5432, `verifywise`) is left migrated up: a backend run from `develop` will fail on project reads until `cd Servers && npm run build && npx sequelize db:migrate:undo` is run from this branch.


