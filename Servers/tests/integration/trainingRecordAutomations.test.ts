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

/**
 * An active automation on `triggerKey` with `actionCount` actions (subjects
 * "<name> 1", "<name> 2", ...); `legacy` marks it legacy_first_action_only.
 */
async function activateAutomation(
  orgId: number,
  triggerKey: string,
  {
    actionCount = 1,
    legacy = false,
    name = "",
  }: { actionCount?: number; legacy?: boolean; name?: string } = {},
) {
  const [trigger] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_triggers WHERE key = :triggerKey`,
    { replacements: { triggerKey }, type: QueryTypes.SELECT },
  );
  const [action] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_actions ORDER BY id LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const [automation] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active, legacy_first_action_only)
     VALUES (:orgId, :triggerKey, :triggerId, true, :legacy) RETURNING id`,
    {
      replacements: { orgId, triggerKey, triggerId: trigger.id, legacy },
      type: QueryTypes.SELECT,
    },
  );
  for (let order = 1; order <= actionCount; order += 1) {
    await sequelize.query(
      `INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
       VALUES (:orgId, :automationId, :actionId, :params, :order)`,
      {
        replacements: {
          orgId,
          automationId: automation.id,
          actionId: action.id,
          order,
          params: JSON.stringify({
            subject: name ? `${name} ${order}` : "Training {{training.name}}",
            body: "Changed",
          }),
        },
      },
    );
  }
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

  it("runs every action of every active automation; a legacy one keeps the event's first", async () => {
    const id = await createTraining(orgId);
    await activateAutomation(orgId, "training_added", { actionCount: 2, name: "A" });
    await activateAutomation(orgId, "training_added", { actionCount: 1, name: "B" });

    const created = await api.post("/api/training").send({
      training_name: "Course",
      duration: "1 hour",
      provider: "Acme",
      department: "Ops",
      status: "Planned",
      numberOfPeople: 3,
      description: "x",
    });
    expect(created.status).toBe(201);
    expect(mockEnqueue.mock.calls.map(([, data]) => data.subject)).toEqual(["A 1", "A 2", "B 1"]);

    // Legacy automations on training_updated: of them, only the event's first runs.
    mockEnqueue.mockClear();
    await activateAutomation(orgId, "training_updated", {
      actionCount: 2,
      name: "L",
      legacy: true,
    });
    await sequelize.query(
      `UPDATE automations SET legacy_first_action_only = true WHERE organization_id = :orgId`,
      { replacements: { orgId } },
    );
    await activateAutomation(orgId, "training_updated", { actionCount: 2, name: "N" });
    expect((await api.patch(`/api/training/${id}`).send({ duration: "4 hours" })).status).toBe(202);
    expect(mockEnqueue.mock.calls.map(([, data]) => data.subject)).toEqual([
      "Training AI literacy",
      "N 1",
      "N 2",
    ]);
  });
});
