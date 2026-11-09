jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import * as producer from "../../../services/automations/automationProducer";
import * as workflowTriggers from "../../../services/workflows/triggers";
import { createIncidentForImport } from "../../../services/incidentImport.service";
import { deleteIncidentByIdQuery } from "../../../utils/incidentManagement.utils";

async function insertProject(orgId: number, ownerId: number): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO projects (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
       goal, last_updated, last_updated_by, organization_id)
     VALUES ('Fraud model', :ownerId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { orgId, ownerId }, type: QueryTypes.SELECT },
  );
  return rows[0].id;
}

async function addIncidentAddedAutomation(orgId: number): Promise<void> {
  await sequelize.query(
    `WITH a AS (
       INSERT INTO automations (organization_id, name, trigger_id, is_active)
       SELECT :orgId, 'Incident email', t.id, TRUE FROM automation_triggers t WHERE t.key = 'incident_added'
       RETURNING id)
     INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     SELECT :orgId, a.id, act.id, '{"to": ["a@b.co"], "subject": "New", "body": "x"}'::jsonb, 1
       FROM a, automation_actions act WHERE act.key = 'send_email'`,
    { replacements: { orgId } },
  );
}

const input = (projectId: number, severity = "Serious") => ({
  projectId,
  aiProject: "Fraud model",
  type: "Malfunction",
  severity,
  status: "Open",
  reporter: "Jira sync",
  description: "Model flagged everyone\n\nDetails",
  occurredAt: new Date("2026-10-14T10:00:00Z"),
});

describe("createIncidentForImport", () => {
  let enqueue: jest.SpyInstance;
  let trigger: jest.SpyInstance;
  beforeEach(() => {
    enqueue = jest.spyOn(producer, "enqueueAutomationAction").mockResolvedValue(undefined as any);
    trigger = jest.spyOn(workflowTriggers, "triggerIncidentResponse").mockResolvedValue();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupDatabase();
  });

  it("creates the incident with system history", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction((t) =>
      createIncidentForImport(orgA, input(projectId), t),
    );
    const history = await sequelize.query<{
      changed_by_user_id: number | null;
      changed_by_system: boolean;
    }>(
      `SELECT changed_by_user_id, changed_by_system FROM incident_change_history
        WHERE organization_id = :orgA AND incident_id = :id`,
      { replacements: { orgA, id: created.id }, type: QueryTypes.SELECT },
    );
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.changed_by_user_id === null && h.changed_by_system)).toBe(true);
  });

  it("enqueues incident_added only after commit", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await addIncidentAddedAutomation(orgA);
    const projectId = await insertProject(orgA, userA);

    await expect(
      sequelize.transaction(async (t) => {
        await createIncidentForImport(orgA, input(projectId), t);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(enqueue).not.toHaveBeenCalled();

    await sequelize.transaction((t) => createIncidentForImport(orgA, input(projectId), t));
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("starts the incident response workflow for Very serious, after commit", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction(async (t) => {
      const incident = await createIncidentForImport(orgA, input(projectId, "Very serious"), t);
      expect(trigger).not.toHaveBeenCalled();
      return incident;
    });
    expect(trigger).toHaveBeenCalledWith(orgA, created.id, "Very serious");
  });

  it("delete marks the link deleted_in_verifywise and keeps it", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction((t) =>
      createIncidentForImport(orgA, input(projectId), t),
    );
    await sequelize.query(
      `INSERT INTO jira_incident_links (organization_id, incident_id, jira_issue_id, jira_issue_key, jira_url, state)
       VALUES (:orgA, :id, '10001', 'SEC-1', 'u', 'ok')`,
      { replacements: { orgA, id: created.id } },
    );
    await sequelize.transaction((t) => deleteIncidentByIdQuery(created.id!, orgA, t));
    const [link] = await sequelize.query<{ incident_id: number | null; state: string }>(
      `SELECT incident_id, state FROM jira_incident_links WHERE organization_id = :orgA`,
      { replacements: { orgA }, type: QueryTypes.SELECT },
    );
    expect(link).toEqual({ incident_id: null, state: "deleted_in_verifywise" });
  });
});
