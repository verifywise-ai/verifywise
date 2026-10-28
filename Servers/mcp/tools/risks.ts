/**
 * Risk tools.
 *
 * Writes call services/risk.service.ts — the same code the risk controllers and
 * the AI action executor call — so the FAIR validation, the derived-field
 * computation and the change-history write happen once, wherever the risk came
 * from.
 *
 * Every tool takes an organizationId: risks are scoped by organization_id and a
 * super admin belongs to no organization.
 *
 * The FAIR quantitative fields (event frequency, loss magnitudes, ALE, control
 * effectiveness) are deliberately not exposed. They are a set of fifteen
 * interdependent figures with min/likely/max ordering rules, and a partial set
 * is worse than none; get_risk reads back whatever the console has recorded.
 */

import { z } from "zod";
import { sequelize } from "../../database/db";
import {
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByProjectQuery,
  PROJECT_RISK_CATEGORIES,
} from "../../utils/risk.utils";
import { createRiskService, updateRiskService } from "../../services/risk.service";
import { calculateRiskLevel } from "../../utils/validations/riskValidation.utils";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { getUserByIdQuery } from "../../utils/user.utils";
import logger from "../../utils/logger/fileLogger";
import { requireOrganization } from "../scope";
import { resolveFrameworkIds } from "../frameworks";
import { result, type ToolDef } from "../tool";

const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"] as const;
const SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"] as const;
const MITIGATION_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
] as const;
const CURRENT_RISK_LEVELS = [
  "Very Low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
] as const;
const AI_LIFECYCLE_PHASES = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
] as const;

const organizationIdArg = z
  .number()
  .int()
  .positive()
  .describe("Id of the organization the risk belongs to.");

const likelihoodArg = z
  .enum(LIKELIHOODS)
  .describe("How likely the risk is to occur, before mitigation.");
const severityArg = z.enum(SEVERITIES).describe("How bad it is if the risk occurs.");

/**
 * Tell a risk's owner it is theirs, as the console does on create and on an
 * owner change.
 *
 * Fire-and-forget: the risk is already committed, and a notification that
 * cannot be delivered must not look like a failed write.
 */
async function notifyRiskOwnerAssigned(
  risk: { id?: number; risk_name: string; risk_owner?: number | null; risk_description?: string },
  actingUserId: number,
  organizationId: number,
): Promise<void> {
  if (!risk.risk_owner || !risk.id) return;
  try {
    const actor = await getUserByIdQuery(actingUserId);
    const assignerName = actor ? `${actor.name} ${actor.surname}`.trim() : "A super admin";
    await notifyUserAssigned(
      organizationId,
      risk.risk_owner,
      {
        entityType: "project_risk",
        entityId: risk.id,
        entityName: risk.risk_name,
        roleType: "Risk Owner",
        entityUrl: `/risk-management?riskId=${risk.id}`,
      },
      assignerName,
      process.env.FRONTEND_URL || "http://localhost:3000",
      { description: risk.risk_description },
    );
  } catch (error) {
    logger.error("Failed to notify the risk owner:", error);
  }
}

const listRisks: ToolDef = {
  name: "list_risks",
  title: "List risks",
  description:
    "List an organization's AI risks. Pass a useCaseId to list only the risks linked to that use case. Archived (deleted) risks are left out.",
  inputSchema: {
    organizationId: organizationIdArg,
    useCaseId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Restrict the listing to risks linked to this use case."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);

    const risks =
      args.useCaseId === undefined
        ? await getAllRisksQuery(args.organizationId, "active")
        : ((await getRisksByProjectQuery(args.useCaseId, args.organizationId, "active")) ?? []);

    return result({
      organizationId: args.organizationId,
      useCaseId: args.useCaseId,
      count: risks.length,
      risks,
    });
  },
};

const getRisk: ToolDef = {
  name: "get_risk",
  title: "Get risk",
  description:
    "Read one risk in full, including its mitigation plan, its owner, the use cases and frameworks it is linked to, and the controls and assessments it maps onto.",
  inputSchema: {
    organizationId: organizationIdArg,
    riskId: z.number().int().positive().describe("Id of the risk to read."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const risk = await getRiskByIdQuery(args.riskId, args.organizationId);
    if (!risk) {
      throw new Error(`No risk with id ${args.riskId} in organization ${args.organizationId}.`);
    }
    return result({ risk });
  },
};

const createRisk: ToolDef = {
  name: "create_risk",
  title: "Create risk",
  description:
    "Record an AI risk in an organization and link it to use cases and frameworks. The overall risk level is calculated from likelihood and severity — do not pass it. The risk owner must be an existing user of that organization, and is notified that the risk is theirs.",
  inputSchema: {
    organizationId: organizationIdArg,
    name: z.string().min(1).describe("Short name for the risk."),
    description: z.string().min(1).describe("What the risk is."),
    likelihood: likelihoodArg,
    severity: severityArg,
    riskOwner: z
      .number()
      .int()
      .positive()
      .describe("User id accountable for the risk. Must be a user of this organization."),
    categories: z
      .array(z.enum(PROJECT_RISK_CATEGORIES))
      .min(1)
      .describe("One or more risk categories."),
    aiLifecyclePhase: z.enum(AI_LIFECYCLE_PHASES).describe("Where in the AI lifecycle it arises."),
    impact: z.string().min(1).describe("What the impact would be."),
    useCaseIds: z
      .array(z.number().int().positive())
      .optional()
      .describe("Use cases this risk applies to."),
    frameworks: z
      .array(z.string().min(1))
      .optional()
      .describe("Names of the frameworks this risk is mapped to, as list_frameworks reports them."),
    mitigationStatus: z.enum(MITIGATION_STATUSES).optional().describe("Where mitigation stands."),
    mitigationPlan: z.string().optional().describe("How the risk will be mitigated."),
    currentRiskLevel: z
      .enum(CURRENT_RISK_LEVELS)
      .optional()
      .describe("The risk level as it stands today, accounting for mitigation so far."),
    deadline: z
      .string()
      .optional()
      .describe("Date mitigation is due, as an ISO date (for example 2026-12-31)."),
    reviewNotes: z.string().optional().describe("Notes from the assessment."),
  },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);

    const frameworkIds = await resolveFrameworkIds(args.frameworks ?? []);

    // Derived server-side from the same helper the AI action executor uses, so
    // the stored level can never disagree with the likelihood and severity
    // beside it.
    const riskLevel = calculateRiskLevel(args.severity, args.likelihood);

    const transaction = await sequelize.transaction();
    let risk;
    try {
      risk = await createRiskService(
        {
          risk_name: args.name,
          risk_description: args.description,
          risk_category: args.categories,
          ai_lifecycle_phase: args.aiLifecyclePhase,
          impact: args.impact,
          likelihood: args.likelihood,
          severity: args.severity,
          risk_level_autocalculated: riskLevel as
            | "No risk"
            | "Very low risk"
            | "Low risk"
            | "Medium risk"
            | "High risk"
            | "Very high risk",
          risk_owner: args.riskOwner,
          mitigation_status: args.mitigationStatus,
          mitigation_plan: args.mitigationPlan,
          current_risk_level: args.currentRiskLevel,
          deadline: args.deadline ? new Date(args.deadline) : undefined,
          review_notes: args.reviewNotes,
          projects: args.useCaseIds ?? [],
          frameworks: frameworkIds,
        },
        { userId: caller.userId, organizationId: args.organizationId },
        transaction,
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Same post-commit recompute the controller runs, so the risk's stored
    // links match its new mappings. Fire-and-forget: a failure here does not
    // undo the risk.
    enqueueRiskLinkRecompute(args.organizationId, risk.id!).catch((error) =>
      logger.error("Failed to enqueue risk link recompute:", error),
    );
    await notifyRiskOwnerAssigned(risk, caller.userId, args.organizationId);

    return result({ risk, riskLevelCalculated: riskLevel });
  },
};

const updateRisk: ToolDef = {
  name: "update_risk",
  title: "Update risk",
  description:
    "Change a risk's details, owner, mitigation plan or status. Only the fields you send are changed. Sending likelihood or severity recalculates the overall risk level, and a new owner is notified.",
  inputSchema: {
    organizationId: organizationIdArg,
    riskId: z.number().int().positive().describe("Id of the risk to update."),
    name: z.string().min(1).optional().describe("New name."),
    description: z.string().min(1).optional().describe("New description."),
    likelihood: likelihoodArg.optional(),
    severity: severityArg.optional(),
    riskOwner: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("New owner's user id. Must be a user of this organization."),
    categories: z
      .array(z.enum(PROJECT_RISK_CATEGORIES))
      .min(1)
      .optional()
      .describe("Replacement list of risk categories."),
    aiLifecyclePhase: z.enum(AI_LIFECYCLE_PHASES).optional().describe("New AI lifecycle phase."),
    impact: z.string().min(1).optional().describe("New impact."),
    mitigationStatus: z.enum(MITIGATION_STATUSES).optional().describe("New mitigation status."),
    mitigationPlan: z.string().optional().describe("New mitigation plan."),
    currentRiskLevel: z.enum(CURRENT_RISK_LEVELS).optional().describe("New current risk level."),
    deadline: z.string().optional().describe("New mitigation deadline, as an ISO date."),
    reviewNotes: z.string().optional().describe("New assessment notes."),
    useCaseIds: z
      .array(z.number().int().positive())
      .optional()
      .describe(
        "Replacement list of use cases this risk applies to — the full list, not an addition. Omit to leave the links alone.",
      ),
    frameworks: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Replacement list of framework names this risk is mapped to. Omit to leave the mappings alone.",
      ),
  },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);

    const existing = await getRiskByIdQuery(args.riskId, args.organizationId);
    if (!existing) {
      throw new Error(`No risk with id ${args.riskId} in organization ${args.organizationId}.`);
    }

    const input: Record<string, unknown> = {};
    if (args.name !== undefined) input.risk_name = args.name;
    if (args.description !== undefined) input.risk_description = args.description;
    if (args.likelihood !== undefined) input.likelihood = args.likelihood;
    if (args.severity !== undefined) input.severity = args.severity;
    if (args.riskOwner !== undefined) input.risk_owner = args.riskOwner;
    if (args.categories !== undefined) input.risk_category = args.categories;
    if (args.aiLifecyclePhase !== undefined) input.ai_lifecycle_phase = args.aiLifecyclePhase;
    if (args.impact !== undefined) input.impact = args.impact;
    if (args.mitigationStatus !== undefined) input.mitigation_status = args.mitigationStatus;
    if (args.mitigationPlan !== undefined) input.mitigation_plan = args.mitigationPlan;
    if (args.currentRiskLevel !== undefined) input.current_risk_level = args.currentRiskLevel;
    if (args.deadline !== undefined) input.deadline = new Date(args.deadline);
    if (args.reviewNotes !== undefined) input.review_notes = args.reviewNotes;

    if (
      Object.keys(input).length === 0 &&
      args.useCaseIds === undefined &&
      args.frameworks === undefined
    ) {
      throw new Error("Provide at least one field to update.");
    }

    // The stored level is derived, so a change to either input recalculates it
    // against whichever value is not being changed.
    let riskLevel: string | undefined;
    if (args.likelihood !== undefined || args.severity !== undefined) {
      riskLevel = calculateRiskLevel(
        args.severity ?? existing.severity,
        args.likelihood ?? existing.likelihood,
      );
      input.risk_level_autocalculated = riskLevel;
    }

    // Links are only rewritten when a list is sent. The update query leaves the
    // junctions alone for an empty list, which is what an omitted argument
    // becomes, so there is nothing to carry over here.
    if (args.useCaseIds !== undefined) input.projects = args.useCaseIds;
    if (args.frameworks !== undefined)
      input.frameworks = await resolveFrameworkIds(args.frameworks);

    const transaction = await sequelize.transaction();
    let risk;
    try {
      risk = await updateRiskService(
        args.riskId,
        input,
        existing,
        { userId: caller.userId, organizationId: args.organizationId },
        transaction,
      );
      if (!risk) {
        throw new Error(`Risk ${args.riskId} was deleted while it was being updated.`);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    enqueueRiskLinkRecompute(args.organizationId, args.riskId).catch((error) =>
      logger.error("Failed to enqueue risk link recompute:", error),
    );
    if (args.riskOwner !== undefined && args.riskOwner !== existing.risk_owner) {
      await notifyRiskOwnerAssigned(risk, caller.userId, args.organizationId);
    }

    return result(riskLevel ? { risk, riskLevelCalculated: riskLevel } : { risk });
  },
};

export const riskTools: ToolDef[] = [listRisks, getRisk, createRisk, updateRisk];
