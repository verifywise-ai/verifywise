/**
 * Deterministic validation of what the model says about a vendor.
 *
 * The model reads text that third parties wrote, so nothing it says is believed on its own word.
 * A candidate becomes a finding only through the checks below, which use no model:
 *
 * - Every citation is checked on its own. Its source id must be in the evidence pack, its quote
 *   must be a verbatim part of that source's snippet (after the prompt escaping is undone and case,
 *   whitespace and quote marks are ignored) without the gap mark of a page excerpt in it, which
 *   stands for text that was left out, and that source must mention the vendor (the vendor's own
 *   page always does: see `isVendorsOwnPage`; the matcher is the one of identity.ts), so a page about
 *   a company with a similar name cannot leak in. The quote must also hold at least one word that is no part of the vendor's own name or
 *   domain (as the page may write them: with `www.` or a scheme, or as a possessive): a quote of
 *   the name alone is in every page that mentions the vendor and says nothing about a risk. A
 *   citation that fails any of this is removed, and a candidate left without a citation is dropped.
 * - The category must be one with evidence in the pack, the texts must be present and within their
 *   limits, and the enum values must be real, so that a risk level can be worked out.
 * - The texts and the quotes of a candidate are cleaned like the evidence is (see cleanText) before
 *   they are checked and stored: a NUL and a lone surrogate would make a run fail to save. So half
 *   of a surrogate pair, which would match the first half of a pair in the page, no longer does: it
 *   has become U+FFFD.
 * - The confidence is the lower of what the model says and what the evidence supports (see
 *   `confidenceCeiling`: independent publishers, and the tier of the sources). It is never raised.
 * - The findings come back with the most severe first, so that of two similar ones the more severe
 *   is the one that the de-duplication keeps. `applyCaps` then keeps at most MAX_PER_CATEGORY for a
 *   category and MAX_PER_RUN for a run. The caller applies it after the de-duplication: findings
 *   that are already known must not take the places of new ones.
 *
 * What these checks cannot tell is a page that says something false about the vendor, or a quote
 * from a page that gives orders to the model: both are real text of a page that mentions the
 * vendor. The person who accepts a finding into the register is the check for that.
 */
import {
  EvidenceSource,
  FindingConfidence,
  FindingSource,
  NewFinding,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { calculateRiskLevel } from "../../utils/validations/vendorRiskValidation.utils";
import { EXCERPT_GAP } from "../webResearch/pageText";
import { unescapeFromPrompt } from "./prompts";
import {
  MAX_FINDING_TEXT_CHARS,
  MAX_PER_CATEGORY,
  MAX_QUOTE_CHARS,
  RESEARCH_CONFIDENCES,
  RESEARCH_LIKELIHOODS,
  RESEARCH_SEVERITIES,
  type AnyResearchOutput,
  ResearchOutput,
} from "./schema";
import { createVendorMatcher } from "./identity";
import { corroborationOf } from "./sourceTiers";
import { ResearchTarget } from "./target";
import { cleanText, cutAtCodePoint } from "./text";

/** The same constant as the prompt and the schema use, so that the three cannot disagree. */
export { MAX_PER_CATEGORY };
export const MAX_PER_RUN = 8;

/**
 * A finding as the model answered it. Under the credibility rules (since vr-9) it has no
 * confidence, and the stored one is then the ceiling of its sources.
 */
type Candidate = Omit<ResearchOutput["findings"][number], "confidence"> &
  Partial<Pick<ResearchOutput["findings"][number], "confidence">>;

// ---------------------------------------------------------------------------
// The report: why candidates and citations were turned away
// ---------------------------------------------------------------------------

/** Why a candidate was dropped whole. */
export type CandidateRejection =
  "category_not_in_pack" | "text_unusable" | "invalid_value" | "no_valid_citation";

/** Why a citation was removed from a candidate. */
export type CitationRejection =
  | "unknown_source"
  | "quote_too_long"
  | "gap_mark"
  | "quote_not_in_source"
  | "source_not_about_vendor"
  | "quote_is_only_the_name";

/** How much of a candidate's description a rejection keeps, to recognise it by. */
const REJECTED_TEXT_CHARS = 120;

/**
 * What the checks turned away, for the trace of the run. It changes nothing about the result:
 * `validateFindings` fills the one it is given.
 */
export interface ValidationReport {
  candidates: Array<{ reason: CandidateRejection; category: ResearchCategory; text: string }>;
  citations: Partial<Record<CitationRejection, number>>;
}

export const newValidationReport = (): ValidationReport => ({ candidates: [], citations: {} });

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** The mark that stands where a page excerpt leaves text out: "[…]". */
const GAP_MARK = EXCERPT_GAP.trim();

/**
 * Quotation marks of every kind: straight, curly, low and guillemets. They are removed rather than
 * straightened, on both sides of a comparison, because a model and a web page often do not write
 * them alike ("don't" and "don’t"), and they carry no information.
 */
const QUOTE_MARKS = /["'\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A]/g;

/**
 * The form in which a quote and a page are compared: lower case, without quote marks, with every
 * run of whitespace as one space, and trimmed. A text of nothing but quote marks and spaces
 * becomes an empty string.
 */
export function normaliseForQuote(text: string): string {
  return text.toLowerCase().replace(QUOTE_MARKS, "").replace(/\s+/g, " ").trim();
}

/**
 * A word is a run of letters and digits in any script, the same boundary `wholeWord` (identity.ts)
 * draws for the vendor-mention check below. (The tokeniser of the risk suggestions is not used: it keeps ASCII
 * only and drops words of two letters or fewer, so a quote of "EU AI" or in another script would
 * have no words, which would be a minimum length by the back door.)
 */
const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a text that `normaliseForQuote` has normalised already. */
const wordsOfNormalised = (normalised: string): string[] => normalised.match(WORD) ?? [];

/**
 * The words around a domain that a page writes and the vendor record does not keep: `www.` and the
 * scheme of a link (`normaliseDomain` strips both). "www.acme-analytics.com" and
 * "https://acme-analytics.com" are the domain and nothing else.
 */
const DOMAIN_FRAME_WORDS = ["www", "http", "https"];

/**
 * The words of the vendor's own name and of its domain, normalised like a quote, and what a page
 * makes of them. They are what a quote has to go beyond: "Acme", "Acme Analytics",
 * "acme-analytics.com", "www.acme-analytics.com" and "Acme's" say nothing that the name does not.
 *
 * - `www`, `http` and `https` count as the vendor's own (see DOMAIN_FRAME_WORDS).
 * - So does the possessive of each word of the name and of the domain: the apostrophe is stripped
 *   by `normaliseForQuote`, so "Acme's" is the word "acmes". This is done here, in the comparison
 *   only; the normalisation is shared with the check that the quote is in the page.
 *
 * What is not added is a list of company suffixes (Inc, LLC, GmbH) or of top-level domains: they
 * are words of their own, so "Acme Analytics Inc" counts, and so does a bare "acme-analytics.com"
 * for a vendor with no domain on record. That is a known limit of a rule with no word lists.
 */
function vendorOwnWords(target: ResearchTarget): Set<string> {
  const named = [
    ...wordsOfNormalised(normaliseForQuote(target.name)),
    ...wordsOfNormalised(normaliseForQuote(target.domain ?? "")),
  ];
  return new Set([...named, ...named.map((word) => `${word}s`), ...DOMAIN_FRAME_WORDS]);
}

// ---------------------------------------------------------------------------
// Does the source mention the vendor?
// ---------------------------------------------------------------------------

/** The lower-case host name of a URL, or null when the URL cannot be read. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/**
 * True when the source is the vendor's own page: the research marked it as on the vendor's website
 * (`onVendorSite`) and the vendor has a domain. The mark is the research's decision, taken on the
 * page that answered; the host of the URL, which is the one that was asked for, plays no part in
 * it. A page asked for on the vendor's domain that redirected off it is not the vendor's own, and
 * one asked for elsewhere that answered from the vendor's site is. Without a domain nothing is.
 */
function isVendorsOwnPage(
  source: Pick<EvidenceSource, "onVendorSite">,
  target: ResearchTarget,
): boolean {
  return target.domain !== null && source.onVendorSite;
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * True when the title or the text carries the vendor's stored LEI as a code of its own (no letter
 * or digit beside it). An LEI is one legal entity's, so a list entry found by it is the vendor's,
 * though the list names the company otherwise: a former name, a holding name, a transliteration
 * (M2 final review, Important 2).
 */
function carriesStoredLei(source: EvidenceSource, target: ResearchTarget): boolean {
  const lei = target.identifiers?.lei?.toUpperCase();
  if (lei === undefined || lei === "") return false;
  const text = `${source.title} ${source.content}`.toUpperCase();
  for (let at = text.indexOf(lei); at !== -1; at = text.indexOf(lei, at + 1)) {
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + lei.length] ?? "";
    if (!LETTER_OR_DIGIT.test(before) && !LETTER_OR_DIGIT.test(after)) return true;
  }
  return false;
}

/**
 * True when the source is about the vendor: it is the vendor's own page (see `isVendorsOwnPage`),
 * the vendor matcher (identity.ts, the one the web session keeps results out of the evidence
 * with) finds the vendor in its title or its text, or it carries the vendor's stored LEI.
 */
export function sourceMentionsVendor(source: EvidenceSource, target: ResearchTarget): boolean {
  // The title and the text only: the address is the one that was asked for, and a page can answer
  // from somewhere else.
  return (
    isVendorsOwnPage(source, target) ||
    createVendorMatcher(target)({ title: source.title, content: source.content }) ||
    carriesStoredLei(source, target)
  );
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<FindingConfidence, number> = { low: 0, medium: 1, high: 2 };

function lowerOf(a: FindingConfidence, b: FindingConfidence): FindingConfidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

/** What the confidence ceiling reads of a cited source: its URL and whether it is the vendor's own. */
export type CitedPage = Pick<EvidenceSource, "url" | "onVendorSite">;

/**
 * The most confidence the cited sources support. `high` needs two independent publishers, one of
 * them in a credible tier (sourceTiers.ts: the vendor's own site, a regulator or a court, a major
 * publisher). One story on two domains of a publisher, a story and its copy on an aggregator, and
 * the pages of the vendor's own site are one publisher each. `medium` needs two different pages or
 * one page that is the vendor's own (see `isVendorsOwnPage`: the research's mark, not the host of
 * the URL), and anything less is `low`. A URL that cannot be read is not a source.
 */
export function confidenceCeiling(sources: CitedPage[], target: ResearchTarget): FindingConfidence {
  const pages = new Set<string>();
  let ownPage = false;

  for (const source of sources) {
    if (hostOf(source.url) === null) continue;
    pages.add(source.url);
    if (isVendorsOwnPage(source, target)) ownPage = true;
  }

  const { publishers, credible } = corroborationOf(sources, target);
  if (publishers >= 2 && credible) return "high";
  if (pages.size >= 2 || ownPage) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

const isOneOf = (values: readonly string[], value: string) => values.includes(value);

/** A text of the register: present, and not longer than the schema allows. */
const isUsableText = (text: string) => text.trim() !== "" && text.length <= MAX_FINDING_TEXT_CHARS;

/** A citation that holds up: what is stored with the finding, and the source it quotes. */
interface HeldCitation {
  stored: FindingSource;
  from: EvidenceSource;
}

/**
 * The citations of a candidate that hold up, one for each source, in the order the model gave
 * them. A source cited twice counts once, with the first quote that holds up, so that citing one
 * page twice cannot pass for two sources.
 *
 * A quote holds up when it is in the source, the source mentions the vendor, and the quote has a
 * word that is no part of the vendor's name or domain (see `vendorOwnWords` for what counts as
 * that). The last rule is what keeps a second publisher with the quote "Acme" or "www.acme.com"
 * from lifting a claim to `high` (see `confidenceCeiling`). It is not a minimum length: "ISO
 * 27001" is short and real.
 */
function validCitations(
  candidate: Candidate,
  sourcesById: Map<string, EvidenceSource>,
  target: ResearchTarget,
  report?: ValidationReport,
): HeldCitation[] {
  const citations = new Map<string, HeldCitation>();
  const ownWords = vendorOwnWords(target);
  const refuse = (reason: CitationRejection) => {
    if (report) report.citations[reason] = (report.citations[reason] ?? 0) + 1;
  };

  for (const item of candidate.evidence) {
    if (citations.has(item.source_id)) continue;
    const source = sourcesById.get(item.source_id);
    if (source === undefined) {
      refuse("unknown_source");
      continue;
    }

    // Cleaned first, like the evidence the quote is looked for in: a NUL is dropped, and half of a
    // surrogate pair becomes U+FFFD, which is not half of a pair in the page.
    const written = cleanText(item.quote);
    if (written.length > MAX_QUOTE_CHARS) {
      refuse("quote_too_long");
      continue;
    }
    // The gap mark of a page excerpt stands for text that was left out, so a quote that holds it
    // joins passages that are not next to each other on the page, even when the excerpt holds the
    // same text. Checked on the quote as written, before the comparison ignores whitespace, and
    // again once it is normalised: the comparison drops quote marks, so `["…"]` is the mark too.
    if (written.includes(GAP_MARK)) {
      refuse("gap_mark");
      continue;
    }

    // The model saw the snippet with &, < and > escaped, so it quotes them escaped.
    const quote = unescapeFromPrompt(written);
    const wanted = normaliseForQuote(quote);
    if (wanted.includes(GAP_MARK)) {
      refuse("gap_mark");
      continue;
    }
    // An empty string is part of every text, so it is refused on its own.
    if (wanted === "" || !normaliseForQuote(source.content).includes(wanted)) {
      refuse("quote_not_in_source");
      continue;
    }
    if (!sourceMentionsVendor(source, target)) {
      refuse("source_not_about_vendor");
      continue;
    }
    // A quote of nothing but the vendor's own name or domain (as a page writes them), or of no word
    // at all. A refused quote does not use up its source: a later quote of the same source can
    // still count.
    if (!wordsOfNormalised(wanted).some((word) => !ownWords.has(word))) {
      refuse("quote_is_only_the_name");
      continue;
    }

    citations.set(item.source_id, {
      stored: {
        url: source.url,
        title: source.title,
        quote: quote.trim(),
        published_at: source.publishedAt,
      },
      from: source,
    });
  }

  return Array.from(citations.values());
}

/** The finding a candidate makes, or null when it fails a check. */
function toFinding(
  candidate: Candidate,
  sourcesById: Map<string, EvidenceSource>,
  categoriesInPack: Set<ResearchCategory>,
  target: ResearchTarget,
  report?: ValidationReport,
): NewFinding | null {
  const refuse = (reason: CandidateRejection): null => {
    report?.candidates.push({
      reason,
      category: candidate.category,
      text: cutAtCodePoint(
        cleanText(String(candidate.risk_description ?? "")),
        REJECTED_TEXT_CHARS,
      ),
    });
    return null;
  };
  if (!categoriesInPack.has(candidate.category)) return refuse("category_not_in_pack");

  // Cleaned before they are checked: a text of nothing but NULs and spaces is blank, and a text
  // that is over the limit only because of its NULs is not too long.
  const riskDescription = cleanText(candidate.risk_description);
  const impactDescription = cleanText(candidate.impact_description);
  const actionPlan = cleanText(candidate.action_plan);
  if (
    !isUsableText(riskDescription) ||
    !isUsableText(impactDescription) ||
    !isUsableText(actionPlan)
  ) {
    return refuse("text_unusable");
  }
  if (
    !isOneOf(RESEARCH_LIKELIHOODS, candidate.likelihood) ||
    !isOneOf(RESEARCH_SEVERITIES, candidate.risk_severity) ||
    (candidate.confidence !== undefined && !isOneOf(RESEARCH_CONFIDENCES, candidate.confidence))
  ) {
    return refuse("invalid_value");
  }
  const level = calculateRiskLevel(candidate.risk_severity, candidate.likelihood);
  if (level === null) return refuse("invalid_value");

  const citations = validCitations(candidate, sourcesById, target, report);
  if (citations.length === 0) return refuse("no_valid_citation");

  // Explains the rating and is checked by nothing: a missing or blank one is no reason to lose a
  // finding, and an over-long one (a recording does not go through the schema) is cut.
  const rationale = cutAtCodePoint(
    cleanText(candidate.rationale ?? ""),
    MAX_FINDING_TEXT_CHARS,
  ).trim();

  // What the sources support. A model that gave no confidence (the credibility rules) gets this.
  const ceiling = confidenceCeiling(
    citations.map((citation) => citation.from),
    target,
  );

  return {
    category: candidate.category,
    risk_description: riskDescription.trim(),
    impact_description: impactDescription.trim(),
    action_plan: actionPlan.trim(),
    likelihood: candidate.likelihood,
    risk_severity: candidate.risk_severity,
    risk_level: `${level} Risk`,
    confidence:
      candidate.confidence === undefined ? ceiling : lowerOf(candidate.confidence, ceiling),
    rationale: rationale === "" ? null : rationale,
    sources: citations.map((citation) => citation.stored),
  };
}

/**
 * A copy of the findings with the most severe first. The sort is stable, so findings of one
 * severity stay in the order they were given in.
 */
function mostSevereFirst(findings: NewFinding[]): NewFinding[] {
  const severityRank = (finding: NewFinding) => RESEARCH_SEVERITIES.indexOf(finding.risk_severity);
  return [...findings].sort((a, b) => severityRank(b) - severityRank(a));
}

/**
 * The most severe findings first, at most MAX_PER_CATEGORY of a category and MAX_PER_RUN in all.
 * Findings of one severity stay in the order they were given in. The caller applies it after the
 * de-duplication, so that a finding that is already known cannot take the place of a new one.
 */
export function applyCaps(findings: NewFinding[]): NewFinding[] {
  const keptPerCategory = new Map<ResearchCategory, number>();
  const kept: NewFinding[] = [];
  for (const finding of mostSevereFirst(findings)) {
    if (kept.length >= MAX_PER_RUN) break;
    const inCategory = keptPerCategory.get(finding.category) ?? 0;
    if (inCategory >= MAX_PER_CATEGORY) continue;
    keptPerCategory.set(finding.category, inCategory + 1);
    kept.push(finding);
  }
  return kept;
}

/**
 * The candidates of the model that hold up, as findings ready to be stored, the most severe first
 * and not capped (see applyCaps). `pack` is the evidence the model was shown and
 * `categoriesInPack` the categories that have a source in it.
 */
export function validateFindings(
  output: AnyResearchOutput,
  pack: EvidenceSource[],
  target: ResearchTarget,
  categoriesInPack: ResearchCategory[],
  report?: ValidationReport,
): NewFinding[] {
  const sourcesById = new Map(pack.map((source): [string, EvidenceSource] => [source.id, source]));
  const inPack = new Set(categoriesInPack);

  const findings: NewFinding[] = [];
  for (const candidate of output.findings) {
    const finding = toFinding(candidate, sourcesById, inPack, target, report);
    if (finding !== null) findings.push(finding);
  }
  return mostSevereFirst(findings);
}
