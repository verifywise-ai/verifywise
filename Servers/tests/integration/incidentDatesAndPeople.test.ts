jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestUser } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestIncident } from "../factories";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261123192509-incident-dates-and-people.js");

const ROUTE = "/api/ai-incident-managements";

const payload = (extra: Record<string, unknown>) => ({
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-24",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
  ...extra,
});

const fullName = async (userId: number): Promise<string> => {
  const rows = await sequelize.query<{ full_name: string }>(
    "SELECT CONCAT_WS(' ', name, surname) AS full_name FROM users WHERE id = :userId",
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return rows[0].full_name;
};

const columnTypes = async (): Promise<Record<string, string>> => {
  const rows = await sequelize.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'verifywise' AND table_name = 'ai_incident_managements'
        AND column_name IN ('occurred_date', 'date_detected', 'approval_date',
                            'reporter_id', 'approved_by_id')`,
    { type: QueryTypes.SELECT },
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
};

describe("incident dates (DATE columns) against the database", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores the three dates as DATE and the people as user foreign keys (SET NULL)", async () => {
    expect(await columnTypes()).toEqual({
      occurred_date: "date",
      date_detected: "date",
      approval_date: "date",
      reporter_id: "integer",
      approved_by_id: "integer",
    });
    const fks = await sequelize.query<{ column: string; on_delete: string }>(
      `SELECT a.attname AS column, c.confdeltype AS on_delete
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'verifywise.ai_incident_managements'::regclass
          AND c.contype = 'f'
          AND a.attname IN ('reporter_id', 'approved_by_id')
          AND c.confrelid = 'verifywise.users'::regclass`,
      { type: QueryTypes.SELECT },
    );
    expect(fks.map((fk) => [fk.column, fk.on_delete]).sort()).toEqual([
      ["approved_by_id", "n"],
      ["reporter_id", "n"],
    ]);
  });

  it("reads a DATE back as a YYYY-MM-DD string on raw queries, in any server time zone", async () => {
    const { owner } = await seedTwoTenantContexts();
    const id = await createTestIncident(owner.orgId, owner.userId);
    await sequelize.query(
      "UPDATE ai_incident_managements SET occurred_date = '2026-01-15' WHERE id = :id",
      { replacements: { id } },
    );
    const rows = await sequelize.query<{ occurred_date: unknown }>(
      "SELECT occurred_date FROM ai_incident_managements WHERE id = :id",
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(rows[0].occurred_date).toBe("2026-01-15");
  });

  it("migration keeps the stored day of each historical value, and down/up round-trips", async () => {
    const { owner } = await seedTwoTenantContexts();
    const ids = [
      await createTestIncident(owner.orgId, owner.userId),
      await createTestIncident(owner.orgId, owner.userId),
    ];
    const queryInterface = sequelize.getQueryInterface();
    await migration.down(queryInterface);
    try {
      expect((await columnTypes()).occurred_date).toBe("timestamp without time zone");
      // The drawer's "YYYY-MM-DD" (midnight) and a server Date stored as UTC
      // late in the day: both keep their day.
      await sequelize.query(
        `UPDATE ai_incident_managements
            SET occurred_date = '2026-03-10 00:00:00', date_detected = '2026-03-10 23:30:00',
                approval_date = '2026-03-11 00:00:00'
          WHERE id = :id`,
        { replacements: { id: ids[0] } },
      );
      await sequelize.query(
        `UPDATE ai_incident_managements
            SET occurred_date = '2025-12-31 23:59:59', date_detected = '2026-01-01 05:00:00',
                approval_date = NULL
          WHERE id = :id`,
        { replacements: { id: ids[1] } },
      );
    } finally {
      await migration.up(queryInterface);
    }
    expect(await columnTypes()).toEqual({
      occurred_date: "date",
      date_detected: "date",
      approval_date: "date",
      reporter_id: "integer",
      approved_by_id: "integer",
    });
    const rows = await sequelize.query<Record<string, unknown>>(
      `SELECT id, occurred_date, date_detected, approval_date
         FROM ai_incident_managements WHERE id IN (:ids) ORDER BY id`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      {
        id: ids[0],
        occurred_date: "2026-03-10",
        date_detected: "2026-03-10",
        approval_date: "2026-03-11",
      },
      { id: ids[1], occurred_date: "2025-12-31", date_detected: "2026-01-01", approval_date: null },
    ]);
    // up() again is a no-op on DATE columns.
    await expect(migration.up(queryInterface)).resolves.not.toThrow();
  });

  it("returns dates as YYYY-MM-DD from create, list and get, and stores an ISO date-time's date part", async () => {
    const { owner } = await seedTwoTenantContexts();
    const created = await owner.request.post(ROUTE).send(
      payload({
        reporter: "Ada Lovelace",
        occurred_date: "2026-06-23T23:30:00-07:00",
        date_detected: "2026-06-24",
      }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.occurred_date).toBe("2026-06-23");
    expect(created.body.data.date_detected).toBe("2026-06-24");

    const got = await owner.request.get(`${ROUTE}/${created.body.data.id}`);
    expect(got.body.data.occurred_date).toBe("2026-06-23");
    const list = await owner.request.get(ROUTE);
    const listed = list.body.data.find((i: { id: number }) => i.id === created.body.data.id);
    expect(listed.date_detected).toBe("2026-06-24");
  });
});

describe("incident reporter and approver users against the database", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("creates with a member as reporter_id: the reporter text is their full name", async () => {
    const { owner } = await seedTwoTenantContexts();
    const name = await fullName(owner.userId);

    const res = await owner.request
      .post(ROUTE)
      .send(payload({ reporter_id: owner.userId, reporter: "Alex" }));

    expect(res.status).toBe(201);
    expect(res.body.data.reporter_id).toBe(owner.userId);
    expect(res.body.data.reporter).toBe(name);
    const got = await owner.request.get(`${ROUTE}/${res.body.data.id}`);
    expect(got.body.data.reporter_name).toBe(name);
  });

  it("refuses a reporter_id from another organization with 400 and writes nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.post(ROUTE).send(payload({ reporter_id: attacker.userId }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("reporter_id");
    const count = await sequelize.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM ai_incident_managements WHERE organization_id = :orgId",
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(count[0].n).toBe(0);
  });

  it("accepts a reporter text without an id (Jira, Advisor, API) and requires one of the two", async () => {
    const { owner } = await seedTwoTenantContexts();

    const textOnly = await owner.request.post(ROUTE).send(payload({ reporter: "Grace Hopper" }));
    expect(textOnly.status).toBe(201);
    expect(textOnly.body.data.reporter).toBe("Grace Hopper");
    expect(textOnly.body.data.reporter_id).toBeNull();

    const neither = await owner.request.post(ROUTE).send(payload({}));
    expect(neither.status).toBe(400);
    expect(JSON.stringify(neither.body)).toContain("reporter");
  });

  it("changes the reporter by id on update, refuses another organization's user, and a new text clears the id", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const colleague = await createTestUser(
      owner.orgId,
      3,
      `colleague-${Date.now()}@test.local`,
      "Password123!",
    );
    const incidentId = await createTestIncident(owner.orgId, owner.userId);

    const byId = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ reporter_id: colleague });
    expect(byId.status).toBe(200);
    expect(byId.body.data.reporter_id).toBe(colleague);
    expect(byId.body.data.reporter).toBe(await fullName(colleague));

    const crossOrg = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ reporter_id: attacker.userId });
    expect(crossOrg.status).toBe(400);
    expect(JSON.stringify(crossOrg.body)).toContain("reporter_id");

    const byText = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ reporter: "Someone outside" });
    expect(byText.status).toBe(200);
    expect(byText.body.data.reporter).toBe("Someone outside");
    expect(byText.body.data.reporter_id).toBeNull();
  });

  it("records the approver's id, name and today's date (UTC) and clears them on Pending", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId);

    const approved = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ approval_status: "Approved", approved_by_id: 999999, approval_date: "2020-01-01" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.approved_by_id).toBe(owner.userId);
    expect(approved.body.data.approved_by).toBe(await fullName(owner.userId));
    expect(approved.body.data.approved_by_name).toBe(await fullName(owner.userId));
    expect(approved.body.data.approval_date).toBe(new Date().toISOString().slice(0, 10));

    const pending = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ approval_status: "Pending" });
    expect(pending.status).toBe(200);
    expect(pending.body.data.approved_by_id).toBeNull();
    expect(pending.body.data.approved_by).toBeNull();
    expect(pending.body.data.approval_date).toBeNull();
  });

  it("a deleted reporter leaves the stored name (the id is set to null)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const leaver = await createTestUser(
      owner.orgId,
      3,
      `leaver-${Date.now()}@test.local`,
      "Password123!",
    );
    const created = await owner.request.post(ROUTE).send(payload({ reporter_id: leaver }));
    expect(created.status).toBe(201);
    const name = await fullName(leaver);

    // Deleting the account (its membership goes with it; a user may not be
    // left without one).
    await sequelize.query("DELETE FROM users WHERE id = :id", { replacements: { id: leaver } });

    const got = await owner.request.get(`${ROUTE}/${created.body.data.id}`);
    expect(got.body.data.reporter_id).toBeNull();
    expect(got.body.data.reporter_name).toBeNull();
    expect(got.body.data.reporter).toBe(name);
  });
});
