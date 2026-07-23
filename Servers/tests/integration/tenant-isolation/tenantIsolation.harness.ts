/**
 * Reusable tenant-isolation test harness.
 *
 * Provides seeding, request helpers, and cross-tenant assertions for the
 * isolation test matrix.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

import { Application } from "express";
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
  roleName: "Admin" | "Editor" | "SuperAdmin";
  app: Application;
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
  updatePayload: Record<string, any>;
  createPayload: Record<string, any>;
  dbTable: string;
}

function roleNameFromId(roleId: number): "Admin" | "Editor" | "SuperAdmin" {
  if (roleId === 5) return "SuperAdmin";
  if (roleId === 3) return "Editor";
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
  const app = createTestApp({
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
  const ownerApp = createTestApp({
    bypassAuth: true,
    mockUser: {
      userId: seed.userA,
      organizationId: seed.orgA,
      role: roleNameFromId(roleId),
    },
  });
  const attackerApp = createTestApp({
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
 * Assert that a resource seeded in the owner context cannot be read,
 * updated, or deleted from the attacker context.
 */
export async function assertCrossTenantDenial(options: CrossTenantOptions): Promise<void> {
  const { owner, attacker, seedResource, routes, updatePayload } = options;
  const resourceId = await seedResource(owner);

  const getRes = await attacker.request.get(routes.get(resourceId));
  expect(getRes.status).toBe(404);

  const putRes = await attacker.request.put(routes.update(resourceId)).send(updatePayload);
  expect([404, 403]).toContain(putRes.status);

  const patchRes = await attacker.request.patch(routes.update(resourceId)).send(updatePayload);
  expect([404, 403]).toContain(patchRes.status);

  const deleteRes = await attacker.request.delete(routes.delete(resourceId));
  expect([404, 403]).toContain(deleteRes.status);
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
): Promise<void> {
  await seedResource(owner);

  const ownerList = await owner.request.get(listRoute);
  expect(ownerList.status).toBe(200);
  expect(extractItems(ownerList).length).toBeGreaterThan(0);

  const attackerList = await attacker.request.get(listRoute);
  expect(attackerList.status).toBe(200);
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
