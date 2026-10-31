import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { getFormReviewDaysQuery, updateFormReviewDaysQuery } from "../utils/intakeForm.utils";
import { parseReviewDays } from "../services/intakeConfirmation/reviewTime";
import { MAX_REVIEW_DAYS, MIN_REVIEW_DAYS } from "../constants/intakeReviewTime";

/**
 * An intake form's agreed review time in business days (#5189). A v1 resource
 * of its own: the unversioned /api/intake form contracts are frozen (ADR 0001).
 */

const parseFormId = (req: Request): number | null => {
  const raw = Array.isArray(req.params.formId) ? req.params.formId[0] : req.params.formId;
  if (!/^\d+$/.test(raw ?? "")) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export async function getIntakeFormReviewTime(req: Request, res: Response): Promise<any> {
  const formId = parseFormId(req);
  if (formId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }
  try {
    const reviewDays = await getFormReviewDaysQuery(formId, req.organizationId!);
    if (reviewDays === null) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }
    return res.status(200).json(STATUS_CODE[200]({ formId, reviewDays }));
  } catch (error) {
    logger.error(`Error reading the review time of intake form ${formId}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateIntakeFormReviewTime(req: Request, res: Response): Promise<any> {
  const formId = parseFormId(req);
  if (formId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }
  const reviewDays = parseReviewDays(req.body?.reviewDays);
  if (reviewDays === null) {
    return res.status(400).json(
      STATUS_CODE[400](
        req.t!("Review time must be a whole number of business days from {min} to {max}", {
          min: MIN_REVIEW_DAYS,
          max: MAX_REVIEW_DAYS,
        }),
      ),
    );
  }
  try {
    const stored = await updateFormReviewDaysQuery(formId, req.organizationId!, reviewDays);
    if (stored === null) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }
    logger.info(`Review time of intake form ${formId} set to ${stored} business days`);
    return res.status(200).json(STATUS_CODE[200]({ formId, reviewDays: stored }));
  } catch (error) {
    logger.error(`Error updating the review time of intake form ${formId}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
