jest.setTimeout(60000);

/**
 * Policy save correctness (Risks + Policies audit, PR B): the save returns
 * what was stored, automations run for policies without reviewers, invalid
 * input is a 400 with field errors, review dates keep their calendar day and
 * checklists survive the sanitizer.
 */

const mockEnqueue = jest.fn();
jest.mock("../../services/automations/automationProducer", () => ({
  ...jest.requireActual("../../services/automations/automationProducer"),
  enqueueAutomationAction: (...args: unknown[]) => mockEnqueue(...args),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase } from "./helpers";
import { buildTenantContext, TenantContext } from "./tenant-isolation/tenantIsolation.harness";

const policyPayload = (extra: Record<string, unknown> = {}) => ({
  title: `Save policy ${Date.now()}`,
  content_html: "<p>Body</p>",
  status: "Draft",
  tags: ["Privacy"],
  next_review_date: "2030-01-15",
  ...extra,
});

async function createPolicy(ctx: TenantContext, extra: Record<string, unknown> = {}) {
  const res = await ctx.request.post("/api/policies").send(policyPayload(extra));
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

async function activatePolicyUpdatedAutomation(orgId: number) {
  const [trigger] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_triggers WHERE key = 'policy_updated'`,
    { type: QueryTypes.SELECT },
  );
  const [action] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_actions ORDER BY id LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const [automation] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active)
     VALUES (:orgId, 'Policy updated', :triggerId, true) RETURNING id`,
    { replacements: { orgId, triggerId: trigger.id }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     VALUES (:orgId, :automationId, :actionId, :params, 1)`,
    {
      replacements: {
        orgId,
        automationId: automation.id,
        actionId: action.id,
        params: JSON.stringify({ subject: "Policy updated", body: "Updated" }),
      },
    },
  );
}

describe("Policy save correctness", () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns the stored values from an update, so a second save keeps them (P-H1)", async () => {
    const ctx = await buildTenantContext();
    const policyId = await createPolicy(ctx, { status: "Published" });

    const res = await ctx.request
      .put(`/api/policies/${policyId}`)
      .send({ status: "Draft", tags: ["Security", "Privacy"] });
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe("Draft");
    expect(res.body.data.tags).toEqual(["Security", "Privacy"]);
  });

  it("runs an active automation for a policy without reviewers (P-H2)", async () => {
    const ctx = await buildTenantContext();
    const policyId = await createPolicy(ctx);
    await activatePolicyUpdatedAutomation(ctx.orgId);

    const res = await ctx.request.put(`/api/policies/${policyId}`).send({ status: "Under Review" });
    expect(res.status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("returns field errors instead of a 500 for invalid input (P-L6)", async () => {
    const ctx = await buildTenantContext();

    const unknownTag = await ctx.request
      .post("/api/policies")
      .send(policyPayload({ tags: ["Not a tag"] }));
    expect(unknownTag.status).toBe(400);
    expect(unknownTag.body.data.errors[0].field).toBe("tags");

    const shortTitle = await ctx.request.post("/api/policies").send(policyPayload({ title: "P" }));
    expect(shortTitle.status).toBe(400);
    expect(shortTitle.body.data.errors[0].field).toBe("title");
  });

  it("accepts a policy without tags or review date, and clears tags on update (P-L6)", async () => {
    const ctx = await buildTenantContext();
    const noTags = await ctx.request
      .post("/api/policies")
      .send({ title: "No tags policy", content_html: "<p>x</p>", status: "Draft" });
    expect(noTags.status).toBe(201);
    expect(noTags.body.data.tags).toEqual([]);
    expect(noTags.body.data.next_review_date).toBeNull();

    const emptyTags = await createPolicy(ctx, { tags: [] });
    const cleared = await ctx.request.put(`/api/policies/${emptyTags}`).send({ tags: [] });
    expect(cleared.status).toBe(202);
    expect(cleared.body.data.tags).toEqual([]);
  });

  it("keeps the picked calendar day of the review date (P-M1)", async () => {
    const ctx = await buildTenantContext();
    const policyId = await createPolicy(ctx, { next_review_date: "2030-01-15" });

    const [row] = await sequelize.query<{ day: string }>(
      `SELECT to_char(next_review_date, 'YYYY-MM-DD HH24:MI') AS day FROM policy_manager WHERE id = :policyId`,
      { replacements: { policyId }, type: QueryTypes.SELECT },
    );
    expect(row.day).toBe("2030-01-15 00:00");
  });

  it("keeps task-list items as task items (P-M7)", async () => {
    const ctx = await buildTenantContext();
    const html =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>';
    const policyId = await createPolicy(ctx, { content_html: html });

    const res = await ctx.request.get(`/api/policies/${policyId}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].content_html).toContain('data-type="taskItem"');
  });
});
