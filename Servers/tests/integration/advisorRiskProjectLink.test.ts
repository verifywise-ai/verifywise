jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedFrameworks } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestControlEU,
  createTestProject,
  createTestProjectFramework,
  createTestRisk,
  createTestTask,
  createTestVendor,
} from "../factories";
import { EU_AI_ACT_FRAMEWORK_ID } from "../../utils/validations/projectValidation.utils";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";
// Importing the module registers the risk write tools with the executor map.
import "../../advisor/functions/riskFunctions";
import { availableComplianceTools } from "../../advisor/functions/complianceFunctions";

afterEach(async () => {
  await cleanupDatabase();
});

const linkRiskToProject = (params: Record<string, unknown>, organizationId: number) => {
  const execute = writeToolExecutors.get("agent_link_risk_to_project");
  if (!execute) throw new Error("agent_link_risk_to_project is not registered");
  return execute(params, organizationId);
};

const projectRiskLinks = (riskId: number) =>
  sequelize.query<{ organization_id: number; project_id: number }>(
    `SELECT organization_id, project_id FROM projects_risks WHERE risk_id = :riskId`,
    { replacements: { riskId }, type: QueryTypes.SELECT },
  );

describe("advisor: link a risk to a project", () => {
  it("writes the link to projects_risks, once", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const riskId = await createTestRisk(owner.orgId);

    await linkRiskToProject({ risk_id: riskId, project_id: projectId }, owner.orgId);
    await linkRiskToProject({ risk_id: riskId, project_id: projectId }, owner.orgId);

    expect(await projectRiskLinks(riskId)).toEqual([
      { organization_id: owner.orgId, project_id: projectId },
    ]);
  });

  it("refuses a project from another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const theirProject = await createTestProject(attacker.orgId, attacker.userId);
    const riskId = await createTestRisk(owner.orgId);

    await expect(
      linkRiskToProject({ risk_id: riskId, project_id: theirProject }, owner.orgId),
    ).rejects.toThrow();
    expect(await projectRiskLinks(riskId)).toEqual([]);
  });
});

describe("advisor: project risk counts", () => {
  it("counts the risks linked to the project in get_project_stats and get_compliance_details", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const otherProject = await createTestProject(owner.orgId, owner.userId);
    const linked = await createTestRisk(owner.orgId);
    const elsewhere = await createTestRisk(owner.orgId);
    await linkRiskToProject({ risk_id: linked, project_id: projectId }, owner.orgId);
    await linkRiskToProject({ risk_id: elsewhere, project_id: otherProject }, owner.orgId);

    const stats = await availableComplianceTools.get_project_stats(
      { project_id: projectId },
      owner.orgId,
    );
    expect(stats.risks.total).toBe(1);

    const details = await availableComplianceTools.get_compliance_details(
      { project_id: projectId },
      owner.orgId,
    );
    expect(details.project_risk_count).toBe(1);
  });

  it("counts the use case's vendors and the tasks linked to its requirements", async () => {
    await seedFrameworks();
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const otherProject = await createTestProject(owner.orgId, owner.userId);
    const controlIn = async (project: number) =>
      createTestControlEU(owner.orgId, {
        projects_frameworks_id: await createTestProjectFramework(
          owner.orgId,
          project,
          EU_AI_ACT_FRAMEWORK_ID,
        ),
      });
    const control = await controlIn(projectId);
    const otherControl = await controlIn(otherProject);
    const linkedTask = async (controlId: number, status: string) => {
      const taskId = await createTestTask(owner.orgId, { status });
      await sequelize.query(
        `INSERT INTO task_entity_links (organization_id, task_id, entity_id, entity_type)
         VALUES (:orgId, :taskId, :controlId, 'eu_control')`,
        { replacements: { orgId: owner.orgId, taskId, controlId } },
      );
    };
    await linkedTask(control, "Open");
    await linkedTask(control, "Completed");
    await linkedTask(control, "Deleted");
    await linkedTask(otherControl, "Open");
    const vendorId = await createTestVendor(owner.orgId);
    await sequelize.query(
      `INSERT INTO vendors_projects (organization_id, vendor_id, project_id)
       VALUES (:orgId, :vendorId, :projectId)`,
      { replacements: { orgId: owner.orgId, vendorId, projectId } },
    );

    const stats = await availableComplianceTools.get_project_stats(
      { project_id: projectId },
      owner.orgId,
    );

    expect(stats.tasks).toEqual({ total: 2, completed: 1, overdue: 0 });
    expect(stats.vendors.total).toBe(1);
    expect(stats.models.total).toBe(0);
  });
});
