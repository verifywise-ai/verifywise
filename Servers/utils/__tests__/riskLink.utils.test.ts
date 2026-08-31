import { QueryTypes } from "sequelize";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  getRiskLinksForRiskQuery,
  getRiskScoringRowsQuery,
  getIncidentLinksQuery,
  getStructuralNeighboursQuery,
  getConfirmedHierarchyEdgesQuery,
  getSharedProjectCandidatesQuery,
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

  it("filters by organization on every UNION arm and on the risks join", async () => {
    await getStructuralNeighboursQuery(7, 42);
    const [sql, options] = mockQuery.mock.calls[0];
    // Ten UNION arms plus the risks join. Drop any single one and this goes red.
    expect(sql.match(/organization_id = :organizationId/g)).toHaveLength(11);
    expect(sql).toContain("r.is_deleted = false");
    expect(options.replacements).toEqual({ organizationId: 7, riskId: 42 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("computes degrees from the filtered set, not from the raw links", async () => {
    await getStructuralNeighboursQuery(7, 42);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("COUNT(*) AS degree");
    // Rarity is a property of this org's own graph (spec §6). Counting over
    // element_links instead would include soft-deleted risks.
    expect(sql.slice(sql.indexOf("degrees AS"))).toContain("FROM active");
  });

  it("coerces the bigint degree that pg hands back as a string", async () => {
    mockQuery.mockResolvedValue([
      { target_risk_id: 3, element_key: "eu_control:412", degree: "3" },
    ]);
    const [row] = await getStructuralNeighboursQuery(7, 42);
    // Math.log2(1 + "3") is Math.log2("13") — wrong, and no type error anywhere.
    expect(row.degree).toBe(3);
    expect(typeof row.degree).toBe("number");
  });

  it("loads only confirmed inherits_from edges touching either endpoint", async () => {
    await getConfirmedHierarchyEdgesQuery(7, 4, { id: 9, entityType: "risk" });
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("relation_type = 'inherits_from'");
    expect(sql).toContain("status = 'confirmed'");
    expect(sql).toContain("source_risk_id IN (:childRiskId, :parentRiskId)");
    expect(sql).toContain("target_risk_id IN (:childRiskId, :parentRiskId)");
    expect(options.replacements).toEqual({
      organizationId: 7,
      childRiskId: 4,
      parentRiskId: 9,
      parentModelRiskId: null,
      parentVendorRiskId: null,
    });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("maps source to child and target to parent, not the other way round", async () => {
    // Getting this backwards inverts every hierarchy check silently, so it is
    // asserted rather than left to the column names.
    mockQuery.mockResolvedValue([{ source_risk_id: 4, target_risk_id: 9 }]);
    const edges = await getConfirmedHierarchyEdgesQuery(7, 4, { id: 9, entityType: "risk" });
    expect(edges).toEqual([{ childRiskId: 4, parentRiskId: 9, parentEntityType: "risk" }]);
  });

  it("groups repeated rows for one candidate into a single entry", async () => {
    mockQuery.mockResolvedValue([
      { entity_type: "vendor_risk", id: 12, project_title: "Fraud Detection" },
      { entity_type: "vendor_risk", id: 12, project_title: "KYC" },
      { entity_type: "model_risk", id: 7, project_title: "Fraud Detection" },
    ]);

    expect(await getSharedProjectCandidatesQuery(3, 99)).toEqual([
      { entityType: "vendor_risk", id: 12, projects: ["Fraud Detection", "KYC"] },
      { entityType: "model_risk", id: 7, projects: ["Fraud Detection"] },
    ]);
  });

  it("scopes both branches and the subject risk to the org", async () => {
    await getSharedProjectCandidatesQuery(3, 99);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("vr.organization_id = :organizationId");
    expect(sql).toContain("mr.organization_id = :organizationId");
    expect(sql).toContain("subject.organization_id = :organizationId");
    expect(options.replacements).toEqual({ organizationId: 3, riskId: 99 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("keeps DISTINCT on the model branch so one model is not repeated per framework", async () => {
    await getSharedProjectCandidatesQuery(3, 99);
    expect(mockQuery.mock.calls[0][0]).toContain("SELECT DISTINCT 'model_risk'");
  });
});
