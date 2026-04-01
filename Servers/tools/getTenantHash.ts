import { createHash } from "crypto";
import { sequelize } from "../database/db";

/**
 * Generates a tenant hash from organization ID
 *
 * @deprecated This function is deprecated for shared-schema multi-tenancy.
 * With the new architecture, use organizationId directly in queries:
 *   - WHERE organization_id = :organizationId
 *   - Instead of: "${getTenantHash(orgId)}".tablename
 *
 * This function is kept temporarily for backward compatibility during migration.
 * It will be removed once all queries are migrated to use organization_id directly.
 *
 * @param tenantId - The organization ID (number)
 * @returns A 10-character alphanumeric hash
 */
export const getTenantHash = (tenantId: number): string => {
  const hash = createHash('sha256').update(tenantId.toString()).digest('base64');
  return hash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

/**
 * Reverse lookup: find organization ID from tenant hash.
 * Used by batch jobs that iterate over tenant schemas.
 *
 * @param tenantHash - The tenant hash (10-character alphanumeric)
 * @returns The organization ID, or null if not found
 */
export const getOrganizationIdFromTenantHash = async (tenantHash: string): Promise<number | null> => {
  const [rows] = await sequelize.query(
    `SELECT id FROM organizations ORDER BY id`
  );

  for (const row of rows as { id: number }[]) {
    if (getTenantHash(row.id) === tenantHash) {
      return row.id;
    }
  }

  return null;
}
