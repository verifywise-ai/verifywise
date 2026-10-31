/**
 * The vendor researcher: the research loop of the web research toolkit, set up for one vendor.
 *
 * Every run gets a web session of its own (budgets, provenance, the lookback window of each
 * category and the ledger) and a page reader of its own. With a cache (see webResearch/webCache.ts)
 * the reader and the engine of a run share the robots.txt of the sites, the pages and the searches
 * with the other runs; without one, the answers of robots.txt are kept for that run only. The loop is offered the categories that can be researched for the
 * vendor: all five with a domain, without one only the three that search the news. A run only
 * collects: it leaves the ledger, the calls that reached the web and how the loop ended, and the
 * analysis is made from them afterwards.
 *
 * Before the loop starts, a run can have the routine work done by code (see gather.ts): the news
 * searches and the reads of the vendor's own pages, all at once. The model is told what that
 * collected and spends its steps on what is missing.
 *
 * The loop can run as one loop for each category, all at the same time (see loops.ts): each gets a
 * budget of its own from the session, a few model turns, a task that names its category and a
 * briefing of what the code collected for that category only. The run ends as they end.
 */
import { wrapLanguageModel } from "ai";
import {
  type TokenUsage,
  generateObjectWithSelfCorrection,
  jsonObjectFallbackMiddleware,
} from "../../advisor/llmSelfCorrect";
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
  type RunCoverage,
  RunProgress,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { PageReader, createPageReader } from "../webResearch/readPage";
import type { PageRenderer } from "../webResearch/renderPage";
import { LoopObserver, StopReason, runResearchLoop } from "../webResearch/researchLoop";
import type { WebCache } from "../webResearch/webCache";
import { SearchEngine, createBingEngine } from "../webResearch/webSearch";
import { CallRecord, LedgerEntry, WebSession, createWebSession } from "../webResearch/webSession";
import { withAliases } from "./aliases";
import {
  LOOKBACK_MONTHS,
  SITE_CATEGORIES,
  monthsBefore,
  researchableCategories,
} from "./categories";
import {
  GATHER_TIMEOUT_MS,
  type GatheredAction,
  describeGathered,
  gatherSources,
  traceStepOfRecords,
  traceStepOfSitemap,
} from "./gather";
import { requestHints } from "./hints";
import { createVendorMatcher } from "./identity";
import { CATEGORY_LOOP_STEPS, combineEndings, loopGrants } from "./loops";
import { type ResearchMetrics, researchMetrics } from "./metrics";
import {
  PREFLIGHT_TIMEOUT_MS,
  aliasesOf,
  callsOfClosedSite,
  checkWebsite,
  closedHostsOf,
  describeWebsite,
  siteNamesOf,
  traceStepOf,
} from "./preflight";
import { buildLoopSystemPrompt, buildLoopTaskPrompt } from "./prompts";
import { type PolicyPage, collectPolicyPages } from "./policySnapshots";
import { normalizeQuery } from "./queries";
import type { RecordsLookup } from "./records";
import type { ResearchRules } from "./schema";
import { workedCategories } from "./summary";
import { ResearchTarget } from "./target";
import type { TraceRecorder } from "./trace";
import type { VrdbLookup } from "./vrdb/types";

export interface ResearchResult {
  /** The ledger of the run: one entry per URL, a result's snippet or a page's excerpt. */
  entries: LedgerEntry<ResearchCategory>[];
  /** The calls that reached the web, each with its category. */
  calls: CallRecord<ResearchCategory>[];
  searchesUsed: number;
  pagesRead: number;
  stoppedBecause: StopReason;
  /** The error that ended the loop as `model_error`; null otherwise. */
  modelError: unknown | null;
  /**
   * True when a call of the loop had to fall back to JSON-object mode: the provider rejects
   * json_schema, and the analysis can start in JSON-object mode too.
   */
  jsonObjectFallback: boolean;
  /**
   * The other names of the vendor that its home page gave (see aliases.ts), after the ones a person
   * wrote. The analysis adds them to its target, so that it names the vendor as the research did.
   * This researcher always gives it; a researcher that does not names the vendor by the record only.
   */
  siteNames?: string[];
  /**
   * The page reader the run researched with, handed on for the analysis: a finding that rests on
   * snippets alone has the page of its best source read with it (see verifySnippets.ts), under the
   * same rules of robots.txt and of the guarded fetch. This researcher always gives it; a
   * researcher that does not leaves the findings unchecked.
   */
  readPage?: PageReader;
  /**
   * The pages of the vendor's own site that state its terms (its privacy policy, its terms, its
   * data processing addendum, its list of subprocessors, its security page) that the run read,
   * with their whole text and not the excerpt of the ledger (see policySnapshots.ts). The pipeline
   * compares them with the ones kept from the earlier runs. A researcher that does not give them
   * leaves those pages unwatched.
   */
  policyPages?: PolicyPage[];
  /**
   * What the run checked in the public databases: the lists of the vendor risk database and the
   * databases asked beside it (see gather.ts). Only a run that looked the vendor up in the vendor
   * risk database gives it; the pipeline adds the version of the registry and the cited counts.
   */
  coverage?: Omit<RunCoverage, "cited" | "registry_version">;
}

/** The outcome of a search turn of the loop, as the counter of searches names it. */
const SEARCH_OUTCOME = {
  ok: "results",
  empty: "empty",
  refused: "refused",
  failed: "failed",
} as const;

/**
 * A search or a read, as the counters and the trace take it: a turn of the model, or an action of
 * the code, which has no number, no thought and never reads a part of a page.
 */
type RecordedTurn = GatheredAction & { n?: number; thought?: string | null; part?: number };

/** One loop of a run: the single loop of all the categories, or the loop of one category. */
interface LoopPlan {
  /** The category of the loop; null for the one loop of all the categories. */
  scope: ResearchCategory | null;
  /** The session the loop works through: the run's own, or a pool of it. */
  session: WebSession<ResearchCategory>;
  /** The categories the loop may use. */
  categories: readonly ResearchCategory[];
}

/**
 * Where the research loop is, after a turn: the part of a run's progress that the loop knows (the
 * run adds the phase and the time). Counts and closed words only.
 */
export type ResearchProgress = Omit<RunProgress, "phase" | "updatedAt">;

export type VendorResearcher = (input: {
  target: ResearchTarget;
  model: unknown;
  /** The id of the model, for the trace; the researcher calls `model`, never this. */
  modelId?: string;
  now: Date;
  /** Told about every turn of the loop and every model call of it; the run's trace. */
  trace?: TraceRecorder;
  /**
   * Told where the loop is after every turn, so that the run can show it while it is going. It
   * is not part of the research: a sink that throws changes nothing.
   */
  progress?: (progress: ResearchProgress) => void;
}) => Promise<ResearchResult>;

/**
 * A researcher that runs the loop once per call. It rejects only when the loop does, which is a bug
 * of the session (or of the routine work, which uses the session); every other ending, a model
 * error included, is a result.
 *
 * @param deps.engine Replaces the Bing engine, for tests.
 * @param deps.readPage Replaces the page reader that each run builds, for tests.
 * @param deps.generate Replaces the self-correcting structured call, for tests.
 * @param deps.metrics Replaces the counters of the process (searches by outcome, retries), for tests.
 * @param deps.cache The cache that runs share. It is given to the engine and the page reader that
 *   the researcher builds; an engine or reader that is injected is used as it is. None by default,
 *   which is what a live evaluation wants: it measures the web, not the cache.
 * @param deps.render The headless browser that the page reader of each run hands a page to when
 *   the page is a shell for a script and carries no text with it (see webResearch/renderPage.ts).
 *   It is given to the page reader that the researcher builds; a reader that is injected is used as
 *   it is. None by default: without one, such a page is reported as one that needs JavaScript.
 * @param deps.records Looks the vendor up in the public databases (the CISA catalog of exploited
 *   vulnerabilities, the NVD, Have I Been Pwned, the filings of the SEC) as part of the routine
 *   work (see records/). None by default, and without `gather` it is not used.
 * @param deps.gather Has the code do the routine work before the loop starts (see gather.ts). Off by
 *   default: a replay of recorded model answers should see only the calls that its model made.
 * @param deps.vrdb Looks the vendor up in the vendor risk database (see vrdb/) as part of the
 *   routine work, and gives the run its coverage. None by default, and without `gather` it is not
 *   used.
 * @param deps.rules The rules of the run, which order the news that the routine work reads (see
 *   gather.ts); the confidence rules by default.
 * @param deps.perCategory Runs one loop for each category at the same time instead of one loop for
 *   all of them (see loops.ts). Off by default, like `gather`, which it is meant to follow: each
 *   loop is told what the code collected for its category.
 */
export function createVendorResearcher(
  deps: {
    engine?: SearchEngine;
    readPage?: PageReader;
    generate?: typeof generateObjectWithSelfCorrection;
    metrics?: ResearchMetrics;
    cache?: WebCache;
    render?: PageRenderer;
    gather?: boolean;
    perCategory?: boolean;
    records?: RecordsLookup;
    vrdb?: VrdbLookup;
    rules?: ResearchRules;
  } = {},
): VendorResearcher {
  const generate = deps.generate ?? generateObjectWithSelfCorrection;

  return async ({ target, model, modelId, now, trace, progress }) => {
    const researchable = researchableCategories(target);
    const cutoffs: Partial<Record<ResearchCategory, string>> = {};
    for (const category of RESEARCH_CATEGORIES) {
      cutoffs[category] = monthsBefore(now, LOOKBACK_MONTHS[category]);
    }
    // One reader for the check and the session, so that the robots.txt of the site is asked once.
    const readPage =
      deps.readPage ??
      createPageReader({ cache: deps.cache, ...(deps.render ? { render: deps.render } : {}) });
    // A provider that rejects json_schema (DeepSeek, or OpenAI's strict mode for the step schema)
    // would cost a rejected request and a warning on every step. So once a call of this run had to
    // fall back to JSON-object mode, the rest of the run starts there. The call says so as it falls
    // back, so a call that then throws counts too; a result that reports the fall back counts as
    // well. The wrapped model is built once, and nothing undoes it.
    let jsonObjectModel: unknown = null;
    const learnFallback = () => {
      jsonObjectModel ??= wrapLanguageModel({
        model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
        middleware: jsonObjectFallbackMiddleware,
      });
    };
    const generateFor =
      (purpose: "loop" | "hints", loop?: ResearchCategory): typeof generate =>
      async (params, generateImpl) => {
        const startedAt = Date.now();
        // What the call used, counted as the calls report it, so that a call that ends by throwing
        // still says what it cost.
        const used: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        const onUsage = (usage: TokenUsage) => {
          used.inputTokens += usage.inputTokens;
          used.outputTokens += usage.outputTokens;
          used.totalTokens += usage.totalTokens;
          params.onUsage?.(usage);
        };
        try {
          const result = await generate(
            {
              ...params,
              ...(jsonObjectModel === null ? {} : { model: jsonObjectModel }),
              onJsonObjectFallback: learnFallback,
              onUsage,
            },
            generateImpl,
          );
          if (result.fellBackToJsonObject) learnFallback();
          trace?.modelCall({
            purpose,
            model: modelId,
            loop,
            ms: Date.now() - startedAt,
            attempts: result.attempts,
            ...(result.usage ?? used),
            ok: true,
          });
          return result;
        } catch (error) {
          trace?.modelCall({
            purpose,
            model: modelId,
            loop,
            ms: Date.now() - startedAt,
            ...used,
            ok: false,
          });
          throw error;
        }
      };

    // The model's memory, asked for while the website is checked: queries and nothing else (see
    // hints.ts). It never fails, so nothing waits on it but the routine work that uses it.
    const hintsAsked =
      deps.gather === true
        ? requestHints({ target, researchable, model }, { generate: generateFor("hints") })
        : null;

    // Before the loop, one read of the vendor's home page: whether the site can be read at all, and
    // the pages it links to. It runs outside the session and uses none of its budget.
    const checkStartedAt = performance.now();
    const website = await checkWebsite({
      target,
      readPage,
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
    const checkStep = traceStepOf(website, target, Math.round(performance.now() - checkStartedAt));
    if (checkStep !== null) trace?.step(checkStep);
    // The vendor is also known by the names its home page gave it, after the ones a person wrote.
    // From here on the run names the vendor by all of them: the results it keeps, the queries it
    // makes, the pages it reads around the names and what the model is told.
    const siteNames = siteNamesOf(website);
    const known = withAliases(target, siteNames);
    // A result that does not name the vendor in its title, snippet or address is the answer of an
    // engine that does not know the name, and it would only crowd the evidence.
    const mentionsVendor = createVendorMatcher(known);
    const metrics = deps.metrics ?? researchMetrics();
    // The pages that the session reads, for the model and for the routine work, are noted on the
    // way for the vendor's own pages that state its terms. The check above and the sitemap read
    // outside the session, and the analysis reads with the reader itself.
    const policies = collectPolicyPages(
      readPage,
      [target.domain, ...aliasesOf(website)].filter(
        (own): own is string => own !== null && own !== "",
      ),
    );
    const session = createWebSession<ResearchCategory>({
      engine:
        deps.engine ??
        createBingEngine({ onRetry: (kind) => metrics.searchRetried({ kind }), cache: deps.cache }),
      readPage: policies.read,
      domain: target.domain,
      // A site the recorded domain moved to is the vendor's website too.
      aliasDomains: aliasesOf(website),
      // A site that did not answer is not read again for every page the model tries.
      closedHosts: closedHostsOf(website, target),
      cutoffs,
      isRelevant: ({ title, snippet, url }) => mentionsVendor({ title, content: snippet, url }),
      // The feed answers a name and one to three topic words best, and does not understand
      // operators, so whatever the model writes is made that.
      normalizeQuery: (query) => normalizeQuery(query, known),
    });

    /**
     * What a search or a read came to, for the counters and the trace: the same for a turn of the
     * model and for what the code did before the loop (`by`). `loop` is the category of the loop
     * that took the turn, when the loops are one for each category.
     */
    const record = (turn: RecordedTurn, by?: "code", loop?: ResearchCategory) => {
      // What came of each search is counted whether or not the run keeps a trace.
      if (turn.tool === "search" && turn.kind !== undefined) {
        metrics.searchFinished({ kind: turn.kind, outcome: SEARCH_OUTCOME[turn.outcome] });
      }
      if (trace === undefined) return;
      const omitted = Object.fromEntries(
        Object.entries(turn.omitted ?? {}).filter(([, count]) => (count ?? 0) > 0),
      ) as Record<string, number>;
      trace.step({
        turn: turn.n,
        by,
        loop,
        tool: turn.tool,
        category: turn.category,
        kind: turn.kind,
        query: turn.query,
        usedQuery: turn.usedQuery,
        url: turn.url,
        part: turn.part,
        thought: turn.thought ?? undefined,
        outcome: turn.outcome,
        reason: turn.reason,
        results: turn.results,
        omitted: Object.keys(omitted).length === 0 ? undefined : omitted,
        ms: turn.ms,
      });
      // What never reached the evidence, counted by why, next to what the checks of the
      // analysis turn away.
      for (const [reason, count] of Object.entries(omitted)) {
        trace.dropped(`source.${reason}`, count);
      }
      if (turn.tool === "read" && turn.reason === "same_text") trace.dropped("source.same_text");
    };

    /** Tells the run where the research is: after a turn of the model (`steps`), or step 0 for the code. */
    const reportProgress = (
      steps: number,
      turn: Pick<RecordedTurn, "tool" | "category"> | null,
    ) => {
      if (progress === undefined) return;
      const { calls, searchesUsed, pagesRead } = session.snapshot();
      progress({
        steps,
        action:
          turn !== null && (turn.tool === "search" || turn.tool === "read") ? turn.tool : null,
        category: turn?.category ?? null,
        searchesUsed,
        pagesRead,
        categories: workedCategories(calls),
      });
    };

    // The latest model turn of each loop, so that the progress counts the turns of all of them.
    const latestTurns = new Map<ResearchCategory | null, number>();
    const observerOf = (loop: ResearchCategory | null): LoopObserver<ResearchCategory> => ({
      turn: (turn) => {
        record(turn, undefined, loop ?? undefined);
        latestTurns.set(loop, turn.n);
        reportProgress(
          [...latestTurns.values()].reduce((sum, n) => sum + n, 0),
          turn,
        );
      },
    });

    // The routine work, done by code and at once before the model's first step (see gather.ts).
    // It does not throw for what the web does; what it does is told to the counters, the trace and
    // the progress, which are not part of the research: one of them that throws changes nothing.
    const gathered =
      hintsAsked !== null
        ? await gatherSources(
            {
              target: known,
              researchable,
              website,
              hints: await hintsAsked,
              now,
              cutoffs,
              ...(deps.rules === undefined ? {} : { rules: deps.rules }),
              signal: AbortSignal.timeout(GATHER_TIMEOUT_MS),
            },
            {
              session,
              readPage,
              records: deps.records,
              ...(deps.vrdb === undefined ? {} : { vrdb: deps.vrdb }),
            },
          )
        : null;
    if (gathered !== null) {
      const quietly = (work: () => void) => {
        try {
          work();
        } catch {
          // Not part of the research.
        }
      };
      const sitemapStep = traceStepOfSitemap(gathered.sitemap);
      if (sitemapStep !== null) quietly(() => trace?.step(sitemapStep));
      for (const outcome of gathered.records) {
        quietly(() => trace?.step(traceStepOfRecords(outcome)));
      }
      for (const action of gathered.actions) quietly(() => record(action, "code"));
      quietly(() => reportProgress(0, null));
    }
    // One loop for all the categories, or one for each. The pools are cut from the model's own
    // budget before any loop runs, so that no loop's budget depends on another's pace.
    const { searchesLeft, readsLeft } = session.budget();
    const plans: LoopPlan[] =
      deps.perCategory === true
        ? loopGrants(researchable, { searches: searchesLeft, reads: readsLeft }).map(
            ({ category, searches, reads }) => ({
              scope: category,
              session: session.pool({ searches, reads }),
              categories: [category],
            }),
          )
        : [{ scope: null, session, categories: researchable }];
    const ledgerAfterGather = session.snapshot().ledger;
    const briefingOf = ({ scope, categories }: LoopPlan): string | undefined => {
      const digest =
        gathered === null
          ? null
          : scope === null
            ? gathered.digest
            : describeGathered(gathered.actions, ledgerAfterGather, categories, gathered.records);
      // What the website check found out is for the loops that read the website.
      const siteLoop = scope === null || categories.some((c) => SITE_CATEGORIES.includes(c));
      const text = [siteLoop ? describeWebsite(website, known) : null, digest]
        .filter((part): part is string => part !== null)
        .join("\n\n");
      return text === "" ? undefined : text;
    };

    // Every loop is waited for, also when one of them breaks: none is left to run behind the run.
    const settled = await Promise.allSettled(
      plans.map((plan) =>
        runResearchLoop<ResearchCategory>(
          {
            system: buildLoopSystemPrompt(),
            task: buildLoopTaskPrompt({
              target: known,
              now,
              researchable: plan.categories,
              searched: gathered !== null,
              scope: plan.scope ?? undefined,
            }),
            briefing: briefingOf(plan),
            categories: RESEARCH_CATEGORIES,
            researchable: plan.categories,
            // The briefing says what the code searched for, so an empty answer is an answer.
            allowEmptyFinish: gathered !== null,
            ...(plan.scope === null ? {} : { limits: { maxSteps: CATEGORY_LOOP_STEPS } }),
          },
          {
            generate: generateFor("loop", plan.scope ?? undefined),
            model,
            session: plan.session,
            observer: observerOf(plan.scope),
          },
        ),
      ),
    );
    const broken = settled.find((outcome) => outcome.status === "rejected");
    if (broken !== undefined) throw broken.reason;
    const { stoppedBecause, modelError } = combineEndings(
      settled.flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : [])),
    );

    const { ledger, calls, searchesUsed, pagesRead } = session.snapshot();
    return {
      entries: ledger,
      // A closed site counts for the categories that needed it as pages that could not be read.
      calls: [...calls, ...callsOfClosedSite(website, researchable, calls)],
      searchesUsed,
      pagesRead,
      stoppedBecause,
      modelError,
      jsonObjectFallback: jsonObjectModel !== null,
      siteNames,
      readPage,
      policyPages: policies.pages(),
      ...(gathered?.vrdb == null
        ? {}
        : { coverage: { sources: gathered.vrdb.coverage, lookups: gathered.lookups } }),
    };
  };
}
