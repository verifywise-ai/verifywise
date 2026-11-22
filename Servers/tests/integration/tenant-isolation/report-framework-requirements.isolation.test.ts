jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestFile,
  createTestFileEntityLink,
  createTestProject,
  createTestProjectFramework,
  createTestRisk,
} from "../../factories";
import { createOSFIE23FrameworkQuery } from "../../../utils/frameworkRegistry.utils";
import { collectFrameworkRequirements } from "../../../services/reporting/collectors/frameworkRequirements";
import type { FrameworkTarget } from "../../../services/reporting/reportScope";

const OSFI_E23_ID = 26;

const resolveUserNames = async (ids: unknown[]) =>
  new Map<number, string>(ids.map((id) => [Number(id), `User ${id}`]));

async function seedE23(orgId: number, userId: number) {
  const projectId = await createTestProject(orgId, userId);
  const projectFrameworkId = await createTestProjectFramework(orgId, projectId, OSFI_E23_ID);
  await sequelize.transaction((transaction) =>
    createOSFIE23FrameworkQuery(projectId, false, orgId, transaction, false),
  );
  const implRows = (await sequelize.query(
    `SELECT id, requirement_meta_id FROM osfi_e23_requirements
      WHERE organization_id = :orgId AND projects_frameworks_id = :projectFrameworkId
      ORDER BY id`,
    { replacements: { orgId, projectFrameworkId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; requirement_meta_id: number }>;
  const target: FrameworkTarget = {
    projectId,
    projectTitle: `Project ${orgId}`,
    isOrganizationalProject: true,
    frameworkId: OSFI_E23_ID,
    frameworkName: "OSFI E-23 Model Risk Management",
    projectFrameworkId,
  };
  return { projectId, projectFrameworkId, implRows, target };
}

describe("Report framework requirements tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("does not count another organization's evidence or risks and returns only own rows", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await seedE23(owner.orgId, owner.userId);
    const b = await seedE23(attacker.orgId, attacker.userId);
    expect(a.implRows.length).toBeGreaterThan(0);
    expect(b.implRows.length).toBe(a.implRows.length);

    // Org B attaches evidence and links a risk to the same requirement struct,
    // and also plants rows that name org A's impl id under org B's tenant.
    const bImpl = b.implRows[0];
    const aImplSameStruct = a.implRows.find(
      (r) => r.requirement_meta_id === bImpl.requirement_meta_id,
    )!;
    const bFile = await createTestFile(attacker.orgId, attacker.userId, {
      filename: "org-b-evidence.pdf",
      project_id: b.projectId,
    });
    for (const entityId of [bImpl.id, aImplSameStruct.id]) {
      await createTestFileEntityLink(attacker.orgId, {
        file_id: bFile,
        framework_type: "osfi_e23",
        entity_type: "requirement",
        entity_id: entityId,
        project_id: b.projectId,
      });
    }
    const bRisk = await createTestRisk(attacker.orgId, { risk_name: "Org B risk" });
    for (const requirementId of [bImpl.id, aImplSameStruct.id]) {
      await sequelize.query(
        `INSERT INTO osfi_e23_requirements__risks (organization_id, requirement_id, projects_risks_id)
         VALUES (:orgId, :requirementId, :riskId)`,
        { replacements: { orgId: attacker.orgId, requirementId, riskId: bRisk } },
      );
    }

    const result = await collectFrameworkRequirements(
      a.target,
      owner.orgId,
      new Date(),
      resolveUserNames,
    );
    const rows = result.frameworks[0].groups.flatMap((g) => g.requirements);
    expect(rows.map((r) => r.implId).sort((x, y) => x - y)).toEqual(
      a.implRows.map((r) => r.id).sort((x, y) => x - y),
    );
    expect(rows.every((r) => r.evidenceCount === 0 && r.riskCount === 0)).toBe(true);
    expect(rows.every((r) => r.evidenceFiles.length === 0)).toBe(true);
    expect(result.frameworks[0].rollup.noEvidence).toBe(rows.length);

    // Sanity: org B sees its own evidence and risk, so the zeros above are
    // isolation and not a broken fixture.
    const bResult = await collectFrameworkRequirements(
      b.target,
      attacker.orgId,
      new Date(),
      resolveUserNames,
    );
    const bRow = bResult.frameworks[0].groups
      .flatMap((g) => g.requirements)
      .find((r) => r.implId === bImpl.id)!;
    expect(bRow.evidenceCount).toBe(1);
    expect(bRow.riskCount).toBe(1);
  });

  it("returns no groups when org A collects with org B's projectFrameworkId", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await seedE23(owner.orgId, owner.userId);
    const b = await seedE23(attacker.orgId, attacker.userId);

    const result = await collectFrameworkRequirements(
      b.target,
      owner.orgId,
      new Date(),
      resolveUserNames,
    );
    expect(result.frameworks[0].groups).toEqual([]);
  });
});
