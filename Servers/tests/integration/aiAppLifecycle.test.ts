jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  LIFECYCLE_ENTITIES,
  findConfirmationsDue,
  markConfirmationReminded,
} from "../../utils/lifecycle.utils";

/**
 * AI apps lifecycle (#5193): the use case lifecycle (#5187) reused for
 * ai_apps — actions, who may act, history, summary, the v1 list, the shared
 * "still live?" check, and an AI app intake form creating an AI app.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `ai-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

async function aiApp(orgId: number, ownerId: number | null, name?: string): Promise<number> {
  counter += 1;
  const [rows] = await sequelize.query(
    `INSERT INTO ai_apps (organization_id, name, owner_id) VALUES (:orgId, :name, :ownerId) RETURNING id`,
    { replacements: { orgId, ownerId, name: name ?? `App ${Date.now()}-${counter}` } },
  );
  return Number((rows as any[])[0].id);
}

async function setRow(id: number, sql: string) {
  await sequelize.query(`UPDATE ai_apps SET ${sql} WHERE id = :id`, { replacements: { id } });
}

async function row(id: number): Promise<Record<string, any>> {
  const [rows] = await sequelize.query(
    `SELECT lifecycle_stage, go_live_date::text AS go_live_date, retired_at, last_confirmed_at,
            last_confirmed_by, status, owner_id, name, description, discovered_source
       FROM ai_apps WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as any[])[0];
}

describe("AI app lifecycle", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("walks planned → live → confirmed → retired and records each step", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const id = await aiApp(orgId, adminId);
    const api = await as(orgId, adminId, "Admin");

    const state = await api.get(`/api/v1/ai-app-lifecycle/${id}`);
    expect(state.status).toBe(200);
    expect(state.body.data).toMatchObject({ lifecycle_stage: "planned", is_stale: false });

    expect(
      (
        await api
          .post(`/api/v1/ai-app-lifecycle/${id}/go-live`)
          .send({ go_live_date: "2026-02-01" })
      ).status,
    ).toBe(200);
    expect((await row(id)).go_live_date).toBe("2026-02-01");
    expect((await api.post(`/api/v1/ai-app-lifecycle/${id}/go-live`)).status).toBe(409);
    expect((await api.post(`/api/v1/ai-app-lifecycle/${id}/confirm`)).status).toBe(200);
    expect((await row(id)).last_confirmed_by).toBe(adminId);
    expect((await api.post(`/api/v1/ai-app-lifecycle/${id}/retire`)).status).toBe(200);
    expect((await row(id)).lifecycle_stage).toBe("retired");
    expect((await api.post(`/api/v1/ai-app-lifecycle/${id}/confirm`)).status).toBe(409);

    const history = await api.get(`/api/v1/ai-app-lifecycle/${id}/history`);
    expect(history.status).toBe(200);
    const fields = history.body.data.data.map((h: any) => h.field_name);
    expect(fields).toEqual(
      expect.arrayContaining(["lifecycle_stage", "go_live_date", "last_confirmed_at"]),
    );
  });

  it("lets aiApp.edit holders and the owner act; never Auditors or other Reviewers", async () => {
    const orgId = await createTestOrganization();
    const reviewerOwner = await userIn(orgId, "Reviewer");
    const otherReviewer = await userIn(orgId, "Reviewer");
    const editor = await userIn(orgId, "Editor");
    const auditorOwner = await userIn(orgId, "Auditor");
    const ownedByReviewer = await aiApp(orgId, reviewerOwner);
    const ownedByAuditor = await aiApp(orgId, auditorOwner);

    const go = async (userId: number, role: RoleName, id: number) =>
      (await (await as(orgId, userId, role)).post(`/api/v1/ai-app-lifecycle/${id}/go-live`)).status;

    expect(await go(otherReviewer, "Reviewer", ownedByReviewer)).toBe(403);
    expect(await go(auditorOwner, "Auditor", ownedByAuditor)).toBe(403);
    expect(await go(reviewerOwner, "Reviewer", ownedByReviewer)).toBe(200);
    expect(await go(editor, "Editor", ownedByAuditor)).toBe(200);
  });

  it("keeps other organizations out", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const adminA = await userIn(orgA, "Admin");
    const adminB = await userIn(orgB, "Admin");
    const appA = await aiApp(orgA, adminA);
    await setRow(appA, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 200`);

    const apiB = await as(orgB, adminB, "Admin");
    for (const path of ["go-live", "retire", "confirm"]) {
      expect((await apiB.post(`/api/v1/ai-app-lifecycle/${appA}/${path}`)).status).toBe(404);
    }
    expect((await apiB.get(`/api/v1/ai-app-lifecycle/${appA}`)).status).toBe(404);
    expect((await apiB.get(`/api/v1/ai-app-lifecycle/${appA}/history`)).body.data.data).toEqual([]);
    const summary = await apiB.get("/api/v1/ai-app-lifecycle/summary");
    expect(summary.body.data.counts).toEqual({ in_review: 0, planned: 0, live: 0, retired: 0 });
    expect(summary.body.data.stale_ids).toEqual([]);
    const list = await apiB.get("/api/v1/ai-apps");
    expect(list.body.data.ai_apps).toEqual([]);
  });

  it("counts stages and flags stale apps with the shared org interval", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const fresh = await aiApp(orgId, adminId);
    const stale = await aiApp(orgId, adminId);
    await aiApp(orgId, adminId); // planned
    const retired = await aiApp(orgId, adminId);
    await setRow(fresh, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 40`);
    await setRow(stale, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100`);
    await setRow(retired, `lifecycle_stage = 'retired', retired_at = NOW()`);

    const api = await as(orgId, adminId, "Admin");
    const summary = await api.get("/api/v1/ai-app-lifecycle/summary");
    expect(summary.body.data).toEqual({
      counts: { in_review: 0, planned: 1, live: 2, retired: 1 },
      stale_ids: [stale],
      confirmation_interval_days: 90,
    });

    // The use case setting governs AI apps too.
    expect(
      (await api.patch("/api/v1/lifecycle-settings").send({ confirmation_interval_days: 30 }))
        .status,
    ).toBe(200);
    const tighter = await api.get("/api/v1/ai-app-lifecycle/summary");
    expect([...tighter.body.data.stale_ids].sort()).toEqual([fresh, stale].sort());
    expect((await api.get(`/api/v1/ai-app-lifecycle/${fresh}`)).body.data.is_stale).toBe(true);
  });

  it("lists AI apps by stage on v1 and leaves the legacy list unchanged", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const live = await aiApp(orgId, adminId, "Live app");
    await aiApp(orgId, adminId, "Planned app");
    await setRow(live, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE`);
    const api = await as(orgId, adminId, "Admin");

    const v1 = await api.get("/api/v1/ai-apps?lifecycle_stage=live");
    expect(v1.status).toBe(200);
    expect(v1.body.data.total).toBe(1);
    expect(v1.body.data.ai_apps[0]).toMatchObject({ id: live, lifecycle_stage: "live" });
    expect((await api.get("/api/v1/ai-apps?lifecycle_stage=gone")).status).toBe(400);

    const legacy = await api.get("/api/ai-apps");
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.ai_apps).toHaveLength(2);
    expect(legacy.body.data.ai_apps[0]).not.toHaveProperty("lifecycle_stage");
  });

  it("selects stale AI apps for the still-live email once per period", async () => {
    const entity = LIFECYCLE_ENTITIES.ai_app;
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const id = await aiApp(orgId, adminId, "Old app");
    const noOwner = await aiApp(orgId, null);
    await setRow(id, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100`);
    await setRow(noOwner, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100`);

    const due = await findConfirmationsDue(entity, orgId, 90);
    expect(due.map((r) => [Number(r.id), r.title, Number(r.owner)])).toEqual([
      [id, "Old app", adminId],
    ]);
    await markConfirmationReminded(entity, orgId, id);
    expect(await findConfirmationsDue(entity, orgId, 90)).toEqual([]);
  });

  it("keeps the stage in step with the approval status", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    const api = await as(orgId, adminId, "Admin");

    const created = await api
      .post("/api/ai-apps")
      .send({ name: "Review me", status: "under_review", owner_id: adminId });
    expect(created.status).toBe(201);
    const id = Number(created.body.data.id);
    expect((await row(id)).lifecycle_stage).toBe("in_review");

    // Leaving review: approved → planned.
    expect((await api.patch(`/api/ai-apps/${id}/status`).send({ status: "approved" })).status).toBe(
      200,
    );
    expect((await row(id)).lifecycle_stage).toBe("planned");

    // Back under review from planned, then restricted → planned again.
    await api.patch(`/api/ai-apps/${id}/status`).send({ status: "under_review" });
    expect((await row(id)).lifecycle_stage).toBe("in_review");
    await api.patch(`/api/ai-apps/${id}`).send({ status: "restricted" });
    expect((await row(id)).lifecycle_stage).toBe("planned");

    // A live app that is banned is retired and leaves the still-live check.
    await setRow(id, `lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 200`);
    expect(await findConfirmationsDue(LIFECYCLE_ENTITIES.ai_app, orgId, 90)).toHaveLength(1);
    await api.patch(`/api/ai-apps/${id}/status`).send({ status: "banned" });
    const banned = await row(id);
    expect(banned.lifecycle_stage).toBe("retired");
    expect(banned.retired_at).not.toBeNull();
    expect(await findConfirmationsDue(LIFECYCLE_ENTITIES.ai_app, orgId, 90)).toEqual([]);

    // Approving a banned app does not bring it back to life.
    await api.patch(`/api/ai-apps/${id}/status`).send({ status: "approved" });
    expect((await row(id)).lifecycle_stage).toBe("retired");

    const history = await api.get(`/api/v1/ai-app-lifecycle/${id}/history`);
    const moves = history.body.data.data
      .filter((h: any) => h.field_name === "lifecycle_stage")
      .map((h: any) => `${h.old_value}->${h.new_value}`)
      .reverse();
    expect(moves).toEqual([
      "Planned->In review",
      "In review->Planned",
      "Planned->In review",
      "In review->Planned",
      "Live->Retired",
    ]);
  });

  it("searches and pages the v1 list on the server", async () => {
    const orgId = await createTestOrganization();
    const adminId = await userIn(orgId, "Admin");
    for (const name of ["Alpha notes", "Beta notes", "Gamma 100%_off"]) {
      await aiApp(orgId, adminId, name);
    }
    const api = await as(orgId, adminId, "Admin");

    const page2 = await api.get(
      "/api/v1/ai-apps?lifecycle_stage=planned&search=notes&limit=1&page=2&sortBy=name&order=asc",
    );
    expect(page2.body.data.total).toBe(2);
    expect(page2.body.data.ai_apps.map((a: any) => a.name)).toEqual(["Beta notes"]);
    // % and _ are matched literally.
    const literal = await api.get("/api/v1/ai-apps?search=100%25_");
    expect(literal.body.data.ai_apps.map((a: any) => a.name)).toEqual(["Gamma 100%_off"]);
    const none = await api.get("/api/v1/ai-apps?search=_");
    expect(none.body.data.total).toBe(1);
  });

  describe("AI app intake", () => {
    async function seed(answers: Record<string, unknown>, suggestedRisks: unknown = null) {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      const [forms] = await sequelize.query(
        `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, schema, created_by, status)
         VALUES (:orgId, 'AI app request', 'd', :slug, 'ai_app', :schema, :adminId, 'active') RETURNING id`,
        {
          replacements: {
            orgId,
            adminId,
            slug: `ai-app-${Date.now()}-${counter++}`,
            schema: JSON.stringify({
              version: "1.0",
              fields: [
                { id: "f_name", type: "text", label: "App", entityFieldMapping: "name" },
                {
                  id: "f_desc",
                  type: "textarea",
                  label: "What for",
                  entityFieldMapping: "description",
                },
                { id: "f_dept", type: "text", label: "Teams", entityFieldMapping: "departments" },
              ],
            }),
          },
        },
      );
      const formId = Number((forms as any[])[0].id);
      const [subs] = await sequelize.query(
        `INSERT INTO intake_submissions
           (organization_id, form_id, submitter_name, data, entity_type, status, suggested_risks)
         VALUES (:orgId, :formId, 'Sam', :data, 'ai_app', 'pending', :suggestedRisks) RETURNING id`,
        {
          replacements: {
            orgId,
            formId,
            data: JSON.stringify(answers),
            suggestedRisks: suggestedRisks ? JSON.stringify(suggestedRisks) : null,
          },
        },
      );
      return {
        orgId,
        adminId,
        submissionId: Number((subs as any[])[0].id),
        api: await as(orgId, adminId, "Admin"),
      };
    }

    it("creates a planned, approved AI app with its departments when the request is approved", async () => {
      const { adminId, submissionId, api } = await seed({
        f_name: "Meeting notes bot",
        f_desc: "Summarises calls",
        f_dept: "Sales,  Support , Sales",
      });
      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
      expect(res.status).toBe(200);

      const [subs] = await sequelize.query(
        `SELECT status, entity_id FROM intake_submissions WHERE id = :submissionId`,
        { replacements: { submissionId } },
      );
      const sub = (subs as any[])[0];
      expect(sub.status).toBe("approved");
      const app = await row(Number(sub.entity_id));
      expect(app).toMatchObject({
        name: "Meeting notes bot",
        description: "Summarises calls",
        owner_id: adminId,
        status: "approved",
        lifecycle_stage: "planned",
        discovered_source: "employee_report",
      });
      const [depts] = await sequelize.query(
        `SELECT department FROM ai_apps_departments WHERE ai_app_id = :id ORDER BY department`,
        { replacements: { id: Number(sub.entity_id) } },
      );
      expect((depts as any[]).map((d) => d.department)).toEqual(["Sales", "Support"]);
    });

    it("answers 400 with the reason when the name is blank", async () => {
      const { submissionId, api } = await seed({ f_name: "   " });
      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/name is required/i);
    });

    it("refuses accepted risk suggestions instead of dropping them", async () => {
      const { submissionId, api } = await seed(
        { f_name: "Has suggestions" },
        {
          status: "complete",
          items: [{ id: "s1", state: "accepted", name: "r" }],
          droppedCount: 0,
          stageStartedAt: new Date().toISOString(),
          generatedAt: new Date().toISOString(),
        },
      );
      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
      expect(res.status).toBe(400);
      const [apps] = await sequelize.query(`SELECT 1 FROM ai_apps WHERE name = 'Has suggestions'`);
      expect(apps).toHaveLength(0);
    });

    it("refuses a duplicate AI app name without approving the request", async () => {
      const { orgId, adminId, submissionId, api } = await seed({ f_name: "Existing app" });
      await aiApp(orgId, adminId, "Existing app");
      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
      expect(res.status).toBe(409);
      const [subs] = await sequelize.query(
        `SELECT status FROM intake_submissions WHERE id = :submissionId`,
        { replacements: { submissionId } },
      );
      expect((subs as any[])[0].status).toBe("pending");
    });
  });
});
