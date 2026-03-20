import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";
import { getAllModelRisksQuery } from "../../utils/modelRisk.utils";
import { ModelRiskModel } from "../../domain.layer/models/modelRisk/modelRisk.model";
import logger from "../../utils/logger/fileLogger";

export interface FetchModelRisksParams {
  modelId?: number;
  risk_category?: "Performance" | "Bias & Fairness" | "Security" | "Data Quality" | "Compliance";
  risk_level?: "Low" | "Medium" | "High" | "Critical";
  status?: "Open" | "In Progress" | "Resolved" | "Accepted";
  owner?: string;
  limit?: number;
}

const fetchModelRisks = async (
  params: FetchModelRisksParams,
  organizationId: number,
): Promise<Partial<ModelRiskModel>[]> => {
  let risks: ModelRiskModel[] = [];

  try {
    // Fetch all active model risks
    risks = await getAllModelRisksQuery(organizationId, "active");

    // Apply filters
    if (params.modelId) {
      risks = risks.filter((r) => r.model_id === params.modelId);
    }
    if (params.risk_category) {
      risks = risks.filter((r) => r.risk_category === params.risk_category);
    }
    if (params.risk_level) {
      risks = risks.filter((r) => r.risk_level === params.risk_level);
    }
    if (params.status) {
      risks = risks.filter((r) => r.status === params.status);
    }
    if (params.owner) {
      risks = risks.filter(
        (r) =>
          r.owner &&
          r.owner.toLowerCase().includes(params.owner!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      risks = risks.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose text fields
    return risks.map((r) => ({
      id: r.id,
      risk_name: r.risk_name,
      risk_category: r.risk_category,
      risk_level: r.risk_level,
      status: r.status,
      owner: r.owner,
      target_date: r.target_date,
      model_id: r.model_id,
      created_at: r.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching model risks:", error);
    throw new Error(
      `Failed to fetch model risks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface ModelRiskAnalytics {
  categoryDistribution: {
    [category: string]: number;
  };
  levelDistribution: {
    [level: string]: number;
  };
  statusDistribution: {
    [status: string]: number;
  };
  ownerDistribution: Array<{
    owner: string;
    count: number;
    percentage: number;
  }>;
  risksByModel: Array<{
    modelId: number;
    count: number;
    criticalCount: number;
    highCount: number;
  }>;
  totalRisks: number;
}

const getModelRiskAnalytics = async (
  params: { modelId?: number },
  organizationId: number,
): Promise<ModelRiskAnalytics> => {
  try {
    // Fetch all model risks
    let risks = await getAllModelRisksQuery(organizationId, "active");

    // Filter by model if specified
    if (params.modelId) {
      risks = risks.filter((r) => r.model_id === params.modelId);
    }

    const totalRisks = risks.length;

    // 1. Category Distribution
    const categoryDistribution: { [category: string]: number } = {};
    Object.values(ModelRiskCategory).forEach((category) => {
      categoryDistribution[category] = 0;
    });

    risks.forEach((risk) => {
      if (risk.risk_category) {
        categoryDistribution[risk.risk_category] =
          (categoryDistribution[risk.risk_category] || 0) + 1;
      }
    });

    // 2. Level Distribution
    const levelDistribution: { [level: string]: number } = {};
    Object.values(ModelRiskLevel).forEach((level) => {
      levelDistribution[level] = 0;
    });

    risks.forEach((risk) => {
      if (risk.risk_level) {
        levelDistribution[risk.risk_level] =
          (levelDistribution[risk.risk_level] || 0) + 1;
      }
    });

    // 3. Status Distribution
    const statusDistribution: { [status: string]: number } = {};
    Object.values(ModelRiskStatus).forEach((status) => {
      statusDistribution[status] = 0;
    });

    risks.forEach((risk) => {
      if (risk.status) {
        statusDistribution[risk.status] =
          (statusDistribution[risk.status] || 0) + 1;
      }
    });

    // 4. Owner Distribution
    const ownerMap = new Map<string, number>();
    risks.forEach((risk) => {
      if (risk.owner) {
        ownerMap.set(risk.owner, (ownerMap.get(risk.owner) || 0) + 1);
      }
    });

    const ownerDistribution = Array.from(ownerMap.entries())
      .map(([owner, count]) => ({
        owner,
        count,
        percentage:
          totalRisks > 0 ? Math.round((count / totalRisks) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Risks by Model
    const modelMap = new Map<number, { count: number; criticalCount: number; highCount: number }>();
    risks.forEach((risk) => {
      if (risk.model_id) {
        const existing = modelMap.get(risk.model_id) || { count: 0, criticalCount: 0, highCount: 0 };
        existing.count++;
        if (risk.risk_level === ModelRiskLevel.CRITICAL) {
          existing.criticalCount++;
        } else if (risk.risk_level === ModelRiskLevel.HIGH) {
          existing.highCount++;
        }
        modelMap.set(risk.model_id, existing);
      }
    });

    const risksByModel = Array.from(modelMap.entries())
      .map(([modelId, data]) => ({
        modelId,
        count: data.count,
        criticalCount: data.criticalCount,
        highCount: data.highCount,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      categoryDistribution,
      levelDistribution,
      statusDistribution,
      ownerDistribution,
      risksByModel,
      totalRisks,
    };
  } catch (error) {
    logger.error("Error getting model risk analytics:", error);
    throw new Error(
      `Failed to get model risk analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface ModelRiskExecutiveSummary {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  openRisks: number;
  inProgressRisks: number;
  resolvedRisks: number;
  acceptedRisks: number;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  risksNeedingAttention: Array<{
    id: number;
    risk_name: string;
    risk_level: string;
    status: string;
    owner: string;
    target_date: string;
    daysUntilDue: number;
  }>;
  ownerWorkload: Array<{
    owner: string;
    totalRisks: number;
    openRisks: number;
  }>;
  resolutionProgress: {
    resolved: number;
    total: number;
    percentage: number;
  };
}

const getModelRiskExecutiveSummary = async (
  params: { modelId?: number },
  organizationId: number,
): Promise<ModelRiskExecutiveSummary> => {
  try {
    // Fetch all model risks
    let risks = await getAllModelRisksQuery(organizationId, "active");

    // Filter by model if specified
    if (params.modelId) {
      risks = risks.filter((r) => r.model_id === params.modelId);
    }

    const totalRisks = risks.length;

    // Count by level
    const criticalRisks = risks.filter(
      (r) => r.risk_level === ModelRiskLevel.CRITICAL,
    ).length;
    const highRisks = risks.filter(
      (r) => r.risk_level === ModelRiskLevel.HIGH,
    ).length;
    const mediumRisks = risks.filter(
      (r) => r.risk_level === ModelRiskLevel.MEDIUM,
    ).length;
    const lowRisks = risks.filter(
      (r) => r.risk_level === ModelRiskLevel.LOW,
    ).length;

    // Count by status
    const openRisks = risks.filter(
      (r) => r.status === ModelRiskStatus.OPEN,
    ).length;
    const inProgressRisks = risks.filter(
      (r) => r.status === ModelRiskStatus.IN_PROGRESS,
    ).length;
    const resolvedRisks = risks.filter(
      (r) => r.status === ModelRiskStatus.RESOLVED,
    ).length;
    const acceptedRisks = risks.filter(
      (r) => r.status === ModelRiskStatus.ACCEPTED,
    ).length;

    // Top categories
    const categoryMap = new Map<string, number>();
    risks.forEach((risk) => {
      if (risk.risk_category) {
        categoryMap.set(
          risk.risk_category,
          (categoryMap.get(risk.risk_category) || 0) + 1,
        );
      }
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Risks needing attention (Critical or High, not resolved)
    const now = new Date();
    const risksNeedingAttention = risks
      .filter(
        (r) =>
          (r.risk_level === ModelRiskLevel.CRITICAL ||
            r.risk_level === ModelRiskLevel.HIGH) &&
          r.status !== ModelRiskStatus.RESOLVED,
      )
      .map((r) => {
        const targetDate = r.target_date ? new Date(r.target_date) : null;
        const daysUntilDue = targetDate
          ? Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return {
          id: r.id || 0,
          risk_name: r.risk_name,
          risk_level: r.risk_level,
          status: r.status,
          owner: r.owner,
          target_date: r.target_date,
          daysUntilDue,
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 5);

    // Owner workload
    const ownerWorkloadMap = new Map<string, { total: number; open: number }>();
    risks.forEach((risk) => {
      if (risk.owner) {
        const existing = ownerWorkloadMap.get(risk.owner) || { total: 0, open: 0 };
        existing.total++;
        if (risk.status === ModelRiskStatus.OPEN || risk.status === ModelRiskStatus.IN_PROGRESS) {
          existing.open++;
        }
        ownerWorkloadMap.set(risk.owner, existing);
      }
    });

    const ownerWorkload = Array.from(ownerWorkloadMap.entries())
      .map(([owner, data]) => ({
        owner,
        totalRisks: data.total,
        openRisks: data.open,
      }))
      .sort((a, b) => b.openRisks - a.openRisks)
      .slice(0, 5);

    // Resolution progress
    const resolutionProgress = {
      resolved: resolvedRisks + acceptedRisks,
      total: totalRisks,
      percentage:
        totalRisks > 0
          ? Math.round(((resolvedRisks + acceptedRisks) / totalRisks) * 100)
          : 0,
    };

    return {
      totalRisks,
      criticalRisks,
      highRisks,
      mediumRisks,
      lowRisks,
      openRisks,
      inProgressRisks,
      resolvedRisks,
      acceptedRisks,
      topCategories,
      risksNeedingAttention,
      ownerWorkload,
      resolutionProgress,
    };
  } catch (error) {
    logger.error("Error getting model risk executive summary:", error);
    throw new Error(
      `Failed to get model risk executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableModelRiskTools: any = {
  fetch_model_risks: fetchModelRisks,
  get_model_risk_analytics: getModelRiskAnalytics,
  get_model_risk_executive_summary: getModelRiskExecutiveSummary,
};

export { availableModelRiskTools };
