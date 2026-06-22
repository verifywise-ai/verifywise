import { IModelInventory } from "../../domain.layer/interfaces/i.modelInventory";
import { ModelInventoryStatus } from "../../domain.layer/enums/model-inventory-status.enum";
import {
  getAllModelInventoriesQuery,
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
  getModelInventoryByIdQuery,
  deleteModelInventoryByIdQuery,
} from "../../utils/modelInventory.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

export interface FetchModelInventoriesParams {
  projectId?: number;
  frameworkId?: number;
  status?: "Approved" | "Restricted" | "Pending" | "Blocked";
  security_assessment?: boolean;
  provider?: string;
  hosting_provider?: string;
  model?: string;
  limit?: number;
}

const fetchModelInventories = async (
  params: FetchModelInventoriesParams,
  organizationId: number,
): Promise<Partial<IModelInventory>[]> => {
  let models: IModelInventory[] = [];

  try {
    // Fetch based on scope
    if (params.projectId) {
      const result = await getModelByProjectIdQuery(params.projectId, organizationId);
      models = result || [];
    } else if (params.frameworkId) {
      const result = await getModelByFrameworkIdQuery(params.frameworkId, organizationId);
      models = result || [];
    } else {
      models = await getAllModelInventoriesQuery(organizationId);
    }

    // Apply filters
    if (params.status) {
      models = models.filter((m) => m.status === params.status);
    }
    if (params.security_assessment !== undefined) {
      models = models.filter((m) => m.security_assessment === params.security_assessment);
    }
    if (params.provider) {
      models = models.filter(
        (m) => m.provider && m.provider.toLowerCase().includes(params.provider!.toLowerCase()),
      );
    }
    if (params.hosting_provider) {
      models = models.filter(
        (m) =>
          m.hosting_provider &&
          m.hosting_provider.toLowerCase().includes(params.hosting_provider!.toLowerCase()),
      );
    }
    if (params.model) {
      models = models.filter(
        (m) => m.model && m.model.toLowerCase().includes(params.model!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      models = models.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose text fields and file data
    return models.map((m) => ({
      id: m.id,
      provider_model: m.provider_model,
      provider: m.provider,
      model: m.model,
      version: m.version,
      capabilities: m.capabilities,
      security_assessment: m.security_assessment,
      status: m.status,
      status_date: m.status_date,
      hosting_provider: m.hosting_provider,
      created_at: m.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching model inventories:", error);
    throw new Error(
      `Failed to fetch model inventories: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface ModelInventoryAnalytics {
  statusDistribution: {
    [status: string]: number;
  };
  providerDistribution: Array<{
    provider: string;
    count: number;
    percentage: number;
  }>;
  securityAssessmentBreakdown: {
    assessed: number;
    notAssessed: number;
  };
  hostingProviderDistribution: Array<{
    hostingProvider: string;
    count: number;
    percentage: number;
  }>;
  capabilitiesDistribution: Array<{
    capability: string;
    count: number;
    percentage: number;
  }>;
  totalModels: number;
}

const getModelInventoryAnalytics = async (
  params: { projectId?: number },
  organizationId: number,
): Promise<ModelInventoryAnalytics> => {
  try {
    // Fetch models for analysis
    const models = params.projectId
      ? (await getModelByProjectIdQuery(params.projectId, organizationId)) || []
      : await getAllModelInventoriesQuery(organizationId);

    const totalModels = models.length;

    // 1. Status Distribution
    const statusDistribution: { [status: string]: number } = {};
    Object.values(ModelInventoryStatus).forEach((status) => {
      statusDistribution[status] = 0;
    });

    models.forEach((model) => {
      if (model.status) {
        statusDistribution[model.status] = (statusDistribution[model.status] || 0) + 1;
      }
    });

    // 2. Provider Distribution
    const providerMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.provider) {
        providerMap.set(model.provider, (providerMap.get(model.provider) || 0) + 1);
      }
    });

    const providerDistribution = Array.from(providerMap.entries())
      .map(([provider, count]) => ({
        provider,
        count,
        percentage: totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Security Assessment Breakdown
    const securityAssessmentBreakdown = {
      assessed: models.filter((m) => m.security_assessment === true).length,
      notAssessed: models.filter((m) => m.security_assessment === false).length,
    };

    // 4. Hosting Provider Distribution
    const hostingProviderMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.hosting_provider) {
        hostingProviderMap.set(
          model.hosting_provider,
          (hostingProviderMap.get(model.hosting_provider) || 0) + 1,
        );
      }
    });

    const hostingProviderDistribution = Array.from(hostingProviderMap.entries())
      .map(([hostingProvider, count]) => ({
        hostingProvider,
        count,
        percentage: totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Capabilities Distribution
    const capabilitiesMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.capabilities) {
        const caps = model.capabilities.split(", ").filter((cap) => cap.trim());
        caps.forEach((cap) => {
          const normalizedCap = cap.trim();
          capabilitiesMap.set(normalizedCap, (capabilitiesMap.get(normalizedCap) || 0) + 1);
        });
      }
    });

    const capabilitiesDistribution = Array.from(capabilitiesMap.entries())
      .map(([capability, count]) => ({
        capability,
        count,
        percentage: totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      statusDistribution,
      providerDistribution,
      securityAssessmentBreakdown,
      hostingProviderDistribution,
      capabilitiesDistribution,
      totalModels,
    };
  } catch (error) {
    logger.error("Error getting model inventory analytics:", error);
    throw new Error(
      `Failed to get model inventory analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface ModelInventoryExecutiveSummary {
  totalActiveModels: number;
  approvedModels: number;
  restrictedModels: number;
  blockedModels: number;
  pendingModels: number;
  topProviders: string[];
  securityAssessmentProgress: {
    assessed: number;
    notAssessed: number;
    percentage: number;
  };
  recentModels: Array<{
    id: number;
    provider: string;
    model: string;
    version: string;
    status: string;
    daysOld: number;
  }>;
  modelsByHostingProvider: Array<{
    hostingProvider: string;
    count: number;
  }>;
}

const getModelInventoryExecutiveSummary = async (
  params: { projectId?: number },
  organizationId: number,
): Promise<ModelInventoryExecutiveSummary> => {
  try {
    // Fetch models
    const models = params.projectId
      ? (await getModelByProjectIdQuery(params.projectId, organizationId)) || []
      : await getAllModelInventoriesQuery(organizationId);

    const totalActiveModels = models.length;

    // Count models by status
    const approvedModels = models.filter((m) => m.status === ModelInventoryStatus.APPROVED).length;

    const restrictedModels = models.filter(
      (m) => m.status === ModelInventoryStatus.RESTRICTED,
    ).length;

    const blockedModels = models.filter((m) => m.status === ModelInventoryStatus.BLOCKED).length;

    const pendingModels = models.filter((m) => m.status === ModelInventoryStatus.PENDING).length;

    // Top providers (top 3)
    const providerMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.provider) {
        providerMap.set(model.provider, (providerMap.get(model.provider) || 0) + 1);
      }
    });

    const topProviders = Array.from(providerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([provider]) => provider);

    // Security assessment progress
    const assessed = models.filter((m) => m.security_assessment === true).length;
    const notAssessed = models.filter((m) => m.security_assessment === false).length;
    const percentage = totalActiveModels > 0 ? Math.round((assessed / totalActiveModels) * 100) : 0;

    const securityAssessmentProgress = {
      assessed,
      notAssessed,
      percentage,
    };

    // Recent models (created within last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentModels = models
      .filter((m) => m.created_at && new Date(m.created_at) > sevenDaysAgo)
      .map((m) => {
        const createdAt = m.created_at ? new Date(m.created_at) : now;
        const daysOld = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: m.id || 0,
          provider: m.provider,
          model: m.model,
          version: m.version,
          status: m.status,
          daysOld,
        };
      })
      .sort((a, b) => a.daysOld - b.daysOld)
      .slice(0, 5); // Top 5 most recent

    // Models by hosting provider
    const hostingProviderMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.hosting_provider) {
        hostingProviderMap.set(
          model.hosting_provider,
          (hostingProviderMap.get(model.hosting_provider) || 0) + 1,
        );
      }
    });

    const modelsByHostingProvider = Array.from(hostingProviderMap.entries())
      .map(([hostingProvider, count]) => ({
        hostingProvider,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalActiveModels,
      approvedModels,
      restrictedModels,
      blockedModels,
      pendingModels,
      topProviders,
      securityAssessmentProgress,
      recentModels,
      modelsByHostingProvider,
    };
  } catch (error) {
    logger.error("Error getting model inventory executive summary:", error);
    throw new Error(
      `Failed to get model inventory executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools (Human Confirmation Flow) ---

const agentUpdateModel = createWriteToolFn({
  toolName: "agent_update_model",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter((k) => k !== "model_id");
    return `Update model #${params.model_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const setClauses: string[] = [];
    const replacements: Record<string, unknown> = {
      organization_id: organizationId,
      model_id: modelId,
    };

    if (params.name !== undefined) {
      setClauses.push("model = :model");
      replacements.model = params.name;
    }
    if (params.model_type !== undefined) {
      setClauses.push("provider = :provider");
      replacements.provider = params.model_type;
    }
    if (params.version !== undefined) {
      setClauses.push("version = :version");
      replacements.version = params.version;
    }
    if (params.description !== undefined) {
      setClauses.push("capabilities = :capabilities");
      replacements.capabilities = params.description;
    }
    if (params.status !== undefined) {
      setClauses.push("status = :status, status_date = NOW()");
      replacements.status = params.status;
    }
    if (params.hosting_provider !== undefined) {
      setClauses.push("hosting_provider = :hosting_provider");
      replacements.hosting_provider = params.hosting_provider;
    }
    if (params.capabilities !== undefined) {
      setClauses.push("capabilities = :capabilities");
      replacements.capabilities = params.capabilities;
    }

    if (setClauses.length === 0) {
      return { id: modelId, message: "No fields to update" };
    }

    setClauses.push("updated_at = NOW()");
    // Update provider_model if provider or model changed
    if (params.name !== undefined || params.model_type !== undefined) {
      setClauses.push(
        "provider_model = COALESCE(:pm_provider, provider) || ' / ' || COALESCE(:pm_model, model)",
      );
      replacements.pm_provider = params.model_type !== undefined ? params.model_type : null;
      replacements.pm_model = params.name !== undefined ? params.name : null;
    }

    await sequelize.query(
      `UPDATE model_inventories SET ${setClauses.join(", ")} WHERE id = :model_id AND organization_id = :organization_id`,
      { replacements },
    );
    return { id: modelId, updated: true, message: "Model updated successfully" };
  },
});

const agentUpdateModelLifecyclePhase = createWriteToolFn({
  toolName: "agent_update_model_lifecycle_phase",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update model #${params.model_id} lifecycle phase to "${params.lifecycle_phase}"`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const phase = params.lifecycle_phase as string;
    await sequelize.query(
      `UPDATE model_inventories SET status = :status, status_date = NOW(), updated_at = NOW() WHERE id = :model_id AND organization_id = :organization_id`,
      {
        replacements: { status: phase, model_id: modelId, organization_id: organizationId },
      },
    );
    return { id: modelId, status: phase, message: "Model lifecycle phase updated successfully" };
  },
});

const agentRetireModel = createWriteToolFn({
  toolName: "agent_retire_model",
  warningLevel: "warning",
  descriptionFn: (params) => `Retire model #${params.model_id} (set status to Blocked)`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    await sequelize.query(
      `UPDATE model_inventories SET status = 'Blocked', status_date = NOW(), updated_at = NOW() WHERE id = :model_id AND organization_id = :organization_id`,
      {
        replacements: { model_id: modelId, organization_id: organizationId },
      },
    );
    return { id: modelId, status: "Blocked", message: "Model retired successfully" };
  },
});

const agentDeleteModel = createWriteToolFn({
  toolName: "agent_delete_model",
  warningLevel: "danger",
  descriptionFn: (params) => `Permanently delete model #${params.model_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const transaction = await sequelize.transaction();
    try {
      await deleteModelInventoryByIdQuery(modelId, true, organizationId, transaction);
      await transaction.commit();
      return { id: modelId, deleted: true, message: "Model deleted successfully" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentLinkModelToProject = createWriteToolFn({
  toolName: "agent_link_model_to_project",
  warningLevel: "warning",
  descriptionFn: (params) => `Link model #${params.model_id} to project #${params.project_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const projectId = params.project_id as number;
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
       VALUES (:organization_id, :model_inventory_id, :project_id)
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          organization_id: organizationId,
          model_inventory_id: modelId,
          project_id: projectId,
        },
      },
    );
    return {
      model_id: modelId,
      project_id: projectId,
      message: "Model linked to project successfully",
    };
  },
});

// --- Cross-entity: Use cases (projects) ---

const listModelsForUseCase = async (
  params: { project_id: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    const [rows] = (await sequelize.query(
      `SELECT DISTINCT mi.id, mi.provider_model, mi.provider, mi.model, mi.version,
              mi.status, mi.security_assessment, mi.hosting_provider, mi.created_at
       FROM model_inventories mi
       INNER JOIN model_inventories_projects_frameworks link
         ON link.model_inventory_id = mi.id
       WHERE link.project_id = :project_id
         AND mi.organization_id = :organization_id
         AND link.organization_id = :organization_id
       ORDER BY mi.created_at DESC`,
      {
        replacements: { project_id: params.project_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing models for use case:", error);
    throw new Error(
      `Failed to list models for use case: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const listUseCasesForModel = async (
  params: { model_id: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    const [rows] = (await sequelize.query(
      `SELECT DISTINCT p.id AS project_id, p.project_title, p.goal, p.status
       FROM projects p
       INNER JOIN model_inventories_projects_frameworks link
         ON link.project_id = p.id
       WHERE link.model_inventory_id = :model_id
         AND p.organization_id = :organization_id
         AND link.organization_id = :organization_id
       ORDER BY p.project_title`,
      {
        replacements: { model_id: params.model_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing use cases for model:", error);
    throw new Error(
      `Failed to list use cases for model: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const agentUnlinkModelFromUseCase = createWriteToolFn({
  toolName: "agent_unlink_model_from_use_case",
  warningLevel: "warning",
  descriptionFn: (params) => `Unlink model #${params.model_id} from use case #${params.project_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const projectId = params.project_id as number;
    const [, rowCount] = (await sequelize.query(
      `DELETE FROM model_inventories_projects_frameworks
       WHERE model_inventory_id = :model_id
         AND project_id = :project_id
         AND organization_id = :organization_id`,
      {
        replacements: { model_id: modelId, project_id: projectId, organization_id: organizationId },
      },
    )) as [unknown, number];
    return {
      model_id: modelId,
      project_id: projectId,
      removed: rowCount || 0,
      message: `Unlinked model from use case (${rowCount || 0} link row(s) removed)`,
    };
  },
});

// --- Cross-entity: Frameworks ---

const listModelsForFramework = async (
  params: { framework_id: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    const [rows] = (await sequelize.query(
      `SELECT DISTINCT mi.id, mi.provider_model, mi.provider, mi.model, mi.version,
              mi.status, mi.security_assessment, mi.hosting_provider, mi.created_at
       FROM model_inventories mi
       INNER JOIN model_inventories_projects_frameworks link
         ON link.model_inventory_id = mi.id
       WHERE link.framework_id = :framework_id
         AND mi.organization_id = :organization_id
         AND link.organization_id = :organization_id
       ORDER BY mi.created_at DESC`,
      {
        replacements: { framework_id: params.framework_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing models for framework:", error);
    throw new Error(
      `Failed to list models for framework: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const listFrameworksForModel = async (
  params: { model_id: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    const [rows] = (await sequelize.query(
      `SELECT DISTINCT f.id AS framework_id, f.name AS framework_name, f.description
       FROM frameworks f
       INNER JOIN model_inventories_projects_frameworks link
         ON link.framework_id = f.id
       WHERE link.model_inventory_id = :model_id
         AND link.organization_id = :organization_id
       ORDER BY f.name`,
      {
        replacements: { model_id: params.model_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing frameworks for model:", error);
    throw new Error(
      `Failed to list frameworks for model: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const agentLinkModelToFramework = createWriteToolFn({
  toolName: "agent_link_model_to_framework",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Link model #${params.model_id} to framework #${params.framework_id} under use case #${params.project_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const projectId = params.project_id as number;
    const frameworkId = params.framework_id as number;
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id, framework_id)
       VALUES (:organization_id, :model_inventory_id, :project_id, :framework_id)
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          organization_id: organizationId,
          model_inventory_id: modelId,
          project_id: projectId,
          framework_id: frameworkId,
        },
      },
    );
    return {
      model_id: modelId,
      project_id: projectId,
      framework_id: frameworkId,
      message: "Model linked to framework successfully",
    };
  },
});

const agentUnlinkModelFromFramework = createWriteToolFn({
  toolName: "agent_unlink_model_from_framework",
  warningLevel: "warning",
  descriptionFn: (params) =>
    params.project_id !== undefined
      ? `Unlink model #${params.model_id} from framework #${params.framework_id} (use case #${params.project_id})`
      : `Unlink model #${params.model_id} from framework #${params.framework_id} (all use cases)`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const frameworkId = params.framework_id as number;
    const projectId = params.project_id as number | undefined;

    let sql = `DELETE FROM model_inventories_projects_frameworks
               WHERE model_inventory_id = :model_id
                 AND framework_id = :framework_id
                 AND organization_id = :organization_id`;
    const replacements: Record<string, unknown> = {
      model_id: modelId,
      framework_id: frameworkId,
      organization_id: organizationId,
    };
    if (projectId !== undefined) {
      sql += ` AND project_id = :project_id`;
      replacements.project_id = projectId;
    }

    const [, rowCount] = (await sequelize.query(sql, { replacements })) as [unknown, number];
    return {
      model_id: modelId,
      framework_id: frameworkId,
      project_id: projectId ?? null,
      removed: rowCount || 0,
      message: `Unlinked model from framework (${rowCount || 0} link row(s) removed)`,
    };
  },
});

// --- Cross-entity: Files / Evidence ---

const listFilesForModel = async (
  params: { model_id: number; limit?: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    // Files can be linked to a model via two parallel paths:
    //   1) `file_entity_links` polymorphic table (entity_type='model_inventory') — used by framework/evidence flows
    //   2) `files.model_id` direct column — used by the FileManagerUpload UI
    // Both are populated in practice; UNION returns the merged set.
    const limitClause = params.limit && params.limit > 0 ? `LIMIT ${Math.floor(params.limit)}` : "";
    const [rows] = (await sequelize.query(
      `SELECT id, filename, type, size, version, review_status,
              uploaded_time, uploaded_by, link_type, project_id, linked_at, source
       FROM (
         SELECT f.id, f.filename, f.type, f.size, f.version, f.review_status,
                f.uploaded_time, f.uploaded_by,
                fel.link_type, fel.project_id, fel.created_at AS linked_at,
                'evidence_link' AS source
         FROM file_entity_links fel
         INNER JOIN files f ON f.id = fel.file_id
         WHERE fel.entity_type = 'model_inventory'
           AND fel.entity_id = :model_id
           AND fel.organization_id = :organization_id

         UNION

         SELECT f.id, f.filename, f.type, f.size, f.version, f.review_status,
                f.uploaded_time, f.uploaded_by,
                NULL AS link_type, f.project_id, f.uploaded_time AS linked_at,
                'direct_model_id' AS source
         FROM files f
         WHERE f.model_id = :model_id
           AND f.organization_id = :organization_id
       ) merged
       ORDER BY linked_at DESC
       ${limitClause}`,
      {
        replacements: { model_id: params.model_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing files for model:", error);
    throw new Error(
      `Failed to list files for model: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const agentAttachFileToModel = createWriteToolFn({
  toolName: "agent_attach_file_to_model",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Attach file #${params.file_id} to model #${params.model_id} as evidence`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const fileId = params.file_id as number;
    const projectId = params.project_id as number | undefined;

    // Verify the file exists and belongs to this organization before linking
    const [fileRows] = (await sequelize.query(
      `SELECT id FROM files WHERE id = :file_id AND organization_id = :organization_id`,
      { replacements: { file_id: fileId, organization_id: organizationId } },
    )) as [Array<{ id: number }>, unknown];
    if (!fileRows || fileRows.length === 0) {
      throw new Error(
        `File #${fileId} not found or does not belong to this organization. Upload the file first.`,
      );
    }

    await sequelize.query(
      `INSERT INTO file_entity_links (organization_id, file_id, framework_type, entity_type, entity_id, project_id, link_type)
       VALUES (:organization_id, :file_id, 'model_inventory', 'model_inventory', :model_id, :project_id, 'evidence')
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          organization_id: organizationId,
          file_id: fileId,
          model_id: modelId,
          project_id: projectId ?? null,
        },
      },
    );
    return {
      model_id: modelId,
      file_id: fileId,
      project_id: projectId ?? null,
      message: "File attached to model as evidence",
    };
  },
});

const agentDetachFileFromModel = createWriteToolFn({
  toolName: "agent_detach_file_from_model",
  warningLevel: "warning",
  descriptionFn: (params) => `Detach file #${params.file_id} from model #${params.model_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const fileId = params.file_id as number;
    const [, rowCount] = (await sequelize.query(
      `DELETE FROM file_entity_links
       WHERE entity_type = 'model_inventory'
         AND entity_id = :model_id
         AND file_id = :file_id
         AND organization_id = :organization_id`,
      {
        replacements: { model_id: modelId, file_id: fileId, organization_id: organizationId },
      },
    )) as [unknown, number];
    return {
      model_id: modelId,
      file_id: fileId,
      removed: rowCount || 0,
      message: `File detached from model (${rowCount || 0} link row(s) removed). Underlying file preserved.`,
    };
  },
});

// --- Cross-entity: Datasets (symmetry from the model side) ---

const listDatasetsForModel = async (
  params: { model_id: number; limit?: number },
  organizationId: number,
): Promise<Array<Record<string, unknown>>> => {
  try {
    const limitClause = params.limit && params.limit > 0 ? `LIMIT ${Math.floor(params.limit)}` : "";
    const [rows] = (await sequelize.query(
      `SELECT d.id, d.name, d.version, d.owner, d.type, d.source, d.classification,
              d.contains_pii, d.status, d.created_at,
              dml.relationship_type, dml.created_at AS linked_at
       FROM dataset_model_inventories dml
       INNER JOIN datasets d ON d.id = dml.dataset_id
       WHERE dml.model_inventory_id = :model_id
         AND dml.organization_id = :organization_id
         AND d.organization_id = :organization_id
       ORDER BY dml.created_at DESC
       ${limitClause}`,
      {
        replacements: { model_id: params.model_id, organization_id: organizationId },
      },
    )) as [Array<Record<string, unknown>>, unknown];
    return rows;
  } catch (error) {
    logger.error("Error listing datasets for model:", error);
    throw new Error(
      `Failed to list datasets for model: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const agentLinkModelToDataset = createWriteToolFn({
  toolName: "agent_link_model_to_dataset",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const rel = (params.relationship_type as string) || "trained_on";
    return `Link model #${params.model_id} to dataset #${params.dataset_id} (${rel})`;
  },
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const datasetId = params.dataset_id as number;
    const relationshipType = (params.relationship_type as string) || "trained_on";

    const [datasetRows] = (await sequelize.query(
      `SELECT id FROM datasets WHERE id = :dataset_id AND organization_id = :organization_id`,
      { replacements: { dataset_id: datasetId, organization_id: organizationId } },
    )) as [Array<{ id: number }>, unknown];
    if (!datasetRows || datasetRows.length === 0) {
      throw new Error(`Dataset #${datasetId} not found or does not belong to this organization`);
    }

    const [modelRows] = (await sequelize.query(
      `SELECT id FROM model_inventories WHERE id = :model_id AND organization_id = :organization_id`,
      { replacements: { model_id: modelId, organization_id: organizationId } },
    )) as [Array<{ id: number }>, unknown];
    if (!modelRows || modelRows.length === 0) {
      throw new Error(`Model #${modelId} not found or does not belong to this organization`);
    }

    const [existing] = (await sequelize.query(
      `SELECT id FROM dataset_model_inventories
        WHERE organization_id = :organization_id
          AND dataset_id = :dataset_id
          AND model_inventory_id = :model_id`,
      {
        replacements: {
          organization_id: organizationId,
          dataset_id: datasetId,
          model_id: modelId,
        },
      },
    )) as [Array<{ id: number }>, unknown];
    if (existing && existing.length > 0) {
      return {
        success: false,
        model_id: modelId,
        dataset_id: datasetId,
        message: "Model is already linked to this dataset",
      };
    }

    await sequelize.query(
      `INSERT INTO dataset_model_inventories (organization_id, dataset_id, model_inventory_id, relationship_type, created_at)
       VALUES (:organization_id, :dataset_id, :model_inventory_id, :relationship_type, NOW())`,
      {
        replacements: {
          organization_id: organizationId,
          dataset_id: datasetId,
          model_inventory_id: modelId,
          relationship_type: relationshipType,
        },
      },
    );
    return {
      success: true,
      model_id: modelId,
      dataset_id: datasetId,
      relationship_type: relationshipType,
      message: `Model #${modelId} linked to dataset #${datasetId} (${relationshipType})`,
    };
  },
});

const agentUnlinkModelFromDataset = createWriteToolFn({
  toolName: "agent_unlink_model_from_dataset",
  warningLevel: "warning",
  descriptionFn: (params) => `Unlink model #${params.model_id} from dataset #${params.dataset_id}`,
  executeFn: async (params, organizationId) => {
    const modelId = params.model_id as number;
    const datasetId = params.dataset_id as number;
    const [, rowCount] = (await sequelize.query(
      `DELETE FROM dataset_model_inventories
       WHERE organization_id = :organization_id
         AND model_inventory_id = :model_id
         AND dataset_id = :dataset_id`,
      {
        replacements: {
          organization_id: organizationId,
          model_id: modelId,
          dataset_id: datasetId,
        },
      },
    )) as [unknown, number];
    return {
      model_id: modelId,
      dataset_id: datasetId,
      removed: rowCount || 0,
      message: `Unlinked model from dataset (${rowCount || 0} link row(s) removed)`,
    };
  },
});

const SUGGEST_RISKS_GUIDANCE = `Use the model metadata above to file 3-5 SEPARATE agent_suggest_model_risk approval requests, one per risk. (Use agent_suggest_model_risk — NOT agent_create_model_risk — for the suggested-risks flow; the suggest tool produces inline chat-card approvals while agent_create_model_risk routes to the dedicated Pending Approvals page and is only for user-explicit risk creation.) Each MUST include the model_id from the metadata and a description that names the specific provider/country/capability — not generic, model-agnostic risks.

Reason across these dimensions, picking the 3-5 that are most material for THIS model:

1. Provider country / jurisdiction (infer from provider name) — data sovereignty, cross-border transfer (GDPR Ch. V adequacy), state-access exposure, geopolitical/sanctions/export-control risk. Examples: China-headquartered providers (DeepSeek, Qwen, Baidu) carry export-control + state-access + censorship-shaped-output exposure; US providers (OpenAI, Anthropic, Google) carry CLOUD-Act exposure for non-US data; EU providers (Mistral) carry the lowest cross-border friction for EU customers.

2. Provider company posture — vendor lock-in, training-data opacity, terms-of-service privacy stance (does the vendor train on customer prompts), model-deprecation cadence, IP-leakage risk on prompts.

3. Hosting model — SaaS API (network egress, vendor downtime, data-in-transit exposure), self-hosted open-weight (maintenance burden, supply-chain risk on weights, version-pinning), on-prem (compliance ownership, hardening burden).

4. Capabilities & modality — text/code/multimodal/agentic. Drives jailbreak/misuse risk, hallucination, harmful-content generation, and (for agentic) automated-action blast radius.

5. Compliance frameworks the org is subject to (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF) — surface obligations triggered by this model class (e.g. EU AI Act Art. 50 transparency for generative models, GPAI obligations for foundation models above thresholds).

For each risk:
- risk_name: short and specific (e.g. "Export-control exposure on DeepSeek-V3 (China-hosted weights)" — NOT "Compliance risk")
- description: 1-2 sentences naming the SPECIFIC provider / country / capability that produces the risk
- risk_category: one of Performance, Bias & Fairness, Security, Data Quality, Compliance — pick the closest fit
- severity: your judgment based on impact + likelihood

After filing all the approvals, send ONE summary message to the user: "I've filed N risk-approval requests for [model name]:" followed by a one-line bullet per risk with the reasoning. End with: "Approve any that apply in Pending Approvals."

If the user says skip / don't suggest, abandon the flow and acknowledge.`;

const suggestRisksForModel = async (
  params: { model_id: number },
  organizationId: number,
): Promise<Record<string, unknown>> => {
  if (!params?.model_id || typeof params.model_id !== "number") {
    throw new Error(
      "suggest_risks_for_model requires a numeric model_id. Resolve via fetch_model_inventories first.",
    );
  }

  const model = await getModelInventoryByIdQuery(params.model_id, organizationId);
  if (!model) {
    throw new Error(
      `Model #${params.model_id} not found in this organization. Tell the user the model id is wrong or the model has been deleted.`,
    );
  }

  const dv = (model as any).dataValues ?? model;
  return {
    model: {
      id: dv.id,
      provider: dv.provider,
      model: dv.model,
      version: dv.version,
      capabilities: dv.capabilities,
      hosting_provider: dv.hosting_provider,
      status: dv.status,
      reference_link: dv.reference_link,
      biases: dv.biases,
      limitations: dv.limitations,
      security_assessment: dv.security_assessment,
      projects: dv.projects ?? [],
      frameworks: dv.frameworks ?? [],
      created_at: dv.created_at,
    },
    guidance: SUGGEST_RISKS_GUIDANCE,
  };
};

const availableModelInventoryTools: any = {
  fetch_model_inventories: fetchModelInventories,
  get_model_inventory_analytics: getModelInventoryAnalytics,
  get_model_inventory_executive_summary: getModelInventoryExecutiveSummary,
  agent_update_model: agentUpdateModel,
  agent_update_model_lifecycle_phase: agentUpdateModelLifecyclePhase,
  agent_retire_model: agentRetireModel,
  agent_delete_model: agentDeleteModel,
  agent_link_model_to_project: agentLinkModelToProject,
  list_models_for_use_case: listModelsForUseCase,
  list_use_cases_for_model: listUseCasesForModel,
  agent_unlink_model_from_use_case: agentUnlinkModelFromUseCase,
  list_models_for_framework: listModelsForFramework,
  list_frameworks_for_model: listFrameworksForModel,
  agent_link_model_to_framework: agentLinkModelToFramework,
  agent_unlink_model_from_framework: agentUnlinkModelFromFramework,
  list_files_for_model: listFilesForModel,
  agent_attach_file_to_model: agentAttachFileToModel,
  agent_detach_file_from_model: agentDetachFileFromModel,
  list_datasets_for_model: listDatasetsForModel,
  agent_link_model_to_dataset: agentLinkModelToDataset,
  agent_unlink_model_from_dataset: agentUnlinkModelFromDataset,
  suggest_risks_for_model: suggestRisksForModel,
};

export { availableModelInventoryTools };
