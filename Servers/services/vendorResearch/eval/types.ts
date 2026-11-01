/**
 * The vocabulary of the evaluation of the research agent: a case is a vendor, a recording of what
 * the model and the web did for it, what a person would have wanted from the run, and the
 * thresholds that say whether the agent gets there.
 *
 * A recording is everything a run needs from outside: the steps the model took in the loop, what
 * each search and each page read answered, and the model's analysis. Replayed through the real
 * researcher and the real analysis (see runCase.ts), it needs no network, no key and no model, so
 * a case runs in a unit test and gives the same result every time. A recording comes from two
 * places: a person writes it by hand to reproduce a failure on purpose (the synthetic cases), or
 * `--record` of the command line captures it from a live run.
 */
import type { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import type {
  CredibilityLabel,
  ResearchCategory,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { FetchedPage, ReadFailureReason } from "../../webResearch/readPage";
import type { LoopStep } from "../../webResearch/researchLoop";
import type { SearchKind, SearchResult } from "../../webResearch/webSearch";
import type { KnownRisk, PriorFinding } from "../dedupe";
import type { Hints } from "../hints";
import type { RecordsOutcome } from "../records";
import type { Verdicts } from "../verifier";
import type { AnyResearchOutput } from "../schema";
import type { VendorIdentifiers } from "../target";
import type { ReadThroughOutcome, VrdbRow, VrdbSourceState } from "../vrdb/types";

export interface EvalVendor {
  name: string;
  /** As a person types it into the vendor form, for example "acme.com". */
  website: string;
  provides: string;
  /**
   * As a person types it into the *Other names* field of the vendor form, for example
   * "Facebook, Instagram". Absent for a vendor with no other name written (see aliases.ts).
   */
  otherNames?: string;
  /** As a person fills the identifiers of the vendor form (spec Q1). Absent for a vendor with none. */
  identifiers?: VendorIdentifiers;
  /**
   * The answers of the vendor's scorecard that the analysis reads as the materiality of the vendor
   * (see materiality.ts). Absent for a vendor that has answered none.
   */
  scorecard?: Pick<IVendor, "data_sensitivity" | "business_criticality" | "regulatory_exposure">;
}

export interface Recording {
  /**
   * The steps the model took in the loop, in order. When they run out the model finishes. For a
   * run with one loop for each category (`EvalCase.perCategory`) these are the steps of a loop of
   * all the categories, which that run has none of: its steps are in `loops`.
   */
  steps: LoopStep<ResearchCategory>[];
  /**
   * The steps of the loop of each category, in order, for a run with one loop for each category.
   * A category with no steps recorded finishes at its first turn.
   */
  loops?: Partial<Record<ResearchCategory, LoopStep<ResearchCategory>[]>>;
  /** What each search answered, found by its kind and its words (see replay.ts). */
  searches: Array<{ kind: SearchKind; query: string; results: SearchResult[] }>;
  /** What each page read answered: the page, or why it could not be read. */
  pages: Array<{ url: string; page: FetchedPage } | { url: string; failure: ReadFailureReason }>;
  /**
   * The answer of the analysis call. It has no confidence since the model is not asked for one; a
   * recording made before that holds one, and the schema of the analysis drops it on replay.
   */
  analysis: AnyResearchOutput;
  /**
   * The answer of the call for hints (see hints.ts), made by a run that does the routine work.
   * Absent when the model gave none.
   */
  hints?: Hints;
  /**
   * The answer of the verifier (see verifier.ts), made by a run that has it on (`EvalCase.verifier`).
   * Absent when it failed no finding: a finding without a verdict is passed.
   */
  verifier?: Verdicts;
  /**
   * What the public databases answered (see records/), found by a run that does the routine work.
   * Absent when the run is given no lookup, as before records existed.
   */
  records?: RecordsOutcome[];
  /**
   * What the copies of the lists of the vendor risk database held (see vrdb/): the stored records,
   * in any status, and where each copy stands; and what each read-through source did for the run
   * (vrdb/readThrough.ts): the key it was asked by, whether the answer was fresh, fetched or
   * failed, and its day. A run that does the routine work is offered from them as the lookup offers
   * (`offerRecords`), under either rules; a read-through source without an answer is not
   * researched. Absent for a run given no vendor risk database.
   */
  vrdb?: {
    rows: VrdbRow[];
    states: VrdbSourceState[];
    readThrough?: Array<{ id: VrdbSourceId } & ReadThroughOutcome>;
  };
}

/** A risk that a person would want in the findings: its category and words that identify it. */
export interface ExpectedFinding {
  category: ResearchCategory;
  /** A finding matches when its description or impact has any of these, in any case. */
  anyOf: string[];
  /**
   * The credibility label a person expects of a finding that matches (see credibility.ts). Absent
   * when the label is not measured.
   */
  credibility?: CredibilityLabel;
  /**
   * True when the label is expected to carry the note that a cited record matched the vendor by
   * name only. Checked when `credibility` is given; absent means false.
   */
  nameOnly?: boolean;
}

/** One real-world event. A run should report it at most once, whatever the number of sources. */
export interface ExpectedCluster {
  id: string;
  anyOf: string[];
}

/** What a case asks of the agent. A measure that is absent is not asked. */
export interface Targets {
  minPrecision?: number;
  minRecall?: number;
  /** The most findings that may stay. */
  maxKept?: number;
  /** Sources of the pack that do not mention the vendor. */
  maxIrrelevantSources?: number;
  /** Sources of the pack whose text is the text of an earlier one. */
  maxDuplicateSources?: number;
  /** Sources whose address ends in an encoded quotation mark. */
  maxBadUrls?: number;
  /** Search results from the web feed that carry a date: the feed gives its crawl date. */
  maxDatedWebResults?: number;
  /** Findings that cite snippets only, no page that was read. */
  maxSnippetOnlyFindings?: number;
  /** Kept findings whose credibility label, or name-only note, is not their expected finding's. */
  maxMislabelled?: number;
  /** Findings beyond the first about one event. */
  maxDuplicateClusters?: number;
  /** Quotes and candidates the validation turned away. */
  maxCitationsRejected?: number;
}

/**
 * The roadmap idea (docs/superpowers/plans/2026-10-27-vendor-research-agent-performance.md) that
 * is meant to meet a target the agent does not meet yet. A gap is listed on purpose: the ratchet
 * test fails when a target in `gaps` is met, or when one that is not in it is missed, so that fixing
 * something means deleting its line, and breaking something cannot pass.
 */
export type Gaps = Partial<Record<keyof Targets, number>>;

export interface EvalCase {
  id: string;
  title: string;
  /** What went wrong in the real runs that this case reproduces. */
  reproduces: string;
  vendor: EvalVendor;
  /** The moment of the run, ISO 8601. */
  now: string;
  /**
   * True when the researcher does the routine work before the loop (see gather.ts): the recording
   * of a live run was made with it, and its steps only make sense when it is replayed with it.
   * Absent for the cases written by hand, whose steps do all the work themselves.
   */
  gather?: boolean;
  /**
   * True when the researcher runs one loop for each category at the same time (see loops.ts): the
   * recording of a live run was made that way, and its steps are in `recording.loops`.
   */
  perCategory?: boolean;
  /**
   * True when the findings that stay are checked by the verifier, one more model call (see
   * verifier.ts): the recording of a live run was made with it, and its verdicts are in
   * `recording.verifier`.
   */
  verifier?: boolean;
  recording: Recording;
  /** The register and the earlier findings the run starts from. */
  known?: { existingRisks: KnownRisk[]; priorFindings: PriorFinding[] };
  expected: {
    findings: ExpectedFinding[];
    clusters?: ExpectedCluster[];
    /** What the coverage of the run should say: the lists whose copy is out of date. */
    coverage?: { stale?: VrdbSourceId[] };
  };
  targets: Targets;
  gaps: Gaps;
}
