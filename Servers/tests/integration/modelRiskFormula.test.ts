jest.setTimeout(60000);

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestModelRisk, createTestRisk } from "../factories/test-entities.factory";

/**
 * Use cases and models audit, decision 10: a model risk's level comes from
 * the shared likelihood x severity formula, mapped onto Low / Medium / High /
 * Critical, when the risk has both. Without both the hand-picked level stays.
 */

let counter = 0;

const riskRow = async (id: number) =>
  (
    await sequelize.query<{
      likelihood: string | null;
      severity: string | null;
      risk_level: string;
    }>(`SELECT likelihood, severity, risk_level FROM model_risks WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })
  )[0];

describe("model risk level from the formula", () => {
  let org: number;
  let admin: number;
  let api: ReturnType<typeof testRequest>;

  const body = (extra: Record<string, unknown> = {}) => ({
    risk_name: `Drift ${++counter}`,
    risk_category: "Performance",
    owner: String(admin),
    target_date: "2027-01-31",
    ...extra,
  });

  beforeAll(async () => {
    await cleanupDatabase();
    org = await createTestOrganization("Formula org");
    admin = await createTestUser(org, 1, `formula-admin-${Date.now()}@test.com`, "Pw123456!");
    api = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: admin, organizationId: org, role: "Admin" },
      }),
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("v1 create computes the level from likelihood and severity, ignoring a sent one", async () => {
    const res = await api
      .post("/api/v1/model-risks")
      .send(body({ likelihood: "Likely", severity: "Major", risk_level: "Low" }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      likelihood: "Likely",
      severity: "Major",
      risk_level: "High",
    });
    expect(await riskRow(res.body.data.id)).toEqual({
      likelihood: "Likely",
      severity: "Major",
      risk_level: "High",
    });
  });

  it("v1 create without a severity is a 400 naming the field", async () => {
    const res = await api.post("/api/v1/model-risks").send(body({ likelihood: "Likely" }));
    expect(res.status).toBe(400);
    const errors = res.body.data.errors as { field: string; message: string }[];
    expect(errors.map((e) => e.field)).toEqual(["severity"]);
    expect(errors[0].message).toMatch(/severity is required/);
  });

  it("v1 refuses a label that is not on the list", async () => {
    const res = await api
      .post("/api/v1/model-risks")
      .send(body({ likelihood: "Confirmed", severity: "Major" }));
    expect(res.status).toBe(400);
    expect(res.body.data.errors.map((e: { field: string }) => e.field)).toEqual(["likelihood"]);
  });

  it("legacy create keeps a hand-picked level when there is no severity", async () => {
    const res = await api
      .post("/api/modelRisks")
      .send(body({ likelihood: "rare", risk_level: "Critical" }));
    expect(res.status).toBe(201);
    expect(await riskRow(res.body.data.id)).toEqual({
      likelihood: "Rare",
      severity: null,
      risk_level: "Critical",
    });
  });

  it("legacy create refuses an unknown likelihood or severity with 400", async () => {
    const bad = await api
      .post("/api/modelRisks")
      .send(body({ likelihood: "Confirmed", risk_level: "High" }));
    expect(bad.status).toBe(400);
    expect(bad.body.data).toBe(
      "Likelihood must be one of: Rare, Unlikely, Possible, Likely, Almost Certain.",
    );
    const badSeverity = await api
      .post("/api/modelRisks")
      .send(body({ likelihood: "Rare", severity: "Critical", risk_level: "High" }));
    expect(badSeverity.status).toBe(400);
    expect(badSeverity.body.data).toBe(
      "Severity must be one of: Negligible, Minor, Moderate, Major, Catastrophic.",
    );
  });

  it("an update that sends only the severity recomputes from the stored likelihood", async () => {
    const created = await api
      .post("/api/v1/model-risks")
      .send(body({ likelihood: "Rare", severity: "Minor" }));
    const id = created.body.data.id;
    expect((await riskRow(id)).risk_level).toBe("Low");

    const res = await api.patch(`/api/v1/model-risks/${id}`).send({ severity: "Catastrophic" });
    expect(res.status).toBe(200);
    expect(await riskRow(id)).toEqual({
      likelihood: "Rare",
      severity: "Catastrophic",
      risk_level: "High",
    });

    // A level sent with both inputs stored is ignored, on the legacy route too.
    expect((await api.put(`/api/modelRisks/${id}`).send({ risk_level: "Low" })).status).toBe(200);
    expect((await riskRow(id)).risk_level).toBe("High");
  });

  it("an older risk without inputs keeps taking a hand-picked level on update", async () => {
    const id = await createTestModelRisk(org, { risk_level: "Medium" });
    const res = await api.patch(`/api/v1/model-risks/${id}`).send({ risk_level: "Critical" });
    expect(res.status).toBe(200);
    expect((await riskRow(id)).risk_level).toBe("Critical");
  });

  it("flags a confirmed inheriting link when the formula moves the level", async () => {
    const created = await api
      .post("/api/v1/model-risks")
      .send(body({ likelihood: "Rare", severity: "Minor" }));
    const modelRisk = created.body.data.id;
    const child = await createTestRisk(org, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:org, :child, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { org, child, modelRisk } },
    );
    const flag = async () =>
      (
        await sequelize.query<{ changed: unknown }>(
          `SELECT parent_level_changed_at AS changed FROM risk_links
            WHERE source_risk_id = :child AND target_model_risk_id = :modelRisk`,
          { replacements: { child, modelRisk }, type: QueryTypes.SELECT },
        )
      )[0].changed;

    // Same level (Rare x Negligible is Low too): no flag.
    await api.patch(`/api/v1/model-risks/${modelRisk}`).send({ severity: "Negligible" });
    expect(await flag()).toBeNull();

    await api.patch(`/api/v1/model-risks/${modelRisk}`).send({ severity: "Catastrophic" });
    expect(await flag()).not.toBeNull();
  });
});
