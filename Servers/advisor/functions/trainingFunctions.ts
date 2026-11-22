import { getAllTrainingRegistarQuery } from "../../utils/trainingRegistar.utils";
import logger from "../../utils/logger/fileLogger";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import { assignTraining } from "../../services/trainingAssignment.service";
import { userHasPermission } from "../../utils/userPermission.utils";
import { translate } from "../../utils/i18n.utils";
import { actingRequesterId } from "./actingRequester";

export interface FetchTrainingRecordsParams {
  status?: "Planned" | "In Progress" | "Completed";
  department?: string;
  provider?: string;
  limit?: number;
}

const fetchTrainingRecords = async (
  params: FetchTrainingRecordsParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    let records = await getAllTrainingRegistarQuery(organizationId);

    // Apply filters
    if (params.status) {
      records = records.filter((r: any) => r.status === params.status);
    }
    if (params.department) {
      records = records.filter(
        (r: any) =>
          r.department && r.department.toLowerCase().includes(params.department!.toLowerCase()),
      );
    }
    if (params.provider) {
      records = records.filter(
        (r: any) => r.provider && r.provider.toLowerCase().includes(params.provider!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      records = records.slice(0, params.limit);
    }

    // Return lightweight projections
    return records.map((r: any) => ({
      id: r.id,
      training_name: r.training_name,
      status: r.status,
      department: r.department,
      provider: r.provider,
      duration: r.duration,
      numberOfPeople: r.numberOfPeople || r.people,
    }));
  } catch (error) {
    logger.error("Error fetching training records:", error);
    throw new Error(
      `Failed to fetch training records: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getTrainingAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const records = await getAllTrainingRegistarQuery(organizationId);
    const total = records.length;

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      const status = r.status || "Unknown";
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Department distribution
    const departmentDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      if (r.department) {
        departmentDistribution[r.department] = (departmentDistribution[r.department] || 0) + 1;
      }
    });

    // Provider distribution
    const providerDistribution: Record<string, number> = {};
    records.forEach((r: any) => {
      if (r.provider) {
        providerDistribution[r.provider] = (providerDistribution[r.provider] || 0) + 1;
      }
    });

    // Total people trained
    const totalPeopleTrained = records.reduce(
      (sum: number, r: any) => sum + (r.numberOfPeople || r.people || 0),
      0,
    );

    return {
      totalTrainingRecords: total,
      statusDistribution,
      departmentDistribution,
      providerDistribution,
      totalPeopleTrained,
    };
  } catch (error) {
    logger.error("Error getting training analytics:", error);
    throw new Error(
      `Failed to get training analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getTrainingExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const records = await getAllTrainingRegistarQuery(organizationId);
    const total = records.length;

    const completedCount = records.filter((r: any) => r.status === "Completed").length;
    const inProgressCount = records.filter((r: any) => r.status === "In Progress").length;
    const plannedCount = records.filter((r: any) => r.status === "Planned").length;

    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    // Department coverage
    const departments = new Set<string>();
    records.forEach((r: any) => {
      if (r.department) departments.add(r.department);
    });

    // Total people
    const totalPeopleTrained = records.reduce(
      (sum: number, r: any) => sum + (r.numberOfPeople || r.people || 0),
      0,
    );

    return {
      totalTrainingRecords: total,
      completedTrainings: completedCount,
      inProgressTrainings: inProgressCount,
      plannedTrainings: plannedCount,
      completionRate: `${completionRate}%`,
      departmentsCovered: departments.size,
      departments: Array.from(departments),
      totalPeopleTrained,
    };
  } catch (error) {
    logger.error("Error getting training executive summary:", error);
    throw new Error(
      `Failed to get training executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write tools (Human Confirmation Flow) ---

const agentCreateTrainingRecord = createWriteToolFn({
  toolName: "agent_create_training_record",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create training record "${params.title}"${params.department ? ` for ${params.department} department` : ""}`,
  executeFn: async (params, organizationId) => {
    const result = await sequelize.query(
      `INSERT INTO trainingregistar (
        organization_id, training_name, description, provider, department, status, duration
      ) VALUES (
        :organization_id, :training_name, :description, :provider, :department, :status, :duration
      ) RETURNING *`,
      {
        replacements: {
          organization_id: organizationId,
          training_name: params.title as string,
          description: (params.description as string) || null,
          provider: (params.provider as string) || null,
          department: (params.department as string) || null,
          status: (params.status as string) || "Planned",
          duration: (params.duration as string) || null,
        },
      },
    );
    const created = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, training_record: created };
  },
});

const agentUpdateTrainingRecord = createWriteToolFn({
  toolName: "agent_update_training_record",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update training record #${params.training_id}${params.title ? ` — rename to "${params.title}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const fields: Record<string, { column: string; value: unknown }> = {
      title: { column: "training_name", value: params.title },
      description: { column: "description", value: params.description },
      provider: { column: "provider", value: params.provider },
      department: { column: "department", value: params.department },
      status: { column: "status", value: params.status },
      // Free text such as "2 hours". A training has no due date: due dates
      // belong to its assignments (agent_assign_training_to_user).
      duration: { column: "duration", value: params.duration },
    };

    const setClauses: string[] = [];
    const replacements: Record<string, unknown> = {
      organizationId,
      id: params.training_id,
    };

    for (const [key, { column, value }] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`${column} = :${key}`);
        replacements[key] = value;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, message: "No fields to update" };
    }

    const result = await sequelize.query(
      `UPDATE trainingregistar SET ${setClauses.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      { replacements },
    );
    const updated = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, training_record: updated };
  },
});

const agentAssignTrainingToUser = createWriteToolFn({
  toolName: "agent_assign_training_to_user",
  // Emails the assignee, so a person confirms it first.
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Assign training #${params.training_id} to user #${params.user_id}, due ${params.due_date}`,
  executeFn: async (params, organizationId) => {
    const trainingId = params.training_id;
    // The console's gate (POST /api/v1/training/assignments): training.edit,
    // held by the user who asked, else the approver. No user: refused.
    const userId = actingRequesterId(params);
    if (!(await userHasPermission(organizationId, userId, "training.edit"))) {
      return {
        success: false,
        message: `Training #${trainingId} was not assigned: your role does not allow editing training.`,
      };
    }

    // The console's own path: validation, organization and membership checks,
    // change history and the assignee's notification.
    const result = await assignTraining(
      { training_id: trainingId, user_ids: [params.user_id], due_date: params.due_date },
      { userId: userId!, organizationId },
    );
    if (!result.ok) {
      return { success: false, message: translate("en", result.message, result.vars) };
    }
    const [assignment] = result.created;
    if (!assignment) {
      return {
        success: false,
        message: `User #${params.user_id} is already assigned to training #${trainingId}`,
      };
    }
    return {
      success: true,
      message: `Training #${trainingId} assigned to user #${params.user_id}, due ${assignment.due_date}`,
      assignment,
    };
  },
});

const agentDeleteTrainingRecord = createWriteToolFn({
  toolName: "agent_delete_training_record",
  warningLevel: "danger",
  descriptionFn: (params) => `Permanently delete training record #${params.training_id}`,
  executeFn: async (params, organizationId) => {
    const result = await sequelize.query(
      `DELETE FROM trainingregistar WHERE organization_id = :organizationId AND id = :id RETURNING id, training_name`,
      {
        replacements: { organizationId, id: params.training_id },
      },
    );
    const deleted = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, deleted_training_record: deleted };
  },
});

const availableTrainingTools: Record<string, Function> = {
  fetch_training_records: fetchTrainingRecords,
  get_training_analytics: getTrainingAnalytics,
  get_training_executive_summary: getTrainingExecutiveSummary,
  agent_create_training_record: agentCreateTrainingRecord,
  agent_update_training_record: agentUpdateTrainingRecord,
  agent_assign_training_to_user: agentAssignTrainingToUser,
  agent_delete_training_record: agentDeleteTrainingRecord,
};

export { availableTrainingTools };
