/**
 * @file rolePermissions.utils.ts
 * @description Per-organization role permission matrix (issue #4588).
 *
 * Resolution rules for `roleHasPermission(orgId, roleName, key)`:
 *   - Built-in roles (global rows, organization_id IS NULL) resolve against
 *     the static BUILTIN_ROLE_PERMISSIONS matrix — byte-for-byte parity with
 *     the old hardcoded `authorize(["Admin", ...])` allowlists.
 *   - Custom roles (org-scoped rows) resolve against the `role_permissions`
 *     table; a missing row means DENIED, so a freshly created custom role can
 *     authenticate but cannot do anything until an Admin grants permissions.
 *
 * Custom-role permission sets are cached in-memory with a TTL and coalesced
 * loads (same strategy as roleMap.ts); role.ctrl/rolePermissions.ctrl call
 * invalidateRolePermissionsCache() after mutations.
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  ALL_PERMISSION_KEYS,
  BUILTIN_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from "../config/rolePermissions.config";
import { getRoleByName, type RoleInfo } from "./roleMap";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

export const ROLE_PERMISSIONS_TTL_MS = 60_000;

const VALID_KEYS = new Set<string>(ALL_PERMISSION_KEYS);

interface PermissionRow {
  permission_key: string;
  allowed: boolean;
}

interface CachedSet {
  permissions: ReadonlySet<string>;
  expiresAt: number;
}

/** Keyed `${orgId}:${roleId}`. */
const cache = new Map<string, CachedSet>();
let inflight: Promise<void> | null = null;

function cacheKey(orgId: number, roleId: number): string {
  return `${orgId}:${roleId}`;
}

function assertValidPermissionKey(key: string): asserts key is PermissionKey {
  if (!VALID_KEYS.has(key)) {
    throw new ValidationException(`Unknown permission key "${key}"`, "permission_key", key);
  }
}

export async function getRolePermissionsQuery(
  organizationId: number,
  roleId: number,
): Promise<PermissionRow[]> {
  const rows = await sequelize.query(
    `SELECT permission_key, allowed FROM role_permissions
      WHERE organization_id = :organizationId AND role_id = :roleId`,
    {
      replacements: { organizationId, roleId },
      type: QueryTypes.SELECT,
    },
  );
  return rows as PermissionRow[];
}

/**
 * Load (and cache) the effective permission set for a CUSTOM role. Callers
 * must only pass org-scoped roles; built-ins resolve via BUILTIN_ROLE_PERMISSIONS.
 */
async function loadCustomRolePermissions(
  organizationId: number,
  role: RoleInfo,
): Promise<ReadonlySet<string>> {
  const key = cacheKey(organizationId, role.id);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.expiresAt) return hit.permissions;

  if (inflight) await inflight;

  const rows = await getRolePermissionsQuery(organizationId, role.id);
  const permissions = new Set(rows.filter((r) => r.allowed).map((r) => r.permission_key));
  cache.set(key, { permissions, expiresAt: Date.now() + ROLE_PERMISSIONS_TTL_MS });
  return permissions;
}

/**
 * Resolve whether `roleName` (in `organizationId`) holds `permissionKey`.
 * This is the single enforcement point behind authorize().
 */
export async function roleHasPermission(
  organizationId: number | null,
  roleName: string,
  permissionKey: PermissionKey,
): Promise<boolean> {
  assertValidPermissionKey(permissionKey);

  const role = await getRoleByName(organizationId, roleName);
  if (!role) return false; // unknown role: deny (fail-closed, as before)

  if (role.organizationId === null) {
    return BUILTIN_ROLE_PERMISSIONS[role.name]?.has(permissionKey) ?? false;
  }

  // Custom role: only its own org's matrix applies. Without org context
  // (routes mounted without tenant middleware) custom roles cannot resolve
  // and are denied — these routes are Admin/super-tier only in practice.
  if (organizationId == null || role.organizationId !== organizationId) return false;
  const permissions = await loadCustomRolePermissions(organizationId, role);
  return permissions.has(permissionKey);
}

/**
 * All effective permissions for a role (built-in or custom) — used by the
 * GET endpoints that feed the admin UI and the client's permission context.
 */
export async function getEffectivePermissions(
  organizationId: number | null,
  roleName: string,
): Promise<ReadonlySet<string>> {
  const role = await getRoleByName(organizationId, roleName);
  if (!role) return new Set<string>();
  if (role.organizationId === null) {
    return BUILTIN_ROLE_PERMISSIONS[role.name] ?? new Set<string>();
  }
  if (organizationId == null || role.organizationId !== organizationId) return new Set<string>();
  return loadCustomRolePermissions(organizationId, role);
}

/** Grant or revoke one permission for a custom role (upsert). */
export async function setRolePermissionQuery(
  organizationId: number,
  roleId: number,
  permissionKey: string,
  allowed: boolean,
): Promise<void> {
  assertValidPermissionKey(permissionKey);
  await sequelize.query(
    `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
      VALUES (:organizationId, :roleId, :permissionKey, :allowed)
      ON CONFLICT (organization_id, role_id, permission_key)
      DO UPDATE SET allowed = :allowed, updated_at = now()`,
    {
      replacements: { organizationId, roleId, permissionKey, allowed },
      type: QueryTypes.INSERT,
    },
  );
  invalidateRolePermissionsCache(organizationId, roleId);
}

/** Replace the whole matrix for a custom role in one transaction. */
export async function replaceRolePermissionsQuery(
  organizationId: number,
  roleId: number,
  permissions: Array<{ permission_key: string; allowed: boolean }>,
  transaction?: unknown,
): Promise<void> {
  for (const p of permissions) assertValidPermissionKey(p.permission_key);
  const t = transaction as import("sequelize").Transaction | undefined;
  await sequelize.query(
    `DELETE FROM role_permissions WHERE organization_id = :organizationId AND role_id = :roleId`,
    {
      replacements: { organizationId, roleId },
      type: QueryTypes.DELETE,
      transaction: t,
    },
  );
  for (const p of permissions) {
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
        VALUES (:organizationId, :roleId, :permissionKey, :allowed)`,
      {
        replacements: {
          organizationId,
          roleId,
          permissionKey: p.permission_key,
          allowed: p.allowed,
        },
        type: QueryTypes.INSERT,
        transaction: t,
      },
    );
  }
  invalidateRolePermissionsCache(organizationId, roleId);
}

/** Drop all permission rows for a role being deleted. */
export async function deleteRolePermissionsForRoleQuery(
  organizationId: number,
  roleId: number,
  transaction?: unknown,
): Promise<void> {
  const t = transaction as import("sequelize").Transaction | undefined;
  await sequelize.query(
    `DELETE FROM role_permissions WHERE organization_id = :organizationId AND role_id = :roleId`,
    { replacements: { organizationId, roleId }, type: QueryTypes.DELETE, transaction: t },
  );
  invalidateRolePermissionsCache(organizationId, roleId);
}

/** Invalidate one role's cached set, or the whole cache when args are omitted. */
export function invalidateRolePermissionsCache(organizationId?: number, roleId?: number): void {
  if (organizationId == null || roleId == null) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(organizationId, roleId));
}

/** Catalog metadata for the admin UI (key, module, description). */
export function listPermissionCatalog() {
  return ALL_PERMISSION_KEYS.map((key) => ({
    key,
    module: ROLE_PERMISSIONS[key].module,
    description: ROLE_PERMISSIONS[key].description,
  }));
}
