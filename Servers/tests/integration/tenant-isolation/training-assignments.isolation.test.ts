jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const BASE = "/api/v1/training/assignments";
const DUE_DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

async function createTraining(orgId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO trainingregistar (organization_id, training_name)
     VALUES (:orgId, 'Isolation training') RETURNING id`,
    { replacements: { orgId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function snapshot(trainingId: number) {
  const [rows] = await sequelize.query(
    `SELECT id, organization_id, user_id, to_char(due_date, 'YYYY-MM-DD') AS due_date,
            completed_at, completed_by
       FROM training_assignments WHERE training_id = :trainingId ORDER BY id`,
    { replacements: { trainingId } },
  );
  return rows as Array<Record<string, unknown>>;
}

describe("Training assignments tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  async function seedAssignment() {
    const tenants = await seedTwoTenantContexts();
    const { owner } = tenants;
    const trainingId = await createTraining(owner.orgId);
    const created = await owner.request
      .post(BASE)
      .send({ training_id: trainingId, user_ids: [owner.userId], due_date: DUE_DATE });
    expect(created.status).toBe(201);
    return { ...tenants, trainingId, assignmentId: created.body.data.created[0].id as number };
  }

  it("stamps the row with the owner's organization, ignoring a foreign id in the body", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const trainingId = await createTraining(owner.orgId);

    const res = await owner.request.post(BASE).send({
      training_id: trainingId,
      user_ids: [owner.userId],
      due_date: DUE_DATE,
      organization_id: attacker.orgId,
    });

    expect(res.status).toBe(201);
    expect((await snapshot(trainingId))[0].organization_id).toBe(owner.orgId);
  });

  it("keeps lists and the summary away from another organization", async () => {
    const { owner, attacker, trainingId } = await seedAssignment();

    const ownerList = await owner.request.get(`${BASE}?training_id=${trainingId}`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data).toHaveLength(1);
    const ownerSummary = await owner.request.get(`${BASE}/summary`);
    expect(ownerSummary.body.data).toHaveLength(1);
    const ownerMine = await owner.request.get(`${BASE}/mine`);
    expect(ownerMine.body.data).toHaveLength(1);

    expect((await attacker.request.get(`${BASE}?training_id=${trainingId}`)).status).toBe(404);
    expect((await attacker.request.get(`${BASE}/summary`)).body.data).toEqual([]);
    expect((await attacker.request.get(`${BASE}/mine`)).body.data).toEqual([]);
  });

  it("denies every write on another organization's assignment and changes nothing", async () => {
    const { owner, attacker, trainingId, assignmentId } = await seedAssignment();
    const before = await snapshot(trainingId);
    const newDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

    const attempts = [
      await attacker.request.patch(`${BASE}/${assignmentId}`).send({ due_date: newDate }),
      await attacker.request.post(`${BASE}/${assignmentId}/complete`),
      await attacker.request.post(`${BASE}/${assignmentId}/reopen`),
      await attacker.request.delete(`${BASE}/${assignmentId}`),
      await attacker.request.post(`${BASE}/complete-all`).send({ training_id: trainingId }),
    ];

    attempts.forEach((res) => expect(res.status).toBe(404));
    expect(await snapshot(trainingId)).toEqual(before);

    // Positive controls: the same requests work for the owner, so the 404s
    // above came from tenancy and not from a route that does not exist.
    expect(
      (await owner.request.patch(`${BASE}/${assignmentId}`).send({ due_date: newDate })).status,
    ).toBe(200);
    expect((await owner.request.post(`${BASE}/${assignmentId}/complete`)).status).toBe(200);
    expect((await owner.request.post(`${BASE}/${assignmentId}/reopen`)).status).toBe(200);
    expect(
      (await owner.request.post(`${BASE}/complete-all`).send({ training_id: trainingId })).status,
    ).toBe(200);
    expect((await owner.request.delete(`${BASE}/${assignmentId}`)).status).toBe(200);
  });

  it("cannot assign another organization's training", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const trainingId = await createTraining(owner.orgId);

    const res = await attacker.request
      .post(BASE)
      .send({ training_id: trainingId, user_ids: [attacker.userId], due_date: DUE_DATE });

    expect(res.status).toBe(404);
    expect(await snapshot(trainingId)).toEqual([]);
  });

  it("cannot assign a person from another organization to the caller's training", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const trainingId = await createTraining(owner.orgId);

    const res = await owner.request
      .post(BASE)
      .send({ training_id: trainingId, user_ids: [attacker.userId], due_date: DUE_DATE });

    expect(res.status).toBe(400);
    expect(await snapshot(trainingId)).toEqual([]);
  });
});
