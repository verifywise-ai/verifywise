import { RISK_APPROVAL_NOT_REQUIRED } from "../../domain.layer/enums/risk-approval-status.enum";
import { IRisk } from "../../domain.layer/interfaces/I.risk";
import {
  getAllRisksQuery,
  getRisksByProjectQuery,
  getRisksByFrameworkQuery,
  createRiskQuery,
  updateRiskByIdQuery,
  archiveRiskQuery,
  assertRiskReferencesInOrganization,
  linkRiskToProjectQuery,
} from "../../utils/risk.utils";
import { getTimeseriesForTimeframe } from "../../utils/history/riskHistory.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getEffectiveRiskLevel } from "../../utils/riskLevel.utils";
import {
  riskViewerForUserQuery,
  riskVisibilitySql,
  RiskViewer,
  SYSTEM_RISK_VIEWER,
  UNKNOWN_RISK_VIEWER,
} from "../../utils/riskVisibility.utils";
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";
import { QueryTypes } from "sequelize";

const effectiveLevel = getEffectiveRiskLevel;

const VALID_RISK_CATEGORIES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
];

function validateRiskCategory(category: string): string {
  // Exact match
  if (VALID_RISK_CATEGORIES.includes(category)) return category;
  // Case-insensitive match
  const lower = category.toLowerCase();
  const found = VALID_RISK_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (found) return found;
  // Partial match
  const partial = VALID_RISK_CATEGORIES.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()),
  );
  if (partial) return partial;
  // Default fallback
  return "Operational risk";
}

// NOTE: agent_create_risk / agent_update_risk / agent_delete_risk also exist
// in `advisor/aiActions/createRisk/` registry (upstream refactor). The
// in-file versions below are kept for backward-compat with the legacy
// confirmation flow. The registry-based versions take precedence when both
// are wired up.

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
    "No risk" | "Very low risk" | "Low risk" | "Medium risk" | "High risk" | "Very high risk";
  aiLifecyclePhase?: string;
  limit?: number;
}

const fetchRisks = async (
  params: FetchRisksParams & Record<string, unknown>,
  organizationId: number,
): Promise<Partial<IRisk>[]> => {
  let risks: IRisk[] = [];

  try {
    // Only the risks the chatting user can see (risk visibility rule).
    const viewer = await actingRiskViewer(params, organizationId);
    if (params.projectId) {
      const result = await getRisksByProjectQuery(
        params.projectId,
        organizationId,
        "active",
        viewer,
      );
      risks = result || [];
    } else if (params.frameworkId) {
      const result = await getRisksByFrameworkQuery(
        params.frameworkId,
        organizationId,
        "active",
        viewer,
      );
      risks = result || [];
    } else {
      risks = await getAllRisksQuery(organizationId, "active", viewer);
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
          r.risk_category.some((cat) => cat.toLowerCase().includes(params.category!.toLowerCase())),
      );
    }
    if (params.mitigationStatus) {
      risks = risks.filter((r) => r.mitigation_status === params.mitigationStatus);
    }
    if (params.riskLevel) {
      risks = risks.filter((r) => effectiveLevel(r) === params.riskLevel);
    }
    if (params.aiLifecyclePhase) {
      risks = risks.filter((r) => r.ai_lifecycle_phase === params.aiLifecyclePhase);
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      risks = risks.slice(0, params.limit);
    }

    // Return lightweight projections to reduce LLM context size
    return risks.map((r) => ({
      id: r.id,
      risk_name: r.risk_name,
      risk_level: effectiveLevel(r),
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
  params: { projectId?: number; _userId?: number },
  organizationId: number,
): Promise<RiskAnalytics> => {
  try {
    // Fetch risks for analysis. The organization-wide figures are counts only,
    // so like the dashboard counts they stay organization-wide (ruling J4).
    // The figures for one use case follow the by use case rule (ruling J7):
    // they run as the acting user, so a use case they cannot see counts only
    // the risks they own or approve there (no user: fails closed).
    const risks = params.projectId
      ? (await getRisksByProjectQuery(
          params.projectId,
          organizationId,
          "active",
          await actingRiskViewer(params, organizationId),
        )) || []
      : await getAllRisksQuery(organizationId, "active", SYSTEM_RISK_VIEWER);

    const totalRisks = risks.length;

    // 1. Risk Matrix (Severity × Likelihood)
    const riskMatrix: RiskAnalytics["riskMatrix"] = {};
    const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
    const likelihoods = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];

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
      mitigationStatusBreakdown[status] = (mitigationStatusBreakdown[status] || 0) + 1;
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
      const level = effectiveLevel(risk);
      if (level) {
        riskLevelSummary[level] = (riskLevelSummary[level] || 0) + 1;
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
  params: { projectId?: number } & Record<string, unknown>,
  organizationId: number,
): Promise<ExecutiveSummary> => {
  try {
    // The summary names its most urgent risks, so it covers only the risks
    // the chatting user can see (risk visibility rule), counts included.
    const viewer = await actingRiskViewer(params, organizationId);
    const risks = params.projectId
      ? (await getRisksByProjectQuery(params.projectId, organizationId, "active", viewer)) || []
      : await getAllRisksQuery(organizationId, "active", viewer);

    const totalActiveRisks = risks.length;

    // Count critical and high risks
    const criticalRisks = risks.filter((r) => effectiveLevel(r) === "Very high risk").length;

    const highRisks = risks.filter((r) => effectiveLevel(r) === "High risk").length;

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
      (r) => r.deadline && new Date(r.deadline) < now && r.mitigation_status !== "Completed",
    ).length;

    // Mitigation progress
    const mitigationProgress = {
      notStarted: risks.filter((r) => r.mitigation_status === "Not Started").length,
      inProgress: risks.filter((r) => r.mitigation_status === "In Progress").length,
      completed: risks.filter((r) => r.mitigation_status === "Completed").length,
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
          ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
    const timeseriesData = await getTimeseriesForTimeframe(parameter, timeframe, organizationId);

    return timeseriesData;
  } catch (error) {
    logger.error("Error getting risk history timeseries:", error);
    throw new Error(
      `Failed to get risk history timeseries: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * The user a tool runs for, as the risk visibility rule sees them: the user
 * who asked for the action (`_requesterId`, set by the approval gateway from
 * the approval record), else the user the gateway runs it for (`_userId`: the
 * chatting user for a read or an auto-approved write, the approver otherwise;
 * toolBridge injects it for every tool). With no user at all it fails closed
 * (UNKNOWN_RISK_VIEWER), never the system viewer.
 */
export const actingRiskViewer = async (
  params: Record<string, unknown>,
  organizationId: number,
): Promise<RiskViewer> => {
  const userId = Number(params._requesterId) || Number(params._userId);
  if (!userId || userId < 0) return UNKNOWN_RISK_VIEWER;
  return riskViewerForUserQuery(userId, organizationId);
};

// --- Write Tools (Human Confirmation Flow) ---

const agentCreateRisk = createWriteToolFn({
  toolName: "agent_create_risk",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create risk "${params.risk_name}" in project #${params.project_id}${params.severity ? ` with severity ${params.severity}` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const viewer = await actingRiskViewer(params, organizationId);
      const riskData: any = {
        risk_name: params.risk_name,
        risk_description: params.risk_description || "",
        severity: params.severity || "Moderate",
        likelihood: params.likelihood || "Possible",
        impact: params.impact || "",
        risk_category: params.category ? [validateRiskCategory(params.category as string)] : [],
        risk_owner:
          params.risk_owner && Number(params.risk_owner) ? Number(params.risk_owner) : null,
        mitigation_status: "Not Started",
        risk_level_autocalculated: "Medium risk",
        ai_lifecycle_phase: "Problem definition & planning",
        review_notes: "",
        current_risk_level: "Medium risk",
        mitigation_plan: "",
        implementation_strategy: "",
        mitigation_evidence_document: "",
        likelihood_mitigation: "Possible",
        risk_severity: "Moderate",
        final_risk_level: "",
        risk_approval: null,
        approval_status: RISK_APPROVAL_NOT_REQUIRED,
        date_of_assessment: new Date(),
        deadline: params.deadline || null,
        assessment_mapping: "",
        controls_mapping: "",
        is_demo: false,
        projects: [params.project_id],
        frameworks: [],
      };
      const result = await createRiskQuery(riskData, organizationId, transaction, { viewer });
      await transaction.commit();
      return { id: result.id, risk_name: result.risk_name, message: "Risk created successfully" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdateRisk = createWriteToolFn({
  toolName: "agent_update_risk",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter((k) => k !== "risk_id");
    return `Update risk #${params.risk_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const riskId = params.risk_id as number;
      const viewer = await actingRiskViewer(params, organizationId);
      const updateData: any = {};
      if (params.risk_name !== undefined) updateData.risk_name = params.risk_name;
      if (params.risk_description !== undefined)
        updateData.risk_description = params.risk_description;
      if (params.severity !== undefined) updateData.severity = params.severity;
      if (params.likelihood !== undefined) updateData.likelihood = params.likelihood;
      if (params.impact !== undefined) updateData.impact = params.impact;
      if (params.category !== undefined) updateData.risk_category = [params.category];
      if (params.risk_owner !== undefined) updateData.risk_owner = params.risk_owner;
      if (params.mitigation_status !== undefined)
        updateData.mitigation_status = params.mitigation_status;
      if (params.mitigation_plan !== undefined) updateData.mitigation_plan = params.mitigation_plan;

      // Null when the risk is missing or hidden from the acting user: nothing
      // was written, and both answer "Risk not found".
      const updated = await updateRiskByIdQuery(riskId, updateData, organizationId, transaction, {
        viewer,
      });
      if (!updated) {
        throw new NotFoundException("Risk not found", "risk", riskId);
      }
      await transaction.commit();
      return { id: riskId, updated: true, message: "Risk updated successfully" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentDeleteRisk = createWriteToolFn({
  toolName: "agent_delete_risk",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete risk #${params.risk_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const riskId = params.risk_id as number;
      // The approval gateway sets _userId to the user the action runs for.
      const userId = (params._userId as number | undefined) || undefined;
      // Same archive as the console: history entry and policy unlinks included.
      // A risk the user cannot see is a missing one, and nothing is written.
      const viewer = await actingRiskViewer(params, organizationId);
      const archived = await archiveRiskQuery(riskId, organizationId, userId, transaction, {
        viewer,
      });
      if (!archived) throw new NotFoundException("Risk not found", "risk", riskId);
      await transaction.commit();
      return { id: riskId, deleted: true, message: "Risk deleted successfully" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentAssignRiskOwner = createWriteToolFn({
  toolName: "agent_assign_risk_owner",
  warningLevel: "info",
  descriptionFn: (params) =>
    `Assign user #${params.owner_user_id} as owner of risk #${params.risk_id}`,
  executeFn: async (params, organizationId) => {
    const riskId = params.risk_id as number;
    const ownerUserId = params.owner_user_id as number;
    await assertRiskReferencesInOrganization({ risk_owner: ownerUserId }, organizationId);
    // A risk the user cannot see is left alone, as a missing one is.
    const visibility = riskVisibilitySql("risks", await actingRiskViewer(params, organizationId));
    const updated = await sequelize.query(
      `UPDATE risks SET risk_owner = :owner_user_id, updated_at = NOW() WHERE id = :risk_id AND organization_id = :organizationId AND is_deleted = false${visibility.sql} RETURNING id`,
      {
        replacements: {
          owner_user_id: ownerUserId,
          risk_id: riskId,
          organizationId,
          ...visibility.replacements,
        },
        type: QueryTypes.SELECT,
      },
    );
    if (updated.length === 0) throw new NotFoundException("Risk not found", "risk", riskId);
    return { id: riskId, risk_owner: ownerUserId, message: "Risk owner assigned successfully" };
  },
});

const agentChangeRiskStatus = createWriteToolFn({
  toolName: "agent_change_risk_status",
  warningLevel: "warning",
  descriptionFn: (params) => `Change status of risk #${params.risk_id} to "${params.status}"`,
  executeFn: async (params, organizationId) => {
    const riskId = params.risk_id as number;
    const status = params.status as string;
    // A risk the user cannot see is left alone, as a missing one is.
    const visibility = riskVisibilitySql("risks", await actingRiskViewer(params, organizationId));
    const updated = await sequelize.query(
      `UPDATE risks SET mitigation_status = :status, updated_at = NOW() WHERE id = :risk_id AND organization_id = :organizationId AND is_deleted = false${visibility.sql} RETURNING id`,
      {
        replacements: { status, risk_id: riskId, organizationId, ...visibility.replacements },
        type: QueryTypes.SELECT,
      },
    );
    if (updated.length === 0) throw new NotFoundException("Risk not found", "risk", riskId);
    return { id: riskId, mitigation_status: status, message: "Risk status updated successfully" };
  },
});

const agentBulkUpdateRiskStatus = createWriteToolFn({
  toolName: "agent_bulk_update_risk_status",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const ids = params.risk_ids as number[];
    return `Update status of ${ids.length} risk(s) [${ids.join(", ")}] to "${params.status}"`;
  },
  executeFn: async (params, organizationId) => {
    const riskIds = params.risk_ids as number[];
    const status = params.status as string;
    // Risks the user cannot see are skipped and reported, as missing ids are.
    const visibility = riskVisibilitySql("risks", await actingRiskViewer(params, organizationId));
    const rows = await sequelize.query<{ id: number }>(
      `UPDATE risks SET mitigation_status = :status, updated_at = NOW() WHERE id = ANY(ARRAY[:risk_ids]::int[]) AND organization_id = :organizationId AND is_deleted = false${visibility.sql} RETURNING id`,
      {
        replacements: {
          status,
          risk_ids: riskIds,
          organizationId,
          ...visibility.replacements,
        },
        type: QueryTypes.SELECT,
      },
    );
    const updatedIds = new Set(rows.map((row) => Number(row.id)));
    const notFoundIds = riskIds.filter((id) => !updatedIds.has(Number(id)));
    return {
      updated_ids: riskIds.filter((id) => updatedIds.has(Number(id))),
      not_found_ids: notFoundIds,
      mitigation_status: status,
      message:
        `${updatedIds.size} risk(s) updated successfully` +
        (notFoundIds.length > 0
          ? `. Not found: ${notFoundIds.map((id) => `#${id}`).join(", ")}`
          : ""),
    };
  },
});

const agentLinkRiskToProject = createWriteToolFn({
  toolName: "agent_link_risk_to_project",
  warningLevel: "warning",
  descriptionFn: (params) => `Link risk #${params.risk_id} to project #${params.project_id}`,
  executeFn: async (params, organizationId) => {
    const riskId = params.risk_id as number;
    const projectId = params.project_id as number;
    const viewer = await actingRiskViewer(params, organizationId);
    await linkRiskToProjectQuery(riskId, projectId, organizationId, undefined, viewer);
    return {
      risk_id: riskId,
      project_id: projectId,
      message: "Risk linked to project successfully",
    };
  },
});

const availableRiskTools: any = {
  fetch_risks: fetchRisks,
  get_risk_analytics: getRiskAnalytics,
  get_executive_summary: getExecutiveSummary,
  get_risk_history_timeseries: getRiskHistoryTimeseries,
  agent_create_risk: agentCreateRisk,
  agent_update_risk: agentUpdateRisk,
  agent_delete_risk: agentDeleteRisk,
  agent_assign_risk_owner: agentAssignRiskOwner,
  agent_change_risk_status: agentChangeRiskStatus,
  agent_bulk_update_risk_status: agentBulkUpdateRiskStatus,
  agent_link_risk_to_project: agentLinkRiskToProject,
};

export { availableRiskTools };
