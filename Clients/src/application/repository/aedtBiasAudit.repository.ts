/**
 * Application-layer wrapper for the NYC Local Law 144 bias audit module.
 *
 * Wraps `aedtBiasAuditService` the way `deepEval.repository.ts` wraps its
 * services, and turns a refused request into the message the page shows.
 */
import axios from "axios";
import {
  aedtBiasAuditService,
  type AedtAnswerInput,
} from "../../infrastructure/api/aedtBiasAuditService";
import { filenameFromContentDisposition } from "../utils/contentDisposition";

export type {
  AedtAnswerInput,
  AedtAttestedDecision,
  AedtAuditResult,
  AedtCategoryTable,
  AedtCreateRunResult,
  AedtDerivedBasis,
  AedtGateFinding,
  AedtGroupResult,
  AedtOption,
  AedtPredicate,
  AedtProfileAnswer,
  AedtProfileView,
  AedtQuestion,
  AedtReadiness,
  AedtRun,
  AedtRunMetric,
  AedtRunSummary,
  AedtRunView,
  AedtScopeDetermination,
  AedtStanceCreated,
  AedtStanceRow,
  AedtTrendBreak,
  AedtTrendPoint,
  AedtTrendSegment,
  AedtTrendSeries,
} from "../../infrastructure/api/aedtBiasAuditService";

/** The one framework this module serves (NYC Local Law 144, `Servers/structures`). */
export const LL144_FRAMEWORK_ID = 12;

export const getAedtQuestions = (projectId: number) =>
  aedtBiasAuditService.getQuestions(projectId, LL144_FRAMEWORK_ID);

export const getAedtProfile = (projectId: number) =>
  aedtBiasAuditService.getProfile(projectId, LL144_FRAMEWORK_ID);

export const saveAedtAnswers = (projectId: number, answers: AedtAnswerInput[]) =>
  aedtBiasAuditService.saveAnswers(projectId, LL144_FRAMEWORK_ID, answers);

export const attestAedtProfile = (projectId: number) =>
  aedtBiasAuditService.attestProfile(projectId, LL144_FRAMEWORK_ID);

export const generateAedtScopeDetermination = (projectId: number) =>
  aedtBiasAuditService.generateScopeDetermination(projectId, LL144_FRAMEWORK_ID);

export const createAedtRun = (
  projectId: number,
  file: File,
  mapping: Record<string, string>,
  jobDescription: string,
) =>
  aedtBiasAuditService.createRun({
    projectId,
    frameworkId: LL144_FRAMEWORK_ID,
    file,
    mapping,
    jobDescription,
  });

export const listAedtRuns = (projectId: number) =>
  aedtBiasAuditService.listRuns(projectId, LL144_FRAMEWORK_ID);

export const getAedtRunTrend = (projectId: number) =>
  aedtBiasAuditService.getRunTrend(projectId, LL144_FRAMEWORK_ID);

export const getAedtRun = (runId: number) => aedtBiasAuditService.getRun(runId);

export const confirmAedtDerivedBasis = (runId: number) =>
  aedtBiasAuditService.confirmDerivedBasis(runId);

export const generateAedtRunStance = (runId: number) =>
  aedtBiasAuditService.generateRunStance(runId);

/** The stance PDF and the name to save it as (RFC 5987 `filename*=` included). */
export async function downloadAedtStance(
  stanceId: number,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, disposition } = await aedtBiasAuditService.downloadStance(stanceId);
  return {
    blob,
    filename: filenameFromContentDisposition(disposition, `stance-${stanceId}.pdf`),
  };
}

// ------------------------------------------------------------------ errors

export interface AedtRequestError {
  /** HTTP status, or null for a network failure. */
  status: number | null;
  /** What the page shows. The server writes 4xx messages for the user. */
  message: string;
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again later.";

/**
 * The server's own message for a 4xx refusal (404, 409, 410, 413, 415, 422
 * and the rest), carried in the `data` field of the error envelope. A 5xx or
 * a network failure gets the generic message only: its body is not written
 * for the user.
 */
export function describeAedtError(error: unknown): AedtRequestError {
  if (!axios.isAxiosError(error)) {
    return { status: null, message: GENERIC_ERROR_MESSAGE };
  }
  const status = error.response?.status ?? null;
  if (status === null || status >= 500) {
    return { status, message: GENERIC_ERROR_MESSAGE };
  }
  const body = error.response?.data as { data?: unknown; message?: unknown } | undefined;
  if (typeof body?.data === "string" && body.data.trim() !== "") {
    return { status, message: body.data };
  }
  if (body?.data && typeof body.data === "object") {
    const inner = body.data as { message?: unknown };
    if (typeof inner.message === "string") return { status, message: inner.message };
  }
  if (typeof body?.message === "string" && body.message.trim() !== "") {
    return { status, message: body.message };
  }
  return { status, message: GENERIC_ERROR_MESSAGE };
}
