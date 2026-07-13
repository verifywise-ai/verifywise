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

let cache: Map<number, string> | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<Map<number, string>> | null = null;

async function loadRoleMap(): Promise<Map<number, string>> {
  const roles = await getAllRolesQuery();
  const map = new Map<number, string>();
  for (const r of roles) {
    if (typeof r.id === "number" && typeof r.name === "string") {
      map.set(r.id, r.name);
    }
  }
  return map;
}

async function getRoleMap(): Promise<Map<number, string>> {
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
  return map.get(id);
}

/**
 * True if the given role id exists in the roles table.
 */
export async function hasRoleId(id: number): Promise<boolean> {
  const map = await getRoleMap();
  return map.has(id);
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
