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
import { toStrictId } from "../utils/validations/validation.utils";

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
    // Strict for everyone: an id the handler might parse differently
    // (" 1", "1e0", "0x1") is a 400, never passed on unchecked. The parsed id
    // is kept for the handler.
    const submissionId = toStrictId(req.params.id);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
    }
    res.locals.submissionId = submissionId;
    const submitter = await submitterScope(req);
    if (submitter === undefined) return next();
    if (await isOwnSubmissionQuery(submissionId, submitter, req.organizationId!)) {
      return next();
    }
    return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
  } catch (error) {
    return next(error);
  }
};
