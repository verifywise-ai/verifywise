jest.setTimeout(60000);

/**
 * Risk save correctness (Risks + Policies audit, PR C): partial edits leave the
 * owner and its history alone, cleared fields are stored, delete keeps custom
 * field values, long text is a 400, vendor risks accept "Almost certain" and
 * date-only deadlines keep their calendar day.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase } from "./helpers";
import { buildTenantContext, TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";

const riskPayload = (ownerId: number, extra: Record<string, unknown> = {}) => ({
  risk_name: `Save risk ${Date.now()}`,
  risk_owner: ownerId,
  risk_description: "Save check",
  review_notes: "Plan A",
  mitigation_plan: "Mitigate",
  mitigation_status: "In Progress",
  deadline: "2030-01-15T05:00:00.000Z",
  ...extra,
});

async function createRisk(ctx: TenantContext, extra: Record<string, unknown> = {}) {
  const res = await ctx.request.post("/api/projectRisks").send(riskPayload(ctx.userId, extra));
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

async function readRisk(id: number) {
  const [row] = await sequelize.query<Record<string, any>>(
    `SELECT risk_owner, review_notes, mitigation_plan, mitigation_status, deadline,
            date_of_assessment, risk_approval, is_deleted
       FROM risks WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

async function historyFields(riskId: number): Promise<string[]> {
  const rows = await sequelize.query<{ field_name: string }>(
    `SELECT field_name FROM project_risk_change_history WHERE project_risk_id = :riskId`,
    { replacements: { riskId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.field_name);
}

describe("Risk save correctness", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("does not touch or log the owner on an edit that leaves it out (R-H2)", async () => {
    const ctx = await buildTenantContext();
    const riskId = await createRisk(ctx);

    for (const notes of ["One", "Two", "Three"]) {
      const res = await ctx.request
        .put(`/api/projectRisks/${riskId}`)
        .send({ review_notes: notes });
      expect(res.status).toBe(200);
    }

    expect((await readRisk(riskId)).risk_owner).toBe(ctx.userId);
    expect(await historyFields(riskId)).not.toContain("risk_owner");
  });

  it("stores a cleared field instead of keeping the old value (R-M1)", async () => {
    const ctx = await buildTenantContext();
    const riskId = await createRisk(ctx);

    const res = await ctx.request.put(`/api/projectRisks/${riskId}`).send({
      review_notes: "",
      mitigation_plan: "",
      mitigation_status: null,
      deadline: null,
      risk_approval: null,
    });
    expect(res.status).toBe(200);

    const row = await readRisk(riskId);
    expect(row.review_notes).toBe("");
    expect(row.mitigation_plan).toBe("");
    expect(row.mitigation_status).toBeNull();
    expect(row.deadline).toBeNull();
    expect(row.risk_approval).toBeNull();
  });

  it("keeps a risk name that is sent empty on update, without a history entry", async () => {
    const ctx = await buildTenantContext();
    const riskId = await createRisk(ctx, { risk_name: "Keep me" });

    await ctx.request.put(`/api/projectRisks/${riskId}`).send({ risk_name: "" });
    expect(await historyFields(riskId)).not.toContain("risk_name");
    const [row] = await sequelize.query<{ risk_name: string }>(
      `SELECT risk_name FROM risks WHERE id = :riskId`,
      { replacements: { riskId }, type: QueryTypes.SELECT },
    );
    expect(row.risk_name).toBe("Keep me");
  });

  it("soft-deletes a risk and keeps its custom field values (R-M7)", async () => {
    const ctx = await buildTenantContext();
    const riskId = await createRisk(ctx);
    const [definition] = await sequelize.query<{ id: number }>(
      `INSERT INTO custom_field_definitions (organization_id, entity_type, field_key, label, field_type)
       VALUES (:orgId, 'project_risk', 'source_ref', 'Source ref', 'text') RETURNING id`,
      { replacements: { orgId: ctx.orgId }, type: QueryTypes.SELECT },
    );
    await sequelize.query(
      `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
       VALUES (:orgId, :definitionId, 'project_risk', :riskId, '"ABC-1"'::jsonb)`,
      { replacements: { orgId: ctx.orgId, definitionId: definition.id, riskId } },
    );

    const res = await ctx.request.delete(`/api/projectRisks/${riskId}`);
    expect(res.status).toBe(200);
    expect((await readRisk(riskId)).is_deleted).toBe(true);

    const values = await sequelize.query(
      `SELECT id FROM custom_field_values WHERE entity_type = 'project_risk' AND entity_id = :riskId`,
      { replacements: { riskId }, type: QueryTypes.SELECT },
    );
    expect(values).toHaveLength(1);

    const again = await ctx.request.delete(`/api/projectRisks/${riskId}`);
    expect(again.status).toBe(404);
  });

  it("returns a 400 instead of a 500 for text longer than the column (R-M6)", async () => {
    const ctx = await buildTenantContext();
    const longName = await ctx.request
      .post("/api/projectRisks")
      .send(riskPayload(ctx.userId, { risk_name: "A".repeat(5000) }));
    expect(longName.status).toBe(400);

    const riskId = await createRisk(ctx);
    for (const field of [
      "impact",
      "mitigation_evidence_document",
      "final_risk_level",
      "approval_status",
    ]) {
      const res = await ctx.request
        .put(`/api/projectRisks/${riskId}`)
        .send({ [field]: "B".repeat(256) });
      expect(res.status).toBe(400);
    }

    const atLimit = await ctx.request
      .put(`/api/projectRisks/${riskId}`)
      .send({ impact: "C".repeat(255) });
    expect(atLimit.status).toBe(200);
  });

  it("stores risk dates at noon UTC on the picked day (R-L4)", async () => {
    const ctx = await buildTenantContext();
    const riskId = await createRisk(ctx, {
      deadline: "2001-01-01",
      date_of_assessment: "2001-02-01",
    });

    let row = await readRisk(riskId);
    expect(new Date(row.deadline).toISOString()).toBe("2001-01-01T12:00:00.000Z");
    expect(new Date(row.date_of_assessment).toISOString()).toBe("2001-02-01T12:00:00.000Z");

    await ctx.request.put(`/api/projectRisks/${riskId}`).send({ deadline: "2001-03-01" });
    row = await readRisk(riskId);
    expect(new Date(row.deadline).toISOString()).toBe("2001-03-01T12:00:00.000Z");

    // An explicit time from an API, MCP or older client is stored as sent.
    for (const sent of ["2001-04-01T18:00:00.000Z", "2001-03-31T21:00:00.000Z"]) {
      await ctx.request.put(`/api/projectRisks/${riskId}`).send({ deadline: sent });
      row = await readRisk(riskId);
      expect(new Date(row.deadline).toISOString()).toBe(sent);
    }
  });

  it("migration moves stored local midnights to noon UTC and leaves other times (R-L4)", async () => {
    const ctx = await buildTenantContext();
    const cases: Array<[string, string]> = [
      ["2001-01-01T00:00:00.000Z", "2001-01-01T12:00:00.000Z"], // date-only from import or API
      ["2001-01-01T05:00:00.000Z", "2001-01-01T12:00:00.000Z"], // Toronto pick
      ["2000-12-31T21:00:00.000Z", "2001-01-01T12:00:00.000Z"], // Istanbul pick
      ["2000-12-31T18:30:00.000Z", "2001-01-01T12:00:00.000Z"], // India pick
      ["2000-12-31T11:00:00.000Z", "2001-01-01T12:00:00.000Z"], // New Zealand summer pick
      ["2001-01-01T12:00:00.000Z", "2001-01-01T12:00:00.000Z"], // already at noon: unchanged
      ["2001-01-01T10:00:00.000Z", "2001-01-01T12:00:00.000Z"], // Hawaii pick
      ["2001-01-01T14:23:41.512Z", "2001-01-01T14:23:41.512Z"], // a "now" timestamp
    ];
    const ids: number[] = [];
    for (const [stored] of cases) {
      const riskId = await createRisk(ctx);
      await sequelize.query(
        `UPDATE risks SET deadline = :stored, date_of_assessment = :stored WHERE id = :riskId`,
        { replacements: { stored, riskId } },
      );
      ids.push(riskId);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const migration = require("../../database/migrations/20261114120000-risk-dates-utc-noon.js");
    await migration.up(sequelize.getQueryInterface());
    // Running it again changes nothing.
    await migration.up(sequelize.getQueryInterface());

    for (const [index, [, expected]] of cases.entries()) {
      const row = await readRisk(ids[index]);
      expect(new Date(row.deadline).toISOString()).toBe(expected);
      expect(new Date(row.date_of_assessment).toISOString()).toBe(expected);
    }
  });

  it("saves a vendor risk with likelihood Almost certain in either casing (R-H6)", async () => {
    const ctx = await buildTenantContext();
    const vendorId = await createTestVendor(ctx.orgId);
    const payload = {
      vendor_id: vendorId,
      risk_description: "Vendor outage",
      impact_description: "Service down",
      likelihood: "Almost Certain",
      risk_severity: "Major",
      action_plan: "Second supplier",
      action_owner: ctx.userId,
      risk_level: "High risk",
    };

    const created = await ctx.request.post("/api/vendorRisks").send(payload);
    expect(created.status).toBe(201);
    const vendorRiskId = created.body.data.id as number;

    await sequelize.query(`UPDATE vendorrisks SET likelihood = 'Rare' WHERE id = :vendorRiskId`, {
      replacements: { vendorRiskId },
    });
    const updated = await ctx.request
      .patch(`/api/vendorRisks/${vendorRiskId}`)
      .send({ likelihood: "almost certain" });
    expect(updated.status).toBe(202);

    const [row] = await sequelize.query<{ likelihood: string }>(
      `SELECT likelihood FROM vendorrisks WHERE id = :vendorRiskId`,
      { replacements: { vendorRiskId }, type: QueryTypes.SELECT },
    );
    expect(row.likelihood).toBe("Almost certain");
  });
});
