import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the DB layer so we can inspect the SQL each repository function issues.
const mockQuery = jest.fn<any>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { getFileWithMetadata } from "../file.repository";

describe("file.repository — getFileWithMetadata", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([{ id: 1, organization_id: 1 }]);
  });

  // Guards the regression fixed in PR #4192: the controller's org-access check
  // reads file.organization_id, so this query MUST project it. It is an explicit
  // SELECT list (not SELECT *), so dropping the column silently re-breaks the
  // metadata endpoint with a 403 for every org-level file. A controller test
  // can't catch this because it mocks the repository.
  it("projects organization_id in the SELECT list so the access check can read it", async () => {
    await getFileWithMetadata(1, 1);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = (mockQuery.mock.calls[0] as any[])[0] as string;
    // Scope the assertion to the SELECT projection (between SELECT and FROM).
    // f.organization_id also appears in the JOIN/WHERE clauses, so matching the
    // whole query would pass even when the column is dropped from the SELECT —
    // which is exactly the regression this guards against.
    const selectList = sql.slice(sql.search(/\bSELECT\b/i), sql.search(/\bFROM\b/i));
    expect(selectList).toMatch(/\bf\.organization_id\b/);
  });

  it("scopes the lookup to the caller's organization and file id", async () => {
    await getFileWithMetadata(42, 7);

    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toMatch(
      /WHERE\s+f\.organization_id\s*=\s*:organizationId\s+AND\s+f\.id\s*=\s*:fileId/,
    );
    expect(options.replacements).toMatchObject({ organizationId: 7, fileId: 42 });
  });
});
