import { IRisk } from "../../domain.layer/interfaces/I.risk";
import {
  getAllRisksQuery,
  getRisksByProjectQuery,
  getRisksByFrameworkQuery,
} from "../../utils/risk.utils";
import { getTimeseriesForTimeframe } from "../../utils/history/riskHistory.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchRisksParams {
  projectId?: number;
  frameworkId?: number;
  severity?: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  likelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  category?: string;
  mitigationStatus?:
    | "Not Started"
    | "In Progress"
    | "Completed"
    | "On Hold"
    | "Deferred"
    | "Canceled"
    | "Requires review";
  riskLevel?:
    | "No risk"
    | "Very low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";
  aiLifecyclePhase?: string;
  limit?: number;
}

const fetchRisks = async (
  params: FetchRisksParams,
  organizationId: number,
): Promise<Partial<IRisk>[]> => {
  let risks: IRisk[] = [];

  try {
    // Fetch based on scope
    if (params.projectId) {
      const result = await getRisksByProjectQuery(
        params.projectId,
        organizationId,
        "active",
      );
      risks = result || [];
    } else if (params.frameworkId) {
      const result = await getRisksByFrameworkQuery(
        params.frameworkId,
        organizationId,
        "active",
      );
      risks = result || [];
    } else {
      risks = await getAllRisksQuery(organizationId, "active");
    }

    // Apply filters
    if (params.severity) {
      risks = risks.filter((r) => r.severity === params.severity);
    }
    if (params.likelihood) {
      risks = risks.filter((r) => r.likelihood === params.likelihood);
    }
    if (params.category) {
      risks = risks.filter(
        (r) =>
          r.risk_category &&
          Array.isArray(r.risk_category) &&
          r.risk_category.some((cat) =>
            cat.toLowerCase().includes(params.category!.toLowerCase()),
          ),
      );
    }
    if (params.mitigationStatus) {
      risks = risks.filter(
        (r) => r.mitigation_status === params.mitigationStatus,
      );
    }
    if (params.riskLevel) {
      risks = risks.filter(
        (r) => r.risk_level_autocalculated === params.riskLevel,
      );
    }
    if (params.aiLifecyclePhase) {
      risks = risks.filter(
        (r) => r.ai_lifecycle_phase === params.aiLifecyclePhase,
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      risks = risks.slice(0, params.limit);
    }

    // Return lightweight projections to reduce LLM context size
    return risks.map((r) => ({
      id: r.id,
      risk_name: r.risk_name,
      risk_level: r.risk_level_autocalculated,
      severity: r.severity,
      likelihood: r.likelihood,
      risk_category: r.risk_category,
      mitigation_status: r.mitigation_status,
      ai_lifecycle_phase: r.ai_lifecycle_phase,
      deadline: r.deadline,
      risk_owner: r.risk_owner,
      current_risk_level: r.current_risk_level,
    }));
  } catch (error) {
    logger.error("Error fetching risks:", error);
    throw new Error(
      `Failed to fetch risks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface RiskAnalytics {
  riskMatrix: {
    [severity: string]: {
      [likelihood: string]: number;
    };
  };
  categoryDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  mitigationStatusBreakdown: {
    [status: string]: number;
  };
  lifecyclePhaseDistribution: {
    [phase: string]: number;
  };
  riskLevelSummary: {
    [level: string]: number;
  };
  totalRisks: number;
}

const getRiskAnalytics = async (
  params: { projectId?: number },
  organizationId: number,
): Promise<RiskAnalytics> => {
  try {
    // Fetch risks for analysis
    const risks = params.projectId
      ? (await getRisksByProjectQuery(params.projectId, organizationId, "active")) || []
      : await getAllRisksQuery(organizationId, "active");

    const totalRisks = risks.length;

    // 1. Risk Matrix (Severity × Likelihood)
    const riskMatrix: RiskAnalytics["riskMatrix"] = {};
    const severities = [
      "Negligible",
      "Minor",
      "Moderate",
      "Major",
      "Catastrophic",
    ];
    const likelihoods = [
      "Rare",
      "Unlikely",
      "Possible",
      "Likely",
      "Almost Certain",
    ];

    severities.forEach((sev) => {
      riskMatrix[sev] = {};
      likelihoods.forEach((like) => {
        riskMatrix[sev][like] = 0;
      });
    });

    risks.forEach((risk) => {
      if (risk.severity && risk.likelihood) {
        riskMatrix[risk.severity][risk.likelihood]++;
      }
    });

    // 2. Category Distribution
    const categoryMap = new Map<string, number>();
    risks.forEach((risk) => {
      if (risk.risk_category && Array.isArray(risk.risk_category)) {
        risk.risk_category.forEach((cat) => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      }
    });

    const categoryDistribution = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalRisks > 0 ? Math.round((count / totalRisks) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Mitigation Status Breakdown
    const mitigationStatusBreakdown: { [status: string]: number } = {};
    risks.forEach((risk) => {
      const status = risk.mitigation_status || "Not Started";
      mitigationStatusBreakdown[status] =
        (mitigationStatusBreakdown[status] || 0) + 1;
    });

    // 4. Lifecycle Phase Distribution
    const lifecyclePhaseDistribution: { [phase: string]: number } = {};
    risks.forEach((risk) => {
      if (risk.ai_lifecycle_phase) {
        lifecyclePhaseDistribution[risk.ai_lifecycle_phase] =
          (lifecyclePhaseDistribution[risk.ai_lifecycle_phase] || 0) + 1;
      }
    });

    // 5. Risk Level Summary
    const riskLevelSummary: { [level: string]: number } = {};
    risks.forEach((risk) => {
      if (risk.risk_level_autocalculated) {
        riskLevelSummary[risk.risk_level_autocalculated] =
          (riskLevelSummary[risk.risk_level_autocalculated] || 0) + 1;
      }
    });

    return {
      riskMatrix,
      categoryDistribution,
      mitigationStatusBreakdown,
      lifecyclePhaseDistribution,
      riskLevelSummary,
      totalRisks,
    };
  } catch (error) {
    logger.error("Error getting risk analytics:", error);
    throw new Error(
      `Failed to get risk analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface ExecutiveSummary {
  totalActiveRisks: number;
  criticalRisks: number;
  highRisks: number;
  topCategories: string[];
  overdueMitigations: number;
  mitigationProgress: {
    notStarted: number;
    inProgress: number;
    completed: number;
  };
  urgentRisks: Array<{
    id: number;
    name: string;
    severity: string;
    likelihood: string;
    deadline: Date | null;
    daysUntilDeadline: number | null;
  }>;
}

const getExecutiveSummary = async (
  params: { projectId?: number },
  organizationId: number,
): Promise<ExecutiveSummary> => {
  try {
    // Fetch risks
    const risks = params.projectId
      ? (await getRisksByProjectQuery(params.projectId, organizationId, "active")) || []
      : await getAllRisksQuery(organizationId, "active");

    const totalActiveRisks = risks.length;

    // Count critical and high risks
    const criticalRisks = risks.filter(
      (r) =>
        r.severity === "Catastrophic" ||
        r.risk_level_autocalculated === "Very high risk",
    ).length;

    const highRisks = risks.filter(
      (r) =>
        r.severity === "Major" || r.risk_level_autocalculated === "High risk",
    ).length;

    // Top categories (top 3)
    const categoryMap = new Map<string, number>();
    risks.forEach((risk) => {
      if (risk.risk_category && Array.isArray(risk.risk_category)) {
        risk.risk_category.forEach((cat) => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      }
    });

    const topCategories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    // Overdue mitigations
    const now = new Date();
    const overdueMitigations = risks.filter(
      (r) =>
        r.deadline &&
        new Date(r.deadline) < now &&
        r.mitigation_status !== "Completed",
    ).length;

    // Mitigation progress
    const mitigationProgress = {
      notStarted: risks.filter((r) => r.mitigation_status === "Not Started")
        .length,
      inProgress: risks.filter((r) => r.mitigation_status === "In Progress")
        .length,
      completed: risks.filter((r) => r.mitigation_status === "Completed")
        .length,
    };

    // Urgent risks (high/critical severity with upcoming deadlines or overdue)
    const urgentRisks = risks
      .filter(
        (r) =>
          (r.severity === "Major" || r.severity === "Catastrophic") &&
          r.mitigation_status !== "Completed",
      )
      .map((r) => {
        const deadline = r.deadline ? new Date(r.deadline) : null;
        const daysUntilDeadline = deadline
          ? Math.ceil(
              (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            )
          : null;

        return {
          id: r.id || 0,
          name: r.risk_name,
          severity: r.severity,
          likelihood: r.likelihood,
          deadline,
          daysUntilDeadline,
        };
      })
      .sort((a, b) => {
        // Sort by deadline (overdue first, then closest deadline)
        if (a.daysUntilDeadline === null) return 1;
        if (b.daysUntilDeadline === null) return -1;
        return a.daysUntilDeadline - b.daysUntilDeadline;
      })
      .slice(0, 5); // Top 5 most urgent

    return {
      totalActiveRisks,
      criticalRisks,
      highRisks,
      topCategories,
      overdueMitigations,
      mitigationProgress,
      urgentRisks,
    };
  } catch (error) {
    logger.error("Error getting executive summary:", error);
    throw new Error(
      `Failed to get executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface RiskHistoryTimeseriesParams {
  parameter: "severity" | "likelihood" | "mitigation_status" | "risk_level";
  timeframe: "7days" | "15days" | "1month" | "3months" | "6months" | "1year";
}

export interface TimeseriesDataPoint {
  timestamp: Date;
  data: Record<string, number>;
}

const getRiskHistoryTimeseries = async (
  params: RiskHistoryTimeseriesParams,
  organizationId: number,
): Promise<TimeseriesDataPoint[]> => {
  try {
    const { parameter, timeframe } = params;

    // Fetch timeseries data using the utility function
    const timeseriesData = await getTimeseriesForTimeframe(
      parameter,
      timeframe,
      organizationId,
    );

    return timeseriesData;
  } catch (error) {
    logger.error("Error getting risk history timeseries:", error);
    throw new Error(
      `Failed to get risk history timeseries: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableRiskTools: any = {
  fetch_risks: fetchRisks,
  get_risk_analytics: getRiskAnalytics,
  get_executive_summary: getExecutiveSummary,
  get_risk_history_timeseries: getRiskHistoryTimeseries,
};

export { availableRiskTools };
