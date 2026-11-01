/**
 * The measures of an evaluation case. A run is scored on what a person would check by hand: do the
 * findings that stay match the risks the case expects (precision and recall), and what is wrong
 * with the sources and the findings behind them. Each measure that is not about the findings'
 * match with the expectation has a name that says what it counts, and a threshold in the case's
 * targets (see types.ts); the roadmap idea that is meant to fix it is in the case's gaps.
 *
 * The measures are independent of the code they check. The credibility label is computed by the
 * code it checks (see credibility.ts), so it is held to the label that a person wrote into the
 * case for the expected finding it matches. A finding has no confidence of its own (M3 Part B), so
 * there is no measure of a confidence that its sources do not support.
 */
import type { FindingSource, NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import { withAliases } from "../aliases";
import { normaliseForQuote, sourceMentionsVendor } from "../validation";
import type { CaseRun } from "./runCase";
import type { Targets } from "./types";

export interface CaseScore {
  /** Findings that stay after validation, de-duplication and the caps. */
  kept: number;
  /** Kept findings that match an expected one. */
  matched: number;
  /** Findings the case expects. */
  expected: number;
  /** Expected findings that at least one kept finding matches. */
  recalled: number;
  /** matched over kept; null when nothing was kept. */
  precision: number | null;
  /** recalled over expected; null when nothing was expected. */
  recall: number | null;
  /** Quotes of the model that validation removed, for every reason. */
  citationsRejected: number;
  /** Candidates that validation dropped whole. */
  candidatesRejected: number;
  irrelevantSources: number;
  duplicateSources: number;
  badUrls: number;
  datedWebResults: number;
  /**
   * Kept findings that rest on search results alone: none of the sources they cite was read as a
   * page, and no page that the run read, after the analysis too, holds a quote they cite.
   */
  snippetOnlyFindings: number;
  /**
   * Kept findings whose credibility label, or name-only note, is not the one of the first expected
   * finding that they match and that gives a label.
   */
  mislabelled: number;
  duplicateClusters: number;
  /** Sources in the evidence pack. */
  sources: number;
  searches: number;
  reads: number;
  modelCalls: number;
  /** The time of all phases, in milliseconds. */
  ms: number;
  /** Tokens of all model calls, as the calls reported them (estimated in a replay). */
  tokens: number;
}

const wordsIn = (finding: Pick<NewFinding, "risk_description" | "impact_description">) =>
  `${finding.risk_description} ${finding.impact_description}`.toLowerCase();

const hasAny = (text: string, words: string[]) =>
  words.some((word) => text.includes(word.toLowerCase()));

/** Whitespace folded and case ignored, so that two renderings of one text compare equal. */
const comparable = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** An address that ends in an encoded quotation mark: a curly or a straight one, in UTF-8 or ASCII. */
const ENDS_IN_ENCODED_QUOTE = /%(?:E2%80%(?:9C|9D|98|99)|22|27)\/?$/i;

export function scoreRun(run: CaseRun): CaseScore {
  const { evalCase, pack, kept, trace } = run;
  // The vendor is known by the names its home page gave as well as by the ones in its record.
  const target = withAliases(run.target, run.found.siteNames ?? []);
  const expectedFindings = evalCase.expected.findings;

  const matches = (finding: NewFinding, index: number) =>
    finding.category === expectedFindings[index].category &&
    hasAny(wordsIn(finding), expectedFindings[index].anyOf);
  const matchedKept = kept.filter((finding) =>
    expectedFindings.some((_expected, index) => matches(finding, index)),
  );
  const recalled = expectedFindings.filter((_expected, index) =>
    kept.some((finding) => matches(finding, index)),
  );

  const pageUrls = new Set(pack.filter((source) => source.kind === "page").map((s) => s.url));
  // A quote that a page read by the run holds, the pages read after the analysis included. It is
  // looked for here, in the text the reader gave, and not taken from the mark on the finding, so
  // that a check that stopped reading would show.
  const confirmedOnPage = (cited: FindingSource): boolean => {
    const text = run.readTexts.get(cited.url);
    const quote = normaliseForQuote(cited.quote);
    return text !== undefined && quote !== "" && normaliseForQuote(text).includes(quote);
  };
  const snippetOnly = kept.filter(
    (finding) =>
      finding.sources.length > 0 &&
      finding.sources.every((cited) => !pageUrls.has(cited.url) && !confirmedOnPage(cited)),
  );
  const mislabelled = kept.filter((finding, keptIndex) => {
    const expected = expectedFindings.find(
      (candidate, index) => candidate.credibility !== undefined && matches(finding, index),
    );
    if (expected === undefined) return false;
    const given = run.credibility[keptIndex];
    return (
      given?.label !== expected.credibility ||
      given.basis.name_only !== (expected.nameOnly ?? false)
    );
  });

  const seenTexts = new Set<string>();
  let duplicateSources = 0;
  for (const source of pack) {
    const text = comparable(source.content);
    if (text === "") continue;
    if (seenTexts.has(text)) duplicateSources += 1;
    seenTexts.add(text);
  }

  const clusters = evalCase.expected.clusters ?? [];
  const perCluster = new Map<string, number>();
  for (const finding of kept) {
    const cluster = clusters.find((candidate) => hasAny(wordsIn(finding), candidate.anyOf));
    if (cluster) perCluster.set(cluster.id, (perCluster.get(cluster.id) ?? 0) + 1);
  }
  const duplicateClusters = [...perCluster.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );

  return {
    kept: kept.length,
    matched: matchedKept.length,
    expected: expectedFindings.length,
    recalled: recalled.length,
    precision: kept.length === 0 ? null : matchedKept.length / kept.length,
    recall: expectedFindings.length === 0 ? null : recalled.length / expectedFindings.length,
    citationsRejected: Object.entries(trace.dropped)
      .filter(([reason]) => reason.startsWith("citation."))
      .reduce((sum, [, count]) => sum + count, 0),
    candidatesRejected: trace.rejected.length,
    irrelevantSources: pack.filter((source) => !sourceMentionsVendor(source, target)).length,
    duplicateSources,
    badUrls: pack.filter((source) => ENDS_IN_ENCODED_QUOTE.test(source.url)).length,
    datedWebResults: pack.filter(
      (source) =>
        source.kind === "result" && source.publishedAt !== null && run.feedOf(source.url) === "web",
    ).length,
    snippetOnlyFindings: snippetOnly.length,
    mislabelled: mislabelled.length,
    duplicateClusters,
    sources: pack.length,
    searches: run.found.searchesUsed,
    reads: run.found.pagesRead,
    modelCalls: trace.totals.modelCalls,
    ms: trace.phases.reduce((sum, phase) => sum + phase.ms, 0),
    tokens: trace.totals.totalTokens,
  };
}

/** The measure each target is read from, and whether it is a floor or a ceiling. */
const TARGET_MEASURES: Record<
  keyof Targets,
  { measure: keyof CaseScore; kind: "floor" | "ceiling" }
> = {
  minPrecision: { measure: "precision", kind: "floor" },
  minRecall: { measure: "recall", kind: "floor" },
  maxKept: { measure: "kept", kind: "ceiling" },
  maxIrrelevantSources: { measure: "irrelevantSources", kind: "ceiling" },
  maxDuplicateSources: { measure: "duplicateSources", kind: "ceiling" },
  maxBadUrls: { measure: "badUrls", kind: "ceiling" },
  maxDatedWebResults: { measure: "datedWebResults", kind: "ceiling" },
  maxSnippetOnlyFindings: { measure: "snippetOnlyFindings", kind: "ceiling" },
  maxMislabelled: { measure: "mislabelled", kind: "ceiling" },
  maxDuplicateClusters: { measure: "duplicateClusters", kind: "ceiling" },
  maxCitationsRejected: { measure: "citationsRejected", kind: "ceiling" },
};

/**
 * The targets the score does not meet, in the order the targets are declared. A floor on a measure
 * that is not defined (precision with no finding, recall with no expectation) is met: there is
 * nothing wrong to count.
 */
export function missedTargets(score: CaseScore, targets: Targets): Array<keyof Targets> {
  const missed: Array<keyof Targets> = [];
  for (const name of Object.keys(targets) as Array<keyof Targets>) {
    const limit = targets[name];
    if (limit === undefined) continue;
    const { measure, kind } = TARGET_MEASURES[name];
    const value = score[measure];
    if (value === null) continue;
    const met = kind === "floor" ? value >= limit : value <= limit;
    if (!met) missed.push(name);
  }
  return missed;
}
