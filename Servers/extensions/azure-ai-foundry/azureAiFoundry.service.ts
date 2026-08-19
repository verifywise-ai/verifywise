import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { ExtensionService } from "../../services/extension/extensionService";

/**
 * azure-ai-foundry extension — pulls deployments from an Azure AI Foundry
 * project into verifywise.azure_ai_model_records and exposes them as agent
 * primitives for the agent-discovery pipeline.
 *
 * Uses the Project Deployments API (`{project_endpoint}/deployments?api-version=v1`)
 * — the legacy Resource Manager path from the original plugin is not
 * plumbed through the extension because its access-token acquisition is
 * out-of-band (managed identity, service principal, etc.) and never wired
 * to the plugin router.
 */

export interface AzureAiFoundryConfig {
  project_endpoint?: string;
  api_key?: string;
  subscription_id?: string;
  resource_group?: string;
  resource_name?: string;
}

interface AzureProjectDeployment {
  name: string;
  modelName: string;
  modelVersion?: string;
  modelPublisher?: string;
  capabilities?: Record<string, string>;
  sku?: { name?: string; capacity?: number };
}

export interface AzureAiFoundrySyncResult {
  success: boolean;
  modelCount: number;
  syncedAt: string;
  status: string;
}

export interface AzureAiFoundryTestResult {
  success: boolean;
  message: string;
  testedAt: string;
}

export async function loadConfiguration(organizationId: number): Promise<AzureAiFoundryConfig> {
  return (await ExtensionService.getRuntimeConfiguration(
    "azure-ai-foundry",
    organizationId,
  )) as AzureAiFoundryConfig;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testConnection(
  config: AzureAiFoundryConfig,
): Promise<AzureAiFoundryTestResult> {
  if (!config.project_endpoint || !config.api_key) {
    return {
      success: false,
      message: "Project endpoint and API key are required",
      testedAt: new Date().toISOString(),
    };
  }
  try {
    const url = `${trimTrailingSlash(config.project_endpoint)}/deployments?api-version=v1&limit=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "api-key": config.api_key, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        message: `Server returned ${response.status}: ${text || "no details"}`,
        testedAt: new Date().toISOString(),
      };
    }
    await response.json();
    return {
      success: true,
      message: "Successfully connected to Azure AI Foundry",
      testedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Connection failed: ${err.message}`,
      testedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function upsertDeployments(
  organizationId: number,
  deployments: AzureProjectDeployment[],
): Promise<void> {
  const now = new Date();
  for (const d of deployments) {
    await sequelize.query(
      `INSERT INTO azure_ai_model_records
         (organization_id, deployment_name, model_name, model_format, model_version,
          provisioning_state, sku_name, sku_capacity, capabilities, rate_limits,
          rai_policy_name, created_by, azure_created_at, azure_modified_at,
          last_synced_at, created_at, updated_at)
       VALUES
         (:organization_id, :deployment_name, :model_name, :model_format, :model_version,
          :provisioning_state, :sku_name, :sku_capacity, CAST(:capabilities AS JSONB),
          CAST(:rate_limits AS JSONB), :rai_policy_name, :created_by,
          :azure_created_at, :azure_modified_at, :last_synced_at, NOW(), NOW())
       ON CONFLICT (organization_id, deployment_name) DO UPDATE
       SET model_name         = EXCLUDED.model_name,
           model_format       = EXCLUDED.model_format,
           model_version      = EXCLUDED.model_version,
           provisioning_state = EXCLUDED.provisioning_state,
           sku_name           = EXCLUDED.sku_name,
           sku_capacity       = EXCLUDED.sku_capacity,
           capabilities       = EXCLUDED.capabilities,
           rate_limits        = EXCLUDED.rate_limits,
           rai_policy_name    = EXCLUDED.rai_policy_name,
           created_by         = EXCLUDED.created_by,
           azure_created_at   = EXCLUDED.azure_created_at,
           azure_modified_at  = EXCLUDED.azure_modified_at,
           last_synced_at     = EXCLUDED.last_synced_at,
           updated_at         = NOW();`,
      {
        replacements: {
          organization_id: organizationId,
          deployment_name: d.name,
          model_name: d.modelName ?? d.name,
          // Project API returns publisher (e.g. "Microsoft"), not format — keep the
          // column populated for parity with the ARM API path in the source plugin.
          model_format: d.modelPublisher ?? null,
          model_version: d.modelVersion ?? null,
          // Project API only returns successfully-provisioned deployments.
          provisioning_state: "Succeeded",
          sku_name: d.sku?.name ?? null,
          sku_capacity: d.sku?.capacity ?? null,
          capabilities: JSON.stringify(d.capabilities ?? {}),
          rate_limits: JSON.stringify([]),
          rai_policy_name: null,
          created_by: null,
          azure_created_at: null,
          azure_modified_at: null,
          last_synced_at: now,
        },
      },
    );
  }
}

export async function syncModels(
  organizationId: number,
  config: AzureAiFoundryConfig,
): Promise<AzureAiFoundrySyncResult> {
  if (!config.project_endpoint || !config.api_key) {
    return {
      success: false,
      modelCount: 0,
      syncedAt: new Date().toISOString(),
      status: "failed: project endpoint and API key are required",
    };
  }
  try {
    const url = `${trimTrailingSlash(config.project_endpoint)}/deployments?api-version=v1`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "api-key": config.api_key, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch deployments: ${response.status}`);
    }
    const data: any = await response.json();
    const deployments: AzureProjectDeployment[] = data.value || [];
    if (deployments.length === 0) {
      return {
        success: true,
        modelCount: 0,
        syncedAt: new Date().toISOString(),
        status: "success - no deployments found",
      };
    }
    await upsertDeployments(organizationId, deployments);
    return {
      success: true,
      modelCount: deployments.length,
      syncedAt: new Date().toISOString(),
      status: "success",
    };
  } catch (err: any) {
    return {
      success: false,
      modelCount: 0,
      syncedAt: new Date().toISOString(),
      status: `failed: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Discover — agent primitives (used by agent-discovery sync)
// ---------------------------------------------------------------------------

export async function discoverAgents(
  config: AzureAiFoundryConfig,
): Promise<Array<Record<string, unknown>>> {
  if (!config.project_endpoint || !config.api_key) return [];
  try {
    const url = `${trimTrailingSlash(config.project_endpoint)}/assistants?api-version=v1&limit=100`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "api-key": config.api_key, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Azure AI Foundry returned ${response.status}: ${text}`);
    }
    const result: any = await response.json();
    const assistants = result.data || [];
    return assistants.map((agent: any) => {
      const permissions: string[] = (agent.tools || []).map((tool: any) =>
        tool.type === "function" ? `function:${tool.function?.name || "unknown"}` : tool.type,
      );
      const createdAt = agent.created_at ? new Date(agent.created_at * 1000).toISOString() : null;
      return {
        external_id: agent.id,
        display_name: agent.name || agent.id,
        primitive_type: "ai_agent",
        owner_id: agent.metadata?.owner ?? null,
        permissions,
        last_activity: createdAt,
        metadata: {
          source: "azure_ai_foundry",
          model: agent.model ?? null,
          instructions_preview: agent.instructions
            ? String(agent.instructions).substring(0, 200)
            : null,
          tools_count: agent.tools?.length ?? 0,
          file_ids_count: agent.file_ids?.length ?? 0,
        },
      };
    });
  } catch (err: any) {
    // Discovery is opportunistic — swallow so the sync doesn't fail hard for
    // other extensions when Azure is unreachable.
    console.warn(`[azure-ai-foundry] Agent discovery failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Table reads
// ---------------------------------------------------------------------------

export async function listSyncedDeployments(organizationId: number): Promise<any[]> {
  return (await sequelize.query(
    `SELECT * FROM azure_ai_model_records
      WHERE organization_id = :organizationId
      ORDER BY created_at DESC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
}

export async function getSyncedDeploymentById(
  deploymentId: number,
  organizationId: number,
): Promise<any | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM azure_ai_model_records
      WHERE id = :deploymentId AND organization_id = :organizationId
      LIMIT 1;`,
    {
      replacements: { deploymentId, organizationId },
      type: QueryTypes.SELECT,
    },
  )) as any[];
  return rows[0] ?? null;
}
