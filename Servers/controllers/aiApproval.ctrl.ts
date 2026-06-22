import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  approveAction,
  rejectAction,
  getApproval,
  listApprovals,
  getApprovalStats,
} from "../advisor/approval/approvalGateway";
import { trackAIContent } from "../middleware/aiContentTracker.middleware";

const fileName = "aiApproval.ctrl.ts";

/**
 * GET /api/ai-approvals
 * List approval records with optional filters.
 */
export async function listApprovalsCtrl(req: Request, res: Response) {
  const functionName = "listApprovalsCtrl";
  const organizationId = req.organizationId!;

  try {
    const { state, tool, dateFrom, dateTo, limit, offset } = req.query;
    const result = await listApprovals(organizationId, {
      state: state as string | undefined,
      toolName: tool as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    logStructured("successful", `listed ${result.rows.length} approvals`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to list approvals", functionName, fileName);
    logger.error("Error in listApprovalsCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-approvals/stats
 * Get approval statistics for the organization.
 */
export async function getApprovalStatsCtrl(req: Request, res: Response) {
  const functionName = "getApprovalStatsCtrl";
  const organizationId = req.organizationId!;

  try {
    const stats = await getApprovalStats(organizationId);

    logStructured("successful", "fetched approval stats", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    logStructured("error", "failed to get approval stats", functionName, fileName);
    logger.error("Error in getApprovalStatsCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-approvals/:id
 * Get a single approval record with full state history.
 */
export async function getApprovalDetailCtrl(req: Request, res: Response) {
  const functionName = "getApprovalDetailCtrl";
  const organizationId = req.organizationId!;
  const id = req.params.id as string;

  try {
    const record = await getApproval(organizationId, id);
    if (!record) {
      return res.status(404).json(STATUS_CODE[404]("Approval not found"));
    }

    logStructured("successful", `fetched approval ${id}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](record));
  } catch (error) {
    logStructured("error", "failed to get approval detail", functionName, fileName);
    logger.error("Error in getApprovalDetailCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/ai-approvals/:id/approve
 * Approve a pending approval and execute the write operation.
 */
export async function approveApprovalCtrl(req: Request, res: Response) {
  const functionName = "approveApprovalCtrl";
  const organizationId = req.organizationId!;
  const id = req.params.id as string;
  const userId = Number(req.userId);

  try {
    const result = await approveAction(organizationId, id, userId);

    if (!result.success) {
      const statusCode = result.error?.includes("not found") ? 404 : 400;
      return res.status(statusCode).json(STATUS_CODE[statusCode as 404 | 400](result.error!));
    }

    // Track as AI-generated content
    trackAIContent(
      organizationId,
      "confirmation",
      0,
      {
        badgeType: "generated",
        modelUsed: "ai-advisor",
        modelProvider: "verifywise",
        toolName: id,
        confidenceScore: 100,
        promptSummary: `Approved approval ${id}`,
      },
      userId,
    ).catch(() => {});

    logStructured("successful", `approval ${id} approved`, functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        approval_id: id,
        status: "approved",
        result: result.result,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to approve", functionName, fileName);
    logger.error("Error in approveApprovalCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/ai-approvals/:id/reject
 * Reject a pending approval.
 */
export async function rejectApprovalCtrl(req: Request, res: Response) {
  const functionName = "rejectApprovalCtrl";
  const organizationId = req.organizationId!;
  const id = req.params.id as string;
  const userId = Number(req.userId);
  const reason = req.body?.reason as string | undefined;

  try {
    const result = await rejectAction(organizationId, id, userId, reason);

    if (!result.success) {
      const statusCode = result.error?.includes("not found") ? 404 : 400;
      return res.status(statusCode).json(STATUS_CODE[statusCode as 404 | 400](result.error!));
    }

    logStructured("successful", `approval ${id} rejected`, functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        approval_id: id,
        status: "rejected",
      }),
    );
  } catch (error) {
    logStructured("error", "failed to reject", functionName, fileName);
    logger.error("Error in rejectApprovalCtrl:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
