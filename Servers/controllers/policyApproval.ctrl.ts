/**
 * /api/v1/policies approval endpoints (submit for approval, Admin direct
 * approve, approval state). Thin handlers: the rules live in
 * services/policies/policyApproval.service.ts, which opens its own
 * transactions, so nothing here wraps them.
 */
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import * as policyApprovalService from "../services/policies/policyApproval.service";
import { policyValidationExceptionResponse } from "./policy.ctrl";
import { translateError } from "../utils/i18n.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

const FILE_NAME = "policyApproval.ctrl.ts";

/** Positive integer policy id from the path, or null. */
function parsePolicyId(req: Request): number | null {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!/^\d+$/.test(String(raw ?? ""))) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Maps the service's domain errors to HTTP. Returns null for anything else,
 * which the caller answers with 500.
 */
function sendDomainError(req: Request, res: Response, error: unknown): Response | null {
  if (error instanceof ValidationException) {
    return res.status(400).json(policyValidationExceptionResponse(req, error));
  }
  if (error instanceof NotFoundException) {
    return res.status(404).json(STATUS_CODE[404](translateError(req, error)));
  }
  if (error instanceof ForbiddenException) {
    return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
  }
  if (error instanceof ConflictException) {
    return res.status(409).json(STATUS_CODE[409](translateError(req, error)));
  }
  return null;
}

/** Domain errors are expected outcomes, not failures worth an error log. */
const isDomainError = (error: unknown): boolean =>
  error instanceof ValidationException ||
  error instanceof NotFoundException ||
  error instanceof ForbiddenException ||
  error instanceof ConflictException;

const invalidIdResponse = (req: Request, res: Response) =>
  res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));

// POST /v1/policies/:id/submit-for-approval  body { workflow_id?: number }
export async function submitPolicyForApproval(req: Request, res: Response) {
  const userId = req.userId!;
  const organizationId = req.organizationId!;
  const policyId = parsePolicyId(req);
  if (policyId === null) return invalidIdResponse(req, res);

  const rawWorkflowId = req.body?.workflow_id;
  let workflowId: number | undefined;
  if (rawWorkflowId !== undefined && rawWorkflowId !== null) {
    if (!Number.isSafeInteger(rawWorkflowId) || rawWorkflowId <= 0) {
      return res
        .status(400)
        .json(
          policyValidationExceptionResponse(
            req,
            new ValidationException(
              policyApprovalService.POLICY_APPROVAL_MESSAGES.unusableWorkflow,
              "workflow_id",
              rawWorkflowId,
            ),
          ),
        );
    }
    workflowId = rawWorkflowId;
  }

  logProcessing({
    description: `Submitting policy ${policyId} for approval`,
    functionName: "submitPolicyForApproval",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const result = await policyApprovalService.submitPolicyForApproval({
      orgId: organizationId,
      policyId,
      userId,
      workflowId,
    });
    await logSuccess({
      eventType: "Create",
      description: `Policy ${policyId} submitted for approval (request ${result.request_id})`,
      functionName: "submitPolicyForApproval",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });
    return res.status(201).json(STATUS_CODE[201](result));
  } catch (error) {
    if (!isDomainError(error)) {
      await logFailure({
        eventType: "Create",
        description: `Failed to submit policy ${policyId} for approval`,
        functionName: "submitPolicyForApproval",
        fileName: FILE_NAME,
        error: error as Error,
        userId,
        organizationId,
      });
    }
    return (
      sendDomainError(req, res, error) ??
      res.status(500).json(STATUS_CODE[500](translateError(req, error)))
    );
  }
}

// POST /v1/policies/:id/approve  body { comment?: string }
export async function approvePolicyDirectly(req: Request, res: Response) {
  const userId = req.userId!;
  const organizationId = req.organizationId!;
  const policyId = parsePolicyId(req);
  if (policyId === null) return invalidIdResponse(req, res);

  logProcessing({
    description: `Approving policy ${policyId} directly`,
    functionName: "approvePolicyDirectly",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const policy = await policyApprovalService.approvePolicyDirectly({
      orgId: organizationId,
      policyId,
      userId,
      role: req.role,
      comment: req.body?.comment,
    });
    await logSuccess({
      eventType: "Update",
      description: `Policy ${policyId} approved directly`,
      functionName: "approvePolicyDirectly",
      fileName: FILE_NAME,
      userId,
      organizationId,
    });
    return res.status(200).json(STATUS_CODE[200](policy));
  } catch (error) {
    if (!isDomainError(error)) {
      await logFailure({
        eventType: "Update",
        description: `Failed to approve policy ${policyId}`,
        functionName: "approvePolicyDirectly",
        fileName: FILE_NAME,
        error: error as Error,
        userId,
        organizationId,
      });
    }
    return (
      sendDomainError(req, res, error) ??
      res.status(500).json(STATUS_CODE[500](translateError(req, error)))
    );
  }
}

// GET /v1/policies/:id/approval
export async function getPolicyApprovalState(req: Request, res: Response) {
  const userId = req.userId!;
  const organizationId = req.organizationId!;
  const policyId = parsePolicyId(req);
  if (policyId === null) return invalidIdResponse(req, res);

  try {
    const state = await policyApprovalService.getPolicyApprovalState({
      orgId: organizationId,
      policyId,
      userId,
      role: req.role,
    });
    return res.status(200).json(STATUS_CODE[200](state));
  } catch (error) {
    if (!isDomainError(error)) {
      await logFailure({
        eventType: "Read",
        description: `Failed to read the approval state of policy ${policyId}`,
        functionName: "getPolicyApprovalState",
        fileName: FILE_NAME,
        error: error as Error,
        userId,
        organizationId,
      });
    }
    return (
      sendDomainError(req, res, error) ??
      res.status(500).json(STATUS_CODE[500](translateError(req, error)))
    );
  }
}
