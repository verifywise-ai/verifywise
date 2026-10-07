/**
 * @file roleMap.ts
 * @description Dynamic role id → name map sourced from the `roles` table.
 *
 * The map used to be hardcoded in auth.middleware.ts, which meant adding a
 * new role required a code change + redeploy even though the row already
 * existed in the database. This module replaces the static constant with a
 * cached DB lookup so the auth/register middlewares pick up role-table
 * changes automatically (within the cache TTL, or instantly when the role
 * controller invalidates after a mutation).
 *
 * Strategy:
 *   - In-memory cache with a TTL (default 60s) — short enough that any
 *     direct-SQL role change propagates within a minute without redeploy.
 *   - Concurrent-request coalescing: only one DB query in flight at a time.
 *   - Explicit invalidation: callers that mutate the roles table (see
 *     role.ctrl.ts) call invalidateRoleMapCache() to flip propagation from
 *     "≤ TTL" to "immediate".
 */

import { getAllRolesQuery } from "./role.utils";

export const ROLE_MAP_TTL_MS = 60_000;

export interface RoleInfo {
  id: number;
  name: string;
  /** NULL for global built-in roles; set for custom organization roles. */
  organizationId: number | null;
}

interface RoleMaps {
  byId: Map<number, RoleInfo>;
  /** Keyed `${organizationId ?? ""}:${name}` — org-scoped rows shadow globals. */
  byOrgAndName: Map<string, RoleInfo>;
}

let cache: RoleMaps | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<RoleMaps> | null = null;

function roleKey(organizationId: number | null, name: string): string {
  return `${organizationId ?? ""}:${name}`;
}

async function loadRoleMap(): Promise<RoleMaps> {
  const roles = await getAllRolesQuery();
  const byId = new Map<number, RoleInfo>();
  const byOrgAndName = new Map<string, RoleInfo>();
  for (const r of roles) {
    if (typeof r.id === "number" && typeof r.name === "string") {
      const orgId = typeof r.organization_id === "number" ? r.organization_id : null;
      const info: RoleInfo = { id: r.id, name: r.name, organizationId: orgId };
      byId.set(r.id, info);
      // First write wins for a (org, name) pair; the unique partial index in
      // the DB guarantees there is only one row per pair anyway.
      const key = roleKey(orgId, r.name);
      if (!byOrgAndName.has(key)) byOrgAndName.set(key, info);
    }
  }
  return { byId, byOrgAndName };
}

async function getRoleMap(): Promise<RoleMaps> {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) return cache;

  if (inflight) return inflight;

  inflight = loadRoleMap()
    .then((map) => {
      cache = map;
      cacheExpiresAt = Date.now() + ROLE_MAP_TTL_MS;
      return map;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Resolve a role id to its name. Returns undefined if the id doesn't exist.
 */
export async function getRoleNameById(id: number): Promise<string | undefined> {
  const map = await getRoleMap();
  return map.byId.get(id)?.name;
}

/**
 * True if the given role id exists in the roles table.
 */
export async function hasRoleId(id: number): Promise<boolean> {
  const map = await getRoleMap();
  return map.byId.has(id);
}

/**
 * Resolve a role by name within an organization. Custom (org-scoped) roles
 * shadow global built-ins of the same name for that org — creation-time
 * validation prevents custom roles from reusing built-in names, so in
 * practice a name resolves to at most one role per org.
 *
 * Used by the permission matrix (issue #4588) to decide whether a role is a
 * built-in (global row) or a custom role (org row → role_permissions table).
 */
export async function getRoleByName(
  organizationId: number | null,
  name: string,
): Promise<RoleInfo | undefined> {
  const map = await getRoleMap();
  if (organizationId != null) {
    const scoped = map.byOrgAndName.get(roleKey(organizationId, name));
    if (scoped) return scoped;
  }
  return map.byOrgAndName.get(roleKey(null, name));
}

/**
 * Force the next call to re-read the roles table. Call this from any code
 * path that mutates the table so changes take effect on the very next
 * authenticated request instead of waiting for TTL expiry.
 */
export function invalidateRoleMapCache(): void {
  cache = null;
  cacheExpiresAt = 0;
  inflight = null;
}
