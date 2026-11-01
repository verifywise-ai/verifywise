/**
 * The vendor research pipeline: what one run does between "queued" and "completed" or "failed".
 *
 * Mark the run running, load the vendor and the model of its organisation, let the research loop
 * collect sources on the web (see researchAgent.ts), pack its ledger into an evidence pack, make
 * one structured model call, validate the answer, drop what is already known, cap what is left (in
 * that order), check the findings that rest on snippets against the page of their best source
 * (see verifySnippets.ts) and, with the verifier on, have a second model call check them (see
 * verifier.ts), and store the findings together with the end of the run and the summary of each
 * category (see summary.ts).
 *
 * A scheduled run (the scan of an organization that chose one) analyses only the sources that no
 * earlier run showed to the model: the sources of every completed run are remembered by the key of
 * their document (see sourceMemory.ts), and a scheduled run sets the ones it remembers apart before
 * the evidence pack is built. When nothing is left, it completes without an analysis. The memory is
 * written after the run is saved, because a memory that cannot be written costs a later run some
 * work again and must not cost this one its findings.
 *
 * Every run, whatever started it, keeps the text of the pages where the vendor states its terms
 * that the research read (see policySnapshots.ts), and compares them with the text that earlier runs
 * kept: a page that changed becomes a source of its own, the lines added and the lines removed, and
 * joins the evidence ahead of the other sources of its category. Those pages are written after the
 * run is saved too, and only for a run that completed: a page is never kept in the place of one
 * whose change was not shown to the model.
 *
 * What the loop leaves decides how the run goes on. A model error of the loop fails the run when
 * no usable source was found, and so does a loop that never got an answer from the web and left
 * nothing to analyse: the model never searched or read, or no call was answered and the ledger
 * holds no usable source. The records of the public databases, which the code looks up without the
 * loop, enter the ledger without a call of their own, so a web that is down still leaves them to be
 * analysed. A loop whose calls were answered and found
 * nothing completes the run without an analysis call. A loop that stopped early, for its time, its
 * steps or a model error, still hands what it found to the analysis.
 *
 * The query that ends a run (finishRunQuery) has a status guard: it writes only a run that is queued
 * or running, and says whether it did. A run that has ended, for example one that the stale sweep
 * failed, is never overwritten, and a run is still ended exactly once by this module. The code is
 * built so that this can be seen:
 *
 * - `decide` does all the work up to the point of writing, and never rejects. It returns a decision:
 *   fail the run, or complete it with these findings. Any error inside it becomes a "fail".
 * - A "fail" is written by `recordFailure`, one best-effort call that never rejects.
 * - A "complete" is written by `completeRun`, the only caller of `sequelize.transaction`. The
 *   findings and the end of the run are saved in that one transaction. If it rejects, nothing was
 *   saved and the run is failed once, outside the transaction. If the finish wrote nothing, the
 *   run had ended already (it timed out, or the sweep failed it): the transaction is rolled back,
 *   so the findings are not saved, and no second end is written. Once it has resolved, the
 *   function returns: nothing after the commit can fail the run.
 * - No run runs longer than RUN_TIME_LIMIT_MINUTES: `runVendorResearch` races `decide` against a
 *   timer and fails the run as timed out when the timer wins. `decide` writes nothing, so its late
 *   decision is ignored, and the timer also aborts `progress.abandoned`: the work left running starts
 *   no analysis, verifier call, page read or EDGAR lookup after that, and the calls in flight are
 *   aborted, so a run reported as failed spends no more of the organization's tokens. (The research
 *   loop itself ends by its own caps.) The sweep of running runs waits longer than that limit, so it can only
 *   reach a run whose worker died.
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
 *
 * A source of a host the registry blocks never reaches the evidence, each finding is stored with its
 * credibility label and basis and each of its sources with what the basis says of it, and the run
 * is ended with its coverage on every path: what the research checked in the public databases,
 * the categories of the sources its stored findings cite, and the version of the registry. There
 * are no other rules: the model is not asked for a confidence (see analysis.ts).
 *
 * While the gate of the SEC (Q4) is open, the analysis is also given the means to ask who filed an
 * EDGAR filing that a finding cites under the CIK stored on the vendor (see `edgarFiler.ts`): the
 * address of a filing is in the folder of every party, so only the header of the filing says
 * whether the vendor's own word is in it. The resolver is one for the process, since it keeps the
 * header of a filing for 24 hours for every run.
 */
import { createModelFromKey, resolveModelId } from "../../advisor/llmModelFactory";
import type { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import { sequelize } from "../../database/db";
import {
  CategorySummaryEntry,
  EvidenceSource,
  type FindingSource,
  NewFinding,
  RESEARCH_CATEGORIES,
  ResearchCategory,
  RUN_SEARCH_ENGINES,
  type RunCoverage,
  RunProgress,
  type RunSearchEngine,
  ResearchTrigger,
  SOURCE_CATEGORIES,
  SnapshotWrite,
  type SourceCategory,
  VendorResearchKeyChoice,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import logger from "../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  FinishRunInput,
  finishRunQuery,
  getFindingsForVendorQuery,
  getKnownSourceKeysQuery,
  getSnapshotsQuery,
  getVendorResearchSettingsQuery,
  insertFindingsQuery,
  markRunRunningQuery,
  rememberSourcesQuery,
  RUN_TIME_LIMIT_MINUTES,
  saveSnapshotsQuery,
  TIMED_OUT_ERROR,
  updateRunProgressQuery,
} from "../../utils/vendorResearch.utils";
import { getVendorRisksByVendorIdQuery } from "../../utils/vendorRisk.utils";
import type { LedgerEntry } from "../webResearch/webSession";
import { withAliases } from "./aliases";
import { analyse } from "./analysis";
import { researchableCategories } from "./categories";
import type { Credibility } from "./credibility";
import { type EdgarFilerResolver, createEdgarFilerResolver } from "./edgarFiler";
import { type SourceProvenance, buildEvidencePack, isBlockedEntry, provenanceOf } from "./evidence";
import { selectKeys } from "./keySelection";
import { buildMateriality } from "./materiality";
import { type PolicyPage, comparePages } from "./policySnapshots";
import { CREDIBILITY_PROMPT_VERSION } from "./prompts";
// Types only: the researcher is injected, so loading the pipeline loads no web module.
import type { ResearchResult, VendorResearcher } from "./researchAgent";
import type { AnyResearchOutput } from "./schema";
import { type SearchSpec, searchEngineOf } from "./searchEngineOf";
import { keysOfSources, splitKnownSources } from "./sourceMemory";
import { REGISTRY_VERSION } from "./sourceRegistry/entries";
import { summariseCategories, workedCategories } from "./summary";
import { buildTarget } from "./target";
import { cutAtCodePoint } from "./text";
import { type TraceRecorder, createTraceRecorder } from "./trace";
import { VRDB_GATES } from "./vrdb/gates";

export interface PipelineDeps {
  /** Runs the research loop for a vendor: the web search and page reads. */
  research: VendorResearcher;
  /** The model of the organisation, or null when it has no LLM key. */
  resolveModel: (organizationId: number) => Promise<ResolvedModels | null>;
  generate: typeof generateObjectWithSelfCorrection;
  now: () => Date;
  /**
   * True to have the findings that stay checked by one more model call before they are stored
   * (see verifier.ts). Off by default, like the routine work of the researcher: a test that
   * scripts the model's answers should see only the calls it scripted. The job turns it on.
   */
  verifier?: boolean;
  /**
   * Who filed an EDGAR filing under the CIK stored on the vendor (Q28; `createEdgarFilerResolver`
   * in edgarFiler.ts). It is given to the analysis while the gate of the SEC (Q4) is open, and
   * nothing is asked while it is closed. By default the resolver of the process, which every run
   * shares; a test gives its own so that no test asks the SEC.
   */
  edgarFilerOf?: EdgarFilerResolver;
  /**
   * The longest the run may run, in milliseconds; past it the pipeline fails the run as timed out.
   * By default RUN_TIME_LIMIT_MINUTES. A test gives a short one.
   */
  runTimeLimitMs?: number;
}

/**
 * The resolver of who filed an EDGAR filing, one for the process. It keeps the header of a filing
 * for 24 hours, for every run, so a resolver of each run would forget it. Making it asks for
 * nothing: the SEC is first asked when an analysis cites a filing under a vendor's stored CIK.
 */
const processEdgarFilerOf: EdgarFilerResolver = createEdgarFilerResolver();

export interface PipelineResult {
  outcome: "completed" | "failed" | "skipped";
  findingsCreated: number;
}

/** The id of the model is stored cut to this many characters, the size of its column. */
const MODEL_MAX_CHARS = 255;

/** What a run records when no call of the research loop was answered by the web and nothing is left to analyse. */
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
 * Writes where the run is, for the page that follows it. A report is written at once when no write
 * is on its way; while one is, the newest report waits for it and replaces any older one that was
 * waiting, so the page always gets the latest state, never an older one after a newer one, and a
 * slow database cannot build up a backlog. Nothing waits for a write: a write that fails is logged
 * by the name of its error and the next one goes on, because a progress that cannot be written
 * must never fail or slow a run. A late write cannot undo the end of the run: the query only
 * touches a run that is running.
 */
function createProgressWriter(args: RunArgs, now: () => Date) {
  let writing = false;
  let waiting: RunProgress | null = null;

  const flush = async (first: RunProgress): Promise<void> => {
    writing = true;
    let next: RunProgress | null = first;
    while (next !== null) {
      try {
        await updateRunProgressQuery(args.organizationId, args.runId, next);
      } catch (error) {
        logger.warn(`${tag(args)}: the progress could not be written (error ${errorName(error)})`);
      }
      next = waiting;
      waiting = null;
    }
    writing = false;
  };

  return (report: Omit<RunProgress, "updatedAt">): void => {
    const progress: RunProgress = { ...report, updatedAt: now().toISOString() };
    if (writing) waiting = progress;
    else void flush(progress);
  };
}

/** A model a run calls, with the id of the model behind it. */
export interface ResolvedModel {
  model: unknown;
  modelId: string;
}

/**
 * The model of the research and, when the organization chose another key for the analysis, the
 * model of the analysis. Without `analysis`, one model does both.
 */
export interface ResolvedModels extends ResolvedModel {
  analysis?: ResolvedModel;
  /**
   * How the research searches the web, told from the key of the research (see searchEngineOf.ts):
   * with the web search of the key's provider, or with the news of the GDELT Project. The analysis
   * searches nothing, so its model has none. Without it the researcher searches the news.
   */
  search?: SearchSpec;
}

/**
 * What an administrator chose, read for a run. A setting must not fail a run, so when the choice
 * cannot be read the run goes on with the default, and says only that (the error can name a host).
 */
async function readChoice(organizationId: number): Promise<VendorResearchKeyChoice> {
  try {
    return await getVendorResearchSettingsQuery(organizationId);
  } catch (error) {
    logger.warn(
      `vendor research (org ${organizationId}): the LLM key choice could not be read, so the default is used (error ${errorName(error)})`,
    );
    return { researchKeyId: null, analysisKeyId: null };
  }
}

/**
 * The models for a run, from the keys the organization chose or, for a choice that was not made,
 * its newest key; null when the organization has no key. The research model also says how the
 * research searches, which depends on its key alone: only the name and the address of the key are
 * looked at for that. Never logs the key.
 */
export async function resolveOrgModel(organizationId: number): Promise<ResolvedModels | null> {
  const [keys, choice] = await Promise.all([
    getLLMKeysWithKeyQuery(organizationId),
    readChoice(organizationId),
  ]);
  const selected = selectKeys(keys, choice);
  if (selected === null) return null;
  const modelOf = (key: (typeof keys)[number]): ResolvedModel => ({
    model: createModelFromKey(key),
    modelId: resolveModelId(key),
  });
  const research: ResolvedModels = {
    ...modelOf(selected.research),
    search: {
      engine: searchEngineOf({ name: selected.research.name, url: selected.research.url }),
    },
  };
  return selected.analysis === null
    ? research
    : { ...research, analysis: modelOf(selected.analysis) };
}

interface RunArgs {
  organizationId: number;
  vendorId: number;
  runId: number;
  /**
   * What started the run. A scheduled run analyses only the sources that no earlier run showed to
   * the model; any other run, and a run that is not told, analyses all of them.
   */
  triggerType?: ResearchTrigger;
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
  /**
   * What the run did and what became of it. It is stored with the run, whether it completes or
   * fails, and served to administrators only (see trace.ts).
   */
  trace: TraceRecorder;
  /** The version of the prompt of the run (`CREDIBILITY_PROMPT_VERSION`). */
  promptVersion: string;
  /** What the run checked in the public databases and what its findings cite. */
  coverage: RunCoverage;
  /**
   * The engine the run's searches went to, as the researcher reported it when it returned (see
   * `recordedEngineOf`); null before that, for a run that searched nothing and for a run none of
   * whose searches was answered.
   */
  searchEngine: RunSearchEngine | null;
  /**
   * Aborted when the run reached its time limit and was failed as timed out. The work that is
   * left running checks it, before the analysis, the verifier and the EDGAR lookups, and stops
   * with a decision that writes nothing: a run the product reported as failed spends no more of
   * the organization's tokens.
   */
  abandoned: AbortController;
}

/** What a run knows before it has done anything. */
const newProgress = (): Progress => ({
  categories: [],
  evidence: null,
  model: null,
  searchesUsed: 0,
  pagesRead: 0,
  trace: createTraceRecorder(),
  promptVersion: CREDIBILITY_PROMPT_VERSION,
  coverage: emptyCoverage(),
  searchEngine: null,
  abandoned: new AbortController(),
});

type Decision =
  | { kind: "fail"; outcome: "failed" | "skipped"; payload: FinishRunInput }
  | {
      kind: "complete";
      findings: NewFinding[];
      payload: FinishRunInput;
      /** The keys of the sources to remember once the run is saved. */
      remember: string[];
      /** The pages where the vendor states its terms, to keep once the run is saved. */
      snapshots: SnapshotWrite[];
    };

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
    promptVersion: progress.promptVersion,
    searchesUsed: progress.searchesUsed,
    pagesRead: progress.pagesRead,
    duplicatesDropped: end.duplicatesDropped,
    error: end.error,
    trace: progress.trace.snapshot(),
    coverage: progress.coverage,
    registryVersion: progress.coverage.registry_version,
    searchEngine: progress.searchEngine,
  };
}

/**
 * The engine a run records, from the id its researcher reports for the searches it made: one of the
 * three that the table holds, or none. `replay`, the engine of the evaluation, is no search that a
 * person ran, and an id that is none of the three would be refused by the table and cost the run
 * its end, so both leave the run with none, like a researcher that does not say or searched nothing.
 */
function recordedEngineOf(reported: unknown): RunSearchEngine | null {
  return RUN_SEARCH_ENGINES.find((engine) => engine === reported) ?? null;
}

/** No source cited, in each category. */
const noneCited = (): Record<SourceCategory, number> =>
  Object.fromEntries(SOURCE_CATEGORIES.map((category) => [category, 0])) as Record<
    SourceCategory,
    number
  >;

/** The coverage of a run before it has checked anything. */
const emptyCoverage = (): RunCoverage => ({
  registry_version: REGISTRY_VERSION,
  sources: [],
  lookups: [],
  cited: noneCited(),
});

/** The flags of a cited source that its stored form keeps. */
const SOURCE_FLAGS = ["downgraded", "syndicated", "user_content"] as const;

/**
 * A finding with its credibility label and basis, and each of its sources with what the basis says
 * of it: the registry category, the publisher, the flags and, for the record of a public database,
 * which database, its row in the vendor risk database (null for a record looked up on the web), its
 * status and how surely it is the vendor's. The basis describes the sources in the order of the
 * finding's; a source it does not describe is kept as it is.
 */
function withCredibility(
  finding: NewFinding,
  { label, basis }: Credibility,
  provenance: ReadonlyMap<string, SourceProvenance>,
): NewFinding {
  return {
    ...finding,
    credibility: label,
    credibility_basis: basis,
    sources: finding.sources.map((source, index): FindingSource => {
      const described = basis.sources[index];
      if (described === undefined || described.url !== source.url) return source;
      const flags = SOURCE_FLAGS.filter((flag) => described[flag] === true);
      return {
        ...source,
        category: described.category,
        publisher: described.publisher,
        ...(flags.length === 0 ? {} : { flags }),
        ...(described.record === undefined
          ? {}
          : {
              record: {
                source_id: described.record.source,
                record_id: provenance.get(source.url)?.vrdb?.recordId ?? null,
                status: described.record.status,
                match_strength: described.record.match,
              },
            }),
      };
    }),
  };
}

/** The host of an address without "www.", or null for an address that is not one. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * What the findings cite: each address once, counted by the category its label gave it, and the
 * hosts among them that the registry has not reviewed, each once. A host is the one of the address
 * that answered, which is the one the registry classified.
 */
function citedBy(
  findings: readonly NewFinding[],
  provenance: ReadonlyMap<string, SourceProvenance>,
): { categories: Record<SourceCategory, number>; unreviewedHosts: string[] } {
  const categories = noneCited();
  const unreviewedHosts = new Set<string>();
  const seen = new Set<string>();
  for (const finding of findings) {
    for (const source of finding.credibility_basis?.sources ?? []) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      categories[source.category] += 1;
      if (source.reviewed) continue;
      const host = hostOf(provenance.get(source.url)?.answeredUrl ?? source.url);
      if (host !== null) unreviewedHosts.add(host);
    }
  }
  return { categories, unreviewedHosts: [...unreviewedHosts] };
}

/**
 * The keys of the sources that earlier runs showed to the model for the vendor, or null when they
 * cannot be read: a memory must not fail a run, so the run then analyses every source. The error
 * can name a host or a query, so only its name is logged.
 */
async function readKnownSources(args: RunArgs): Promise<ReadonlySet<string> | null> {
  try {
    return await getKnownSourceKeysQuery(args.organizationId, args.vendorId);
  } catch (error) {
    logger.warn(
      `${tag(args)}: the sources of the earlier runs could not be read, so every source is analysed (error ${errorName(error)})`,
    );
    return null;
  }
}

/** Remembers the sources of a run that was saved. It never rejects: a failure is logged by name. */
async function rememberSources(args: RunArgs, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await rememberSourcesQuery({
      organizationId: args.organizationId,
      vendorId: args.vendorId,
      runId: args.runId,
      keys,
    });
  } catch (error) {
    logger.warn(`${tag(args)}: the sources could not be remembered (error ${errorName(error)})`);
  }
}

/** What the pages where the vendor states its terms came to in a run. */
interface PolicyComparison {
  /** The sources that the changes make, for the model. */
  entries: LedgerEntry<ResearchCategory>[];
  /** The pages to keep once the run is saved. */
  writes: SnapshotWrite[];
}

/**
 * Compares the pages of the vendor's own site that state its terms, as the research read them, with
 * the ones that earlier runs kept (see policySnapshots.ts). It never rejects: when the comparison
 * cannot be made the run goes on as one that read none of them, and keeps none, so that a page is
 * never kept in the place of one whose change was not reported. The error can name a host or a
 * query, so only its name is logged, and the log holds counts and no address, title or text.
 */
async function comparePolicyPages(
  args: RunArgs,
  pages: readonly PolicyPage[],
  now: Date,
  trace: TraceRecorder,
): Promise<PolicyComparison> {
  if (pages.length === 0) return { entries: [], writes: [] };
  try {
    const stored = await getSnapshotsQuery(
      args.organizationId,
      args.vendorId,
      pages.map((page) => page.key),
    );
    const { entries, writes, counts } = comparePages({ pages, stored, now });
    if (counts.first > 0) trace.dropped("page.first_visit", counts.first);
    if (counts.unchanged > 0) trace.dropped("page.unchanged", counts.unchanged);
    if (counts.minor > 0) trace.dropped("page.minor", counts.minor);
    logger.info(
      `${tag(args)}: ${pages.length} pages where the vendor states its terms compared with the earlier runs: ${counts.first} first visits, ${counts.unchanged} unchanged, ${counts.changed} changed, ${counts.minor} minor`,
    );
    return { entries, writes };
  } catch (error) {
    logger.warn(
      `${tag(args)}: the pages where the vendor states its terms could not be compared with the earlier runs (error ${errorName(error)})`,
    );
    return { entries: [], writes: [] };
  }
}

/** Keeps the pages of a run that was saved. It never rejects: a failure is logged by name. */
async function saveSnapshots(args: RunArgs, writes: SnapshotWrite[]): Promise<void> {
  if (writes.length === 0) return;
  try {
    await saveSnapshotsQuery({
      organizationId: args.organizationId,
      vendorId: args.vendorId,
      runId: args.runId,
      writes,
    });
  } catch (error) {
    logger.warn(
      `${tag(args)}: the pages where the vendor states its terms could not be kept (error ${errorName(error)})`,
    );
  }
}

/**
 * The work of a run up to the point of writing. It reads, researches and calls the model, and
 * writes nothing. It may throw; `decide` turns that into a "fail".
 */
async function research(args: RunArgs, deps: PipelineDeps, progress: Progress): Promise<Decision> {
  const { organizationId, vendorId } = args;
  const { trace } = progress;

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
    remember: string[],
    snapshots: SnapshotWrite[],
  ): Decision => ({
    kind: "complete",
    findings,
    payload: finishInput(args, progress, {
      status: "completed",
      categorySummary,
      duplicatesDropped,
      error: null,
    }),
    remember,
    snapshots,
  });

  const vendor = await getVendorByIdQuery(vendorId, organizationId);
  if (!vendor) return stop("Vendor not found", [], "skipped");

  // Before the research, so that an organisation without a key does not spend a search.
  const resolved = await deps.resolveModel(organizationId);
  if (!resolved) return stop("No LLM key configured");
  if (progress.abandoned.signal.aborted) return stop(TIMED_OUT_ERROR);

  const target = buildTarget(vendor);
  // One clock for the loop and the analysis, so that both hold a source to the same window.
  const now = deps.now();
  // The research model first; the analysis model after it when it is another.
  progress.model = resolved.analysis
    ? `${resolved.modelId} / ${resolved.analysis.modelId}`
    : resolved.modelId;

  // Where the run is, for the page: first that the research starts, then after every turn of it.
  const writeProgress = createProgressWriter(args, deps.now);
  writeProgress({
    phase: "researching",
    steps: 0,
    action: null,
    category: null,
    searchesUsed: 0,
    pagesRead: 0,
    categories: [],
  });
  let stepsTaken = 0;

  let found: ResearchResult;
  trace.startPhase("research");
  try {
    found = await deps.research({
      target,
      model: resolved.model,
      modelId: resolved.modelId,
      // The answers of a provider's search are bought with the key of this organization.
      organizationId,
      search: resolved.search,
      now,
      trace,
      progress: (reported) => {
        stepsTaken = reported.steps;
        writeProgress({ phase: "researching", ...reported });
      },
    });
  } catch (error) {
    // A bug of the web session. Its message can hold what a page or a URL holds, so only the name
    // of the error is logged.
    logger.error(`${tag(args)}: the research failed (error ${errorName(error)})`);
    return stop(UNEXPECTED_ERROR_NOTE);
  }
  // The run timed out while the research was going: nothing more is spent on it.
  if (progress.abandoned.signal.aborted) return stop(TIMED_OUT_ERROR);
  trace.stopped(found.stoppedBecause);
  progress.coverage = {
    ...progress.coverage,
    sources: found.coverage?.sources ?? [],
    lookups: found.coverage?.lookups ?? [],
  };
  progress.categories = workedCategories(found.calls);
  progress.searchesUsed = found.searchesUsed;
  progress.pagesRead = found.pagesRead;
  // Where the answers came from: the engine whose search resolved. A run of an Anthropic key that
  // was refused a search and then had GDELT answer is credited to GDELT, whose news is in the run;
  // one whose fallback answered nothing keeps the credit of the key's own engine for the searches
  // it did answer. It is recorded only when a search was answered: the column is what the user is
  // told ("News searched with ..."), and a run whose searches the web never answered received no
  // news from any engine. Kept for every end of the run from here on; the log line below gives the
  // counts of such a run and the engine the researcher reported, which is none for a key's own
  // engine and its fallback when neither answered a search.
  const searchCalls = found.calls.filter((call) => call.tool === "search");
  const answeredSearches = searchCalls.filter((call) => call.answered).length;
  const reportedEngine = recordedEngineOf(found.searchEngine);
  progress.searchEngine = answeredSearches > 0 ? reportedEngine : null;
  logger.info(
    `${tag(args)}: the research loop stopped (${found.stoppedBecause}): ${found.searchesUsed} searches, ${found.pagesRead} pages read, ${found.entries.length} sources, ${answeredSearches} of ${searchCalls.length} searches answered (engine ${reportedEngine ?? "none"})`,
  );

  // A scheduled run sets the sources apart that earlier runs showed to the model. The memory is
  // read after the research, which does not depend on it; when it cannot be read, the run goes on
  // as one that analyses everything.
  const known = args.triggerType === "scheduled" ? await readKnownSources(args) : null;
  const split = known === null ? null : splitKnownSources(found.entries, known);
  if (split !== null && split.skipped > 0) trace.dropped("source.already_seen", split.skipped);

  // The pages where the vendor states its terms, compared with the ones earlier runs kept, in every
  // kind of run. A change is a source like the others and comes first among the sources of its
  // category, so that the pack drops it last. It is set beside the split above and not under it:
  // its address carries the hash of the new text, so it is the address of no source that was shown.
  const policies = await comparePolicyPages(args, found.policyPages ?? [], now, trace);

  // Built first: the failed-run rule asks whether anything usable is left, and an entry with an
  // unusable URL is not a source.
  const entries = [...policies.entries, ...(split === null ? found.entries : split.fresh)];
  // A source of a host the registry blocks is never shown to the model.
  const blocked = entries.filter(isBlockedEntry).length;
  if (blocked > 0) trace.dropped("source.blocked", blocked);
  const pack = buildEvidencePack(entries, { dropBlocked: true });
  const provenance = provenanceOf(entries);
  // What the model is shown is what the next scheduled run will not show it again, and a source
  // that was set apart is still there to be seen.
  const remember = [...keysOfSources(pack), ...(split?.knownKeys ?? [])];

  const researchable = researchableCategories(target);
  const skippedNoDomain = RESEARCH_CATEGORIES.filter(
    (category) => !researchable.includes(category),
  );
  const freshCategories =
    split === null ? undefined : new Set(pack.map((source) => source.category));
  const summaryOf = (
    kept: NewFinding[],
    proposed: ReadonlySet<ResearchCategory>,
    modelNotes: AnyResearchOutput["category_notes"],
  ) =>
    summariseCategories({
      skippedNoDomain,
      calls: found.calls,
      kept,
      proposed,
      modelNotes,
      stoppedBecause: found.stoppedBecause,
      freshCategories,
    });

  // The failed-run rule, in this order. A model call that rejected with nothing in it leaves the
  // loop's error null, so the reason it stopped for decides, not the error.
  if (found.stoppedBecause === "model_error") {
    const phrase = modelFailurePhrase(args, "the research loop", found.modelError);
    // With a source, what was found before the model failed is still analysed.
    if (pack.length === 0) return stop(`Model call failed: ${phrase}`);
  }
  // The model answered with prose or invalid steps until the loop ended.
  if (found.calls.length === 0) return stop(NO_RESEARCH_ACTIONS_NOTE);
  // A blocked search is not "nothing found": the summary says which categories could not look. The
  // run fails only when nothing is left to analyse: records of the public databases are sources
  // without a call of the loop, and are analysed even when the web did not answer.
  if (found.calls.every((call) => !call.answered) && pack.length === 0) {
    return stop(WEB_UNREACHABLE_NOTE, summaryOf([], new Set(), []));
  }

  progress.evidence = pack.length > 0 ? pack : null;
  if (pack.length === 0) {
    // The web answered and nothing usable came back (for a scheduled run: nothing that is new), so
    // there is nothing to ask the model about.
    return complete([], 0, summaryOf([], new Set(), []), remember, policies.writes);
  }

  writeProgress({
    phase: "analysing",
    steps: stepsTaken,
    action: null,
    category: null,
    searchesUsed: found.searchesUsed,
    pagesRead: found.pagesRead,
    categories: progress.categories,
  });

  if (progress.abandoned.signal.aborted) return stop(TIMED_OUT_ERROR);

  // The model of the analysis is the model of the research unless the organization chose another.
  const analysisModel = resolved.analysis ?? resolved;
  const analysed = await analyse({
    // The names the research found on the vendor's home page join the ones a person wrote, so that
    // the analysis names the vendor as the research did: a source the research kept for a name of
    // the site is not refused here for being about someone else.
    target: withAliases(target, found.siteNames ?? []),
    // The scorecard goes to the analysis only: the loop turns the vendor into web searches.
    materiality: buildMateriality(vendor),
    pack,
    // Where the sources came from, for the credibility labels the analysis returns.
    provenance,
    // Who filed a filing under the stored CIK, for those labels: asked of the SEC only while its
    // gate is open, since the request names the contact of Q4.
    edgarFilerOf: VRDB_GATES.Q4 ? (deps.edgarFilerOf ?? processEdgarFilerOf) : undefined,
    model: analysisModel.model,
    modelId: analysisModel.modelId,
    // What the loop learned about a provider holds for the analysis only when it is the same model.
    jsonObjectFallback: resolved.analysis ? false : found.jsonObjectFallback,
    now,
    generate: deps.generate,
    trace,
    // The reader of the research, so that a finding that rests on snippets has a page read.
    readPage: found.readPage,
    verifier: deps.verifier === true,
    // Aborted when the run timed out: the analysis, the verifier and the EDGAR lookups stop.
    signal: progress.abandoned.signal,
    loadKnown: async () => {
      const [existingRisks, priorFindings] = await Promise.all([
        // Only the active risks. The default of the query is the same, but the rule is said here.
        getVendorRisksByVendorIdQuery(vendorId, organizationId, "active"),
        getFindingsForVendorQuery(organizationId, vendorId),
      ]);
      return { existingRisks, priorFindings };
    },
  });
  if (!analysed.ok) {
    return stop(`Model call failed: ${modelFailurePhrase(args, "the analysis", analysed.error)}`);
  }
  const { kept, duplicatesDropped: dropped, output } = analysed;
  // Each label goes with its finding at once, so that nothing can part them later.
  const findings = kept.map((finding, index) =>
    withCredibility(finding, analysed.credibility[index], provenance),
  );
  const cited = citedBy(findings, provenance);
  trace.cited(cited.categories, cited.unreviewedHosts);
  progress.coverage = { ...progress.coverage, cited: cited.categories };

  return complete(
    findings,
    dropped,
    summaryOf(
      findings,
      new Set(output.findings.map((candidate) => candidate.category)),
      output.category_notes,
    ),
    remember,
    policies.writes,
  );
}

/** `research`, with every error turned into a decision to fail the run. It never rejects. */
async function decide(args: RunArgs, deps: PipelineDeps, progress: Progress): Promise<Decision> {
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
    if (!(await finishRunQuery(payload))) {
      logger.info(
        `vendor research run ${payload.runId}: the run had already ended, so the failure was not written`,
      );
    }
  } catch (error) {
    logger.error(
      `vendor research run ${payload.runId}: could not record that it failed: ${describeError(error)}`,
    );
  }
}

/**
 * Thrown inside the transaction of `completeRun` when the finish wrote nothing: the run had ended
 * before (it timed out, or the sweep failed it), so the findings are rolled back.
 */
class RunAlreadyEnded extends Error {}

/**
 * Saves the findings and ends the run as completed, in one transaction. The only code that writes
 * a completed run. It never rejects. When the run had ended already, the finish writes nothing and
 * the transaction is rolled back: the findings are not saved and nothing is written over the end.
 */
async function completeRun(
  args: RunArgs,
  { findings, payload, remember, snapshots }: Extract<Decision, { kind: "complete" }>,
): Promise<PipelineResult> {
  const { organizationId, vendorId, runId } = args;
  logger.info(
    `${tag(args)}: saving ${findings.length} findings, ${payload.duplicatesDropped} duplicates dropped`,
  );
  try {
    await sequelize.transaction(async (transaction) => {
      await insertFindingsQuery({ organizationId, vendorId, runId, findings }, transaction);
      if (!(await finishRunQuery(payload, transaction))) throw new RunAlreadyEnded();
    });
  } catch (error) {
    if (error instanceof RunAlreadyEnded) {
      logger.warn(`${tag(args)}: the run had already ended, so its findings are not saved`);
      return { outcome: "failed", findingsCreated: 0 };
    }
    // The transaction was rolled back, so the run is still running. The failed payload holds
    // nothing the model wrote: if its text was the reason for the failure, it would fail again.
    // The run records a fixed phrase, so this line is the only place that has the message.
    logger.error(`${tag(args)}: saving the findings failed: ${describeError(error)}`);
    // No finding was saved, so the run cites nothing.
    await recordFailure({
      ...payload,
      status: "failed",
      categorySummary: [],
      error: SAVING_FAILED_NOTE,
      coverage: payload.coverage === null ? null : { ...payload.coverage, cited: noneCited() },
    });
    return { outcome: "failed", findingsCreated: 0 };
  }

  // The transaction has committed and the run is completed. Nothing below this line can fail it.
  await rememberSources(args, remember);
  await saveSnapshots(args, snapshots);
  return { outcome: "completed", findingsCreated: findings.length };
}

/**
 * Researches one vendor for one queued run. The run ends once: completed, with its findings, or
 * failed. Failures of the web, of the model and of the database are not thrown; they end the run as
 * failed, and so does a run that reaches its time limit (RUN_TIME_LIMIT_MINUTES, or
 * `deps.runTimeLimitMs`): it fails as timed out and what the abandoned work decides afterwards is
 * ignored. A run that is not queued, that has waited in the queue for longer than the stale limit
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

  const progress = newProgress();
  const decided = decide(args, deps, progress);
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<"timed out">((resolve) => {
    timer = setTimeout(
      () => resolve("timed out"),
      deps.runTimeLimitMs ?? RUN_TIME_LIMIT_MINUTES * 60_000,
    );
    timer.unref();
  });
  let decision: Decision | "timed out";
  try {
    decision = await Promise.race([decided, limit]);
  } finally {
    clearTimeout(timer);
  }
  if (decision === "timed out") {
    // The late decision is ignored: `decide` writes nothing and never rejects. The work behind it
    // is told to stop, so that it asks no model and no EDGAR lookup for a run that has failed.
    progress.abandoned.abort();
    decided.catch(() => undefined);
    logger.warn(`${tag(args)}: stopped: the run reached its time limit`);
    await recordFailure(
      finishInput(args, progress, {
        status: "failed",
        categorySummary: [],
        duplicatesDropped: 0,
        error: TIMED_OUT_ERROR,
      }),
    );
    return { outcome: "failed", findingsCreated: 0 };
  }
  if (decision.kind === "fail") {
    logger.warn(`${tag(args)}: stopped: ${decision.payload.error}`);
    await recordFailure(decision.payload);
    return { outcome: decision.outcome, findingsCreated: 0 };
  }
  return completeRun(args, decision);
}
