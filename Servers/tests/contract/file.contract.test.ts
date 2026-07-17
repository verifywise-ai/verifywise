import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../utils/files/attachLinkProjections", () => ({
  attachLinkProjections: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { getOrganizationFiles } from "../../repositories/file.repository";
import { attachLinkProjections } from "../../utils/files/attachLinkProjections";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockAttachLinkProjections = attachLinkProjections as jest.MockedFunction<
  typeof attachLinkProjections
>;

describe("file contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOrganizationFiles", () => {
    const ORG_ID = 33;

    beforeEach(() => {
      // Sequential: main query first, then count query
      mockQuery
        .mockResolvedValueOnce([[{ id: 1, filename: "doc.pdf" }], 0] as any)
        .mockResolvedValueOnce([[{ count: "2" }], 0] as any);
      mockAttachLinkProjections.mockResolvedValue(undefined);
    });

    it("includes LIMIT in SQL", async () => {
      await getOrganizationFiles(ORG_ID, { limit: 10 });

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("LIMIT :limit");
    });

    it("includes ORDER BY in SQL", async () => {
      await getOrganizationFiles(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("ORDER BY f.uploaded_time DESC, f.id DESC");
    });

    it("filters by organization_id", async () => {
      await getOrganizationFiles(ORG_ID);

      const dataSql = mockQuery.mock.calls[0][0] as string;
      expect(dataSql).toContain("f.organization_id = :organizationId");

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.organizationId).toBe(ORG_ID);
    });

    it("count query also filters by organization_id", async () => {
      await getOrganizationFiles(ORG_ID);

      const countSql = mockQuery.mock.calls[1][0] as string;
      expect(countSql).toContain("organization_id = :organizationId");

      const countReplacements = (mockQuery.mock.calls[1][1] as any).replacements;
      expect(countReplacements.organizationId).toBe(ORG_ID);
    });

    it("passes clamped limit to query", async () => {
      await getOrganizationFiles(ORG_ID, { limit: 50 });

      const dataReplacements = (mockQuery.mock.calls[0][1] as any).replacements;
      expect(dataReplacements.limit).toBe(50);
    });

    it("calls attachLinkProjections for link enrichment", async () => {
      await getOrganizationFiles(ORG_ID);

      expect(mockAttachLinkProjections).toHaveBeenCalledWith(ORG_ID, expect.any(Array));
    });
  });
});
