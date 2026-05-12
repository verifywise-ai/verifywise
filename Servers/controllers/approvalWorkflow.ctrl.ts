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
import { EntityType } from "../domain.layer/enums/approval-workflow.enum";

import { translateError } from "../utils/i18n.utils";
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
    const { workflow_title, entity_type, description, steps } = req.body;

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

    const workflow = await createApprovalWorkflowQuery(
      {
        workflow_title,
        entity_type,
        description,
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
    const { workflow_title, description, steps } = req.body;

    if (!organizationId) {
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid workflow ID")));
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
    }

    const workflow = await updateApprovalWorkflowQuery(
      workflowId,
      { workflow_title, description, steps },
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
