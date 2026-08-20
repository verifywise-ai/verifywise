import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import {
  upsertAgentPrimitivesQuery,
  flagStaleAgentsQuery,
  createSyncLogQuery,
  updateSyncLogQuery,
} from "../../utils/agentDiscovery.utils";
import { ExtensionService } from "../extension/extensionService";
import {
  loadConfiguration as loadAzureConfig,
  discoverAgents as discoverAzureAgents,
} from "../../extensions/azure-ai-foundry/azureAiFoundry.service";
import logger from "../../utils/logger/fileLogger";

/**
 * Extension-backed discovery sources. Each entry names the extension key and
 * the concrete `discover()` implementation that returns raw agent primitives
 * for that source. Add new sources here as more extensions expose /discover.
 */
const DISCOVERY_SOURCES = [
  {
    key: "azure-ai-foundry",
    discover: async (organizationId: number) => {
      const config = await loadAzureConfig(organizationId);
      return discoverAzureAgents(config);
    },
  },
];

/**
 * Permission category mapping: maps raw permission segments to normalized categories.
 * Categories follow the v1 spec: ai:invoke, ai:manage, data:read, data:write,
 * identity:read, identity:manage, code:read, code:write, comms:read, comms:write.
 */
const PERMISSION_CATEGORY_MAP: Record<string, string> = {
  // AI-level
  invokemodel: "ai:invoke",
  invoke: "ai:invoke",
  infer: "ai:invoke",
  predict: "ai:invoke",
  generate: "ai:invoke",
  bedrock: "ai:invoke",
  sagemaker: "ai:invoke",
  cognitiveservices: "ai:invoke",
  machinelearningservices: "ai:invoke",
  aiservices: "ai:invoke",
  createmodel: "ai:manage",
  deletemodel: "ai:manage",
  updatemodel: "ai:manage",
  createagent: "ai:manage",
  deleteagent: "ai:manage",
  createendpoint: "ai:manage",
  // Data-level
  read: "data:read",
  list: "data:read",
  get: "data:read",
  view: "data:read",
  describe: "data:read",
  select: "data:read",
  write: "data:write",
  create: "data:write",
  update: "data:write",
  put: "data:write",
  patch: "data:write",
  delete: "data:write",
  remove: "data:write",
  insert: "data:write",
  // Identity-level
  users: "identity:read",
  members: "identity:read",
  profiles: "identity:read",
  directory: "identity:read",
  admin: "identity:manage",
  manage: "identity:manage",
  permissions: "identity:manage",
  roles: "identity:manage",
  // Code-level
  repos: "code:read",
  contents: "code:read",
  code: "code:read",
  actions: "code:write",
  workflows: "code:write",
  deploy: "code:write",
  push: "code:write",
  execute: "code:write",
  run: "code:write",
  // Communications-level
  channels: "comms:read",
  messages: "comms:read",
  chat: "comms:read",
  conversations: "comms:read",
  send: "comms:write",
  post: "comms:write",
  notify: "comms:write",
  email: "comms:write",
};

function categorizePermissions(permissions: string[]): string[] {
  const categories = new Set<string>();
  for (const perm of permissions) {
    const normalized = perm.toLowerCase().trim();
    let matched = false;

    // Check for exact match first (handles compound keys like "invokemodel")
    const compacted = normalized.replace(/[^a-z]/g, "");
    if (PERMISSION_CATEGORY_MAP[compacted]) {
      categories.add(PERMISSION_CATEGORY_MAP[compacted]);
      continue;
    }

    // Split on colons, dots, underscores, hyphens, and camelCase boundaries
    // e.g., "bedrock:InvokeModel" → ["bedrock", "invoke", "model"]
    const segments = normalized
      .split(/[:._\-/]/)
      .flatMap((s) =>
        s
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/\s+/),
      )
      .filter(Boolean);

    for (const segment of segments) {
      if (PERMISSION_CATEGORY_MAP[segment]) {
        categories.add(PERMISSION_CATEGORY_MAP[segment]);
        matched = true;
      }
    }

    // Also try joining adjacent segments (e.g., ["invoke", "model"] → "invokemodel")
    if (!matched) {
      for (let i = 0; i < segments.length - 1; i++) {
        const compound = segments[i] + segments[i + 1];
        if (PERMISSION_CATEGORY_MAP[compound]) {
          categories.add(PERMISSION_CATEGORY_MAP[compound]);
          matched = true;
        }
      }
    }

    if (!matched) {
      categories.add("other");
    }
  }
  return [...categories];
}

/**
 * Run agent discovery sync for a single tenant.
 * Called by the manual trigger endpoint and by the scheduled job.
 */
export async function runAgentDiscoverySyncForTenant(
  organizationId: number,
  triggeredBy: string = "manual",
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  for (const source of DISCOVERY_SOURCES) {
    const sourceKey = source.key;

    let enabled = false;
    try {
      const status = await ExtensionService.getByKey(sourceKey, organizationId);
      enabled = (status as any)?.enabled === true;
    } catch {
      continue;
    }
    if (!enabled) continue;

    let rawPrimitives: Array<Record<string, unknown>>;
    try {
      rawPrimitives = await source.discover(organizationId);
    } catch (discoverErr: any) {
      logger.warn(`[AgentDiscoverySync] ${sourceKey}: discover failed: ${discoverErr.message}`);
      continue;
    }

    if (!Array.isArray(rawPrimitives) || rawPrimitives.length === 0) continue;

    const syncLog = await createSyncLogQuery(
      { source_system: sourceKey, triggered_by: triggeredBy },
      organizationId,
    );

    try {
      const primitives = rawPrimitives.filter((p: any) => {
        if (!p.external_id || typeof p.external_id !== "string") {
          logger.warn(
            `[AgentDiscoverySync] ${sourceKey}: skipping primitive with missing/invalid external_id`,
          );
          return false;
        }
        if (!p.display_name || typeof p.display_name !== "string") {
          logger.warn(
            `[AgentDiscoverySync] ${sourceKey}: skipping primitive "${p.external_id}" with missing/invalid display_name`,
          );
          return false;
        }
        if (p.permissions && !Array.isArray(p.permissions)) {
          logger.warn(
            `[AgentDiscoverySync] ${sourceKey}: skipping primitive "${p.external_id}" — permissions must be an array`,
          );
          return false;
        }
        return true;
      });

      if (primitives.length < rawPrimitives.length) {
        logger.warn(
          `[AgentDiscoverySync] ${sourceKey}: ${rawPrimitives.length - primitives.length} of ${rawPrimitives.length} primitives failed validation`,
        );
      }

      const normalizedPrimitives = primitives.map((p: any) => ({
        source_system: p.source_system || sourceKey,
        primitive_type: p.primitive_type || "unknown",
        external_id: p.external_id,
        display_name: p.display_name,
        owner_id: p.owner_id || null,
        permissions: p.permissions || [],
        permission_categories: categorizePermissions(p.permissions || []),
        last_activity: p.last_activity || null,
        metadata: p.metadata || {},
      }));

      const { created, updated } = await upsertAgentPrimitivesQuery(
        normalizedPrimitives,
        organizationId,
      );

      const staleFlagged = await flagStaleAgentsQuery(sourceKey, organizationId);

      await updateSyncLogQuery(
        syncLog.id!,
        {
          status: "success",
          primitives_found: normalizedPrimitives.length,
          primitives_created: created,
          primitives_updated: updated,
          primitives_stale_flagged: typeof staleFlagged === "number" ? staleFlagged : 0,
        },
        organizationId,
      );

      synced.push(sourceKey);
      logger.info(
        `[AgentDiscoverySync] ${sourceKey}: found=${normalizedPrimitives.length}, created=${created}, updated=${updated}, stale=${staleFlagged}`,
      );
    } catch (sourceError) {
      const errMsg = (sourceError as Error).message;
      await updateSyncLogQuery(
        syncLog.id!,
        { status: "failed", error_message: errMsg },
        organizationId,
      );
      errors.push(`${sourceKey}: ${errMsg}`);
      logger.error(`[AgentDiscoverySync] Error syncing ${sourceKey}: ${errMsg}`);
    }
  }

  return { synced, errors };
}

/**
 * Run agent discovery sync for ALL organizations.
 * Called by the scheduled BullMQ job.
 */
export async function runAgentDiscoverySync(): Promise<void> {
  logger.info("[AgentDiscoverySync] Starting scheduled sync for all orgs...");

  const organizations = await getAllOrganizationsQuery();

  for (const org of organizations) {
    try {
      await runAgentDiscoverySyncForTenant(org.id!, "scheduled");
    } catch (error) {
      logger.error(`[AgentDiscoverySync] Failed for org ${org.id}: ${(error as Error).message}`);
    }
  }

  logger.info("[AgentDiscoverySync] Scheduled sync complete.");
}
