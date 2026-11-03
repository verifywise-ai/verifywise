/**
 * Removing a user from one organization under RLS enforcement.
 *
 * organization_members carries the tenant_isolation policy, so a request
 * running as verifywise_app with app.current_org set only sees the current
 * organization's memberships. "Was that their last membership?" must not be
 * asked through that view: a user still in another organization would lose
 * their account, and the deferred orphan check would refuse the commit.
 *
 * Like reporting-rls-policies.test.ts this SETs LOCAL ROLE to the non-owner
 * runtime role, because the owner is not subject to RLS. Unlike it, the
 * transaction commits: the orphan check is a deferred trigger and only fires
 * at commit.
 */

import { sequelize } from "../../../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { cleanupDatabase, createTestOrganization, createTestUser } from "../helpers";
import { removeUserFromOrganizationQuery } from "../../../utils/user.utils";
import { inviteeRefusalQuery } from "../../../utils/organizationMember.utils";

const APP_ROLE = "verifywise_app";

/** Run `fn` as the runtime role scoped to `orgId`, then commit. */
async function asAppRoleCommitted<T>(
  orgId: number,
  fn: (t: Transaction) => Promise<T>,
): Promise<T> {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(`SET LOCAL ROLE ${APP_ROLE}`, { transaction: t });
    await sequelize.query(`SET LOCAL app.current_org = '${orgId}'`, { transaction: t });
    const out = await fn(t);
    await t.commit();
    return out;
  } catch (error) {
    if (!(t as unknown as { finished?: string }).finished) await t.rollback();
    throw error;
  }
}

const membershipsOf = async (userId: number): Promise<number[]> =>
  (
    (await sequelize.query(
      `SELECT organization_id FROM organization_members WHERE user_id = :userId
        ORDER BY organization_id`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    )) as { organization_id: number }[]
  ).map((r) => r.organization_id);

const userExists = async (userId: number): Promise<boolean> =>
  (
    (await sequelize.query(`SELECT 1 FROM users WHERE id = :userId`, {
      replacements: { userId },
      type: QueryTypes.SELECT,
    })) as unknown[]
  ).length > 0;

describe("organization_members under RLS: removing a user from one organization", () => {
  jest.setTimeout(60_000);

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("keeps the account and the other membership of a user in two organizations", async () => {
    const orgA = await createTestOrganization(`RLS members A ${Date.now()}`);
    const orgB = await createTestOrganization(`RLS members B ${Date.now()}`);
    const userId = await createTestUser(orgA, 3, `rls-members-${Date.now()}@test.com`, "Pass123!");
    await sequelize.query(
      `INSERT INTO organization_members (organization_id, user_id, role_id) VALUES (:orgB, :userId, 3)`,
      { replacements: { orgB, userId } },
    );

    const result = await asAppRoleCommitted(orgA, (t) =>
      removeUserFromOrganizationQuery(userId, orgA, t),
    );

    expect(result).toEqual({ removed: true, accountDeleted: false });
    expect(await userExists(userId)).toBe(true);
    expect(await membershipsOf(userId)).toEqual([orgB]);
  });

  it("deletes the account when it was the user's last membership", async () => {
    const orgA = await createTestOrganization(`RLS members only ${Date.now()}`);
    const userId = await createTestUser(
      orgA,
      3,
      `rls-members-only-${Date.now()}@test.com`,
      "Pass123!",
    );

    const result = await asAppRoleCommitted(orgA, (t) =>
      removeUserFromOrganizationQuery(userId, orgA, t),
    );

    expect(result).toEqual({ removed: true, accountDeleted: true });
    expect(await userExists(userId)).toBe(false);
  });

  it("keeps a super admin's account when their last membership is removed", async () => {
    const orgA = await createTestOrganization(`RLS members sa ${Date.now()}`);
    const userId = await createTestUser(
      orgA,
      1,
      `rls-members-sa-${Date.now()}@test.com`,
      "Pass123!",
    );
    await sequelize.query(`INSERT INTO super_admins (user_id) VALUES (:userId)`, {
      replacements: { userId },
    });

    const result = await asAppRoleCommitted(orgA, (t) =>
      removeUserFromOrganizationQuery(userId, orgA, t),
    );

    expect(result).toEqual({ removed: true, accountDeleted: false });
    expect(await userExists(userId)).toBe(true);
    expect(await membershipsOf(userId)).toEqual([]);
  });

  it("lets an organization invite a member of other organizations only", async () => {
    const orgA = await createTestOrganization(`RLS invite A ${Date.now()}`);
    const orgB = await createTestOrganization(`RLS invite B ${Date.now()}`);
    const email = `rls-invite-${Date.now()}@test.com`;
    await createTestUser(orgB, 3, email, "Pass123!");
    const inA = `rls-invite-a-${Date.now()}@test.com`;
    await createTestUser(orgA, 3, inA, "Pass123!");

    const [other, member] = await asAppRoleCommitted(orgA, async (t) => [
      await inviteeRefusalQuery(orgA, email, t),
      await inviteeRefusalQuery(orgA, inA, t),
    ]);

    // Not "super_admin": org A cannot see the org B membership, the helper can.
    expect(other).toBeNull();
    expect(member).toBe("already_member");
  });

  it("does not let PUBLIC execute the cross-tenant membership helper", async () => {
    const [row] = (await sequelize.query(
      `SELECT has_function_privilege('public', 'verifywise.user_has_organization_membership(integer)', 'EXECUTE') AS public_can,
              has_function_privilege('${APP_ROLE}', 'verifywise.user_has_organization_membership(integer)', 'EXECUTE') AS app_can`,
      { type: QueryTypes.SELECT },
    )) as { public_can: boolean; app_can: boolean }[];
    expect(row).toEqual({ public_can: false, app_can: true });
  });
});
