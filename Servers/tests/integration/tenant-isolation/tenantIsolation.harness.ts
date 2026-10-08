/**
 * Reusable tenant-isolation test harness.
 *
 * Provides seeding, request helpers, and cross-tenant assertions for the
 * isolation test matrix.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

import http from "http";
import { Response, Agent } from "supertest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { createTestApp, testRequest } from "../setup";
import {
  createTestUser,
  createTestOrganization,
  seedTwoOrgsAndUsers as seedTwoOrgsAndUsersHelper,
  TwoOrgsSeed,
} from "../helpers";

export { seedTwoOrgsAndUsersHelper as seedTwoOrgsAndUsers };
export type { TwoOrgsSeed };

export interface TenantContext {
  orgId: number;
  userId: number;
  roleName: "Admin" | "Reviewer" | "Editor" | "Auditor" | "SuperAdmin";
  app: http.Server;
  request: Agent;
}

export interface ResourceRoutes {
  list: string;
  get: (id: number) => string;
  create: string;
  update: (id: number) => string;
  delete: (id: number) => string;
}

export interface CrossTenantOptions {
  owner: TenantContext;
  attacker: TenantContext;
  seedResource: (ctx: TenantContext) => Promise<number>;
  routes: ResourceRoutes;
  /** The verb the update route really has. */
  updateVerb: "PUT" | "PATCH";
  updatePayload: Record<string, any>;
  createPayload: Record<string, any>;
  dbTable: string;
}

function roleNameFromId(
  roleId: number,
): "Admin" | "Reviewer" | "Editor" | "Auditor" | "SuperAdmin" {
  if (roleId === 5) return "SuperAdmin";
  if (roleId === 4) return "Auditor";
  if (roleId === 3) return "Editor";
  if (roleId === 2) return "Reviewer";
  return "Admin";
}

/**
 * Build a tenant context: create an org and user, then build a test app
 * that bypasses JWT auth for that user.
 */
export async function buildTenantContext(
  roleId: number = 1,
  orgName?: string,
): Promise<TenantContext> {
  const orgId = await createTestOrganization(orgName);
  const suffix = Date.now();
  const email = `tenant-${roleId}-${suffix}@test.com`;
  const userId = await createTestUser(orgId, roleId, email, "Password123!");
  const roleName = roleNameFromId(roleId);
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: roleName },
  });
  return { orgId, userId, roleName, app, request: testRequest(app) };
}

/**
 * Seed two organizations with one user each. Returns both tenant contexts.
 */
export async function seedTwoTenantContexts(
  roleId: number = 1,
): Promise<{ owner: TenantContext; attacker: TenantContext }> {
  const seed = await seedTwoOrgsAndUsersHelper(roleId);
  const ownerApp = await createTestApp({
    bypassAuth: true,
    mockUser: {
      userId: seed.userA,
      organizationId: seed.orgA,
      role: roleNameFromId(roleId),
    },
  });
  const attackerApp = await createTestApp({
    bypassAuth: true,
    mockUser: {
      userId: seed.userB,
      organizationId: seed.orgB,
      role: roleNameFromId(roleId),
    },
  });
  return {
    owner: {
      orgId: seed.orgA,
      userId: seed.userA,
      roleName: roleNameFromId(roleId),
      app: ownerApp,
      request: testRequest(ownerApp),
    },
    attacker: {
      orgId: seed.orgB,
      userId: seed.userB,
      roleName: roleNameFromId(roleId),
      app: attackerApp,
      request: testRequest(attackerApp),
    },
  };
}

/**
 * Perform an HTTP request against a supertest agent.
 */
export async function makeRequest(
  agent: Agent,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  route: string,
  payload?: Record<string, any>,
): Promise<Response> {
  switch (method) {
    case "GET":
      return agent.get(route);
    case "POST":
      return payload ? agent.post(route).send(payload) : agent.post(route);
    case "PUT":
      return payload ? agent.put(route).send(payload) : agent.put(route);
    case "PATCH":
      return payload ? agent.patch(route).send(payload) : agent.patch(route);
    case "DELETE":
      return agent.delete(route);
  }
}

/**
 * Fail unless the owner's positive control succeeded. Without it, a denial
 * check passes for a route that does not exist: Express answers an unknown
 * verb with its own 404, which is indistinguishable from a tenancy 404.
 */
function expectOwnerControl(res: Response, what: string, allowed?: number[]): void {
  const ok = allowed ? allowed.includes(res.status) : res.status >= 200 && res.status < 300;
  if (!ok) {
    throw new Error(
      `Positive control failed: owner ${what} returned ${res.status}, expected ` +
        `${allowed ? allowed.join(" or ") : "2xx"}. The denial check proves nothing ` +
        `until the owner's request succeeds. Body: ${JSON.stringify(res.body)}`,
    );
  }
}

async function selectRow(table: string, id: number): Promise<Record<string, any> | undefined> {
  const [row] = await sequelize.query(`SELECT * FROM ${table} WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return row as Record<string, any> | undefined;
}

export interface WriteDenialOptions {
  owner: TenantContext;
  attacker: TenantContext;
  resourceId: number;
  route: string;
  /** Table holding `resourceId`, for the unchanged-row check. */
  table: string;
  /** Statuses that count as a denial for the attacker. */
  denial: number[];
}

/**
 * Attacker read of the owner's row is denied; the owner reads it with 200.
 */
export async function assertReadDenied(
  owner: TenantContext,
  attacker: TenantContext,
  route: string,
  denial: number[],
): Promise<void> {
  const attackerRes = await attacker.request.get(route);
  expect(denial).toContain(attackerRes.status);

  const ownerRes = await owner.request.get(route);
  expectOwnerControl(ownerRes, `GET ${route}`, [200]);
}

/**
 * Attacker update of the owner's row is denied and leaves the row unchanged;
 * the same request succeeds for the owner.
 */
export async function assertUpdateDenied(
  options: WriteDenialOptions & { verb: "PUT" | "PATCH"; payload: Record<string, any> },
): Promise<void> {
  const { owner, attacker, resourceId, route, table, denial, verb, payload } = options;
  const before = await selectRow(table, resourceId);
  expect(before).toBeDefined();

  const attackerRes = await makeRequest(attacker.request, verb, route, payload);
  expect(denial).toContain(attackerRes.status);
  expect(await selectRow(table, resourceId)).toEqual(before);

  const ownerRes = await makeRequest(owner.request, verb, route, payload);
  expectOwnerControl(ownerRes, `${verb} ${route}`);
}

/**
 * Attacker delete of the owner's row is denied and leaves the row untouched
 * (which also catches a soft delete); the same request succeeds for the owner.
 */
export async function assertDeleteDenied(options: WriteDenialOptions): Promise<void> {
  const { owner, attacker, resourceId, route, table, denial } = options;
  const before = await selectRow(table, resourceId);
  expect(before).toBeDefined();

  const attackerRes = await attacker.request.delete(route);
  expect(denial).toContain(attackerRes.status);
  expect(await selectRow(table, resourceId)).toEqual(before);

  const ownerRes = await owner.request.delete(route);
  expectOwnerControl(ownerRes, `DELETE ${route}`);
}

/**
 * Assert that a resource seeded in the owner context cannot be read,
 * updated, or deleted from the attacker context, with an owner positive
 * control on each op.
 *
 * `updateVerb` must be the verb the update route really has. This used to send
 * both PUT and PATCH and accept 404, so the verb with no route passed as a
 * denial (confirmed for tasks PATCH and projects PUT in #4501 Phase 0).
 */
export async function assertCrossTenantDenial(options: CrossTenantOptions): Promise<void> {
  const { owner, attacker, seedResource, routes, updateVerb, updatePayload, dbTable } = options;
  const resourceId = await seedResource(owner);
  const write = { owner, attacker, resourceId, table: dbTable, denial: [403, 404] };

  await assertReadDenied(owner, attacker, routes.get(resourceId), [404]);
  await assertUpdateDenied({
    ...write,
    route: routes.update(resourceId),
    verb: updateVerb,
    payload: updatePayload,
  });
  await assertDeleteDenied({ ...write, route: routes.delete(resourceId) });
}

/**
 * Assert that a list endpoint returns records for the owner but none
 * for the attacker after seeding in the owner context.
 */
export async function assertListOnlyOwnOrg(
  owner: TenantContext,
  attacker: TenantContext,
  listRoute: string,
  seedResource: (ctx: TenantContext) => Promise<number>,
  extractItems: (res: Response) => any[],
  attackerStatuses: number[] = [200],
): Promise<void> {
  await seedResource(owner);

  const ownerList = await owner.request.get(listRoute);
  expect(ownerList.status).toBe(200);
  expect(extractItems(ownerList).length).toBeGreaterThan(0);

  const attackerList = await attacker.request.get(listRoute);
  expect(attackerStatuses).toContain(attackerList.status);
  expect(extractItems(attackerList).length).toBe(0);
}

/**
 * Assert that a POST create endpoint ignores a foreign organization_id
 * in the request body and stamps the caller's organization_id in the DB.
 */
export async function assertCreateStampsCallerOrg(
  caller: TenantContext,
  foreignOrgId: number,
  routes: Pick<ResourceRoutes, "create">,
  buildPayload: (foreignOrgId: number) => Record<string, any>,
  dbTable: string,
  extractId: (res: Response) => number | undefined = (res) => res.body?.data?.id ?? res.body?.id,
): Promise<number> {
  const payload = buildPayload(foreignOrgId);
  const res = await caller.request.post(routes.create).send(payload);
  return assertCreatedRowStampedWithCallerOrg(caller, res, dbTable, extractId);
}

/**
 * Assert that a create response succeeded and that the new row carries the
 * caller's organization_id. Use it directly for creates a JSON body can't
 * reach (e.g. a multipart upload).
 */
export async function assertCreatedRowStampedWithCallerOrg(
  caller: TenantContext,
  res: Response,
  dbTable: string,
  extractId: (res: Response) => number | undefined = (res) => res.body?.data?.id ?? res.body?.id,
): Promise<number> {
  expect([200, 201]).toContain(res.status);

  const id = extractId(res);
  expect(id).toBeDefined();

  const [row] = await sequelize.query(`SELECT organization_id FROM ${dbTable} WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  expect(row).toBeDefined();
  expect((row as any).organization_id).toBe(caller.orgId);

  return id as number;
}

/**
 * Assert that a resource seeded in the owner context is still present
 * after a failed cross-tenant delete attempt.
 */
export async function assertResourceSurvivesCrossTenantDelete(
  owner: TenantContext,
  attacker: TenantContext,
  resourceId: number,
  routes: Pick<ResourceRoutes, "get" | "delete">,
): Promise<void> {
  const deleteRes = await attacker.request.delete(routes.delete(resourceId));
  expect([404, 403]).toContain(deleteRes.status);

  const getRes = await owner.request.get(routes.get(resourceId));
  expect(getRes.status).toBe(200);
}
