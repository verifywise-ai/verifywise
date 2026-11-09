jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { createTestApp, testRequest } from "../setup";
import { cleanupDatabase, createTestUser } from "../helpers";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";
import { notifyAiAppAssessmentsAssigned } from "../../../services/inAppNotification.service";

// setup.ts replaces the notification service with mocks.
const notifyMock = notifyAiAppAssessmentsAssigned as jest.Mock;
const BASE = "/api/v1/ai-apps";
let counter = 0;

async function aiAppIn(ctx: TenantContext, ownerId: number | null): Promise<number> {
  counter += 1;
  const [rows] = await sequelize.query(
    `INSERT INTO ai_apps (organization_id, name, owner_id, status)
     VALUES (:orgId, :name, :ownerId, 'draft') RETURNING id`,
    { replacements: { orgId: ctx.orgId, name: `App ${counter}`, ownerId } },
  );
  return Number((rows as any[])[0].id);
}

async function questionnaireIn(ctx: TenantContext): Promise<number> {
  counter += 1;
  const res = await ctx.request.post(`${BASE}/questionnaires`).send({
    name: `Questionnaire ${counter}`,
    questions: [
      { label: "Data", weight: 1 },
      { label: "Users", weight: 3 },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** Another user in the same org, with their own authenticated client. */
async function colleagueOf(ctx: TenantContext, roleId: number, role: string) {
  counter += 1;
  const userId = await createTestUser(
    ctx.orgId,
    roleId,
    `colleague-${counter}-${Date.now()}@test.com`,
    "Password123!",
  );
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: ctx.orgId, role },
  });
  return { userId, request: testRequest(app) };
}

async function openAssessment(appId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT id FROM ai_app_assessments WHERE ai_app_id = :appId AND status = 'pending'`,
    { replacements: { appId } },
  );
  return Number((rows as any[])[0].id);
}

async function assessmentCount(appId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM ai_app_assessments WHERE ai_app_id = :appId`,
    { replacements: { appId } },
  );
  return (rows as any[])[0].total;
}

const validAnswers = { answers: { q1: 1, q2: 5 } };

describe("AI app assessment tenant isolation", () => {
  afterEach(async () => {
    notifyMock.mockClear();
    await cleanupDatabase();
  });

  it("treats another org's apps and questionnaires as nonexistent in bulk-assess", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerApp = await aiAppIn(owner, owner.userId);
    const ownerQuestionnaire = await questionnaireIn(owner);
    const attackerQuestionnaire = await questionnaireIn(attacker);
    const attackerApp = await aiAppIn(attacker, attacker.userId);

    const mixed = await attacker.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [ownerApp, attackerApp], questionnaire_id: attackerQuestionnaire });
    expect(mixed.status).toBe(200);
    expect(mixed.body.data).toMatchObject({ created: 1, already_open: 0, not_found: 1 });
    expect(await assessmentCount(ownerApp)).toBe(0);

    const foreignQuestionnaire = await attacker.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [attackerApp], questionnaire_id: ownerQuestionnaire });
    expect(foreignQuestionnaire.status).toBe(404);
  });

  it("keeps assessments, ids and worksheets inside the org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const appId = await aiAppIn(owner, owner.userId);
    const questionnaireId = await questionnaireIn(owner);
    const started = await owner.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [appId], questionnaire_id: questionnaireId });
    expect(started.body.data).toMatchObject({ created: 1, unassigned: 0, owners_notified: 0 });

    const again = await owner.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [appId], questionnaire_id: questionnaireId });
    expect(again.body.data).toMatchObject({ created: 0, already_open: 1 });

    const assessmentId = await openAssessment(appId);

    const ownerList = await owner.request.get(`${BASE}/assessments`);
    expect(ownerList.body.data.total).toBe(1);
    expect(ownerList.body.data.assessments[0]).toMatchObject({
      id: assessmentId,
      owner_id: owner.userId,
      can_answer: true,
    });

    const ids = await owner.request.get(`${BASE}/ids`);
    expect(ids.body.data.ids).toContain(appId);
    expect((await attacker.request.get(`${BASE}/ids`)).body.data.ids).not.toContain(appId);

    expect((await attacker.request.get(`${BASE}/assessments`)).body.data.total).toBe(0);
    expect((await attacker.request.get(`${BASE}/${appId}/assessments`)).status).toBe(404);
    expect(
      (await attacker.request.put(`${BASE}/assessments/${assessmentId}/answers`).send(validAnswers))
        .status,
    ).toBe(404);
    expect(
      (
        await attacker.request.get(`${BASE}/assessments/worksheet`).query({
          questionnaire_id: questionnaireId,
        })
      ).status,
    ).toBe(404);

    const cancelled = await attacker.request
      .post(`${BASE}/assessments/cancel`)
      .send({ assessment_ids: [assessmentId] });
    expect(cancelled.body.data.cancelled).toBe(0);

    const attackerQuestionnaire = await questionnaireIn(attacker);
    const foreignRow = await attacker.request.post(`${BASE}/assessments/answers`).send({
      questionnaire_id: attackerQuestionnaire,
      rows: [{ row_number: 2, assessment_id: assessmentId, answers: { q1: 1, q2: 1 } }],
    });
    expect(foreignRow.status).toBe(422);
    expect(foreignRow.body.data.errors[0].message).toBe("Unknown assessment");

    expect(await assessmentCount(appId)).toBe(1);
    const [row] = await sequelize.query(
      `SELECT status, organization_id FROM ai_app_assessments WHERE id = :id`,
      { replacements: { id: assessmentId } },
    );
    expect((row as any[])[0]).toMatchObject({ status: "pending", organization_id: owner.orgId });
  });

  it("scores a completed assessment once and sets the app's risk score", async () => {
    const { owner } = await seedTwoTenantContexts();
    const appId = await aiAppIn(owner, owner.userId);
    const questionnaireId = await questionnaireIn(owner);
    await owner.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [appId], questionnaire_id: questionnaireId });
    const assessmentId = await openAssessment(appId);

    const answered = await owner.request
      .put(`${BASE}/assessments/${assessmentId}/answers`)
      .send(validAnswers);
    expect(answered.status).toBe(200);
    expect(answered.body.data).toMatchObject({
      status: "completed",
      risk_score: 80,
      can_answer: false,
    });
    expect(answered.body.data.questions).toHaveLength(2);

    expect(
      (await owner.request.put(`${BASE}/assessments/${assessmentId}/answers`).send(validAnswers))
        .status,
    ).toBe(409);

    const [apps] = await sequelize.query(`SELECT risk_score FROM ai_apps WHERE id = :appId`, {
      replacements: { appId },
    });
    expect((apps as any[])[0].risk_score).toBe(80);
  });

  it("lets an app's owner answer without aiApp.edit, and nobody else", async () => {
    const { owner: admin } = await seedTwoTenantContexts();
    const appOwner = await colleagueOf(admin, 4, "Auditor");
    const otherAuditor = await colleagueOf(admin, 4, "Auditor");
    const ownedApp = await aiAppIn(admin, appOwner.userId);
    const unownedApp = await aiAppIn(admin, null);
    const questionnaireId = await questionnaireIn(admin);

    const started = await admin.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [ownedApp, unownedApp], questionnaire_id: questionnaireId });
    expect(started.body.data).toMatchObject({ created: 2, unassigned: 1 });

    const ownedAssessment = await openAssessment(ownedApp);
    const unownedAssessment = await openAssessment(unownedApp);

    const mine = await appOwner.request.get(`${BASE}/assessments`).query({ assigned_to_me: true });
    expect(mine.body.data.total).toBe(1);
    expect(mine.body.data.assessments[0]).toMatchObject({
      id: ownedAssessment,
      can_answer: true,
    });

    const otherView = await otherAuditor.request.get(`${BASE}/${ownedApp}/assessments`);
    expect(otherView.body.data.assessments[0].can_answer).toBe(false);

    const answers = `${BASE}/assessments/${ownedAssessment}/answers`;
    expect((await otherAuditor.request.put(answers).send(validAnswers)).status).toBe(403);
    expect(
      (
        await appOwner.request
          .put(`${BASE}/assessments/${unownedAssessment}/answers`)
          .send(validAnswers)
      ).status,
    ).toBe(403);

    const otherSheet = await otherAuditor.request.post(`${BASE}/assessments/answers`).send({
      questionnaire_id: questionnaireId,
      rows: [{ row_number: 2, assessment_id: ownedAssessment, answers: { q1: 1, q2: 1 } }],
    });
    expect(otherSheet.status).toBe(422);
    expect(otherSheet.body.data.errors[0].message).toBe("Unknown assessment");

    const ownSheet = await appOwner.request.post(`${BASE}/assessments/answers`).send({
      questionnaire_id: questionnaireId,
      rows: [{ row_number: 2, assessment_id: ownedAssessment, answers: { q1: 1, q2: 1 } }],
    });
    expect(ownSheet.status).toBe(200);
    expect(ownSheet.body.data).toMatchObject({ completed: 1, errors: [] });

    expect(
      (
        await otherAuditor.request
          .post(`${BASE}/bulk-assess`)
          .send({ app_ids: [ownedApp], questionnaire_id: questionnaireId })
      ).status,
    ).toBe(403);

    const anonymous = testRequest(await createTestApp());
    // authenticateJWT answers a missing token with 400.
    expect((await anonymous.get(`${BASE}/assessments`)).status).toBe(400);
  });

  it("sends each owner one summary and skips the requester", async () => {
    const { owner: admin } = await seedTwoTenantContexts();
    const appOwner = await colleagueOf(admin, 3, "Editor");
    const apps = [
      await aiAppIn(admin, appOwner.userId),
      await aiAppIn(admin, appOwner.userId),
      await aiAppIn(admin, admin.userId),
      await aiAppIn(admin, null),
    ];
    const questionnaireId = await questionnaireIn(admin);

    const res = await admin.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: apps, questionnaire_id: questionnaireId, notify_owners: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 4, unassigned: 1, owners_notified: 1 });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      admin.orgId,
      expect.objectContaining({ id: appOwner.userId }),
      2,
      expect.any(String),
    );

    // A second run creates nothing, so nobody hears about it again.
    notifyMock.mockClear();
    const repeat = await admin.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: apps, questionnaire_id: questionnaireId, notify_owners: true });
    expect(repeat.body.data).toMatchObject({ created: 0, already_open: 4, owners_notified: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("keeps the assessments when a summary can't be delivered", async () => {
    const { owner: admin } = await seedTwoTenantContexts();
    const appOwner = await colleagueOf(admin, 3, "Editor");
    const appId = await aiAppIn(admin, appOwner.userId);
    const questionnaireId = await questionnaireIn(admin);
    notifyMock.mockRejectedValueOnce(new Error("delivery down"));

    const res = await admin.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [appId], questionnaire_id: questionnaireId, notify_owners: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, owners_notified: 0 });
    expect(await assessmentCount(appId)).toBe(1);
  });

  it("does not notify anyone unless asked", async () => {
    const { owner: admin } = await seedTwoTenantContexts();
    const appOwner = await colleagueOf(admin, 3, "Editor");
    const appId = await aiAppIn(admin, appOwner.userId);
    const questionnaireId = await questionnaireIn(admin);

    const res = await admin.request
      .post(`${BASE}/bulk-assess`)
      .send({ app_ids: [appId], questionnaire_id: questionnaireId });
    expect(res.body.data).toMatchObject({ created: 1, owners_notified: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("imports only against the caller's vendors and users", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const [users] = await sequelize.query(`SELECT email FROM users WHERE id = :id`, {
      replacements: { id: owner.userId },
    });
    const ownerEmail = (users as any[])[0].email;

    const preview = await attacker.request.post(`${BASE}/import`).send({
      dry_run: true,
      rows: [{ row_number: 2, name: "Tool", owner_email: ownerEmail }],
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.errors[0]).toMatchObject({ row: 2, field: "owner_email" });

    const rejected = await attacker.request.post(`${BASE}/import`).send({
      dry_run: false,
      rows: [
        { row_number: 2, name: "Tool", owner_email: ownerEmail },
        { row_number: 3, name: "Fine" },
      ],
    });
    expect(rejected.status).toBe(422);
    const [none] = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM ai_apps WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId } },
    );
    expect((none as any[])[0].total).toBe(0);

    const committed = await attacker.request.post(`${BASE}/import`).send({
      dry_run: false,
      rows: [{ row_number: 2, name: "Fine", vendor: "New vendor", status: "Under review" }],
    });
    expect(committed.status).toBe(200);
    expect(committed.body.data).toMatchObject({ created: 1, new_vendors: ["New vendor"] });

    const repeat = await attacker.request.post(`${BASE}/import`).send({
      dry_run: false,
      rows: [{ row_number: 2, name: " FINE " }],
    });
    expect(repeat.body.data).toMatchObject({ created: 0 });
    expect(repeat.body.data.skipped).toHaveLength(1);

    const [vendors] = await sequelize.query(
      `SELECT website, vendor_provides, vendor_contact_person FROM vendors
       WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId } },
    );
    expect(vendors).toEqual([{ website: "", vendor_provides: "", vendor_contact_person: "" }]);
  });
});
