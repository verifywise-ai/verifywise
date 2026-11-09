import CustomAxios from "../../infrastructure/api/customAxios";
import { apiServices } from "../../infrastructure/api/networkServices";
import type { Answers, ClassificationResult } from "../../domain/types/euAiActClassification";
import { publicBase, submitPublicForm, type PublicFormRef } from "./intakeForm.repository";

/** The risk tier suggested to an applicant from their risk step answers (#5190). */
export interface TierSuggestion {
  questionnaireVersion: number;
  level: ClassificationResult["level"];
  reasons: ClassificationResult["reasons"];
  obligations: ClassificationResult["obligations"];
}

/** What the applicant said about the suggestion; stored with the submission. */
export interface TierSuggestionResponseInput {
  accepted: boolean;
  context?: string;
}

/** As stored and shown to reviewers. */
export interface StoredTierSuggestionResponse {
  suggestedLevel: string;
  questionnaireVersion: number;
  accepted: boolean;
  context: string | null;
  respondedAt: string;
}

const BASE = "/v1/intake-tier-suggestion";

const publicTierBase = (ref: PublicFormRef) => publicBase(ref, BASE);

/** The rules engine's level and references for these answers. */
export async function postTierSuggestion(
  ref: PublicFormRef,
  answers: Answers,
  signal?: AbortSignal,
): Promise<TierSuggestion> {
  const response = await CustomAxios.post(publicTierBase(ref), { answers }, {
    signal,
    suppressGlobalErrorToast: true,
  } as Record<string, unknown>);
  return response.data.data as TierSuggestion;
}

/** One plain-language point, with the engine's reference for it (never the AI's). */
export interface TierExplanationPoint {
  text: string;
  article: string;
}

/**
 * A plain-language explanation, only when the applicant asks. Null when AI is
 * off for the form or the explanation could not be made.
 */
export async function postTierExplanation(
  ref: PublicFormRef,
  answers: Answers,
  language: string,
): Promise<TierExplanationPoint[] | null> {
  const response = await CustomAxios.post(`${publicTierBase(ref)}/explain`, { answers, language }, {
    suppressGlobalErrorToast: true,
  } as Record<string, unknown>);
  const explanation = (response.data?.data as { explanation?: unknown })?.explanation;
  if (!Array.isArray(explanation) || explanation.length === 0) return null;
  return explanation.filter(
    (p): p is TierExplanationPoint => typeof p?.text === "string" && typeof p?.article === "string",
  );
}

type PublicSubmitPayload = Parameters<typeof submitPublicForm>[2];

/** Submits the form with the applicant's response to the suggestion (v1 submit). */
export async function submitPublicFormWithTierResponse(
  ref: PublicFormRef,
  data: PublicSubmitPayload & { tierSuggestionResponse: TierSuggestionResponseInput },
): Promise<Awaited<ReturnType<typeof submitPublicForm>>> {
  const response = await apiServices.post(`${publicTierBase(ref)}/submit`, data);
  return response.data as Awaited<ReturnType<typeof submitPublicForm>>;
}

/** Reviewers: the applicant's response for a submission, or null. */
export async function getSubmissionTierSuggestionResponse(
  submissionId: number,
): Promise<StoredTierSuggestionResponse | null> {
  const response = await apiServices.get(`${BASE}/submissions/${submissionId}`);
  return (
    (response.data as { data?: { response?: StoredTierSuggestionResponse | null } })?.data
      ?.response ?? null
  );
}
