/**
 * Words for what the vendor research agent stores, and the rule that comes with them: the
 * screen never shows a stored string it does not know.
 *
 * The server stores English phrases for a failed run's error and for the note of each category
 * (see "Stored English strings" in the server contract). They are a closed set, so each one
 * maps to a sentence with a translation. Anything outside the set becomes a generic sentence,
 * or is hidden: it could be text from the open web that a model wrote, and a failure message
 * could name a host or a port.
 *
 * The one exception is the note of a category where nothing was found. There the model may
 * have written its own note. That is untrusted free text; it comes back marked as such, with a
 * translated label, and the screen renders it as plain text.
 *
 * `t` defaults to the active language (read the way customAxios reads it). A component passes
 * the `t` of `useTranslation()` so that it renders again once a dictionary arrives; tests pass
 * a spy to see which keys are looked up.
 */

import { translateKey } from "../../i18n/domTranslator";
import { fill } from "../../i18n/fill";
import type {
  CategorySummaryEntry,
  DismissReason,
  FindingConfidence,
  ResearchCategory,
} from "../../domain/interfaces/i.vendorResearch";

type Translate = (key: string) => string;

/** An own key of a label map only, so that "constructor" and the like are not labels. */
const labelFor = <K extends string>(labels: Record<K, string>, key: unknown): string | undefined =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(labels, key)
    ? labels[key as K]
    : undefined;

// ── Labels ────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  security_incidents: "Security incidents",
  certifications: "Certifications",
  legal_regulatory: "Legal and regulatory",
  ai_specific: "AI-specific risks",
};

/** Lower case: they follow the category in "Security incidents: nothing found". */
const OUTCOME_LABELS: Record<CategorySummaryEntry["outcome"], string> = {
  findings: "risks found",
  nothing_found: "nothing found",
  search_failed: "search failed",
  skipped: "skipped",
};

const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_applicable: "Not applicable to this vendor",
  already_covered: "Already covered by an existing risk",
  inaccurate: "Inaccurate or not supported by the sources",
  accepted_risk: "Accepted risk",
  other: "Other",
};

const CONFIDENCE_LABELS: Record<FindingConfidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const categoryLabel = (category: ResearchCategory, t: Translate = translateKey): string =>
  t(labelFor(CATEGORY_LABELS, category) ?? "Other");

export const outcomeLabel = (
  outcome: CategorySummaryEntry["outcome"],
  t: Translate = translateKey,
): string => t(labelFor(OUTCOME_LABELS, outcome) ?? "unknown");

export const dismissReasonLabel = (reason: DismissReason, t: Translate = translateKey): string =>
  t(labelFor(DISMISS_REASON_LABELS, reason) ?? "Other");

export const confidenceLabel = (
  confidence: FindingConfidence,
  t: Translate = translateKey,
): string => t(labelFor(CONFIDENCE_LABELS, confidence) ?? "Unknown");

/**
 * "Security incidents: nothing found". Built from the category and the outcome alone, never
 * from the note, so what the line says does not depend on text the model wrote.
 */
export function describeCategoryLine(
  entry: Pick<CategorySummaryEntry, "category" | "outcome">,
  t: Translate = translateKey,
): string {
  return fill(t("{category}: {outcome}"), {
    category: categoryLabel(entry?.category, t),
    outcome: outcomeLabel(entry?.outcome, t),
  });
}

const DATE_LOCALES: Record<string, string> = {
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
};

/**
 * A date as the screen writes it ("12 Mar 2026"), in the language of the screen. UTC, so that
 * the day does not move with the viewer's time zone; null for no date or one that does not parse.
 */
export function formatResearchDate(iso: string | null | undefined, lang: string): string | null {
  if (typeof iso !== "string" || iso === "") return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(DATE_LOCALES[lang] ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── The error of a failed run ────────────────────────────────────────────────

const GENERIC_RUN_ERROR = "The research run failed.";

/** Run errors that are one fixed phrase, and the sentence each becomes. */
const RUN_ERROR_SENTENCES = new Map<string, string>([
  ["Vendor not found", "The vendor was not found."],
  ["No LLM key configured", "No LLM key is configured for your organization."],
  ["Model call failed: timed out", "The model call timed out."],
  [
    "Model call failed: the answer did not match the expected format",
    "The model answer did not match the expected format.",
  ],
  ["Model call failed: unexpected error", "The model call failed unexpectedly."],
  ["Unexpected error", "The research run failed unexpectedly."],
  ["Saving the findings failed", "The findings could not be saved."],
  ["timed out", "The research run timed out."],
  ["could not enqueue", "The research run could not be queued."],
  ["Search provider not configured", "No web search provider is configured."],
]);

const MODEL_CALL_HTTP = /^Model call failed: HTTP (\d{3})$/;
const ALL_SEARCHES_FAILED = /^The run stopped because all searches failed:(.*)$/s;
/** Why one search failed, as the search provider words it: a closed set. */
const SEARCH_FAILURE_REASON =
  /^(?:search timed out|search request failed|search response could not be read|Tavily search failed with status \d{3}|The search failed)$/;

/**
 * A sentence for the error a failed run stored. For a run in which every search failed, the
 * sentence is followed by the reasons, in English and in parentheses, as technical detail; a
 * reason that is not one of the known ones is left out. Anything unknown becomes a generic
 * sentence and is never shown.
 */
export function describeRunError(error: string | null, t: Translate = translateKey): string {
  const stored = typeof error === "string" ? error.trim() : "";

  const sentence = RUN_ERROR_SENTENCES.get(stored);
  if (sentence !== undefined) return t(sentence);

  const modelStatus = MODEL_CALL_HTTP.exec(stored);
  if (modelStatus) {
    return fill(t("The model call failed with HTTP status {status}."), { status: modelStatus[1] });
  }

  const searches = ALL_SEARCHES_FAILED.exec(stored);
  if (searches) {
    const reasons = searches[1]
      .split(";")
      .map((reason) => reason.trim())
      .filter((reason) => SEARCH_FAILURE_REASON.test(reason));
    const lead = t("All web searches failed.");
    return reasons.length > 0 ? `${lead} (${reasons.join("; ")})` : lead;
  }

  return t(GENERIC_RUN_ERROR);
}

// ── The note of a category ───────────────────────────────────────────────────

/** Notes that are one fixed phrase, and the sentence each becomes. */
const CATEGORY_NOTE_SENTENCES = new Map<string, string>([
  [
    "Vendor website is missing or not a valid domain",
    "The vendor website is missing or is not a valid domain.",
  ],
  ["No risks found in the search results", "No risks were found in the search results."],
  [
    "Possible risks were found but could not be verified or are already recorded",
    "Possible risks were found but could not be verified, or are already recorded.",
  ],
  ["search timed out", "The search timed out."],
  ["search request failed", "The search request failed."],
  ["search response could not be read", "The search response could not be read."],
  ["The search failed", "The search failed."],
]);

const SEARCH_FAILED_STATUS = /^Tavily search failed with status (\d{3})$/;
const POTENTIAL_RISKS = /^(\d{1,6}) potential risks? found$/;

/** What to show under a category's line: a fixed sentence, or the model's own words, flagged. */
export type CategoryNote =
  { kind: "fixed"; text: string } | { kind: "model"; text: string; label: string };

function fixedCategoryNote(note: string, t: Translate): string | null {
  const sentence = CATEGORY_NOTE_SENTENCES.get(note);
  if (sentence !== undefined) return t(sentence);

  const searchStatus = SEARCH_FAILED_STATUS.exec(note);
  if (searchStatus) {
    return fill(t("The search failed with HTTP status {status}."), { status: searchStatus[1] });
  }

  const risks = POTENTIAL_RISKS.exec(note);
  if (risks) {
    const count = Number(risks[1]);
    return count === 1
      ? t("1 potential risk found")
      : fill(t("{count} potential risks found"), { count });
  }
  return null;
}

/**
 * The note of a category summary entry, or null when there is nothing safe to show.
 *
 * A note outside the fixed set is shown only for a category where nothing was found: that is
 * where the model may have written one. It comes back as `model`, with the label that says it
 * is unverified, and the caller renders `text` as plain text. On any other outcome an unknown
 * note is dropped.
 */
export function describeCategoryNote(
  entry: Pick<CategorySummaryEntry, "outcome" | "note">,
  t: Translate = translateKey,
): CategoryNote | null {
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  if (note === "") return null;

  const fixed = fixedCategoryNote(note, t);
  if (fixed !== null) return { kind: "fixed", text: fixed };

  if (entry.outcome === "nothing_found") {
    return { kind: "model", text: note, label: t("AI note (unverified)") };
  }
  return null;
}
