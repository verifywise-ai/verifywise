/**
 * The vendor research pipeline: what one run does between "queued" and "completed" or "failed".
 *
 * Mark the run running, load the vendor, search the web once for each category, pack the results
 * into an evidence pack, make one structured model call, validate and de-duplicate the answer, and
 * store the findings together with the end of the run.
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
 * Nothing that a third party or the model wrote is logged: no snippets, quotes, prompts or answers.
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
import { cutAtCodePoint } from "./text";
import { validateFindings } from "./validation";

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

const NOTHING_FOUND_NOTE = "No risks found in the search results";
const SEARCH_FAILED_NOTE = "The search failed";

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
 * request details, so it is left out.
 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === "" ? "unknown error" : message;
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
 * One entry for each category, in category order. A category that was not searched keeps the note
 * of the plan, a failed search shows its failure, and a searched category is `findings` when a
 * finding of it was kept and `nothing_found` otherwise. Its note is the model's, cut to
 * MAX_NOTE_CHARS, or a plain sentence when the model wrote none.
 */
function summarise(input: {
  skipped: CategorySummaryEntry[];
  failed: Array<{ category: ResearchCategory; note: string }>;
  kept: NewFinding[];
  modelNotes: ResearchOutput["category_notes"];
}): CategorySummaryEntry[] {
  return RESEARCH_CATEGORIES.map((category): CategorySummaryEntry => {
    const skipped = input.skipped.find((entry) => entry.category === category);
    if (skipped) return skipped;
    const failure = input.failed.find((entry) => entry.category === category);
    if (failure) return { category, outcome: "search_failed", note: failure.note };

    const keptCount = input.kept.filter((finding) => finding.category === category).length;
    const modelNote = input.modelNotes
      .filter((entry) => entry.category === category)
      .map((entry) => cutAtCodePoint(entry.note.trim(), MAX_NOTE_CHARS))
      .find((note) => note !== "");
    return keptCount > 0
      ? { category, outcome: "findings", note: modelNote ?? findingsNote(keptCount) }
      : { category, outcome: "nothing_found", note: modelNote ?? NOTHING_FOUND_NOTE };
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
    model: progress.model,
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
      summarise({ skipped, failed, kept: [], modelNotes: [] }),
    );
  }

  const pack = buildEvidencePack(searched);
  progress.evidence = pack.length > 0 ? pack : null;
  if (pack.length === 0) {
    // Nothing to read, so nothing to ask the model about.
    return complete([], 0, summarise({ skipped, failed, kept: [], modelNotes: [] }));
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
    return stop(`Model call failed: ${describeError(error)}`);
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
  const { kept, dropped } = dropDuplicates(candidates, existingRisks, priorFindings);

  return complete(
    kept,
    dropped,
    summarise({ skipped, failed, kept, modelNotes: output.category_notes }),
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
