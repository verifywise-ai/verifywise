jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";

/**
 * In review tab (#5188): pending use case intake submissions are listed from
 * intake_submissions (no project exists until approval), and the dashboard
 * reports how long approved submissions spent in review.
 */

let counter = 0;

async function seedOrg() {
  counter += 1;
  const orgId = await createTestOrganization();
  const userId = await createTestUser(
    orgId,
    1,
    `intake-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
  const [forms] = await sequelize.query(
    `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, schema, created_by)
     VALUES (:orgId, 'AI use case request', 'd', :slug, 'use_case', :schema, :userId) RETURNING id`,
    {
      replacements: {
        orgId,
        userId,
        slug: `form-${Date.now()}-${counter}`,
        schema: JSON.stringify({
          version: "1.0",
          fields: [
            { id: "f_title", type: "text", label: "Name", entityFieldMapping: "project_title" },
            { id: "f_goal", type: "text", label: "Goal" },
          ],
        }),
      },
    },
  );
  const formId = Number((forms as any[])[0].id);
  const api = testRequest(
    await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Reviewer" },
    }),
  );
  return { orgId, userId, formId, api };
}

async function submission(
  orgId: number,
  formId: number,
  opts: {
    title?: string;
    status?: string;
    entityType?: string;
    createdAgo?: string;
    reviewedAgo?: string;
  } = {},
): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO intake_submissions
       (organization_id, form_id, submitter_name, data, entity_type, status, created_at, reviewed_at)
     VALUES (:orgId, :formId, 'Sam', :data, :entityType, :status,
             NOW() - CAST(:createdAgo AS interval),
             NOW() - CAST(:reviewedAgo AS interval))
     RETURNING id`,
    {
      replacements: {
        orgId,
        formId,
        data: JSON.stringify(opts.title === undefined ? { f_goal: "x" } : { f_title: opts.title }),
        entityType: opts.entityType ?? "use_case",
        status: opts.status ?? "pending",
        createdAgo: opts.createdAgo ?? "0 days",
        reviewedAgo: opts.reviewedAgo ?? null,
      },
    },
  );
  return Number((rows as any[])[0].id);
}

describe("intake submissions in the In review tab", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only pending use case submissions, oldest first, with the mapped title", async () => {
    const { orgId, formId, api } = await seedOrg();
    const newer = await submission(orgId, formId, { title: "  Chatbot  ", createdAgo: "1 day" });
    const older = await submission(orgId, formId, { createdAgo: "5 days" });
    await submission(orgId, formId, { title: "Approved", status: "approved" });
    await submission(orgId, formId, { title: "Rejected", status: "rejected" });
    await submission(orgId, formId, { title: "Superseded", status: "superseded" });
    await submission(orgId, formId, { title: "A model", entityType: "model" });

    const res = await api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(res.status).toBe(200);
    const rows = res.body.data;
    expect(rows.map((r: any) => r.id)).toEqual([older, newer]);
    expect(rows[0]).toMatchObject({
      title: null,
      form_name: "AI use case request",
      submitter_name: "Sam",
      days_in_review: 5,
    });
    expect(rows[1]).toMatchObject({ title: "Chatbot", days_in_review: 1 });
    // Contact details stay on the review screen.
    expect(rows[0]).not.toHaveProperty("submitter_email");
  });

  it("never lists another organization's submissions", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    await submission(a.orgId, a.formId, { title: "Org A only" });

    const res = await b.api.get("/api/v1/use-case-lifecycle/intake-submissions");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("requires authentication", async () => {
    const res = await testRequest(await createTestApp()).get(
      "/api/v1/use-case-lifecycle/intake-submissions",
    );
    expect(res.status).toBe(400);
  });

  it("reports time in review for approved use case submissions over the last 12 months", async () => {
    const { orgId, formId, api } = await seedOrg();
    // Submitted → approved: 2, 4 and 9 days.
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
    await submission(orgId, formId, {
      status: "approved",
      createdAgo: "39 days",
      reviewedAgo: "30 days",
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
