import CustomAxios from "../../infrastructure/api/customAxios";
import { apiServices } from "../../infrastructure/api/networkServices";
import type { Answers, ClassificationResult } from "../../domain/types/euAiActClassification";
import { submitPublicForm, type PublicFormRef } from "./intakeForm.repository";

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

function publicBase(ref: PublicFormRef): string {
  return "publicId" in ref
    ? `${BASE}/public/by-id/${encodeURIComponent(ref.publicId)}`
    : `${BASE}/public/${encodeURIComponent(ref.tenantSlug)}/${encodeURIComponent(ref.formSlug)}`;
}

/** The rules engine's level and references for these answers. */
export async function postTierSuggestion(
  ref: PublicFormRef,
  answers: Answers,
  signal?: AbortSignal,
): Promise<TierSuggestion> {
  const response = await CustomAxios.post(publicBase(ref), { answers }, {
    signal,
    suppressGlobalErrorToast: true,
  } as Record<string, unknown>);
  return response.data.data as TierSuggestion;
}

/**
 * A plain-language explanation, only when the applicant asks. Null when AI is
 * off for the form or the explanation could not be made.
 */
export async function postTierExplanation(
  ref: PublicFormRef,
  answers: Answers,
  language: string,
): Promise<string | null> {
  const response = await CustomAxios.post(`${publicBase(ref)}/explain`, { answers, language }, {
    suppressGlobalErrorToast: true,
  } as Record<string, unknown>);
  const explanation = (response.data?.data as { explanation?: unknown })?.explanation;
  return typeof explanation === "string" && explanation ? explanation : null;
}

type PublicSubmitPayload = Parameters<typeof submitPublicForm>[2];

/** Submits the form with the applicant's response to the suggestion (v1 submit). */
export async function submitPublicFormWithTierResponse(
  ref: PublicFormRef,
  data: PublicSubmitPayload & { tierSuggestionResponse: TierSuggestionResponseInput },
): Promise<Awaited<ReturnType<typeof submitPublicForm>>> {
  const response = await apiServices.post(`${publicBase(ref)}/submit`, data);
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
