# Readiness Scoring from Requirements, Assessments and Evidence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the readiness score reflect Requirements progress, Assessments progress and Evidence quality, so completing a requirement visibly moves readiness.

**Architecture:** Two layers. A control's score blends its requirement completion (50%) with evidence quality/count/recency (50%). A framework's score blends the control average (70%) with assessment completion (30%); when a framework has no assessment questions, the weight is renormalized to the control average alone. Task and risk components are removed from the formula.

**Tech Stack:** Node 22, TypeScript, Express, Sequelize (raw SQL), PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-07-28-readiness-scoring-design.md`

## Global Constraints

- Backend tests run with `cd Servers && npm run test:unit` (Jest). A single file: `npx jest <path> --testPathIgnorePatterns=/tests/integration/`.
- Query modules are unit-tested by mocking `../database/db`, asserting on SQL content — see `Servers/utils/governanceCoverage.utils.test.ts` for the established pattern. Tests live beside the source as `<name>.test.ts`.
- All SQL uses named replacements (`:name`). Never interpolate values into SQL strings.
- Every query is scoped by `organization_id`. This is a shared-schema multi-tenant database; an unscoped query is a data leak.
- Completion is defined per framework, matching that framework's own progress bar: EU AI Act counts `status = 'Done'`; ISO 42001 counts `status = 'Implemented'`.
- Scores are integers 0-100. Clamp and round at every boundary.
- Commit format: `type(scope): description` (e.g. `feat(readiness): score controls from requirement completion`).
- Do not change `readiness_level` thresholds (`ready ≥ 80`, `needs_work ≥ 60`, `at_risk ≥ 30`) or any frontend rendering.
- **Tasks 2, 3 and 4 knowingly commit with `npx tsc --noEmit` failing** in `controllers/readiness.ctrl.ts`: the calculator's and the upsert's types change before the controller that calls them. Task 5 restores a clean build. This sequencing was reviewed and accepted by the repository owner. Do not repair the controller out of turn to make an earlier task's build pass — that would move Task 5's work into a task whose tests cannot cover it.
- Never `git add -A` or `git add .`. Every commit uses the explicit paths listed in its task. The working tree carries unrelated uncommitted frontend work that must not be swept into a commit.

---

### Task 1: Migration for the new score columns

**Files:**
- Create: `Servers/database/migrations/20260728120000-readiness-requirements-scoring.js`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `control_readiness_scores.requirements_score INTEGER`, `framework_readiness_scores.assessment_score INTEGER`, `framework_readiness_scores.controls_avg_score INTEGER`.

- [ ] **Step 1: Write the migration**

```javascript
"use strict";

/**
 * Readiness scoring now derives from requirement completion, assessment
 * completion and evidence quality.
 *
 * - control_readiness_scores.requirements_score: share of the control's
 *   requirement rows that are complete (0-100).
 * - framework_readiness_scores.controls_avg_score: the layer-1 average.
 * - framework_readiness_scores.assessment_score: assessment completion, or
 *   NULL when the framework has no assessment questions in scope.
 *
 * task_completion_score and risk_mitigation_score are intentionally NOT
 * dropped: the advisor's generateRecommendations still selects them. They are
 * simply no longer written.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.control_readiness_scores
        ADD COLUMN IF NOT EXISTS requirements_score INTEGER
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        ADD COLUMN IF NOT EXISTS controls_avg_score INTEGER
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        ADD COLUMN IF NOT EXISTS assessment_score INTEGER
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.control_readiness_scores
        DROP COLUMN IF EXISTS requirements_score
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        DROP COLUMN IF EXISTS controls_avg_score
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        DROP COLUMN IF EXISTS assessment_score
    `);
  },
};
```

- [ ] **Step 2: Run the migration**

Run: `cd Servers && npm run migrate-db`
Expected: migration `20260728120000-readiness-requirements-scoring` applied, no errors.

- [ ] **Step 3: Verify the columns exist**

This repo configures Postgres through `Servers/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`); there is no `DATABASE_URL`. Run:

```bash
cd Servers && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d verifywise.control_readiness_scores" -c "\d verifywise.framework_readiness_scores"
```
Expected: `requirements_score` on the control table; `controls_avg_score` and `assessment_score` on the framework table. `task_completion_score` and `risk_mitigation_score` are still present.

- [ ] **Step 4: Commit**

```bash
git add Servers/database/migrations/20260728120000-readiness-requirements-scoring.js
git commit -m "feat(readiness): add requirement and assessment score columns"
```

---

### Task 2: New scoring formula in the calculator

**Files:**
- Modify: `Servers/advisor/scoring/readinessCalculator.ts`
- Test: `Servers/advisor/scoring/readinessCalculator.test.ts` (create)

**Interfaces:**
- Consumes: `ReadinessLevel` from `Servers/domain.layer/interfaces/i.readiness`.
- Produces:
  - `READINESS_WEIGHTS = { requirements: 0.5, evidence_quality: 0.2, evidence_count: 0.15, evidence_recency: 0.15 }`
  - `FRAMEWORK_WEIGHTS = { controls: 0.7, assessments: 0.3 }`
  - `ReadinessInput { requirements, evidence_quality, evidence_count, evidence_recency }` — all numbers 0-100
  - `ReadinessResult { requirements_score, evidence_quality_score, evidence_count_score, evidence_recency_score, overall_score, readiness_level }`
  - `calculateReadinessScore(input: ReadinessInput): ReadinessResult`
  - `blendFrameworkScore(controlsAvg: number, assessmentCompletion: number | null): number`
  - unchanged and still exported: `classifyReadinessLevel`, `normalizeEvidenceCount`, `normalizeRecency`, `aggregateFrameworkScores`, `READINESS_THRESHOLDS`

- [ ] **Step 1: Write the failing tests**

Create `Servers/advisor/scoring/readinessCalculator.test.ts`:

```typescript
import {
  READINESS_WEIGHTS,
  FRAMEWORK_WEIGHTS,
  calculateReadinessScore,
  blendFrameworkScore,
  classifyReadinessLevel,
} from "./readinessCalculator";

describe("READINESS_WEIGHTS", () => {
  it("sums to 1", () => {
    const sum = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("gives requirements half the control score", () => {
    expect(READINESS_WEIGHTS.requirements).toBe(0.5);
  });
});

describe("calculateReadinessScore", () => {
  const noEvidence = { evidence_quality: 0, evidence_count: 0, evidence_recency: 0 };

  it("scores a fully documented, fully implemented control at 100", () => {
    const result = calculateReadinessScore({
      requirements: 100,
      evidence_quality: 100,
      evidence_count: 100,
      evidence_recency: 100,
    });

    expect(result.overall_score).toBe(100);
    expect(result.readiness_level).toBe("ready");
  });

  it("scores completed requirements with no evidence at 50", () => {
    const result = calculateReadinessScore({ requirements: 100, ...noEvidence });

    expect(result.overall_score).toBe(50);
    expect(result.requirements_score).toBe(100);
    expect(result.readiness_level).toBe("at_risk");
  });

  it("scores an untouched control at 0", () => {
    const result = calculateReadinessScore({ requirements: 0, ...noEvidence });

    expect(result.overall_score).toBe(0);
    expect(result.readiness_level).toBe("not_started");
  });

  it("clamps out-of-range inputs", () => {
    const result = calculateReadinessScore({
      requirements: 150,
      evidence_quality: -20,
      evidence_count: 0,
      evidence_recency: 0,
    });

    expect(result.requirements_score).toBe(100);
    expect(result.evidence_quality_score).toBe(0);
    expect(result.overall_score).toBe(50);
  });
});

describe("blendFrameworkScore", () => {
  it("weights the control average against assessment completion", () => {
    expect(FRAMEWORK_WEIGHTS.controls).toBe(0.7);
    expect(FRAMEWORK_WEIGHTS.assessments).toBe(0.3);
    // 60 * 0.7 + 40 * 0.3
    expect(blendFrameworkScore(60, 40)).toBe(54);
  });

  it("renormalizes to the control average when there are no assessments", () => {
    // Not 42 — a framework without assessments must still be able to reach 100.
    expect(blendFrameworkScore(60, null)).toBe(60);
    expect(blendFrameworkScore(100, null)).toBe(100);
  });

  it("treats unanswered questions as a real zero", () => {
    expect(blendFrameworkScore(100, 0)).toBe(70);
  });

  it("clamps and rounds", () => {
    expect(blendFrameworkScore(120, 110)).toBe(100);
    expect(blendFrameworkScore(-5, null)).toBe(0);
    expect(blendFrameworkScore(55, 44)).toBe(52); // 38.5 + 13.2 = 51.7
  });
});

describe("classifyReadinessLevel", () => {
  it("maps scores onto the unchanged thresholds", () => {
    expect(classifyReadinessLevel(80)).toBe("ready");
    expect(classifyReadinessLevel(60)).toBe("needs_work");
    expect(classifyReadinessLevel(30)).toBe("at_risk");
    expect(classifyReadinessLevel(29)).toBe("not_started");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest advisor/scoring/readinessCalculator.test.ts`
Expected: FAIL — `blendFrameworkScore` and `FRAMEWORK_WEIGHTS` are not exported; `requirements` is not a valid `ReadinessInput` key.

- [ ] **Step 3: Rewrite the weights, types and functions**

In `Servers/advisor/scoring/readinessCalculator.ts`, replace the `READINESS_WEIGHTS` block, `ReadinessInput`, `ReadinessResult` and `calculateReadinessScore` with:

```typescript
/**
 * Readiness scoring weights — deterministic formula.
 * control = requirements * 0.50 + evidence_quality * 0.20 +
 *           evidence_count * 0.15 + evidence_recency * 0.15
 */
export const READINESS_WEIGHTS = {
  requirements: 0.5,
  evidence_quality: 0.2,
  evidence_count: 0.15,
  evidence_recency: 0.15,
} as const;

/**
 * Framework-level weights: the control average against assessment completion.
 */
export const FRAMEWORK_WEIGHTS = {
  controls: 0.7,
  assessments: 0.3,
} as const;

export interface ReadinessInput {
  requirements: number; // % of the control's requirement rows completed (0-100)
  evidence_quality: number; // avg quality score of linked evidence (0-100)
  evidence_count: number; // normalized count score (0-100)
  evidence_recency: number; // freshness of evidence (0-100)
}

export interface ReadinessResult {
  requirements_score: number;
  evidence_quality_score: number;
  evidence_count_score: number;
  evidence_recency_score: number;
  overall_score: number;
  readiness_level: ReadinessLevel;
}

const clampScore = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Calculate the overall control readiness score using the weighted formula.
 */
export function calculateReadinessScore(input: ReadinessInput): ReadinessResult {
  const rq = clampScore(input.requirements);
  const eq = clampScore(input.evidence_quality);
  const ec = clampScore(input.evidence_count);
  const er = clampScore(input.evidence_recency);

  const overall = Math.round(
    rq * READINESS_WEIGHTS.requirements +
      eq * READINESS_WEIGHTS.evidence_quality +
      ec * READINESS_WEIGHTS.evidence_count +
      er * READINESS_WEIGHTS.evidence_recency,
  );

  return {
    requirements_score: rq,
    evidence_quality_score: eq,
    evidence_count_score: ec,
    evidence_recency_score: er,
    overall_score: overall,
    readiness_level: classifyReadinessLevel(overall),
  };
}

/**
 * Blend the control average with assessment completion.
 *
 * `assessmentCompletion` is null when the framework has no assessment questions
 * in scope (ISO 42001 always; EU AI Act when the assessment was never created).
 * The weight is then renormalized to the control average — scoring the missing
 * term as 0 would cap such a framework at 70.
 */
export function blendFrameworkScore(
  controlsAvg: number,
  assessmentCompletion: number | null,
): number {
  const controls = clampScore(controlsAvg);
  if (assessmentCompletion === null) return controls;

  const assessments = clampScore(assessmentCompletion);
  return clampScore(
    controls * FRAMEWORK_WEIGHTS.controls + assessments * FRAMEWORK_WEIGHTS.assessments,
  );
}
```

Leave `classifyReadinessLevel`, `READINESS_THRESHOLDS`, `normalizeEvidenceCount`, `normalizeRecency`, `FrameworkAggregation` and `aggregateFrameworkScores` exactly as they are. Delete the old local `clamp` inside `calculateReadinessScore` — `clampScore` replaces it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd Servers && npx jest advisor/scoring/readinessCalculator.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confirm the compiler finds every stale caller**

Run: `cd Servers && npx tsc --noEmit`
Expected: FAIL, and only in `controllers/readiness.ctrl.ts` — `task_completion`/`risk_mitigation` no longer exist on `ReadinessInput`. Task 5 fixes that call site. Record the error list; it is the checklist for Task 5.

- [ ] **Step 6: Commit**

```bash
git add Servers/advisor/scoring/readinessCalculator.ts Servers/advisor/scoring/readinessCalculator.test.ts
git commit -m "feat(readiness): score controls from requirements and evidence"
```

---

### Task 3: Requirement and assessment completion queries

**Files:**
- Modify: `Servers/utils/readiness.utils.ts`
- Test: `Servers/utils/readiness.utils.test.ts` (create)

**Interfaces:**
- Consumes: `sequelize` from `../database/db`; `getVisibleEuCategoryIdsForProject` from `./eu.utils`.
- Produces:
  - `getApplicableControlsWithRequirementsQuery(frameworkType: string, organizationId: number, projectId: number | null): Promise<Array<{ control_id: number; requirements_score: number }>>`
  - `getAssessmentCompletionQuery(organizationId: number, projectId: number | null): Promise<number | null>` — completion percentage, or `null` when no questions exist in scope.
  - `FRAMEWORK_NAMES: Record<string, string>` mapping `eu_ai_act` → `"EU AI Act"`, `iso_42001` → `"ISO 42001"`.
  - `getFrameworkControlsQuery` is **not** still used by the advisor — the advisor's tools are `evaluate_evidence`, `check_task_completion`, `analyze_risk_status` and `generate_recommendations`, none of which call it. Once the controller stops importing it, it has zero callers and should be deleted rather than left exported.

- [ ] **Step 1: Write the failing tests**

Create `Servers/utils/readiness.utils.test.ts`:

```typescript
const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

jest.mock("./eu.utils", () => ({
  getVisibleEuCategoryIdsForProject: jest.fn().mockResolvedValue([1, 2]),
}));

// readiness.utils.ts imports `logger` as a default export from this path.
jest.mock("./logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock("./visibility.utils", () => ({
  buildVisibilityFilter: jest.fn(() => ({ clause: "", replacements: {} })),
}));

import {
  getApplicableControlsWithRequirementsQuery,
  getAssessmentCompletionQuery,
} from "./readiness.utils";
import { getVisibleEuCategoryIdsForProject } from "./eu.utils";

describe("getApplicableControlsWithRequirementsQuery — EU AI Act", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getVisibleEuCategoryIdsForProject as jest.Mock).mockResolvedValue([1, 2]);
  });

  const mockProjectFramework = () => {
    mockQuery.mockResolvedValueOnce([[{ id: 10 }]]); // projects_frameworks lookup
  };

  it("returns the completion percentage of each applicable control", async () => {
    mockProjectFramework();
    mockQuery.mockResolvedValueOnce([
      [
        { control_id: 1, total: "4", done: "2" },
        { control_id: 2, total: "2", done: "2" },
        { control_id: 3, total: "3", done: "0" },
        { control_id: 4, total: "0", done: "0" }, // control with no requirement rows
      ],
    ]);

    const result = await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 7);

    expect(result).toEqual([
      { control_id: 1, requirements_score: 50 },
      { control_id: 2, requirements_score: 100 },
      { control_id: 3, requirements_score: 0 },
      { control_id: 4, requirements_score: 0 },
    ]);
  });

  it("keeps controls that have no subcontrol rows in the scored set", async () => {
    mockProjectFramework();
    mockQuery.mockResolvedValueOnce([[]]);

    await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 7);

    // A plain JOIN would drop such a control entirely; it must be scored on
    // evidence alone with requirements_score 0.
    expect(mockQuery.mock.calls[1][0]).toContain("LEFT JOIN subcontrols_eu");
  });

  it("counts only subcontrols marked Done, scoped to the project framework", async () => {
    mockProjectFramework();
    mockQuery.mockResolvedValueOnce([[]]);

    await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 7);

    const [sql, options] = mockQuery.mock.calls[1];
    expect(sql).toContain("subcontrols_eu");
    expect(sql).toContain("'Done'");
    expect(options.replacements).toMatchObject({
      organizationId: 1,
      projectFrameworkId: 10,
      visibleCategoryIds: [1, 2],
    });
  });

  it("restricts the control set to the project's visible categories", async () => {
    mockProjectFramework();
    mockQuery.mockResolvedValueOnce([[]]);

    await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 7);

    expect(getVisibleEuCategoryIdsForProject).toHaveBeenCalledWith(10, 1);
    expect(mockQuery.mock.calls[1][0]).toContain("control_category_id IN (:visibleCategoryIds)");
  });

  it("returns no controls when the project has no visible categories", async () => {
    mockProjectFramework();
    (getVisibleEuCategoryIdsForProject as jest.Mock).mockResolvedValue([]);

    const result = await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 7);

    expect(result).toEqual([]);
  });

  it("returns no controls when the project does not have the framework", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // no projects_frameworks row

    const result = await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, 99);

    expect(result).toEqual([]);
  });
});

describe("getApplicableControlsWithRequirementsQuery — ISO 42001", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("counts Implemented annex categories and excludes non-applicable ones", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 11 }]]);
    mockQuery.mockResolvedValueOnce([
      [
        { control_id: 5, total: "1", done: "1" },
        { control_id: 6, total: "1", done: "0" },
      ],
    ]);

    const result = await getApplicableControlsWithRequirementsQuery("iso_42001", 1, 7);

    expect(result).toEqual([
      { control_id: 5, requirements_score: 100 },
      { control_id: 6, requirements_score: 0 },
    ]);

    const sql = mockQuery.mock.calls[1][0];
    expect(sql).toContain("annexcategories_iso");
    expect(sql).toContain("'Implemented'");
    expect(sql).toContain("is_applicable = TRUE");
  });
});

describe("getApplicableControlsWithRequirementsQuery — organization-wide", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getVisibleEuCategoryIdsForProject as jest.Mock).mockResolvedValue([1]);
  });

  it("sums completion across every project framework", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 10 }, { id: 20 }]]); // two project frameworks
    mockQuery.mockResolvedValueOnce([[{ control_id: 1, total: "2", done: "2" }]]); // pf 10
    mockQuery.mockResolvedValueOnce([[{ control_id: 1, total: "2", done: "0" }]]); // pf 20

    const result = await getApplicableControlsWithRequirementsQuery("eu_ai_act", 1, null);

    // 2 done of 4 total
    expect(result).toEqual([{ control_id: 1, requirements_score: 50 }]);
  });
});

describe("getAssessmentCompletionQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the percentage of questions answered Done", async () => {
    mockQuery.mockResolvedValueOnce([[{ total: "70", done: "24" }]]);

    const result = await getAssessmentCompletionQuery(1, 7);

    expect(result).toBe(34);
  });

  it("returns null when the scope has no assessment questions", async () => {
    mockQuery.mockResolvedValueOnce([[{ total: "0", done: "0" }]]);

    const result = await getAssessmentCompletionQuery(1, 7);

    expect(result).toBeNull();
  });

  it("scopes to the project when one is given", async () => {
    mockQuery.mockResolvedValueOnce([[{ total: "10", done: "5" }]]);

    await getAssessmentCompletionQuery(1, 7);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("answers_eu");
    expect(options.replacements).toMatchObject({ organizationId: 1, projectId: 7 });
  });

  it("covers the whole organization when no project is given", async () => {
    mockQuery.mockResolvedValueOnce([[{ total: "10", done: "5" }]]);

    await getAssessmentCompletionQuery(1, null);

    expect(mockQuery.mock.calls[0][1].replacements).toMatchObject({ projectId: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest utils/readiness.utils.test.ts`
Expected: FAIL — `getApplicableControlsWithRequirementsQuery` and `getAssessmentCompletionQuery` are not exported.

- [ ] **Step 3: Implement the queries**

Append to `Servers/utils/readiness.utils.ts` (and add `import { getVisibleEuCategoryIdsForProject } from "./eu.utils";` at the top):

```typescript
/** readiness framework_type → frameworks.name */
export const FRAMEWORK_NAMES: Record<string, string> = {
  eu_ai_act: "EU AI Act",
  iso_42001: "ISO 42001",
};

/**
 * Resolve the projects_frameworks rows in scope: one row when a project is
 * given, every row of that framework in the organization otherwise.
 */
async function getProjectFrameworkIds(
  frameworkType: string,
  organizationId: number,
  projectId: number | null,
): Promise<number[]> {
  const frameworkName = FRAMEWORK_NAMES[frameworkType];
  if (!frameworkName) return [];

  const [rows] = await sequelize.query(
    `SELECT pf.id
     FROM projects_frameworks pf
     JOIN frameworks f ON f.id = pf.framework_id
     WHERE pf.organization_id = :organizationId
       AND f.name = :frameworkName
       AND (:projectId::int IS NULL OR pf.project_id = :projectId)`,
    { replacements: { organizationId, frameworkName, projectId } },
  );

  return (rows as any[]).map((r) => Number(r.id));
}

/**
 * Per-control requirement completion for the controls a project is actually
 * required to implement.
 *
 * EU AI Act counts subcontrols marked 'Done' within the categories visible for
 * the project's risk tier and role — the same filter the Requirements progress
 * bar uses, so the two can never disagree. ISO 42001 counts annex categories
 * marked 'Implemented', excluding categories marked not applicable.
 *
 * Organization-wide (projectId null) sums done/total per control across every
 * project framework, so each project's own applicability still applies.
 */
export async function getApplicableControlsWithRequirementsQuery(
  frameworkType: string,
  organizationId: number,
  projectId: number | null,
): Promise<Array<{ control_id: number; requirements_score: number }>> {
  try {
    const projectFrameworkIds = await getProjectFrameworkIds(
      frameworkType,
      organizationId,
      projectId,
    );
    if (projectFrameworkIds.length === 0) return [];

    const totals = new Map<number, { done: number; total: number }>();

    for (const projectFrameworkId of projectFrameworkIds) {
      let rows: any[] = [];

      if (frameworkType === "iso_42001") {
        const [isoRows] = await sequelize.query(
          `SELECT ac.annexcategory_meta_id AS control_id,
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE ac.status = 'Implemented') AS done
           FROM annexcategories_iso ac
           WHERE ac.organization_id = :organizationId
             AND ac.projects_frameworks_id = :projectFrameworkId
             AND ac.is_applicable = TRUE
           GROUP BY ac.annexcategory_meta_id`,
          { replacements: { organizationId, projectFrameworkId } },
        );
        rows = isoRows as any[];
      } else {
        const visibleCategoryIds = await getVisibleEuCategoryIdsForProject(
          projectFrameworkId,
          organizationId,
        );
        if (visibleCategoryIds.length === 0) continue;

        const [euRows] = await sequelize.query(
          `SELECT c.control_meta_id AS control_id,
                  COUNT(sc.id) AS total,
                  COUNT(*) FILTER (WHERE sc.status = 'Done') AS done
           FROM controls_eu c
           LEFT JOIN subcontrols_eu sc
             ON c.organization_id = sc.organization_id AND c.id = sc.control_id
           JOIN controls_struct_eu cs ON c.control_meta_id = cs.id
           WHERE c.organization_id = :organizationId
             AND c.projects_frameworks_id = :projectFrameworkId
             AND cs.control_category_id IN (:visibleCategoryIds)
           GROUP BY c.control_meta_id`,
          { replacements: { organizationId, projectFrameworkId, visibleCategoryIds } },
        );
        rows = euRows as any[];
      }

      for (const row of rows) {
        const controlId = Number(row.control_id);
        const current = totals.get(controlId) || { done: 0, total: 0 };
        current.done += parseInt(row.done, 10) || 0;
        current.total += parseInt(row.total, 10) || 0;
        totals.set(controlId, current);
      }
    }

    return [...totals.entries()].map(([control_id, { done, total }]) => ({
      control_id,
      requirements_score: total > 0 ? Math.round((done / total) * 100) : 0,
    }));
  } catch (error) {
    logger.error("Error getting applicable controls with requirements:", error);
    throw error;
  }
}

/**
 * Assessment completion for the scope, as a percentage of questions answered
 * 'Done'. Returns null when there are no questions at all — the caller
 * renormalizes rather than scoring a missing input as zero.
 */
export async function getAssessmentCompletionQuery(
  organizationId: number,
  projectId: number | null,
): Promise<number | null> {
  try {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ans.status = 'Done') AS done
       FROM assessments a
       JOIN answers_eu ans
         ON a.organization_id = ans.organization_id AND a.id = ans.assessment_id
       JOIN projects_frameworks pf ON pf.id = a.projects_frameworks_id
       WHERE a.organization_id = :organizationId
         AND (:projectId::int IS NULL OR pf.project_id = :projectId)`,
      { replacements: { organizationId, projectId } },
    );

    const row = (rows as any[])[0] || {};
    const total = parseInt(row.total, 10) || 0;
    if (total === 0) return null;

    const done = parseInt(row.done, 10) || 0;
    return Math.round((done / total) * 100);
  } catch (error) {
    logger.error("Error getting assessment completion:", error);
    throw error;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd Servers && npx jest utils/readiness.utils.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/readiness.utils.ts Servers/utils/readiness.utils.test.ts
git commit -m "feat(readiness): add requirement and assessment completion queries"
```

---

### Task 4: Persist the new component scores

**Files:**
- Modify: `Servers/utils/readiness.utils.ts` (`upsertControlScoreQuery` at line 9, `upsertFrameworkScoreQuery` at line 82)
- Test: `Servers/utils/readiness.utils.test.ts` (extend)

**Interfaces:**
- Consumes: the columns added in Task 1.
- Produces:
  - `upsertControlScoreQuery(controlId, frameworkType, organizationId, data)` where `data` now takes `requirements_score: number` and no longer takes `task_completion_score` or `risk_mitigation_score`.
  - `upsertFrameworkScoreQuery(frameworkType, organizationId, data)` where `data` additionally takes `controls_avg_score: number` and `assessment_score: number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `Servers/utils/readiness.utils.test.ts`, adding `upsertControlScoreQuery` and `upsertFrameworkScoreQuery` to the existing `import { ... } from "./readiness.utils";` statement at the top rather than writing a second import:

```typescript
describe("upsertControlScoreQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[{ id: 1 }]]);
  });

  it("persists the requirements score", async () => {
    await upsertControlScoreQuery(1, "eu_ai_act", 1, {
      project_id: 7,
      created_by: 2,
      visibility: "public",
      requirements_score: 75,
      evidence_quality_score: 80,
      evidence_count_score: 55,
      evidence_recency_score: 100,
      overall_score: 74,
      readiness_level: "needs_work",
      recommendations: ["Complete the remaining requirements for this control"],
    });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("requirements_score");
    expect(sql).toContain("requirements_score = EXCLUDED.requirements_score");
    expect(options.replacements).toMatchObject({ requirements: 75, overallScore: 74 });
  });

  it("no longer writes the retired task and risk columns", async () => {
    await upsertControlScoreQuery(1, "eu_ai_act", 1, {
      requirements_score: 0,
      evidence_quality_score: 0,
      evidence_count_score: 0,
      evidence_recency_score: 0,
      overall_score: 0,
      readiness_level: "not_started",
    });

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toContain("task_completion_score");
    expect(sql).not.toContain("risk_mitigation_score");
  });
});

describe("upsertFrameworkScoreQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[{ id: 1 }]]);
  });

  it("persists both layers of the framework score", async () => {
    await upsertFrameworkScoreQuery("eu_ai_act", 1, {
      project_id: 7,
      total_controls: 39,
      avg_score: 54,
      controls_avg_score: 60,
      assessment_score: 40,
      ready_count: 1,
      needs_work_count: 2,
      at_risk_count: 3,
      not_started_count: 4,
      weakest_controls: [],
    });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("controls_avg_score");
    expect(sql).toContain("assessment_score");
    expect(options.replacements).toMatchObject({
      avgScore: 54,
      controlsAvgScore: 60,
      assessmentScore: 40,
    });
  });

  it("stores a null assessment score when the framework has no questions", async () => {
    await upsertFrameworkScoreQuery("iso_42001", 1, {
      total_controls: 10,
      avg_score: 60,
      controls_avg_score: 60,
      assessment_score: null,
      ready_count: 0,
      needs_work_count: 0,
      at_risk_count: 0,
      not_started_count: 10,
    });

    expect(mockQuery.mock.calls[0][1].replacements).toMatchObject({ assessmentScore: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Servers && npx jest utils/readiness.utils.test.ts`
Expected: FAIL — the SQL still contains `task_completion_score`, and `requirements_score` is not a valid property of the `data` argument.

- [ ] **Step 3: Update `upsertControlScoreQuery`**

In `Servers/utils/readiness.utils.ts`, in the `data` type replace these two lines:

```typescript
    task_completion_score: number;
    risk_mitigation_score: number;
```

with:

```typescript
    requirements_score: number;
```

In the SQL, replace the insert column list line `task_completion_score, risk_mitigation_score,` with `requirements_score,`; replace the values line `:taskCompletion, :riskMitigation,` with `:requirements,`; and replace the two `DO UPDATE SET` lines

```sql
         task_completion_score = EXCLUDED.task_completion_score,
         risk_mitigation_score = EXCLUDED.risk_mitigation_score,
```

with

```sql
         requirements_score = EXCLUDED.requirements_score,
```

In `replacements`, replace

```typescript
          taskCompletion: data.task_completion_score,
          riskMitigation: data.risk_mitigation_score,
```

with

```typescript
          requirements: data.requirements_score,
```

- [ ] **Step 4: Update `upsertFrameworkScoreQuery`**

Add to the `data` type, after `avg_score: number;`:

```typescript
    controls_avg_score: number;
    assessment_score: number | null;
```

In the SQL, replace `total_controls, avg_score,` with `total_controls, avg_score, controls_avg_score, assessment_score,`; replace `:totalControls, :avgScore,` with `:totalControls, :avgScore, :controlsAvgScore, :assessmentScore,`; and add to the `DO UPDATE SET` block, next to the existing `avg_score` line:

```sql
         controls_avg_score = EXCLUDED.controls_avg_score,
         assessment_score = EXCLUDED.assessment_score,
```

In `replacements`, next to `avgScore: data.avg_score,` add:

```typescript
          controlsAvgScore: data.controls_avg_score,
          assessmentScore: data.assessment_score,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd Servers && npx jest utils/readiness.utils.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/readiness.utils.ts Servers/utils/readiness.utils.test.ts
git commit -m "feat(readiness): persist requirement and assessment component scores"
```

---

### Task 5: Wire the controller to the new inputs

**Files:**
- Modify: `Servers/controllers/readiness.ctrl.ts` (`calculateControlReadiness` at line 29, `calculateAll` at line 146, `calculateForFramework` at line 235)

**Interfaces:**
- Consumes: `calculateReadinessScore`, `blendFrameworkScore`, `aggregateFrameworkScores` (Task 2); `getApplicableControlsWithRequirementsQuery`, `getAssessmentCompletionQuery`, `upsertControlScoreQuery`, `upsertFrameworkScoreQuery` (Tasks 3-4).
- Produces: `calculateControlReadiness(controlId, frameworkType, organizationId, projectId, requirementsScore, createdBy, visibility)` — note `requirementsScore: number` inserted before `createdBy`.

- [ ] **Step 1: Delete the task and risk gathering**

In `calculateControlReadiness`, delete the whole `// 2) Task completion` block (the `taskRows` query and the `totalTasks`/`completedTasks`/`taskRate` constants) and the whole `// 3) Risk mitigation` block (the `riskRows` query and the `totalRisks`/`mitigatedRisks`/`riskRate` constants). Keep the evidence block above them untouched.

- [ ] **Step 2: Take the requirement score as a parameter**

Change the signature to:

```typescript
async function calculateControlReadiness(
  controlId: number,
  frameworkType: string,
  organizationId: number,
  projectId: number | null,
  requirementsScore: number,
  createdBy: number | null = null,
  visibility: string = "public",
) {
```

- [ ] **Step 3: Score and recommend from the new inputs**

Replace the `// 4) Calculate weighted score` call with:

```typescript
  // 4) Calculate weighted score
  const result = calculateReadinessScore({
    requirements: requirementsScore,
    evidence_quality: avgQuality,
    evidence_count: normalizeEvidenceCount(evidenceCount),
    evidence_recency: normalizeRecency(daysSinceLatest),
  });
```

Replace the recommendations block with:

```typescript
  // 5) Generate recommendations
  const recommendations: string[] = [];
  if (result.requirements_score < 100)
    recommendations.push("Complete the remaining requirements for this control");
  if (result.evidence_count_score < 30)
    recommendations.push("Upload evidence documents for this control");
  if (result.evidence_quality_score < 50)
    recommendations.push("Improve quality of linked evidence");
  if (result.evidence_recency_score < 40)
    recommendations.push("Update outdated evidence with recent documents");
```

The `upsertControlScoreQuery` call below it needs no change — it spreads `...result`, which now carries `requirements_score`.

- [ ] **Step 4: Drive `calculateAll` from the applicable control set**

In `calculateAll`, replace the body of the `for (const fw of frameworkTypes)` loop up to and including the `aggregateFrameworkScores` call with:

```typescript
      const controls = await getApplicableControlsWithRequirementsQuery(
        fw,
        organizationId,
        projectId,
      );
      const controlScores: Array<{
        control_id: number;
        overall_score: number;
        readiness_level: any;
      }> = [];

      for (const ctrl of controls) {
        const score = await calculateControlReadiness(
          ctrl.control_id,
          fw,
          organizationId,
          projectId,
          ctrl.requirements_score,
          userId,
          visibility,
        );
        controlScores.push({
          control_id: ctrl.control_id,
          overall_score: score.overall_score,
          readiness_level: score.readiness_level,
        });
      }

      const agg = aggregateFrameworkScores(controlScores, fw);
      const assessmentScore =
        fw === "eu_ai_act" ? await getAssessmentCompletionQuery(organizationId, projectId) : null;
      const blendedScore = blendFrameworkScore(agg.avg_score, assessmentScore);
```

Then change the `upsertFrameworkScoreQuery` call to pass both layers:

```typescript
      const fwScore = await upsertFrameworkScoreQuery(fw, organizationId, {
        project_id: projectId,
        created_by: userId,
        visibility,
        ...agg,
        controls_avg_score: agg.avg_score,
        assessment_score: assessmentScore,
        avg_score: blendedScore,
      });
```

`avg_score` is listed after the `...agg` spread so the blended value wins.

In the `insertReadinessHistoryQuery` call directly below, change `avg_score: agg.avg_score,` to `avg_score: blendedScore,` so the trend chart tracks the same number the headline shows.

- [ ] **Step 5: Update `calculateForFramework`**

`calculateForFramework` serves `POST /readiness/calculate/:frameworkType` — the route the use case's AI readiness tab calls. Replace everything from `const controls = await getFrameworkControlsQuery(frameworkType);` down to and including the `insertReadinessHistoryQuery` call with:

```typescript
    const controls = await getApplicableControlsWithRequirementsQuery(
      frameworkType,
      organizationId,
      projectId,
    );
    if (controls.length === 0) {
      return res.status(404).json(STATUS_CODE[404]("No controls found for framework"));
    }

    const controlScores: Array<{
      control_id: number;
      overall_score: number;
      readiness_level: any;
    }> = [];

    for (const ctrl of controls) {
      const score = await calculateControlReadiness(
        ctrl.control_id,
        frameworkType,
        organizationId,
        projectId,
        ctrl.requirements_score,
        userId,
        visibility,
      );
      controlScores.push({
        control_id: ctrl.control_id,
        overall_score: score.overall_score,
        readiness_level: score.readiness_level,
      });
    }

    const agg = aggregateFrameworkScores(controlScores, frameworkType);
    const assessmentScore =
      frameworkType === "eu_ai_act"
        ? await getAssessmentCompletionQuery(organizationId, projectId)
        : null;
    const blendedScore = blendFrameworkScore(agg.avg_score, assessmentScore);

    const fwScore = await upsertFrameworkScoreQuery(frameworkType, organizationId, {
      project_id: projectId,
      created_by: userId,
      visibility,
      ...agg,
      controls_avg_score: agg.avg_score,
      assessment_score: assessmentScore,
      avg_score: blendedScore,
    });

    // Record snapshot in history table
    await insertReadinessHistoryQuery(frameworkType, organizationId, {
      project_id: projectId,
      created_by: userId,
      visibility,
      avg_score: blendedScore,
      total_controls: agg.total_controls,
      ready_count: agg.ready_count,
      needs_work_count: agg.needs_work_count,
      at_risk_count: agg.at_risk_count,
      not_started_count: agg.not_started_count,
    });
```

Note the 404: it now fires when the *project* has no applicable controls (it does not have this framework installed), not when the framework template is empty. That is the correct behaviour for a project-scoped call.

The `trackAIContent` block below still reads `agg.avg_score` in its `promptSummary`. Change that to `blendedScore` so the logged summary matches the stored score.

- [ ] **Step 6: Update the imports**

At the top of `readiness.ctrl.ts`, add `blendFrameworkScore` to the import from `../advisor/scoring/readinessCalculator`, and add `getApplicableControlsWithRequirementsQuery` and `getAssessmentCompletionQuery` to the import from `../utils/readiness.utils`. Remove `getFrameworkControlsQuery` from that import if nothing else in the file uses it.

- [ ] **Step 7: Verify the build**

Run: `cd Servers && npx tsc --noEmit`
Expected: PASS, clean. This resolves every error recorded in Task 2 Step 5.

- [ ] **Step 8: Run the full backend unit suite**

Run: `cd Servers && npm run test:unit`
Expected: PASS, no new failures.

- [ ] **Step 9: Verify against real data**

With the backend and frontend running, open the demo use case → Frameworks/regulations → AI readiness, click "Calculate readiness", then compare:

```bash
curl -s "http://localhost:3000/api/readiness/scores?project_id=1" -H "Authorization: Bearer $TOKEN"
```

Expected: `total_controls` equals the number of **controls** in the project's applicable set — 24 for the demo project, not 103. Do **not** expect it to match the Requirements progress bar's denominator: that bar counts *subcontrols* (`countSubControlsEUByProjectId`), and the demo project has 39 subcontrols, 20 Done, spread across those same 24 controls. The two numbers are meant to differ. Also expect `avg_score` to no longer be 15. Cross-check one control: a control whose subcontrols are all Done must have `requirements_score = 100`.

- [ ] **Step 10: Commit**

```bash
git add Servers/controllers/readiness.ctrl.ts
git commit -m "feat(readiness): compute scores from requirements, assessments and evidence"
```

---

### Task 6: Update the advisor query, frontend types and docs

**Files:**
- Modify: `Servers/advisor/functions/readinessFunctions.ts:200-205`
- Modify: `Clients/src/domain/interfaces/i.readiness.ts`
- Create: `docs/technical/domains/readiness.md`
- Modify: `CLAUDE.md` (Detailed References table)

**Interfaces:**
- Consumes: the columns from Task 1 and the scores written in Task 5.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the requirements score to the advisor's recommendation query**

In `generateRecommendations`, change the SELECT list from

```sql
         control_id, overall_score, readiness_level,
         evidence_quality_score, evidence_count_score,
         evidence_recency_score, task_completion_score,
         risk_mitigation_score, recommendations
```

to

```sql
         control_id, overall_score, readiness_level,
         requirements_score, evidence_quality_score,
         evidence_count_score, evidence_recency_score,
         task_completion_score, risk_mitigation_score, recommendations
```

Leave `checkTaskCompletion` and `analyzeRiskStatus` untouched: they remain useful context for the assistant even though they no longer feed the score.

- [ ] **Step 2: Update the frontend types**

In `Clients/src/domain/interfaces/i.readiness.ts`, add `requirements_score: number | null;` to `ControlReadinessScore` (keep `task_completion_score` and `risk_mitigation_score`, which are still returned and now null), and add to `FrameworkReadinessScore`:

```typescript
  controls_avg_score: number | null;
  assessment_score: number | null;
```

- [ ] **Step 3: Verify both builds**

Run: `cd Servers && npx tsc --noEmit`
Expected: PASS.

Run: `cd Clients && npx tsc --noEmit -p tsconfig.app.json && npm run build`
Expected: PASS. (`tsconfig.json` at the Clients root has `files: []` and checks nothing — always use `tsconfig.app.json`.)

- [ ] **Step 4: Document the formula**

Create `docs/technical/domains/readiness.md`:

```markdown
# Readiness Scoring

> **Last Updated:** 2026-07-28

Readiness answers "how close is this use case to passing an audit for this
framework". It is computed in two layers.

## Layer 1 — control score

| Component | Weight | Source |
|---|---|---|
| `requirements_score` | 0.50 | share of the control's requirement rows that are complete |
| `evidence_quality_score` | 0.20 | `evidence_ai_analysis.overall_quality_grade` average |
| `evidence_count_score` | 0.15 | `normalizeEvidenceCount` over linked files |
| `evidence_recency_score` | 0.15 | `normalizeRecency` over the newest linked file |

Requirement completion matches each framework's own progress bar, so the two can
never disagree:

- **EU AI Act** — `subcontrols_eu.status = 'Done'` / total, for the `controls_eu`
  row matching this control and project framework.
- **ISO 42001** — `annexcategories_iso.status = 'Implemented'` → 100, else 0.

## Control set

Only controls the project is required to implement are scored:

- **EU AI Act** — categories returned by `getVisibleEuCategoryIdsForProject`,
  which filters by the project's risk tier and role.
- **ISO 42001** — annex categories with `is_applicable = true`.
- **Organization-wide** — the union across every project framework of that type;
  a control's score is `SUM(done) / SUM(total)` across them.

## Layer 2 — framework score

- **EU AI Act:** `controls_avg × 0.70 + assessment_completion × 0.30`, where
  assessment completion is `answers_eu.status = 'Done'` / total.
- **ISO 42001, or any scope with no assessment questions:** `controls_avg`. The
  weight is renormalized, not scored as zero — otherwise such a framework could
  never exceed 70. `assessment_score` is stored as NULL in that case. Questions
  that exist but are unanswered are a real zero.

`framework_readiness_scores.avg_score` holds the blended layer-2 number;
`controls_avg_score` holds the layer-1 average. The heat map and weakest-controls
list show layer 1; the headline score, trend chart and history show layer 2.

## Levels

`ready ≥ 80`, `needs_work ≥ 60`, `at_risk ≥ 30`, otherwise `not_started`.

## Retired inputs

`task_completion_score` and `risk_mitigation_score` no longer feed the score.
Their columns remain (written as NULL) because the advisor's
`generateRecommendations` selects them. Both were derived from an incidental
relationship — a task or risk sharing a file with the control — not a governance
one.

## Key files

| Purpose | Path |
|---|---|
| Formula and weights | `Servers/advisor/scoring/readinessCalculator.ts` |
| Calculation pipeline | `Servers/controllers/readiness.ctrl.ts` |
| Queries and persistence | `Servers/utils/readiness.utils.ts` |
| UI | `Clients/src/presentation/pages/ReadinessDashboard/` |
```

- [ ] **Step 5: Link the doc from CLAUDE.md**

In the Detailed References table in `CLAUDE.md`, add a row after the AI Trust Index row:

```markdown
| Readiness scoring (requirements + assessments + evidence) | `docs/technical/domains/readiness.md` |
```

Update the "Last Updated" date at the top of `CLAUDE.md` to 2026-07-28.

- [ ] **Step 6: Commit**

```bash
git add Servers/advisor/functions/readinessFunctions.ts Clients/src/domain/interfaces/i.readiness.ts docs/technical/domains/readiness.md CLAUDE.md
git commit -m "docs(readiness): document the two-layer scoring formula"
```

---

## Verification checklist

- [ ] `cd Servers && npm run test:unit` passes
- [ ] `cd Servers && npx tsc --noEmit` passes
- [ ] `cd Clients && npx tsc --noEmit -p tsconfig.app.json` passes
- [ ] `cd Clients && npm run build` passes
- [ ] Readiness `total_controls` for a project equals its count of applicable **controls** (24 for the demo project) — not the Requirements progress-bar denominator, which counts subcontrols (39)
- [ ] Requirement completion per control matches that control's own Done/total subcontrol ratio
- [ ] Marking a requirement Done and recalculating raises that control's score
- [ ] An ISO 42001 framework score can reach 100 (renormalization works)
