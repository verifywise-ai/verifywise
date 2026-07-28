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
  upsertControlScoreQuery,
  upsertFrameworkScoreQuery,
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

  it("treats untriaged (is_applicable IS NULL) annex categories as applicable, not excluded", async () => {
    // A real (non-demo) ISO 42001 project inserts every annexcategories_iso
    // row with is_applicable = NULL (utils/iso42001.utils.ts createNewAnnexeCategoriesQuery),
    // not the column's own DEFAULT false. If the query excluded NULL rows the
    // same way it excludes explicit is_applicable = false rows, a fresh
    // project would return an empty control list instead of a zero-scored one.
    mockQuery.mockResolvedValueOnce([[{ id: 12 }]]);
    mockQuery.mockResolvedValueOnce([
      [{ control_id: 5, total: "3", done: "0" }], // untriaged rows counted, none Implemented yet
    ]);

    const result = await getApplicableControlsWithRequirementsQuery("iso_42001", 1, 7);

    expect(result).toEqual([{ control_id: 5, requirements_score: 0 }]);

    const sql = mockQuery.mock.calls[1][0];
    expect(sql).toContain("is_applicable IS NULL");
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
