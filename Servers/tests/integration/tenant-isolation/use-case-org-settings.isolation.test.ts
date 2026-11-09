jest.setTimeout(60000);

import { cleanupDatabase, seedFrameworks } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  getUseCaseOrgSettings,
  projectLevelFrameworkIdsQuery,
  upsertUseCaseOrgSettings,
} from "../../../utils/useCaseOrgSettings.utils";

/**
 * use_case_org_settings — tenant isolation, defaults, partial updates.
 *
 *   (a) A missing row resolves to no defaults and never leaks another org's row.
 *   (b) An upsert against org A never touches org B's row.
 *   (c) PARTIAL semantics: an absent field keeps its value; null clears the
 *       region; [] clears the frameworks (stored as '{}', not {NULL}).
 *   (d) Only project-level frameworks pass the defaults check.
 */
describe("use_case_org_settings tenant isolation + partial updates", () => {
  beforeAll(async () => {
    await seedFrameworks();
  });

  afterEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
  });

  it("returns no defaults without a row and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    expect(await getUseCaseOrgSettings(owner.orgId)).toEqual({
      organization_id: owner.orgId,
      default_geography: null,
      default_framework_ids: [],
    });

    await upsertUseCaseOrgSettings(owner.orgId, {
      default_geography: 2,
      default_framework_ids: [1],
    });

    expect(await getUseCaseOrgSettings(owner.orgId)).toMatchObject({
      default_geography: 2,
      default_framework_ids: [1],
    });
    expect(await getUseCaseOrgSettings(attacker.orgId)).toEqual({
      organization_id: attacker.orgId,
      default_geography: null,
      default_framework_ids: [],
    });
  });

  it("keeps absent fields, clears the region with null and the frameworks with []", async () => {
    const { owner } = await seedTwoTenantContexts();
    await upsertUseCaseOrgSettings(owner.orgId, {
      default_geography: 2,
      default_framework_ids: [1],
    });

    await upsertUseCaseOrgSettings(owner.orgId, { default_geography: 3 });
    expect(await getUseCaseOrgSettings(owner.orgId)).toMatchObject({
      default_geography: 3,
      default_framework_ids: [1],
    });

    await upsertUseCaseOrgSettings(owner.orgId, { default_framework_ids: [] });
    expect(await getUseCaseOrgSettings(owner.orgId)).toMatchObject({
      default_geography: 3,
      default_framework_ids: [],
    });

    await upsertUseCaseOrgSettings(owner.orgId, { default_geography: null });
    expect((await getUseCaseOrgSettings(owner.orgId)).default_geography).toBeNull();
  });

  it("accepts only project-level frameworks as defaults", async () => {
    // 1 = EU AI Act (project-level), 2 = ISO 42001 (organization-wide), 99999 = none.
    expect(await projectLevelFrameworkIdsQuery([1, 2, 99999])).toEqual([1]);
    expect(await projectLevelFrameworkIdsQuery([])).toEqual([]);
  });
});
