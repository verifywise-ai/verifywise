/**
 * The category summary of a run: what became of each category, as one of the four outcomes and a
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
import type { CallRecord } from "../webResearch/webSession";
import { NO_DOMAIN_NOTE } from "./categories";
import { MAX_NOTE_CHARS, ResearchOutput } from "./schema";
import { cleanText, cutAtCodePoint } from "./text";

/** The fixed notes. The UI knows each of them, and shows nothing it does not know. */
export const NOTES = {
  /** Answered, and the model proposed nothing and wrote no note. */
  nothingFound: "No risks found in the sources reviewed",
  /** The model proposed a risk and none stayed: validation, de-duplication or the cap took it. */
  unconfirmed: "Possible risks were found but could not be verified or are already recorded",
  /** Worked on, and every call was a search that failed. */
  searchUnavailable: "The search was not available",
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
 * 3. No call: `skipped`, because the time ran out or the loop ended before it got there.
 * 4. No call answered: `search_failed`. The search was not available when every call was a failed
 *    search; once a page could not be read, the pages could not be read.
 * 5. Any other is `nothing_found`. If the model proposed a risk in it and none stayed, the note
 *    says that risks were possible but are not confirmed. Otherwise, when pages of it could not be
 *    read, the note counts them. In a scheduled run (`freshCategories` is given) a category that has
 *    no new source says so: the model saw nothing of it, so a note of its own would describe
 *    nothing. Only then is the model's own note shown, or a plain sentence when it wrote none: a
 *    note that sits next to a risk that was dropped, or next to a page that could not be read, would
 *    describe what nobody could check.
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
}): CategorySummaryEntry[] {
  return RESEARCH_CATEGORIES.map((category): CategorySummaryEntry => {
    if (input.skippedNoDomain.includes(category)) {
      return { category, outcome: "skipped", note: NO_DOMAIN_NOTE };
    }
    const keptCount = input.kept.filter((finding) => finding.category === category).length;
    if (keptCount > 0) return { category, outcome: "findings", note: findingsNote(keptCount) };

    const calls = input.calls.filter((call) => call.category === category);
    if (calls.length === 0) {
      const note = input.stoppedBecause === "time" ? NOTES.timeLimit : NOTES.endedEarly;
      return { category, outcome: "skipped", note };
    }
    const reads = calls.filter((call) => call.tool === "read");
    const failedReads = reads.filter((call) => !call.answered).length;
    if (calls.every((call) => !call.answered)) {
      const note = failedReads > 0 ? NOTES.pagesUnreadable : NOTES.searchUnavailable;
      return { category, outcome: "search_failed", note };
    }

    if (input.proposed.has(category)) {
      return { category, outcome: "nothing_found", note: NOTES.unconfirmed };
    }
    if (failedReads > 0) {
      return {
        category,
        outcome: "nothing_found",
        note: pagesFailedNote(failedReads, reads.length),
      };
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
