jest.setTimeout(60000);

import { createTestApp, testRequest } from "../setup";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { sequelize } from "../../../database/db";

const BASE = "/api/v1/ai-apps/questionnaires";
const body = (name: string) => ({ name, questions: [{ label: "Risk", weight: 2 }] });

async function questionnaireCount(id: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM ai_app_questionnaires WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as any[])[0].total;
}

describe("AI app questionnaire tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("creates one default per org and keeps each org's list apart", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const ownerList = await owner.request.get(BASE);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data.questionnaires).toHaveLength(1);
    expect(ownerList.body.data.questionnaires[0].is_default).toBe(true);
    expect(ownerList.body.data.questionnaires[0].questions).toHaveLength(6);

    await owner.request.get(BASE);
    const again = await owner.request.get(BASE);
    expect(again.body.data.questionnaires).toHaveLength(1);

    const created = await owner.request.post(BASE).send(body("Private list"));
    expect(created.status).toBe(201);
    expect(created.body.data.questions[0].key).toBe("q1");

    const attackerList = await attacker.request.get(BASE);
    const names = attackerList.body.data.questionnaires.map((q: any) => q.name);
    expect(names).not.toContain("Private list");
  });

  it("treats another org's questionnaire as nonexistent", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const created = await owner.request.post(BASE).send(body("Owner list"));
    const id = created.body.data.id;

    expect((await attacker.request.patch(`${BASE}/${id}`).send({ name: "Stolen" })).status).toBe(
      404,
    );
    expect((await attacker.request.delete(`${BASE}/${id}`)).status).toBe(404);
    expect(await questionnaireCount(id)).toBe(1);

    const list = await owner.request.get(BASE);
    expect(list.body.data.questionnaires.map((q: any) => q.name)).toContain("Owner list");
  });

  it("allows the same name in two orgs and refuses a duplicate in one", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    expect((await owner.request.post(BASE).send(body("Shared"))).status).toBe(201);
    expect((await attacker.request.post(BASE).send(body("Shared"))).status).toBe(201);
    expect((await owner.request.post(BASE).send(body(" shared "))).status).toBe(409);
  });

  it("cannot delete the default, and requires authentication", async () => {
    const { owner } = await seedTwoTenantContexts();
    const list = await owner.request.get(BASE);
    const defaultId = list.body.data.questionnaires[0].id;
    expect((await owner.request.delete(`${BASE}/${defaultId}`)).status).toBe(409);

    const anonymous = testRequest(await createTestApp());
    // authenticateJWT answers a missing token with 400.
    expect((await anonymous.get(BASE)).status).toBe(400);
  });
});
