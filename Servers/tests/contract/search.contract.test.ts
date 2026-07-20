import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { wiseSearch, SEARCH_CONSTANTS } from "../../utils/search.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("search contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Mock implementation that routes based on SQL content:
   * - projects_members → user project IDs
   * - vendors_projects → user vendor IDs
   * - SELECT DISTINCT * → entity search results
   */
  function setupSearchMocks(rows: Record<string, any>[] = [{ id: 1, name: "test" }]) {
    mockQuery.mockImplementation(async (sql: any) => {
      const sqlStr = typeof sql === "string" ? sql : "";
      if (sqlStr.includes("projects_members")) {
        return [[{ project_id: 1 }], 0] as any;
      }
      if (sqlStr.includes("vendors_projects")) {
        return [[{ vendor_id: 1 }], 0] as any;
      }
      if (sqlStr.includes("DISTINCT *")) {
        return [rows, 0] as any;
      }
      return [[], 0] as any;
    });
  }

  /** Entity search queries use "DISTINCT * FROM"; access lookups use "DISTINCT vendor_id" or "project_id" */
  function getEntityCalls() {
    return mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("DISTINCT *"),
    );
  }

  it("each entity query includes LIMIT", async () => {
    setupSearchMocks();

    await wiseSearch({
      query: "test search query",
      organizationId: 42,
      userId: 1,
      limit: 15,
    });

    const entityCalls = getEntityCalls();

    expect(entityCalls.length).toBeGreaterThan(0);
    for (const call of entityCalls) {
      const sql = call[0] as string;
      expect(sql).toContain("LIMIT :limit");
    }
  });

  it("each entity query includes ORDER BY", async () => {
    setupSearchMocks();

    await wiseSearch({
      query: "test search query",
      organizationId: 42,
      userId: 1,
    });

    const entityCalls = getEntityCalls();

    for (const call of entityCalls) {
      const sql = call[0] as string;
      expect(sql).toContain("ORDER BY id ASC");
    }
  });

  it("each entity query filters by organization_id", async () => {
    setupSearchMocks();

    await wiseSearch({
      query: "test search query",
      organizationId: 42,
      userId: 1,
    });

    const entityCalls = getEntityCalls();

    for (const call of entityCalls) {
      const sql = call[0] as string;
      expect(sql).toContain("organization_id = :organizationId");

      const replacements = (call[1] as any).replacements;
      expect(replacements.organizationId).toBe(42);
    }
  });

  it("limits search pattern to MAX_LIMIT", async () => {
    setupSearchMocks();

    await wiseSearch({
      query: "test search query",
      organizationId: 42,
      userId: 1,
      limit: 500,
    });

    const entityCalls = getEntityCalls();

    for (const call of entityCalls) {
      const replacements = (call[1] as any).replacements;
      expect(replacements.limit).toBe(SEARCH_CONSTANTS.MAX_LIMIT);
    }
  });

  it("includes ILIKE search pattern when query provided", async () => {
    setupSearchMocks();

    await wiseSearch({
      query: "test search query",
      organizationId: 42,
      userId: 1,
    });

    const entityCalls = getEntityCalls();

    const hasIlike = entityCalls.some(
      (c) => typeof c[0] === "string" && c[0].includes("ILIKE :searchPattern"),
    );
    expect(hasIlike).toBe(true);

    const firstEntityCall = entityCalls[0];
    const replacements = (firstEntityCall[1] as any).replacements;
    expect(replacements.searchPattern).toMatch(/^%.+%$/);
  });

  it("returns empty for queries shorter than MIN_QUERY_LENGTH", async () => {
    setupSearchMocks();

    const result = await wiseSearch({
      query: "ab",
      organizationId: 42,
      userId: 1,
    });

    expect(result).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
