jest.setTimeout(60000);

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));
const mockEnqueue = jest.fn();
jest.mock("../../services/automations/automationProducer", () => ({
  ...jest.requireActual("../../services/automations/automationProducer"),
  enqueueAutomationAction: (...args: unknown[]) => mockEnqueue(...args),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";

/**
 * Use case Settings saves (audit U-H3, U-M3, U-M4, U-L2): a save keeps what it
 * does not send, history records only real changes, the server stamps every
 * update, and the stats endpoint names the last editor.
 */

let counter = 0;
async function user(orgId: number, roleId = 1): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    roleId,
    `uc-settings-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function apiAs(orgId: number, userId: number) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: "Admin" },
  });
  return testRequest(app);
}

async function row(id: number): Promise<Record<string, any>> {
  const [rows] = await sequelize.query(
    `SELECT ai_risk_classification, high_risk_roles, goal, last_updated, last_updated_by
       FROM projects WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as any[])[0];
}

async function history(id: number): Promise<Array<Record<string, any>>> {
  const [rows] = await sequelize.query(
    `SELECT field_name, old_value, new_value FROM use_case_change_history
      WHERE use_case_id = :id AND action = 'updated' ORDER BY id`,
    { replacements: { id } },
  );
  return rows as any[];
}

/** A use case classified elsewhere (intake, MCP, the API), with no EU AI Act framework. */
async function classifiedUseCase(orgId: number, ownerId: number): Promise<number> {
  const id = await createTestProject(orgId, ownerId);
  await sequelize.query(
    `UPDATE projects
        SET ai_risk_classification = 'High risk', high_risk_roles = '{Provider}',
            goal = 'Old goal', description = 'Old description', start_date = '2026-11-17'
      WHERE id = :id`,
    { replacements: { id } },
  );
  return id;
}

async function activateProjectUpdatedAutomation(orgId: number) {
  const [trigger] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_triggers WHERE key = 'project_updated'`,
    { type: QueryTypes.SELECT },
  );
  const [action] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_actions ORDER BY id LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const [automation] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active)
     VALUES (:orgId, 'Use case updated', :triggerId, true) RETURNING id`,
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
        params: JSON.stringify({ subject: "Use case updated", body: "Updated" }),
      },
    },
  );
}

describe("use case Settings saves", () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("keeps the classification and roles when a save leaves them out", async () => {
    const orgId = await createTestOrganization();
    const adminId = await user(orgId);
    const id = await classifiedUseCase(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api.patch(`/api/v1/projects/${id}`).send({ goal: "New goal" }).expect(202);

    expect(await row(id)).toMatchObject({
      goal: "New goal",
      ai_risk_classification: "High risk",
      high_risk_roles: ["Provider"],
    });
  });

  it("records one history row for a description-only change, framework fields included", async () => {
    const orgId = await createTestOrganization();
    const adminId = await user(orgId);
    const id = await classifiedUseCase(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    // What the Settings form used to send with every save.
    await api
      .patch(`/api/v1/projects/${id}`)
      .send({
        description: "New description",
        framework: [1],
        monitored_regulations_and_standards: ["EU AI Act"],
        start_date: "2026-11-17",
      })
      .expect(202);

    expect(await history(id)).toEqual([
      { field_name: "Description", old_value: "Old description", new_value: "New description" },
    ]);
  });

  it("records the use case category, purpose, audience and deployment context", async () => {
    const orgId = await createTestOrganization();
    const adminId = await user(orgId);
    const id = await classifiedUseCase(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api
      .patch(`/api/v1/projects/${id}`)
      .send({
        use_case_category: "Generative AI",
        use_case_purpose: "Customer service",
        use_case_audience: "External",
        deployment_context: "Cloud",
      })
      .expect(202);

    expect(await history(id)).toEqual([
      { field_name: "Use case category", old_value: "-", new_value: "Generative AI" },
      { field_name: "Use case purpose", old_value: "-", new_value: "Customer service" },
      { field_name: "Use case audience", old_value: "-", new_value: "External" },
      { field_name: "Deployment context", old_value: "-", new_value: "Cloud" },
    ]);

    // Saving the same values again records nothing.
    await api
      .patch(`/api/v1/projects/${id}`)
      .send({ use_case_category: "Generative AI", deployment_context: "Cloud" })
      .expect(202);
    expect(await history(id)).toHaveLength(4);
  });

  it.each(["/api/projects", "/api/v1/projects"])(
    "sets last updated and its author itself on %s, ignoring the body",
    async (base) => {
      const orgId = await createTestOrganization();
      const adminId = await user(orgId);
      const otherId = await user(orgId, 3);
      const id = await classifiedUseCase(orgId, adminId);
      const api = await apiAs(orgId, adminId);
      const before = Date.now();

      await api
        .patch(`${base}/${id}`)
        .send({
          goal: "Stamped",
          last_updated: "2001-01-01T00:00:00.000Z",
          last_updated_by: otherId,
        })
        .expect(202);

      const stored = await row(id);
      expect(stored.last_updated_by).toBe(adminId);
      expect(new Date(stored.last_updated).getTime()).toBeGreaterThanOrEqual(before - 1000);
    },
  );

  it("does not stamp or fire the project-updated automation for a members-only update", async () => {
    const orgId = await createTestOrganization();
    const adminId = await user(orgId);
    const memberId = await user(orgId, 3);
    const id = await classifiedUseCase(orgId, adminId);
    await sequelize.query(
      `UPDATE projects SET last_updated = '2001-01-01T00:00:00Z', last_updated_by = :adminId
        WHERE id = :id`,
      { replacements: { id, adminId } },
    );
    await activateProjectUpdatedAutomation(orgId);
    const api = await apiAs(orgId, adminId);

    await api
      .patch(`/api/v1/projects/${id}`)
      .send({ members: [memberId] })
      .expect(202);

    const stored = await row(id);
    expect(new Date(stored.last_updated).toISOString()).toBe("2001-01-01T00:00:00.000Z");
    expect(mockEnqueue).not.toHaveBeenCalled();

    // A real column change does stamp and fire it.
    await api.patch(`/api/v1/projects/${id}`).send({ goal: "Changed" }).expect(202);
    expect(new Date((await row(id)).last_updated).getFullYear()).toBeGreaterThan(2001);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("returns the user who last updated the use case from stats", async () => {
    const orgId = await createTestOrganization();
    const adminId = await user(orgId);
    const id = await classifiedUseCase(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api.patch(`/api/v1/projects/${id}`).send({ goal: "Stats" }).expect(202);
    const res = await api.get(`/api/projects/stats/${id}`).expect(202);

    const updater = res.body.data.user.userWhoUpdated;
    expect(updater).toEqual({
      id: adminId,
      name: expect.any(String),
      surname: expect.any(String),
      email: expect.stringContaining("@test.com"),
    });
    expect(updater).not.toHaveProperty("password_hash");
  });
});
