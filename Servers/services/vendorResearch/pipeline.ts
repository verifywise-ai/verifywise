/**
 * The vendor research pipeline: what one run does between "queued" and "completed" or "failed".
 *
 * Mark the run running, load the vendor and the model of its organisation, let the research loop
 * collect sources on the web (see researchAgent.ts), pack its ledger into an evidence pack, make
 * one structured model call, validate the answer, drop what is already known, cap what is left (in
 * that order), and store the findings together with the end of the run and the summary of each
 * category (see summary.ts).
 *
 * What the loop leaves decides how the run goes on. A model error of the loop fails the run when
 * no usable source was found, and so does a loop that never got an answer from the web: the model
 * never searched or read, or no call was answered. A loop whose calls were answered and found
 * nothing completes the run without an analysis call. A loop that stopped early, for its time, its
 * steps or a model error, still hands what it found to the analysis.
 *
 * The queries that end a run (finishRunQuery) have no status guard, so a run is ended exactly once.
 * The code is built so that this can be seen:
 *
 * - `decide` does all the work up to the point of writing, and never rejects. It returns a decision:
 *   fail the run, or complete it with these findings. Any error inside it becomes a "fail".
 * - A "fail" is written by `recordFailure`, one best-effort call that never rejects.
 * - A "complete" is written by `completeRun`, the only caller of `sequelize.transaction`. The
 *   findings and the end of the run are saved in that one transaction. If it rejects, nothing was
 *   saved and the run is failed once, outside the transaction. Once it has resolved, the function
 *   returns: nothing after the commit can fail the run.
 *
 * Only a failure to mark the run running is rethrown. The run is still queued then, so a retry of
 * the job can start it.
 *
 * This module logs nothing that a third party or the model wrote: no snippets, excerpts, URLs,
 * quotes, prompts or answers. The message of an error of a model call, in the loop or in the
 * analysis, is neither stored nor logged either, because it can quote the request or hold a key.
 * The run records a fixed phrase and the log line the name and the HTTP status of the error. A
 * rejection of the researcher is a bug of the web session, whose message can hold what a page or a
 * URL holds: only its name is logged. The self-correcting call (advisor/llmSelfCorrect.ts) logs on
 * its own account when it gives up on an answer: the path and message of the first three schema
 * issues, which are generic: the schema drops an unexpected property instead of reporting it, so
 * no property name that the model chose is in them (nor in the system prompt of a retry, which
 * quotes the same messages). It does not log the message of a provider error.
 *
 * The message of any other error, such as a database error that names a host, a port or a query, is
 * logged but not stored: the run is served to every role, so it records a fixed phrase.
 */
import { wrapLanguageModel } from "ai";
import { createModelFromKey, resolveModelId } from "../../advisor/llmModelFactory";
import {
  type generateObjectWithSelfCorrection,
  jsonObjectFallbackMiddleware,
} from "../../advisor/llmSelfCorrect";
import { sequelize } from "../../database/db";
import {
  CategorySummaryEntry,
  EvidenceSource,
  NewFinding,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import logger from "../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  FinishRunInput,
  finishRunQuery,
  getFindingsForVendorQuery,
  insertFindingsQuery,
  markRunRunningQuery,
} from "../../utils/vendorResearch.utils";
import { getVendorRisksByVendorIdQuery } from "../../utils/vendorRisk.utils";
import { researchableCategories } from "./categories";
import { dropDuplicates } from "./dedupe";
import { buildEvidencePack } from "./evidence";
import { PROMPT_VERSION, buildSystemPrompt, buildUserPrompt } from "./prompts";
// Types only: the researcher is injected, so loading the pipeline loads no web module.
import type { ResearchResult, VendorResearcher } from "./researchAgent";
import { ResearchOutput, researchOutputSchema } from "./schema";
import { summariseCategories, workedCategories } from "./summary";
import { buildTarget } from "./target";
import { cutAtCodePoint } from "./text";
import { applyCaps, validateFindings } from "./validation";

export interface PipelineDeps {
  /** Runs the research loop for a vendor: the web search and page reads. */
  research: VendorResearcher;
  /** The model of the organisation, or null when it has no LLM key. */
  resolveModel: (organizationId: number) => Promise<{ model: unknown; modelId: string } | null>;
  generate: typeof generateObjectWithSelfCorrection;
  now: () => Date;
}

export interface PipelineResult {
  outcome: "completed" | "failed" | "skipped";
  findingsCreated: number;
}

/** One deadline for the model call, retries and self-correction included. */
const MODEL_TIMEOUT_MS = 120_000;
/** The id of the model is stored cut to this many characters, the size of its column. */
const MODEL_MAX_CHARS = 255;

/** What a run records when no call of the research loop was answered by the web. */
const WEB_UNREACHABLE_NOTE = "The run stopped because the web could not be reached";
/** What a run records when the model never asked for a search or a read that reached the web. */
const NO_RESEARCH_ACTIONS_NOTE = "The model did not use the research actions";
/**
 * What a run records for an error that nothing planned for, and for findings that could not be
 * saved. The message of such an error goes to the log: it can name a host, a port or a query, and
 * the run is served to every role.
 */
const UNEXPECTED_ERROR_NOTE = "Unexpected error";
const SAVING_FAILED_NOTE = "Saving the findings failed";

/**
 * The model of the organisation's first LLM key, and the id of the model that key calls; null when
 * the organization has no key. Never logs the key.
 */
export async function resolveOrgModel(
  organizationId: number,
): Promise<{ model: unknown; modelId: string } | null> {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  const key = keys[0];
  if (!key) return null;
  return { model: createModelFromKey(key), modelId: resolveModelId(key) };
}

interface RunArgs {
  organizationId: number;
  vendorId: number;
  runId: number;
}

/** What a run has learned so far. It is the audit trail that a failed run records. */
interface Progress {
  /** The categories that the research loop worked on. */
  categories: ResearchCategory[];
  evidence: EvidenceSource[] | null;
  /** The model, once the research was about to start with it. */
  model: string | null;
  searchesUsed: number;
  pagesRead: number;
}

type Decision =
  | { kind: "fail"; outcome: "failed" | "skipped"; payload: FinishRunInput }
  | { kind: "complete"; findings: NewFinding[]; payload: FinishRunInput };

/** For log lines: no content, only ids. */
const tag = ({ organizationId, vendorId, runId }: RunArgs) =>
  `vendor research run ${runId} (vendor ${vendorId}, org ${organizationId})`;

/**
 * The top-level message of an error, for a log line. A cause nested inside it can carry raw model
 * output or request details, so it is left out. It never throws: it is called inside catch blocks,
 * where a throw would break the promise that the run is ended. A value that has no text form, such
 * as an object without a prototype or with a toString that throws, and an Error whose message is
 * not text all give "unknown error".
 */
function describeError(error: unknown): string {
  try {
    const message = error instanceof Error ? error.message : String(error);
    return message.trim() === "" ? "unknown error" : message;
  } catch {
    return "unknown error";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

/**
 * The HTTP status of a provider error, as a number, or null. The retry error of the SDK holds the
 * error that it gave up on as `lastError`, so that is looked at too.
 */
function httpStatusOf(error: unknown): number | null {
  const given = asRecord(error);
  for (const status of [given?.statusCode, asRecord(given?.lastError)?.statusCode]) {
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }
  }
  return null;
}

/** What a class name looks like, for example AI_APICallError. A name that does not is not trusted. */
const IDENTIFIER = /^[A-Za-z_$][\w$.]{0,59}$/;

/** The name of an error, for a log line, or "unknown" when it does not look like a class name. */
function errorName(error: unknown): string {
  const name = asRecord(error)?.name;
  return typeof name === "string" && IDENTIFIER.test(name) ? name : "unknown";
}

/**
 * What went wrong with a model call, in a few fixed words, and the name and HTTP status of the
 * error for the log. The message of a provider error can quote the request or hold a key, and an
 * inner cause can hold the raw answer, so neither is stored or logged. The kind of an error is
 * told from its name and its status, not from its class, so that the SDK is not imported for it. The
 * SDK names its errors with an AI_ prefix, for example AI_NoObjectGeneratedError.
 */
function describeModelFailure(error: unknown): {
  phrase: string;
  name: string;
  status: number | null;
} {
  const name = errorName(error);
  const status = httpStatusOf(error);
  if (status !== null) return { phrase: `HTTP ${status}`, name, status };
  if (name === "TimeoutError" || name === "AbortError") {
    return { phrase: "timed out", name, status };
  }
  if (name === "NoObjectGeneratedError" || name === "AI_NoObjectGeneratedError") {
    return { phrase: "the answer did not match the expected format", name, status };
  }
  return { phrase: "unexpected error", name, status };
}

/**
 * The phrase a run records for a failed model call, of the research loop or of the analysis. The
 * name and the HTTP status of the error are logged; its message is neither stored nor logged.
 */
function modelFailurePhrase(args: RunArgs, call: string, error: unknown): string {
  const failure = describeModelFailure(error);
  const status = failure.status === null ? "" : `, HTTP status ${failure.status}`;
  logger.warn(`${tag(args)}: the model call of ${call} failed (error ${failure.name}${status})`);
  return failure.phrase;
}

function finishInput(
  args: RunArgs,
  progress: Progress,
  end: Pick<FinishRunInput, "status" | "categorySummary" | "duplicatesDropped" | "error">,
): FinishRunInput {
  return {
    organizationId: args.organizationId,
    runId: args.runId,
    status: end.status,
    categories: progress.categories,
    categorySummary: end.categorySummary,
    evidence: progress.evidence,
    model: progress.model === null ? null : cutAtCodePoint(progress.model, MODEL_MAX_CHARS),
    promptVersion: PROMPT_VERSION,
    searchesUsed: progress.searchesUsed,
    pagesRead: progress.pagesRead,
    duplicatesDropped: end.duplicatesDropped,
    error: end.error,
  };
}

/**
 * The work of a run up to the point of writing. It reads, researches and calls the model, and
 * writes nothing. It may throw; `decide` turns that into a "fail".
 */
async function research(args: RunArgs, deps: PipelineDeps, progress: Progress): Promise<Decision> {
  const { organizationId, vendorId } = args;

  const stop = (
    error: string,
    categorySummary: CategorySummaryEntry[] = [],
    outcome: "failed" | "skipped" = "failed",
  ): Decision => ({
    kind: "fail",
    outcome,
    payload: finishInput(args, progress, {
      status: "failed",
      categorySummary,
      duplicatesDropped: 0,
      error,
    }),
  });
  const complete = (
    findings: NewFinding[],
    duplicatesDropped: number,
    categorySummary: CategorySummaryEntry[],
  ): Decision => ({
    kind: "complete",
    findings,
    payload: finishInput(args, progress, {
      status: "completed",
      categorySummary,
      duplicatesDropped,
      error: null,
    }),
  });

  const vendor = await getVendorByIdQuery(vendorId, organizationId);
  if (!vendor) return stop("Vendor not found", [], "skipped");

  // Before the research, so that an organisation without a key does not spend a search.
  const resolved = await deps.resolveModel(organizationId);
  if (!resolved) return stop("No LLM key configured");

  const target = buildTarget(vendor);
  // One clock for the loop and the analysis, so that both hold a source to the same window.
  const now = deps.now();
  progress.model = resolved.modelId;

  let found: ResearchResult;
  try {
    found = await deps.research({ target, model: resolved.model, now });
  } catch (error) {
    // A bug of the web session. Its message can hold what a page or a URL holds, so only the name
    // of the error is logged.
    logger.error(`${tag(args)}: the research failed (error ${errorName(error)})`);
    return stop(UNEXPECTED_ERROR_NOTE);
  }
  progress.categories = workedCategories(found.calls);
  progress.searchesUsed = found.searchesUsed;
  progress.pagesRead = found.pagesRead;
  logger.info(
    `${tag(args)}: the research loop stopped (${found.stoppedBecause}): ${found.searchesUsed} searches, ${found.pagesRead} pages read, ${found.entries.length} sources`,
  );

  const researchable = researchableCategories(target);
  const skippedNoDomain = RESEARCH_CATEGORIES.filter(
    (category) => !researchable.includes(category),
  );
  const summaryOf = (
    kept: NewFinding[],
    proposed: ReadonlySet<ResearchCategory>,
    modelNotes: ResearchOutput["category_notes"],
  ) =>
    summariseCategories({
      skippedNoDomain,
      calls: found.calls,
      kept,
      proposed,
      modelNotes,
      stoppedBecause: found.stoppedBecause,
    });

  // Built first: the failed-run rule asks whether anything usable is left, and an entry with an
  // unusable URL is not a source.
  const pack = buildEvidencePack(found.entries);

  // The failed-run rule, in this order. A model call that rejected with nothing in it leaves the
  // loop's error null, so the reason it stopped for decides, not the error.
  if (found.stoppedBecause === "model_error") {
    const phrase = modelFailurePhrase(args, "the research loop", found.modelError);
    // With a source, what was found before the model failed is still analysed.
    if (pack.length === 0) return stop(`Model call failed: ${phrase}`);
  }
  // The model answered with prose or invalid steps until the loop ended.
  if (found.calls.length === 0) return stop(NO_RESEARCH_ACTIONS_NOTE);
  // A blocked search is not "nothing found": the summary says which categories could not look.
  if (found.calls.every((call) => !call.answered)) {
    return stop(WEB_UNREACHABLE_NOTE, summaryOf([], new Set(), []));
  }

  progress.evidence = pack.length > 0 ? pack : null;
  if (pack.length === 0) {
    // The web answered and nothing usable came back, so there is nothing to ask the model about.
    return complete([], 0, summaryOf([], new Set(), []));
  }

  // The loop learned that the provider rejects json_schema: the analysis starts in JSON-object mode
  // too, rather than pay one more rejected request and warning to learn it again.
  const analysisModel = found.jsonObjectFallback
    ? wrapLanguageModel({
        model: resolved.model as Parameters<typeof wrapLanguageModel>[0]["model"],
        middleware: jsonObjectFallbackMiddleware,
      })
    : resolved.model;
  let output: ResearchOutput;
  try {
    const result = await deps.generate({
      model: analysisModel,
      schema: researchOutputSchema,
      system: buildSystemPrompt(now),
      prompt: buildUserPrompt(target, pack),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
      extra: { abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS) },
    });
    output = result.object;
  } catch (error) {
    return stop(`Model call failed: ${modelFailurePhrase(args, "the analysis", error)}`);
  }

  // The categories with a source in the pack: a finding of any other has no evidence of its own.
  const inPack = RESEARCH_CATEGORIES.filter((category) =>
    pack.some((source) => source.category === category),
  );
  const candidates = validateFindings(output, pack, target, inPack);
  const [existingRisks, priorFindings] = await Promise.all([
    // Only the active risks. The default of the query is the same, but the rule is said here.
    getVendorRisksByVendorIdQuery(vendorId, organizationId, "active"),
    getFindingsForVendorQuery(organizationId, vendorId),
  ]);
  const { kept: notRepeated, dropped } = dropDuplicates(candidates, existingRisks, priorFindings);
  // The caps come last. Before the de-duplication, the risks that are already known, and so the
  // most severe on a second look, would take the places and then be dropped, and the new ones
  // would be gone.
  const kept = applyCaps(notRepeated);

  return complete(
    kept,
    dropped,
    summaryOf(
      kept,
      new Set(output.findings.map((candidate) => candidate.category)),
      output.category_notes,
    ),
  );
}

/** `research`, with every error turned into a decision to fail the run. It never rejects. */
async function decide(args: RunArgs, deps: PipelineDeps): Promise<Decision> {
  const progress: Progress = {
    categories: [],
    evidence: null,
    model: null,
    searchesUsed: 0,
    pagesRead: 0,
  };
  try {
    return await research(args, deps, progress);
  } catch (error) {
    // The run records a fixed phrase, so this line is the only place that has the message.
    logger.error(`${tag(args)}: unexpected error: ${describeError(error)}`);
    return {
      kind: "fail",
      outcome: "failed",
      payload: finishInput(args, progress, {
        status: "failed",
        categorySummary: [],
        duplicatesDropped: 0,
        error: UNEXPECTED_ERROR_NOTE,
      }),
    };
  }
}

/** Ends the run as failed, once. A failure to write it is logged and nothing else. */
async function recordFailure(payload: FinishRunInput): Promise<void> {
  try {
    await finishRunQuery(payload);
  } catch (error) {
    logger.error(
      `vendor research run ${payload.runId}: could not record that it failed: ${describeError(error)}`,
    );
  }
}

/**
 * Saves the findings and ends the run as completed, in one transaction. The only code that writes
 * a completed run. It never rejects.
 */
async function completeRun(
  args: RunArgs,
  { findings, payload }: Extract<Decision, { kind: "complete" }>,
): Promise<PipelineResult> {
  const { organizationId, vendorId, runId } = args;
  logger.info(
    `${tag(args)}: saving ${findings.length} findings, ${payload.duplicatesDropped} duplicates dropped`,
  );
  try {
    await sequelize.transaction(async (transaction) => {
      await insertFindingsQuery({ organizationId, vendorId, runId, findings }, transaction);
      await finishRunQuery(payload, transaction);
    });
  } catch (error) {
    // The transaction was rolled back, so the run is still running. The failed payload holds
    // nothing the model wrote: if its text was the reason for the failure, it would fail again.
    // The run records a fixed phrase, so this line is the only place that has the message.
    logger.error(`${tag(args)}: saving the findings failed: ${describeError(error)}`);
    await recordFailure({
      ...payload,
      status: "failed",
      categorySummary: [],
      error: SAVING_FAILED_NOTE,
    });
    return { outcome: "failed", findingsCreated: 0 };
  }

  // The transaction has committed and the run is completed. Nothing below this line can fail it.
  return { outcome: "completed", findingsCreated: findings.length };
}

/**
 * Researches one vendor for one queued run. The run ends once: completed, with its findings, or
 * failed. Failures of the web, of the model and of the database are not thrown; they end the run as
 * failed. A run that is not queued, that has waited in the queue for longer than the stale limit
 * (`markRunRunningQuery` does not start such a run), or whose vendor is missing, is skipped.
 */
export async function runVendorResearch(
  args: RunArgs,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  // A rejection is not caught: the run is still queued, so a retry of the job can start it.
  const started = await markRunRunningQuery(args.organizationId, args.runId);
  if (!started) {
    logger.info(`${tag(args)}: the run is not queued, or has waited too long, so it is skipped`);
    return { outcome: "skipped", findingsCreated: 0 };
  }

  const decision = await decide(args, deps);
  if (decision.kind === "fail") {
    logger.warn(`${tag(args)}: stopped: ${decision.payload.error}`);
    await recordFailure(decision.payload);
    return { outcome: decision.outcome, findingsCreated: 0 };
  }
  return completeRun(args, decision);
}
