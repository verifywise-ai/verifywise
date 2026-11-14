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

    // 250 characters plus padding: trimmed it fits, stored it would overflow VARCHAR(255).
    const longTitle = await ctx.request
      .post("/api/policies")
      .send(policyPayload({ title: "A".repeat(250) + " ".repeat(10) }));
    expect(longTitle.status).toBe(400);
    expect(longTitle.body.data.errors[0].field).toBe("title");

    const numericDate = await ctx.request
      .post("/api/policies")
      .send(policyPayload({ next_review_date: 1700000000000 }));
    expect(numericDate.status).toBe(400);
    expect(numericDate.body.data.errors[0].field).toBe("next_review_date");

    // A status outside the CHECK constraint used to be a 500.
    const badStatus = await ctx.request
      .post("/api/policies")
      .send(policyPayload({ status: "Custom" }));
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.data.errors[0].field).toBe("status");

    // The legacy endpoint keeps accepting a short title.
    const legacy = await ctx.request.post("/api/policies").send(policyPayload({ title: "P" }));
    expect(legacy.status).toBe(201);
  });

  it("accepts a policy without tags or review date, and clears tags on update (P-L6)", async () => {
    const ctx = await buildTenantContext();
    const noTags = await ctx.request
      .post("/api/policies")
      .send({ title: "No tags policy", content_html: "<p>x</p>", status: "Draft" });
    expect(noTags.status).toBe(201);
    expect(noTags.body.data.tags).toEqual([]);
    expect(noTags.body.data.next_review_date).toBeNull();

    const emptyDate = await ctx.request
      .post("/api/policies")
      .send(policyPayload({ next_review_date: "" }));
    expect(emptyDate.status).toBe(201);
    expect(emptyDate.body.data.next_review_date).toBeNull();

    const tagged = await createPolicy(ctx, { tags: ["Privacy", "Security"] });
    const cleared = await ctx.request
      .put(`/api/policies/${tagged}`)
      .send({ tags: [], next_review_date: null });
    expect(cleared.status).toBe(202);
    expect(cleared.body.data.tags).toEqual([]);
    expect(cleared.body.data.next_review_date).toBeNull();
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

  it("returns the review date as the same UTC-midnight value on any server time zone (P-M1)", async () => {
    // Run this suite with TZ east of UTC (e.g. Europe/Istanbul) to cover the bug:
    // node-pg used to read the stored midnight as local time, a day early.
    const ctx = await buildTenantContext();
    const created = await ctx.request.post("/api/policies").send(policyPayload());
    expect(created.status).toBe(201);
    expect(created.body.data.next_review_date).toBe("2030-01-15T00:00:00.000Z");

    const read = await ctx.request.get(`/api/policies/${created.body.data.id}`);
    expect(read.body.data[0].next_review_date).toBe("2030-01-15T00:00:00.000Z");

    const list = await ctx.request.get("/api/policies");
    const listed = list.body.data.find((p: { id: number }) => p.id === created.body.data.id);
    expect(listed.next_review_date).toBe("2030-01-15T00:00:00.000Z");
  });

  it("repairs review dates the old picker shifted (P-M1 migration)", async () => {
    const ctx = await buildTenantContext();
    const shiftedEast = await createPolicy(ctx);
    const shiftedWest = await createPolicy(ctx);
    const midnight = await createPolicy(ctx);
    // Istanbul picked 15 Jan -> stored 14 Jan 21:00; Toronto picked 15 Jan -> 15 Jan 05:00.
    await sequelize.query(
      `UPDATE policy_manager SET next_review_date = CASE id
         WHEN :east THEN TIMESTAMP '2030-01-14 21:00'
         WHEN :west THEN TIMESTAMP '2030-01-15 05:00'
         ELSE next_review_date END
       WHERE id IN (:east, :west)`,
      { replacements: { east: shiftedEast, west: shiftedWest } },
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const migration = require("../../database/migrations/20261114090000-policy-review-date-calendar-day.js");
    await migration.up({ sequelize });

    const rows = await sequelize.query<{ id: number; day: string }>(
      `SELECT id, to_char(next_review_date, 'YYYY-MM-DD HH24:MI') AS day
         FROM policy_manager WHERE id IN (:ids) ORDER BY id`,
      { replacements: { ids: [shiftedEast, shiftedWest, midnight] }, type: QueryTypes.SELECT },
    );
    expect(rows.map((r) => r.day)).toEqual([
      "2030-01-15 00:00",
      "2030-01-15 00:00",
      "2030-01-15 00:00",
    ]);
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
