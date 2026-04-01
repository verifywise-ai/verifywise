import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ApprovalWorkflowModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflow.model";
import { ApprovalWorkflowStepModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import { ApprovalStepApproversModel } from "../domain.layer/models/approvalWorkflow/approvalStepApprovers.model";
import { EntityType } from "../domain.layer/enums/approval-workflow.enum";

/**
 * Get all approval workflows for an organization
 */
export const getAllApprovalWorkflowsQuery = async (
  organizationId: number,
  transaction: Transaction | null = null
): Promise<ApprovalWorkflowModel[]> => {
  const workflows = await sequelize.query(
    `SELECT * FROM approval_workflows WHERE organization_id = :organizationId AND is_active = true ORDER BY created_at DESC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ApprovalWorkflowModel,
      ...(transaction && { transaction }),
    }
  );

  // Load steps for each workflow
  for (const workflow of workflows) {
    const steps = await getWorkflowStepsQuery(workflow.id!, organizationId, transaction);
    workflow.setDataValue('steps', steps);
  }

  return workflows;
};

/**
 * Get approval workflow by ID
 */
export const getApprovalWorkflowByIdQuery = async (
  workflowId: number,
  organizationId: number,
  transaction: Transaction | null = null
): Promise<ApprovalWorkflowModel | null> => {
  const workflows = await sequelize.query(
    `SELECT * FROM approval_workflows WHERE organization_id = :organizationId AND id = :workflowId`,
    {
      replacements: { organizationId, workflowId },
      mapToModel: true,
      model: ApprovalWorkflowModel,
      ...(transaction && { transaction }),
    }
  );

  if (!workflows || workflows.length === 0) {
    return null;
  }

  const workflow = workflows[0];

  // Load steps
  const steps = await getWorkflowStepsQuery(workflowId, organizationId, transaction);

  // Set steps on workflow instance
  workflow.setDataValue('steps', steps);

  return workflow;
};

/**
 * Get workflow steps with approvers
 */
export const getWorkflowStepsQuery = async (
  workflowId: number,
  organizationId: number,
  transaction: Transaction | null = null
): Promise<ApprovalWorkflowStepModel[]> => {
  const steps = await sequelize.query(
    `SELECT * FROM approval_workflow_steps
     WHERE organization_id = :organizationId
       AND workflow_id = :workflowId
     ORDER BY step_number ASC`,
    {
      replacements: { organizationId, workflowId },
      mapToModel: true,
      model: ApprovalWorkflowStepModel,
      ...(transaction && { transaction }),
    }
  );

  // Load approvers for each step
  for (const step of steps) {
    const approvers = await sequelize.query(
      `SELECT * FROM approval_step_approvers WHERE organization_id = :organizationId AND workflow_step_id = :stepId`,
      {
        replacements: { organizationId, stepId: step.id },
        mapToModel: true,
        model: ApprovalStepApproversModel,
        ...(transaction && { transaction }),
      }
    );
    step.setDataValue('approvers', approvers);
  }

  return steps;
};

/**
 * Create new approval workflow
 */
export const createApprovalWorkflowQuery = async (
  workflowData: {
    workflow_title: string;
    entity_type: EntityType;
    description?: string;
    created_by: number;
    steps: Array<{
      step_name: string;
      description?: string;
      approver_ids: number[];
      requires_all_approvers: boolean;
    }>;
  },
  organizationId: number,
  transaction: Transaction
): Promise<ApprovalWorkflowModel> => {
  // Create workflow
  const [workflow] = await sequelize.query(
    `INSERT INTO approval_workflows
     (organization_id, workflow_title, entity_type, description, created_by, is_active, created_at, updated_at)
     VALUES (:organizationId, :workflow_title, :entity_type, :description, :created_by, true, NOW(), NOW())
     RETURNING *`,
    {
      replacements: {
        organizationId,
        workflow_title: workflowData.workflow_title,
        entity_type: workflowData.entity_type,
        description: workflowData.description || null,
        created_by: workflowData.created_by,
      },
      mapToModel: true,
      model: ApprovalWorkflowModel,
      transaction,
    }
  );

  // Create steps
  for (let i = 0; i < workflowData.steps.length; i++) {
    const stepData = workflowData.steps[i];

    const [step] = await sequelize.query(
      `INSERT INTO approval_workflow_steps
       (organization_id, workflow_id, step_number, step_name, description, requires_all_approvers, created_at)
       VALUES (:organizationId, :workflow_id, :step_number, :step_name, :description, :requires_all_approvers, NOW())
       RETURNING *`,
      {
        replacements: {
          organizationId,
          workflow_id: (workflow as any).id,
          step_number: i + 1,
          step_name: stepData.step_name,
          description: stepData.description || null,
          requires_all_approvers: stepData.requires_all_approvers,
        },
        mapToModel: true,
        model: ApprovalWorkflowStepModel,
        transaction,
      }
    );

    // Create approvers for this step
    for (const approverId of stepData.approver_ids) {
      await sequelize.query(
        `INSERT INTO approval_step_approvers
         (organization_id, workflow_step_id, approver_id, created_at)
         VALUES (:organizationId, :workflow_step_id, :approver_id, NOW())`,
        {
          replacements: {
            organizationId,
            workflow_step_id: (step as any).id,
            approver_id: approverId,
          },
          transaction,
        }
      );
    }
  }

  // Fetch and return the complete workflow with steps
  const createdWorkflow = await getApprovalWorkflowByIdQuery((workflow as any).id, organizationId, transaction);

  if (!createdWorkflow) {
    throw new Error("Failed to retrieve created workflow");
  }

  return createdWorkflow;
};

/**
 * Update approval workflow
 */
export const updateApprovalWorkflowQuery = async (
  workflowId: number,
  workflowData: {
    workflow_title?: string;
    description?: string;
    steps?: Array<{
      step_name: string;
      description?: string;
      approver_ids: number[];
      requires_all_approvers: boolean;
    }>;
  },
  organizationId: number,
  transaction: Transaction
): Promise<ApprovalWorkflowModel | null> => {
  // Update workflow
  await sequelize.query(
    `UPDATE approval_workflows
     SET workflow_title = COALESCE(:workflow_title, workflow_title),
         description = COALESCE(:description, description),
         updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :workflowId`,
    {
      replacements: {
        organizationId,
        workflowId,
        workflow_title: workflowData.workflow_title || null,
        description: workflowData.description || null,
      },
      transaction,
    }
  );

  // If steps are provided, delete old steps and create new ones
  if (workflowData.steps) {
    // Delete old approvers
    await sequelize.query(
      `DELETE FROM approval_step_approvers
       WHERE organization_id = :organizationId
         AND workflow_step_id IN (
           SELECT id FROM approval_workflow_steps WHERE organization_id = :organizationId AND workflow_id = :workflowId
         )`,
      {
        replacements: { organizationId, workflowId },
        transaction,
      }
    );

    // Delete old steps
    await sequelize.query(
      `DELETE FROM approval_workflow_steps WHERE organization_id = :organizationId AND workflow_id = :workflowId`,
      {
        replacements: { organizationId, workflowId },
        transaction,
      }
    );

    // Create new steps
    for (let i = 0; i < workflowData.steps.length; i++) {
      const stepData = workflowData.steps[i];

      const [step] = await sequelize.query(
        `INSERT INTO approval_workflow_steps
         (organization_id, workflow_id, step_number, step_name, description, requires_all_approvers, created_at)
         VALUES (:organizationId, :workflow_id, :step_number, :step_name, :description, :requires_all_approvers, NOW())
         RETURNING *`,
        {
          replacements: {
            organizationId,
            workflow_id: workflowId,
            step_number: i + 1,
            step_name: stepData.step_name,
            description: stepData.description || null,
            requires_all_approvers: stepData.requires_all_approvers,
          },
          mapToModel: true,
          model: ApprovalWorkflowStepModel,
          transaction,
        }
      );

      // Create approvers for this step
      for (const approverId of stepData.approver_ids) {
        await sequelize.query(
          `INSERT INTO approval_step_approvers
           (organization_id, workflow_step_id, approver_id, created_at)
           VALUES (:organizationId, :workflow_step_id, :approver_id, NOW())`,
          {
            replacements: {
              organizationId,
              workflow_step_id: (step as any).id,
              approver_id: approverId,
            },
            transaction,
          }
        );
      }
    }
  }

  return await getApprovalWorkflowByIdQuery(workflowId, organizationId, transaction);
};

/**
 * Delete (soft delete) approval workflow
 */
export const deleteApprovalWorkflowQuery = async (
  workflowId: number,
  organizationId: number,
  transaction: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE approval_workflows
     SET is_active = false, updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :workflowId`,
    {
      replacements: { organizationId, workflowId },
      transaction,
    }
  );
};
