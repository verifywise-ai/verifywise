/**
 * Decision 5 for an intake submission named by id: whoever manages intake
 * (intakeForm.edit) may open any submission; anyone else only one they sent
 * (submittedBySql). Someone else's submission answers 404, as a missing one
 * does, so its existence is not revealed.
 *
 * Mount after authenticateJWT on routes whose :id is a submission id.
 */
import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { requestHasPermission } from "../utils/rolePermissions.utils";
import { isOwnSubmissionQuery } from "../utils/intakeForm.utils";
import { toId } from "../utils/validations/validation.utils";

/**
 * The submitter a submission list or count is limited to: undefined for an
 * intake manager (intakeForm.edit), who sees every submission; otherwise the
 * caller, who sees only their own (submittedBySql).
 */
export const submitterScope = async (req: Request): Promise<number | undefined> =>
  (await requestHasPermission(req, "intakeForm.edit")) ? undefined : req.userId!;

export const requireOwnSubmissionOrIntakeManager = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const submitter = await submitterScope(req);
    if (submitter === undefined) return next();
    const submissionId = toId(req.params.id);
    // A malformed id is left to the handler's own 400.
    if (!Number.isSafeInteger(submissionId) || submissionId <= 0) return next();
    if (await isOwnSubmissionQuery(submissionId, submitter, req.organizationId!)) {
      return next();
    }
    return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
  } catch (error) {
    return next(error);
  }
};
