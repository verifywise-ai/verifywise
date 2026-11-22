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

  async function setup() {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await seedE23(owner.orgId, owner.userId);
    const b = await seedE23(attacker.orgId, attacker.userId);
    const bImpl = b.implRows[0];
    const aImpl = a.implRows.find((r) => r.requirement_meta_id === bImpl.requirement_meta_id)!;
    const bFile = await createTestFile(attacker.orgId, attacker.userId, {
      filename: "org-b-evidence.pdf",
      project_id: b.projectId,
    });
    const bRisk = await createTestRisk(attacker.orgId, { risk_name: "Org B risk" });
    const linkEvidence = (orgId: number, entityId: number, projectId: number) =>
      createTestFileEntityLink(orgId, {
        file_id: bFile,
        framework_type: "osfi_e23",
        entity_type: "requirement",
        entity_id: entityId,
        project_id: projectId,
      });
    const linkRisk = (orgId: number, requirementId: number) =>
      sequelize.query(
        `INSERT INTO osfi_e23_requirements__risks (organization_id, requirement_id, projects_risks_id)
         VALUES (:orgId, :requirementId, :riskId)`,
        { replacements: { orgId, requirementId, riskId: bRisk } },
      );
    const collect = async (target: FrameworkTarget, orgId: number) => {
      const result = await collectFrameworkRequirements(
        target,
        orgId,
        new Date(),
        resolveUserNames,
      );
      return result.frameworks[0];
    };
    const rowsOf = (fw: Awaited<ReturnType<typeof collect>>) =>
      fw.groups.flatMap((g) => g.requirements);
    return { owner, attacker, a, b, aImpl, bImpl, linkEvidence, linkRisk, collect, rowsOf };
  }

  it("returns only the caller's own impl rows", async () => {
    const { owner, a, collect, rowsOf } = await setup();
    const rows = rowsOf(await collect(a.target, owner.orgId));
    expect(rows.map((r) => r.implId).sort((x, y) => x - y)).toEqual(
      a.implRows.map((r) => r.id).sort((x, y) => x - y),
    );
  });

  it("does not count another organization's evidence links", async () => {
    const { owner, attacker, a, b, aImpl, bImpl, linkEvidence, collect, rowsOf } = await setup();
    // Org B's link on its own impl row, and one under org B naming org A's impl id.
    await linkEvidence(attacker.orgId, bImpl.id, b.projectId);
    await linkEvidence(attacker.orgId, aImpl.id, b.projectId);

    const fw = await collect(a.target, owner.orgId);
    const rows = rowsOf(fw);
    expect(rows.every((r) => r.evidenceCount === 0 && r.evidenceFiles.length === 0)).toBe(true);
    expect(fw.rollup.noEvidence).toBe(rows.length);

    // Sanity: org B sees its own evidence, so the zeros above are isolation.
    const bRow = rowsOf(await collect(b.target, attacker.orgId)).find(
      (r) => r.implId === bImpl.id,
    )!;
    expect(bRow.evidenceCount).toBe(1);
  });

  it("does not count another organization's risk links", async () => {
    const { owner, attacker, a, b, aImpl, bImpl, linkRisk, collect, rowsOf } = await setup();
    await linkRisk(attacker.orgId, bImpl.id);
    await linkRisk(attacker.orgId, aImpl.id);

    const rows = rowsOf(await collect(a.target, owner.orgId));
    expect(rows.every((r) => r.riskCount === 0)).toBe(true);

    const bRow = rowsOf(await collect(b.target, attacker.orgId)).find(
      (r) => r.implId === bImpl.id,
    )!;
    expect(bRow.riskCount).toBe(1);
  });

  it("does not show an org B file linked from an org A evidence link", async () => {
    const { owner, a, aImpl, linkEvidence, collect, rowsOf } = await setup();
    await linkEvidence(owner.orgId, aImpl.id, a.projectId);

    const row = rowsOf(await collect(a.target, owner.orgId)).find((r) => r.implId === aImpl.id)!;
    expect(row.evidenceCount).toBe(0);
    expect(row.evidenceFiles).toEqual([]);
  });

  it("does not count an org B risk linked from an org A requirement", async () => {
    const { owner, a, aImpl, linkRisk, collect, rowsOf } = await setup();
    await linkRisk(owner.orgId, aImpl.id);

    const row = rowsOf(await collect(a.target, owner.orgId)).find((r) => r.implId === aImpl.id)!;
    expect(row.riskCount).toBe(0);
  });

  it("returns no groups when org A collects with org B's projectFrameworkId", async () => {
    const { owner, b, collect } = await setup();
    const fw = await collect(b.target, owner.orgId);
    expect(fw.groups).toEqual([]);
  });
});
