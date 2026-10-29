// Servers/services/intakeLiveChecks/submit.ts
// Live checks stored with a public submission: rule hints recomputed on the
// server, the AI stage left pending for the assessment job (or skipped without
// a key), and prefill provenance kept only from tokens the server signed.
// Nothing here may fail or block the submit: errors are logged, not thrown.
import type { IIntakeForm } from "../../domain.layer/interfaces/i.intakeForm";
import type {
  ILiveChecks,
  PrefillProvenance,
} from "../../domain.layer/interfaces/i.intakeLiveChecks";
import { updateLiveChecksQuery } from "../../utils/intakeForm.utils";
import logger from "../../utils/logger/fileLogger";
import type { FormSchema } from "../intakeRiskScoring.service";
import { enqueueIntakeAssessment } from "../intakeScoring/enqueue";
import { toLiveCheckLanguage } from "./aiChecks";
import { isPlainObject } from "./answers";
import { formAiAvailable } from "./availability";
import { TIMED_OUT, withDeadline } from "./deadline";
import { verifyPrefillToken } from "./prefill";
import { runRuleChecks } from "./rules";

/**
 * Prefill entries whose token verifies for this form, question and submitted
 * value. Body shape `{ [questionId]: { token, confirmed } }`; provenance comes
 * from the token only, never from the body.
 */
function verifiedPrefill(
  formId: number,
  data: Record<string, unknown>,
  prefill: unknown,
  now: number,
): Record<string, PrefillProvenance> {
  if (!isPlainObject(prefill)) return {};
  const kept: Array<[string, PrefillProvenance]> = [];
  for (const [questionId, entry] of Object.entries(prefill)) {
    // Only answers that were stored; bounds the work to the form's fields.
    if (!Object.prototype.hasOwnProperty.call(data, questionId)) continue;
    if (!isPlainObject(entry) || typeof entry.token !== "string") continue;
    const provenance = verifyPrefillToken(entry.token, formId, questionId, data[questionId], now);
    if (provenance) kept.push([questionId, { ...provenance, confirmed: entry.confirmed === true }]);
  }
  // fromEntries defines own properties, so a "__proto__" key cannot set a prototype.
  return Object.fromEntries(kept.filter(([questionId]) => questionId !== "__proto__"));
}

export function buildSubmitLiveChecks(params: {
  form: IIntakeForm;
  schema: FormSchema;
  data: Record<string, unknown>;
  prefill: unknown;
  aiAvailable: boolean;
  /** The submitter's language (Accept-Language); unsupported values give "en". */
  language?: unknown;
  now?: () => number;
}): ILiveChecks | null {
  const { form, schema, data, prefill, aiAvailable, language } = params;
  if (!form.liveChecksEnabled) return null;
  const now = (params.now ?? Date.now)();
  return {
    version: 1,
    rules: runRuleChecks(schema, data),
    ai: aiAvailable
      ? {
          status: "pending",
          hints: [],
          stageStartedAt: new Date(now).toISOString(),
          language: toLiveCheckLanguage(language),
        }
      : { status: "skipped", hints: [] },
    prefill: verifiedPrefill(form.id, data, prefill, now),
  };
}

/** How long submit waits for the live-check writes before it answers anyway. */
export const SUBMIT_LIVE_CHECKS_DEADLINE_MS = 2000;

export interface RecordSubmitLiveChecksDeps {
  aiAvailable: typeof formAiAvailable;
  save: typeof updateLiveChecksQuery;
  now: () => number;
  deadlineMs: number;
  /** Queues the AI stage on its own, for a write that finished after submit answered. */
  queueStage: (organizationId: number, submissionId: number) => Promise<void>;
}

const defaultDeps: RecordSubmitLiveChecksDeps = {
  aiAvailable: formAiAvailable,
  save: updateLiveChecksQuery,
  now: () => Date.now(),
  deadlineMs: SUBMIT_LIVE_CHECKS_DEADLINE_MS,
  queueStage: (organizationId, submissionId) =>
    enqueueIntakeAssessment({
      organizationId,
      submissionId,
      stages: ["liveChecks"],
      notify: false,
    }),
};

interface SubmitLiveChecksParams {
  /** The full saved form (with schema and LLM key), not the public form. */
  form: IIntakeForm | null;
  organizationId: number;
  submissionId: number;
  /** The cleaned answers as stored on the submission. */
  data: Record<string, unknown>;
  prefill: unknown;
  language?: unknown;
}

/**
 * Build and store a new submission's live checks, after the submission is
 * committed (a failed write never rolls it back). Returns true when the
 * submit's job should run the AI stage. Never throws: on any error it logs and
 * stores nothing. Waits at most `deadlineMs`; past that it returns false and
 * the write carries on, queueing the AI stage itself once it has stored a
 * pending status.
 */
export async function recordSubmitLiveChecks(
  params: SubmitLiveChecksParams,
  deps: Partial<RecordSubmitLiveChecksDeps> = {},
): Promise<boolean> {
  const { form } = params;
  if (!form?.liveChecksEnabled || !form.schema) return false;
  const d = { ...defaultDeps, ...deps };
  const write = storeSubmitLiveChecks({ ...params, form }, d);
  const result = await withDeadline(write, d.deadlineMs);
  if (result !== TIMED_OUT) return result;
  logger.warn(
    `Live checks for submission ${params.submissionId} took over ${d.deadlineMs} ms; submit did not wait`,
  );
  void write
    .then((pending) =>
      pending ? d.queueStage(params.organizationId, params.submissionId) : undefined,
    )
    .catch((error) =>
      logger.error(
        `Could not queue late live checks for submission ${params.submissionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  return false;
}

async function storeSubmitLiveChecks(
  params: SubmitLiveChecksParams & { form: IIntakeForm },
  d: RecordSubmitLiveChecksDeps,
): Promise<boolean> {
  const { form, organizationId, submissionId, data, prefill, language } = params;
  try {
    const aiAvailable = await d.aiAvailable(form, organizationId);
    const liveChecks = buildSubmitLiveChecks({
      form,
      schema: form.schema as unknown as FormSchema,
      data,
      prefill,
      aiAvailable,
      language,
      now: d.now,
    });
    if (!liveChecks) return false;
    await d.save(submissionId, organizationId, liveChecks);
    return liveChecks.ai.status === "pending";
  } catch (error) {
    logger.error(
      `Could not store live checks for submission ${submissionId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
