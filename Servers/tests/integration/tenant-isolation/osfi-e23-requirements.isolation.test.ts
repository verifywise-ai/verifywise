jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedFrameworks } from "../helpers";
import { createTestProject, createTestRisk } from "../../factories/test-entities.factory";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const OSFI_E23 = 26; // organization wide, 83 requirements
const ROUTE = "/api/frameworks";
const REQUIREMENTS = 83;

const countFor = async (table: string, orgId: number): Promise<number> => {
  const [row] = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ n: number }>;
  return row.n;
};

const readRow = async (id: number) => {
  const [row] = (await sequelize.query(
    `SELECT status, implementation_description FROM osfi_e23_requirements WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{ status: string; implementation_description: string | null }>;
  return row;
};

const linkedRiskIds = async (requirementId: number): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT projects_risks_id FROM osfi_e23_requirements__risks
      WHERE requirement_id = :requirementId ORDER BY projects_risks_id`,
    { replacements: { requirementId }, type: QueryTypes.SELECT },
  )) as Array<{ projects_risks_id: number }>;
  return rows.map((r) => r.projects_risks_id);
};

/**
 * osfi_e23_requirements and osfi_e23_requirements__risks behind the generic
 * /api/frameworks impl routes. Rows are reachable only through the owning
 * organization's projects_frameworks link, so this file covers both tables.
 */
describe("OSFI E-23 requirement tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
  });

  async function ownerWithAssessedRequirement() {
    const { owner, attacker } = await seedTwoTenantContexts();

    const created = await owner.request.post("/api/v1/projects").send({
      project_title: "Organization governance",
      owner: owner.userId,
      start_date: "2026-06-01",
      geography: 1,
      members: [],
      framework: [OSFI_E23],
      is_organizational: true,
    });
    expect(created.status).toBe(201);
    const projectId = created.body.data.project?.id ?? created.body.data.id;
    expect(typeof projectId).toBe("number");

    const [link] = (await sequelize.query(
      `SELECT id FROM projects_frameworks WHERE project_id = :projectId AND framework_id = :fw`,
      { replacements: { projectId, fw: OSFI_E23 }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    const [req] = (await sequelize.query(
      `SELECT id FROM osfi_e23_requirements WHERE projects_frameworks_id = :id ORDER BY id LIMIT 1`,
      { replacements: { id: link.id }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await sequelize.query(
      `INSERT INTO projects_risks (organization_id, risk_id, project_id) VALUES (:orgId, :riskId, :projectId)`,
      { replacements: { orgId: owner.orgId, riskId, projectId } },
    );

    const patch = await owner.request
      .patch(`${ROUTE}/${OSFI_E23}/impl/l2/${req.id}`)
      .field("status", "In progress")
      .field("implementation_description", "owner text")
      .field("risksMitigated", JSON.stringify([riskId]));
    expect(patch.status).toBe(200);

    return {
      owner,
      attacker,
      projectId,
      linkId: link.id,
      requirementId: req.id,
      projectRiskId: riskId,
    };
  }

  it("never reads, edits or re-links another organization's requirement", async () => {
    const { owner, attacker, projectId, linkId, requirementId, projectRiskId } =
      await ownerWithAssessedRequirement();
    const base = `${ROUTE}/${OSFI_E23}`;

    // The owner reads its data, so the failures below mean isolation, not absence.
    const own = await owner.request.get(`${base}/impl/l2/${requirementId}`);
    expect(own.status).toBe(200);
    expect(own.body.data.implementation_description).toBe("owner text");
    expect(
      (await owner.request.get(`${base}/impl/l2/${requirementId}/risks`)).body.data,
    ).toHaveLength(1);
    expect((await owner.request.get(`${base}/tree/${projectId}`)).status).toBe(200);
    expect((await owner.request.get(`${base}/dashboard/${linkId}`)).status).toBe(200);
    expect(await countFor("osfi_e23_requirements", owner.orgId)).toBe(REQUIREMENTS);
    expect(await countFor("osfi_e23_requirements__risks", owner.orgId)).toBe(1);

    const reads = await Promise.all([
      attacker.request.get(`${base}/impl/l2/${requirementId}`),
      attacker.request.get(`${base}/tree/${projectId}`),
      attacker.request.get(`${base}/dashboard/${linkId}`),
    ]);
    for (const res of reads) expect(res.status).toBe(404);

    // The risks route answers an empty list for a row the caller cannot see.
    const risks = await attacker.request.get(`${base}/impl/l2/${requirementId}/risks`);
    expect(risks.status).toBe(200);
    expect(risks.body.data).toEqual([]);

    const writes = await Promise.all([
      attacker.request
        .patch(`${base}/impl/l2/${requirementId}`)
        .field("status", "Implemented")
        .field("implementation_description", "pwned"),
      attacker.request
        .patch(`${base}/impl/l2/${requirementId}`)
        .field("risksMitigated", JSON.stringify([]))
        .field("risksDelete", JSON.stringify([projectRiskId])),
    ]);
    for (const res of writes) expect(res.status).toBe(404);

    expect(await readRow(requirementId)).toEqual({
      status: "In progress",
      implementation_description: "owner text",
    });
    expect(await linkedRiskIds(requirementId)).toEqual([projectRiskId]);
    expect(await countFor("osfi_e23_requirements", owner.orgId)).toBe(REQUIREMENTS);
    expect(await countFor("osfi_e23_requirements__risks", owner.orgId)).toBe(1);
    expect(await countFor("osfi_e23_requirements", attacker.orgId)).toBe(0);
    expect(await countFor("osfi_e23_requirements__risks", attacker.orgId)).toBe(0);
  });

  it("never links an attacker risk into the owner's requirement", async () => {
    const { attacker, requirementId, projectRiskId, owner } = await ownerWithAssessedRequirement();
    const foreignRisk = await createTestRisk(attacker.orgId, { risk_owner: attacker.userId });
    const attackerProject = await createTestProject(attacker.orgId, attacker.userId);
    await sequelize.query(
      `INSERT INTO projects_risks (organization_id, risk_id, project_id) VALUES (:orgId, :riskId, :projectId)`,
      { replacements: { orgId: attacker.orgId, riskId: foreignRisk, projectId: attackerProject } },
    );

    const res = await attacker.request
      .patch(`${ROUTE}/${OSFI_E23}/impl/l2/${requirementId}`)
      .field("risksMitigated", JSON.stringify([foreignRisk]));
    expect(res.status).toBe(404);

    expect(await linkedRiskIds(requirementId)).toEqual([projectRiskId]);
    expect(await countFor("osfi_e23_requirements__risks", owner.orgId)).toBe(1);
    expect(await countFor("osfi_e23_requirements__risks", attacker.orgId)).toBe(0);
  });
});
