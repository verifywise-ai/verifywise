/**
 * Use case tools.
 *
 * Writes call services/useCase.service.ts — the same code the use case
 * controllers call — so an MCP-created use case is indistinguishable from one
 * created in the console: same frameworks instantiated, same change history,
 * same approval request.
 *
 * Every tool takes an organizationId. Governance rows are scoped by
 * organization_id and a super admin belongs to no organization, so the target
 * is named per call rather than taken from the token.
 */

import { z } from "zod";
import { sequelize } from "../../database/db";
import {
  getAllProjectsQuery,
  getProjectByIdQuery,
  calculateProjectRisks,
} from "../../utils/project.utils";
import { createUseCaseService, updateUseCaseService } from "../../services/useCase.service";
import { ProjectModel } from "../../domain.layer/models/project/project.model";
import { ProjectStatus } from "../../domain.layer/enums/project-status.enum";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { getUserByIdQuery } from "../../utils/user.utils";
import logger from "../../utils/logger/fileLogger";
import { getApprovalStatusQuery, hasPendingApprovalQuery } from "../../utils/approvalRequest.utils";
import { requireOrganization } from "../scope";
import { resolveUseCaseFrameworks } from "../frameworks";
import { result, type ToolDef } from "../tool";

/**
 * Geography ids, mirroring the list the console offers (see
 * Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx).
 * `projects.geography` is a bare integer with no lookup table, so the names
 * only exist where they are offered — and a tool that asked for the id would
 * be unusable.
 */
const GEOGRAPHIES = {
  Global: 1,
  Europe: 2,
  "North America": 3,
  "South America": 4,
  Asia: 5,
  Africa: 6,
} as const;

const geographyArg = z
  .enum(Object.keys(GEOGRAPHIES) as [string, ...string[]])
  .describe("Where the use case operates.");

const organizationIdArg = z
  .number()
  .int()
  .positive()
  .describe("Id of the organization the use case belongs to.");

/**
 * Tell a use case's owner it is theirs, as the console does on create and on an
 * owner change.
 *
 * Fire-and-forget: the use case is already committed, and a notification that
 * cannot be delivered must not look like a failed write.
 *
 * The Slack message and the "use case created" digest the controller also sends
 * are deliberately left out — both route through the acting user's own
 * organization, and a super admin belongs to none.
 */
async function notifyOwnerAssigned(
  useCase: { id?: number; project_title: string; owner: number; description?: string },
  actingUserId: number,
  organizationId: number,
): Promise<void> {
  if (!useCase.owner || !useCase.id) return;
  try {
    const actor = await getUserByIdQuery(actingUserId);
    const assignerName = actor ? `${actor.name} ${actor.surname}`.trim() : "A super admin";
    await notifyUserAssigned(
      organizationId,
      useCase.owner,
      {
        entityType: "project",
        entityId: useCase.id,
        entityName: useCase.project_title,
        roleType: "Owner",
        entityUrl: `/project-view?projectId=${useCase.id}`,
      },
      assignerName,
      process.env.FRONTEND_URL || "http://localhost:3000",
      { description: useCase.description },
    );
  } catch (error) {
    logger.error("Failed to notify the use case owner:", error);
  }
}

/**
 * Read one use case in the shape every tool here answers with.
 *
 * `getProjectByIdQuery` returns a ProjectModel whose toJSON folds in the
 * framework and member lists it attaches; the owner name and the approval state
 * sit outside that shape, so they are added here. The update query, by
 * contrast, returns raw column values — which is why an update re-reads through
 * this rather than returning what it got back.
 */
async function readUseCase(
  useCaseId: number,
  organizationId: number,
): Promise<Record<string, unknown> | null> {
  const useCase = await getProjectByIdQuery(useCaseId, organizationId);
  if (!useCase) return null;

  const row = useCase as unknown as ProjectModel & { dataValues?: { owner_name?: string } };
  const [hasPendingApproval, approvalStatus] = await Promise.all([
    hasPendingApprovalQuery(useCaseId, "use_case", organizationId),
    getApprovalStatusQuery(useCaseId, "use_case", organizationId),
  ]);

  return {
    ...row.toJSON(),
    owner_name: row.dataValues?.owner_name,
    has_pending_approval: hasPendingApproval,
    approval_status: approvalStatus,
  };
}

const listUseCases: ToolDef = {
  name: "list_use_cases",
  title: "List use cases",
  description:
    "List an organization's AI use cases with their owner, status, risk classification, attached frameworks and members. A use case is the unit governance hangs off: risks, controls and assessments all belong to one.",
  inputSchema: { organizationId: organizationIdArg },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);
    // role "SuperAdmin" lifts the project-membership filter the query applies
    // to everyone else, so this returns the organization's whole portfolio.
    const useCases = await getAllProjectsQuery(
      { userId: caller.userId, role: "SuperAdmin" },
      args.organizationId,
    );

    return result({
      organizationId: args.organizationId,
      count: useCases.length,
      useCases,
    });
  },
};

const getUseCase: ToolDef = {
  name: "get_use_case",
  title: "Get use case",
  description:
    "Read one use case in full, with its owner name, attached frameworks, members, whether it is awaiting approval, and a count of its risks grouped by auto-calculated risk level.",
  inputSchema: {
    organizationId: organizationIdArg,
    useCaseId: z.number().int().positive().describe("Id of the use case to read."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const useCase = await readUseCase(args.useCaseId, args.organizationId);
    if (!useCase) {
      throw new Error(
        `No use case with id ${args.useCaseId} in organization ${args.organizationId}.`,
      );
    }

    const risks = await calculateProjectRisks(args.useCaseId, args.organizationId);

    return result({ useCase, risksByLevel: risks });
  },
};

const createUseCase: ToolDef = {
  name: "create_use_case",
  title: "Create use case",
  description:
    "Create an AI use case in an organization and instantiate the compliance frameworks chosen for it. The owner must be an existing user of that organization, and is notified that the use case is theirs. Approval workflows cannot be attached here — do that in the console.",
  inputSchema: {
    organizationId: organizationIdArg,
    title: z.string().min(1).max(255).describe("Name of the use case."),
    owner: z
      .number()
      .int()
      .positive()
      .describe("User id of the owner. Must be a user of this organization."),
    goal: z.string().min(1).describe("What the use case is meant to achieve."),
    startDate: z
      .string()
      .describe("Date the use case starts, as an ISO date (for example 2026-10-21)."),
    geography: geographyArg,
    targetIndustry: z.string().min(1).optional().describe("Industry the use case serves."),
    description: z.string().optional().describe("Longer description of the use case."),
    aiRiskClassification: z
      .enum(Object.values(AiRiskClassification) as [string, ...string[]])
      .optional()
      .describe("EU AI Act risk classification."),
    highRiskRoles: z
      .array(z.enum(Object.values(HighRiskRole) as [string, ...string[]]))
      .optional()
      .describe("EU AI Act roles the organization holds for this use case."),
    status: z
      .enum(Object.values(ProjectStatus) as [string, ...string[]])
      .optional()
      .describe('Lifecycle status. Defaults to "Not started".'),
    frameworks: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Names of the compliance frameworks to attach, as list_frameworks reports them. All must have the same scope: a use case is either organization-wide or use-case scoped, never both.",
      ),
    useCaseCategory: z
      .string()
      .max(64)
      .optional()
      .describe('What kind of AI it is, for example "Generative AI" or "Computer Vision".'),
    useCasePurpose: z.string().optional().describe("What the system is used for."),
    useCaseAudience: z.string().optional().describe("Who it affects or is used by."),
    deploymentContext: z.string().optional().describe("Where and how it is deployed."),
    members: z
      .array(z.number().int().positive())
      .optional()
      .describe("User ids to add as members. Must be users of this organization."),
  },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);

    // Resolved before the write: a use case whose scope disagrees with its
    // frameworks is refused by the insert, and that scope is not something the
    // caller should have to know to state.
    const frameworkChoice = await resolveUseCaseFrameworks(args.frameworks ?? []);

    const transaction = await sequelize.transaction();
    let created: ProjectModel;
    let frameworksCreated: string[];
    try {
      const { useCase, frameworks } = await createUseCaseService(
        {
          project_title: args.title,
          owner: args.owner,
          goal: args.goal,
          start_date: new Date(args.startDate),
          geography: GEOGRAPHIES[args.geography as keyof typeof GEOGRAPHIES],
          target_industry: args.targetIndustry,
          description: args.description,
          ai_risk_classification: args.aiRiskClassification,
          high_risk_roles: args.highRiskRoles,
          status: args.status,
          use_case_category: args.useCaseCategory,
          use_case_purpose: args.useCasePurpose,
          use_case_audience: args.useCaseAudience,
          deployment_context: args.deploymentContext,
          members: args.members ?? [],
          framework: frameworkChoice.ids,
          is_organizational: frameworkChoice.isOrganizational,
          enable_ai_data_insertion: false,
        },
        { userId: caller.userId, organizationId: args.organizationId },
        transaction,
      );
      await transaction.commit();
      created = useCase;
      frameworksCreated = Object.keys(frameworks);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await notifyOwnerAssigned(created, caller.userId, args.organizationId);

    return result({
      useCase: created.toJSON(),
      frameworksAttached: args.frameworks ?? [],
      // Only the four core frameworks build out controls and assessments. The
      // rest are recorded against the use case and tracked through their own
      // structures, which is also how the console treats them.
      frameworksWithStructures: frameworksCreated,
    });
  },
};

const updateUseCase: ToolDef = {
  name: "update_use_case",
  title: "Update use case",
  description:
    "Change a use case's details, owner, status, risk classification or member list. Only the fields you send are changed. A new owner is notified. Frameworks and approval workflows cannot be changed here — do that in the console.",
  inputSchema: {
    organizationId: organizationIdArg,
    useCaseId: z.number().int().positive().describe("Id of the use case to update."),
    title: z.string().min(1).max(255).optional().describe("New name."),
    owner: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("New owner's user id. Must be a user of this organization."),
    goal: z.string().min(1).optional().describe("New goal."),
    targetIndustry: z.string().min(1).optional().describe("New industry."),
    description: z.string().optional().describe("New description."),
    geography: geographyArg.optional(),
    aiRiskClassification: z
      .enum(Object.values(AiRiskClassification) as [string, ...string[]])
      .optional()
      .describe("New EU AI Act risk classification."),
    highRiskRoles: z
      .array(z.enum(Object.values(HighRiskRole) as [string, ...string[]]))
      .optional()
      .describe("Replacement list of EU AI Act roles."),
    status: z
      .enum(Object.values(ProjectStatus) as [string, ...string[]])
      .optional()
      .describe("New lifecycle status."),
    startDate: z.string().optional().describe("New start date, as an ISO date."),
    useCaseCategory: z.string().max(64).optional().describe("New AI category."),
    useCasePurpose: z.string().optional().describe("New purpose."),
    useCaseAudience: z.string().optional().describe("New audience."),
    deploymentContext: z.string().optional().describe("New deployment context."),
    members: z
      .array(z.number().int().positive())
      .optional()
      .describe(
        "Replacement member list — this is the full list, not an addition. Omit to leave members alone; send an empty list to remove them all.",
      ),
  },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);

    const existing = await getProjectByIdQuery(args.useCaseId, args.organizationId);
    if (!existing) {
      throw new Error(
        `No use case with id ${args.useCaseId} in organization ${args.organizationId}.`,
      );
    }

    // Only the fields actually sent are forwarded: the update query leaves an
    // absent column alone, so an undefined here means "unchanged" rather than
    // "clear it".
    const input: Record<string, unknown> = {};
    if (args.title !== undefined) input.project_title = args.title;
    if (args.owner !== undefined) input.owner = args.owner;
    if (args.goal !== undefined) input.goal = args.goal;
    if (args.targetIndustry !== undefined) input.target_industry = args.targetIndustry;
    if (args.description !== undefined) input.description = args.description;
    if (args.geography !== undefined) {
      input.geography = GEOGRAPHIES[args.geography as keyof typeof GEOGRAPHIES];
    }
    if (args.aiRiskClassification !== undefined) {
      input.ai_risk_classification = args.aiRiskClassification;
    }
    if (args.highRiskRoles !== undefined) input.high_risk_roles = args.highRiskRoles;
    if (args.status !== undefined) input.status = args.status;
    if (args.startDate !== undefined) input.start_date = new Date(args.startDate);
    if (args.useCaseCategory !== undefined) input.use_case_category = args.useCaseCategory;
    if (args.useCasePurpose !== undefined) input.use_case_purpose = args.useCasePurpose;
    if (args.useCaseAudience !== undefined) input.use_case_audience = args.useCaseAudience;
    if (args.deploymentContext !== undefined) input.deployment_context = args.deploymentContext;
    if (args.members !== undefined) input.members = args.members;

    if (Object.keys(input).length === 0) {
      throw new Error("Provide at least one field to update.");
    }
    input.last_updated = new Date();
    input.last_updated_by = caller.userId;

    const transaction = await sequelize.transaction();
    try {
      const { useCase } = await updateUseCaseService(
        args.useCaseId,
        input,
        existing,
        { userId: caller.userId, organizationId: args.organizationId },
        transaction,
      );
      // The rollback is left to the catch below, so the transaction is only
      // ever finished once.
      if (!useCase) {
        throw new Error(`Use case ${args.useCaseId} was deleted while it was being updated.`);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Re-read so the answer has the same shape as get_use_case and
    // create_use_case: the update query hands back raw column values.
    const updated = await readUseCase(args.useCaseId, args.organizationId);
    if (!updated) {
      return result({
        useCaseId: args.useCaseId,
        updated: true,
        note: "The update was applied, but the use case has since been deleted.",
      });
    }

    if (args.owner !== undefined && args.owner !== existing.owner) {
      await notifyOwnerAssigned(
        {
          id: args.useCaseId,
          project_title: String(updated.project_title),
          owner: args.owner,
          description: updated.description as string | undefined,
        },
        caller.userId,
        args.organizationId,
      );
    }

    return result({ useCase: updated });
  },
};

export const useCaseTools: ToolDef[] = [listUseCases, getUseCase, createUseCase, updateUseCase];
