jest.setTimeout(60000);

const mockEnqueue = jest.fn();
jest.mock("../../services/automations/automationProducer", () => ({
  ...jest.requireActual("../../services/automations/automationProducer"),
  enqueueAutomationAction: (...args: unknown[]) => mockEnqueue(...args),
}));

// Must stay before the app's modules: setup.ts stubs inAppNotification.service.
import { createTestApp, testRequest } from "./setup";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

/**
 * Training record writes with active training automations: a record outside
 * the organization is a 404 (not a crash in the automation step), an update
 * with nothing to write is a 400, and real changes still fire the automation.
 */

let counter = 0;
const admin = (orgId: number) => {
  counter += 1;
  return createTestUser(orgId, 1, `training-auto-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

async function apiAs(orgId: number, userId: number) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: "Admin" },
  });
  return testRequest(app);
}

async function createTraining(orgId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO trainingregistar (organization_id, training_name, duration, provider, description)
     VALUES (:orgId, 'AI literacy', '2 hours', 'Acme', 'Basics') RETURNING id`,
    { replacements: { orgId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function activateAutomation(orgId: number, triggerKey: string) {
  const [trigger] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_triggers WHERE key = :triggerKey`,
    { replacements: { triggerKey }, type: QueryTypes.SELECT },
  );
  const [action] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_actions ORDER BY id LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const [automation] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active)
     VALUES (:orgId, :triggerKey, :triggerId, true) RETURNING id`,
    { replacements: { orgId, triggerKey, triggerId: trigger.id }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     VALUES (:orgId, :automationId, :actionId, :params, 1)`,
    {
      replacements: {
        orgId,
        automationId: automation.id,
        actionId: action.id,
        params: JSON.stringify({ subject: "Training {{training.name}}", body: "Changed" }),
      },
    },
  );
}

describe("Training record writes with active automations", () => {
  let orgId: number;
  let api: Awaited<ReturnType<typeof apiAs>>;
  let foreignTraining: number;

  beforeEach(async () => {
    mockEnqueue.mockClear();
    orgId = await createTestOrganization("Training automations");
    api = await apiAs(orgId, await admin(orgId));
    await activateAutomation(orgId, "training_updated");
    await activateAutomation(orgId, "training_deleted");
    foreignTraining = await createTraining(await createTestOrganization("Other"));
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("answers 404 for a record of another organization and fires nothing", async () => {
    expect(
      (await api.patch(`/api/training/${foreignTraining}`).send({ duration: "1 h" })).status,
    ).toBe(404);
    expect((await api.delete(`/api/training/${foreignTraining}`)).status).toBe(404);
    expect((await api.patch("/api/training/999999").send({ duration: "1 h" })).status).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();

    const [rows] = await sequelize.query(
      `SELECT duration FROM trainingregistar WHERE id = :foreignTraining`,
      { replacements: { foreignTraining } },
    );
    expect(rows).toEqual([{ duration: "2 hours" }]);
  });

  it("answers 400 for an update with nothing to write", async () => {
    const id = await createTraining(orgId);
    for (const body of [{}, { unknown_field: "x" }, { numberOfPeople: null }]) {
      const res = await api.patch(`/api/training/${id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.data).toBe("No fields to update");
    }
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("still fires the automations for real changes", async () => {
    const id = await createTraining(orgId);

    const updated = await api.patch(`/api/training/${id}`).send({ duration: "3 hours" });
    expect(updated.status).toBe(202);
    expect(updated.body.data.duration).toBe("3 hours");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    expect((await api.delete(`/api/training/${id}`)).status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue.mock.calls[1][1]).toMatchObject({ subject: "Training AI literacy" });
  });
});
