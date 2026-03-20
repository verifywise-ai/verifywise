import { IModelInventory } from "../../domain.layer/interfaces/i.modelInventory";
import { ModelInventoryStatus } from "../../domain.layer/enums/model-inventory-status.enum";
import {
  getAllModelInventoriesQuery,
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
} from "../../utils/modelInventory.utils";
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
      const result = await getModelByFrameworkIdQuery(
        params.frameworkId,
        organizationId,
      );
      models = result || [];
    } else {
      models = await getAllModelInventoriesQuery(organizationId);
    }

    // Apply filters
    if (params.status) {
      models = models.filter((m) => m.status === params.status);
    }
    if (params.security_assessment !== undefined) {
      models = models.filter(
        (m) => m.security_assessment === params.security_assessment,
      );
    }
    if (params.provider) {
      models = models.filter(
        (m) =>
          m.provider &&
          m.provider.toLowerCase().includes(params.provider!.toLowerCase()),
      );
    }
    if (params.hosting_provider) {
      models = models.filter(
        (m) =>
          m.hosting_provider &&
          m.hosting_provider
            .toLowerCase()
            .includes(params.hosting_provider!.toLowerCase()),
      );
    }
    if (params.model) {
      models = models.filter(
        (m) =>
          m.model &&
          m.model.toLowerCase().includes(params.model!.toLowerCase()),
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
        statusDistribution[model.status] =
          (statusDistribution[model.status] || 0) + 1;
      }
    });

    // 2. Provider Distribution
    const providerMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.provider) {
        providerMap.set(
          model.provider,
          (providerMap.get(model.provider) || 0) + 1,
        );
      }
    });

    const providerDistribution = Array.from(providerMap.entries())
      .map(([provider, count]) => ({
        provider,
        count,
        percentage:
          totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
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
        percentage:
          totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Capabilities Distribution
    const capabilitiesMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.capabilities) {
        const caps = model.capabilities.split(", ").filter((cap) => cap.trim());
        caps.forEach((cap) => {
          const normalizedCap = cap.trim();
          capabilitiesMap.set(
            normalizedCap,
            (capabilitiesMap.get(normalizedCap) || 0) + 1,
          );
        });
      }
    });

    const capabilitiesDistribution = Array.from(capabilitiesMap.entries())
      .map(([capability, count]) => ({
        capability,
        count,
        percentage:
          totalModels > 0 ? Math.round((count / totalModels) * 100) : 0,
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
    const approvedModels = models.filter(
      (m) => m.status === ModelInventoryStatus.APPROVED,
    ).length;

    const restrictedModels = models.filter(
      (m) => m.status === ModelInventoryStatus.RESTRICTED,
    ).length;

    const blockedModels = models.filter(
      (m) => m.status === ModelInventoryStatus.BLOCKED,
    ).length;

    const pendingModels = models.filter(
      (m) => m.status === ModelInventoryStatus.PENDING,
    ).length;

    // Top providers (top 3)
    const providerMap = new Map<string, number>();
    models.forEach((model) => {
      if (model.provider) {
        providerMap.set(
          model.provider,
          (providerMap.get(model.provider) || 0) + 1,
        );
      }
    });

    const topProviders = Array.from(providerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([provider]) => provider);

    // Security assessment progress
    const assessed = models.filter(
      (m) => m.security_assessment === true,
    ).length;
    const notAssessed = models.filter(
      (m) => m.security_assessment === false,
    ).length;
    const percentage =
      totalActiveModels > 0
        ? Math.round((assessed / totalActiveModels) * 100)
        : 0;

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
        const daysOld = Math.floor(
          (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );

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

const availableModelInventoryTools: any = {
  fetch_model_inventories: fetchModelInventories,
  get_model_inventory_analytics: getModelInventoryAnalytics,
  get_model_inventory_executive_summary: getModelInventoryExecutiveSummary,
};

export { availableModelInventoryTools };
