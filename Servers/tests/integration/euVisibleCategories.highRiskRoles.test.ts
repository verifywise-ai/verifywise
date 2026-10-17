jest.setTimeout(60000);

/**
 * The requirements filter against the real EU AI Act structure: a use case
 * with both roles sees the union of what each role sees, and a use case with
 * no role sees only the categories that apply whatever the role.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestProjectFramework } from "../factories";
import { getVisibleEuCategoryIdsForProject } from "../../utils/eu.utils";

const EU_AI_ACT_FRAMEWORK_ID = 1;

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

/** A High risk use case with these roles and the EU AI Act; returns its projects_frameworks id. */
async function euUseCase(orgId: number, ownerId: number, roles: string[]): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
        goal, last_updated, last_updated_by, organization_id)
     VALUES (:title, :ownerId, NOW(), 'High risk', CAST(:roles AS text[]),
             'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    {
      replacements: {
        title: `Roles ${roles.join("+") || "none"}`,
        ownerId,
        orgId,
        roles: `{${roles.join(",")}}`,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return createTestProjectFramework(orgId, rows[0].id, EU_AI_ACT_FRAMEWORK_ID);
}

const visible = async (orgId: number, projectFrameworkId: number) =>
  (await getVisibleEuCategoryIdsForProject(projectFrameworkId, orgId)).sort((a, b) => a - b);

describe("getVisibleEuCategoryIdsForProject with several high-risk roles", () => {
  it("shows the union of the Provider and Deployer categories for both roles", async () => {
    const orgId = await createTestOrganization();
    const userId = await createTestUser(orgId, 1, `roles-${Date.now()}@example.com`, "Passw0rd!");

    const provider = await visible(orgId, await euUseCase(orgId, userId, ["Provider"]));
    const deployer = await visible(orgId, await euUseCase(orgId, userId, ["Deployer"]));
    const both = await visible(orgId, await euUseCase(orgId, userId, ["Provider", "Deployer"]));
    const none = await visible(orgId, await euUseCase(orgId, userId, []));

    // The High risk tier has role-specific categories, so the roles differ.
    expect(provider).not.toEqual(deployer);
    expect(both).toEqual([...new Set([...provider, ...deployer])].sort((a, b) => a - b));
    // No role: only categories every role sees.
    expect(none.every((id) => provider.includes(id) && deployer.includes(id))).toBe(true);
    expect(none.length).toBeLessThan(Math.min(provider.length, deployer.length));
  });
});
