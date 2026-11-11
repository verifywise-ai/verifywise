/**
 * Words for what the vendor research agent stores, and the rule that comes with them: the
 * screen never shows a stored string it does not know.
 *
 * The server stores English phrases for a failed run's error and for the note of each category
 * (see "Stored English strings" in the server contract). They are a closed set, so each one
 * maps to a sentence with a translation. Anything outside the set becomes a generic sentence,
 * or is hidden: it could be text from the open web that a model wrote, and a failure message
 * could name a host or a port. The note of a category is keyed by the category's outcome: a
 * phrase counts as ours only on the outcome the server writes it for.
 *
 * The one exception is the note of a category where nothing was found. There the model may
 * have written its own note, in any words, even ones that sound like ours. That is untrusted
 * free text; it comes back marked as such, with a translated label, and the screen renders it
 * as plain text.
 *
 * `t` defaults to the active language (read the way customAxios reads it). A component passes
 * the `t` of `useTranslation()` so that it renders again once a dictionary arrives; tests pass
 * a spy to see which keys are looked up.
 *
 * The credibility of a finding and the coverage of a run follow the same rule. The server stores
 * a basis and counts, never a sentence the screen shows: the line of a label is worded here from
 * the basis, the way the server's English line is (services/vendorResearch/credibilityText.ts), so
 * that the English screen says what the server says. The names of the databases and the words of
 * their licences are the screen's own, by id; the names and attributions in the coverage are not
 * read. A rule, a category, a status or a database this file does not know shows nothing.
 */

import { translateKey } from "../../i18n/domTranslator";
import { fill } from "../../i18n/fill";
import type {
  BackfilledCredibilityBasis,
  CategorySummaryEntry,
  CoverageSource,
  CredibilityBasis,
  CredibilityLabel,
  CredibilityRule,
  CredibilitySource,
  DismissReason,
  RecordSourceId,
  RecordStatus,
  ResearchCategory,
  RunCoverage,
  RunProgress,
  SourceCategory,
  StoredCredibilityBasis,
  VrdbSourceId,
} from "../../domain/interfaces/i.vendorResearch";

type Translate = (key: string) => string;

/** An own key of a label map only, so that "constructor" and the like are not labels. */
const labelFor = <K extends string, V = string>(
  labels: Record<K, V>,
  key: unknown,
): V | undefined =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(labels, key)
    ? labels[key as K]
    : undefined;

// ── Labels ────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  security_incidents: "Security incidents",
  certifications: "Certifications",
  legal_regulatory: "Legal and regulatory",
  ai_specific: "AI-specific risks",
  availability: "Availability",
  financial_health: "Financial health",
};

/** Lower case: they follow the category in "Security incidents: nothing found". */
const OUTCOME_LABELS: Record<CategorySummaryEntry["outcome"], string> = {
  findings: "risks found",
  nothing_found: "nothing found",
  search_failed: "could not be researched",
  skipped: "skipped",
};

const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_applicable: "Not applicable to this vendor",
  already_covered: "Already covered by an existing risk",
  inaccurate: "Inaccurate or not supported by the sources",
  accepted_risk: "Accepted risk",
  wrong_vendor: "The sources are about another company",
  outdated: "The sources are out of date",
  other: "Other",
};

export const categoryLabel = (category: ResearchCategory, t: Translate = translateKey): string =>
  t(labelFor(CATEGORY_LABELS, category) ?? "Other");

export const outcomeLabel = (
  outcome: CategorySummaryEntry["outcome"],
  t: Translate = translateKey,
): string => t(labelFor(OUTCOME_LABELS, outcome) ?? "unknown");

export const dismissReasonLabel = (reason: DismissReason, t: Translate = translateKey): string =>
  t(labelFor(DISMISS_REASON_LABELS, reason) ?? "Other");

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

/** The categories of the closed set, in the order they come in; anything else is left out. */
const knownCategories = (categories: unknown): ResearchCategory[] =>
  Array.isArray(categories)
    ? categories.filter(
        (category): category is ResearchCategory =>
          labelFor(CATEGORY_LABELS, category) !== undefined,
      )
    : [];

/** A count as a whole number, or 0 for anything that is not one. */
const countOf = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export interface ProgressText {
  /** What the run is doing now; null when the screen has nothing to add to "Researching…". */
  doing: string | null;
  /** The categories worked on so far; null while there are none. */
  covered: string | null;
  /** The searches and the pages so far; null while there are none. */
  counts: string | null;
}

/**
 * What a running run is doing, in words, from the progress the server writes at every step. Built
 * from closed sets (the phase, the action, the categories) and counts alone, so what it says never
 * depends on text from the web or the model; a value it does not know leaves its line out.
 */
export function describeProgress(
  progress: RunProgress | null | undefined,
  t: Translate = translateKey,
): ProgressText {
  if (!progress) return { doing: null, covered: null, counts: null };

  const category =
    labelFor(CATEGORY_LABELS, progress.category) === undefined ? null : progress.category;
  const named = (withCategory: string, without: string): string =>
    category === null
      ? t(without)
      : fill(t(withCategory), { category: categoryLabel(category, t) });

  let doing: string | null = null;
  if (progress.phase === "analysing") {
    doing = t("Analysing what was found");
  } else if (progress.phase === "researching") {
    if (countOf(progress.steps) === 0) doing = t("Starting the research");
    else if (progress.action === "search") {
      doing = named("Searching the web: {category}", "Searching the web");
    } else if (progress.action === "read") {
      doing = named("Reading a page: {category}", "Reading a page");
    }
  }

  const categories = knownCategories(progress.categories);
  const searches = countOf(progress.searchesUsed);
  const pages = countOf(progress.pagesRead);
  return {
    doing,
    covered:
      categories.length === 0
        ? null
        : fill(t("Researched so far: {categories}"), {
            categories: categories.map((entry) => categoryLabel(entry, t)).join(", "),
          }),
    counts:
      searches + pages === 0
        ? null
        : fill(t("Searches: {searches}, pages read: {pages}"), { searches, pages }),
  };
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
  [
    "The run stopped because the web could not be reached",
    "The web could not be reached from the server.",
  ],
  ["The model did not use the research actions", "The model did not carry out the research steps."],
]);

const MODEL_CALL_HTTP = /^Model call failed: HTTP (\d{3})$/;

/**
 * A sentence for the error a failed run stored. Anything unknown becomes a generic sentence and
 * is never shown.
 */
export function describeRunError(error: string | null, t: Translate = translateKey): string {
  const stored = typeof error === "string" ? error.trim() : "";

  const sentence = RUN_ERROR_SENTENCES.get(stored);
  if (sentence !== undefined) return t(sentence);

  const modelStatus = MODEL_CALL_HTTP.exec(stored);
  if (modelStatus) {
    return fill(t("The model call failed with HTTP status {status}."), { status: modelStatus[1] });
  }

  return t(GENERIC_RUN_ERROR);
}

// ── The note of a category ───────────────────────────────────────────────────

/**
 * The phrases the server writes as the note of a category, kept by the outcome they go with. A
 * phrase is one of our sentences only on its own outcome: the same words on another outcome did
 * not come from the server, so they are never taken as ours.
 */
const SKIPPED_NOTES = new Map<string, string>([
  [
    "Vendor website is missing or not a valid domain",
    "The vendor website is missing or is not a valid domain.",
  ],
  ["Not researched: the time limit was reached", "Not researched: the time limit was reached."],
  [
    "Not researched: the research ended before this category was covered",
    "Not researched: the research ended before this category was covered.",
  ],
]);

const NOTHING_FOUND_NOTES = new Map<string, string>([
  ["No risks found in the sources reviewed", "No risks were found in the sources reviewed."],
  // A scheduled run analyses only the sources that earlier runs did not show to the model.
  ["No new sources since the last run", "No new sources were found since the last run."],
  [
    "Possible risks were found but could not be verified or are already recorded",
    "Possible risks were found but could not be verified, or are already recorded.",
  ],
]);

const SEARCH_FAILED_NOTES = new Map<string, string>([
  ["The search was not available", "The search was not available."],
  ["The pages could not be read", "The pages could not be read."],
]);

/** The page note: only on a category where nothing was found. The counts are at most three digits. */
const PAGES_NOT_READ = /^No risks found; (\d{1,3}) of (\d{1,3}) pages could not be read$/;
/** The search notes: only on a category where nothing was found. The counts are at most three digits. */
const SEARCHES_NOT_ANSWERED =
  /^No risks found; (\d{1,3}) of (\d{1,3}) searches were not available$/;
const SEARCHES_AND_PAGES_FAILED =
  /^No risks found; (\d{1,3}) of (\d{1,3}) searches were not available and (\d{1,3}) of (\d{1,3}) pages could not be read$/;
/** The count note: only on a category that has findings. */
const POTENTIAL_RISKS = /^(\d{1,6}) potential risks? found$/;

/** What to show under a category's line: a fixed sentence, or the model's own words, flagged. */
export type CategoryNote =
  { kind: "fixed"; text: string } | { kind: "model"; text: string; label: string };

function fixedSentence(
  sentences: ReadonlyMap<string, string>,
  note: string,
  t: Translate,
): string | null {
  const sentence = sentences.get(note);
  return sentence === undefined ? null : t(sentence);
}

/** The fixed sentence for a note, if the server writes this note on this outcome. */
function fixedCategoryNote(outcome: unknown, note: string, t: Translate): string | null {
  switch (outcome) {
    case "findings": {
      const risks = POTENTIAL_RISKS.exec(note);
      if (!risks) return null;
      const count = Number(risks[1]);
      return count === 1
        ? t("1 potential risk found")
        : fill(t("{count} potential risks found"), { count });
    }
    case "skipped":
      return fixedSentence(SKIPPED_NOTES, note, t);
    case "nothing_found": {
      const sentence = fixedSentence(NOTHING_FOUND_NOTES, note, t);
      if (sentence !== null) return sentence;
      // In every form, more failed than were counted: the server cannot have written this.
      const pages = PAGES_NOT_READ.exec(note);
      if (pages) {
        const [failed, total] = [Number(pages[1]), Number(pages[2])];
        return failed <= total
          ? fill(t("No risks were found. {failed} of {total} pages could not be read."), {
              failed,
              total,
            })
          : null;
      }
      const searches = SEARCHES_NOT_ANSWERED.exec(note);
      if (searches) {
        const [failed, total] = [Number(searches[1]), Number(searches[2])];
        return failed <= total
          ? fill(t("No risks were found. {failed} of {total} searches were not available."), {
              failed,
              total,
            })
          : null;
      }
      const both = SEARCHES_AND_PAGES_FAILED.exec(note);
      if (!both) return null;
      const [searchesFailed, searchCount, pagesFailed, pageCount] = both.slice(1).map(Number);
      return searchesFailed <= searchCount && pagesFailed <= pageCount
        ? fill(
            t(
              "No risks were found. {searchesFailed} of {searches} searches were not available, and {pagesFailed} of {pages} pages could not be read.",
            ),
            { searchesFailed, searches: searchCount, pagesFailed, pages: pageCount },
          )
        : null;
    }
    case "search_failed":
      return fixedSentence(SEARCH_FAILED_NOTES, note, t);
    default:
      return null;
  }
}

/**
 * The note of a category summary entry, or null when there is nothing safe to show.
 *
 * What counts as a fixed note depends on the outcome of the category (see the phrase tables
 * above). A note outside the set for its outcome is shown only for a category where nothing was
 * found: that is where the model may have written one, whatever words it used. It comes back as
 * `model`, with the label that says it is unverified, and the caller renders `text` as plain
 * text. On any other outcome a note outside the set is dropped.
 */
export function describeCategoryNote(
  entry: Pick<CategorySummaryEntry, "outcome" | "note">,
  t: Translate = translateKey,
): CategoryNote | null {
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  if (note === "") return null;

  const fixed = fixedCategoryNote(entry.outcome, note, t);
  if (fixed !== null) return { kind: "fixed", text: fixed };

  if (entry.outcome === "nothing_found") {
    return { kind: "model", text: note, label: t("AI note (unverified)") };
  }
  return null;
}

// ── The credibility of a finding ─────────────────────────────────────────────

const CREDIBILITY_LABELS: Record<CredibilityLabel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  official: "Official",
  trusted_press: "Trusted press",
  vendor: "Vendor",
  unverified: "Unverified",
};

/** Only a record that its database no longer stands by has a status to show. */
const RECORD_STATUS_LABELS: Record<Exclude<RecordStatus, "active">, string> = {
  withdrawn: "Withdrawn",
  rejected: "Rejected",
  delisted: "Delisted",
};

/** The label of a finding's credibility; null for none, or for one this file does not know. */
export function credibilityLabel(
  label: CredibilityLabel | null | undefined,
  t: Translate = translateKey,
): string | null {
  const words = labelFor(CREDIBILITY_LABELS, label);
  return words === undefined ? null : t(words);
}

/** The badge of a cited source's category; null for none, or for one this file does not know. */
export function sourceCategoryLabel(
  category: SourceCategory | null | undefined,
  t: Translate = translateKey,
): string | null {
  const words = labelFor(SOURCE_CATEGORY_LABELS, category);
  return words === undefined ? null : t(words);
}

/** The status of a cited record its database no longer stands by; null for an active record. */
export function recordStatusLabel(
  status: RecordStatus | null | undefined,
  t: Translate = translateKey,
): string | null {
  const words = labelFor(RECORD_STATUS_LABELS, status);
  return words === undefined ? null : t(words);
}

/**
 * The databases as a sentence names them. They are the server's names (services/vendorResearch/
 * vrdb/sources.ts and credibilityText.ts), so that the English line is the server's.
 */
const DATABASE_NAMES: Record<RecordSourceId, string> = {
  kev: "CISA Known Exploited Vulnerabilities",
  ofac: "OFAC Specially Designated Nationals list",
  uk_sanctions: "UK Sanctions List",
  eu_fsf: "EU consolidated list of financial sanctions",
  nvd: "the National Vulnerability Database",
  sec: "SEC EDGAR",
  hibp: "Have I Been Pwned",
  statuspage: "the vendor's status page",
  cve: "the CVE Program",
  un_sanctions: "UN Security Council Consolidated List",
  csl: "US Consolidated Screening List",
  aiid: "AI Incident Database",
  atlas: "MITRE ATLAS case studies",
  nhtsa_sgo: "NHTSA Standing General Order crash reports",
  fda_ai_devices: "FDA list of AI-enabled medical devices",
  fda_device_recalls: "FDA recalls of AI-enabled medical devices",
  canada_sema: "Consolidated Canadian Autonomous Sanctions List",
  california_breaches: "California Attorney General data breach list",
  uk_ofsi: "UK OFSI financial sanctions enforcement notices",
  charlotin: "AI Hallucination Cases database",
  ftc_penalties: "FTC civil penalty cases",
  piperoll: "PipeRoll Agent Incident Registry",
  eu_dg_comp: "European Commission competition cases",
  disclose_io: "disclose.io program list",
  uk_cma: "UK Competition and Markets Authority cases",
  canada_ai_register: "Government of Canada AI Register",
  ftc_competition: "FTC nonmerger enforcement actions",
  omb_ai_inventory: "US federal AI use case inventory",
  co_sic_penalties: "Colombia SIC consumer protection sanctions",
  uk_atrs: "UK Algorithmic Transparency Recording Standard records",
  nhtsa_recalls: "NHTSA vehicle and equipment recalls",
  fmti: "Foundation Model Transparency Index",
  uk_mhra: "UK MHRA field safety notice lists",
  nl_algoritmeregister: "Dutch Algorithm Register",
  nhtsa_odi: "NHTSA defect investigations",
  fedramp: "FedRAMP Marketplace",
  epoch_ai: "Epoch AI Data on AI Models",
  c2pa_conforming: "C2PA Conforming Products List",
  gleif: "GLEIF LEI records",
};

/** The lists as "the {list} entry" names them. */
const LIST_NAMES: Record<RecordSourceId, string> = {
  kev: "CISA KEV catalog",
  ofac: "OFAC SDN list",
  uk_sanctions: "UK Sanctions List",
  eu_fsf: "EU financial sanctions list",
  nvd: "NVD",
  sec: "SEC EDGAR filings",
  hibp: "Have I Been Pwned",
  statuspage: "vendor's status page",
  cve: "CVE List",
  un_sanctions: "UN Security Council Consolidated List",
  csl: "US Consolidated Screening List",
  aiid: "AI Incident Database",
  atlas: "MITRE ATLAS case studies",
  nhtsa_sgo: "NHTSA Standing General Order crash reports",
  fda_ai_devices: "FDA list of AI-enabled medical devices",
  fda_device_recalls: "FDA device recall database",
  canada_sema: "Consolidated Canadian Autonomous Sanctions List",
  california_breaches: "California Attorney General data breach list",
  uk_ofsi: "UK OFSI financial sanctions enforcement notices",
  charlotin: "AI Hallucination Cases database",
  ftc_penalties: "FTC civil penalty case list",
  piperoll: "PipeRoll Agent Incident Registry",
  eu_dg_comp: "European Commission antitrust, cartel and DMA case data",
  disclose_io: "disclose.io vulnerability disclosure program list",
  uk_cma: "UK Competition and Markets Authority cases",
  canada_ai_register: "Government of Canada AI Register",
  ftc_competition: "FTC nonmerger enforcement action list",
  omb_ai_inventory: "US federal AI use case inventory",
  co_sic_penalties: "Colombia SIC consumer protection sanctions list",
  uk_atrs: "UK Algorithmic Transparency Records",
  nhtsa_recalls: "NHTSA recalls file",
  fmti: "Foundation Model Transparency Index",
  uk_mhra: "UK MHRA field safety notice lists",
  nl_algoritmeregister: "Dutch Algorithm Register",
  nhtsa_odi: "NHTSA defect investigations file",
  fedramp: "FedRAMP Marketplace data",
  epoch_ai: "Epoch AI Data on AI Models",
  c2pa_conforming: "C2PA Conforming Products List",
  gleif: "GLEIF LEI records",
};

/** The sentence of a record its database no longer stands by, with the day of the copy and without. */
const INACTIVE_SENTENCES: Record<
  Exclude<RecordStatus, "active">,
  { dated: string; undated: string }
> = {
  withdrawn: {
    dated: "Low: {operator} withdrew the record on {date}.",
    undated: "Low: {operator} withdrew the record.",
  },
  rejected: {
    dated: "Low: {operator} rejected the record on {date}.",
    undated: "Low: {operator} rejected the record.",
  },
  delisted: {
    dated: "Low: {operator} removed the record on {date}.",
    undated: "Low: {operator} removed the record.",
  },
};

const NAME_ONLY_NOTE = "Matched by name only: this may be another company.";

/** What a pending finding's label that the backfill decided says after its rule's sentence. */
const BACKFILL_NOTE = "Rated again with the current rule.";

/**
 * What a label that is the earlier confidence of a finding says: the server's own line for it
 * (controllers/vendorResearch.ctrl.ts), so that the English screen says what the server says. No
 * rule decided the label, so no rule's sentence goes with it.
 */
const LEGACY_NOTE =
  "Rated before the source rules; this is the earlier confidence level until the label is recomputed.";

/** The muted note beside a label that is the earlier confidence of a finding. */
const EARLIER_RATING_NOTE = "Earlier rating";

const BACKFILL_PREFIX = "backfill_";

/** Each rule this file words: a rule is one of them, never a name such as `constructor`. */
const RULES: Record<CredibilityRule, true> = {
  official_record: true,
  official_page: true,
  vendor_statement: true,
  trusted_press_two: true,
  capped_unconfirmed: true,
  trusted_press_one: true,
  contradicted: true,
  name_only: true,
  unverified: true,
  self_claim: true,
  inactive: true,
};

const isCredibilityRule = (rule: string): rule is CredibilityRule =>
  Object.prototype.hasOwnProperty.call(RULES, rule);

/**
 * A day as the screen writes it, read the way the server reads one: only from a day (YYYY-MM-DD)
 * or an ISO 8601 time; null for anything else.
 */
function dayOf(value: unknown, lang: string): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
    ? formatResearchDate(value, lang)
    : null;
}

/** The host of an address without its "www."; null when the address does not parse. */
function hostOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/** The values joined, each once, or null when there is none. */
function joinedOnce(values: ReadonlyArray<string | null>): string | null {
  const kept = [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value !== ""),
    ),
  ];
  return kept.length === 0 ? null : kept.join(", ");
}

/** The first of the sources that was read, or else the first. */
const firstRead = (sources: readonly CredibilitySource[]): CredibilitySource | undefined =>
  sources.find((source) => source.reading === "read") ?? sources[0];

const isActive = (source: CredibilitySource): boolean =>
  source.record == null || source.record.status === "active";

/**
 * The lists whose records never raise a risk (the register and status lists of the prompt `vr-15`):
 * context for another risk. A copy of `CONTEXT_ONLY_RECORD_SOURCES` of the server
 * (services/vendorResearch/records/types.ts), so that the line of a label reads as the server's
 * English line does.
 */
const CONTEXT_ONLY_LISTS: ReadonlySet<string> = new Set([
  "canada_ai_register",
  "omb_ai_inventory",
  "nl_algoritmeregister",
  "uk_atrs",
  "epoch_ai",
  "fmti",
  "c2pa_conforming",
  "fedramp",
  "disclose_io",
  "gleif",
]);

/** A record of a register is context for a finding, never what supports its label. */
const isContextOnly = (source: CredibilitySource): boolean =>
  source.record != null && CONTEXT_ONLY_LISTS.has(source.record.source);

/** The trusted publishers, each once by its registry entry, named by the registry or the host. */
function publishersOf(sources: readonly CredibilitySource[]): Array<string | null> {
  const names = new Map<string, string | null>();
  for (const source of sources) {
    if (source.category !== "trusted_press") continue;
    const key = source.entry ?? source.publisher;
    if (names.has(key)) continue;
    names.set(
      key,
      typeof source.publisher_name === "string" && source.publisher_name !== ""
        ? source.publisher_name
        : hostOf(source.url),
    );
  }
  return [...names.values()];
}

/** The sources of a basis that are objects: anything else gives a sentence nothing to hold with. */
const sourcesOf = (basis: CredibilityBasis): CredibilitySource[] =>
  Array.isArray(basis.sources)
    ? basis.sources.filter(
        (source): source is CredibilitySource => source !== null && typeof source === "object",
      )
    : [];

/**
 * The sentence of the rule that decided a label, naming what the rule held with: the sources that
 * are neither contradicted, nor a record no longer stood by, nor a record of a register, and the
 * first of them that was read. Empty for a rule this file does not know, and for a basis without
 * the source its rule names. A finding that cites registers only has no such source: its line says
 * so (rule `unverified`), and a register is never the record that the line of an `inactive` label
 * names.
 */
function ruleSentence(basis: CredibilityBasis, t: Translate, lang: string): string {
  const sources = sourcesOf(basis);
  const supporting = sources.filter(
    (source) => source.reading !== "contradicted" && isActive(source) && !isContextOnly(source),
  );
  const strong = supporting.filter((source) => source.record?.match !== "weak");

  switch (basis.rule) {
    case "official_record": {
      const record = firstRead(
        strong.filter(
          (source) => source.category === "official" && source.record?.match === "strong",
        ),
      )?.record;
      const operator = labelFor(DATABASE_NAMES, record?.source);
      if (record == null || operator === undefined) return "";
      const id =
        typeof record.source_record_id === "string" && record.source_record_id !== ""
          ? record.source_record_id
          : null;
      const date = dayOf(record.as_of, lang);
      const values = { operator: t(operator), record: id ?? "", date: date ?? "" };
      if (id === null) {
        return fill(
          t(
            date === null
              ? "High: {operator} lists it."
              : "High: {operator} lists it, as of {date}.",
          ),
          values,
        );
      }
      return fill(
        t(
          date === null
            ? "High: {operator} lists it ({record})."
            : "High: {operator} lists it ({record}), as of {date}.",
        ),
        values,
      );
    }
    case "official_page": {
      const page = firstRead(
        strong.filter((source) => source.category === "official" && source.record == null),
      );
      if (page === undefined) return "";
      const host = hostOf(page.url);
      return host === null
        ? t("High: an official source reports it.")
        : fill(t("High: an official source reports it ({host})."), { host });
    }
    case "vendor_statement": {
      const page = firstRead(
        strong.filter(
          (source) => source.category === "vendor" && source.vendor_kind === "statement",
        ),
      );
      if (page === undefined) return "";
      const host = hostOf(page.url);
      return host === null
        ? t("High: the vendor states it on its own pages.")
        : fill(t("High: the vendor states it on its own pages ({host})."), { host });
    }
    case "trusted_press_two": {
      const publishers = publishersOf(strong);
      const names = joinedOnce(publishers);
      return fill(
        t(
          names === null
            ? "High: {count} independent trusted publishers report it."
            : "High: {count} independent trusted publishers report it ({publishers}).",
        ),
        { count: publishers.length, publishers: names ?? "" },
      );
    }
    case "trusted_press_one": {
      // The strong sources only, as the server's rule holds them (credibility.ts): a weak record
      // gives only Low support, so a MITRE ATLAS case study (trusted press, matched by name) is no
      // publisher here.
      const names = joinedOnce(publishersOf(strong));
      return names === null
        ? t(
            "Medium: one trusted publisher reports it; no official source and no second independent publisher.",
          )
        : fill(
            t(
              "Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher.",
            ),
            { publisher: names },
          );
    }
    case "capped_unconfirmed":
      return t("Medium: only search results show it; the pages could not be read.");
    case "contradicted":
      return t("Low: the pages do not hold what the search results quoted.");
    case "name_only": {
      const weak = supporting.find((source) => source.record?.match === "weak")?.record;
      const list = labelFor(LIST_NAMES, weak?.source);
      return list === undefined
        ? ""
        : fill(t("Low: the {list} entry matches the vendor by name only."), { list: t(list) });
    }
    case "unverified": {
      // Nothing supports the label and what is cited is a register: say so, rather than that
      // unverified sources report it (a register is not one, and a register entry raises no risk).
      if (supporting.length === 0 && sources.some(isContextOnly)) {
        return t(
          "Low: only registers that list the vendor are cited, and a register entry is not evidence of a risk.",
        );
      }
      const hosts = joinedOnce(
        supporting
          .filter((source) => source.category === "unverified")
          .map((source) => hostOf(source.url)),
      );
      return hosts === null
        ? t("Low: only unverified sources report it.")
        : fill(t("Low: only unverified sources report it ({hosts})."), { hosts });
    }
    case "self_claim":
      return t("Low: only the vendor's own claims support it.");
    case "inactive": {
      // A register never names itself in the line of a label: the record is one of another list.
      const record = sources.find((source) => !isActive(source) && !isContextOnly(source))?.record;
      // The list that rejected the record's CVE, when another did: the CVE Program, say.
      const operator = labelFor(DATABASE_NAMES, record?.rejected_by ?? record?.source);
      const sentences = labelFor(INACTIVE_SENTENCES, record?.status);
      if (record == null || operator === undefined || sentences === undefined) return "";
      const date = dayOf(record.as_of, lang);
      return date === null
        ? fill(t(sentences.undated), { operator: t(operator) })
        : fill(t(sentences.dated), { operator: t(operator), date });
    }
    default:
      return "";
  }
}

/**
 * The day of the oldest out-of-date copy of the vendor risk database cited; null for none. The copy
 * of a register is not counted: a register is context, never what the line of a label holds with,
 * so its age is not the age of the source the line is about.
 */
function staleSentence(
  sources: readonly CredibilitySource[],
  t: Translate,
  lang: string,
): string | null {
  const days = sources
    .flatMap((source) =>
      !isContextOnly(source) &&
      source.record?.stale === true &&
      typeof source.record.as_of === "string"
        ? [source.record.as_of]
        : [],
    )
    .sort();
  const date = days.length === 0 ? null : dayOf(days[0], lang);
  return date === null ? null : fill(t("The source has not been updated since {date}."), { date });
}

export interface CredibilityWords {
  /** The sentence of the rule that decided the label; empty when there is nothing to show. */
  sentence: string;
  /** The day of the oldest out-of-date copy cited; null when none was, or there is no sentence. */
  stale: string | null;
}

/**
 * The line of a credibility label, worded from its basis in the language of the screen: the
 * sentence of the rule that decided it and, when a cited copy of the vendor risk database was out
 * of date, the day of the oldest one. In English it is the server's line without the name-only
 * note, which the screen shows on a line of its own (see `nameOnlyNote`).
 *
 * A label the backfill wrote says so: one it decided again by the rule reads the rule's sentence,
 * then that it was rated again. A label that is the earlier confidence of a finding (the backfill
 * carried it over from a decided finding, and the server reads it so for a finding of a run before
 * the rule) says only that, in the server's words.
 */
export function credibilityRationale(
  basis: StoredCredibilityBasis | null | undefined,
  t: Translate,
  lang: string,
): CredibilityWords {
  if (basis === null || typeof basis !== "object") return { sentence: "", stale: null };
  if (basis.rule === "legacy_confidence") return { sentence: t(LEGACY_NOTE), stale: null };
  const rule = String(basis.rule);
  if (!rule.startsWith(BACKFILL_PREFIX)) return ruleWords(basis as CredibilityBasis, t, lang);
  const decided = rule.slice(BACKFILL_PREFIX.length);
  if (!isCredibilityRule(decided)) return { sentence: "", stale: null };
  const words = ruleWords({ ...(basis as BackfilledCredibilityBasis), rule: decided }, t, lang);
  return {
    sentence: [words.sentence, t(BACKFILL_NOTE)].filter((sentence) => sentence !== "").join(" "),
    stale: words.stale,
  };
}

/** The sentence of a basis the rule decided, and its stale day when it has a sentence. */
function ruleWords(basis: CredibilityBasis, t: Translate, lang: string): CredibilityWords {
  const sentence = ruleSentence(basis, t, lang);
  return sentence === ""
    ? { sentence: "", stale: null }
    : { sentence, stale: staleSentence(sourcesOf(basis), t, lang) };
}

/**
 * The note of a label when a cited record matched the vendor by name only, whatever rule decided
 * the label; null otherwise.
 */
export function nameOnlyNote(
  basis: StoredCredibilityBasis | null | undefined,
  t: Translate = translateKey,
): string | null {
  // A label carried over from the confidence has no sources, so no note.
  return typeof basis === "object" &&
    basis !== null &&
    "name_only" in basis &&
    basis.name_only === true
    ? t(NAME_ONLY_NOTE)
    : null;
}

/**
 * The muted note that goes with a label which is the earlier confidence of a finding, whatever its
 * level: the label was not decided by the source rules, and the person should not read it as if it
 * were. Null for every other label, one the backfill decided again by the rule included.
 */
export function earlierRatingNote(
  basis: StoredCredibilityBasis | null | undefined,
  t: Translate = translateKey,
): string | null {
  return typeof basis === "object" && basis !== null && basis.rule === "legacy_confidence"
    ? t(EARLIER_RATING_NOTE)
    : null;
}

// ── The coverage of a run ────────────────────────────────────────────────────

/** What the terms of each list ask a screen that shows its data to say. Never translated. */
const ATTRIBUTIONS: Record<VrdbSourceId, string> = {
  kev: "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
  ofac: "OFAC Specially Designated Nationals list, US Department of the Treasury",
  uk_sanctions:
    "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
  eu_fsf: "EU consolidated list of financial sanctions, © European Union",
  nvd: "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
  sec: "SEC EDGAR, US Securities and Exchange Commission",
  // The string the server stores for the list (vrdb/sources.ts): MITRE's copyright designation up
  // to the year of the day in UTC, and no registered mark (Q7). Read at each call, not once at load.
  get cve(): string {
    return `CVE records Copyright © 1999-${new Date().getUTCFullYear()}, The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)`;
  },
  un_sanctions: "United Nations Security Council Consolidated List",
  // The string the server stores for the list (vrdb/sources.ts). ITA asks for a sentence that names
  // its Data API; the product reads ITA's downloadable file, so the sentence names the list instead.
  csl: "This product uses data from the International Trade Administration's Consolidated Screening List but is not endorsed or certified by the International Trade Administration. Entries adapted by VerifyWise.",
  aiid: "AI Incident Database, Responsible AI Collaborative (incidentdatabase.ai), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
  // As the CVE's: the string the server stores for the list (vrdb/sources.ts), with the year of the
  // day in UTC, read at each call, not once at load.
  get atlas(): string {
    return `MITRE ATLAS™ case studies, Copyright 2021-${new Date().getUTCFullYear()} The MITRE Corporation, under the Apache License 2.0. Adapted by VerifyWise.`;
  },
  nhtsa_sgo:
    "NHTSA Standing General Order crash reports, US Department of Transportation. Counted by VerifyWise; NHTSA states the data may be incomplete or unverified.",
  fda_ai_devices: "FDA list of AI-enabled medical devices, US Food and Drug Administration",
  fda_device_recalls:
    "FDA medical device recalls and enforcement reports through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices. Data provided by the U.S. Food and Drug Administration (https://open.fda.gov).",
  canada_sema:
    "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Global Affairs Canada, Consolidated Canadian Autonomous Sanctions List. Not endorsed by the Government of Canada. Entries adapted by VerifyWise.",
  california_breaches:
    "Source: State of California Department of Justice, Office of the Attorney General, data security breach list. Not endorsed by the Department. Entries adapted by VerifyWise.",
  uk_ofsi:
    "UK Office of Financial Sanctions Implementation (HM Treasury) enforcement notices, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise; no endorsement by HM Treasury is implied.",
  charlotin:
    "AI Hallucination Cases Database, Damien Charlotin, https://www.damiencharlotin.com/hallucinations/. Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Counted and adapted by VerifyWise; not endorsed by its author.",
  ftc_penalties:
    "Source: United States Federal Trade Commission, www.ftc.gov (consumer protection civil penalty cases, CC0 1.0). Not endorsed by the FTC. Entries adapted by VerifyWise.",
  piperoll:
    "PipeRoll Agent Incident Registry (piperoll.org), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); each record cites the PIR ids of the entries it shows and links the newest entry. Adapted by VerifyWise: titles shortened and edited, entries counted; not endorsed by PipeRoll.",
  eu_dg_comp:
    "Source: European Commission, DG Competition case data (open data), (c) European Union, reused under the Commission reuse notice (CC BY 4.0). Changes made by VerifyWise.",
  disclose_io:
    "disclose.io diodb (https://github.com/disclose/diodb), CC0 1.0 per its LICENSE, attributed as CC BY 4.0 per its README. Entries are community contributions; adapted by VerifyWise.",
  uk_cma:
    "UK Competition and Markets Authority cases, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (party names extracted from case titles and cases counted); no endorsement by the Competition and Markets Authority is implied.",
  canada_ai_register:
    "Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Government of Canada AI Register (Minimum Viable Product), Treasury Board of Canada Secretariat. Adapted by VerifyWise; not endorsed by the Government of Canada.",
  ftc_competition:
    "Source: United States Federal Trade Commission, www.ftc.gov (nonmerger enforcement actions, CC0 1.0). Not endorsed by the FTC. Parties read from the matter titles and entries adapted by VerifyWise.",
  omb_ai_inventory:
    "Source: US Office of Management and Budget, 2025 Federal Agency AI Use Case Inventory (compiled from agencies' public inventories). Entries adapted by VerifyWise; not endorsed by OMB.",
  co_sic_penalties:
    "Fuente: Portal de Datos Abiertos www.datos.gov.co (Superintendencia de Industria y Comercio, consumer protection sanctions), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
  uk_atrs:
    "UK Algorithmic Transparency Recording Standard records, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (supplier names extracted and records counted); no endorsement by the Cabinet Office or the publishing bodies is implied.",
  nhtsa_recalls:
    "Source: US National Highway Traffic Safety Administration, recalls flat file. Not endorsed by NHTSA. Entries adapted by VerifyWise.",
  fmti: "Foundation Model Transparency Index (Bommasani, Klyman et al.), Stanford Center for Research on Foundation Models, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Indicators counted by VerifyWise from the published scores file; not endorsed by Stanford CRFM.",
  uk_mhra:
    "UK Medicines and Healthcare products Regulatory Agency field safety notice lists, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise (entries counted by manufacturer); no endorsement by the MHRA is implied.",
  nl_algoritmeregister:
    "Bron: Algoritmeregister van de Nederlandse overheid (algoritmes.overheid.nl); each record names up to three of the public bodies that published the descriptions it counts and links the register's search, which lists them all. Entries adapted by VerifyWise; not endorsed by the Dutch government.",
  nhtsa_odi:
    "Source: US National Highway Traffic Safety Administration, Office of Defects Investigation (defect investigations flat file). Not endorsed by NHTSA. Entries adapted by VerifyWise.",
  fedramp:
    "Source: US General Services Administration, FedRAMP Marketplace data. Not endorsed by GSA or FedRAMP. Entries adapted by VerifyWise.",
  epoch_ai:
    "Epoch AI, 'Data on AI models', published online at epoch.ai (https://epoch.ai/data/ai-models-documentation), under the Creative Commons Attribution licence. Counted and adapted by VerifyWise; not endorsed by Epoch AI.",
  c2pa_conforming:
    "C2PA Conforming Products List, c2pa-org/conformance-public repository, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Adapted by VerifyWise; not endorsed by the C2PA.",
  gleif:
    "GLEIF LEI data (CC0 1.0), from the Global Legal Entity Identifier Foundation's API. VerifyWise is not associated with GLEIF, and GLEIF does not provide, support, authorise or endorse VerifyWise or its products.",
};

/**
 * The attributions as one line, joined by semicolons: an attribution's own full stop before a
 * semicolon is dropped (the UK statement's "…v3.0." would read "v3.0.;"), and the last keeps its
 * words as they are.
 */
export function joinAttributions(attributions: readonly string[]): string {
  return attributions
    .map((attribution, index) =>
      index < attributions.length - 1 ? attribution.replace(/\.$/, "") : attribution,
    )
    .join("; ");
}

/**
 * The lists added on 2026-11-10 but Canada's sanctions list: a run names one of them only when it
 * was offered a record of it, and credits it only then; the others it counts. The shipped lists
 * and the sanctions lists keep their lines.
 */
const LISTS_SHOWN_WHEN_FOUND: ReadonlySet<string> = new Set([
  "uk_ofsi",
  "ftc_penalties",
  "eu_dg_comp",
  "uk_cma",
  "ftc_competition",
  "co_sic_penalties",
  "nhtsa_recalls",
  "uk_mhra",
  "nhtsa_odi",
  "california_breaches",
  "charlotin",
  "piperoll",
  "canada_ai_register",
  "omb_ai_inventory",
  "uk_atrs",
  "nl_algoritmeregister",
  "epoch_ai",
  "fmti",
  "fedramp",
  "c2pa_conforming",
  "disclose_io",
  "gleif",
]);

export interface CoverageText {
  /**
   * The lists and the databases the run asked, with what each list held; null for none. A list of
   * those shown when found that held nothing is not named: the last item counts them.
   */
  checked: string | null;
  /**
   * The lists and the databases the run could not check (a list with no copy, a lookup that
   * failed): its findings rest on none of them; null for none.
   */
  notChecked: string | null;
  /**
   * The lists that held nothing of the vendor, as of the days of their copies; null for none. The
   * lists shown when found are not in it: `checked` counts them.
   */
  none: string | null;
  /** A line for each list the run asked whose copy is out of date. */
  stale: string[];
  /**
   * The names `notChecked` lists, one by one, for a sentence of the screen's own; empty for none.
   */
  unchecked: string[];
  /** The sources the findings cite, counted by category. */
  cited: string;
  /** True when every list of the vendor risk database was turned off. */
  off: boolean;
  /**
   * What each list the run asked is credited with, in its owner's words. A list shown when found is
   * credited only when it offered a record.
   */
  attributions: string[];
}

/**
 * What a run of the vendor risk database checked, in words: the lists and the databases it asked,
 * the lists that held nothing, the copies that are out of date, and what its findings cite. Built
 * from ids, outcomes, days and counts alone: the names and the attributions are the screen's own,
 * and a list or a database this file does not know is left out. A database the vendor risk
 * database reads through (the NVD) is a list here: its count, the day of its answer, its notice.
 * A list added on 2026-11-10 (`LISTS_SHOWN_WHEN_FOUND`) is named only when the run was offered a
 * record of it; a run that asked such lists and found nothing counts them in one item, so that the
 * lines stay short. A list that could not be checked is always named.
 */
export function coverageLines(coverage: RunCoverage, t: Translate, lang: string): CoverageText {
  const lists = (Array.isArray(coverage?.sources) ? coverage.sources : []).filter(
    (source) =>
      source !== null &&
      typeof source === "object" &&
      labelFor(ATTRIBUTIONS, source.id) !== undefined,
  );
  const known = (Array.isArray(coverage?.lookups) ? coverage.lookups : []).filter(
    (lookup) =>
      lookup !== null &&
      typeof lookup === "object" &&
      labelFor(DATABASE_NAMES, lookup.id) !== undefined,
  );
  const lookups = known.filter((lookup) => lookup.outcome === "found" || lookup.outcome === "none");
  const nameOf = (id: RecordSourceId): string => t(DATABASE_NAMES[id]);
  // The lists the run asked: what its findings can rest on.
  const asked = lists.filter((source) => source.checked === true);
  const heldRecords = (source: CoverageSource): boolean =>
    countOf(source.strong) + countOf(source.weak) > 0;
  const shownWhenFound = (source: CoverageSource): boolean => LISTS_SHOWN_WHEN_FOUND.has(source.id);

  // A list shown when found is named only when it held a record; the others are counted in a last
  // item, so that the line does not grow with every list that was asked and held nothing.
  const named = asked.filter((source) => !shownWhenFound(source) || heldRecords(source));
  const quiet = asked.length - named.length;
  const checked = [
    ...named.map(
      (source) => `${nameOf(source.id)} (${countOf(source.strong) + countOf(source.weak)})`,
    ),
    ...lookups.map((lookup) => nameOf(lookup.id)),
  ];
  if (quiet > 0) {
    const key =
      checked.length === 0
        ? quiet === 1
          ? "1 list with no records"
          : "{count} lists with no records"
        : quiet === 1
          ? "1 more list with no records"
          : "{count} more lists with no records";
    checked.push(fill(t(key), { count: quiet }));
  }
  // What the run could not check: a silent gap in the screening would read as a clean one. Every
  // list that failed is named, whichever group it is in.
  const failed = [
    ...lists.filter((source) => source.outcome === "failed").map((source) => nameOf(source.id)),
    ...known.filter((lookup) => lookup.outcome === "failed").map((lookup) => nameOf(lookup.id)),
  ];
  // The lists shown when found that held nothing are in the count above, not in this line.
  const empty = lists
    .filter((source) => !shownWhenFound(source))
    .flatMap((source) => {
      const date = source.outcome === "none" ? dayOf(source.last_success_at, lang) : null;
      return date === null ? [] : [{ name: nameOf(source.id), date }];
    });
  const cited = coverage?.cited;

  return {
    checked:
      checked.length === 0 ? null : fill(t("Checked: {sources}"), { sources: checked.join(", ") }),
    notChecked:
      failed.length === 0
        ? null
        : fill(t("Not checked: {sources}"), { sources: failed.join(", ") }),
    unchecked: failed,
    none:
      empty.length === 0
        ? null
        : fill(t("No records in {sources} as of {dates}"), {
            sources: empty.map((entry) => entry.name).join(", "),
            dates: [...new Set(empty.map((entry) => entry.date))].join(", "),
          }),
    stale: asked.flatMap((source) => {
      const date = source.stale === true ? dayOf(source.last_success_at, lang) : null;
      return date === null
        ? []
        : [
            fill(t("{source}: last updated {date}, not up to date"), {
              source: nameOf(source.id),
              date,
            }),
          ];
    }),
    cited: fill(
      t(
        "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified",
      ),
      {
        official: countOf(cited?.official),
        press: countOf(cited?.trusted_press),
        vendor: countOf(cited?.vendor),
        unverified: countOf(cited?.unverified),
      },
    ),
    off: lists.length > 0 && lists.every((source) => source.outcome === "off"),
    // The credit follows the data: a list shown when found is credited only when it offered a
    // record, whether or not it failed (a read-through list offers the records it had stored); a
    // run that offered none of a list shows nothing of it and owes it nothing.
    attributions: [
      ...new Set(
        lists
          .filter((source) =>
            shownWhenFound(source) ? heldRecords(source) : source.checked === true,
          )
          .map((source) => ATTRIBUTIONS[source.id]),
      ),
    ],
  };
}
