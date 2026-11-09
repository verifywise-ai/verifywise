const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { assignFilesToFolderQuery } from "../virtualFolder.utils";
import { BIAS_AUDIT_STANCE_SOURCE } from "../files/visibleFiles";

beforeEach(() => mockQuery.mockReset().mockResolvedValue([{ id: 1 }]));

describe("assignFilesToFolderQuery", () => {
  it("selects the rows from visible files in the organization", async () => {
    await expect(assignFilesToFolderQuery(5, 2, [7, 8], 9)).resolves.toBe(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("FROM files f");
    expect(sql).toContain("f.organization_id = :organizationId");
    expect(sql).toContain("f.id IN (:fileIds)");
    expect(sql).toContain("source IS DISTINCT FROM :stanceSource");
    expect(opts.replacements).toMatchObject({
      organizationId: 5,
      folderId: 2,
      userId: 9,
      fileIds: [7, 8],
      stanceSource: BIAS_AUDIT_STANCE_SOURCE,
    });
  });

  it("does nothing for an empty list", async () => {
    await expect(assignFilesToFolderQuery(5, 2, [], 9)).resolves.toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
