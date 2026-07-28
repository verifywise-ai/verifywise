const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { listRunsQuery } from "./reportRun.utils";

describe("listRunsQuery archived filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // count query, then rows query
    mockQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
  });

  it("returns only live runs when archived is false", async () => {
    await listRunsQuery(1, { archived: false });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("archived_at IS NULL");
    expect(countSql).not.toContain("archived_at IS NOT NULL");
  });

  it("returns only archived runs when archived is true", async () => {
    await listRunsQuery(1, { archived: true });

    expect(mockQuery.mock.calls[0][0]).toContain("archived_at IS NOT NULL");
  });

  it("does not filter on archived when the flag is omitted", async () => {
    await listRunsQuery(1, {});

    expect(mockQuery.mock.calls[0][0]).not.toContain("archived_at");
  });

  it("always scopes by organization", async () => {
    await listRunsQuery(7, { archived: false });

    expect(mockQuery.mock.calls[0][0]).toContain("organization_id = :organization_id");
    expect((mockQuery.mock.calls[0][1] as any).replacements.organization_id).toBe(7);
  });
});
