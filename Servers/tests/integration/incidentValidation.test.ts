jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestIncident } from "../factories";

const ROUTE = "/api/ai-incident-managements";
const HISTORY_ROUTE = "/api/incident-change-history";

const VALID = {
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-20",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
};

const fieldsOf = (res: { body: any }) =>
  ((res.body?.data?.errors ?? []) as Array<{ field: string }>).map((e) => e.field).sort();

async function storedRow(id: number) {
  const [row] = await sequelize.query<Record<string, any>>(
    `SELECT status, severity, type, approval_status, categories_of_harm,
            TO_CHAR(occurred_date, 'YYYY-MM-DD') AS occurred_date,
            TO_CHAR(date_detected, 'YYYY-MM-DD') AS date_detected
       FROM ai_incident_managements WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

async function incidentCount(orgId: number): Promise<number> {
  const [{ count }] = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ai_incident_managements WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return Number(count);
}

describe("incident field validation against the database", () => {
  let orgId: number;
  let userId: number;
  let request: ReturnType<typeof testRequest>;

  beforeEach(async () => {
    const suffix = Date.now();
    orgId = await createTestOrganization(`Incident validation ${suffix}`);
    userId = await createTestUser(orgId, 1, `admin-${suffix}@test.com`, "Password123!");
    const app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });
    request = testRequest(app);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("create", () => {
    it("answers 400 listing every missing required field, saving nothing", async () => {
      const res = await request.post(ROUTE).send({ description: VALID.description });

      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toEqual(
        ["ai_project", "date_detected", "occurred_date", "reporter", "severity", "type"].sort(),
      );
      expect(await incidentCount(orgId)).toBe(0);
    });

    it.each([
      ["severity", "High"],
      ["status", "Banana"],
      ["type", "Banana"],
      ["approval_status", "Banana"],
      ["model_system_version", "v".repeat(256)],
      ["reporter", "r".repeat(256)],
      ["ai_project", "p".repeat(256)],
      ["categories_of_harm", 42],
      ["categories_of_harm", { a: 1 }],
      ["categories_of_harm", ["Health and Safety"]],
      ["occurred_date", "2999-01-01"],
    ])("answers 400 (not 500) for %s %p", async (field, value) => {
      const res = await request.post(ROUTE).send({ ...VALID, [field]: value });

      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toContain(field);
      expect(await incidentCount(orgId)).toBe(0);
    });

    it("answers 400 when detected is before occurred", async () => {
      const res = await request
        .post(ROUTE)
        .send({ ...VALID, occurred_date: "2026-06-23", date_detected: "2026-06-20" });

      expect(res.status).toBe(400);
      expect(res.body.data.errors).toEqual([
        {
          field: "date_detected",
          message: "date_detected cannot be earlier than occurred_date",
          code: "INVALID_DATE_ORDER",
        },
      ]);
    });

    it("stores Open and Pending when status and approval status are omitted", async () => {
      const res = await request.post(ROUTE).send(VALID);

      expect(res.status).toBe(201);
      expect(await storedRow(res.body.data.id)).toMatchObject({
        status: "Open",
        approval_status: "Pending",
      });
    });

    it("stores the comma-separated harm category form as a list", async () => {
      const res = await request
        .post(ROUTE)
        .send({ ...VALID, categories_of_harm: "Health, Rights" });

      expect(res.status).toBe(201);
      expect((await storedRow(res.body.data.id)).categories_of_harm).toEqual(["Health", "Rights"]);
    });

    it("records the saved values in change history", async () => {
      const res = await request.post(ROUTE).send(VALID);
      expect(res.status).toBe(201);

      const rows = await sequelize.query<{ field_name: string; new_value: string }>(
        `SELECT field_name, new_value FROM incident_change_history
          WHERE incident_id = :id AND action = 'created'`,
        { replacements: { id: res.body.data.id }, type: QueryTypes.SELECT },
      );
      const byField = Object.fromEntries(rows.map((r) => [r.field_name, r.new_value]));
      // Defaults the request left out are recorded as saved.
      expect(byField["Status"]).toBe("Open");
      expect(byField["Approval status"]).toBe("Pending");
    });
  });

  describe("update", () => {
    let id: number;
    beforeEach(async () => {
      id = await createTestIncident(orgId, userId);
      await sequelize.query(
        `UPDATE ai_incident_managements
            SET occurred_date = '2026-06-20', date_detected = '2026-06-23'
          WHERE id = :id`,
        { replacements: { id } },
      );
    });

    it.each([
      ["status", null],
      ["severity", null],
      ["type", ""],
      ["reporter", null],
      ["severity", "High"],
      ["status", "Banana"],
      ["type", "Banana"],
      ["model_system_version", "v".repeat(256)],
      ["categories_of_harm", { a: 1 }],
      ["categories_of_harm", null],
      ["date_detected", "2999-01-01"],
    ])("answers 400 (not 500) for %s %p, leaving the row as it was", async (field, value) => {
      const before = await storedRow(id);
      const res = await request.patch(`${ROUTE}/${id}`).send({ [field]: value });

      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toEqual([field]);
      expect(await storedRow(id)).toEqual(before);
    });

    it("refuses a detected date before the stored occurred date", async () => {
      const res = await request.patch(`${ROUTE}/${id}`).send({ date_detected: "2026-06-19" });

      expect(res.status).toBe(400);
      expect(res.body.data.errors[0]).toMatchObject({
        field: "date_detected",
        code: "INVALID_DATE_ORDER",
      });
    });

    it("accepts moving both dates together and an omitted required field", async () => {
      const res = await request
        .patch(`${ROUTE}/${id}`)
        .send({ occurred_date: "2026-05-01", date_detected: "2026-05-02", status: "Closed" });

      expect(res.status).toBe(200);
      expect(await storedRow(id)).toMatchObject({
        occurred_date: "2026-05-01",
        date_detected: "2026-05-02",
        status: "Closed",
      });
    });
  });

  describe("read", () => {
    it("answers 404 for a missing incident and for another organization's", async () => {
      const otherOrg = await createTestOrganization(`Other org ${Date.now()}`);
      const otherUser = await createTestUser(
        otherOrg,
        1,
        `other-${Date.now()}@test.com`,
        "Password123!",
      );
      const foreignId = await createTestIncident(otherOrg, otherUser);

      const missing = await request.get(`${ROUTE}/987654`);
      const foreign = await request.get(`${ROUTE}/${foreignId}`);

      expect([missing.status, foreign.status]).toEqual([404, 404]);
      expect(missing.body.data).toBe("Incident not found");
    });

    it("answers 400 for an out-of-range change history limit, 200 within it", async () => {
      const id = await createTestIncident(orgId, userId);
      const statuses: number[] = [];
      for (const limit of ["-5", "12abc", "101", "0"]) {
        statuses.push((await request.get(`${HISTORY_ROUTE}/${id}?limit=${limit}`)).status);
      }
      expect(statuses).toEqual([400, 400, 400, 400]);
      expect((await request.get(`${HISTORY_ROUTE}/${id}?limit=100`)).status).toBe(200);
    });
  });
});
