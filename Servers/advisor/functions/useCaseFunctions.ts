import { actingRequesterId } from "./actingRequester";
import {
  getCurrentProjectMembers,
  getProjectByIdQuery,
  getUserProjects,
  lockProjectForDelete,
} from "../../utils/project.utils";
import { deleteProjectWithSideEffects } from "../../utils/projectDeletion.utils";
import { userHasPermission } from "../../utils/userPermission.utils";
import {
  actingProjectViewer,
  NO_PROJECT_VIEWER,
  refuseUseCaseWrite,
  type Refusal,
} from "./useCaseScope";
import { calculateProjectRisks } from "../../utils/project.utils";
import { findUsersNotInOrganization } from "../../utils/user.utils";
import logger from "../../utils/logger/fileLogger";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import {
  createUseCaseService,
  updateUseCaseService,
  type UpdateUseCaseServiceInput,
  type UseCaseServiceContext,
} from "../../services/useCase.service";
import {
  notifyUseCaseCreated,
  notifyUseCaseUpdated,
} from "../../services/useCaseNotifications.service";
import { resolveUseCaseFrameworkIds } from "../../mcp/frameworks";
import { ProjectStatus } from "../../domain.layer/enums/project-status.enum";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { ProjectModel } from "../../domain.layer/models/project/project.model";
import { refusalFrom } from "./modelWriteScope";
import { throwOnValidationFailure } from "./toolValidation";
import {
  canonicalStatus,
  checkUseCaseLabels,
  USE_CASE_CLASSIFICATION_FILTERS,
  USE_CASE_STATUSES,
} from "./useCaseLabels";
import { deleteObjectOnCommit } from "../../services/storage/transactionRegistry";
import { StorageObjectRef } from "../../services/storage/types";

export interface FetchUseCasesParams {
  status?: string;
  ai_risk_classification?: string;
  limit?: number;
}

/**
 * The use cases the acting user's use case list shows (getUserProjects, the
 * projectVisibilitySql rule behind GET /api/projects). None when the user is
 * unknown or not a member of the organization: it fails closed.
 */
const getVisibleProjects = async (params: Record<string, unknown>, organizationId: number) => {
  const viewer = await actingProjectViewer(params, organizationId);
  if (viewer === NO_PROJECT_VIEWER) return [];
  const projects = await getUserProjects(viewer, organizationId);
  return projects || [];
};

const fetchUseCases = async (
  params: FetchUseCasesParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    let projects = await getVisibleProjects(params as Record<string, unknown>, organizationId);

    // Apply filters, matching the stored spelling case-insensitively.
    if (params.status) {
      const status = canonicalStatus(params.status) ?? params.status;
      projects = projects.filter((p: any) => p.status === status);
    }
    if (params.ai_risk_classification) {
      const wanted = params.ai_risk_classification.trim().toLowerCase();
      const classification =
        USE_CASE_CLASSIFICATION_FILTERS.find((c) => c.toLowerCase() === wanted) ??
        params.ai_risk_classification;
      projects = projects.filter((p: any) => p.ai_risk_classification === classification);
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      projects = projects.slice(0, params.limit);
    }

    // Return lightweight projections
    return projects.map((p: any) => ({
      id: p.id,
      uc_id: p.uc_id,
      project_title: p.project_title,
      status: p.status,
      ai_risk_classification: p.ai_risk_classification,
      owner: p.owner,
      external_owner_name: p.external_owner_name ?? null,
      start_date: p.start_date,
      goal: p.goal,
      target_industry: p.target_industry,
      last_updated: p.last_updated,
    }));
  } catch (error) {
    logger.error("Error fetching use cases:", error);
    throw new Error(
      `Failed to fetch use cases: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUseCaseAnalytics = async (
  params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const projects = await getVisibleProjects(params, organizationId);
    const total = projects.length;

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      const status = p.status || ProjectStatus.NOT_STARTED;
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Risk classification distribution
    const riskClassificationDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      const classification = p.ai_risk_classification || "Unclassified";
      riskClassificationDistribution[classification] =
        (riskClassificationDistribution[classification] || 0) + 1;
    });

    // Industry distribution
    const industryDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      if (p.target_industry) {
        industryDistribution[p.target_industry] =
          (industryDistribution[p.target_industry] || 0) + 1;
      }
    });

    return {
      totalUseCases: total,
      statusDistribution,
      riskClassificationDistribution,
      industryDistribution,
    };
  } catch (error) {
    logger.error("Error getting use case analytics:", error);
    throw new Error(
      `Failed to get use case analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUseCaseExecutiveSummary = async (
  params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const projects = await getVisibleProjects(params, organizationId);
    const total = projects.length;

    // Every status the console offers, zero when none is in it.
    const statusCounts: Record<string, number> = Object.fromEntries(
      USE_CASE_STATUSES.map((status) => [status, 0]),
    );
    projects.forEach((p: any) => {
      if (p.status in statusCounts) statusCounts[p.status] += 1;
    });

    const highRiskCount = projects.filter(
      (p: any) =>
        p.ai_risk_classification === AiRiskClassification.HIGH_RISK ||
        p.ai_risk_classification === AiRiskClassification.PROHIBITED,
    ).length;

    // Get risk counts for each project (parallelized to avoid N+1)
    const projectsToCheck = projects.slice(0, 10).filter((p: any) => p.id);
    const riskResults = await Promise.allSettled(
      projectsToCheck.map((project: any) =>
        calculateProjectRisks(project.id, organizationId).then((rows) => ({
          project,
          totalRisks: rows.reduce((sum, row) => sum + parseInt(String(row.count), 10), 0),
        })),
      ),
    );

    const projectRiskSummaries = riskResults
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          project: any;
          totalRisks: number;
        }> => r.status === "fulfilled" && r.value.totalRisks > 0,
      )
      .map((r) => ({
        id: r.value.project.id,
        title: r.value.project.project_title,
        riskClassification: r.value.project.ai_risk_classification,
        totalRisks: r.value.totalRisks,
      }));

    return {
      totalUseCases: total,
      notStartedUseCases: statusCounts[ProjectStatus.NOT_STARTED],
      inProgressUseCases: statusCounts[ProjectStatus.IN_PROGRESS],
      underReviewUseCases: statusCounts[ProjectStatus.UNDER_REVIEW],
      completedUseCases: statusCounts[ProjectStatus.COMPLETED],
      statusCounts,
      highRiskUseCases: highRiskCount,
      topProjectsByRisk: projectRiskSummaries
        .sort((a, b) => b.totalRisks - a.totalRisks)
        .slice(0, 5),
    };
  } catch (error) {
    logger.error("Error getting use case executive summary:", error);
    throw new Error(
      `Failed to get use case executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write tools (Human Confirmation Flow) ---
//
// Creates and updates go through services/useCase.service.ts as the user who
// asked (the requester after an approval), as the console's routes do: the
// owner and members, framework structures, change history, the approval
// request and the project_added / project_updated automations. The notices the
// console sends after commit come from services/useCaseNotifications.service.ts.

const NOTICE_LOG = { functionName: "advisorUseCaseWrite", fileName: "useCaseFunctions.ts" };

const NO_USE_CASE_WRITE: Refusal = {
  success: false,
  message: "Your role does not allow changing use cases",
};

/** The service context for the acting user, with their role in the organization. */
const useCaseWriteContext = async (
  params: Record<string, unknown>,
  organizationId: number,
): Promise<UseCaseServiceContext | Refusal> => {
  const viewer = await actingProjectViewer(params, organizationId);
  if (viewer === NO_PROJECT_VIEWER) return NO_USE_CASE_WRITE;
  return { userId: viewer.userId, organizationId, actorRole: viewer.role };
};

const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "object" && value !== null && (value as Refusal).success === false;

/** A list of positive user or framework ids, or null when it is not one. */
const idList = (value: unknown): number[] | null => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null;
};

/**
 * File time: refuse labels outside the lists (and malformed id lists) before
 * an approval is filed, and file the labels as the lists spell them.
 */
const checkFiling = (
  toolName: string,
  params: Record<string, unknown>,
  idFields: string[] = [],
): Record<string, unknown> => {
  const { params: checked, issues } = checkUseCaseLabels(params);
  const problems: Array<{ path: string[]; message: string }> = [...issues];
  for (const field of idFields) {
    if (idList(params[field]) === null) {
      problems.push({ path: [field], message: "must be a list of positive ids" });
    }
  }
  if (problems.length > 0) throwOnValidationFailure(toolName, problems);
  return checked;
};

/**
 * Execute time: the labels of an approval filed before these lists map to the
 * nearest real value; anything else is refused.
 */
const executionLabels = (
  params: Record<string, unknown>,
): { params: Record<string, unknown> } | Refusal => {
  const { params: checked, issues } = checkUseCaseLabels(params, { acceptLegacy: true });
  if (issues.length > 0) {
    return {
      success: false,
      message: issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { params: checked };
};

/**
 * Update one use case through updateUseCaseService as the acting user, then
 * send the console's update notices (a new owner, added members).
 */
const updateUseCaseAsUser = async (
  useCaseId: number,
  input: UpdateUseCaseServiceInput,
  ctx: UseCaseServiceContext,
): Promise<unknown> => {
  const { organizationId } = ctx;
  const existing = await getProjectByIdQuery(useCaseId, organizationId);
  if (!existing) return { success: false, message: `Use case #${useCaseId} not found` };

  const transaction = await sequelize.transaction();
  let outcome: Awaited<ReturnType<typeof updateUseCaseService>>;
  try {
    outcome = await updateUseCaseService(useCaseId, input, existing, ctx, transaction);
    if (!outcome.useCase) {
      await transaction.rollback();
      return { success: false, message: `Use case #${useCaseId} not found` };
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    return refusalFrom(error);
  }

  await notifyUseCaseUpdated(
    existing,
    outcome.useCase,
    outcome.currentMembers,
    ctx.userId,
    organizationId,
    NOTICE_LOG,
  );
  return { success: true, use_case: outcome.useCase };
};

const createUseCaseExecutor = createWriteToolFn({
  toolName: "agent_create_use_case",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create use case "${params.name}"${params.risk_classification ? ` with risk classification "${params.risk_classification}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const refusal = await refuseUseCaseWrite(params, organizationId);
    if (refusal) return refusal;
    const labels = executionLabels(params);
    if (isRefusal(labels)) return labels;
    const ctx = await useCaseWriteContext(params, organizationId);
    if (isRefusal(ctx)) return ctx;

    const p = labels.params;
    const members = idList(p.members);
    const frameworkIds = idList(p.framework_ids);
    if (members === null || frameworkIds === null) {
      return { success: false, message: "members and framework_ids must be lists of ids" };
    }
    let frameworks: Awaited<ReturnType<typeof resolveUseCaseFrameworkIds>>;
    try {
      frameworks = await resolveUseCaseFrameworkIds(frameworkIds);
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }

    const transaction = await sequelize.transaction();
    let created: Awaited<ReturnType<typeof createUseCaseService>>;
    try {
      created = await createUseCaseService(
        {
          project_title: p.name as string,
          description: (p.description as string) || undefined,
          goal: (p.goal as string) || undefined,
          target_industry: (p.industry as string) || undefined,
          status: p.status as ProjectStatus | undefined,
          ai_risk_classification: p.risk_classification as AiRiskClassification | undefined,
          // The requester owns what they create unless they name an owner,
          // as the console's form starts with the creator.
          owner: p.owner !== undefined && p.owner !== null ? Number(p.owner) : ctx.userId,
          start_date: new Date(),
          members,
          framework: frameworks.ids,
          is_organizational: frameworks.isOrganizational,
          enable_ai_data_insertion: false,
        } as Partial<ProjectModel> & { members: number[]; framework: number[] },
        ctx,
        transaction,
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      return refusalFrom(error);
    }

    await notifyUseCaseCreated(
      created.useCase,
      created.approvalResult,
      ctx.userId,
      organizationId,
      NOTICE_LOG,
    );
    return {
      success: true,
      use_case: created.useCase.toJSON(),
      frameworks_built: Object.keys(created.frameworks),
    };
  },
});

const agentCreateUseCase = async (params: Record<string, unknown>, organizationId: number) =>
  createUseCaseExecutor(
    checkFiling("agent_create_use_case", params, ["members", "framework_ids"]),
    organizationId,
  );

const UPDATE_FIELDS: Record<string, string> = {
  name: "project_title",
  description: "description",
  status: "status",
  risk_classification: "ai_risk_classification",
  industry: "target_industry",
  goal: "goal",
};

const updateUseCaseExecutor = createWriteToolFn({
  toolName: "agent_update_use_case",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update use case #${params.use_case_id}${params.name ? ` — rename to "${params.name}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const refusal = await refuseUseCaseWrite(params, organizationId, params.use_case_id);
    if (refusal) return refusal;
    const labels = executionLabels(params);
    if (isRefusal(labels)) return labels;

    const input: Record<string, unknown> = {};
    for (const [param, column] of Object.entries(UPDATE_FIELDS)) {
      const value = labels.params[param];
      if (value !== undefined && value !== null) input[column] = value;
    }
    if (Object.keys(input).length === 0) {
      return { success: false, message: "No fields to update" };
    }

    const ctx = await useCaseWriteContext(params, organizationId);
    if (isRefusal(ctx)) return ctx;
    return updateUseCaseAsUser(Number(params.use_case_id), input, ctx);
  },
});

const agentUpdateUseCase = async (params: Record<string, unknown>, organizationId: number) =>
  updateUseCaseExecutor(checkFiling("agent_update_use_case", params), organizationId);

const updateUseCaseStatusExecutor = createWriteToolFn({
  toolName: "agent_update_use_case_status",
  warningLevel: "warning",
  descriptionFn: (params) => `Update use case #${params.use_case_id} status to "${params.status}"`,
  executeFn: async (params, organizationId) => {
    const refusal = await refuseUseCaseWrite(params, organizationId, params.use_case_id);
    if (refusal) return refusal;
    const labels = executionLabels(params);
    if (isRefusal(labels)) return labels;
    if (!labels.params.status) return { success: false, message: "status is required" };
    const ctx = await useCaseWriteContext(params, organizationId);
    if (isRefusal(ctx)) return ctx;
    return updateUseCaseAsUser(
      Number(params.use_case_id),
      { status: labels.params.status as ProjectStatus },
      ctx,
    );
  },
});

const agentUpdateUseCaseStatus = async (params: Record<string, unknown>, organizationId: number) =>
  updateUseCaseStatusExecutor(checkFiling("agent_update_use_case_status", params), organizationId);

// Adding a member grants that person access to the use case, so it always
// waits for a person's approval ("warning" is never auto-approved).
const agentAddMemberToUseCase = createWriteToolFn({
  toolName: "agent_add_member_to_use_case",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Add user #${params.user_id} as member to use case #${params.use_case_id}`,
  executeFn: async (params, organizationId) => {
    // The members path of PATCH /api/projects/:id: useCase.edit and write
    // access to the use case (which also proves it is in this organization).
    const refusal = await refuseUseCaseWrite(params, organizationId, params.use_case_id);
    if (refusal) return refusal;
    const userId = Number(params.user_id);
    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      (await findUsersNotInOrganization([userId], organizationId)).length > 0
    ) {
      return { success: false, message: `User #${params.user_id} is not in this organization` };
    }

    const useCaseId = Number(params.use_case_id);
    const current = (await getCurrentProjectMembers(useCaseId, organizationId)).map(Number);
    if (current.includes(userId)) {
      return { success: false, message: "User is already a member of this use case" };
    }

    const ctx = await useCaseWriteContext(params, organizationId);
    if (isRefusal(ctx)) return ctx;
    // The full list, as the console's member picker sends it: history records
    // the member change and the new member gets the "you were added" email.
    const result = (await updateUseCaseAsUser(
      useCaseId,
      { members: [...current, userId] },
      ctx,
    )) as { success: boolean };
    if (!result.success) return result;
    return {
      success: true,
      message: `User #${params.user_id} added to use case #${params.use_case_id}`,
    };
  },
});

const agentDeleteUseCase = createWriteToolFn({
  toolName: "agent_delete_use_case",
  warningLevel: "danger",
  descriptionFn: (params) =>
    `Permanently delete use case #${params.use_case_id} and all associated data. Risks linked only to this use case are archived.`,
  executeFn: async (params, organizationId) => {
    const useCaseId = params.use_case_id as number;
    // Recorded as the user who asked for the delete, else the approver.
    const userId = actingRequesterId(params);

    // The delete always archives the risks linked only to this use case,
    // which takes the same permission as archiving them in the console
    // (risks.edit, as DELETE /api/v1/projects/:id with the archive choice).
    // Without it nothing is deleted: deleting without archiving would show
    // those risks to everyone.
    if (!(await userHasPermission(organizationId, userId, "risks.edit"))) {
      return {
        success: false,
        message: `Use case #${useCaseId} was not deleted. Deleting it archives the risks linked only to it, and your role does not allow archiving risks.`,
      };
    }
    // The console's delete gate: useCase.edit and write access to the use case.
    const refusal = await refuseUseCaseWrite(params, organizationId, useCaseId);
    if (refusal) return refusal;

    const transaction = await sequelize.transaction();
    try {
      // Lock the use case first, as every project delete does; a use case not
      // in this organization changes nothing.
      if (!(await lockProjectForDelete(useCaseId, organizationId, transaction))) {
        await transaction.rollback();
        return { success: false, message: `Use case #${useCaseId} not found` };
      }
      const [useCase] = (await sequelize.query(
        `SELECT id, project_title FROM projects WHERE organization_id = :organizationId AND id = :id`,
        {
          replacements: { organizationId, id: useCaseId },
          type: QueryTypes.SELECT,
          transaction,
        },
      )) as Array<{ id: number; project_title: string }>;

      // Delete the file rows here, before the shared delete, so their
      // externally stored bytes can be queued for removal once the
      // transaction commits (the shared delete only removes the rows).
      const deletedFiles = (await sequelize.query(
        `DELETE FROM files WHERE organization_id = :organizationId AND project_id = :id
         RETURNING storage_provider, storage_key`,
        {
          replacements: { organizationId, id: useCaseId },
          transaction,
          type: QueryTypes.SELECT,
        },
      )) as unknown as { storage_provider: string | null; storage_key: string | null }[];
      // Externally stored bytes are removed only after the deletes commit.
      for (const row of deletedFiles) {
        if (row.storage_key) {
          deleteObjectOnCommit(transaction, {
            provider: row.storage_provider as StorageObjectRef["provider"],
            key: row.storage_key,
          });
        }
      }

      // The shared delete: approval withdrawal, change history, the archive
      // of the risks linked only to this use case (so they stay private once
      // unlinked), the delete and the project_deleted automation.
      const { deleted, archivedRiskIds } = await deleteProjectWithSideEffects(
        useCaseId,
        organizationId,
        transaction,
        {
          userId: userId ?? null,
          alreadyLocked: true,
          archiveRisksLinkedOnlyHere: true,
          enqueueAutomationAfterCommit: true,
        },
      );
      if (!deleted) {
        await transaction.rollback();
        return { success: false, message: `Use case #${useCaseId} not found` };
      }
      await transaction.commit();
      return {
        success: true,
        deleted_use_case: useCase,
        archived_risk_ids: archivedRiskIds,
        message:
          archivedRiskIds.length > 0
            ? `Use case #${useCaseId} deleted. ${archivedRiskIds.length} risk(s) linked only to it were archived. An archived risk with no use case is visible only to Admins and to its owner and approver.`
            : `Use case #${useCaseId} deleted. No risks were linked only to it, so none were archived.`,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const availableUseCaseTools: Record<string, Function> = {
  fetch_use_cases: fetchUseCases,
  get_use_case_analytics: getUseCaseAnalytics,
  get_use_case_executive_summary: getUseCaseExecutiveSummary,
  agent_create_use_case: agentCreateUseCase,
  agent_update_use_case: agentUpdateUseCase,
  agent_update_use_case_status: agentUpdateUseCaseStatus,
  agent_add_member_to_use_case: agentAddMemberToUseCase,
  agent_delete_use_case: agentDeleteUseCase,
};

export { availableUseCaseTools };
