/**
 * Post-approval executor for `agent_create_risk`.
 *
 * Called by the generic `executeAiAction` dispatcher in
 * `aiActions/executor.ts` once an approval for this tool reaches the
 * approved state. Runs inside the same transaction as the approval state
 * change, so any failure rolls the entire approval back.
 *
 * The risk creation itself is delegated to `createRiskService` so the
 * UI-driven controller path and the AI-driven executor path stay behind
 * the same validated insert + change-history pipeline.
 *
 * After the risk is created, three side effects run:
 *   1. A review task is auto-created and assigned to the risk owner.
 *   2. The risk owner is notified via in-app + email.
 *   3. Each linked project's owner is notified (if different from the
 *      risk owner).
 *
 * All side effects run inside the same transaction. The notification
 * DB rows commit atomically with the risk; the Redis publish (for
 * real-time delivery) is external but idempotent — a phantom notification
 * pointing to a rolled-back entity is harmless.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { createRiskService } from "../../../services/risk.service";
import { createNewTaskQuery } from "../../../utils/task.utils";
import { calculateRiskLevel } from "../../../utils/validations/riskValidation.utils";
import { sendInAppNotification } from "../../../services/inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import { TaskPriority } from "../../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../../domain.layer/enums/task-status.enum";
import logger from "../../../utils/logger/fileLogger";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentCreateRiskInput } from "./schema";

const DEFAULT_SEVERITY = "Negligible" as const;
const DEFAULT_LIKELIHOOD = "Rare" as const;

/**
 * Map risk severity to task priority. Higher severity = higher priority
 * on the review task so it surfaces at the top of the task list.
 */
function severityToPriority(severity: string): TaskPriority {
  switch (severity) {
    case "Catastrophic":
    case "Major":
      return TaskPriority.HIGH;
    case "Moderate":
      return TaskPriority.MEDIUM;
    case "Minor":
    case "Negligible":
    default:
      return TaskPriority.LOW;
  }
}

/**
 * Map risk severity to review deadline (days from now). Higher severity =
 * shorter deadline so critical risks get reviewed first.
 */
function severityToDeadlineDays(severity: string): number {
  switch (severity) {
    case "Catastrophic":
      return 2;
    case "Major":
      return 7;
    case "Moderate":
      return 14;
    case "Minor":
      return 30;
    case "Negligible":
    default:
      return 60;
  }
}

/**
 * Get a user's display name from the DB. Returns "AI Advisor" if the
 * user isn't found (shouldn't happen, but defensive).
 */
async function getUserDisplayName(userId: number): Promise<string> {
  const rows = (await sequelize.query(`SELECT name, surname FROM users WHERE id = :userId`, {
    replacements: { userId },
    type: QueryTypes.SELECT,
  })) as Array<{ name: string; surname: string }>;
  const user = rows[0];
  return user ? `${user.name} ${user.surname}`.trim() : "AI Advisor";
}

/**
 * Get the owner user id for each given project id. Returns a deduplicated
 * set of owner ids (excluding nulls).
 */
async function getProjectOwnerIds(projectIds: number[], organizationId: number): Promise<number[]> {
  if (projectIds.length === 0) return [];

  const rows = (await sequelize.query(
    `SELECT DISTINCT owner FROM projects
     WHERE id IN (:projectIds) AND organization_id = :organizationId AND owner IS NOT NULL`,
    {
      replacements: { projectIds, organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ owner: number }>;

  return rows.map((r) => r.owner);
}

export async function executeCreateRisk(
  ctx: AiActionExecuteContext<AgentCreateRiskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const severity = input.severity ?? DEFAULT_SEVERITY;
  const likelihood = input.likelihood ?? DEFAULT_LIKELIHOOD;
  const riskLevelAutocalculated = calculateRiskLevel(severity, likelihood);
  const riskOwner = input.risk_owner ?? ctx.requesterId;

  // ═══════════════════════════════════════════════════════
  // 1. Create the risk
  // ═══════════════════════════════════════════════════════

  const newRisk = await createRiskService(
    {
      risk_name: input.risk_name,
      risk_description: input.risk_description,
      ai_lifecycle_phase: input.ai_lifecycle_phase,
      risk_category: input.risk_category,
      impact: input.impact,
      severity,
      likelihood,
      risk_level_autocalculated: riskLevelAutocalculated as
        | "No risk"
        | "Very low risk"
        | "Low risk"
        | "Medium risk"
        | "High risk"
        | "Very high risk",
      review_notes: input.review_notes,
      risk_owner: riskOwner,
      projects: input.project_ids ?? [],
      frameworks: input.framework_ids ?? [],
      mitigation_status: input.mitigation_status,
      mitigation_plan: input.mitigation_plan,
      current_risk_level: input.current_risk_level,
      implementation_strategy: input.implementation_strategy,
      deadline: new Date(input.deadline),
      risk_approval: input.approver,
      approval_status: input.approval_status,
      date_of_assessment: new Date(input.date_of_assessment),
    },
    {
      userId: ctx.requesterId,
      organizationId: ctx.organizationId,
    },
    ctx.transaction,
  );

  if (newRisk.id == null) {
    throw new Error(
      "createRiskService returned a risk without an id — refusing to record an empty execution result.",
    );
  }

  // ═══════════════════════════════════════════════════════
  // 2. Auto-create a review task for the risk owner
  // ═══════════════════════════════════════════════════════

  const deadlineDays = severityToDeadlineDays(severity);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + deadlineDays);

  try {
    await createNewTaskQuery(
      {
        title: `Review: ${input.risk_name}`,
        description:
          `Auto-created by AI Advisor. A new ${severity} risk "${input.risk_name}" requires review. ` +
          `Please validate the risk assessment, verify the mitigation plan, and confirm the risk level.`,
        creator_id: ctx.requesterId,
        due_date: dueDate,
        priority: severityToPriority(severity),
        status: TaskStatus.OPEN,
        categories: ["risk-review", "ai-created"],
      },
      ctx.organizationId,
      ctx.transaction,
      [{ user_id: riskOwner }],
    );
  } catch (taskError) {
    // Task creation is a side effect — log but don't fail the risk creation.
    logger.error(
      `[agent_create_risk] failed to auto-create review task for risk #${newRisk.id}:`,
      taskError,
    );
  }

  // ═══════════════════════════════════════════════════════
  // 3. Notify the risk owner
  // ═══════════════════════════════════════════════════════

  try {
    const requesterName = await getUserDisplayName(ctx.requesterId);

    await sendInAppNotification(ctx.organizationId, {
      user_id: riskOwner,
      type: NotificationType.ASSIGNMENT_OWNER,
      title: "New risk assigned to you",
      message:
        `${requesterName} created a ${severity} risk "${input.risk_name}" via AI Advisor and assigned you as the owner. ` +
        `Review deadline: ${dueDate.toISOString().slice(0, 10)}.`,
      entity_type: NotificationEntityType.RISK,
      entity_id: newRisk.id!,
      entity_name: input.risk_name,
      action_url: `/risk-management?riskId=${newRisk.id}`,
    });
  } catch (notifyError) {
    logger.error(
      `[agent_create_risk] failed to notify risk owner for risk #${newRisk.id}:`,
      notifyError,
    );
  }

  // ═══════════════════════════════════════════════════════
  // 4. Notify project owner(s) — if the risk is linked to projects
  //    and the project owner is not the same as the risk owner
  // ═══════════════════════════════════════════════════════

  try {
    const projectIds = input.project_ids ?? [];
    if (projectIds.length > 0) {
      const projectOwnerIds = await getProjectOwnerIds(projectIds, ctx.organizationId);

      for (const ownerId of projectOwnerIds) {
        // Skip if the project owner IS the risk owner — they already got notified above.
        if (ownerId === riskOwner) continue;

        await sendInAppNotification(ctx.organizationId, {
          user_id: ownerId,
          type: NotificationType.SYSTEM,
          title: "New risk added to your project",
          message:
            `A ${severity} risk "${input.risk_name}" was created via AI Advisor and linked to your project. ` +
            `Risk owner has been assigned and a review task has been created.`,
          entity_type: NotificationEntityType.RISK,
          entity_id: newRisk.id!,
          entity_name: input.risk_name,
          action_url: `/risk-management?riskId=${newRisk.id}`,
        });
      }
    }
  } catch (notifyError) {
    logger.error(
      `[agent_create_risk] failed to notify project owners for risk #${newRisk.id}:`,
      notifyError,
    );
  }

  return { entityId: newRisk.id };
}
