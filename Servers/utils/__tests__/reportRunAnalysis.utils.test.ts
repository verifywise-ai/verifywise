import {
  upsertRunAnalysisQuery,
  getRunAnalysesQuery,
  getPriorFactsSnapshotQuery,
} from "../reportRunAnalysis.utils";
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

  it("prior facts lookup scopes to the schedule and filters organization_id on BOTH tables", async () => {
    const stored = {
      generatedAt: "2026-06-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 41 } },
    };
    mockQuery.mockResolvedValue([[{ facts: stored }], 1]);

    const facts = await getPriorFactsSnapshotQuery(12, 5);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("FROM report_run_analyses ra");
    expect(sql).toContain("JOIN report_runs r ON r.id = ra.report_run_id");
    expect(sql).toContain("r.scheduled_report_id = :scheduled_report_id");
    // Both sides. A filter on only the joined table is the shape that leaks
    // the moment somebody rewrites the join.
    expect(sql).toContain("r.organization_id = :organization_id");
    expect(sql).toContain("ra.organization_id = :organization_id");
    expect(sql).toContain("ORDER BY ra.analyzed_at DESC");
    expect(sql).toContain("LIMIT 1");
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      scheduled_report_id: 12,
      organization_id: 5,
    });
    expect(facts).toEqual(stored);
  });

  it("prior facts lookup returns null when no earlier run stored one", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    expect(await getPriorFactsSnapshotQuery(12, 5)).toBeNull();
  });

  it("prior facts lookup skips rows whose audit_metadata carries no facts key", async () => {
    mockQuery.mockResolvedValue([[{ facts: null }], 1]);
    expect(await getPriorFactsSnapshotQuery(12, 5)).toBeNull();
    expect(mockQuery.mock.calls[0][0] as string).toContain(
      "ra.audit_metadata -> 'facts' IS NOT NULL",
    );
  });
});
