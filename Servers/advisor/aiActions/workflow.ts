/**
 * Lazy per-tenant provisioning of the "AI Action Approval" workflow.
 *
 * Idempotent — creates the workflow on first call, returns the existing
 * one on subsequent calls. Every AI write tool's file() function must call
 * this before inserting an approval_request with entity_type='ai_action'.
 *
 * Approver policy (slice 1): all Admin users in the organization are
 * approvers on a single step with `requires_all_approvers = false` — any
 * Admin can approve (including the requester, if they are an Admin).
 * We'll revisit once tenants ask for custom AI approval policies.
 *
 * Moved from `Servers/advisor/ensureAiActionWorkflow.ts` during the
 * aiActions reorganization. No logic changes.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  createApprovalWorkflowQuery,
  getAllApprovalWorkflowsQuery,
} from "../../utils/approvalWorkflow.utils";
import { ApprovalWorkflowModel } from "../../domain.layer/models/approvalWorkflow/approvalWorkflow.model";
import { EntityType } from "../../domain.layer/enums/approval-workflow.enum";

const AI_ACTION_WORKFLOW_TITLE = "AI Action Approval";
const AI_ACTION_WORKFLOW_DESCRIPTION =
  "Automatically created workflow for approving AI-proposed write actions.";

async function findAiActionWorkflow(
  organizationId: number,
  transaction?: Transaction,
): Promise<ApprovalWorkflowModel | null> {
  const workflows = await getAllApprovalWorkflowsQuery(
    organizationId,
    transaction ?? null,
  );
  return (
    workflows.find(
      (w) => (w as unknown as { entity_type: string }).entity_type === EntityType.AI_ACTION,
    ) ?? null
  );
}

async function getAdminUserIds(
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT u.id
       FROM users u
       JOIN roles r ON u.role_id = r.id
      WHERE u.organization_id = :organizationId
        AND r.name = 'Admin'`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
      ...(transaction && { transaction }),
    },
  )) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}

/**
 * Return the AI Action workflow for this org, creating it if missing.
 *
 * @param requestedByUserId — used as `created_by` on first creation. The
 *   user need not be an Admin to trigger creation; they just need to be
 *   the first person to invoke an AI write tool for this tenant.
 */
export async function ensureAiActionWorkflow(
  organizationId: number,
  requestedByUserId: number,
  transaction: Transaction,
): Promise<ApprovalWorkflowModel> {
  const existing = await findAiActionWorkflow(organizationId, transaction);
  if (existing) {
    return existing;
  }

  const adminIds = await getAdminUserIds(organizationId, transaction);
  if (adminIds.length === 0) {
    throw new Error(
      "Cannot create AI Action workflow: no Admin users exist in this organization.",
    );
  }

  const workflow = await createApprovalWorkflowQuery(
    {
      workflow_title: AI_ACTION_WORKFLOW_TITLE,
      entity_type: EntityType.AI_ACTION,
      description: AI_ACTION_WORKFLOW_DESCRIPTION,
      created_by: requestedByUserId,
      steps: [
        {
          step_name: "Admin Review",
          description:
            "Any organization Admin can approve or reject the AI's proposed action.",
          approver_ids: adminIds,
          requires_all_approvers: false,
        },
      ],
    },
    organizationId,
    transaction,
  );

  return workflow;
}
