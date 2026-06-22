import {
  getAllApprovalWorkflowsQuery,
  getApprovalWorkflowByIdQuery,
  getWorkflowStepsQuery,
  createApprovalWorkflowQuery,
} from "../../utils/approvalWorkflow.utils";
import {
  getPendingApprovalsQuery,
  getApprovalRequestByIdQuery,
  getApprovalStatusQuery,
  createApprovalRequestQuery,
  processApprovalQuery,
  withdrawApprovalRequestQuery,
} from "../../utils/approvalRequest.utils";
import { ApprovalResult, EntityType } from "../../domain.layer/enums/approval-workflow.enum";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ──────────────────────────────────────────────────────────────────
// READ tools
// ──────────────────────────────────────────────────────────────────

const fetchApprovalWorkflows = async (
  params: { limit?: number; offset?: number },
  organizationId: number,
): Promise<any[]> => {
  try {
    let workflows = await getAllApprovalWorkflowsQuery(organizationId);

    if (params.offset && params.offset > 0) {
      workflows = workflows.slice(params.offset);
    }
    if (params.limit && params.limit > 0) {
      workflows = workflows.slice(0, params.limit);
    }

    return workflows.map((w: any) => ({
      id: w.id,
      workflow_title: w.workflow_title,
      entity_type: w.entity_type,
      description: w.description,
      is_active: w.is_active,
      created_at: w.created_at,
      step_count: w.getDataValue ? (w.getDataValue("steps") || []).length : 0,
    }));
  } catch (error) {
    logger.error("Error fetching approval workflows:", error);
    throw new Error(
      `Failed to fetch approval workflows: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getApprovalWorkflowDetail = async (
  params: { workflow_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    const workflow = await getApprovalWorkflowByIdQuery(params.workflow_id, organizationId);

    if (!workflow) {
      return { error: `Workflow #${params.workflow_id} not found` };
    }

    return workflow;
  } catch (error) {
    logger.error("Error fetching approval workflow detail:", error);
    throw new Error(
      `Failed to fetch workflow detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchPendingApprovals = async (
  params: { user_id?: number; limit?: number },
  organizationId: number,
): Promise<any[]> => {
  try {
    if (params.user_id) {
      let results = await getPendingApprovalsQuery(params.user_id, organizationId);
      if (params.limit && params.limit > 0) {
        results = results.slice(0, params.limit);
      }
      return results;
    }

    // If no user_id, return all pending requests for the org
    const [results] = await sequelize.query(
      `SELECT id, request_name, workflow_id, entity_id, entity_type, status,
              requested_by, current_step, created_at, updated_at
       FROM approval_requests
       WHERE organization_id = :organizationId AND status = 'Pending'
       ORDER BY created_at DESC
       ${params.limit ? "LIMIT :limit" : ""}`,
      {
        replacements: { organizationId, limit: params.limit },
      },
    );
    return results as any[];
  } catch (error) {
    logger.error("Error fetching pending approvals:", error);
    throw new Error(
      `Failed to fetch pending approvals: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchMyApprovalRequests = async (
  params: { status?: string; limit?: number },
  organizationId: number,
): Promise<any[]> => {
  try {
    let statusFilter = "";
    const replacements: any = { organizationId };

    if (params.status) {
      statusFilter = "AND status = :status";
      replacements.status = params.status;
    }

    const [results] = await sequelize.query(
      `SELECT id, request_name, workflow_id, entity_id, entity_type, status,
              requested_by, current_step, created_at, updated_at
       FROM approval_requests
       WHERE organization_id = :organizationId ${statusFilter}
       ORDER BY created_at DESC
       ${params.limit ? "LIMIT :limit" : ""}`,
      {
        replacements: { ...replacements, limit: params.limit },
      },
    );
    return results as any[];
  } catch (error) {
    logger.error("Error fetching approval requests:", error);
    throw new Error(
      `Failed to fetch approval requests: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getApprovalRequestDetail = async (
  params: { request_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    const request = await getApprovalRequestByIdQuery(params.request_id, organizationId);

    if (!request) {
      return { error: `Approval request #${params.request_id} not found` };
    }

    return request;
  } catch (error) {
    logger.error("Error fetching approval request detail:", error);
    throw new Error(
      `Failed to fetch request detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getApprovalStatusForEntity = async (
  params: { entity_type: string; entity_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    const status = await getApprovalStatusQuery(
      params.entity_id,
      params.entity_type,
      organizationId,
    );

    return {
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      approval_status: status, // 'pending' | 'rejected' | null
      has_pending_approval: status === "pending",
      has_rejection: status === "rejected",
    };
  } catch (error) {
    logger.error("Error fetching approval status for entity:", error);
    throw new Error(
      `Failed to fetch approval status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getApprovalAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    // Status distribution
    const [statusDist] = await sequelize.query(
      `SELECT status, COUNT(*)::int as count
       FROM approval_requests
       WHERE organization_id = :organizationId
       GROUP BY status`,
      { replacements: { organizationId } },
    );

    // Average time to completion (approved requests)
    const [avgTime] = await sequelize.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric(10,2) as avg_hours
       FROM approval_requests
       WHERE organization_id = :organizationId AND status = 'Approved'`,
      { replacements: { organizationId } },
    );

    // Requests per workflow
    const [workflowDist] = await sequelize.query(
      `SELECT aw.workflow_title, COUNT(ar.id)::int as request_count
       FROM approval_requests ar
       JOIN approval_workflows aw ON ar.workflow_id = aw.id AND ar.organization_id = aw.organization_id
       WHERE ar.organization_id = :organizationId
       GROUP BY aw.workflow_title
       ORDER BY request_count DESC`,
      { replacements: { organizationId } },
    );

    // Bottleneck steps (steps with longest average pending time)
    const [bottlenecks] = await sequelize.query(
      `SELECT step_name, step_number,
              AVG(EXTRACT(EPOCH FROM (COALESCE(date_completed, NOW()) - created_at)) / 3600)::numeric(10,2) as avg_hours_pending,
              COUNT(*)::int as total_steps
       FROM approval_request_steps
       WHERE organization_id = :organizationId
       GROUP BY step_name, step_number
       ORDER BY avg_hours_pending DESC
       LIMIT 5`,
      { replacements: { organizationId } },
    );

    // Entity type distribution
    const [entityDist] = await sequelize.query(
      `SELECT entity_type, COUNT(*)::int as count
       FROM approval_requests
       WHERE organization_id = :organizationId AND entity_type IS NOT NULL
       GROUP BY entity_type`,
      { replacements: { organizationId } },
    );

    return {
      statusDistribution: statusDist,
      averageCompletionTimeHours: (avgTime as any[])[0]?.avg_hours || 0,
      requestsByWorkflow: workflowDist,
      bottleneckSteps: bottlenecks,
      entityTypeDistribution: entityDist,
    };
  } catch (error) {
    logger.error("Error getting approval analytics:", error);
    throw new Error(
      `Failed to get approval analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getApprovalExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    // Total counts by status
    const [counts] = await sequelize.query(
      `SELECT
         COUNT(*)::int as total_requests,
         COUNT(*) FILTER (WHERE status = 'Pending')::int as pending_count,
         COUNT(*) FILTER (WHERE status = 'Approved')::int as approved_count,
         COUNT(*) FILTER (WHERE status = 'Rejected')::int as rejected_count,
         COUNT(*) FILTER (WHERE status = 'Withdrawn')::int as withdrawn_count
       FROM approval_requests
       WHERE organization_id = :organizationId`,
      { replacements: { organizationId } },
    );

    const summary = (counts as any[])[0] || {};

    // Approval rate
    const totalDecided = (summary.approved_count || 0) + (summary.rejected_count || 0);
    const approvalRate =
      totalDecided > 0 ? Math.round(((summary.approved_count || 0) / totalDecided) * 100) : 0;

    // Active workflows count
    const [workflowCount] = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM approval_workflows
       WHERE organization_id = :organizationId AND is_active = true`,
      { replacements: { organizationId } },
    );

    // Oldest pending request
    const [oldestPending] = await sequelize.query(
      `SELECT id, request_name, created_at,
              EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_pending
       FROM approval_requests
       WHERE organization_id = :organizationId AND status = 'Pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      { replacements: { organizationId } },
    );

    // Recent activity (last 7 days)
    const [recentActivity] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as requests_last_7_days,
         COUNT(*) FILTER (WHERE status = 'Approved' AND updated_at >= NOW() - INTERVAL '7 days')::int as approved_last_7_days,
         COUNT(*) FILTER (WHERE status = 'Rejected' AND updated_at >= NOW() - INTERVAL '7 days')::int as rejected_last_7_days
       FROM approval_requests
       WHERE organization_id = :organizationId`,
      { replacements: { organizationId } },
    );

    return {
      totalRequests: summary.total_requests || 0,
      pendingCount: summary.pending_count || 0,
      approvedCount: summary.approved_count || 0,
      rejectedCount: summary.rejected_count || 0,
      withdrawnCount: summary.withdrawn_count || 0,
      approvalRate,
      activeWorkflows: (workflowCount as any[])[0]?.count || 0,
      oldestPendingRequest: (oldestPending as any[])[0] || null,
      recentActivity: (recentActivity as any[])[0] || {},
    };
  } catch (error) {
    logger.error("Error getting approval executive summary:", error);
    throw new Error(
      `Failed to get executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ──────────────────────────────────────────────────────────────────
// WRITE tools (Human Confirmation Flow)
// ──────────────────────────────────────────────────────────────────

const agentCreateApprovalRequest = createWriteToolFn({
  toolName: "agent_create_approval_request",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create approval request for ${params.entity_type} #${params.entity_id} using workflow #${params.workflow_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const workflow = await getApprovalWorkflowByIdQuery(
        params.workflow_id as number,
        organizationId,
        transaction,
      );

      if (!workflow) {
        throw new Error(`Workflow #${params.workflow_id} not found`);
      }

      const steps = await getWorkflowStepsQuery(
        params.workflow_id as number,
        organizationId,
        transaction,
      );

      const result = await createApprovalRequestQuery(
        {
          request_name: `Approval for ${params.entity_type} #${params.entity_id}`,
          workflow_id: params.workflow_id as number,
          entity_id: params.entity_id as number,
          entity_type: params.entity_type as string,
          status: "Pending",
          requested_by: (params._userId as number) || 0,
        },
        steps,
        organizationId,
        transaction,
      );

      await transaction.commit();
      return {
        id: (result as any).id,
        message: "Approval request created successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentApproveApprovalStep = createWriteToolFn({
  toolName: "agent_approve_approval_step",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Approve step #${params.step_id} on approval request #${params.request_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const result = await processApprovalQuery(
        params.request_id as number,
        (params._userId as number) || 0,
        ApprovalResult.APPROVED,
        params.comment as string | undefined,
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        request_id: params.request_id,
        approved: true,
        notification: result,
        message: "Step approved successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentRejectApprovalStep = createWriteToolFn({
  toolName: "agent_reject_approval_step",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Reject step #${params.step_id} on approval request #${params.request_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const result = await processApprovalQuery(
        params.request_id as number,
        (params._userId as number) || 0,
        ApprovalResult.REJECTED,
        params.comment as string | undefined,
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        request_id: params.request_id,
        rejected: true,
        notification: result,
        message: "Step rejected successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentWithdrawApprovalRequest = createWriteToolFn({
  toolName: "agent_withdraw_approval_request",
  warningLevel: "warning",
  descriptionFn: (params) => `Withdraw approval request #${params.request_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      await withdrawApprovalRequestQuery(params.request_id as number, organizationId, transaction);
      await transaction.commit();
      return {
        id: params.request_id,
        withdrawn: true,
        message: "Approval request withdrawn successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentCreateApprovalWorkflow = createWriteToolFn({
  toolName: "agent_create_approval_workflow",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create approval workflow "${params.name}"${params.steps ? ` with ${(params.steps as any[]).length} step(s)` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const steps = (params.steps as any[]) || [];
      const result = await createApprovalWorkflowQuery(
        {
          workflow_title: params.name as string,
          entity_type: EntityType.USE_CASE,
          description: params.description as string | undefined,
          created_by: (params._userId as number) || 0,
          steps: steps.map((s: any) => ({
            step_name: s.step_name || "Review",
            description: s.description,
            approver_ids: s.approver_ids || [],
            requires_all_approvers:
              s.requires_all_approvers !== undefined ? s.requires_all_approvers : true,
          })),
        },
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        id: (result as any).id,
        workflow_title: (result as any).workflow_title,
        message: "Approval workflow created successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

// ──────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────

const availableApprovalWorkflowTools: any = {
  fetch_approval_workflows: fetchApprovalWorkflows,
  get_approval_workflow_detail: getApprovalWorkflowDetail,
  fetch_pending_approvals: fetchPendingApprovals,
  fetch_my_approval_requests: fetchMyApprovalRequests,
  get_approval_request_detail: getApprovalRequestDetail,
  get_approval_status_for_entity: getApprovalStatusForEntity,
  get_approval_analytics: getApprovalAnalytics,
  get_approval_executive_summary: getApprovalExecutiveSummary,
  agent_create_approval_request: agentCreateApprovalRequest,
  agent_approve_approval_step: agentApproveApprovalStep,
  agent_reject_approval_step: agentRejectApprovalStep,
  agent_withdraw_approval_request: agentWithdrawApprovalRequest,
  agent_create_approval_workflow: agentCreateApprovalWorkflow,
};

export { availableApprovalWorkflowTools };
