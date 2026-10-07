jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

const ROUTES = {
  list: "/api/roles",
  create: "/api/roles",
  get: (id: number) => `/api/roles/${id}`,
  permissions: (id: number) => `/api/roles/${id}/permissions`,
};

const ROLE_BODY = { name: "AI Engineer", description: "Custom org role" };

const MATRIX = [
  { permission_key: "risks.edit", allowed: true },
  { permission_key: "task.edit", allowed: false },
];

async function seedCustomRole(ctx: TenantContext): Promise<number> {
  const res = await ctx.request.post(ROUTES.create).send(ROLE_BODY);
  expect(res.status).toBe(201);
  return (res.body?.data ?? res.body).id;
}

/**
 * Custom-role permission matrix tenant isolation (issue #4588).
 *
 * role_permissions rows are scoped to (organization, role): another
 * organization must not be able to read, replace or delete the matrix,
 * and the role itself must be invisible outside its org.
 */
describe("Role permissions tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes the permission matrix to the owning organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);

    const roleId = await seedCustomRole(owner);
    const put = await owner.request.put(ROUTES.permissions(roleId)).send({ permissions: MATRIX });
    expect(put.status).toBe(202);

    // Cross-tenant read of the matrix is refused.
    const crossGet = await attacker.request.get(ROUTES.permissions(roleId));
    expect([403, 404]).toContain(crossGet.status);

    // Cross-tenant matrix replace is refused.
    const crossPut = await attacker.request
      .put(ROUTES.permissions(roleId))
      .send({ permissions: [{ permission_key: "roles.manage", allowed: true }] });
    expect(crossPut.status).toBe(403);

    // Cross-tenant role delete is refused.
    const crossDelete = await attacker.request.delete(ROUTES.get(roleId));
    expect(crossDelete.status).toBe(403);

    // The custom role is invisible outside its org: GET /roles returns
    // built-ins plus the caller's own org's custom roles only.
    const attackerRoles = await attacker.request.get(ROUTES.list);
    expect(attackerRoles.status).toBe(200);
    const names = (attackerRoles.body?.data ?? []).map((r: any) => r.name);
    expect(names).not.toContain(ROLE_BODY.name);

    // The matrix rows exist exactly as the owning org wrote them.
    const rows: any[] = await sequelize.query(
      `SELECT permission_key, allowed FROM role_permissions
        WHERE role_id = :roleId ORDER BY permission_key`,
      { replacements: { roleId }, type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      { permission_key: "risks.edit", allowed: true },
      { permission_key: "task.edit", allowed: false },
    ]);
  });

  it("denies matrix writes on built-in roles", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const res = await owner.request
      .put(ROUTES.permissions(1))
      .send({ permissions: [{ permission_key: "risks.edit", allowed: true }] });
    expect(res.status).toBe(403);
  });
});
