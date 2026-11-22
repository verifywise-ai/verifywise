jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  createRunQuery,
  updateRunStatusQuery,
  listRunsQuery,
  canViewRunQuery,
  getLastParametersQuery,
  getPriorE23GlanceQuery,
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

  describe("getLastParametersQuery", () => {
    const MEMBERSHIP_SQL = "p.owner = :viewerUserId OR pm.user_id = :viewerUserId";
    it("applies run visibility for a non-Admin viewer, like the run list", async () => {
      q.mockResolvedValueOnce([]);
      await getLastParametersQuery(3, 7, { userId: 9, role: "Editor" });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain(MEMBERSHIP_SQL);
      expect(sql).toContain("LEFT JOIN scheduled_reports sr");
      expect(opts.replacements).toMatchObject({
        templateId: 3,
        organization_id: 7,
        viewerUserId: 9,
      });
    });

    it("does not restrict an Admin", async () => {
      q.mockResolvedValueOnce([]);
      await getLastParametersQuery(3, 7, ADMIN);
      expect(q.mock.calls[0][0]).not.toContain(MEMBERSHIP_SQL);
    });

    it("strips the period and the final flag from the prefill", async () => {
      q.mockResolvedValueOnce([
        {
          parameters: {
            institutionName: "Northern Bank",
            periodStart: "2026-08-01",
            periodEnd: "2026-10-31",
            isFinal: true,
          },
        },
      ]);
      expect(await getLastParametersQuery(3, 7, ADMIN)).toEqual({
        parameters: { institutionName: "Northern Bank" },
        periodEnd: "2026-10-31",
      });
    });
  });
  describe("updateRunStatusQuery configSnapshotPatch", () => {
    it("merges the patch into config_snapshot", async () => {
      await updateRunStatusQuery(5, 7, {
        status: "success",
        configSnapshotPatch: { e23_glance: { rulesFired: 2 } },
      });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain(
        "config_snapshot = COALESCE(config_snapshot, '{}'::jsonb) || CAST(:config_snapshot_patch AS jsonb)",
      );
      expect(JSON.parse(opts.replacements.config_snapshot_patch)).toEqual({
        e23_glance: { rulesFired: 2 },
      });
    });
    it("leaves config_snapshot alone without a patch", async () => {
      await updateRunStatusQuery(5, 7, { status: "success" });
      expect(q.mock.calls[0][0]).not.toContain("config_snapshot");
    });
  });

  describe("getPriorE23GlanceQuery", () => {
    const stored = {
      requirementsDone: 30,
      requirementsTotal: 83,
      groupsChecked: 2,
      groupsTotal: 3,
      rulesFired: 1,
      rulesTotal: 13,
      modelsInScope: 12,
      untiered: 3,
      overdueValidations: 4,
      openCriticalHigh: 3,
      fixIt: { high: 6, medium: 5, low: 4 },
      generatedAt: "2026-08-01T00:00:00.000Z",
    };
    it("prefers the schedule when both ids are given", async () => {
      q.mockResolvedValueOnce([{ glance: stored }]);
      const prior = await getPriorE23GlanceQuery(7, { scheduledReportId: 3, templateId: 4 });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain("rr.scheduled_report_id = :scheduledReportId");
      expect(sql).not.toContain("rr.template_id = :templateId");
      expect(opts.replacements).toEqual({ organization_id: 7, scheduledReportId: 3 });
      expect(prior).toEqual(stored);
    });
    it("falls back to the template, any trigger", async () => {
      q.mockResolvedValueOnce([]);
      const prior = await getPriorE23GlanceQuery(7, { templateId: 4 });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain("rr.template_id = :templateId");
      expect(sql).not.toContain("scheduled_report_id");
      expect(sql).not.toContain("triggered_by");
      expect(opts.replacements).toEqual({ organization_id: 7, templateId: 4 });
      expect(prior).toBeNull();
    });
    it("reads only finished runs of this organization that stored a glance", async () => {
      q.mockResolvedValueOnce([]);
      await getPriorE23GlanceQuery(7, { templateId: 4 });
      const sql = q.mock.calls[0][0];
      expect(sql).toContain("rr.organization_id = :organization_id");
      expect(sql).toContain("rr.status IN ('success', 'partial_success')");
      expect(sql).toContain("jsonb_typeof(rr.config_snapshot->'e23_glance') = 'object'");
      expect(sql).toContain("ORDER BY rr.completed_at DESC NULLS LAST, rr.id DESC");
    });
    it("does not query without a schedule or template", async () => {
      expect(await getPriorE23GlanceQuery(7, {})).toBeNull();
      expect(q).not.toHaveBeenCalled();
    });
    it("returns null for a malformed stored glance", async () => {
      q.mockResolvedValueOnce([{ glance: { rulesFired: "x" } }]);
      expect(await getPriorE23GlanceQuery(7, { templateId: 4 })).toBeNull();
    });
  });
});
