jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";

/**
 * In review tab (#5188): pending use case intake submissions are listed from
 * intake_submissions (no project exists until approval), and the dashboard
 * reports how long approved submissions spent in review.
 */

let counter = 0;

async function appFor(orgId: number, userId: number, role: string) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

async function seedOrg(role: "Admin" | "Reviewer" = "Admin") {
  counter += 1;
  const orgId = await createTestOrganization();
  const userId = await createTestUser(
    orgId,
    role === "Admin" ? 1 : 2,
    `intake-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
  const formId = await form(orgId, userId, "AI use case request", "f_title");
  return { orgId, userId, formId, api: await appFor(orgId, userId, role) };
}

/**
 * A form whose title answer lives in `titleFieldId` (null: no title mapping).
 * Use case forms map it to project_title, AI app forms to name.
 */
async function form(
  orgId: number,
  userId: number,
  name: string,
  titleFieldId: string | null,
  entityType: "use_case" | "ai_app" = "use_case",
): Promise<number> {
  counter += 1;
  const fields = [{ id: "f_goal", type: "text", label: "Goal" }] as Record<string, unknown>[];
  if (titleFieldId) {
    fields.unshift({
      id: titleFieldId,
      type: "text",
      label: "Name",
      entityFieldMapping: entityType === "ai_app" ? "name" : "project_title",
    });
  }
  const [rows] = await sequelize.query(
    `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, schema, created_by)
     VALUES (:orgId, :name, 'd', :slug, :entityType, :schema, :userId) RETURNING id`,
    {
      replacements: {
        orgId,
        userId,
        name,
        entityType,
        slug: `form-${Date.now()}-${counter}`,
        schema: JSON.stringify({ version: "1.0", fields }),
      },
    },
  );
  return Number((rows as any[])[0].id);
}

async function submission(
  orgId: number,
  formId: number,
  opts: {
    data?: Record<string, unknown>;
    status?: string;
    entityType?: string;
    createdAgo?: string;
    reviewedAgo?: string;
    originalId?: number;
    entityId?: number;
  } = {},
): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO intake_submissions
       (organization_id, form_id, submitter_name, data, entity_type, status, created_at,
        reviewed_at, original_submission_id, entity_id)
     VALUES (:orgId, :formId, 'Sam', :data, :entityType, :status,
             NOW() - CAST(:createdAgo AS interval),
             NOW() - CAST(:reviewedAgo AS interval), :originalId, :entityId)
     RETURNING id`,
    {
      replacements: {
        orgId,
        formId,
        data: JSON.stringify(opts.data ?? { f_goal: "x" }),
        entityType: opts.entityType ?? "use_case",
        status: opts.status ?? "pending",
        createdAgo: opts.createdAgo ?? "0 days",
        reviewedAgo: opts.reviewedAgo ?? null,
        originalId: opts.originalId ?? null,
        entityId: opts.entityId ?? null,
      },
    },
  );
  return Number((rows as any[])[0].id);
}

describe("intake submissions in the In review tab", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only pending use case submissions, oldest first, with each form's title answer", async () => {
    const { orgId, userId, formId, api } = await seedOrg("Reviewer");
    const otherForm = await form(orgId, userId, "Second form", "f_name");
    const untitledForm = await form(orgId, userId, "No title form", null);
    const newer = await submission(orgId, formId, {
      data: { f_title: "  Chatbot  " },
      createdAgo: "1 day",
    });
    const older = await submission(orgId, otherForm, {
      data: { f_name: "Scoring", f_title: "ignored" },
      createdAgo: "5 days",
    });
    const untitled = await submission(orgId, untitledForm, { createdAgo: "3 days" });
    await submission(orgId, formId, { data: { f_title: "Approved" }, status: "approved" });
    await submission(orgId, formId, { data: { f_title: "Rejected" }, status: "rejected" });
    await submission(orgId, formId, { data: { f_title: "Superseded" }, status: "superseded" });
    await submission(orgId, formId, { data: { f_title: "A model" }, entityType: "model" });

    const res = await api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(res.status).toBe(200);
    const { total, items, limit } = res.body.data;
    expect(total).toBe(3);
    expect(limit).toBe(500);
    expect(items.map((r: any) => r.id)).toEqual([older, untitled, newer]);
    expect(items[0]).toEqual({
      id: older,
      title: "Scoring",
      form_name: "Second form",
      submitter_name: "Sam",
      submitted_at: expect.any(String),
      days_in_review: 5,
    });
    expect(items[1]).toMatchObject({ title: null, form_name: "No title form" });
    expect(items[2]).toMatchObject({ title: "Chatbot", days_in_review: 1 });
  });

  it("lists pending AI app requests on their own endpoint, named by the AI app name answer", async () => {
    const { orgId, userId, formId, api } = await seedOrg("Reviewer");
    const aiForm = await form(orgId, userId, "AI app request", "f_app", "ai_app");
    const app = await submission(orgId, aiForm, {
      data: { f_app: "Meeting notes assistant" },
      entityType: "ai_app",
      createdAgo: "2 days",
    });
    await submission(orgId, aiForm, {
      data: { f_app: "Approved app" },
      entityType: "ai_app",
      status: "approved",
    });
    const useCase = await submission(orgId, formId, { data: { f_title: "Chatbot" } });

    const ai = await api.get("/api/v1/ai-app-lifecycle/intake-submissions");
    expect(ai.status).toBe(200);
    expect(ai.body.data.total).toBe(1);
    expect(ai.body.data.items).toEqual([
      expect.objectContaining({
        id: app,
        title: "Meeting notes assistant",
        form_name: "AI app request",
        days_in_review: 2,
      }),
    ]);

    const uc = await api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(uc.body.data.items.map((r: any) => r.id)).toEqual([useCase]);
  });

  it("dates a resubmission from the first submission of its chain", async () => {
    const { orgId, formId, api } = await seedOrg();
    const first = await submission(orgId, formId, {
      data: { f_title: "v1" },
      status: "superseded",
      createdAgo: "20 days",
    });
    const second = await submission(orgId, formId, {
      data: { f_title: "v2" },
      status: "superseded",
      createdAgo: "10 days",
      originalId: first,
    });
    const third = await submission(orgId, formId, {
      data: { f_title: "v3" },
      createdAgo: "2 days",
      originalId: second,
    });

    const res = await api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ id: third, title: "v3", days_in_review: 20 }),
    ]);
  });

  it("never lists another organization's submissions", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await submission(a.orgId, a.formId, { data: { f_title: "Org A only" } });

    const res = await b.api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: 0, items: [], limit: 500 });
  });

  it("requires authentication", async () => {
    const res = await testRequest(await createTestApp()).get(
      "/api/v1/use-case-lifecycle/intake-submissions",
    );
    expect(res.status).toBe(400);
  });

  it("reports time in review from first submission to approval over the last 12 months", async () => {
    const { orgId, formId, api } = await seedOrg();
    // Submitted → approved: 2, 4 and 9 days; the 9 runs from a superseded first try.
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "12 days",
      reviewedAgo: "10 days",
    });
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "24 days",
      reviewedAgo: "20 days",
    });
    const firstTry = await submission(orgId, formId, {
      status: "superseded",
      createdAgo: "39 days",
    });
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "33 days",
      reviewedAgo: "30 days",
      originalId: firstTry,
    });
    // Outside the window, rejected, still pending, or a model: not counted.
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "500 days",
      reviewedAgo: "400 days",
    });
    await submission(orgId, formId, {
      status: "rejected",
      createdAgo: "60 days",
      reviewedAgo: "1 day",
    });
    await submission(orgId, formId, { status: "pending", createdAgo: "80 days" });
    await submission(orgId, formId, {
      status: "approved",
      entityType: "model",
      createdAgo: "90 days",
      reviewedAgo: "1 day",
    });

    const res = await api.get("/api/v1/use-case-lifecycle/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.data.review_time).toEqual({
      approved: 3,
      median_days: 4,
      average_days: 5,
      period_months: 12,
    });
  });

  it("limits time in review to use cases a non-admin can see", async () => {
    const { orgId, userId, formId, api } = await seedOrg("Reviewer");
    const adminId = await createTestUser(orgId, 1, `admin-${Date.now()}@test.com`, "Pw123456!");
    const mine = await createTestProject(orgId, userId);
    const notMine = await createTestProject(orgId, adminId);
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "6 days",
      reviewedAgo: "4 days",
      entityId: mine,
    });
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "16 days",
      reviewedAgo: "6 days",
      entityId: notMine,
    });

    const reviewer = await api.get("/api/v1/use-case-lifecycle/dashboard");
    expect(reviewer.body.data.review_time).toMatchObject({ approved: 1, median_days: 2 });

    const admin = await (
      await appFor(orgId, adminId, "Admin")
    ).get("/api/v1/use-case-lifecycle/dashboard");
    expect(admin.body.data.review_time).toMatchObject({ approved: 2, median_days: 6 });
  });

  it("reports no review time when nothing was approved", async () => {
    const { api } = await seedOrg();
    const res = await api.get("/api/v1/use-case-lifecycle/dashboard");
    expect(res.body.data.review_time).toEqual({
      approved: 0,
      median_days: null,
      average_days: null,
      period_months: 12,
    });
  });
});
