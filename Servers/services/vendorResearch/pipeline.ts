/**
 * The vendor research pipeline: what one run does between "queued" and "completed" or "failed".
 *
 * Mark the run running, load the vendor, search the web once for each category, pack the results
 * into an evidence pack, make one structured model call, validate the answer, drop what is already
 * known, cap what is left (in that order), and store the findings together with the end of the run.
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
 * This module logs nothing that a third party or the model wrote: no snippets, quotes, prompts or
 * answers. The message of an error of the model call is neither stored nor logged either, because
 * it can quote the request or hold a key. The run records a fixed phrase and the log line the name
 * and the HTTP status of the error. The self-correcting call (advisor/llmSelfCorrect.ts) logs on
 * its own account when it gives up on an answer: the path and message of the first three schema
 * issues, which are generic except that the name of an unexpected property is quoted. It does not
 * log the message of a provider error.
 */
import { createModelFromKey, resolveModelId } from "../../advisor/llmModelFactory";
import type { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
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
import { planCategories } from "./categories";
import { dropDuplicates } from "./dedupe";
import { buildEvidencePack } from "./evidence";
import { PROMPT_VERSION, buildSystemPrompt, buildUserPrompt } from "./prompts";
import { MAX_NOTE_CHARS, ResearchOutput, researchOutputSchema } from "./schema";
import { SearchHit, SearchProvider, SearchProviderError } from "./searchProvider";
import { buildTarget } from "./target";
import { cleanText, cutAtCodePoint } from "./text";
import { applyCaps, validateFindings } from "./validation";

export interface PipelineDeps {
  searchProvider: SearchProvider;
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
/** The error of a failed run is stored cut to this many characters. */
const ERROR_MAX_CHARS = 500;
/** The id of the model is stored cut to this many characters, the size of its column. */
const MODEL_MAX_CHARS = 255;

const NOTHING_FOUND_NOTE = "No risks found in the search results";
const SEARCH_FAILED_NOTE = "The search failed";
/**
 * For a category in which the model proposed a risk and none stayed: validation, the
 * de-duplication or the cap took them all.
 */
const UNCONFIRMED_NOTE =
  "Possible risks were found but could not be verified or are already recorded";

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
  /** The categories that were searched. */
  categories: ResearchCategory[];
  evidence: EvidenceSource[] | null;
  /** The model, once a call to it was about to be made. */
  model: string | null;
  searchesUsed: number;
}

type Decision =
  | { kind: "fail"; outcome: "failed" | "skipped"; payload: FinishRunInput }
  | { kind: "complete"; findings: NewFinding[]; payload: FinishRunInput };

/** For log lines: no content, only ids. */
const tag = ({ organizationId, vendorId, runId }: RunArgs) =>
  `vendor research run ${runId} (vendor ${vendorId}, org ${organizationId})`;

/**
 * The top-level message of an error. A cause nested inside it can carry raw model output or
 * request details, so it is left out. It never throws: it is called inside catch blocks, where a
 * throw would break the promise that the run is ended. A value that has no text form, such as an
 * object without a prototype or with a toString that throws, and an Error whose message is not
 * text all give "unknown error".
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
  const rawName = asRecord(error)?.name;
  const name = typeof rawName === "string" && IDENTIFIER.test(rawName) ? rawName : "unknown";
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
 * Why a search failed, for the run summary. A SearchProviderError has a message that is safe to
 * show, by contract; the message of any other error is not trusted and is replaced.
 */
function searchFailureNote(reason: unknown): string {
  if (reason instanceof SearchProviderError && reason.message.trim() !== "") {
    return cutAtCodePoint(reason.message.trim(), MAX_NOTE_CHARS);
  }
  return SEARCH_FAILED_NOTE;
}

const findingsNote = (count: number) =>
  count === 1 ? "1 potential risk found" : `${count} potential risks found`;

/**
 * The first note that the model wrote for the category and that has any text left once it is
 * cleaned (like the rest of what the model wrote), trimmed and cut to MAX_NOTE_CHARS.
 */
function modelNoteFor(
  notes: ResearchOutput["category_notes"],
  category: ResearchCategory,
): string | undefined {
  return notes
    .filter((entry) => entry.category === category)
    .map((entry) => cutAtCodePoint(cleanText(entry.note).trim(), MAX_NOTE_CHARS))
    .find((note) => note !== "");
}

/**
 * One entry for each category, in category order.
 *
 * - A category that was not searched keeps the note of the plan, and a failed search shows its
 *   failure.
 * - A searched category with a kept finding is `findings`, with a plain count as its note.
 * - Any other is `nothing_found`. If the model proposed a risk in it and none stayed, the note says
 *   that risks were possible but are not confirmed. Only if the model proposed none is its own note
 *   shown, or a plain sentence when it wrote none: a note that sits next to a risk that was dropped
 *   would describe that risk.
 */
function summarise(input: {
  skipped: CategorySummaryEntry[];
  failed: Array<{ category: ResearchCategory; note: string }>;
  kept: NewFinding[];
  /** The categories in which the model proposed a risk, whatever became of it. */
  proposed: ReadonlySet<ResearchCategory>;
  modelNotes: ResearchOutput["category_notes"];
}): CategorySummaryEntry[] {
  return RESEARCH_CATEGORIES.map((category): CategorySummaryEntry => {
    const skipped = input.skipped.find((entry) => entry.category === category);
    if (skipped) return skipped;
    const failure = input.failed.find((entry) => entry.category === category);
    if (failure) return { category, outcome: "search_failed", note: failure.note };

    const keptCount = input.kept.filter((finding) => finding.category === category).length;
    if (keptCount > 0) return { category, outcome: "findings", note: findingsNote(keptCount) };
    if (input.proposed.has(category)) {
      return { category, outcome: "nothing_found", note: UNCONFIRMED_NOTE };
    }
    return {
      category,
      outcome: "nothing_found",
      note: modelNoteFor(input.modelNotes, category) ?? NOTHING_FOUND_NOTE,
    };
  });
}

function finishInput(
  args: RunArgs,
  deps: PipelineDeps,
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
    searchProvider: deps.searchProvider.name,
    model: progress.model === null ? null : cutAtCodePoint(progress.model, MODEL_MAX_CHARS),
    promptVersion: PROMPT_VERSION,
    searchesUsed: progress.searchesUsed,
    duplicatesDropped: end.duplicatesDropped,
    error: end.error === null ? null : cutAtCodePoint(end.error, ERROR_MAX_CHARS),
  };
}

/**
 * The work of a run up to the point of writing. It reads, searches and calls the model, and writes
 * nothing. It may throw; `decide` turns that into a "fail".
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
    payload: finishInput(args, deps, progress, {
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
    payload: finishInput(args, deps, progress, {
      status: "completed",
      categorySummary,
      duplicatesDropped,
      error: null,
    }),
  });

  const vendor = await getVendorByIdQuery(vendorId, organizationId);
  if (!vendor) return stop("Vendor not found", [], "skipped");

  // Before the searches, so that an organisation without a key does not spend any of them.
  const resolved = await deps.resolveModel(organizationId);
  if (!resolved) return stop("No LLM key configured");

  const target = buildTarget(vendor);
  const { plans, skipped } = planCategories(target, deps.now());

  progress.categories = plans.map((plan) => plan.category);
  progress.searchesUsed = plans.length;
  // An async callback, so that a provider that throws instead of rejecting is also a failed search.
  const settled = await Promise.allSettled(
    plans.map(async (plan) => deps.searchProvider.search(plan.query, plan.options)),
  );

  // Both lists are in plan order, which is category order.
  const searched: Array<{ category: ResearchCategory; hits: SearchHit[] }> = [];
  const failed: Array<{ category: ResearchCategory; note: string }> = [];
  settled.forEach((result, index) => {
    const { category } = plans[index];
    if (result.status === "fulfilled") {
      searched.push({ category, hits: result.value });
    } else {
      failed.push({ category, note: searchFailureNote(result.reason) });
    }
  });

  if (searched.length === 0 && failed.length > 0) {
    const reasons = Array.from(new Set(failed.map((entry) => entry.note))).join("; ");
    return stop(
      `The run stopped because all searches failed: ${reasons}`,
      summarise({ skipped, failed, kept: [], proposed: new Set(), modelNotes: [] }),
    );
  }

  const pack = buildEvidencePack(searched);
  progress.evidence = pack.length > 0 ? pack : null;
  if (pack.length === 0) {
    // Nothing to read, so nothing to ask the model about.
    return complete(
      [],
      0,
      summarise({ skipped, failed, kept: [], proposed: new Set(), modelNotes: [] }),
    );
  }

  progress.model = resolved.modelId;
  let output: ResearchOutput;
  try {
    const result = await deps.generate({
      model: resolved.model,
      schema: researchOutputSchema,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(target, pack),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
      extra: { abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS) },
    });
    output = result.object;
  } catch (error) {
    const failure = describeModelFailure(error);
    // The name and the status only: the message of the error is neither stored nor logged.
    const status = failure.status === null ? "" : `, HTTP status ${failure.status}`;
    logger.warn(`${tag(args)}: the model call failed (error ${failure.name}${status})`);
    return stop(`Model call failed: ${failure.phrase}`);
  }

  const candidates = validateFindings(
    output,
    pack,
    target,
    searched.map((entry) => entry.category),
  );
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
    summarise({
      skipped,
      failed,
      kept,
      proposed: new Set(output.findings.map((candidate) => candidate.category)),
      modelNotes: output.category_notes,
    }),
  );
}

/** `research`, with every error turned into a decision to fail the run. It never rejects. */
async function decide(args: RunArgs, deps: PipelineDeps): Promise<Decision> {
  const progress: Progress = { categories: [], evidence: null, model: null, searchesUsed: 0 };
  try {
    return await research(args, deps, progress);
  } catch (error) {
    return {
      kind: "fail",
      outcome: "failed",
      payload: finishInput(args, deps, progress, {
        status: "failed",
        categorySummary: [],
        duplicatesDropped: 0,
        error: `Unexpected error: ${describeError(error)}`,
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
    logger.error(`${tag(args)}: saving the findings failed: ${describeError(error)}`);
    await recordFailure({
      ...payload,
      status: "failed",
      categorySummary: [],
      error: cutAtCodePoint(`Saving the findings failed: ${describeError(error)}`, ERROR_MAX_CHARS),
    });
    return { outcome: "failed", findingsCreated: 0 };
  }

  // The transaction has committed and the run is completed. Nothing below this line can fail it.
  return { outcome: "completed", findingsCreated: findings.length };
}

/**
 * Researches one vendor for one queued run. The run ends once: completed, with its findings, or
 * failed. Failures of the search, of the model and of the database are not thrown; they end the run
 * as failed. A run that is not queued, or whose vendor is missing, is skipped.
 */
export async function runVendorResearch(
  args: RunArgs,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  // A rejection is not caught: the run is still queued, so a retry of the job can start it.
  const started = await markRunRunningQuery(args.organizationId, args.runId);
  if (!started) {
    logger.info(`${tag(args)}: the run is not queued, so it is skipped`);
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
