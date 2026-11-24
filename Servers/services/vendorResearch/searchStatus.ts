/**
 * What the research settings window shows about search: which search each of the organization's
 * LLM keys gets (see searchEngineOf.ts; a key with no search of its own gets Brave when the
 * organization has a Brave key), whether it has a Brave key, and whether the organization's recent
 * runs got no news.
 *
 * A key that is not Anthropic's own gets its news from GDELT alone, and GDELT can refuse a server
 * (it answers some hosts with HTTP 429 to every request). A run then reads the vendor's own pages
 * and the public databases but finds no news, and nothing on the page says why until the person
 * opens a run. The window warns before that happens, and more firmly once it has happened.
 *
 * It reads the category summary the runs already store, so it needs no column of its own. It does
 * not filter on `search_engine`: that column is written only when a search was answered, so it is
 * null on exactly the runs whose news search failed. It returns engine names and a boolean only,
 * never a key, an address or a note.
 */
import type {
  CategorySummaryEntry,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { RESEARCH_CATEGORIES } from "../../domain.layer/interfaces/i.vendorResearch";
import { SITE_CATEGORIES } from "./categories";
import { searchEngineWith, type KeyRowForSearch, type SearchEngineChoice } from "./searchEngineOf";
import { NOTES } from "./summary";

/** How many of the latest runs that say something about the news are judged; all must have none. */
export const RECENT_NEWS_RUNS = 3;

/**
 * How many finished runs are read to find them: runs that say nothing about the news (a time
 * limit, a failed model, no summary) are skipped, so more are read than are judged.
 */
export const RECENT_RUNS_READ = 10;

/** How far back a run counts as recent, in days. An older failure says nothing about today. */
export const RECENT_RUN_DAYS = 30;

/** The categories that search the news; the others read the vendor's own pages. */
const NEWS_CATEGORIES: readonly ResearchCategory[] = RESEARCH_CATEGORIES.filter(
  (category) => !SITE_CATEGORIES.includes(category),
);

/** The notes of a news category whose news search was made and did not answer. */
const NO_NEWS_NOTES: ReadonlySet<string> = new Set([
  NOTES.searchUnavailable,
  NOTES.newsUnavailable,
  NOTES.newsUnavailableWithRecords,
]);

/**
 * What a finished run says about the news:
 * - `answered`: a news category kept a finding, found more than a run keeps, or found nothing with
 *   a note other than the "not available" notes (a note that some searches failed says that others
 *   answered);
 * - `no_news`: no news category answered, and at least one carries a "not available" note, so its
 *   news search was made and failed;
 * - `unknown`: anything else. A category skipped by the time limit or an early end, a page that
 *   could not be read, a run with no summary or one that cannot be read say nothing about whether
 *   the news search works, so they never raise a warning.
 */
export type RunNewsOutcome = "answered" | "no_news" | "unknown";

export function runNewsOutcome(summary: unknown): RunNewsOutcome {
  if (!Array.isArray(summary)) return "unknown";
  const news = summary.filter(
    (entry): entry is CategorySummaryEntry =>
      typeof entry === "object" &&
      entry !== null &&
      NEWS_CATEGORIES.includes((entry as CategorySummaryEntry).category) &&
      typeof (entry as CategorySummaryEntry).outcome === "string" &&
      typeof (entry as CategorySummaryEntry).note === "string",
  );
  const answered = news.some(
    (entry) =>
      entry.outcome === "findings" ||
      entry.outcome === "over_cap" ||
      (entry.outcome === "nothing_found" && !NO_NEWS_NOTES.has(entry.note)),
  );
  if (answered) return "answered";
  return news.some((entry) => NO_NEWS_NOTES.has(entry.note)) ? "no_news" : "unknown";
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
   * True when the organization's latest runs that say something about the news (up to
   * RECENT_NEWS_RUNS, of the last RECENT_RUN_DAYS days) all got none; false when there is none.
   */
  recentRunsFoundNoNews: boolean;
  /**
   * True when the organization has a Brave Search key that can be read: a key with no search of its
   * own then searches with Brave (`brave`) instead of GDELT. Never the key itself.
   */
  braveConfigured: boolean;
}

/**
 * The search status of an organization. `keys` come newest first, the order of the key list;
 * `recentSummaries` are the category summaries of its latest finished runs, newest first;
 * `braveConfigured` says whether it has a Brave Search key.
 */
export function researchSearchStatus(
  keys: readonly (KeyRowForSearch & { id: number })[],
  recentSummaries: readonly unknown[],
  braveConfigured = false,
): ResearchSearchStatus {
  const brave = braveConfigured === true;
  const byKey: Record<number, SearchEngineChoice> = {};
  for (const key of keys) byKey[key.id] = searchEngineWith(key, brave);
  const newest = keys[0];
  const judged = recentSummaries
    .map(runNewsOutcome)
    .filter((outcome) => outcome !== "unknown")
    .slice(0, RECENT_NEWS_RUNS);
  return {
    engines: { default: newest === undefined ? null : byKey[newest.id], byKey },
    recentRunsFoundNoNews: judged.length > 0 && judged.every((outcome) => outcome === "no_news"),
    braveConfigured: brave,
  };
}
