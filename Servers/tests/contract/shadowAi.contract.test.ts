import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { getUserActivityQuery } from "../../utils/shadowAiInsights.utils";
import { getAllToolsQuery } from "../../utils/shadowAiTools.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("shadowAi contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserActivityQuery", () => {
    const ORG_ID = 55;

    beforeEach(() => {
      // Sequential: data query first, then count query
      mockQuery
        .mockResolvedValueOnce([[{ user_email: "a@test.com" }], 0] as any)
        .mockResolvedValueOnce([[{ total: "1" }], 0] as any);
    });

    it("includes LIMIT and OFFSET in SQL", async () => {
      await getUserActivityQuery(ORG_ID, { limit: 10 });

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("LIMIT :limit");
      expect(dataSql).toContain("OFFSET :offset");
    });

    it("includes ORDER BY in SQL", async () => {
      await getUserActivityQuery(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("ORDER BY");
      expect(dataSql).toContain("total_prompts DESC");
    });

    it("filters by organization_id", async () => {
      await getUserActivityQuery(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("e.organization_id = :organizationId");

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.organizationId).toBe(ORG_ID);
    });

    it("passes correct limit and offset values", async () => {
      await getUserActivityQuery(ORG_ID, { page: 3, limit: 10 });

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.limit).toBe(10);
      expect(dataReplacements.offset).toBe(20); // (3 - 1) * 10
    });
  });

  describe("getAllToolsQuery", () => {
    const ORG_ID = 55;

    beforeEach(() => {
      // Sequential: data query first, then count query
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, name: "tool1" }], 0] as any)
        .mockResolvedValueOnce([[{ total: "1" }], 0] as any);
    });

    it("includes LIMIT and OFFSET in SQL", async () => {
      await getAllToolsQuery(ORG_ID, { limit: 10 });

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("LIMIT :limit");
      expect(dataSql).toContain("OFFSET :offset");
    });

    it("includes ORDER BY in SQL", async () => {
      await getAllToolsQuery(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("ORDER BY");
      expect(dataSql).toContain("last_seen_at DESC");
    });

    it("filters by organization_id", async () => {
      await getAllToolsQuery(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("organization_id = :organizationId");

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.organizationId).toBe(ORG_ID);
    });

    it("passes correct limit and offset values", async () => {
      await getAllToolsQuery(ORG_ID, { page: 2, limit: 15 });

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.limit).toBe(15);
      expect(dataReplacements.offset).toBe(15); // (2 - 1) * 15
    });
  });
});
