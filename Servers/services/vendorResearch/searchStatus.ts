/**
 * What the research settings window shows about search: which search each of the organization's
 * LLM keys gets (see searchEngineOf.ts), and whether the news search of the GDELT Project has been
 * failing for the organization's recent runs.
 *
 * A key that is not Anthropic's own gets its news from GDELT alone, and GDELT can refuse a server
 * (it answers some hosts with HTTP 429 to every request). A run then still reads the vendor's own
 * pages and the public databases, but finds no news, and nothing on the page says why until the
 * person opens a run. The window warns before that happens, and more firmly once it has happened.
 *
 * It reads the category summary the runs already store, so it needs no column of its own, and it
 * returns an engine name and a boolean only, never a key, an address or a note.
 */
import type {
  CategorySummaryEntry,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { RESEARCH_CATEGORIES } from "../../domain.layer/interfaces/i.vendorResearch";
import { SITE_CATEGORIES } from "./categories";
import { searchEngineOf, type KeyRowForSearch, type SearchEngineChoice } from "./searchEngineOf";
import { NOTES } from "./summary";

/** How many of the latest GDELT runs are read: all of them must have found no news to warn. */
export const RECENT_GDELT_RUNS = 3;

/** How far back a run counts as recent, in days. An older failure says nothing about GDELT today. */
export const RECENT_GDELT_RUN_DAYS = 30;

/** The categories that search the news; the others read the vendor's own pages. */
const NEWS_CATEGORIES: readonly ResearchCategory[] = RESEARCH_CATEGORIES.filter(
  (category) => !SITE_CATEGORIES.includes(category),
);

/** The notes of a news category whose news search did not answer. */
const NO_NEWS_NOTES: ReadonlySet<string> = new Set([
  NOTES.searchUnavailable,
  NOTES.newsUnavailable,
  NOTES.newsUnavailableWithRecords,
]);

/**
 * Whether a news category of a run got an answer from its news search: it kept a finding, found
 * more than a run keeps, or found nothing with a note that is not one of the "not available" notes
 * (a note that some searches failed still says that others answered). A category that was skipped
 * or whose search failed did not.
 */
function newsAnswered(entry: CategorySummaryEntry): boolean {
  if (entry.outcome === "findings" || entry.outcome === "over_cap") return true;
  return entry.outcome === "nothing_found" && !NO_NEWS_NOTES.has(entry.note);
}

/**
 * Whether a finished run got no news at all: it has at least one news category and none of them
 * answered. A summary that cannot be read (not a list, or no news category in it) is not counted
 * as a failure, so a malformed row never raises a warning.
 */
export function runFoundNoNews(summary: unknown): boolean {
  if (!Array.isArray(summary)) return false;
  const news = summary.filter(
    (entry): entry is CategorySummaryEntry =>
      typeof entry === "object" &&
      entry !== null &&
      NEWS_CATEGORIES.includes((entry as CategorySummaryEntry).category) &&
      typeof (entry as CategorySummaryEntry).outcome === "string" &&
      typeof (entry as CategorySummaryEntry).note === "string",
  );
  return news.length > 0 && news.every((entry) => !newsAnswered(entry));
}

/** The search of each key, and of the default (the newest key, which a run uses when none is chosen). */
export interface ResearchSearchStatus {
  engines: {
    /** The search of the newest key; null when the organization has no key. */
    default: SearchEngineChoice | null;
    /** The search of every key, by its id. */
    byKey: Record<number, SearchEngineChoice>;
  };
  /**
   * True when the organization's latest GDELT runs (up to RECENT_GDELT_RUNS, of the last
   * RECENT_GDELT_RUN_DAYS days) all found no news; false when there is none.
   */
  gdeltNewsFailing: boolean;
}

/**
 * The search status of an organization. `keys` come newest first, the order of the key list;
 * `recentGdeltSummaries` are the category summaries of its latest finished GDELT runs.
 */
export function researchSearchStatus(
  keys: readonly (KeyRowForSearch & { id: number })[],
  recentGdeltSummaries: readonly unknown[],
): ResearchSearchStatus {
  const byKey: Record<number, SearchEngineChoice> = {};
  for (const key of keys) byKey[key.id] = searchEngineOf(key);
  const newest = keys[0];
  return {
    engines: { default: newest === undefined ? null : byKey[newest.id], byKey },
    gdeltNewsFailing: recentGdeltSummaries.length > 0 && recentGdeltSummaries.every(runFoundNoNews),
  };
}
