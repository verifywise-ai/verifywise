jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  createRunQuery,
  updateRunStatusQuery,
  listRunsQuery,
  canViewRunQuery,
} from "../reportRun.utils";
const q = sequelize.query as jest.Mock;
const ADMIN = { userId: 1, role: "Admin" };

describe("reportRun.utils", () => {
  beforeEach(() => q.mockReset());
  it("exports updateRunStatusQuery", () => {
    expect(typeof updateRunStatusQuery).toBe("function");
  });
  it("updateRunStatusQuery scopes the WHERE clause by org", async () => {
    await updateRunStatusQuery(5, 7, { status: "success" });
    expect(q.mock.calls[0][0]).toContain("organization_id = :organization_id");
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
    expect(q.mock.calls[0][1].replacements.id).toBe(5);
  });
  it.each(["success", "failed", "partial_success"])(
    "updateRunStatusQuery stamps completed_at for terminal status %s",
    async (status) => {
      await updateRunStatusQuery(5, 7, { status });
      expect(q.mock.calls[0][0]).toContain("completed_at = NOW()");
    },
  );
  it("updateRunStatusQuery does not stamp completed_at for a running status", async () => {
    await updateRunStatusQuery(5, 7, { status: "running" });
    expect(q.mock.calls[0][0]).not.toContain("completed_at");
    // The rest of the statement must still be intact around the omission.
    expect(q.mock.calls[0][0]).toContain("status = :status, file_id = :file_id");
  });
  it("createRunQuery inserts with org + status running", async () => {
    q.mockResolvedValueOnce([{ id: 1, status: "running" }]);
    const r = await createRunQuery({
      organization_id: 7,
      scheduled_report_id: 3,
      triggered_by: "scheduler",
      scheduled_for: new Date(),
    } as any);
    expect(r.status).toBe("running");
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
  it("listRunsQuery filters by org", async () => {
    q.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await listRunsQuery(7, {}, ADMIN);
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
  it("listRunsQuery defaults to limit 200 offset 0 and returns rows + total", async () => {
    q.mockResolvedValueOnce([{ total: 3 }]).mockResolvedValueOnce([{ id: 1 }]);
    const r = await listRunsQuery(7, {}, ADMIN);
    expect(r).toEqual({ rows: [{ id: 1 }], total: 3 });
    expect(q.mock.calls[1][1].replacements.limit).toBe(200);
    expect(q.mock.calls[1][1].replacements.offset).toBe(0);
  });
});

// canViewRunQuery is the single visibility rule for one run: the same predicate
// listRunsQuery uses, so a run that is not in your list cannot be fetched,
// downloaded or analysed either.
describe("canViewRunQuery", () => {
  const AUDITOR = { userId: 3, role: "Auditor" };
  const MEMBERSHIP_SQL = "p.owner = :viewerUserId OR pm.user_id = :viewerUserId";
  const PROJECT_SCOPE_SQL = "COALESCE(rr.config_snapshot->>'project_id', sr.project_id::text)";

  beforeEach(() => q.mockReset());

  it("always scopes by run id and organization, whoever is asking", async () => {
    q.mockResolvedValueOnce([{ ok: 1 }]);
    await canViewRunQuery(9, 7, AUDITOR);
    expect(q.mock.calls[0][0]).toContain("rr.id = :id");
    expect(q.mock.calls[0][0]).toContain("rr.organization_id = :organization_id");
    expect(q.mock.calls[0][1].replacements.id).toBe(9);
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });

  it("applies the membership predicate for a non-Admin, bound to the viewer's own id", async () => {
    q.mockResolvedValueOnce([]);
    await canViewRunQuery(9, 7, AUDITOR);
    expect(q.mock.calls[0][0]).toContain(MEMBERSHIP_SQL);
    expect(q.mock.calls[0][1].replacements.viewerUserId).toBe(3);
  });

  it("leaves Admin and SuperAdmin unrestricted", async () => {
    for (const role of ["Admin", "SuperAdmin"]) {
      q.mockReset();
      q.mockResolvedValueOnce([{ ok: 1 }]);
      await canViewRunQuery(9, 7, { userId: 1, role });
      expect(q.mock.calls[0][0]).not.toContain(MEMBERSHIP_SQL);
      expect(q.mock.calls[0][1].replacements.viewerUserId).toBeUndefined();
    }
  });

  it("derives a run's project the same way the list does, so the two cannot drift", async () => {
    q.mockResolvedValueOnce([]);
    await canViewRunQuery(9, 7, AUDITOR);
    expect(q.mock.calls[0][0]).toContain(PROJECT_SCOPE_SQL);

    q.mockReset();
    q.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await listRunsQuery(7, {}, AUDITOR);
    expect(q.mock.calls[0][0]).toContain(PROJECT_SCOPE_SQL);
  });

  it("is false when the predicate matches no row and true when it matches one", async () => {
    q.mockResolvedValueOnce([]);
    expect(await canViewRunQuery(9, 7, AUDITOR)).toBe(false);

    q.mockReset();
    q.mockResolvedValueOnce([{ ok: 1 }]);
    expect(await canViewRunQuery(9, 7, AUDITOR)).toBe(true);
  });

  it("fails closed for a viewer with no identity", async () => {
    q.mockResolvedValueOnce([]);
    await canViewRunQuery(9, 7, { userId: null, role: null });
    // null matches no project owner and no membership row, so only
    // organization-scoped runs (no project) can come back.
    expect(q.mock.calls[0][0]).toContain(MEMBERSHIP_SQL);
    expect(q.mock.calls[0][1].replacements.viewerUserId).toBeNull();
  });
});
