import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ApprovalRequestModel } from "../domain.layer/models/approvalWorkflow/approvalRequest.model";
import { ApprovalRequestStepModel } from "../domain.layer/models/approvalWorkflow/approvalRequestStep.model";
import { ApprovalWorkflowModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflow.model";
import { ApprovalWorkflowStepModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  ApprovalResult,
  EntityType,
  AUTO_APPROVABLE_RISK_RANKS,
} from "../domain.layer/enums/approval-workflow.enum";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { logStructured } from "./logger/fileLogger";
import { executeAiAction } from "../advisor/aiActions";

/**
 * Notification info to be sent after transaction commits
 */
export interface NotificationInfo {
  type: "step_approvers" | "requester_approved" | "requester_rejected";
  organizationId: number;
  requestId: number;
  requesterId?: number;
  requestName: string;
  stepNumber?: number;
  // Additional fields for step completion notifications to requester
  completedStep?: number;
  totalSteps?: number;
}

/**
 * Create approval request
 */
export const createApprovalRequestQuery = async (
  requestData: {
    request_name: string;
    workflow_id: number;
    entity_id?: number;
    entity_type?: string;
    entity_data?: any;
    status: string;
    requested_by: number;
  },
  workflowSteps: ApprovalWorkflowStepModel[],
  organizationId: number,
  transaction: Transaction,
): Promise<ApprovalRequestModel> => {
  // Create request
  const [request] = await sequelize.query(
    `INSERT INTO approval_requests
     (organization_id, request_name, workflow_id, entity_id, entity_type, entity_data, status, requested_by, current_step, created_at, updated_at)
     VALUES (:organizationId, :request_name, :workflow_id, :entity_id, :entity_type, :entity_data, :status, :requested_by, 1, NOW(), NOW())
     RETURNING *`,
    {
      replacements: {
        organizationId,
        request_name: requestData.request_name,
        workflow_id: requestData.workflow_id,
        entity_id: requestData.entity_id || null,
        entity_type: requestData.entity_type || null,
        entity_data: requestData.entity_data ? JSON.stringify(requestData.entity_data) : null,
        status: requestData.status,
        requested_by: requestData.requested_by,
      },
      mapToModel: true,
      model: ApprovalRequestModel,
      transaction,
    },
  );

  // Create request steps from workflow steps. sla_hours / escalation_user_id
  // are snapshotted from the template so later workflow edits don't disturb
  // in-flight requests; due_at is set only for the step that is active now.
  for (const workflowStep of workflowSteps) {
    const slaHours = (workflowStep as any).sla_hours ?? null;
    const isCurrentStep = workflowStep.step_number === 1;
    const [requestStep] = await sequelize.query(
      `INSERT INTO approval_request_steps
       (organization_id, request_id, step_number, step_name, status, sla_hours, escalation_user_id, due_at, date_assigned, created_at)
       VALUES (:organizationId, :request_id, :step_number, :step_name, :status, :sla_hours, :escalation_user_id,
               CASE WHEN :is_current_step AND :sla_hours IS NOT NULL
                    THEN NOW() + make_interval(hours => :sla_hours)
                    ELSE NULL END,
               NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          organizationId,
          request_id: (request as any).id,
          step_number: workflowStep.step_number,
          step_name: workflowStep.step_name,
          status: ApprovalStepStatus.PENDING,
          sla_hours: slaHours,
          escalation_user_id: (workflowStep as any).escalation_user_id ?? null,
          is_current_step: isCurrentStep,
        },
        mapToModel: true,
        model: ApprovalRequestStepModel,
        transaction,
      },
    );

    // Create approval records for each approver
    // Get approvers from the Sequelize model properly
    const approvers = workflowStep.get ? workflowStep.get("approvers") : workflowStep.approvers;

    if (approvers && approvers.length > 0) {
      for (const approver of approvers) {
        await sequelize.query(
          `INSERT INTO approval_request_step_approvals
           (organization_id, request_step_id, approver_id, approval_result, created_at)
           VALUES (:organizationId, :request_step_id, :approver_id, :approval_result, NOW())`,
          {
            replacements: {
              organizationId,
              request_step_id: (requestStep as any).id,
              approver_id: approver.approver_id,
              approval_result: ApprovalResult.PENDING,
            },
            transaction,
          },
        );
      }
    }
  }

  return request as ApprovalRequestModel;
};

/**
 * Decide whether a request may be auto-approved based on the workflow's
 * configured risk threshold. Fails closed: anything other than a use_case
 * whose server-side AI risk classification ranks at or below the threshold
 * (per AUTO_APPROVABLE_RISK_RANKS) is ineligible. Missing, unsupported
 * (GPAI / General Risk), or unrecognized classifications are never approved.
 */
export const evaluateAutoApproval = (
  autoApproveMaxRisk: string | null | undefined,
  entityType: string | null | undefined,
  serverRiskClassification: string | null | undefined,
): { eligible: boolean; reason: string } => {
  if (!autoApproveMaxRisk) {
    return { eligible: false, reason: "no auto-approval threshold configured" };
  }
  const thresholdRank = AUTO_APPROVABLE_RISK_RANKS[autoApproveMaxRisk];
  if (thresholdRank === undefined) {
    return {
      eligible: false,
      reason: `unsupported auto-approval threshold: ${autoApproveMaxRisk}`,
    };
  }
  if (entityType !== EntityType.USE_CASE) {
    return {
      eligible: false,
      reason: `entity type ${entityType ?? "unknown"} is not eligible for auto-approval`,
    };
  }
  if (!serverRiskClassification) {
    return { eligible: false, reason: "use case has no AI risk classification" };
  }
  const riskRank = AUTO_APPROVABLE_RISK_RANKS[serverRiskClassification];
  if (riskRank === undefined) {
    return {
      eligible: false,
      reason: `risk classification "${serverRiskClassification}" is not auto-approvable`,
    };
  }
  if (riskRank > thresholdRank) {
    return {
      eligible: false,
      reason: `risk classification "${serverRiskClassification}" is above threshold "${autoApproveMaxRisk}"`,
    };
  }
  return {
    eligible: true,
    reason: `risk classification "${serverRiskClassification}" at or below threshold "${autoApproveMaxRisk}"`,
  };
};

/**
 * Create the compliance frameworks a use case had queued while awaiting
 * approval. Shared by the manual final-step approval path and the
 * risk-based auto-approval path.
 */
const createPendingFrameworksForApprovedUseCase = async (
  entityId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  const [projectData] = await sequelize.query(
    `SELECT id, pending_frameworks, enable_ai_data_insertion
     FROM projects
     WHERE organization_id = :organizationId AND id = :entityId`,
    {
      replacements: { organizationId, entityId },
      type: "SELECT",
      transaction,
    },
  );

  if (!projectData || !(projectData as any).pending_frameworks) {
    return;
  }

  const pendingFrameworks = (projectData as any).pending_frameworks as number[];
  const enableAiDataInsertion = (projectData as any).enable_ai_data_insertion || false;

  // Import framework creation utilities
  const { createEUFrameworkQuery } = require("./eu.utils");
  const { createISOFrameworkQuery } = require("./iso42001.utils");
  const { createISO27001FrameworkQuery } = require("./iso27001.utils");
  const { createNISTAI_RMFFrameworkQuery } = require("./nistAiRmfCorrect.utils");

  // Create frameworks
  for (const frameworkId of pendingFrameworks) {
    // Create project_framework record FIRST (required by framework creation functions)
    await sequelize.query(
      `INSERT INTO projects_frameworks (organization_id, project_id, framework_id, is_demo)
       VALUES (:organizationId, :project_id, :framework_id, false)`,
      {
        replacements: {
          organizationId,
          project_id: entityId,
          framework_id: frameworkId,
        },
        transaction,
      },
    );

    // Create framework-specific records
    if (frameworkId === 1) {
      await createEUFrameworkQuery(entityId, enableAiDataInsertion, organizationId, transaction);
    } else if (frameworkId === 2) {
      await createISOFrameworkQuery(entityId, enableAiDataInsertion, organizationId, transaction);
    } else if (frameworkId === 3) {
      await createISO27001FrameworkQuery(
        entityId,
        enableAiDataInsertion,
        organizationId,
        transaction,
      );
    } else if (frameworkId === 4) {
      await createNISTAI_RMFFrameworkQuery(
        entityId,
        enableAiDataInsertion,
        organizationId,
        transaction,
      );
    }
  }

  // Clear pending frameworks after creation
  await sequelize.query(
    `UPDATE projects
     SET pending_frameworks = NULL, enable_ai_data_insertion = FALSE
     WHERE organization_id = :organizationId AND id = :entityId`,
    {
      replacements: { organizationId, entityId },
      transaction,
    },
  );
};

/**
 * Auto-approve a freshly created approval request when the workflow's
 * risk threshold allows it. Runs inside the caller's creation transaction,
 * so it is atomic with the request and idempotent by construction; the
 * request-status guard additionally protects against concurrent decisions.
 *
 * The risk classification is always re-read from the projects table — the
 * client-supplied entity_data is never trusted for this decision.
 */
export const tryAutoApproveRequestQuery = async (
  requestId: number,
  workflow: ApprovalWorkflowModel,
  entityType: string | undefined,
  entityId: number | undefined,
  organizationId: number,
  transaction: Transaction,
): Promise<{ autoApproved: boolean; riskLevel?: string; threshold?: string }> => {
  const threshold = (workflow as any).auto_approve_max_risk as string | null | undefined;

  if (!threshold || entityType !== EntityType.USE_CASE || !entityId) {
    return { autoApproved: false };
  }

  // Server-side risk re-read (client payloads are not authoritative)
  const [project] = await sequelize.query(
    `SELECT ai_risk_classification FROM projects
     WHERE organization_id = :organizationId AND id = :entityId`,
    {
      replacements: { organizationId, entityId },
      type: "SELECT",
      transaction,
    },
  );
  const riskLevel = ((project as any)?.ai_risk_classification ?? null) as string | null;

  const decision = evaluateAutoApproval(threshold, entityType, riskLevel);
  if (!decision.eligible) {
    logStructured(
      "processing",
      `auto-approval skipped for request ${requestId}: ${decision.reason}`,
      "tryAutoApproveRequestQuery",
      "approvalRequest.utils.ts",
    );
    return { autoApproved: false };
  }

  // Approve the request first — the status guard means a concurrent manual
  // decision wins and none of the step writes below happen for it
  const approvedRows = (await sequelize.query(
    `UPDATE approval_requests
     SET status = :approvedStatus, auto_approved_at = NOW(),
         auto_approval_risk_level = :riskLevel, updated_at = NOW()
     WHERE organization_id = :organizationId
       AND id = :requestId
       AND status = :pendingStatus
     RETURNING id`,
    {
      replacements: {
        organizationId,
        requestId,
        riskLevel,
        approvedStatus: ApprovalRequestStatus.APPROVED,
        pendingStatus: ApprovalRequestStatus.PENDING,
      },
      type: "SELECT",
      transaction,
    },
  )) as any[];

  if (!approvedRows || approvedRows.length === 0) {
    logStructured(
      "processing",
      `auto-approval aborted for request ${requestId}: request no longer pending`,
      "tryAutoApproveRequestQuery",
      "approvalRequest.utils.ts",
    );
    return { autoApproved: false };
  }

  // Complete every step with a system audit note
  const stepDetails = JSON.stringify({
    auto_approved: true,
    actor: "system",
    risk_level: riskLevel,
    threshold,
    reason: decision.reason,
  });
  await sequelize.query(
    `UPDATE approval_request_steps
     SET status = :completedStatus, date_completed = NOW(),
         step_details = CAST(:stepDetails AS jsonb)
     WHERE organization_id = :organizationId
       AND request_id = :requestId
       AND status = :pendingStatus`,
    {
      replacements: {
        organizationId,
        requestId,
        stepDetails,
        completedStatus: ApprovalStepStatus.COMPLETED,
        pendingStatus: ApprovalStepStatus.PENDING,
      },
      transaction,
    },
  );

  // Resolve the pre-created approver rows so no audit view shows them
  // as perpetually awaiting a human decision
  await sequelize.query(
    `UPDATE approval_request_step_approvals
     SET approval_result = :approvedResult, comments = :comments, approved_at = NOW()
     WHERE organization_id = :organizationId
       AND approval_result = :pendingResult
       AND request_step_id IN (
         SELECT id FROM approval_request_steps
         WHERE organization_id = :organizationId AND request_id = :requestId
       )`,
    {
      replacements: {
        organizationId,
        requestId,
        approvedResult: ApprovalResult.APPROVED,
        pendingResult: ApprovalResult.PENDING,
        comments: `Auto-approved by system: ${decision.reason}`,
      },
      transaction,
    },
  );

  // Same entity side effect as a manual final-step approval
  await createPendingFrameworksForApprovedUseCase(entityId, organizationId, transaction);

  logStructured(
    "successful",
    `auto-approved request ${requestId}: ${decision.reason}`,
    "tryAutoApproveRequestQuery",
    "approvalRequest.utils.ts",
  );

  return { autoApproved: true, riskLevel: riskLevel!, threshold };
};

/**
 * Get requests where user is an approver
 */
export const getPendingApprovalsQuery = async (
  userId: number,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<any[]> => {
  const requests = await sequelize.query(
    `SELECT DISTINCT
       ar.id,
       ar.request_name,
       ar.workflow_id,
       ar.entity_id,
       ar.entity_type,
       ar.status,
       ar.requested_by,
       ar.current_step,
       ar.created_at,
       ar.updated_at
     FROM approval_requests ar
     JOIN approval_request_steps ars ON ar.id = ars.request_id AND ar.organization_id = ars.organization_id
     JOIN approval_request_step_approvals arsa ON ars.id = arsa.request_step_id AND ars.organization_id = arsa.organization_id
     WHERE ar.organization_id = :organizationId
       AND arsa.approver_id = :userId
       AND ars.step_number = ar.current_step
       AND ar.status = :status
     ORDER BY ar.created_at DESC`,
    {
      replacements: {
        organizationId,
        userId,
        status: ApprovalRequestStatus.PENDING,
      },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  );

  return requests as any[];
};

/**
 * Get user's own approval requests
 */
export const getMyApprovalRequestsQuery = async (
  userId: number,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<any[]> => {
  const requests = await sequelize.query(
    `SELECT * FROM approval_requests
     WHERE organization_id = :organizationId
       AND requested_by = :userId
       AND status = :status
     ORDER BY created_at DESC`,
    {
      replacements: { organizationId, userId, status: ApprovalRequestStatus.PENDING },
      mapToModel: true,
      model: ApprovalRequestModel,
      ...(transaction && { transaction }),
    },
  );

  return requests as any[];
};

/**
 * Get approval request by ID with timeline
 */
export const getApprovalRequestByIdQuery = async (
  requestId: number,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<any | null> => {
  // Get approval request with project/use-case/file details and workflow info
  const [requestData] = await sequelize.query(
    `SELECT
      ar.*,
      -- Project/use-case fields
      p.project_title,
      p.uc_id,
      p.description as project_description,
      p.owner as project_owner_id,
      p.status as project_status,
      p.goal,
      p.target_industry,
      p.ai_risk_classification,
      p.type_of_high_risk_role,
      p.start_date,
      p.geography,
      owner_user.name as owner_name,
      owner_user.surname as owner_surname,
      owner_user.email as owner_email,
      -- File fields
      f.filename as file_name,
      f.size as file_size,
      f.type as file_type,
      f.review_status as file_review_status,
      f.uploaded_time as file_uploaded_time,
      file_uploader.name as file_uploader_name,
      file_uploader.surname as file_uploader_surname,
      -- AI Action fields (entity_type = 'ai_action')
      aia.tool_name as ai_tool_name,
      aia.risk_level as ai_risk_level,
      aia.state as ai_state,
      aia.action_type as ai_action_type,
      aia.input_params as ai_input_params,
      -- Risk fields (entity_type = 'risk')
      r.risk_name,
      r.severity as risk_severity,
      -- Vendor fields (entity_type = 'vendor')
      v.vendor_name,
      -- Policy fields (entity_type = 'policy')
      pol.title as policy_title,
      pol.content_html as policy_content,
      pol.status as policy_status,
      -- Incident fields (entity_type = 'incident')
      inc.ai_project as incident_title,
      inc.severity as incident_severity,
      inc.status as incident_status,
      -- Common fields
      requester_user.name as requester_name,
      requester_user.surname as requester_surname,
      requester_user.email as requester_email,
      aw.workflow_title as workflow_name
     FROM approval_requests ar
     LEFT JOIN projects p ON ar.entity_id = p.id AND ar.entity_type = 'use_case' AND ar.organization_id = p.organization_id
     LEFT JOIN files f ON ar.entity_id = f.id AND ar.entity_type = 'file' AND ar.organization_id = f.organization_id
     LEFT JOIN ai_action_approvals aia ON (ar.entity_data->>'ai_approval_id')::uuid = aia.id AND ar.entity_type = 'ai_action'
     LEFT JOIN risks r ON ar.entity_id = r.id AND ar.entity_type = 'risk' AND ar.organization_id = r.organization_id
     LEFT JOIN vendors v ON ar.entity_id = v.id AND ar.entity_type = 'vendor' AND ar.organization_id = v.organization_id
     LEFT JOIN policy_manager pol ON ar.entity_id = pol.id AND ar.entity_type = 'policy' AND ar.organization_id = pol.organization_id
     LEFT JOIN ai_incident_managements inc ON ar.entity_id = inc.id AND ar.entity_type = 'incident' AND ar.organization_id = inc.organization_id
     LEFT JOIN users owner_user ON p.owner = owner_user.id
     LEFT JOIN users file_uploader ON f.uploaded_by = file_uploader.id
     LEFT JOIN users requester_user ON ar.requested_by = requester_user.id
     LEFT JOIN approval_workflows aw ON ar.workflow_id = aw.id AND ar.organization_id = aw.organization_id
     WHERE ar.organization_id = :organizationId
       AND ar.id = :requestId`,
    {
      replacements: { organizationId, requestId },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  );

  if (!requestData) {
    return null;
  }

  const request = requestData as any;

  // Load steps
  const steps = await sequelize.query(
    `SELECT * FROM approval_request_steps
     WHERE organization_id = :organizationId
       AND request_id = :requestId
     ORDER BY step_number ASC`,
    {
      replacements: { organizationId, requestId },
      mapToModel: true,
      model: ApprovalRequestStepModel,
      ...(transaction && { transaction }),
    },
  );

  // Load approvals for each step
  for (const step of steps) {
    const approvals = await sequelize.query(
      `SELECT arsa.*, u.name, u.surname, u.email
       FROM approval_request_step_approvals arsa
       JOIN users u ON arsa.approver_id = u.id
       WHERE arsa.organization_id = :organizationId
         AND arsa.request_step_id = :stepId`,
      {
        replacements: { organizationId, stepId: (step as any).id },
        type: "SELECT",
        ...(transaction && { transaction }),
      },
    );
    (step as any).approvals = approvals;
  }

  request.steps = steps;

  return request;
};

/**
 * Approve or reject a request step
 */
export const processApprovalQuery = async (
  requestId: number,
  userId: number,
  approvalResult: ApprovalResult,
  comments: string | undefined,
  organizationId: number,
  transaction: Transaction,
): Promise<NotificationInfo | null> => {
  // Get current request
  const [request] = await sequelize.query(
    `SELECT * FROM approval_requests WHERE organization_id = :organizationId AND id = :requestId`,
    {
      replacements: { organizationId, requestId },
      mapToModel: true,
      model: ApprovalRequestModel,
      transaction,
    },
  );

  if (!request) {
    throw new Error("Request not found");
  }

  // Guard against concurrent or repeated decisions (there is no row lock on
  // this path): only a pending request may be acted on.
  if ((request as any).status !== ApprovalRequestStatus.PENDING) {
    throw new ValidationException("Request is no longer pending");
  }

  const currentStep = (request as any).current_step;

  // Get current step
  const [requestStep] = await sequelize.query(
    `SELECT * FROM approval_request_steps
     WHERE organization_id = :organizationId
       AND request_id = :requestId AND step_number = :stepNumber`,
    {
      replacements: { organizationId, requestId, stepNumber: currentStep },
      mapToModel: true,
      model: ApprovalRequestStepModel,
      transaction,
    },
  );

  if (!requestStep) {
    throw new Error("Request step not found");
  }

  // Update approval record
  await sequelize.query(
    `UPDATE approval_request_step_approvals
     SET approval_result = :approvalResult,
         comments = :comments,
         approved_at = NOW()
     WHERE organization_id = :organizationId
       AND request_step_id = :requestStepId
       AND approver_id = :userId`,
    {
      replacements: {
        organizationId,
        requestStepId: (requestStep as any).id,
        userId,
        approvalResult,
        comments: comments || null,
      },
      transaction,
    },
  );

  // Get the workflow step to check requires_all_approvers
  const [workflowStep] = await sequelize.query(
    `SELECT aws.requires_all_approvers
     FROM approval_workflow_steps aws
     JOIN approval_request_steps ars ON ars.step_number = aws.step_number AND ars.organization_id = aws.organization_id
     WHERE ars.organization_id = :organizationId
       AND ars.id = :requestStepId
       AND aws.workflow_id = (
         SELECT workflow_id FROM approval_requests WHERE organization_id = :organizationId AND id = :requestId
       )`,
    {
      replacements: {
        organizationId,
        requestStepId: (requestStep as any).id,
        requestId,
      },
      type: "SELECT",
      transaction,
    },
  );

  const requiresAllApprovers = workflowStep ? (workflowStep as any).requires_all_approvers : true;

  // Get ALL approvals for this step AFTER the update
  // Query them directly instead of using COUNT to avoid transaction visibility issues
  const allApprovals = (await sequelize.query(
    `SELECT approver_id, approval_result
     FROM approval_request_step_approvals
     WHERE organization_id = :organizationId
       AND request_step_id = :requestStepId`,
    {
      replacements: {
        organizationId,
        requestStepId: (requestStep as any).id,
      },
      type: "SELECT",
      transaction,
    },
  )) as any[];

  // Count in code instead of SQL to ensure we see the updated values
  const pendingCount = allApprovals.filter(
    (a: any) => a.approval_result === ApprovalResult.PENDING,
  ).length;
  const approvedCount = allApprovals.filter(
    (a: any) => a.approval_result === ApprovalResult.APPROVED,
  ).length;

  const hasPending = pendingCount > 0;
  const hasApproved = approvedCount > 0;

  // Determine if step should be completed based on requires_all_approvers setting
  const shouldComplete = requiresAllApprovers
    ? !hasPending // All approvers must respond
    : hasApproved; // At least one approver must approve

  // If rejected, mark step and request as rejected
  if (approvalResult === ApprovalResult.REJECTED) {
    await sequelize.query(
      `UPDATE approval_request_steps
       SET status = :status, date_completed = NOW()
       WHERE organization_id = :organizationId AND id = :requestStepId`,
      {
        replacements: {
          organizationId,
          requestStepId: (requestStep as any).id,
          status: ApprovalStepStatus.REJECTED,
        },
        transaction,
      },
    );

    await sequelize.query(
      `UPDATE approval_requests
       SET status = :status, updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :requestId`,
      {
        replacements: {
          organizationId,
          requestId,
          status: ApprovalRequestStatus.REJECTED,
        },
        transaction,
      },
    );

    // ===== FILE STATUS UPDATE AFTER REJECTION =====
    const entityId = (request as any).entity_id;
    const entityType = (request as any).entity_type;

    if (entityType === "file" && entityId) {
      // Update file review_status to 'rejected'
      await sequelize.query(
        `UPDATE files
         SET review_status = 'rejected', updated_at = NOW()
         WHERE organization_id = :organizationId AND id = :entityId`,
        {
          replacements: { organizationId, entityId },
          transaction,
        },
      );
    }

    // Return notification info for requester rejection
    return {
      type: "requester_rejected",
      organizationId,
      requestId,
      requesterId: (request as any).requested_by,
      requestName: (request as any).request_name,
    };
  }
  // If approved and conditions met (all/any), move to next step or complete
  else if (approvalResult === ApprovalResult.APPROVED && shouldComplete) {
    await sequelize.query(
      `UPDATE approval_request_steps
       SET status = :status, date_completed = NOW()
       WHERE organization_id = :organizationId AND id = :requestStepId`,
      {
        replacements: {
          organizationId,
          requestStepId: (requestStep as any).id,
          status: ApprovalStepStatus.COMPLETED,
        },
        transaction,
      },
    );

    // Check if there are more steps
    const totalSteps = await sequelize.query(
      `SELECT COUNT(*) as count FROM approval_request_steps WHERE organization_id = :organizationId AND request_id = :requestId`,
      {
        replacements: { organizationId, requestId },
        type: "SELECT",
        transaction,
      },
    );

    const stepCount = parseInt((totalSteps[0] as any).count, 10);

    if (currentStep < stepCount) {
      // Move to next step
      await sequelize.query(
        `UPDATE approval_requests
         SET current_step = :nextStep, updated_at = NOW()
         WHERE organization_id = :organizationId AND id = :requestId`,
        {
          replacements: {
            organizationId,
            requestId,
            nextStep: currentStep + 1,
          },
          transaction,
        },
      );

      // The next step becomes active now: start its SLA clock from the
      // snapshotted sla_hours (date_assigned is set for all steps at
      // creation, so it cannot be used for this)
      await sequelize.query(
        `UPDATE approval_request_steps
         SET due_at = CASE WHEN sla_hours IS NOT NULL
                           THEN NOW() + make_interval(hours => sla_hours)
                           ELSE NULL END
         WHERE organization_id = :organizationId
           AND request_id = :requestId
           AND step_number = :nextStep`,
        {
          replacements: {
            organizationId,
            requestId,
            nextStep: currentStep + 1,
          },
          transaction,
        },
      );

      // Return notification info for next step approvers AND requester progress update
      return {
        type: "step_approvers",
        organizationId,
        requestId,
        requesterId: (request as any).requested_by,
        stepNumber: currentStep + 1,
        requestName: (request as any).request_name,
        completedStep: currentStep,
        totalSteps: stepCount,
      };
    } else {
      // All steps completed - mark as approved
      await sequelize.query(
        `UPDATE approval_requests
         SET status = :status, updated_at = NOW()
         WHERE organization_id = :organizationId AND id = :requestId`,
        {
          replacements: {
            organizationId,
            requestId,
            status: ApprovalRequestStatus.APPROVED,
          },
          transaction,
        },
      );

      // Store notification info to be sent after transaction commits
      const notificationInfo: NotificationInfo = {
        type: "requester_approved",
        organizationId,
        requestId,
        requesterId: (request as any).requested_by,
        requestName: (request as any).request_name,
      };

      // ===== FRAMEWORK CREATION AFTER APPROVAL =====
      // Get the entity (use-case/project) to check if it has pending frameworks
      const entityId = (request as any).entity_id;
      const entityType = (request as any).entity_type;

      if (entityType === "use_case" && entityId) {
        await createPendingFrameworksForApprovedUseCase(entityId, organizationId, transaction);
      }

      // ===== FILE STATUS UPDATE AFTER APPROVAL =====
      if (entityType === "file" && entityId) {
        // Update file review_status to 'approved'
        await sequelize.query(
          `UPDATE files
           SET review_status = 'approved', updated_at = NOW()
           WHERE organization_id = :organizationId AND id = :entityId`,
          {
            replacements: { organizationId, entityId },
            transaction,
          },
        );
      }

      // ===== AI ACTION EXECUTION AFTER APPROVAL =====
      // For ai_action approval requests, run the proposed write operation
      // (e.g. agent_create_risk) inside this same transaction. If the
      // executor throws, the transaction rolls back and the approval state
      // change is reverted — the approver will see an error.
      if (entityType === "ai_action") {
        console.log(
          `[processApprovalQuery] ai_action branch — invoking executeAiAction(requestId=${requestId}, org=${organizationId})`,
        );
        await executeAiAction(requestId, organizationId, transaction);

        console.log(
          `[processApprovalQuery] executeAiAction returned for requestId=${requestId} — transaction will commit on outer return`,
        );
      } else {
        console.log(
          `[processApprovalQuery] entityType=${entityType} (not ai_action) — no executor dispatched for requestId=${requestId}`,
        );
      }

      // Return notification info after all processing is done
      return notificationInfo;
    }
  }

  // No notification needed if approval is pending (not all approvers have responded)
  return null;
};

/**
 * Withdraw approval request
 */
export const withdrawApprovalRequestQuery = async (
  requestId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE approval_requests
     SET status = :status, updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :requestId`,
    {
      replacements: {
        organizationId,
        requestId,
        status: ApprovalRequestStatus.WITHDRAWN,
      },
      transaction,
    },
  );
};

/**
 * Get pending approval request ID by entity
 */
export const getPendingApprovalRequestIdQuery = async (
  entityId: number,
  entityType: string,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<number | null> => {
  const results = await sequelize.query(
    `SELECT id
     FROM approval_requests
     WHERE organization_id = :organizationId
       AND entity_id = :entityId
       AND entity_type = :entityType
       AND status = :status
     LIMIT 1`,
    {
      replacements: {
        organizationId,
        entityId,
        entityType,
        status: ApprovalRequestStatus.PENDING,
      },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  );

  if (results && results.length > 0) {
    return (results[0] as any).id;
  }
  return null;
};

/**
 * Check if an entity has a pending approval request
 */
export const hasPendingApprovalQuery = async (
  entityId: number,
  entityType: string,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<boolean> => {
  const results = await sequelize.query(
    `SELECT COUNT(*) as count
     FROM approval_requests
     WHERE organization_id = :organizationId
       AND entity_id = :entityId
       AND entity_type = :entityType
       AND status = :status`,
    {
      replacements: {
        organizationId,
        entityId,
        entityType,
        status: ApprovalRequestStatus.PENDING,
      },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  );

  const count = parseInt((results[0] as any).count, 10);
  return count > 0;
};

/**
 * Get the approval status for a use-case
 * Returns 'pending', 'rejected', or null if no pending/rejected approval
 */
export const getApprovalStatusQuery = async (
  entityId: number,
  entityType: string,
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<"pending" | "rejected" | null> => {
  const results = (await sequelize.query(
    `SELECT status
     FROM approval_requests
     WHERE organization_id = :organizationId
       AND entity_id = :entityId
       AND entity_type = :entityType
       AND status IN (:pendingStatus, :rejectedStatus)
     ORDER BY updated_at DESC
     LIMIT 1`,
    {
      replacements: {
        organizationId,
        entityId,
        entityType,
        pendingStatus: ApprovalRequestStatus.PENDING,
        rejectedStatus: ApprovalRequestStatus.REJECTED,
      },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  )) as any[];

  if (results.length === 0 || !results[0]) {
    return null;
  }

  const status = (results[0] as any).status;
  if (status === ApprovalRequestStatus.PENDING) {
    return "pending";
  } else if (status === ApprovalRequestStatus.REJECTED) {
    return "rejected";
  }

  return null;
};

/**
 * Reject an approval request when the associated entity is deleted
 * This is used when a file with a pending approval is deleted
 */
export const rejectApprovalRequestOnEntityDelete = async (
  approvalRequestId: number,
  organizationId: number,
  reason: string = "The associated entity has been deleted.",
): Promise<NotificationInfo | null> => {
  const transaction = await sequelize.transaction();

  try {
    // Get the approval request
    const [request] = (await sequelize.query(
      `SELECT id, request_name, requested_by, status
       FROM approval_requests
       WHERE organization_id = :organizationId AND id = :requestId`,
      {
        replacements: { organizationId, requestId: approvalRequestId },
        type: "SELECT",
        transaction,
      },
    )) as any[];

    if (!request || request.status !== ApprovalRequestStatus.PENDING) {
      await transaction.rollback();
      return null; // Request doesn't exist or is not pending
    }

    // Update request status to Rejected
    await sequelize.query(
      `UPDATE approval_requests
       SET status = :status, updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :requestId`,
      {
        replacements: {
          organizationId,
          status: ApprovalRequestStatus.REJECTED,
          requestId: approvalRequestId,
        },
        transaction,
      },
    );

    // Update all pending steps to Rejected
    await sequelize.query(
      `UPDATE approval_request_steps
       SET status = :status, date_completed = NOW()
       WHERE organization_id = :organizationId AND request_id = :requestId AND status = :pendingStatus`,
      {
        replacements: {
          organizationId,
          status: ApprovalStepStatus.REJECTED,
          requestId: approvalRequestId,
          pendingStatus: ApprovalStepStatus.PENDING,
        },
        transaction,
      },
    );

    // Update all pending step approvals with the rejection reason
    await sequelize.query(
      `UPDATE approval_request_step_approvals
       SET status = :status, comments = :reason, date_responded = NOW()
       WHERE organization_id = :organizationId
         AND request_step_id IN (
           SELECT id FROM approval_request_steps WHERE organization_id = :organizationId AND request_id = :requestId
         ) AND status = :pendingStatus`,
      {
        replacements: {
          organizationId,
          status: ApprovalResult.REJECTED,
          reason,
          requestId: approvalRequestId,
          pendingStatus: ApprovalResult.PENDING,
        },
        transaction,
      },
    );

    await transaction.commit();

    console.log(`📋 Approval request ${approvalRequestId} rejected: ${reason}`);

    // Return notification info to notify the requester
    return {
      type: "requester_rejected",
      organizationId,
      requestId: approvalRequestId,
      requesterId: request.requested_by,
      requestName: request.request_name,
    };
  } catch (error) {
    await transaction.rollback();
    console.error(`Failed to reject approval request ${approvalRequestId}:`, error);
    throw error;
  }
};

/**
 * Row returned by getOverdueApprovalStepsQuery
 */
export interface OverdueApprovalStepRow {
  request_step_id: number;
  request_id: number;
  step_number: number;
  step_name: string;
  due_at: Date;
  escalation_user_id: number;
  request_name: string;
  entity_type: string | null;
  entity_id: number | null;
}

/**
 * Active steps of pending requests whose SLA has elapsed and that have not
 * been escalated yet. Only the request's current step can be overdue — later
 * steps are still Pending but have no due_at, and withdrawn/rejected requests
 * are excluded via the request status join. Range comparison (due_at < NOW())
 * so a missed sweep run catches up on the next one.
 */
export const getOverdueApprovalStepsQuery = async (
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<OverdueApprovalStepRow[]> => {
  const rows = await sequelize.query(
    `SELECT ars.id AS request_step_id,
            ars.request_id,
            ars.step_number,
            ars.step_name,
            ars.due_at,
            ars.escalation_user_id,
            ar.request_name,
            ar.entity_type,
            ar.entity_id
     FROM approval_request_steps ars
     JOIN approval_requests ar
       ON ar.id = ars.request_id AND ar.organization_id = ars.organization_id
     WHERE ars.organization_id = :organizationId
       AND ar.status = :requestPending
       AND ars.step_number = ar.current_step
       AND ars.status = :stepPending
       AND ars.due_at IS NOT NULL
       AND ars.due_at < NOW()
       AND ars.escalated_at IS NULL
       AND ars.escalation_user_id IS NOT NULL
     ORDER BY ars.due_at ASC`,
    {
      replacements: {
        organizationId,
        requestPending: ApprovalRequestStatus.PENDING,
        stepPending: ApprovalStepStatus.PENDING,
      },
      type: "SELECT",
      ...(transaction && { transaction }),
    },
  );

  return rows as OverdueApprovalStepRow[];
};

/**
 * Claim escalation of an overdue step. The conditional UPDATE returns the row
 * only when escalated_at was still NULL, so exactly one caller wins under
 * retries or concurrent sweep workers. Returns true when this call claimed it.
 */
export const markApprovalStepEscalatedQuery = async (
  organizationId: number,
  requestStepId: number,
): Promise<boolean> => {
  const rows = await sequelize.query(
    `UPDATE approval_request_steps
     SET escalated_at = NOW()
     WHERE organization_id = :organizationId
       AND id = :requestStepId
       AND escalated_at IS NULL
     RETURNING id`,
    {
      replacements: { organizationId, requestStepId },
      type: "SELECT",
    },
  );

  return Array.isArray(rows) && rows.length > 0;
};
