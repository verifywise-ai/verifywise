jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { createTestProject, createTestRisk } from "../../factories/test-entities.factory";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const ROUTE = "/api/frameworks";

const countFor = async (table: string, orgId: number): Promise<number> => {
  const [row] = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ n: number }>;
  return row.n;
};

/**
 * saudi_naii_domains and its __risks junction behind the generic registry
 * framework routes (/api/frameworks). Impl rows and risk links are only
 * reachable through a project's framework, so this file covers both tables by
 * hand.
 */
describe.each([
  { frameworkId: 30, impl: "saudi_naii_domains", requirements: 23, organizational: true },
])(
  "Saudi NAII framework $frameworkId tenant isolation",
  ({ frameworkId, impl, requirements, organizational }) => {
    const risksTable = `${impl}__risks`;

    // Framework 30 is organizational, so it can only be added to an
    // organizational project (canAddFrameworkToProjectQuery).
    async function createProject(orgId: number, userId: number): Promise<number> {
      const projectId = await createTestProject(orgId, userId);
      await sequelize.query(
        `UPDATE projects SET is_organizational = :organizational WHERE id = :projectId`,
        {
          replacements: { organizational, projectId },
        },
      );
      return projectId;
    }

    afterEach(cleanupDatabase);

    async function ownerWithAssessedFramework() {
      const { owner, attacker } = await seedTwoTenantContexts();

      const projectId = await createProject(owner.orgId, owner.userId);
      const added = await owner.request.post(
        `${ROUTE}/toProject?frameworkId=${frameworkId}&projectId=${projectId}`,
      );
      expect(added.status).toBe(200);

      const tree = await owner.request.get(`${ROUTE}/${frameworkId}/tree/${projectId}`);
      expect(tree.status).toBe(200);
      const projectFrameworkId = tree.body.data.projects_frameworks_id as number;
      const implIds = (tree.body.data.tree as Array<{ children: Array<{ impl_id: number }> }>)
        .flatMap((subPillar) => subPillar.children)
        .map((domain) => domain.impl_id);
      expect(implIds).toHaveLength(requirements);
      const implId = implIds[0];

      const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
      const patch = await owner.request
        .patch(`${ROUTE}/${frameworkId}/impl/l2/${implId}`)
        .send({ status: "Draft", adoption_level: "3", risksMitigated: JSON.stringify([riskId]) });
      expect(patch.status).toBe(200);

      return { owner, attacker, projectId, projectFrameworkId, implId, riskId };
    }

    it("never reads, assesses or removes another organization's framework", async () => {
      const { owner, attacker, projectId, projectFrameworkId, implId } =
        await ownerWithAssessedFramework();

      // The owner reads its data, so the denials below mean isolation, not absence.
      expect(await countFor(impl, owner.orgId)).toBe(requirements);
      expect(await countFor(risksTable, owner.orgId)).toBe(1);

      const reads = [
        attacker.request.get(`${ROUTE}/${frameworkId}/tree/${projectId}`),
        attacker.request.get(`${ROUTE}/${frameworkId}/dashboard/${projectFrameworkId}`),
        attacker.request.get(`${ROUTE}/${frameworkId}/impl/l2/${implId}`),
      ];
      for (const res of await Promise.all(reads)) expect(res.status).toBe(404);

      const risks = await attacker.request.get(`${ROUTE}/${frameworkId}/impl/l2/${implId}/risks`);
      expect(risks.status).toBe(200);
      expect(risks.body.data).toEqual([]);

      const patch = await attacker.request.patch(`${ROUTE}/${frameworkId}/impl/l2/${implId}`).send({
        status: "Audited",
        implementation_description: "pwned",
        adoption_level: "5",
        risksDelete: "[]",
      });
      expect(patch.status).toBe(404);

      const removed = await attacker.request.delete(
        `${ROUTE}/fromProject?frameworkId=${frameworkId}&projectId=${projectId}`,
      );
      // Another organization's project is "not_found" to requireProjectAccess,
      // so the controller answers 404 without revealing that it exists.
      expect(removed.status).toBe(404);

      const [row] = (await sequelize.query(
        `SELECT status, implementation_description, adoption_level FROM ${impl} WHERE id = :id`,
        { replacements: { id: implId }, type: QueryTypes.SELECT },
      )) as Array<{
        status: string;
        implementation_description: string | null;
        adoption_level: number | null;
      }>;
      expect(row).toEqual({
        status: "Draft",
        implementation_description: null,
        adoption_level: 3,
      });
      expect(await countFor(impl, owner.orgId)).toBe(requirements);
      expect(await countFor(risksTable, owner.orgId)).toBe(1);
      expect(await countFor(impl, attacker.orgId)).toBe(0);
      expect(await countFor(risksTable, attacker.orgId)).toBe(0);
    });

    it("records, validates and clears the owner's adoption level", async () => {
      const { owner, projectId, implId } = await ownerWithAssessedFramework();
      const url = `${ROUTE}/${frameworkId}/impl/l2/${implId}`;

      const tree = await owner.request.get(`${ROUTE}/${frameworkId}/tree/${projectId}`);
      expect(tree.body.data.framework.adoption_levels).toBe(true);
      const domain = (
        tree.body.data.tree as Array<{
          children: Array<{ impl_id: number; adoption_level: number | null }>;
        }>
      )
        .flatMap((subPillar) => subPillar.children)
        .find((d) => d.impl_id === implId);
      expect(domain?.adoption_level).toBe(3);

      for (const bad of ["6", "-1", "2.5", "high"]) {
        const res = await owner.request.patch(url).send({ adoption_level: bad });
        expect(res.status).toBe(400);
      }
      expect((await owner.request.get(url)).body.data.adoption_level).toBe(3);

      const cleared = await owner.request.patch(url).send({ adoption_level: "" });
      expect(cleared.status).toBe(200);
      expect((await owner.request.get(url)).body.data.adoption_level).toBeNull();
    });

    it("never adds the framework to another organization's project", async () => {
      const { owner, attacker, projectId } = await ownerWithAssessedFramework();
      const ownerProject = await createProject(owner.orgId, owner.userId);

      const res = await attacker.request.post(
        `${ROUTE}/toProject?frameworkId=${frameworkId}&projectId=${ownerProject}`,
      );
      expect(res.status).toBe(404);

      expect(await countFor(impl, attacker.orgId)).toBe(0);
      const [link] = (await sequelize.query(
        `SELECT COUNT(*)::int AS n FROM projects_frameworks
        WHERE framework_id = :frameworkId AND project_id IN (:projects)`,
        {
          replacements: { frameworkId, projects: [projectId, ownerProject] },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ n: number }>;
      expect(link.n).toBe(1);
    });

    it("stamps rows created by each organization with that organization", async () => {
      const { owner, attacker } = await ownerWithAssessedFramework();
      const attackerProject = await createProject(attacker.orgId, attacker.userId);

      const res = await attacker.request.post(
        `${ROUTE}/toProject?frameworkId=${frameworkId}&projectId=${attackerProject}`,
      );
      expect(res.status).toBe(200);

      expect(await countFor(impl, attacker.orgId)).toBe(requirements);
      expect(await countFor(impl, owner.orgId)).toBe(requirements);
    });
  },
);
