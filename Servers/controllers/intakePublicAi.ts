// Servers/controllers/intakePublicAi.ts
// Shared by the public intake endpoints that call the form's LLM: live checks,
// document prefill and the risk level explanation (#5190).
import { Request, Response } from "express";
import { createModelFromKey, LLMKeyRow } from "../advisor/llmModelFactory";
import type { ResolvedIntakeForm } from "../middleware/intakePublicForm.middleware";
import {
  consumeFormBudget,
  FORM_BUDGET_PER_HOUR,
  type FormBudgetEndpoint,
} from "../services/intakeLiveChecks/formBudget";
import { getLLMKeyWithKeyByIdQuery } from "../utils/llmKey.utils";
import { translateRequest } from "../utils/i18n.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

const BUDGET_MESSAGES: Record<FormBudgetEndpoint, string> = {
  checks: "AI checks are paused for this form. Please try again later.",
  prefill: "Reading documents is paused for this form. Please try again later.",
  explain: "Explanations are paused for this form. Please try again later.",
};

export const resolvedForm = (res: Response): ResolvedIntakeForm =>
  res.locals.intakeForm as ResolvedIntakeForm;

/** The form's model, or null when live checks are off or the key is gone. */
export async function loadFormModel({
  form,
  organizationId,
}: ResolvedIntakeForm): Promise<unknown> {
  if (!form.liveChecksEnabled || form.llmKeyId == null) return null;
  const row = await getLLMKeyWithKeyByIdQuery(form.llmKeyId, organizationId);
  return row ? createModelFromKey(row as unknown as LLMKeyRow) : null;
}

/** Counts one call against the form's hourly budget; answers 429 and returns false when spent. */
export async function spendFormBudget(
  req: Request,
  res: Response,
  formId: number,
  endpoint: FormBudgetEndpoint,
): Promise<boolean> {
  if (await consumeFormBudget(formId, endpoint, FORM_BUDGET_PER_HOUR[endpoint])) return true;
  // The budget is per clock hour; tell the page how long to stay quiet.
  const secondsToNextHour = 3600 - (Math.floor(Date.now() / 1000) % 3600);
  res.set("Retry-After", String(secondsToNextHour));
  res.set("RateLimit-Reset", String(secondsToNextHour));
  res.status(429).json(STATUS_CODE[429](translateRequest(req, BUDGET_MESSAGES[endpoint])));
  return false;
}
