// Servers/controllers/intakeTierSuggestion.ctrl.ts
// The risk tier suggested to an applicant before they submit (#5190), served
// under /api/v1 (ADR 0001). Public routes run behind resolvePublicIntakeForm,
// which sets res.locals.intakeForm.
import { NextFunction, Request, Response } from "express";
import { explainTier, suggestTier } from "../services/intakeTierSuggestion";
import { toLiveCheckLanguage } from "../services/intakeLiveChecks/aiChecks";
import { loadFormModel, resolvedForm, spendFormBudget } from "./intakePublicAi";
import { getTierSuggestionResponseQuery } from "../utils/intakeTierSuggestion.utils";
import logger from "../utils/logger/fileLogger";
import { translateRequest } from "../utils/i18n.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

const NO_RISK_STEP_MESSAGE = "This form has no risk classification step";
const BAD_RESPONSE_MESSAGE = "The response to the suggested risk level is invalid";
export const MAX_TIER_CONTEXT_CHARS = 1000;

/** Sent to res.locals by takeTierSuggestionResponse; read by the submit handlers. */
export interface ApplicantTierResponse {
  accepted: boolean;
  context: string | null;
}

/** POST .../intake-tier-suggestion/public/... — body `{ answers }` → the suggestion. */
export async function postPublicTierSuggestion(req: Request, res: Response) {
  const { form } = resolvedForm(res);
  if (!form.euAiActRiskStepEnabled) {
    return res.status(404).json(STATUS_CODE[404](translateRequest(req, NO_RISK_STEP_MESSAGE)));
  }
  const outcome = suggestTier(req.body?.answers);
  if (!outcome.ok) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: translateRequest(req, outcome.message),
        errors: outcome.errors,
      }),
    );
  }
  return res.status(200).json(STATUS_CODE[200](outcome.suggestion));
}

/**
 * POST .../explain — body `{ answers, language }` → `{ explanation }`, or
 * `{ explanation: null, error: "unavailable" }` when AI is off or fails.
 * The answers leave the server only here, when the applicant asks.
 */
export async function postPublicTierExplanation(req: Request, res: Response) {
  const { form } = resolvedForm(res);
  if (!form.euAiActRiskStepEnabled) {
    return res.status(404).json(STATUS_CODE[404](translateRequest(req, NO_RISK_STEP_MESSAGE)));
  }
  const outcome = suggestTier(req.body?.answers);
  if (!outcome.ok) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: translateRequest(req, outcome.message),
        errors: outcome.errors,
      }),
    );
  }
  const unavailable = () =>
    res.status(200).json(STATUS_CODE[200]({ explanation: null, error: "unavailable" }));

  try {
    const model = await loadFormModel(resolvedForm(res));
    if (!model) return unavailable();
    if (!(await spendFormBudget(req, res, form.id, "explain"))) return res;

    const result = await explainTier({
      suggestion: outcome.suggestion,
      answers: (req.body.answers ?? {}) as Record<string, string | string[]>,
      language: toLiveCheckLanguage(req.body?.language),
      model,
    });
    if (!result.ok) return unavailable();
    return res.status(200).json(STATUS_CODE[200]({ explanation: result.points }));
  } catch (error) {
    // The message only: never the answers or the key.
    logger.error(
      `Error in postPublicTierExplanation for form ${form.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return unavailable();
  }
}

/**
 * v1 public submit adapter: takes the optional `tierSuggestionResponse`
 * `{ accepted, context }` off the body into res.locals, then the legacy submit
 * handler runs unchanged. The legacy routes never set it.
 */
export function takeTierSuggestionResponse(req: Request, res: Response, next: NextFunction) {
  const raw = req.body?.tierSuggestionResponse;
  if (req.body && typeof req.body === "object") delete req.body.tierSuggestionResponse;
  if (raw === undefined || raw === null) return next();

  const context = raw?.context;
  if (
    typeof raw !== "object" ||
    typeof raw.accepted !== "boolean" ||
    (context !== undefined &&
      context !== null &&
      (typeof context !== "string" || context.length > MAX_TIER_CONTEXT_CHARS))
  ) {
    return res.status(400).json(STATUS_CODE[400](translateRequest(req, BAD_RESPONSE_MESSAGE)));
  }
  const trimmed = typeof context === "string" ? context.trim() : "";
  res.locals.tierSuggestionResponse = {
    accepted: raw.accepted,
    context: trimmed === "" ? null : trimmed,
  } satisfies ApplicantTierResponse;
  return next();
}

/** GET .../intake-tier-suggestion/submissions/:id — the applicant's response, or null. */
export async function getSubmissionTierSuggestionResponse(req: Request, res: Response) {
  const submissionId = Number(req.params.id);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }
  try {
    const response = await getTierSuggestionResponseQuery(submissionId, req.organizationId!);
    if (response === undefined) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    return res.status(200).json(STATUS_CODE[200]({ response }));
  } catch (error) {
    logger.error(`Error in getSubmissionTierSuggestionResponse for ${submissionId}`, error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
}
