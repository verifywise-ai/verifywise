import { findControlCoverage, MAX_COVERAGE_ROWS } from "../coverage";
import { getCoverageScanRowsQuery, CoverageScanRow } from "../../../utils/riskLink.utils";

jest.mock("../../../utils/riskLink.utils", () => ({
  getCoverageScanRowsQuery: jest.fn(),
}));

const mockQuery = getCoverageScanRowsQuery as jest.Mock;

const row = (overrides: Partial<CoverageScanRow> & { id: number }): CoverageScanRow => ({
  risk_name: "Risk",
  risk_owner: 5,
  risk_level: "High risk",
  mitigation_status: "In Progress",
  control_link_count: 0,
  assessment_link_count: 0,
  project_count: 1,
  framework_project_count: 0,
  projects: [{ id: 11, name: "P", has_framework: false }],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("findControlCoverage", () => {
  it("marks a risk with a control-side link covered and lists it nowhere", async () => {
    mockQuery.mockResolvedValue([row({ id: 1, control_link_count: 2 })]);

    const report = await findControlCoverage(1);

    expect(report.summary).toEqual({
      total_active_risks: 1,
      covered: 1,
      gap: 0,
      no_framework: 0,
    });
    expect(report.gaps).toHaveLength(0);
    expect(report.no_framework).toHaveLength(0);
    expect(report.truncated).toBe(false);
  });

  it("marks an unmapped risk in a framework project as gap", async () => {
    mockQuery.mockResolvedValue([
      row({
        id: 1,
        framework_project_count: 1,
        projects: [{ id: 11, name: "P", has_framework: true }],
      }),
    ]);

    const report = await findControlCoverage(1);

    expect(report.summary.gap).toBe(1);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].id).toBe(1);
    expect(report.no_framework).toHaveLength(0);
  });

  it("marks an unmapped risk with no framework anywhere as no_framework, not gap", async () => {
    mockQuery.mockResolvedValue([row({ id: 1 })]);

    const report = await findControlCoverage(1);

    expect(report.summary).toMatchObject({ gap: 0, no_framework: 1 });
    expect(report.gaps).toHaveLength(0);
    expect(report.no_framework).toHaveLength(1);
    expect(report.no_framework[0].id).toBe(1);
  });

  it("an assessment-only link never counts as coverage", async () => {
    mockQuery.mockResolvedValue([
      row({
        id: 1,
        control_link_count: 0,
        assessment_link_count: 1,
        framework_project_count: 1,
        projects: [{ id: 11, name: "P", has_framework: true }],
      }),
    ]);

    const report = await findControlCoverage(1);

    expect(report.summary).toMatchObject({ covered: 0, gap: 1 });
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].assessment_link_count).toBe(1);
  });

  it("one framework among several projects still makes a gap", async () => {
    mockQuery.mockResolvedValue([
      row({
        id: 1,
        project_count: 2,
        framework_project_count: 1,
        projects: [
          { id: 11, name: "Plain", has_framework: false },
          { id: 12, name: "Framed", has_framework: true },
        ],
      }),
    ]);

    const report = await findControlCoverage(1);

    expect(report.summary).toMatchObject({ gap: 1, no_framework: 0 });
    expect(report.gaps).toHaveLength(1);
  });

  it("caps the lists but counts every row in the summary", async () => {
    mockQuery.mockResolvedValue(
      Array.from({ length: MAX_COVERAGE_ROWS + 1 }, (_, i) =>
        row({
          id: i + 1,
          framework_project_count: 1,
          projects: [{ id: 11, name: "P", has_framework: true }],
        }),
      ),
    );

    const report = await findControlCoverage(1);

    expect(report.summary).toEqual({
      total_active_risks: MAX_COVERAGE_ROWS + 1,
      covered: 0,
      gap: MAX_COVERAGE_ROWS + 1,
      no_framework: 0,
    });
    expect(report.gaps).toHaveLength(MAX_COVERAGE_ROWS);
    expect(report.truncated).toBe(true);
  });
});
