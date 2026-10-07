jest.setTimeout(60000);

// Mock only the Redis transport: the notifier under test is REAL, so this file
// proves actual `notifications` rows are written. The integration setup module
// is deliberately NOT imported — it would replace the whole notifier module
// with stubs, and this feature spends its verification budget on the real row.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
  REDIS_URL: "redis://localhost:6379/0",
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers, seedFrameworks } from "./helpers";
import { sequelize } from "../../database/db";
import {
  createTestProject,
  createTestRisk,
  linkRiskToProject,
  createTestModelInventory,
  createTestModelRisk,
  linkModelToProject,
} from "../factories";
import { notifyModelRiskCandidates } from "../../services/riskLinks/modelCandidates";
import { notifyRiskOfModelCandidates } from "../../services/inAppNotification.service";

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

interface NotificationRow {
  user_id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  message: string;
}

const notificationRows = async (orgId: number): Promise<NotificationRow[]> =>
  (await sequelize.query(
    `SELECT user_id, type, entity_type, entity_id, message
       FROM notifications
      WHERE organization_id = :orgId
      ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as NotificationRow[];

/*
 * No factory writes risk_links rows, so the dismissed pair below is one
 * narrowly-scoped INSERT — every entity (org, user, project, risk, model,
 * model risk, links) comes from factories, mirroring hierarchy.test.ts.
 */
const insertDismissedModelLink = (orgId: number, riskId: number, modelRiskId: number) =>
  sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
     VALUES (:orgId, :riskId, :modelRiskId, 'inherits_from', 'dismissed', 'user')`,
    { replacements: { orgId, riskId, modelRiskId } },
  );

describe("model risk candidate notices", () => {
  it("notifies each owned risk sharing the model's project", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const project = await createTestProject(seed.orgA, seed.userA, {});
    const riskA = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    const riskB = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, riskA, project);
    await linkRiskToProject(seed.orgA, riskB, project);
    const model = await createTestModelInventory(seed.orgA, { model: "Scorecard v1" });
    await linkModelToProject(seed.orgA, model, project, 1);
    await createTestModelRisk(seed.orgA, { model_id: model });
    await createTestModelRisk(seed.orgA, { model_id: model });

    const summary = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard v1",
      projectIds: [project],
    });

    expect(summary).toEqual({
      organization_id: seed.orgA,
      model_inventory_id: model,
      risks: 2,
      candidates: 4,
      notified: 2,
    });

    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: seed.userA,
      type: "model_risk_candidates",
      entity_type: "risk",
      entity_id: riskA,
    });
    expect(rows[1]).toMatchObject({ entity_id: riskB });
    expect(rows[0].message).toContain("Scorecard v1");
  });

  it("a dismissed pair is not a candidate", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const project = await createTestProject(seed.orgA, seed.userA, {});
    const dismissed = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    const fresh = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, dismissed, project);
    await linkRiskToProject(seed.orgA, fresh, project);
    const model = await createTestModelInventory(seed.orgA, {});
    await linkModelToProject(seed.orgA, model, project, 1);
    const modelRisk = await createTestModelRisk(seed.orgA, { model_id: model });
    await insertDismissedModelLink(seed.orgA, dismissed, modelRisk);

    const summary = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [project],
    });

    expect(summary).toEqual({
      organization_id: seed.orgA,
      model_inventory_id: model,
      risks: 1,
      candidates: 1,
      notified: 1,
    });

    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_id).toBe(fresh);
  });

  it("does not re-notify a risk when the model later gains another project", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const projectOne = await createTestProject(seed.orgA, seed.userA, {});
    const projectTwo = await createTestProject(seed.orgA, seed.userA, {});
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, projectOne);
    await linkRiskToProject(seed.orgA, risk, projectTwo);
    const model = await createTestModelInventory(seed.orgA, {});
    await linkModelToProject(seed.orgA, model, projectOne, 1);
    await linkModelToProject(seed.orgA, model, projectTwo, 1);
    await createTestModelRisk(seed.orgA, { model_id: model });

    const first = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [projectOne],
    });
    expect(first.notified).toBe(1);

    // The model gains a second project the risk also sits in. The same
    // (risk, model) pair must not be announced a second time.
    const second = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [projectTwo],
    });
    expect(second.notified).toBe(0);

    const rows = await notificationRows(seed.orgA);
    expect(rows.filter((row) => row.entity_id === risk)).toHaveLength(1);
  });

  it("re-notifies the same risk when a genuinely new model risk appears", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const project = await createTestProject(seed.orgA, seed.userA, {});
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    const model = await createTestModelInventory(seed.orgA, {});
    await linkModelToProject(seed.orgA, model, project, 1);
    await createTestModelRisk(seed.orgA, { model_id: model });

    const first = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [project],
    });
    expect(first.notified).toBe(1);

    // A new model risk is a new event even though the (risk, model) pair was
    // already announced; the same new model risk twice is silent.
    const mr2 = await createTestModelRisk(seed.orgA, { model_id: model });
    const second = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [project],
      modelRiskIds: [mr2],
    });
    expect(second.notified).toBe(1);

    const third = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [project],
      modelRiskIds: [mr2],
    });
    expect(third.notified).toBe(0);
  });

  it("concurrent duplicate notices collapse to one row", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const project = await createTestProject(seed.orgA, seed.userA, {});
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    const model = await createTestModelInventory(seed.orgA, {});
    await linkModelToProject(seed.orgA, model, project, 1);
    await createTestModelRisk(seed.orgA, { model_id: model });

    const riskRef = { id: risk, risk_name: "R", risk_owner: seed.userA };
    const modelRef = { id: model, name: "M" };
    const [a, b] = await Promise.all([
      notifyRiskOfModelCandidates(seed.orgA, riskRef, modelRef, 1),
      notifyRiskOfModelCandidates(seed.orgA, riskRef, modelRef, 1),
    ]);

    // Exactly one send; the loser is suppressed by the unique index, not an error.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const rows = await notificationRows(seed.orgA);
    expect(rows.filter((row) => row.entity_id === risk)).toHaveLength(1);
  });

  it("a model with zero model risks notifies nobody", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const project = await createTestProject(seed.orgA, seed.userA, {});
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    const model = await createTestModelInventory(seed.orgA, {});
    await linkModelToProject(seed.orgA, model, project, 1);

    const summary = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: model,
      modelName: "Scorecard",
      projectIds: [project],
    });

    expect(summary).toEqual({
      organization_id: seed.orgA,
      model_inventory_id: model,
      risks: 0,
      candidates: 0,
      notified: 0,
    });
    expect(await notificationRows(seed.orgA)).toHaveLength(0);
  });

  it("never returns another organization's risks", async () => {
    const seed = await seedTwoOrgsAndUsers();
    // Same project title, different project, different org.
    const projectA = await createTestProject(seed.orgA, seed.userA, {
      project_title: "Shared title",
    });
    const projectB = await createTestProject(seed.orgB, seed.userB, {
      project_title: "Shared title",
    });
    const riskA = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    const riskB = await createTestRisk(seed.orgB, { risk_owner: seed.userB });
    await linkRiskToProject(seed.orgA, riskA, projectA);
    await linkRiskToProject(seed.orgB, riskB, projectB);
    const modelA = await createTestModelInventory(seed.orgA, {});
    const modelB = await createTestModelInventory(seed.orgB, {});
    await linkModelToProject(seed.orgA, modelA, projectA, 1);
    await linkModelToProject(seed.orgB, modelB, projectB, 1);
    await createTestModelRisk(seed.orgA, { model_id: modelA });
    await createTestModelRisk(seed.orgB, { model_id: modelB });

    const summary = await notifyModelRiskCandidates({
      organizationId: seed.orgA,
      modelInventoryId: modelA,
      modelName: "Scorecard",
      projectIds: [projectA],
    });

    expect(summary.risks).toBe(1);
    expect(summary.notified).toBe(1);
    const rowsA = await notificationRows(seed.orgA);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].entity_id).toBe(riskA);
    expect(await notificationRows(seed.orgB)).toHaveLength(0);
  });
});
