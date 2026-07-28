const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import { listRunsQuery, setRunArchivedQuery, deleteRunQuery } from "./reportRun.utils";

const ADMIN = { userId: 1, role: "Admin" };
const AUDITOR = { userId: 42, role: "Auditor" };

describe("listRunsQuery archived filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // count query, then rows query
    mockQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
  });

  it("returns only live runs when archived is false", async () => {
    await listRunsQuery(1, { archived: false }, ADMIN);

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("archived_at IS NULL");
    expect(countSql).not.toContain("archived_at IS NOT NULL");
  });

  it("returns only archived runs when archived is true", async () => {
    await listRunsQuery(1, { archived: true }, ADMIN);

    expect(mockQuery.mock.calls[0][0]).toContain("archived_at IS NOT NULL");
  });

  it("does not filter on archived when the flag is omitted", async () => {
    await listRunsQuery(1, {}, ADMIN);

    expect(mockQuery.mock.calls[0][0]).not.toContain("archived_at");
  });

  it("always scopes by organization", async () => {
    await listRunsQuery(7, { archived: false }, ADMIN);

    expect(mockQuery.mock.calls[0][0]).toContain("organization_id = :organization_id");
    expect((mockQuery.mock.calls[0][1] as any).replacements.organization_id).toBe(7);
  });
});

// The legacy Generate list (getGeneratedReportsQuery) restricted a non-Admin to
// `p.owner = :userId OR pm.user_id = :userId`. report_runs has no project
// column, so the rule is reconstructed from the run's project scope —
// config_snapshot.project_id, falling back to the schedule's project_id.
describe("listRunsQuery project-membership visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
  });

  it("does not restrict an Admin", async () => {
    await listRunsQuery(1, { archived: false }, ADMIN);

    expect(mockQuery.mock.calls[0][0]).not.toContain("projects_members");
    expect((mockQuery.mock.calls[0][1] as any).replacements.viewerUserId).toBeUndefined();
  });

  it("does not restrict a SuperAdmin", async () => {
    await listRunsQuery(1, { archived: false }, { userId: 1, role: "SuperAdmin" });

    expect(mockQuery.mock.calls[0][0]).not.toContain("projects_members");
  });

  it.each(["Auditor", "Editor", "Reviewer"])(
    "restricts a %s to the projects they own or belong to",
    async (role) => {
      await listRunsQuery(1, { archived: false }, { userId: 42, role });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain("p.owner = :viewerUserId");
      expect(countSql).toContain("pm.user_id = :viewerUserId");
      expect(countSql).toContain("projects_members");
      expect((mockQuery.mock.calls[0][1] as any).replacements.viewerUserId).toBe(42);
    },
  );

  it("still shows a non-Admin the organization-scoped runs that have no project", async () => {
    await listRunsQuery(1, { archived: false }, AUDITOR);

    // The legacy list inner-joined `projects`, which hid org-scoped reports
    // entirely. The spec calls that a bug: no project means visible to all.
    expect(mockQuery.mock.calls[0][0]).toContain("IS NULL OR EXISTS");
  });

  it("reads the run's project from the snapshot, falling back to the schedule", async () => {
    await listRunsQuery(1, { archived: false }, AUDITOR);

    expect(mockQuery.mock.calls[0][0]).toContain(
      "COALESCE(rr.config_snapshot->>'project_id', sr.project_id::text)",
    );
  });

  it("scopes the membership lookup to the organization too", async () => {
    await listRunsQuery(9, { archived: false }, AUDITOR);

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("pm.organization_id = :organization_id");
    expect(countSql).toContain("p.organization_id = :organization_id");
  });

  it("applies the same restriction to the count as to the rows", async () => {
    await listRunsQuery(1, { archived: false }, AUDITOR);

    // A count that ignored the filter would page the user through rows they
    // are never shown.
    expect(mockQuery.mock.calls[0][0]).toContain("p.owner = :viewerUserId");
    expect(mockQuery.mock.calls[1][0]).toContain("p.owner = :viewerUserId");
  });

  it("shows a viewer with no user id organization-scoped runs only", async () => {
    await listRunsQuery(1, { archived: false }, { userId: null, role: null });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("p.owner = :viewerUserId");
    // NULL matches no owner and no member row, so only the "no project" branch
    // can be true — an unidentifiable viewer never sees a project's report.
    expect((mockQuery.mock.calls[0][1] as any).replacements.viewerUserId).toBeNull();
  });

  it("returns the template name and the run's scope for the list columns", async () => {
    await listRunsQuery(1, { archived: false }, ADMIN);

    const rowsSql = mockQuery.mock.calls[1][0] as string;
    expect(rowsSql).toContain("t.name AS template_name");
    expect(rowsSql).toContain("AS scope_project_id");
    expect(rowsSql).toContain("p.project_title AS scope_project_title");
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
  const TX = { id: "tx" };

  beforeEach(() => {
    jest.clearAllMocks();
    // Run the callback with a stand-in transaction, as sequelize's managed
    // transaction would.
    mockTransaction.mockImplementation((cb: any) => cb(TX));
  });

  it("runs every statement inside one transaction", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: 42 }]); // fetch
    mockQuery.mockResolvedValueOnce([]); // delete folder mappings
    mockQuery.mockResolvedValueOnce([]); // delete file
    mockQuery.mockResolvedValueOnce([]); // delete run

    expect(await deleteRunQuery(1, 5)).toBe(true);

    // Deleting the file and leaving the run behind would strand a run row
    // pointing at nothing (file_id is ON DELETE SET NULL).
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    for (const call of mockQuery.mock.calls) {
      expect((call[1] as any).transaction).toBe(TX);
    }
  });

  it("deletes the run's file and then the run, both org-scoped", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: 42 }]); // fetch
    mockQuery.mockResolvedValueOnce([]); // delete folder mappings
    mockQuery.mockResolvedValueOnce([]); // delete file
    mockQuery.mockResolvedValueOnce([]); // delete run

    expect(await deleteRunQuery(1, 5)).toBe(true);

    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    // deleteFileById clears the file's folder mappings first — a bare
    // DELETE FROM files leaves those rows orphaned.
    expect(sql[1]).toContain("DELETE FROM file_folder_mappings");
    expect(sql[1]).toContain("organization_id = :organizationId");
    expect(sql[2]).toContain("DELETE FROM files");
    expect(sql[2]).toContain("organization_id = :organizationId");
    expect(sql[3]).toContain("DELETE FROM report_runs");
    expect(sql[3]).toContain("organization_id = :organization_id");
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
