/**
 * The category summary of a run: what became of each category, as one of the five outcomes and a
 * note from a closed set of phrases, which the UI maps to translated sentences.
 *
 * It is made from the calls of the research loop, so that "looked and found nothing" is never
 * confused with "could not look" or "did not look". A category was worked on when at least one call
 * tagged with it reached the web, and answered when the web answered one of them: a feed, even an
 * empty one, or a page that was read. A call that the rules refused never reached the web, so it is
 * not among the calls and is no work on a category.
 */
import {
  CategorySummaryEntry,
  NewFinding,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { StopReason } from "../webResearch/researchLoop";
import type { CallRecord, LedgerEntry } from "../webResearch/webSession";
import { NO_DOMAIN_NOTE, SITE_CATEGORIES } from "./categories";
import { MAX_NOTE_CHARS, ResearchOutput } from "./schema";
import { cleanText, cutAtCodePoint } from "./text";

/** The fixed notes. The UI knows each of them, and shows nothing it does not know. */
export const NOTES = {
  /** Answered, and the model proposed nothing and wrote no note. */
  nothingFound: "No risks found in the sources reviewed",
  /** The model proposed a risk and none stayed: validation or de-duplication took it. */
  unconfirmed: "Possible risks were found but could not be verified or are already recorded",
  /**
   * The model proposed a risk that held up and none of the category stayed: the caps of the run
   * took the risks that held up (and the verifier, when on, the ones the caps kept).
   */
  overCap: "More risks were found than one run keeps",
  /**
   * Every call was a search that failed; or the category has no call and its searches failed for
   * want of an answer (`searchUnavailable` of the research).
   */
  searchUnavailable: "The search was not available",
  /**
   * A news category whose searches all failed, and whose sources are all the vendor's own pages
   * or records: what it says rests on those alone, not on the news.
   */
  newsUnavailable: "News search was not available; checked on the vendor's own pages only",
  /** As newsUnavailable, when the sources of it include a record of a public database. */
  newsUnavailableWithRecords:
    "News search was not available; checked on the vendor's own pages and public databases only",
  /** Worked on, no call answered, and a page could not be read. */
  pagesUnreadable: "The pages could not be read",
  /** No call, because the loop ran out of time. */
  timeLimit: "Not researched: the time limit was reached",
  /** No call, because the loop ended for another reason first. */
  endedEarly: "Not researched: the research ended before this category was covered",
  /**
   * A scheduled run, which analyses only the sources that no earlier run showed to the model: the
   * category was worked on and none of its sources is new.
   */
  noNewSources: "No new sources since the last run",
} as const;

export const findingsNote = (count: number): string =>
  count === 1 ? "1 potential risk found" : `${count} potential risks found`;

export const pagesFailedNote = (failed: number, total: number): string =>
  `No risks found; ${failed} of ${total} pages could not be read`;

export const searchesFailedNote = (failed: number, total: number): string =>
  `No risks found; ${failed} of ${total} searches were not available`;

export const searchesAndPagesFailedNote = (
  failedSearches: number,
  searches: number,
  failedPages: number,
  pages: number,
): string =>
  `No risks found; ${failedSearches} of ${searches} searches were not available and ${failedPages} of ${pages} pages could not be read`;

/** The categories that at least one call was tagged with, in category order. */
export function workedCategories(calls: CallRecord<ResearchCategory>[]): ResearchCategory[] {
  return RESEARCH_CATEGORIES.filter((category) => calls.some((call) => call.category === category));
}

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
 * One entry for each category, in category order. The first rule that applies decides:
 *
 * 1. A category that needs the vendor's domain, for a vendor without one: `skipped`.
 * 2. A kept finding: `findings`, with a plain count, also when some calls of the category failed.
 * 3. No call: `search_failed`, the search was not available, when searches of it failed for want
 *    of an answer (`searchUnavailable`: a search that the clock cut off while the engine had not
 *    answered leaves no call); otherwise `skipped`, because the time ran out or the loop ended
 *    before it got there.
 * 4. No call answered: `search_failed`. The search was not available when every call was a failed
 *    search; once a page could not be read, the pages could not be read.
 * 5. A news category (one that is not in SITE_CATEGORIES: it rests on what the searches bring, not
 *    on the vendor's site) whose searches were none of them answered (it made some, or
 *    `searchUnavailable` names it): pages of it that were read do not make "no risks found" true
 *    for the news that was never searched. When at least one source of it survived and every
 *    source of it is the vendor's own page or a record (`entries`), `nothing_found` with the note
 *    that only the vendor's own pages (and public databases, when a record is among them) were
 *    checked; otherwise `search_failed`, the search was not available. A
 *    category of the vendor's site is not this rule: its pages carry it, and its failed searches
 *    are counted by rule 7.
 * 6. The model proposed a risk in it and none stayed: `nothing_found`, the possible risks were not
 *    confirmed; or, when the cap of the run cut a risk of it (`capped`), `over_cap`: more risks
 *    were found than one run keeps. The cap has an outcome of its own, so that what the UI says of
 *    the category never rests on the note, which on `nothing_found` may be text the model wrote.
 * 7. A search or a page of it failed: `nothing_found`, and the note counts them: the searches, the
 *    pages, or both.
 * 8. A scheduled run (`freshCategories` is given) and the category has no new source: `nothing_found`,
 *    and the note says so, since the model saw nothing of it and a note of its own would describe
 *    nothing.
 * 9. Otherwise `nothing_found`, with the model's own note, or a plain sentence when it wrote none.
 *    A note that sits next to a risk that was dropped, or next to a call that failed, would
 *    describe what nobody could check, so it is shown only here.
 */
export function summariseCategories(input: {
  /** The categories that cannot be researched, for want of the vendor's domain. */
  skippedNoDomain: ResearchCategory[];
  calls: CallRecord<ResearchCategory>[];
  kept: NewFinding[];
  /** The categories in which the model proposed a risk, whatever became of it. */
  proposed: ReadonlySet<ResearchCategory>;
  modelNotes: ResearchOutput["category_notes"];
  stoppedBecause: StopReason;
  /**
   * For a scheduled run: the categories that have a source the model was shown. Absent for a run
   * that analysed every source.
   */
  freshCategories?: ReadonlySet<ResearchCategory>;
  /** The categories of the risks that held up and that the caps cut. */
  capped?: ReadonlySet<ResearchCategory>;
  /** The categories whose searches failed for want of an answer, none answered (see rule 3). */
  searchUnavailable?: readonly ResearchCategory[];
  /** The sources of the run, to tell a category checked on the vendor's own pages only (rule 5). */
  entries?: readonly Pick<LedgerEntry<ResearchCategory>, "category" | "onVendorSite" | "record">[];
}): CategorySummaryEntry[] {
  return RESEARCH_CATEGORIES.map((category): CategorySummaryEntry => {
    if (input.skippedNoDomain.includes(category)) {
      return { category, outcome: "skipped", note: NO_DOMAIN_NOTE };
    }
    const keptCount = input.kept.filter((finding) => finding.category === category).length;
    if (keptCount > 0) return { category, outcome: "findings", note: findingsNote(keptCount) };

    const searchUnavailable = input.searchUnavailable?.includes(category) === true;
    const calls = input.calls.filter((call) => call.category === category);
    if (calls.length === 0) {
      if (searchUnavailable) {
        return { category, outcome: "search_failed", note: NOTES.searchUnavailable };
      }
      const note = input.stoppedBecause === "time" ? NOTES.timeLimit : NOTES.endedEarly;
      return { category, outcome: "skipped", note };
    }
    const reads = calls.filter((call) => call.tool === "read");
    const failedReads = reads.filter((call) => !call.answered).length;
    const searches = calls.filter((call) => call.tool === "search");
    const failedSearches = searches.filter((call) => !call.answered).length;
    if (calls.every((call) => !call.answered)) {
      const note = failedReads > 0 ? NOTES.pagesUnreadable : NOTES.searchUnavailable;
      return { category, outcome: "search_failed", note };
    }
    // The news of the category was not searched, whatever pages of it were read.
    const newsNotSearched =
      !SITE_CATEGORIES.includes(category) &&
      failedSearches === searches.length &&
      (searches.length > 0 || searchUnavailable);
    if (newsNotSearched) {
      // What it says rests on the vendor's own pages alone when at least one source of it survived
      // (a page that was read can still be dropped: too old, the same text, a duplicate) and every
      // one is the vendor's own page or a record; otherwise the category was not researched.
      const sources = (input.entries ?? []).filter((entry) => entry.category === category);
      const ownOnly =
        sources.length > 0 &&
        sources.every((entry) => entry.onVendorSite || entry.record !== undefined);
      if (!ownOnly) return { category, outcome: "search_failed", note: NOTES.searchUnavailable };
      const note = sources.some((entry) => entry.record !== undefined)
        ? NOTES.newsUnavailableWithRecords
        : NOTES.newsUnavailable;
      return { category, outcome: "nothing_found", note };
    }

    if (input.capped?.has(category) === true) {
      return { category, outcome: "over_cap", note: NOTES.overCap };
    }
    if (input.proposed.has(category)) {
      return { category, outcome: "nothing_found", note: NOTES.unconfirmed };
    }
    if (failedSearches > 0 || failedReads > 0) {
      const note =
        failedSearches === 0
          ? pagesFailedNote(failedReads, reads.length)
          : failedReads === 0
            ? searchesFailedNote(failedSearches, searches.length)
            : searchesAndPagesFailedNote(
                failedSearches,
                searches.length,
                failedReads,
                reads.length,
              );
      return { category, outcome: "nothing_found", note };
    }
    if (input.freshCategories !== undefined && !input.freshCategories.has(category)) {
      return { category, outcome: "nothing_found", note: NOTES.noNewSources };
    }
    return {
      category,
      outcome: "nothing_found",
      note: modelNoteFor(input.modelNotes, category) ?? NOTES.nothingFound,
    };
  });
}
