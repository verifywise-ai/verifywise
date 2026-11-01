/**
 * The verifier: one batched model call over the findings that are about to be stored.
 *
 * The validation (see validation.ts) checks a finding with code: the quote is in the source, the
 * source names the vendor, the category has evidence in the pack. What code cannot read is
 * meaning. A source can name the vendor and be about another company of the same name; a
 * quote can be in the source and say less than the claim states; a matter can be older than the
 * window of its category when the source has no date to show it. The verifier asks the model three
 * questions about every finding, in a prompt that holds the claim and the quotes it cites and no
 * other web text (see `buildVerifierUserPrompt`):
 *
 * - `same_company`: are the sources about the vendor, and not about another company with a
 *   similar name?
 * - `quote_supports_claim`: does the quote say what the claim says?
 * - `source_in_window`: is the matter inside the lookback window of its category?
 *
 * A finding with a `false` answer is not passed: the pipeline does not store it, and the trace says
 * which question it failed (`verifier.other_company`, `verifier.not_supported`,
 * `verifier.out_of_window` in `dropped`, and a rejection with the start of the claim). The model is
 * told to answer `true` when it cannot tell, and a finding that has no verdict is passed: only an
 * answer takes a finding away.
 *
 * It never fails a run. A model that does not answer in time or at all, or that answers badly,
 * passes every finding, and the call is recorded as failed; the message of its error is neither
 * stored nor logged, because it can quote the request or hold a key.
 */
import { z } from "zod";
import type { TokenUsage, generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import type { NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import type { SourceProvenance } from "./evidence";
import { buildVerifierSystemPrompt, buildVerifierUserPrompt } from "./prompts";
import type { ResearchTarget } from "./target";
import { cleanText, cutAtCodePoint } from "./text";
import type { TraceRecorder } from "./trace";
import { MAX_PER_RUN } from "./validation";

/** The call is short; a model that needs longer is left out and the findings are passed. */
export const VERIFIER_TIMEOUT_MS = 30_000;

/** How much of a claim a rejection keeps, to recognise it by. */
const REJECTED_TEXT_CHARS = 120;

export const verifierSchema = z.object({
  verdicts: z
    .array(
      z.object({
        /** The number of the finding in the prompt, from 1. */
        finding: z.number().int().min(1),
        same_company: z.boolean(),
        quote_supports_claim: z.boolean(),
        source_in_window: z.boolean(),
      }),
    )
    .max(MAX_PER_RUN),
});

export type Verdicts = z.infer<typeof verifierSchema>;

/** The questions, in the order they are held against a finding, and what a false answer is called. */
const QUESTIONS = [
  { question: "same_company", reason: "other_company" },
  { question: "quote_supports_claim", reason: "not_supported" },
  { question: "source_in_window", reason: "out_of_window" },
] as const;

export type VerifierRejection = (typeof QUESTIONS)[number]["reason"];

export interface VerifierInput {
  target: ResearchTarget;
  /** The findings that stay, in the order the verdicts name them. */
  findings: readonly NewFinding[];
  /** The moment of the run, which the windows are counted back from. */
  now: Date;
  model: unknown;
  /** The id of the model, for the trace. */
  modelId?: string;
  generate: typeof generateObjectWithSelfCorrection;
  trace: TraceRecorder;
  /**
   * Where the sources came from, by address (see `provenanceOf`). The verifier reads only the
   * database of a record: a cited entry of a public database is shown with its name.
   */
  provenance?: ReadonlyMap<string, SourceProvenance>;
  /** Aborted when the run is abandoned: no call is started and the one in flight is aborted. */
  signal?: AbortSignal;
}

/**
 * For each finding, in order: whether it passes the verifier. A finding fails when a verdict says
 * `false` to a question; one with no verdict passes. Never rejects.
 */
export async function verifierPasses(input: VerifierInput): Promise<boolean[]> {
  const { target, findings, now, model, modelId, generate, trace, provenance } = input;
  if (findings.length === 0) return [];
  // The run is abandoned: nothing is asked, and the answer is ignored.
  if (input.signal?.aborted) return findings.map(() => true);

  const startedAt = Date.now();
  // What the call used, counted as the call reports it, so that a call that ends by throwing still
  // says what it cost.
  const used: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let verdicts: Verdicts["verdicts"];
  try {
    const result = await generate({
      model,
      schema: verifierSchema,
      system: buildVerifierSystemPrompt(now),
      prompt: buildVerifierUserPrompt(target, findings, (url) => provenance?.get(url)?.record),
      temperature: 0,
      innerMaxRetries: 1,
      maxSelfCorrectionAttempts: 1,
      onUsage: (usage) => {
        used.inputTokens += usage.inputTokens;
        used.outputTokens += usage.outputTokens;
        used.totalTokens += usage.totalTokens;
      },
      extra: {
        abortSignal:
          input.signal === undefined
            ? AbortSignal.timeout(VERIFIER_TIMEOUT_MS)
            : AbortSignal.any([AbortSignal.timeout(VERIFIER_TIMEOUT_MS), input.signal]),
      },
    });
    verdicts = result.object.verdicts;
    trace.modelCall({
      purpose: "verifier",
      model: modelId,
      ms: Date.now() - startedAt,
      attempts: result.attempts,
      ...(result.usage ?? used),
      ok: true,
    });
  } catch {
    trace.modelCall({
      purpose: "verifier",
      model: modelId,
      ms: Date.now() - startedAt,
      ...used,
      ok: false,
    });
    return findings.map(() => true);
  }

  return findings.map((finding, index) => {
    const own = verdicts.filter((verdict) => verdict.finding === index + 1);
    const failed = QUESTIONS.find(({ question }) => own.some((verdict) => !verdict[question]));
    if (failed === undefined) return true;

    trace.dropped(`verifier.${failed.reason}`);
    trace.rejected({
      stage: "verifier",
      reason: failed.reason,
      category: finding.category,
      text: cutAtCodePoint(cleanText(finding.risk_description), REJECTED_TEXT_CHARS),
    });
    return false;
  });
}
