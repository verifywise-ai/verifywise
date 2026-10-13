/**
 * The vendor researcher: the research loop of the web research toolkit, set up for one vendor.
 *
 * Every run gets a web session of its own (budgets, provenance, the lookback window of each
 * category and the ledger) and a page reader of its own, so that the answers of robots.txt are
 * cached for that run only. The loop is offered the categories that can be researched for the
 * vendor: all four with a domain, without one only the two that search the news. A run only
 * collects: it leaves the ledger, the calls that reached the web and how the loop ended, and the
 * analysis is made from them afterwards.
 */
import { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { PageReader, createPageReader } from "../webResearch/readPage";
import { StopReason, runResearchLoop } from "../webResearch/researchLoop";
import { SearchEngine, createBingEngine } from "../webResearch/webSearch";
import { CallRecord, LedgerEntry, createWebSession } from "../webResearch/webSession";
import { LOOKBACK_MONTHS, monthsBefore, researchableCategories } from "./categories";
import { buildLoopSystemPrompt, buildLoopTaskPrompt } from "./prompts";
import { ResearchTarget } from "./target";

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
}

export type VendorResearcher = (input: {
  target: ResearchTarget;
  model: unknown;
  now: Date;
}) => Promise<ResearchResult>;

/**
 * A researcher that runs the loop once per call. It rejects only when the loop does, which is a bug
 * of the session; every other ending, a model error included, is a result.
 *
 * @param deps.engine Replaces the Bing engine, for tests.
 * @param deps.readPage Replaces the page reader that each run builds, for tests.
 * @param deps.generate Replaces the self-correcting structured call, for tests.
 */
export function createVendorResearcher(
  deps: {
    engine?: SearchEngine;
    readPage?: PageReader;
    generate?: typeof generateObjectWithSelfCorrection;
  } = {},
): VendorResearcher {
  const generate = deps.generate ?? generateObjectWithSelfCorrection;

  return async ({ target, model, now }) => {
    const researchable = researchableCategories(target);
    const cutoffs: Partial<Record<ResearchCategory, string>> = {};
    for (const category of RESEARCH_CATEGORIES) {
      cutoffs[category] = monthsBefore(now, LOOKBACK_MONTHS[category]);
    }
    const session = createWebSession<ResearchCategory>({
      engine: deps.engine ?? createBingEngine(),
      readPage: deps.readPage ?? createPageReader(),
      domain: target.domain,
      cutoffs,
    });

    const { stoppedBecause, modelError } = await runResearchLoop<ResearchCategory>(
      {
        system: buildLoopSystemPrompt(),
        task: buildLoopTaskPrompt({ target, now, researchable }),
        categories: RESEARCH_CATEGORIES,
        researchable,
      },
      { generate, model, session },
    );

    const { ledger, calls, searchesUsed, pagesRead } = session.snapshot();
    return { entries: ledger, calls, searchesUsed, pagesRead, stoppedBecause, modelError };
  };
}
