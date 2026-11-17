/**
 * @fileoverview Guards that archived (soft-deleted) risks are excluded from
 * the counts, reports and framework control panels that read `risks`, and that
 * the post-market monitoring snapshot counts risks through projects_risks.
 *
 * @module utils/__tests__/archivedRisksExcluded
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../eu.utils", () => ({
  getVisibleEuCategoryIdsForProject: jest.fn().mockResolvedValue([1]),
}));

import { sequelize } from "../../database/db";
import { getProjectRisksReportQuery } from "../reporting.utils";
import { calculateProjectRisks } from "../project.utils";
import { getSubClauseRisksQuery, getAnnexCategoryRisksQuery } from "../iso42001.utils";
import { getNISTAIRMFSubcategoryRisksQuery } from "../nist_ai_rmf.subcategory.utils";
import { getContextSnapshotQuery } from "../postMarketMonitoring.utils";

const mockQuery = sequelize.query as jest.Mock;

const lastSql = (): string => String(mockQuery.mock.calls[mockQuery.mock.calls.length - 1][0]);

describe("archived risks are excluded", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[], 0]);
  });

  it("from the use-case risk report", async () => {
    await getProjectRisksReportQuery(1, 10);
    expect(lastSql()).toContain("risk.is_deleted = false");
  });

  it("from the use-case risk totals", async () => {
    await calculateProjectRisks(1, 10);
    expect(lastSql()).toContain("r.is_deleted = false");
  });

  it("from ISO 42001 subclause and annex category risks", async () => {
    await getSubClauseRisksQuery(1, 10);
    expect(lastSql()).toContain("pr.is_deleted = false");
    await getAnnexCategoryRisksQuery(1, 10);
    expect(lastSql()).toContain("pr.is_deleted = false");
  });

  it("from NIST AI RMF subcategory risks", async () => {
    await getNISTAIRMFSubcategoryRisksQuery(1, 10);
    expect(lastSql()).toContain("pr.is_deleted = false");
  });
});

describe("getContextSnapshotQuery risk counts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("counts risks through projects_risks and parses the buckets", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ project_title: "P", status: "Active" }], 1])
      .mockResolvedValueOnce([
        [{ total: "6", high_count: "3", medium_count: "2", low_count: "1" }],
        1,
      ])
      .mockResolvedValue([[{ total: "0" }], 1]);

    const snapshot = await getContextSnapshotQuery(1, 10);

    const riskSql = String(mockQuery.mock.calls[1][0]);
    expect(riskSql).toContain("JOIN projects_risks pr");
    expect(riskSql).toContain("pr.project_id = :projectId");
    expect(riskSql).toContain("r.is_deleted = false");
    expect(riskSql).toContain("r.organization_id = :organizationId");
    expect(riskSql).toContain("COUNT(DISTINCT r.id)");
    expect(riskSql).not.toMatch(/risks\s+WHERE[^;]*\bproject_id = :projectId/);
    expect(riskSql).not.toContain("risk_severity");

    expect(snapshot.high_risk_count).toBe(3);
    expect(snapshot.medium_risk_count).toBe(2);
    expect(snapshot.low_risk_count).toBe(1);
  });

  it("counts models through their use case links and skips archived model and vendor risks", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ project_title: "P", status: "Active" }], 1])
      .mockResolvedValueOnce([
        [{ total: "0", high_count: "0", medium_count: "0", low_count: "0" }],
        1,
      ])
      .mockResolvedValue([[{ total: "0" }], 1]);

    await getContextSnapshotQuery(1, 10);

    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    const find = (pattern: RegExp): string => {
      const sql = sqls.find((q) => pattern.test(q));
      if (!sql) throw new Error(`no snapshot query matches ${pattern}`);
      return sql;
    };
    const modelSql = find(/COUNT\(DISTINCT mi\.id\)/);
    const modelRiskSql = find(/FROM model_risks/);
    const vendorRiskSql = find(/FROM vendorrisks/);
    for (const sql of [modelSql, modelRiskSql]) {
      expect(sql).toContain("JOIN model_inventories_projects_frameworks mpf");
      expect(sql).toContain("mpf.project_id = :projectId");
      expect(sql).toContain("mpf.framework_id IS NULL");
      expect(sql).not.toContain("mi.project_id");
      expect(sql).not.toMatch(/model_inventories\s+WHERE[^;]*\bproject_id/);
    }
    expect(modelRiskSql).toContain("mr.is_deleted = false");
    expect(vendorRiskSql).toContain("vr.is_deleted = false");
  });
});
