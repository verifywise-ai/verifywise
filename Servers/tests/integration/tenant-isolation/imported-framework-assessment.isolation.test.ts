jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { createTestProject, createTestRisk } from "../../factories/test-entities.factory";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const IMPORT = "/api/v1/framework-import";
const ROUTE = "/api/v1/imported-framework-assessments";

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

const TABLES = [
  "projects_imported_frameworks",
  "imported_framework_topic_impl",
  "imported_framework_subtopic_impl",
  "imported_framework_topic_impl__risks",
  "imported_framework_subtopic_impl__risks",
];

/**
 * projects_imported_frameworks, imported_framework_topic_impl,
 * imported_framework_subtopic_impl and their __risks junctions behind
 * /api/v1/imported-framework-assessments. Impl rows and risk links are only
 * reachable through their link, so this file covers all five tables by hand.
 */
describe("imported framework assessment tenant isolation", () => {
  afterEach(cleanupDatabase);

  async function ownerWithAssessedLink() {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableFrameworkImport(owner.orgId, owner.userId);
    await enableFrameworkImport(attacker.orgId, attacker.userId);

    const imported = await owner.request
      .post(`${IMPORT}/import`)
      .send({ csvData: sheet("Owner policy") });
    expect(imported.status).toBe(200);
    const frameworkId = imported.body.data.imported_framework_id as number;

    const projectId = await createTestProject(owner.orgId, owner.userId);
    const attached = await owner.request
      .post(`${ROUTE}/projects/${projectId}`)
      .send({ imported_framework_id: frameworkId });
    expect(attached.status).toBe(201);
    const linkId = attached.body.data.id as number;

    const tree = await owner.request.get(`${ROUTE}/links/${linkId}/tree`);
    expect(tree.status).toBe(200);
    const topics = tree.body.data.tree[0].children;
    expect(topics).toHaveLength(2);
    const topicImplId = topics[0].impl_id as number;
    const subtopicImplId = topics[0].children[0].impl_id as number;

    // Owner data on both levels, including a risk link on each.
    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await sequelize.query(
      `INSERT INTO projects_risks (organization_id, risk_id, project_id) VALUES (:orgId, :riskId, :projectId)`,
      { replacements: { orgId: owner.orgId, riskId, projectId } },
    );
    const patch = await owner.request
      .patch(`${ROUTE}/links/${linkId}/impl/l2/${topicImplId}`)
      .send({ status: "Draft", risksMitigated: JSON.stringify([riskId]) });
    expect(patch.status).toBe(200);
    const put = await owner.request
      .put(`${ROUTE}/links/${linkId}/impl/l3/${subtopicImplId}/risks`)
      .send({ risk_ids: [riskId] });
    expect(put.status).toBe(200);

    return { owner, attacker, frameworkId, projectId, linkId, topicImplId, subtopicImplId, riskId };
  }

  it("never reads, assesses or detaches another organization's link", async () => {
    const { owner, attacker, projectId, linkId, topicImplId, subtopicImplId } =
      await ownerWithAssessedLink();

    // The owner reads its data, so the 404s below mean isolation, not absence.
    expect((await owner.request.get(`${ROUTE}/projects/${projectId}`)).body.data).toHaveLength(1);
    for (const table of TABLES) expect(await countFor(table, owner.orgId)).toBeGreaterThan(0);

    const reads = [
      attacker.request.get(`${ROUTE}/projects/${projectId}`),
      attacker.request.get(`${ROUTE}/links/${linkId}/tree`),
      attacker.request.get(`${ROUTE}/links/${linkId}/dashboard`),
      attacker.request.get(`${ROUTE}/links/${linkId}/impl/l2/${topicImplId}`),
      attacker.request.get(`${ROUTE}/links/${linkId}/impl/l3/${subtopicImplId}`),
      attacker.request.get(`${ROUTE}/links/${linkId}/impl/l2/${topicImplId}/risks`),
    ];
    for (const res of await Promise.all(reads)) expect(res.status).toBe(404);

    const writes = [
      attacker.request
        .patch(`${ROUTE}/links/${linkId}/impl/l2/${topicImplId}`)
        .send({ status: "Audited", implementation_description: "pwned" }),
      attacker.request
        .put(`${ROUTE}/links/${linkId}/impl/l3/${subtopicImplId}/risks`)
        .send({ risk_ids: [] }),
      attacker.request.delete(`${ROUTE}/projects/${projectId}/${linkId}`),
    ];
    for (const res of await Promise.all(writes)) expect(res.status).toBe(404);

    const [row] = (await sequelize.query(
      `SELECT status, implementation_description FROM imported_framework_topic_impl WHERE id = :id`,
      { replacements: { id: topicImplId }, type: QueryTypes.SELECT },
    )) as Array<{ status: string; implementation_description: string | null }>;
    expect(row).toEqual({ status: "Draft", implementation_description: null });
    expect(await countFor("projects_imported_frameworks", owner.orgId)).toBe(1);
    expect(await countFor("imported_framework_subtopic_impl__risks", owner.orgId)).toBe(1);
    for (const table of TABLES) expect(await countFor(table, attacker.orgId)).toBe(0);
  });

  it("never attaches another organization's framework or to another organization's use case", async () => {
    const { owner, attacker, frameworkId, projectId } = await ownerWithAssessedLink();
    const attackerProject = await createTestProject(attacker.orgId, attacker.userId);

    const foreignFramework = await attacker.request
      .post(`${ROUTE}/projects/${attackerProject}`)
      .send({ imported_framework_id: frameworkId });
    expect(foreignFramework.status).toBe(404);

    const ownImport = await attacker.request
      .post(`${IMPORT}/import`)
      .send({ csvData: sheet("Attacker policy") });
    const attackerFramework = ownImport.body.data.imported_framework_id as number;
    const foreignProject = await attacker.request
      .post(`${ROUTE}/projects/${projectId}`)
      .send({ imported_framework_id: attackerFramework });
    expect(foreignProject.status).toBe(404);

    expect(await countFor("projects_imported_frameworks", attacker.orgId)).toBe(0);
    expect(await countFor("projects_imported_frameworks", owner.orgId)).toBe(1);
  });

  it("never links a risk of another organization or of another use case", async () => {
    const { owner, attacker, linkId, topicImplId } = await ownerWithAssessedLink();
    const foreignRisk = await createTestRisk(attacker.orgId, { risk_owner: attacker.userId });
    const unlinkedRisk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });

    for (const riskId of [foreignRisk, unlinkedRisk]) {
      const res = await owner.request
        .put(`${ROUTE}/links/${linkId}/impl/l2/${topicImplId}/risks`)
        .send({ risk_ids: [riskId] });
      expect(res.status).toBe(400);
    }
    expect(await countFor("imported_framework_topic_impl__risks", owner.orgId)).toBe(1);
    expect(await countFor("imported_framework_topic_impl__risks", attacker.orgId)).toBe(0);
  });

  it("keeps an attached framework from being deleted", async () => {
    const { owner, frameworkId } = await ownerWithAssessedLink();
    const res = await owner.request.delete(`${IMPORT}/imported/${frameworkId}`);
    expect(res.status).toBe(409);
    expect(res.body.use_cases).toHaveLength(1);
    expect(await countFor("imported_frameworks", owner.orgId)).toBe(1);
  });
});
