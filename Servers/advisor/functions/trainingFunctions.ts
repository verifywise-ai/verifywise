import {
  getAllTrainingRegistarQuery,
  getTrainingRegistarByIdQuery,
} from "../../utils/trainingRegistar.utils";
import logger from "../../utils/logger/fileLogger";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import {
  assignTraining,
  checkTrainingAssignment,
  personName,
} from "../../services/trainingAssignment.service";
import {
  createTrainingRecord,
  deleteTrainingRecord,
  updateTrainingRecord,
  type TrainingRecordInput,
} from "../../services/trainingRecord.service";
import { getAssignableTrainingQuery } from "../../utils/trainingAssignment.utils";
import { getUserByIdQuery } from "../../utils/user.utils";
import { userHasPermission } from "../../utils/userPermission.utils";
import { translate } from "../../utils/i18n.utils";
import { parseIdValue } from "../../utils/validations/trainingAssignmentValidation.utils";
import type { PermissionKey } from "../../config/rolePermissions.config";
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
//
// Each write runs as the user who asked (else the approver), with the console's
// permission, through the console's own services. Its checks run once before
// the approval is requested, so nobody is asked to approve a call that cannot
// run, and again when it executes.

/** A training record has no due date: only its assignments do. */
const NO_DUE_DATE_ON_RECORDS =
  "Training records have no due date; set it on the assignment (agent_assign_training_to_user)";

/** Advisor parameter → training record field (the console's names). */
const RECORD_FIELDS: Record<string, keyof TrainingRecordInput> = {
  title: "training_name",
  description: "description",
  provider: "provider",
  department: "department",
  status: "status",
  duration: "duration",
};

const recordInput = (params: Record<string, unknown>): TrainingRecordInput => {
  const input: Record<string, unknown> = {};
  for (const [param, field] of Object.entries(RECORD_FIELDS)) {
    const value = params[param];
    if (value !== undefined && value !== null) input[field] = value;
  }
  return input as TrainingRecordInput;
};

const ROLE_REFUSAL: Record<string, string> = {
  "training.edit": "your role does not allow editing training",
  "training.admin": "your role does not allow deleting training",
};

type RecordWrite = "create" | "update" | "delete";

const RECORD_PERMISSION: Record<RecordWrite, PermissionKey> = {
  create: "training.edit",
  update: "training.edit",
  // The console's gate for DELETE /api/training/:id.
  delete: "training.admin",
};

type RecordRequest =
  { ok: false; message: string } | { ok: true; id: number; input: TrainingRecordInput };

const refused = (message: string): RecordRequest => ({ ok: false, message });

/**
 * The record write the tool asks for, or why it cannot run: a valid id (update
 * and delete) for a record in this organization, no due date (records have
 * none, including in an approval stored before they stopped taking one), a
 * title to create, at least one field to update, and the console's permission
 * held by the acting user. Run before the approval is requested and again when
 * the write executes.
 */
async function recordRequest(
  write: RecordWrite,
  params: Record<string, unknown>,
  organizationId: number,
): Promise<RecordRequest> {
  let id = 0;
  let notDone = "Training record was not created";
  if (write !== "create") {
    const parsed = parseIdValue(params.training_id, "Training ID must be a positive integer");
    if (!parsed.ok) return refused(parsed.message);
    id = parsed.value;
    notDone = `Training record #${id} was not ${write}d`;
  }
  if (params.due_date !== undefined && params.due_date !== null && params.due_date !== "") {
    return refused(`${notDone}: ${NO_DUE_DATE_ON_RECORDS}`);
  }

  const input = recordInput(params);
  if (
    write === "create" &&
    !(typeof input.training_name === "string" && input.training_name.trim())
  ) {
    return refused(`${notDone}: a title is required`);
  }
  if (write === "update" && Object.keys(input).length === 0) return refused("No fields to update");

  const permission = RECORD_PERMISSION[write];
  if (!(await userHasPermission(organizationId, actingRequesterId(params), permission))) {
    return refused(`${notDone}: ${ROLE_REFUSAL[permission]}.`);
  }
  if (write !== "create" && !(await getTrainingRegistarByIdQuery(id, organizationId))) {
    return refused(`Training record #${id} not found`);
  }
  return { ok: true, id, input };
}

const precheckRecord =
  (write: RecordWrite) => async (params: Record<string, unknown>, organizationId: number) => {
    const request = await recordRequest(write, params, organizationId);
    return request.ok ? null : request.message;
  };

const actorFor = (params: Record<string, unknown>, organizationId: number) => ({
  userId: actingRequesterId(params),
  organizationId,
});

const agentCreateTrainingRecord = createWriteToolFn({
  toolName: "agent_create_training_record",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create training record "${params.title}"${params.department ? ` for ${params.department} department` : ""}`,
  precheckFn: precheckRecord("create"),
  executeFn: async (params, organizationId) => {
    const request = await recordRequest("create", params, organizationId);
    if (!request.ok) return { success: false, message: request.message };

    const created = await createTrainingRecord(
      { status: "Planned", ...request.input },
      actorFor(params, organizationId),
    );
    if (!created) return { success: false, message: "Training record was not created" };
    return { success: true, training_record: created };
  },
});

const agentUpdateTrainingRecord = createWriteToolFn({
  toolName: "agent_update_training_record",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update training record #${params.training_id}${params.title ? ` — rename to "${params.title}"` : ""}`,
  precheckFn: precheckRecord("update"),
  executeFn: async (params, organizationId) => {
    const request = await recordRequest("update", params, organizationId);
    if (!request.ok) return { success: false, message: request.message };

    const result = await updateTrainingRecord(
      request.id,
      request.input,
      actorFor(params, organizationId),
    );
    if (!result.ok) {
      return {
        success: false,
        message:
          result.reason === "no_fields"
            ? "No fields to update"
            : `Training record #${request.id} not found`,
      };
    }
    return { success: true, training_record: result.record };
  },
});

/**
 * The assignment the tool asks for, or why it cannot be made: ids given as
 * numbers or digits, and training.edit held by the acting user.
 */
async function assignmentRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<
  { ok: false; message: string } | { ok: true; actorId: number; input: Record<string, unknown> }
> {
  const trainingId = parseIdValue(params.training_id, "Training ID must be a positive integer");
  if (!trainingId.ok) return { ok: false, message: trainingId.message };
  const userId = parseIdValue(params.user_id, "User ID must be a positive integer");
  if (!userId.ok) return { ok: false, message: userId.message };

  // The console's gate (POST /api/v1/training/assignments): training.edit,
  // held by the user who asked, else the approver. No user: refused.
  const actorId = actingRequesterId(params);
  if (!(await userHasPermission(organizationId, actorId, "training.edit"))) {
    return {
      ok: false,
      message: `Training #${trainingId.value} was not assigned: ${ROLE_REFUSAL["training.edit"]}.`,
    };
  }
  return {
    ok: true,
    actorId: actorId!,
    input: { training_id: trainingId.value, user_ids: [userId.value], due_date: params.due_date },
  };
}

const agentAssignTrainingToUser = createWriteToolFn({
  toolName: "agent_assign_training_to_user",
  // Emails the assignee, so a person confirms it first.
  warningLevel: "warning",
  descriptionFn: async (params, organizationId) => {
    const trainingId = parseIdValue(params.training_id, "");
    const userId = parseIdValue(params.user_id, "");
    const training = trainingId.ok
      ? await getAssignableTrainingQuery(trainingId.value, organizationId)
      : null;
    const user = userId.ok ? await getUserByIdQuery(userId.value, null, organizationId) : null;
    const what = training ? `"${training.training_name}"` : `training #${params.training_id}`;
    const who = user
      ? `${personName(user.name, user.surname)} (${user.email})`
      : `user #${params.user_id}`;
    const due =
      typeof params.due_date === "string" && params.due_date ? `, due ${params.due_date}` : "";
    return `Assign ${what} to ${who}${due}`;
  },
  precheckFn: async (params, organizationId) => {
    const request = await assignmentRequest(params, organizationId);
    if (!request.ok) return request.message;
    // The console's checks: due date, the training in this organization, the
    // person a member of it.
    const checked = await checkTrainingAssignment(request.input, organizationId);
    return checked.ok ? null : translate("en", checked.message, checked.vars);
  },
  executeFn: async (params, organizationId) => {
    const request = await assignmentRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };

    // The console's own path: validation, organization and membership checks,
    // change history and the assignee's notification.
    const result = await assignTraining(request.input, {
      userId: request.actorId,
      organizationId,
    });
    if (!result.ok) {
      return { success: false, message: translate("en", result.message, result.vars) };
    }
    const [assignment] = result.created;
    const trainingId = request.input.training_id;
    const userId = (request.input.user_ids as number[])[0];
    if (!assignment) {
      return {
        success: false,
        message: `User #${userId} is already assigned to training #${trainingId}`,
      };
    }
    return {
      success: true,
      message: `Training #${trainingId} assigned to user #${userId}, due ${assignment.due_date}`,
      assignment,
    };
  },
});

const agentDeleteTrainingRecord = createWriteToolFn({
  toolName: "agent_delete_training_record",
  warningLevel: "danger",
  descriptionFn: (params) => `Permanently delete training record #${params.training_id}`,
  precheckFn: precheckRecord("delete"),
  executeFn: async (params, organizationId) => {
    const request = await recordRequest("delete", params, organizationId);
    if (!request.ok) return { success: false, message: request.message };

    const deleted = await deleteTrainingRecord(request.id, actorFor(params, organizationId));
    if (!deleted) return { success: false, message: `Training record #${request.id} not found` };
    return {
      success: true,
      deleted_training_record: { id: request.id, training_name: deleted.training_name },
    };
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
