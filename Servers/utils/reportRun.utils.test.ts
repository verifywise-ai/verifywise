const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { listRunsQuery, setRunArchivedQuery, deleteRunQuery } from "./reportRun.utils";

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

describe("setRunArchivedQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stamps archived_at and archived_by, scoped to the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, archived_at: "2026-07-28" }]);

    const row = await setRunArchivedQuery(1, 5, true, 3);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("archived_at = NOW()");
    expect(sql).toContain("archived_by = :userId");
    expect(sql).toContain("WHERE id = :id AND organization_id = :organization_id");
    expect((options as any).replacements).toMatchObject({ id: 1, organization_id: 5, userId: 3 });
    expect(row).toEqual({ id: 1, archived_at: "2026-07-28" });
  });

  it("clears both columns when restoring", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, archived_at: null }]);

    await setRunArchivedQuery(1, 5, false, 3);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("archived_at = NULL");
    expect(sql).toContain("archived_by = NULL");
  });

  it("returns null when the run belongs to another organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    expect(await setRunArchivedQuery(1, 999, true, 3)).toBeNull();
  });
});

describe("deleteRunQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes the run's file and then the run, both org-scoped", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: 42 }]); // fetch
    mockQuery.mockResolvedValueOnce([]); // delete file
    mockQuery.mockResolvedValueOnce([]); // delete run

    expect(await deleteRunQuery(1, 5)).toBe(true);

    const fileSql = mockQuery.mock.calls[1][0] as string;
    expect(fileSql).toContain("DELETE FROM files");
    expect(fileSql).toContain("organization_id = :organization_id");
    const runSql = mockQuery.mock.calls[2][0] as string;
    expect(runSql).toContain("DELETE FROM report_runs");
    expect(runSql).toContain("organization_id = :organization_id");
  });

  it("deletes the run alone when it produced no file", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: null }]);
    mockQuery.mockResolvedValueOnce([]);

    expect(await deleteRunQuery(1, 5)).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns false when the run does not belong to the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    expect(await deleteRunQuery(1, 999)).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
