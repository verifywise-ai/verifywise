jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";
import {
  LIFECYCLE_ENTITIES,
  findConfirmationsDue,
  markConfirmationReminded,
  moveUseCaseIntoReview,
  promoteUseCaseOutOfReview,
} from "../../utils/lifecycle.utils";

/**
 * Use case lifecycle (#5187): transitions, who may act, tenant isolation,
 * list visibility, staleness and the once-per-period reminder selection.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `lc-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function stage(id: number): Promise<Record<string, any>> {
  const [rows] = await sequelize.query(
    `SELECT lifecycle_stage, go_live_date::text AS go_live_date, retired_at, last_confirmed_at,
            last_confirmed_by, confirmation_reminded_at, department
       FROM projects WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as any[])[0];
}

async function setRow(id: number, sql: string) {
  await sequelize.query(`UPDATE projects SET ${sql} WHERE id = :id`, { replacements: { id } });
}

describe("use case lifecycle", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("defaults new rows to planned and walks planned → live → confirmed → retired", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const projectId = await createTestProject(orgId, adminId);
    expect((await stage(projectId)).lifecycle_stage).toBe("planned");

    const api = await as(orgId, adminId, "Admin");

    const live = await api
      .post(`/api/v1/use-case-lifecycle/${projectId}/go-live`)
      .send({ go_live_date: "2026-01-15" });
    expect(live.status).toBe(200);
    expect(live.body.data.lifecycle_stage).toBe("live");
    expect((await stage(projectId)).go_live_date).toBe("2026-01-15");

    // Cannot go live twice.
    const again = await api.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});
    expect(again.status).toBe(409);

    const confirm = await api.post(`/api/v1/use-case-lifecycle/${projectId}/confirm`);
    expect(confirm.status).toBe(200);
    const confirmed = await stage(projectId);
    expect(confirmed.last_confirmed_at).not.toBeNull();
    expect(confirmed.last_confirmed_by).toBe(adminId);

    const retire = await api.post(`/api/v1/use-case-lifecycle/${projectId}/retire`);
    expect(retire.status).toBe(200);
    const retired = await stage(projectId);
    expect(retired.lifecycle_stage).toBe("retired");
    expect(retired.retired_at).not.toBeNull();

    // A retired use case cannot be confirmed.
    const late = await api.post(`/api/v1/use-case-lifecycle/${projectId}/confirm`);
    expect(late.status).toBe(409);

    // Each change lands in the use case's change history.
    const [history] = await sequelize.query(
      `SELECT field_name FROM use_case_change_history WHERE use_case_id = :id ORDER BY id`,
      { replacements: { id: projectId } },
    );
    expect((history as any[]).map((h) => h.field_name)).toEqual(
      expect.arrayContaining(["lifecycle_stage", "go_live_date", "last_confirmed_at"]),
    );
  });

  it("validates the go-live date", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const projectId = await createTestProject(orgId, adminId);
    const api = await as(orgId, adminId, "Admin");

    for (const bad of ["2026-02-30", "15/01/2026", "2999-01-01", 20260115]) {
      const res = await api
        .post(`/api/v1/use-case-lifecycle/${projectId}/go-live`)
        .send({ go_live_date: bad });
      expect(res.status).toBe(400);
    }
    expect((await stage(projectId)).lifecycle_stage).toBe("planned");

    // No date means today.
    const res = await api.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});
    expect(res.status).toBe(200);
    expect((await stage(projectId)).go_live_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("lets Admin, Editor and the owner act; denies other Reviewers and every Auditor", async () => {
    const orgId = await createTestOrganization();
    const reviewerOwner = await userIn(orgId, "Reviewer");
    const otherReviewer = await userIn(orgId, "Reviewer");
    const editor = await userIn(orgId, "Editor");
    const auditorOwner = await userIn(orgId, "Auditor");

    const ownedByReviewer = await createTestProject(orgId, reviewerOwner);
    const ownedByAuditor = await createTestProject(orgId, auditorOwner);

    expect(
      (
        await (
          await as(orgId, otherReviewer, "Reviewer")
        ).post(`/api/v1/use-case-lifecycle/${ownedByReviewer}/go-live`)
      ).status,
    ).toBe(403);
    expect(
      (
        await (
          await as(orgId, auditorOwner, "Auditor")
        ).post(`/api/v1/use-case-lifecycle/${ownedByAuditor}/go-live`)
      ).status,
    ).toBe(403);
    expect(
      (
        await (
          await as(orgId, auditorOwner, "Auditor")
        )
          .patch(`/api/v1/use-case-lifecycle/${ownedByAuditor}/department`)
          .send({ department: "Audit" })
      ).status,
    ).toBe(403);

    expect(
      (
        await (
          await as(orgId, reviewerOwner, "Reviewer")
        ).post(`/api/v1/use-case-lifecycle/${ownedByReviewer}/go-live`)
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await as(orgId, editor, "Editor")
        ).post(`/api/v1/use-case-lifecycle/${ownedByAuditor}/go-live`)
      ).status,
    ).toBe(200);
  });

  it("never acts on or counts another organization's use cases", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const adminA = await userIn(orgA, "Admin");
    const adminB = await userIn(orgB, "Admin");
    const projectA = await createTestProject(orgA, adminA);

    const apiB = await as(orgB, adminB, "Admin");
    for (const path of ["go-live", "retire", "confirm"]) {
      const res = await apiB.post(`/api/v1/use-case-lifecycle/${projectA}/${path}`);
      expect(res.status).toBe(404);
    }
    const dept = await apiB
      .patch(`/api/v1/use-case-lifecycle/${projectA}/department`)
      .send({ department: "Hijack" });
    expect(dept.status).toBe(404);
    expect((await stage(projectA)).department).toBeNull();

    const summary = await apiB.get("/api/v1/use-case-lifecycle/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.data.counts).toEqual({ in_review: 0, planned: 0, live: 0, retired: 0 });
  });

  it("requires authentication", async () => {
    const app = await createTestApp();
    // No token is a 400 ("Token not found") in auth.middleware; a bad one is 401.
    const missing = await testRequest(app).post("/api/v1/use-case-lifecycle/1/go-live");
    expect(missing.status).toBe(400);
    const bad = await testRequest(app)
      .get("/api/v1/use-case-lifecycle/summary")
      .set("Authorization", "Bearer not-a-real-token");
    expect([400, 401]).toContain(bad.status);
    const settings = await testRequest(app)
      .patch("/api/v1/lifecycle-settings")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ confirmation_interval_days: 30 });
    expect([400, 401]).toContain(settings.status);
  });

  it("summarises counts and stale entries with list visibility", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const editorId = await userIn(orgId, "Editor");

    const fresh = await createTestProject(orgId, adminId);
    const stale = await createTestProject(orgId, adminId);
    const confirmedRecently = await createTestProject(orgId, adminId);
    const mine = await createTestProject(orgId, editorId);
    await createTestProject(orgId, adminId); // planned
    await setRow(fresh, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 10`);
    await setRow(stale, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100`);
    await setRow(
      confirmedRecently,
      `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 400, last_confirmed_at = NOW() - interval '5 days'`,
    );
    await setRow(mine, `lifecycle_stage = 'retired', retired_at = NOW()`);

    const admin = await as(orgId, adminId, "Admin");
    const res = await admin.get("/api/v1/use-case-lifecycle/summary");
    expect(res.status).toBe(200);
    expect(res.body.data.counts).toEqual({ in_review: 0, planned: 1, live: 3, retired: 1 });
    expect(res.body.data.stale_ids).toEqual([stale]);
    expect(res.body.data.confirmation_interval_days).toBe(90);

    // A tighter interval flags more entries.
    await sequelize.query(
      `INSERT INTO lifecycle_org_settings (organization_id, confirmation_interval_days) VALUES (:orgId, 30)`,
      { replacements: { orgId } },
    );
    const tight = await admin.get("/api/v1/use-case-lifecycle/summary");
    expect(tight.body.data.stale_ids).toEqual([stale]);
    await setRow(fresh, `go_live_date = CURRENT_DATE - 40`);
    const tighter = await admin.get("/api/v1/use-case-lifecycle/summary");
    expect([...tighter.body.data.stale_ids].sort()).toEqual([fresh, stale].sort());

    // An Editor who is not a member only sees their own use case.
    const editor = await as(orgId, editorId, "Editor");
    const scoped = await editor.get("/api/v1/use-case-lifecycle/summary");
    expect(scoped.body.data.counts).toEqual({ in_review: 0, planned: 0, live: 0, retired: 1 });
    expect(scoped.body.data.stale_ids).toEqual([]);
  });

  it("builds the dashboard breakdowns from live use cases", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const a = await createTestProject(orgId, adminId);
    const b = await createTestProject(orgId, adminId);
    const c = await createTestProject(orgId, adminId);
    await setRow(
      a,
      `lifecycle_stage = 'live', go_live_date = CURRENT_DATE, department = 'Finance'`,
    );
    await setRow(
      b,
      `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 200, department = 'Finance'`,
    );
    await setRow(c, `lifecycle_stage = 'retired', retired_at = NOW(), department = 'HR'`);

    const api = await as(orgId, adminId, "Admin");
    const res = await api.get("/api/v1/use-case-lifecycle/dashboard");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.counts.live).toBe(2);
    expect(d.live_by.department).toEqual([{ label: "Finance", count: 2 }]);
    expect(d.quarter.going_live.map((i: any) => i.id)).toEqual([a]);
    expect(d.quarter.retired.map((i: any) => i.id)).toEqual([c]);
    expect(d.stale.total).toBe(1);
    expect(d.stale.items.map((i: any) => i.id)).toEqual([b]);
  });

  it("updates and clears the department", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const projectId = await createTestProject(orgId, adminId);
    const api = await as(orgId, adminId, "Admin");

    const set = await api
      .patch(`/api/v1/use-case-lifecycle/${projectId}/department`)
      .send({ department: "  Risk  " });
    expect(set.status).toBe(200);
    expect((await stage(projectId)).department).toBe("Risk");

    const bad = await api
      .patch(`/api/v1/use-case-lifecycle/${projectId}/department`)
      .send({ department: 42 });
    expect(bad.status).toBe(400);

    const clear = await api
      .patch(`/api/v1/use-case-lifecycle/${projectId}/department`)
      .send({ department: "" });
    expect(clear.status).toBe(200);
    expect((await stage(projectId)).department).toBeNull();
  });

  it("selects each stale entry once per period", async () => {
    const entity = LIFECYCLE_ENTITIES.use_case;
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const projectId = await createTestProject(orgId, adminId);
    await setRow(projectId, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100`);

    const due = await findConfirmationsDue(entity, orgId, 90);
    expect(due.map((r) => Number(r.id))).toEqual([projectId]);
    expect(Number(due[0].owner)).toBe(adminId);

    await markConfirmationReminded(entity, orgId, projectId);
    expect(await findConfirmationsDue(entity, orgId, 90)).toEqual([]);

    // Confirmed, then a full period passes without another confirmation.
    await setRow(
      projectId,
      `last_confirmed_at = NOW() - interval '95 days', confirmation_reminded_at = NOW() - interval '120 days'`,
    );
    expect((await findConfirmationsDue(entity, orgId, 90)).map((r) => Number(r.id))).toEqual([
      projectId,
    ]);

    // Reminded long ago and still unconfirmed: remind again.
    await setRow(
      projectId,
      `last_confirmed_at = NULL, confirmation_reminded_at = NOW() - interval '91 days'`,
    );
    expect(await findConfirmationsDue(entity, orgId, 90)).toHaveLength(1);

    // Organizational projects and other orgs never show up.
    const otherOrg = await createTestOrganization();
    expect(await findConfirmationsDue(entity, otherOrg, 90)).toEqual([]);
    await setRow(projectId, `is_organizational = true`);
    expect(await findConfirmationsDue(entity, orgId, 90)).toEqual([]);
  });

  it("moves into review only from planned and back out on approval", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const planned = await createTestProject(orgId, adminId);
    const live = await createTestProject(orgId, adminId);
    await setRow(live, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE`);

    await moveUseCaseIntoReview(orgId, planned);
    await moveUseCaseIntoReview(orgId, live);
    expect((await stage(planned)).lifecycle_stage).toBe("in_review");
    expect((await stage(live)).lifecycle_stage).toBe("live");

    await promoteUseCaseOutOfReview(orgId, planned);
    await promoteUseCaseOutOfReview(orgId, live);
    expect((await stage(planned)).lifecycle_stage).toBe("planned");
    expect((await stage(live)).lifecycle_stage).toBe("live");
  });

  it("only lets admins change the check interval", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const editorId = await userIn(orgId, "Editor");

    const editor = await as(orgId, editorId, "Editor");
    expect(
      (await editor.get("/api/v1/lifecycle-settings")).body.data.confirmation_interval_days,
    ).toBe(90);
    expect(
      (await editor.patch("/api/v1/lifecycle-settings").send({ confirmation_interval_days: 30 }))
        .status,
    ).toBe(403);

    const admin = await as(orgId, adminId, "Admin");
    for (const bad of [45, "90", null]) {
      const res = await admin
        .patch("/api/v1/lifecycle-settings")
        .send({ confirmation_interval_days: bad });
      expect(res.status).toBe(400);
    }
    const ok = await admin
      .patch("/api/v1/lifecycle-settings")
      .send({ confirmation_interval_days: 180 });
    expect(ok.status).toBe(200);
    expect(
      (await admin.get("/api/v1/lifecycle-settings")).body.data.confirmation_interval_days,
    ).toBe(180);
  });
});
