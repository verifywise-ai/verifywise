import { upsertRunAnalysisQuery, getRunAnalysesQuery } from "../reportRunAnalysis.utils";
import { sequelize } from "../../database/db";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;

describe("reportRunAnalysis.utils", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[{ id: 1 }], 1]);
  });

  it("upsert targets the unique index and bumps the version in place", async () => {
    const result = await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "executiveSummary",
      organization_id: 5,
      payload: { summary: "x" },
      analysis_model: "gpt-4o-mini",
      analyzed_by: 3,
      audit_metadata: { analyzer_version: "report-analyzer-v1" },
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("ON CONFLICT (report_run_id, section_key, organization_id)");
    expect(sql).toContain("analysis_version = report_run_analyses.analysis_version + 1");
    expect(sql).toContain("analyzed_at = NOW()");
    expect(result).toEqual({ id: 1 });
  });

  // Names what this actually proves: sequelize is mocked, so this verifies the
  // ownership gate is present in the SQL, not that Postgres enforces refusal.
  it("upsert SQL gates the write on run/org ownership", async () => {
    await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "executiveSummary",
      organization_id: 5,
      payload: {},
      analysis_model: null,
      analyzed_by: null,
      audit_metadata: null,
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE EXISTS");
    expect(sql).toContain("FROM report_runs");
    expect(sql).toContain("id = :report_run_id AND organization_id = :organization_id");
  });

  it("upsert returns undefined when the tenant guard writes no row", async () => {
    mockQuery.mockResolvedValue([[], 0]);

    const result = await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "executiveSummary",
      organization_id: 999,
      payload: {},
      analysis_model: null,
      analyzed_by: null,
      audit_metadata: null,
    });

    expect(result).toBeUndefined();
  });

  it("upsert passes organization_id through as a replacement", async () => {
    await upsertRunAnalysisQuery({
      report_run_id: 7,
      section_key: "keyFindings",
      organization_id: 5,
      payload: {},
      analysis_model: null,
      analyzed_by: null,
      audit_metadata: null,
    });

    expect(mockQuery.mock.calls[0][1].replacements.organization_id).toBe(5);
  });

  it("get filters by organization_id", async () => {
    mockQuery.mockResolvedValue([[{ id: 1, section_key: "executiveSummary" }], 1]);
    const rows = await getRunAnalysesQuery(7, 5);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("organization_id = :organization_id");
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      report_run_id: 7,
      organization_id: 5,
    });
    expect(rows).toEqual([{ id: 1, section_key: "executiveSummary" }]);
  });
});
