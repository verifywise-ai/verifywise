import { computeProjectCoverage, countFrameworkInventory } from "./governanceCoverage.utils";
import { upsertCoverageCacheQuery } from "./governanceOs.utils";

const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

jest.mock("./governanceOs.utils", () => ({
  upsertCoverageCacheQuery: jest.fn().mockResolvedValue(undefined),
  getCoverageCacheQuery: jest.fn().mockResolvedValue([]),
  deleteCoverageCacheQuery: jest.fn().mockResolvedValue(undefined),
}));

describe("countFrameworkInventory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns count from framework struct tables for known frameworks", async () => {
    mockQuery.mockResolvedValueOnce([[{ cnt: "150" }]]);

    const result = await countFrameworkInventory(1);

    expect(result).toBe(150);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("subcontrols_struct_eu"));
  });

  it("falls back to mapped source identifiers for unknown frameworks", async () => {
    mockQuery.mockResolvedValueOnce([[{ cnt: "7" }]]);

    const result = await countFrameworkInventory(999);

    expect(result).toBe(7);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("governance_control_mappings"), {
      replacements: { frameworkId: 999 },
    });
  });
});

describe("computeProjectCoverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTwoFrameworks = () => {
    // projectFrameworks
    mockQuery.mockResolvedValueOnce([
      [
        { framework_id: 1, framework_name: "EU AI Act" },
        { framework_id: 2, framework_name: "ISO 42001" },
      ],
    ]);
    // Framework queries run in parallel, so use a content-aware mock instead of
    // strict call-order mocks.
    mockQuery.mockImplementation((query: string) => {
      const sql = typeof query === "string" ? query : "";
      if (sql.includes("subcontrols_struct_eu")) {
        return Promise.resolve([[{ cnt: "100" }]]);
      }
      if (sql.includes("subclauses_struct_iso")) {
        return Promise.resolve([[{ cnt: "80" }]]);
      }
      if (sql.includes("COUNT(DISTINCT source_control_identifier)")) {
        return Promise.resolve([[{ mapped: "9" }]]);
      }
      if (sql.includes("HAVING COUNT(DISTINCT target_framework_id) >= 2")) {
        return Promise.resolve([[]]);
      }
      // Gap query: DISTINCT source_control_identifier with NOT IN subquery
      if (sql.includes("SELECT DISTINCT source_control_identifier")) {
        return Promise.resolve([[]]);
      }
      return Promise.resolve([[]]);
    });
  };

  it("returns empty array when project has no frameworks", async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await computeProjectCoverage(1, 1);

    expect(result).toEqual([]);
  });

  it("calculates coverage against framework inventory (not mapped count)", async () => {
    mockTwoFrameworks();

    const result = await computeProjectCoverage(1, 1);

    expect(result).toHaveLength(2);
    expect(result[0].framework_id).toBe(1);
    expect(result[0].total_controls).toBe(100);
    expect(result[0].mapped_controls).toBe(9);
    expect(result[0].coverage_percentage).toBe(9);
    expect(result[0].calculation_methodology).toContain("framework inventory controls");
    expect(upsertCoverageCacheQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 1,
        project_id: 1,
        framework_id: 1,
        total_controls: 100,
        mapped_controls: 9,
        coverage_percentage: 9,
      }),
    );
  });

  it("returns zero coverage when no other frameworks are in the project", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ framework_id: 1, framework_name: "EU AI Act" }]])
      .mockResolvedValueOnce([[{ cnt: "100" }]]);

    const result = await computeProjectCoverage(1, 1);

    expect(result[0].mapped_controls).toBe(0);
    expect(result[0].coverage_percentage).toBe(0);
  });

  it("includes methodology in cache payload", async () => {
    mockTwoFrameworks();

    await computeProjectCoverage(1, 1);

    expect(upsertCoverageCacheQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        calculation_methodology: expect.stringContaining("distinct mapped source identifiers"),
      }),
    );
  });
});
