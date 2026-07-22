import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { getScansListQuery, getFindingsForScanQuery } from "../../utils/aiDetection.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("aiDetection contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getScansListQuery", () => {
    const ORG_ID = 42;
    const LIMIT = 10;

    beforeEach(() => {
      // Two queries via Promise.all: count then data
      mockQuery
        .mockResolvedValueOnce([[{ total: "3" }], 0] as any)
        .mockResolvedValueOnce([[{ id: 1, organization_id: ORG_ID }], 0] as any);
    });

    it("includes LIMIT and OFFSET in SQL", async () => {
      await getScansListQuery(ORG_ID, 1, LIMIT);

      const calls = mockQuery.mock.calls;
      const dataSql = calls[1][0] as string;
      expect(dataSql).toContain("LIMIT :limit");
      expect(dataSql).toContain("OFFSET :offset");
    });

    it("includes ORDER BY in SQL", async () => {
      await getScansListQuery(ORG_ID, 1, LIMIT);

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain("ORDER BY");
      expect(dataSql).toContain("s.created_at DESC");
    });

    it("filters by organization_id", async () => {
      await getScansListQuery(ORG_ID, 1, LIMIT);

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain("s.organization_id = :organizationId");

      const dataReplacements = (mockQuery.mock.calls[1][1] as any).replacements;
      expect(dataReplacements.organizationId).toBe(ORG_ID);
    });

    it("passes correct limit and offset values", async () => {
      await getScansListQuery(ORG_ID, 3, LIMIT);

      const dataReplacements = (mockQuery.mock.calls[1][1] as any).replacements;
      expect(dataReplacements.limit).toBe(LIMIT);
      expect(dataReplacements.offset).toBe(20); // (page 3 - 1) * 10
    });
  });

  describe("getFindingsForScanQuery", () => {
    const ORG_ID = 42;
    const SCAN_ID = 7;
    const LIMIT = 25;

    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([[{ total: "1" }], 0] as any)
        .mockResolvedValueOnce([[{ id: 1, organization_id: ORG_ID }], 0] as any);
    });

    it("includes LIMIT and OFFSET in SQL", async () => {
      await getFindingsForScanQuery(SCAN_ID, ORG_ID, 1, LIMIT);

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain("LIMIT :limit");
      expect(dataSql).toContain("OFFSET :offset");
    });

    it("includes ORDER BY in SQL", async () => {
      await getFindingsForScanQuery(SCAN_ID, ORG_ID, 1, LIMIT);

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain("ORDER BY");
    });

    it("filters by organization_id and scan_id", async () => {
      await getFindingsForScanQuery(SCAN_ID, ORG_ID, 1, LIMIT);

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain("f.scan_id = :scanId");
      expect(dataSql).toContain("f.organization_id = :organizationId");

      const dataReplacements = (mockQuery.mock.calls[1][1] as any).replacements;
      expect(dataReplacements.organizationId).toBe(ORG_ID);
      expect(dataReplacements.scanId).toBe(SCAN_ID);
    });
  });
});
