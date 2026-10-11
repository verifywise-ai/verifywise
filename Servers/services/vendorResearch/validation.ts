/**
 * Deterministic validation of what the model says about a vendor.
 *
 * The model reads text that third parties wrote, so nothing it says is believed on its own word.
 * A candidate becomes a finding only through the checks below, which use no model:
 *
 * - Every citation is checked on its own. Its source id must be in the evidence pack, its quote
 *   must be a verbatim part of that source's snippet (after the prompt escaping is undone and case,
 *   whitespace and quote marks are ignored), and that source must mention the vendor, so a page
 *   about a company with a similar name cannot leak in. The quote must also hold at least one word
 *   that is no part of the vendor's own name or domain: a quote of the name alone is in every page
 *   that mentions the vendor and says nothing about a risk. A citation that fails any of this is
 *   removed, and a candidate left without a citation is dropped.
 * - The category must be one that was searched, the texts must be present and within their limits,
 *   and the enum values must be real, so that a risk level can be worked out.
 * - The texts and the quotes of a candidate are cleaned like the evidence is (see cleanText) before
 *   they are checked and stored: a NUL and a lone surrogate would make a run fail to save. So half
 *   of a surrogate pair, which would match the first half of a pair in the page, no longer does: it
 *   has become U+FFFD.
 * - The confidence is the lower of what the model says and what the evidence supports. It is never
 *   raised.
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
import { unescapeFromPrompt } from "./prompts";
import {
  MAX_FINDING_TEXT_CHARS,
  MAX_PER_CATEGORY,
  MAX_QUOTE_CHARS,
  RESEARCH_CONFIDENCES,
  RESEARCH_LIKELIHOODS,
  RESEARCH_SEVERITIES,
  ResearchOutput,
} from "./schema";
import { ResearchTarget } from "./target";
import { cleanText } from "./text";

/** The same constant as the prompt and the schema use, so that the three cannot disagree. */
export { MAX_PER_CATEGORY };
export const MAX_PER_RUN = 8;

type Candidate = ResearchOutput["findings"][number];

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

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
 * A word is a run of letters and digits in any script, the same boundary `wholeWord` draws for the
 * vendor-mention check below. (The tokeniser of the risk suggestions is not used: it keeps ASCII
 * only and drops words of two letters or fewer, so a quote of "EU AI" or in another script would
 * have no words, which would be a minimum length by the back door.)
 */
const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a text that `normaliseForQuote` has normalised already. */
const wordsOfNormalised = (normalised: string): string[] => normalised.match(WORD) ?? [];

/**
 * The words of the vendor's own name and of its domain, normalised like a quote. They are what a
 * quote has to go beyond: "Acme", "Acme Analytics" and "acme-analytics.com" say nothing that the
 * name does not.
 */
function vendorOwnWords(target: ResearchTarget): Set<string> {
  return new Set([
    ...wordsOfNormalised(normaliseForQuote(target.name)),
    ...wordsOfNormalised(normaliseForQuote(target.domain ?? "")),
  ]);
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

/** True for the domain itself and for every subdomain of it. */
function isOnDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A case-insensitive matcher for `term` as a whole word, or null when the term holds nothing but
 * whitespace. Whole means that no letter and no digit, in any script, comes right before or after
 * it, so "Acme" is not in "Acmeville" and "acme.com" is not in "notacme.com". The characters of the
 * term are matched as they are written (C++, AT&T), and a run of whitespace in a name matches any
 * run of whitespace. An empty term has no matcher, because an empty pattern matches everything.
 */
function wholeWord(term: string): RegExp | null {
  const words = term.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return null;
  const pattern = words.map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu");
}

/**
 * True when the source is about the vendor: its URL is on the vendor's domain or a subdomain of it,
 * or its title or snippet names the vendor as a whole word or mentions its domain.
 */
export function sourceMentionsVendor(source: EvidenceSource, target: ResearchTarget): boolean {
  const host = hostOf(source.url);
  if (host !== null && target.domain !== null && isOnDomain(host, target.domain)) return true;

  const texts = [source.title, source.content];
  return [target.name, target.domain ?? ""].some((term) => {
    const matcher = wholeWord(term);
    return matcher !== null && texts.some((text) => matcher.test(text));
  });
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<FindingConfidence, number> = { low: 0, medium: 1, high: 2 };

function lowerOf(a: FindingConfidence, b: FindingConfidence): FindingConfidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * The most confidence the cited sources support. `high` needs two different hostnames, `medium`
 * two different pages or one page on the vendor's own domain, and anything less is `low`.
 * "www.x.test" and "x.test" are one hostname, and a URL that cannot be read is not a source.
 */
export function confidenceCeiling(
  sources: FindingSource[],
  target: ResearchTarget,
): FindingConfidence {
  const hostnames = new Set<string>();
  const pages = new Set<string>();
  let onOwnDomain = false;

  for (const source of sources) {
    const host = hostOf(source.url);
    if (host === null) continue;
    pages.add(source.url);
    hostnames.add(host.replace(/^www\./, ""));
    if (target.domain !== null && isOnDomain(host, target.domain)) onOwnDomain = true;
  }

  if (hostnames.size >= 2) return "high";
  if (pages.size >= 2 || onOwnDomain) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

const isOneOf = (values: readonly string[], value: string) => values.includes(value);

/** A text of the register: present, and not longer than the schema allows. */
const isUsableText = (text: string) => text.trim() !== "" && text.length <= MAX_FINDING_TEXT_CHARS;

/**
 * The citations of a candidate that hold up, one for each source, in the order the model gave
 * them. A source cited twice counts once, with the first quote that holds up, so that citing one
 * page twice cannot pass for two sources.
 *
 * A quote holds up when it is in the source, the source mentions the vendor, and the quote has a
 * word that is no part of the vendor's name or domain. The last rule is what keeps a second
 * hostname with the quote "Acme" from lifting a claim to `high` (see `confidenceCeiling`). It is
 * not a minimum length: "ISO 27001" is short and real.
 */
function validCitations(
  candidate: Candidate,
  sourcesById: Map<string, EvidenceSource>,
  target: ResearchTarget,
): FindingSource[] {
  const citations = new Map<string, FindingSource>();
  const ownWords = vendorOwnWords(target);

  for (const item of candidate.evidence) {
    if (citations.has(item.source_id)) continue;
    const source = sourcesById.get(item.source_id);
    if (source === undefined) continue;

    // Cleaned first, like the evidence the quote is looked for in: a NUL is dropped, and half of a
    // surrogate pair becomes U+FFFD, which is not half of a pair in the page.
    const written = cleanText(item.quote);
    if (written.length > MAX_QUOTE_CHARS) continue;

    // The model saw the snippet with &, < and > escaped, so it quotes them escaped.
    const quote = unescapeFromPrompt(written);
    const wanted = normaliseForQuote(quote);
    // An empty string is part of every text, so it is refused on its own.
    if (wanted === "" || !normaliseForQuote(source.content).includes(wanted)) continue;
    if (!sourceMentionsVendor(source, target)) continue;
    // A quote of nothing but the vendor's own name or domain, or of no word at all. A refused quote
    // does not use up its source: a later quote of the same source can still count.
    if (!wordsOfNormalised(wanted).some((word) => !ownWords.has(word))) continue;

    citations.set(item.source_id, {
      url: source.url,
      title: source.title,
      quote: quote.trim(),
      published_at: source.publishedAt,
    });
  }

  return Array.from(citations.values());
}

/** The finding a candidate makes, or null when it fails a check. */
function toFinding(
  candidate: Candidate,
  sourcesById: Map<string, EvidenceSource>,
  searched: Set<ResearchCategory>,
  target: ResearchTarget,
): NewFinding | null {
  if (!searched.has(candidate.category)) return null;

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
    return null;
  }
  if (
    !isOneOf(RESEARCH_LIKELIHOODS, candidate.likelihood) ||
    !isOneOf(RESEARCH_SEVERITIES, candidate.risk_severity) ||
    !isOneOf(RESEARCH_CONFIDENCES, candidate.confidence)
  ) {
    return null;
  }
  const level = calculateRiskLevel(candidate.risk_severity, candidate.likelihood);
  if (level === null) return null;

  const sources = validCitations(candidate, sourcesById, target);
  if (sources.length === 0) return null;

  return {
    category: candidate.category,
    risk_description: riskDescription.trim(),
    impact_description: impactDescription.trim(),
    action_plan: actionPlan.trim(),
    likelihood: candidate.likelihood,
    risk_severity: candidate.risk_severity,
    risk_level: `${level} Risk`,
    confidence: lowerOf(candidate.confidence, confidenceCeiling(sources, target)),
    sources,
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
 * `searchedCategories` the categories whose search succeeded.
 */
export function validateFindings(
  output: ResearchOutput,
  pack: EvidenceSource[],
  target: ResearchTarget,
  searchedCategories: ResearchCategory[],
): NewFinding[] {
  const sourcesById = new Map(pack.map((source): [string, EvidenceSource] => [source.id, source]));
  const searched = new Set(searchedCategories);

  const findings: NewFinding[] = [];
  for (const candidate of output.findings) {
    const finding = toFinding(candidate, sourcesById, searched, target);
    if (finding !== null) findings.push(finding);
  }
  return mostSevereFirst(findings);
}
