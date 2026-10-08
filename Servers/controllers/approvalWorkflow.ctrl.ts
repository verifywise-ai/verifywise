/**
 * @fileoverview Approval Workflow Controller
 *
 * Handles CRUD operations for approval workflow management.
 * Admin-only operations for creating, updating, and managing workflow templates.
 *
 * @module controllers/approvalWorkflow
 */

import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import {
  getAllApprovalWorkflowsQuery,
  getApprovalWorkflowByIdQuery,
  createApprovalWorkflowQuery,
  updateApprovalWorkflowQuery,
  deleteApprovalWorkflowQuery,
} from "../utils/approvalWorkflow.utils";
import { doesUserBelongsToOrganizationQuery } from "../utils/user.utils";
import {
  EntityType,
  AUTO_APPROVABLE_RISK_RANKS,
} from "../domain.layer/enums/approval-workflow.enum";

import { translateError } from "../utils/i18n.utils";

/**
 * Validate the risk-based auto-approval threshold against the explicit
 * ordering in AUTO_APPROVABLE_RISK_RANKS. GPAI / General Risk / unknown
 * values are rejected; the threshold only makes sense for use_case workflows.
 * Returns an error message, or null when the value is absent/valid.
 */
function validateAutoApproveMaxRisk(
  autoApproveMaxRisk: unknown,
  entityType: EntityType,
  t: (key: string, options?: any) => string,
): string | null {
  if (autoApproveMaxRisk === undefined || autoApproveMaxRisk === null) {
    return null;
  }
  if (
    typeof autoApproveMaxRisk !== "string" ||
    !(autoApproveMaxRisk in AUTO_APPROVABLE_RISK_RANKS)
  ) {
    return t(
      "auto_approve_max_risk must be one of: Minimal risk, Limited risk, High risk, Prohibited",
    );
  }
  if (entityType !== EntityType.USE_CASE) {
    return t("auto_approve_max_risk is only supported for use_case workflows");
  }
  return null;
}

/**
 * Validate per-step SLA / escalation fields. Returns an error message, or
 * null when all steps are valid.
 */
async function validateStepSlaAndEscalation(
  steps: any[],
  organizationId: number,
  t: (key: string, options?: any) => string,
): Promise<string | null> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.sla_hours !== undefined && step.sla_hours !== null) {
      if (!Number.isInteger(step.sla_hours) || step.sla_hours <= 0) {
        return t("Step {n} sla_hours must be a positive integer", { n: i + 1 });
      }
    }
    if (step.escalation_user_id !== undefined && step.escalation_user_id !== null) {
      const { belongs } = await doesUserBelongsToOrganizationQuery(
        step.escalation_user_id,
        organizationId,
      );
      if (!belongs) {
        return t("Step {n} escalation user does not exist in this organization", {
          n: i + 1,
        });
      }
    }
  }
  return null;
}
/**
 * Get all approval workflows
 * @route GET /api/approval-workflows
 * @access Admin only
 */
export async function getAllApprovalWorkflows(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "fetching all approval workflows",
    "getAllApprovalWorkflows",
    "approvalWorkflow.ctrl.ts",
  );

  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const workflows = await getAllApprovalWorkflowsQuery(organizationId);

    logStructured(
      "successful",
      `fetched ${workflows.length} workflows`,
      "getAllApprovalWorkflows",
      "approvalWorkflow.ctrl.ts",
    );

    return res.status(200).json(STATUS_CODE[200](workflows));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch workflows",
      "getAllApprovalWorkflows",
      "approvalWorkflow.ctrl.ts",
    );
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get approval workflow by ID
 * @route GET /api/approval-workflows/:id
 * @access Admin only
 */
export async function getApprovalWorkflowById(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "fetching approval workflow by ID",
    "getApprovalWorkflowById",
    "approvalWorkflow.ctrl.ts",
  );

  try {
    const { organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid workflow ID")));
    }

    const workflow = await getApprovalWorkflowByIdQuery(workflowId, organizationId);

    if (!workflow) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Workflow not found")));
    }

    logStructured(
      "successful",
      `fetched workflow ${workflowId}`,
      "getApprovalWorkflowById",
      "approvalWorkflow.ctrl.ts",
    );

    return res.status(200).json(STATUS_CODE[200](workflow.toJSON()));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch workflow",
      "getApprovalWorkflowById",
      "approvalWorkflow.ctrl.ts",
    );
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create new approval workflow
 * @route POST /api/approval-workflows
 * @access Admin only
 */
export async function createApprovalWorkflow(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "creating approval workflow",
    "createApprovalWorkflow",
    "approvalWorkflow.ctrl.ts",
  );

  try {
    const { userId, organizationId } = req;
    const { workflow_title, entity_type, description, auto_approve_max_risk, steps } = req.body;

    if (!userId || !organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    // Validation
    if (!workflow_title?.trim()) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Workflow title is required")));
    }

    if (!entity_type || !Object.values(EntityType).includes(entity_type)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Valid entity type is required")));
    }

    const autoApproveError = validateAutoApproveMaxRisk(auto_approve_max_risk, entity_type, req.t!);
    if (autoApproveError) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](autoApproveError));
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("At least one step is required")));
    }

    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.step_name?.trim()) {
        await transaction.rollback();
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Step {n} name is required", { n: i + 1 })));
      }
      if (!step.approver_ids || step.approver_ids.length === 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Step {n} must have at least one approver", { n: i + 1 })));
      }
      if (step.requires_all_approvers === undefined || step.requires_all_approvers === null) {
        await transaction.rollback();
        return res
          .status(400)
          .json(
            STATUS_CODE[400](
              req.t!("Step {n} must have requires_all_approvers field", { n: i + 1 }),
            ),
          );
      }
    }

    const stepConfigError = await validateStepSlaAndEscalation(steps, organizationId, req.t!);
    if (stepConfigError) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](stepConfigError));
    }

    const workflow = await createApprovalWorkflowQuery(
      {
        workflow_title,
        entity_type,
        description,
        auto_approve_max_risk: auto_approve_max_risk ?? null,
        created_by: userId,
        steps,
      },
      organizationId,
      transaction,
    );

    await transaction.commit();

    logStructured(
      "successful",
      `created workflow ${workflow.id}`,
      "createApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );

    return res.status(201).json(STATUS_CODE[201](workflow.toJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to create workflow",
      "createApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update approval workflow
 * @route PUT /api/approval-workflows/:id
 * @access Admin only
 */
export async function updateApprovalWorkflow(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "updating approval workflow",
    "updateApprovalWorkflow",
    "approvalWorkflow.ctrl.ts",
  );

  try {
    const { organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { workflow_title, description, auto_approve_max_risk, steps } = req.body;

    if (!organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid workflow ID")));
    }

    // The threshold is validated against the stored entity_type (updates
    // cannot change it), so load the workflow when the key is present.
    if (auto_approve_max_risk !== undefined) {
      const existingWorkflow = await getApprovalWorkflowByIdQuery(
        workflowId,
        organizationId,
        transaction,
      );
      if (!existingWorkflow) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](req.t!("Workflow not found")));
      }
      const autoApproveError = validateAutoApproveMaxRisk(
        auto_approve_max_risk,
        existingWorkflow.entity_type,
        req.t!,
      );
      if (autoApproveError) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](autoApproveError));
      }
    }

    // Validate steps if provided
    if (steps && Array.isArray(steps)) {
      if (steps.length === 0) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("At least one step is required")));
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.step_name?.trim()) {
          await transaction.rollback();
          return res
            .status(400)
            .json(STATUS_CODE[400](req.t!("Step {n} name is required", { n: i + 1 })));
        }
        if (!step.approver_ids || step.approver_ids.length === 0) {
          await transaction.rollback();
          return res
            .status(400)
            .json(
              STATUS_CODE[400](req.t!("Step {n} must have at least one approver", { n: i + 1 })),
            );
        }
      }

      const stepConfigError = await validateStepSlaAndEscalation(steps, organizationId, req.t!);
      if (stepConfigError) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](stepConfigError));
      }
    }

    const workflow = await updateApprovalWorkflowQuery(
      workflowId,
      { workflow_title, description, auto_approve_max_risk, steps },
      organizationId,
      transaction,
    );

    await transaction.commit();

    if (!workflow) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Workflow not found")));
    }

    logStructured(
      "successful",
      `updated workflow ${workflowId}`,
      "updateApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );

    return res.status(200).json(STATUS_CODE[200](workflow.toJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to update workflow",
      "updateApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete approval workflow
 * @route DELETE /api/approval-workflows/:id
 * @access Admin only
 */
export async function deleteApprovalWorkflow(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "deleting approval workflow",
    "deleteApprovalWorkflow",
    "approvalWorkflow.ctrl.ts",
  );

  try {
    const { organizationId } = req;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid workflow ID")));
    }

    await deleteApprovalWorkflowQuery(workflowId, organizationId, transaction);

    await transaction.commit();

    logStructured(
      "successful",
      `deleted workflow ${workflowId}`,
      "deleteApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: req.t!("Workflow deleted successfully") }));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to delete workflow",
      "deleteApprovalWorkflow",
      "approvalWorkflow.ctrl.ts",
    );
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
