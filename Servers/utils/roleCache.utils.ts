/**
 * Role-map cache.
 *
 * Auth middleware needs an `id → name` lookup for every authenticated
 * request to validate that the JWT-encoded role still matches the role
 * currently stored in the DB for that user. Hitting the `roles` table on
 * every request would be wasteful; hardcoding the map means a deploy is
 * required every time a role is added.
 *
 * This module keeps an in-process cache of the `roles` table with a short
 * TTL. Role-management endpoints (create / update / delete) call
 * {@link invalidateRoleCache} so changes propagate immediately.
 *
 * Concurrent fetches during a cold cache are deduped via a single shared
 * in-flight promise, so a thundering herd of requests after expiry only
 * issues one DB query.
 *
 * @module utils/roleCache
 */

import { getAllRolesQuery } from "./role.utils";

const DEFAULT_TTL_MS = 60_000;

interface RoleCacheState {
  map: Map<number, string>;
  expiresAt: number;
}

let state: RoleCacheState | null = null;
let inFlight: Promise<Map<number, string>> | null = null;

/** Override the default TTL — used by tests. */
let ttlMs = DEFAULT_TTL_MS;

/**
 * Set the cache TTL in milliseconds. Test-only — production code should
 * leave the default.
 */
export function _setRoleCacheTtlMs(value: number): void {
  ttlMs = value;
}

/** Reset cache state. Test-only. */
export function _resetRoleCache(): void {
  state = null;
  inFlight = null;
  ttlMs = DEFAULT_TTL_MS;
}

/**
 * Invalidate the cached role map. Call this after any role create / update /
 * delete so the next lookup re-fetches from the DB.
 */
export function invalidateRoleCache(): void {
  state = null;
  // Note: we do NOT cancel an in-flight fetch — letting it complete is fine
  // because the result will simply be overwritten on the next call if the DB
  // has been modified again.
}

async function refresh(): Promise<Map<number, string>> {
  const rows = await getAllRolesQuery();
  const next = new Map<number, string>();
  for (const row of rows) {
    if (typeof row.id === "number" && typeof row.name === "string") {
      next.set(row.id, row.name);
    }
  }
  state = { map: next, expiresAt: Date.now() + ttlMs };
  return next;
}

/**
 * Return the cached role map, refreshing from the DB if the cache is empty
 * or expired. Concurrent callers during a cold cache share one DB query.
 */
export async function getRoleMap(): Promise<Map<number, string>> {
  if (state && state.expiresAt > Date.now()) {
    return state.map;
  }
  if (inFlight) return inFlight;

  inFlight = refresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Resolve a role id to its current DB-backed name (or undefined). */
export async function getRoleNameById(id: number): Promise<string | undefined> {
  const map = await getRoleMap();
  return map.get(id);
}

/** Whether a role id exists in the current DB-backed map. */
export async function roleIdExists(id: number): Promise<boolean> {
  const map = await getRoleMap();
  return map.has(id);
}
