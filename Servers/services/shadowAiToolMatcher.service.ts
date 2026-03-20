/**
 * Shadow AI Tool Matcher Service
 *
 * Matches event destinations against the global tool registry
 * and manages tenant-specific tool entries.
 */

import { sequelize } from "../database/db";
import { IShadowAiToolRegistry } from "../domain.layer/interfaces/i.shadowAi";

let toolRegistryCache: IShadowAiToolRegistry[] = [];
let cacheLastRefreshed = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load the global tool registry into memory.
 * Cached with a 5-minute TTL.
 */
export async function loadToolRegistry(): Promise<IShadowAiToolRegistry[]> {
  const now = Date.now();
  if (toolRegistryCache.length > 0 && now - cacheLastRefreshed < CACHE_TTL_MS) {
    return toolRegistryCache;
  }

  const [rows] = await sequelize.query(
    `SELECT id, name, vendor, domains, category, models,
            trains_on_data, soc2_certified, gdpr_compliant
     FROM shadow_ai_tool_registry
     ORDER BY name`
  );

  toolRegistryCache = (rows as any[]).map((r) => ({
    ...r,
    domains: r.domains || [],
    models: r.models || [],
  }));
  cacheLastRefreshed = now;
  return toolRegistryCache;
}

/**
 * Clear the in-memory tool registry cache (useful after seeding/updates).
 */
export function clearToolRegistryCache(): void {
  toolRegistryCache = [];
  cacheLastRefreshed = 0;
}

/**
 * Match a destination domain against the tool registry.
 * Returns the matching registry entry or null.
 */
export async function matchDomain(
  destination: string
): Promise<IShadowAiToolRegistry | null> {
  const registry = await loadToolRegistry();
  const normalizedDest = destination.toLowerCase().replace(/^www\./, "");

  for (const tool of registry) {
    for (const domain of tool.domains) {
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
      if (
        normalizedDest === normalizedDomain ||
        normalizedDest.endsWith(`.${normalizedDomain}`)
      ) {
        return tool;
      }
    }
  }

  return null;
}

/**
 * Ensure a tool exists in the tenant's shadow_ai_tools table.
 * If the tool doesn't exist, create it from the registry entry.
 * Uses INSERT ... ON CONFLICT to avoid race conditions.
 * Returns the tenant tool ID and whether the tool was newly created.
 */
export async function ensureTenantTool(
  organizationId: number,
  registryEntry: IShadowAiToolRegistry,
  transaction?: any
): Promise<{ id: number; isNew: boolean }> {
  // Check if tool already exists before upsert
  const [existing] = await sequelize.query(
    `SELECT id FROM shadow_ai_tools WHERE organization_id = :organizationId AND name = :name LIMIT 1`,
    {
      replacements: { organizationId, name: registryEntry.name },
      ...(transaction ? { transaction } : {}),
    }
  );
  const alreadyExists = (existing as any[]).length > 0;

  const [rows] = await sequelize.query(
    `INSERT INTO shadow_ai_tools
       (organization_id, name, vendor, domains, status, risk_score,
        first_detected_at, last_seen_at, total_users, total_events,
        trains_on_data, soc2_certified, gdpr_compliant)
     VALUES
       (:organizationId, :name, :vendor, :domains, 'detected', NULL,
        NOW(), NOW(), 0, 0,
        :trains_on_data, :soc2_certified, :gdpr_compliant)
     ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    {
      replacements: {
        organizationId,
        name: registryEntry.name,
        vendor: registryEntry.vendor || null,
        domains: registryEntry.domains,
        trains_on_data: registryEntry.trains_on_data ?? null,
        soc2_certified: registryEntry.soc2_certified ?? null,
        gdpr_compliant: registryEntry.gdpr_compliant ?? null,
      },
      ...(transaction ? { transaction } : {}),
    }
  );

  const row = (rows as any[])[0];
  return { id: row.id, isNew: !alreadyExists };
}

/**
 * Update tool counters after event ingestion.
 */
export async function updateToolCounters(
  organizationId: number,
  toolId: number,
  eventCount: number,
  uniqueEmails: Set<string>,
  transaction?: any
): Promise<void> {
  // Use the pre-computed unique email count from the batch to avoid a full table scan.
  // total_users is approximated by adding new unique users from this batch.
  // Periodic reconciliation via aggregation service will correct any drift.
  await sequelize.query(
    `UPDATE shadow_ai_tools
     SET last_seen_at = NOW(),
         total_events = total_events + :eventCount,
         total_users = GREATEST(total_users, :uniqueUserCount),
         updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :toolId`,
    {
      replacements: { organizationId, toolId, eventCount, uniqueUserCount: uniqueEmails.size },
      ...(transaction ? { transaction } : {}),
    }
  );
}
