/**
 * Research as one loop for each category (see researchAgent.ts): what each loop is given, and how
 * the endings of the loops become the ending of the run. The loops run at the same time on one
 * web session, each through a pool of its own (`WebSession.pool`), so that a category that needs
 * many pages cannot use up the budget of another.
 */
import type { ResearchCategory } from "../../domain.layer/interfaces/i.vendorResearch";
import type { StopReason } from "../webResearch/researchLoop";
import { SITE_CATEGORIES } from "./categories";

/** The model turns of one loop. The routine work is done before it, so few turns are enough. */
export const CATEGORY_LOOP_STEPS = 4;

/**
 * The searches of a category that reads the vendor's website. The web feed does not answer a topic
 * (see the web research reference), so such a category needs one at most, to find a page that its
 * links lead nowhere near.
 */
export const SITE_LOOP_SEARCHES = 1;

export interface LoopGrant {
  category: ResearchCategory;
  searches: number;
  reads: number;
}

/** `amount` split in `parts` whole numbers that differ by one at most, the larger ones first. */
const share = (amount: number, parts: number): number[] =>
  Array.from(
    { length: parts },
    (_, index) => Math.floor(amount / parts) + (index < amount % parts ? 1 : 0),
  );

/**
 * Splits `total` (what one loop would have had) between the loops of `researchable`, in its
 * order, so that the run costs what one loop did. The reads are shared out evenly. A category of
 * the vendor's website gets `SITE_LOOP_SEARCHES` searches and the categories of the news share
 * the rest; with only one kind, that kind shares all of them.
 */
export function loopGrants(
  researchable: readonly ResearchCategory[],
  total: { searches: number; reads: number },
): LoopGrant[] {
  if (researchable.length === 0) return [];
  const ofSite = researchable.filter((category) => SITE_CATEGORIES.includes(category));
  const ofNews = researchable.filter((category) => !SITE_CATEGORIES.includes(category));
  const forSite =
    ofNews.length === 0
      ? total.searches
      : Math.min(SITE_LOOP_SEARCHES * ofSite.length, total.searches);
  const siteSearches = share(ofSite.length === 0 ? 0 : forSite, ofSite.length);
  const newsSearches = share(total.searches - (ofSite.length === 0 ? 0 : forSite), ofNews.length);
  const reads = share(total.reads, researchable.length);
  return researchable.map((category, index) => ({
    category,
    searches: SITE_CATEGORIES.includes(category)
      ? siteSearches[ofSite.indexOf(category)]
      : newsSearches[ofNews.indexOf(category)],
    reads: reads[index],
  }));
}

export interface LoopEnding {
  stoppedBecause: StopReason;
  /** The error that ended the loop as `model_error`; null otherwise. */
  modelError: unknown | null;
}

/** Which ending says more about the run, the first first. `model_error` is decided apart. */
const ENDING_PRIORITY: readonly StopReason[] = ["time", "steps", "budget", "finished"];

/**
 * The ending of the run, from the endings of its loops. A limit that cut a loop short is told
 * before a loop that finished: time, then steps, then budget. A loop that failed is told only when
 * all of them did, since the others have gone on and what the failed one gathered is kept; then
 * the error is the first one that a loop kept (a call that rejected with nothing in it keeps none).
 */
export function combineEndings(endings: readonly LoopEnding[]): LoopEnding {
  const failed = endings.filter((ending) => ending.stoppedBecause === "model_error");
  if (endings.length > 0 && failed.length === endings.length) {
    return {
      stoppedBecause: "model_error",
      modelError: failed.find((ending) => ending.modelError !== null)?.modelError ?? null,
    };
  }
  const stoppedBecause =
    ENDING_PRIORITY.find((reason) => endings.some((ending) => ending.stoppedBecause === reason)) ??
    "finished";
  return { stoppedBecause, modelError: null };
}
