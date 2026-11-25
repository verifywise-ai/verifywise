jest.setTimeout(60000);

/**
 * Mitigation is optional for every kind of risk: a risk can be created with
 * only the fields that identify it, and saved later without its mitigation.
 * A mitigation value that is sent empty ("" or null) is stored as none, and a
 * value that is sent is still checked.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase } from "./helpers";
import { buildTenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";

async function readRow(table: string, id: number): Promise<Record<string, any>> {
  const [row] = await sequelize.query<Record<string, any>>(
    `SELECT * FROM ${table} WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

describe("Creating a risk without its mitigation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("use case (project) risks, POST /api/projectRisks", () => {
    it("creates a risk with only the risk fields and stores no mitigation", async () => {
      const ctx = await buildTenantContext();
      const res = await ctx.request.post("/api/projectRisks").send({
        risk_name: `No mitigation ${Date.now()}`,
        risk_owner: ctx.userId,
        risk_description: "Accuracy drops over time",
        likelihood: "Possible",
        severity: "Major",
      });
      expect(res.status).toBe(201);

      const row = await readRow("risks", res.body.data.id);
      expect(row).toMatchObject({
        mitigation_status: null,
        current_risk_level: null,
        deadline: null,
        mitigation_plan: null,
        implementation_strategy: null,
        likelihood_mitigation: null,
        risk_severity: null,
        final_risk_level: null,
        risk_approval: null,
        approval_status: "Not required",
        date_of_assessment: null,
      });
      // The inherent level is still computed.
      expect(row.risk_level_autocalculated).toBe("High risk");
    });

    it("stores mitigation fields sent empty as none, as the form sends them", async () => {
      const ctx = await buildTenantContext();
      const res = await ctx.request.post("/api/projectRisks").send({
        risk_name: `Empty mitigation ${Date.now()}`,
        risk_owner: ctx.userId,
        risk_description: "Empty values",
        mitigation_status: "",
        current_risk_level: "",
        deadline: "",
        mitigation_plan: "",
        implementation_strategy: "",
        likelihood_mitigation: null,
        risk_severity: "",
        risk_approval: null,
        date_of_assessment: "",
      });
      expect(res.status).toBe(201);

      const row = await readRow("risks", res.body.data.id);
      expect(row.mitigation_status).toBeNull();
      expect(row.current_risk_level).toBeNull();
      expect(row.deadline).toBeNull();
      expect(row.likelihood_mitigation).toBeNull();
      expect(row.risk_severity).toBeNull();
      expect(row.final_risk_level).toBeNull();
      expect(row.date_of_assessment).toBeNull();
    });

    it("still refuses a mitigation value that is not valid", async () => {
      const ctx = await buildTenantContext();
      const base = {
        risk_name: `Bad mitigation ${Date.now()}`,
        risk_owner: ctx.userId,
        risk_description: "Bad values",
      };
      for (const bad of [
        { mitigation_status: "Soon" },
        { deadline: "next week" },
        { current_risk_level: "Huge" },
        { likelihood_mitigation: "Often" },
      ]) {
        const res = await ctx.request.post("/api/projectRisks").send({ ...base, ...bad });
        expect(res.status).toBe(400);
      }
    });

    it("clears every mitigation field of a saved risk with empty values", async () => {
      const ctx = await buildTenantContext();
      const created = await ctx.request.post("/api/projectRisks").send({
        risk_name: `Clear mitigation ${Date.now()}`,
        risk_owner: ctx.userId,
        risk_description: "Clear check",
        mitigation_status: "In Progress",
        current_risk_level: "Medium risk",
        deadline: "2030-01-15",
        mitigation_plan: "Plan",
        implementation_strategy: "Strategy",
        likelihood_mitigation: "Unlikely",
        risk_severity: "Minor",
      });
      expect(created.status).toBe(201);
      const riskId = created.body.data.id as number;
      expect((await readRow("risks", riskId)).final_risk_level).not.toBeNull();

      const res = await ctx.request.put(`/api/projectRisks/${riskId}`).send({
        mitigation_status: "",
        current_risk_level: "",
        deadline: "",
        mitigation_plan: "",
        implementation_strategy: "",
        likelihood_mitigation: "",
        risk_severity: "",
      });
      expect(res.status).toBe(200);

      const row = await readRow("risks", riskId);
      expect(row).toMatchObject({
        mitigation_status: null,
        current_risk_level: null,
        deadline: null,
        mitigation_plan: "",
        implementation_strategy: "",
        likelihood_mitigation: null,
        risk_severity: null,
        final_risk_level: null,
      });
    });
  });

  describe("vendor risks, POST /api/vendorRisks", () => {
    it("creates a vendor risk without an action plan", async () => {
      const ctx = await buildTenantContext();
      const vendorId = await createTestVendor(ctx.orgId);
      const res = await ctx.request.post("/api/vendorRisks").send({
        vendor_id: vendorId,
        risk_description: "Vendor outage",
        impact_description: "Service down",
        likelihood: "Possible",
        risk_severity: "Major",
        action_owner: ctx.userId,
      });
      expect(res.status).toBe(201);

      const row = await readRow("vendorrisks", res.body.data.id);
      expect(row.action_plan ?? "").toBe("");
    });

    it("saves an emptied action plan on an existing vendor risk", async () => {
      const ctx = await buildTenantContext();
      const vendorId = await createTestVendor(ctx.orgId);
      const created = await ctx.request.post("/api/vendorRisks").send({
        vendor_id: vendorId,
        risk_description: "Vendor outage",
        impact_description: "Service down",
        likelihood: "Possible",
        risk_severity: "Major",
        action_plan: "Second supplier",
        action_owner: ctx.userId,
      });
      expect(created.status).toBe(201);
      const vendorRiskId = created.body.data.id as number;

      const res = await ctx.request
        .patch(`/api/vendorRisks/${vendorRiskId}`)
        .send({ action_plan: "" });
      expect(res.status).toBe(202);
      expect((await readRow("vendorrisks", vendorRiskId)).action_plan ?? "").toBe("");
    });
  });

  describe("model risks, POST and PATCH /api/v1/model-risks", () => {
    const modelRisk = (ownerId: number, extra: Record<string, unknown> = {}) => ({
      risk_name: `Model drift ${Date.now()}`,
      risk_category: "Performance",
      likelihood: "Possible",
      severity: "Major",
      owner: ownerId,
      ...extra,
    });

    it("creates a model risk without a target date or mitigation plan", async () => {
      const ctx = await buildTenantContext();
      for (const extra of [{}, { target_date: "", mitigation_plan: "" }, { target_date: null }]) {
        const res = await ctx.request
          .post("/api/v1/model-risks")
          .send(modelRisk(ctx.userId, extra));
        expect(res.status).toBe(201);
        const row = await readRow("model_risks", res.body.data.id);
        expect(row.target_date).toBeNull();
        expect(row.mitigation_plan ?? "").toBe("");
      }
    });

    it("still refuses a target date that is not a date", async () => {
      const ctx = await buildTenantContext();
      const res = await ctx.request
        .post("/api/v1/model-risks")
        .send(modelRisk(ctx.userId, { target_date: "later" }));
      expect(res.status).toBe(400);
    });

    it("clears the target date of a saved model risk with an empty value", async () => {
      const ctx = await buildTenantContext();
      const created = await ctx.request
        .post("/api/v1/model-risks")
        .send(modelRisk(ctx.userId, { target_date: "2030-01-15" }));
      expect(created.status).toBe(201);
      const id = created.body.data.id as number;
      expect((await readRow("model_risks", id)).target_date).not.toBeNull();

      const res = await ctx.request.patch(`/api/v1/model-risks/${id}`).send({ target_date: "" });
      expect(res.status).toBeLessThan(300);
      expect((await readRow("model_risks", id)).target_date).toBeNull();
    });
  });
});
