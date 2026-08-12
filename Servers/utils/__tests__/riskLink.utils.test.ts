import { QueryTypes } from "sequelize";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  getRiskLinksForRiskQuery,
  getRiskScoringRowsQuery,
  getIncidentLinksQuery,
} from "../riskLink.utils";

const mockQuery = sequelize.query as jest.Mock;

describe("riskLink.utils", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  it("scopes the scoring rows to the org and skips soft-deleted risks", async () => {
    await getRiskScoringRowsQuery(7);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("r.organization_id = :organizationId");
    expect(sql).toContain("r.is_deleted = false");
    expect(options.replacements).toEqual({ organizationId: 7 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("casts risk_category to text[] so pg returns a JS array", async () => {
    await getRiskScoringRowsQuery(7);
    expect(mockQuery.mock.calls[0][0]).toContain("r.risk_category::text[]");
  });

  it("coerces the projects aggregate when pg hands back a string", async () => {
    mockQuery.mockResolvedValue([
      { id: 1, risk_category: null, controls_mapping: null, assessment_mapping: null, ai_lifecycle_phase: null, projects: "[3,4]" },
    ]);
    const rows = await getRiskScoringRowsQuery(7);
    expect(rows[0].projects).toEqual([3, 4]);
  });

  it("scopes incident links to the org and to both endpoints", async () => {
    await getIncidentLinksQuery(7, 42);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("source_risk_id = :riskId OR target_risk_id = :riskId");
    expect(options.replacements).toEqual({ organizationId: 7, riskId: 42 });
  });

  it("filters soft-deleted risks on BOTH endpoints when reading a risk's links", async () => {
    await getRiskLinksForRiskQuery(7, 42, ["suggested", "confirmed"]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("related.is_deleted = false");
    expect(sql).toContain("subject.is_deleted = false");
    expect(sql).toContain("l.organization_id = :organizationId");
    expect(options.replacements.statuses).toEqual(["suggested", "confirmed"]);
  });

  it("coerces the NUMERIC score to a number and reasons to an array", async () => {
    mockQuery.mockResolvedValue([
      {
        id: 1, source_risk_id: 3, target_risk_id: 42, relation_type: "related_to",
        status: "suggested", source: "derived", score: "5.000",
        reasons: '[{"signal":"shared_category","weight":3}]',
        decided_at: null, last_computed_at: null,
        related_id: 3, related_risk_name: "R", related_risk_level: "High risk", related_risk_owner: null,
      },
    ]);
    const [link] = await getRiskLinksForRiskQuery(7, 42, ["suggested"]);
    expect(link.score).toBe(5);
    expect(link.reasons).toEqual([{ signal: "shared_category", weight: 3 }]);
  });
});
