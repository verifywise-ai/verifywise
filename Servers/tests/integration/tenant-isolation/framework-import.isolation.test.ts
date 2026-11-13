jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedFrameworks } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const ROUTE = "/api/v1/framework-import";

const sheet = (frameworkName: string) => [
  {
    framework_name: frameworkName,
    topic_number: "1",
    topic_name: "Governance",
    subtopic_number: "1.1",
    subtopic_name: "Accountability",
  },
  { framework_name: frameworkName, topic_number: "2", topic_name: "Risk management" },
];

async function enableFrameworkImport(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = 'framework-import'
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId } },
  );
}

const countFor = async (table: string, orgId: number): Promise<number> => {
  const [row] = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ n: number }>;
  return row.n;
};

/**
 * imported_frameworks, imported_framework_topics and imported_framework_subtopics
 * behind /api/v1/framework-import. The list is keyed by the caller's
 * organization and topics/subtopics are only reachable through their
 * framework, so this file covers all three tables by hand.
 */
describe("framework import tenant isolation", () => {
  afterEach(cleanupDatabase);

  it("never lists, renames or deletes another organization's imported framework", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableFrameworkImport(owner.orgId, owner.userId);
    await enableFrameworkImport(attacker.orgId, attacker.userId);

    const imported = await owner.request
      .post(`${ROUTE}/import`)
      .send({ csvData: sheet("Owner policy") });
    expect(imported.status).toBe(200);
    const id = imported.body.data.imported_framework_id as number;

    // The owner sees its framework with topics and subtopics, so the empty
    // answer below means isolation, not an empty table.
    const ownList = await owner.request.get(`${ROUTE}/imported`);
    expect(ownList.body.data).toHaveLength(1);
    expect(ownList.body.data[0].topics).toHaveLength(2);

    const attackerList = await attacker.request.get(`${ROUTE}/imported`);
    expect(attackerList.status).toBe(200);
    expect(attackerList.body.data).toEqual([]);

    const rename = await attacker.request.patch(`${ROUTE}/imported/${id}`).send({ name: "Mine" });
    expect(rename.status).toBe(404);
    const del = await attacker.request.delete(`${ROUTE}/imported/${id}`);
    expect(del.status).toBe(404);

    expect(await countFor("imported_frameworks", owner.orgId)).toBe(1);
    expect(await countFor("imported_framework_topics", owner.orgId)).toBe(2);
    expect(await countFor("imported_framework_subtopics", owner.orgId)).toBe(1);
    const [row] = (await sequelize.query(`SELECT name FROM imported_frameworks WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })) as Array<{ name: string }>;
    expect(row.name).toBe("Owner policy");
  });

  it("keeps the same name in two organizations as two separate frameworks", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableFrameworkImport(owner.orgId, owner.userId);
    await enableFrameworkImport(attacker.orgId, attacker.userId);

    const a = await owner.request.post(`${ROUTE}/import`).send({ csvData: sheet("Shared name") });
    const b = await attacker.request
      .post(`${ROUTE}/import`)
      .send({ csvData: sheet("Shared name") });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.imported_framework_id).not.toBe(b.body.data.imported_framework_id);

    // A re-import by the attacker replaces only its own structure.
    expect(await countFor("imported_framework_topics", owner.orgId)).toBe(2);
    expect(await countFor("imported_framework_topics", attacker.orgId)).toBe(2);
  });

  it("keeps imports out of the shared framework catalog that use cases attach to", async () => {
    await seedFrameworks();
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableFrameworkImport(owner.orgId, owner.userId);
    await owner.request.post(`${ROUTE}/import`).send({ csvData: sheet("Owner policy") });

    for (const ctx of [owner, attacker]) {
      const catalog = await ctx.request.get("/api/frameworks");
      expect(catalog.status).toBe(200);
      const names = (catalog.body.data as Array<{ name: string }>).map((f) => f.name);
      expect(names).not.toContain("Owner policy");
    }
  });

  it("answers 403 to an organization that has not enabled the extension", async () => {
    const { attacker } = await seedTwoTenantContexts();
    const res = await attacker.request.get(`${ROUTE}/imported`);
    expect(res.status).toBe(403);
  });
});
