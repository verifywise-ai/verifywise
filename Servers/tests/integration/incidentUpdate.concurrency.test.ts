jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { getIncidentByIdQuery } from "../../utils/incidentManagement.utils";
import { updateIncident } from "../../services/incidentManagement.service";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";
import { drawerSave } from "../../services/__tests__/helpers/incidentFixtures";
import { recordEntityCreation } from "../../utils/changeHistory.base.utils";

afterEach(async () => {
  await cleanupDatabase();
});

async function insertClosedApprovedIncident(orgId: number): Promise<number> {
  const [row] = await sequelize.query<{ id: number }>(
    `INSERT INTO ai_incident_managements (
       organization_id, ai_project, type, severity, status, occurred_date, date_detected,
       reporter, approval_status, approved_by, approval_date, approval_notes,
       categories_of_harm, description, relationship_causality, interim_report,
       created_at, updated_at, archived, is_demo
     ) VALUES (
       :orgId, 'Chatbot', 'Malfunction', 'Serious', 'Closed', '2026-09-20 00:00:00',
       '2026-09-21 00:00:00', 'Ada', 'Approved', 'Jane Doe', '2026-10-01 00:00:00',
       'Closure signed off', '["Economic Loss"]', 'Model produced unsafe output',
       'Direct cause', false, NOW(), NOW(), false, false
     ) RETURNING id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return row.id;
}

// The edit drawer's round trip against a real database: load the incident the
// way the API does, send back the drawer's payload with the version it loaded.
describe("updateIncident against the database", () => {
  it("accepts the drawer's save with the loaded version, then refuses a stale one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await insertClosedApprovedIncident(owner.orgId);

    const loaded = await getIncidentByIdQuery(incidentId, owner.orgId);
    expect(loaded).not.toBeNull();
    // mapToModel puts the updated_at column on updatedAt.
    expect(loaded!.dataValues).not.toHaveProperty("updated_at");
    const json = loaded!.toSafeJSON();

    const { expected_updated_at: expectedUpdatedAt, ...updates } = drawerSave(json, {
      status: "Investigating",
    });
    const saved = await updateIncident(owner.orgId, incidentId, updates, owner.userId, {
      expectedUpdatedAt,
    });

    expect(saved).not.toBeNull();
    expect(saved!.status).toBe("Investigating");
    expect(saved!.approval_status).toBe("Pending");
    expect(saved!.approved_by).toBeNull();
    expect(saved!.approval_date).toBeNull();
    expect(saved!.approval_notes).toBeNull();

    const history = await sequelize.query<{ field_name: string }>(
      `SELECT field_name FROM incident_change_history
        WHERE incident_id = :incidentId AND organization_id = :orgId`,
      { replacements: { incidentId, orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(history.map((h) => h.field_name).sort()).toEqual(
      ["Approval date", "Approval notes", "Approval status", "Approved by", "Status"].sort(),
    );

    // A second editor still holding the first version is refused.
    await expect(
      updateIncident(owner.orgId, incidentId, { status: "Open" }, owner.userId, {
        expectedUpdatedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// A name lookup that fails in Postgres must not abort the caller's
// transaction: it runs in a SAVEPOINT and the history falls back to the id.
describe("history name lookups on the caller's transaction", () => {
  it("keeps the creating transaction usable when a lookup errors in the database", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await insertClosedApprovedIncident(owner.orgId);

    // Turn the owner-name lookup into a real database error (division by zero).
    const realQuery = sequelize.query.bind(sequelize);
    const spy = jest
      .spyOn(sequelize, "query")
      .mockImplementation(((sql: unknown, options: unknown) =>
        realQuery(
          typeof sql === "string" && sql.includes("FROM users WHERE id = :userId")
            ? "SELECT 1/0 AS name"
            : (sql as string),
          options as any,
        )) as any);

    try {
      await sequelize.transaction(async (transaction) => {
        await recordEntityCreation(
          "incident",
          incidentId,
          owner.userId,
          owner.orgId,
          { status: "Open", assignee_id: owner.userId },
          transaction,
        );
        // Still usable after the failed lookup.
        await sequelize.query(
          "UPDATE ai_incident_managements SET reporter = 'Ada L.' WHERE id = :incidentId",
          { replacements: { incidentId }, transaction },
        );
      });
    } finally {
      spy.mockRestore();
    }

    const rows = await sequelize.query<{ field_name: string; new_value: string }>(
      `SELECT field_name, new_value FROM incident_change_history
        WHERE incident_id = :incidentId AND action = 'created'`,
      { replacements: { incidentId }, type: QueryTypes.SELECT },
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { field_name: "Owner", new_value: `User #${owner.userId}` },
        { field_name: "Status", new_value: "Open" },
      ]),
    );
    const [incident] = await sequelize.query<{ reporter: string }>(
      "SELECT reporter FROM ai_incident_managements WHERE id = :incidentId",
      { replacements: { incidentId }, type: QueryTypes.SELECT },
    );
    expect(incident.reporter).toBe("Ada L.");
  });
});
