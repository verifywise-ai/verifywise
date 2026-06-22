/**
 * Phase 1 Backward-Compatibility Controller
 *
 * Delegates to the Phase 2 approval gateway while keeping the old
 * /api/ai-confirmation/* endpoints working for the existing frontend.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { listPendingConfirmations } from "../advisor/confirmation/confirmationStore";
import { approveAction, rejectAction } from "../advisor/approval/approvalGateway";
import { trackAIContent } from "../middleware/aiContentTracker.middleware";

const fileName = "aiConfirmation.ctrl.ts";

/**
 * POST /api/ai-confirmation/approve/:id
 * Backward-compatible — delegates to the approval gateway.
 */
export async function approveConfirmation(req: Request, res: Response) {
  const functionName = "approveConfirmation";
  const id = req.params.id as string;
  const organizationId = req.organizationId!;
  const userId = Number(req.userId);

  try {
    const result = await approveAction(organizationId, id, userId);

    if (!result.success) {
      const statusCode = result.error?.includes("not found") ? 404 : 400;
      return res.status(statusCode).json(STATUS_CODE[statusCode as 404 | 400](result.error!));
    }

    // Track as AI-generated content (fire-and-forget)
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
        promptSummary: `Approved: ${id}`,
      },
      userId,
    ).catch(() => {});

    logStructured("successful", `confirmation ${id} approved`, functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        confirmation_id: id,
        status: "approved",
        result: result.result,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to approve confirmation", functionName, fileName);
    logger.error("Error in approveConfirmation:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/ai-confirmation/reject/:id
 * Backward-compatible — delegates to the approval gateway.
 */
export async function rejectConfirmation(req: Request, res: Response) {
  const functionName = "rejectConfirmation";
  const id = req.params.id as string;
  const organizationId = req.organizationId!;
  const userId = Number(req.userId);

  try {
    const result = await rejectAction(organizationId, id, userId);

    if (!result.success) {
      const statusCode = result.error?.includes("not found") ? 404 : 400;
      return res.status(statusCode).json(STATUS_CODE[statusCode as 404 | 400](result.error!));
    }

    logStructured("successful", `confirmation ${id} rejected`, functionName, fileName);
    return res.status(200).json(
      STATUS_CODE[200]({
        confirmation_id: id,
        status: "rejected",
      }),
    );
  } catch (error) {
    logStructured("error", "failed to reject confirmation", functionName, fileName);
    logger.error("Error in rejectConfirmation:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-confirmation/pending
 * List all pending confirmations (still from Redis for speed).
 */
export async function getPendingConfirmations(req: Request, res: Response) {
  const functionName = "getPendingConfirmations";
  const organizationId = req.organizationId!;

  try {
    const pending = await listPendingConfirmations(organizationId);

    logStructured(
      "successful",
      `fetched ${pending.length} pending confirmations`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](pending));
  } catch (error) {
    logStructured("error", "failed to list pending confirmations", functionName, fileName);
    logger.error("Error in getPendingConfirmations:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
