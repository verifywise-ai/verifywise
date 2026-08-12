/**
 * The abstain_reason vocabulary, split by what it tells the reader.
 *
 * The split is load-bearing, not cosmetic: an abstain_reason is persisted and
 * rendered into a regulator-facing document. An ANALYTICAL reason is a genuine
 * statement about the tenant's estate and prints verbatim. An OPERATIONAL one
 * describes this pipeline — no key configured, the provider failed, the
 * summaries step produced nothing — and printing it verbatim reads as a finding
 * about their estate when it is nothing of the kind. mapToSummaries substitutes
 * a neutral sentence for those.
 *
 * Its own module rather than a runAnalyzers export, for one concrete reason:
 * mapToSummaries needs these values at module load, and several suites
 * `jest.mock` runAnalyzers. An auto-mocked module hands back undefined, which
 * crashed mapToSummaries at import time. Nothing mocks this file.
 */

export const NO_LLM_KEY = "no LLM key is configured for this organization";
export const LLM_CALL_FAILED =
  "this analysis could not be produced because the AI service call failed";
export const NO_SUMMARIES_AVAILABLE = "no section summaries were available to summarise";
export const NO_SUMMARY_PRODUCED = "no section produced a summary";
export const INSUFFICIENT_DATA = "insufficient data for this section";

export const OPERATIONAL_ABSTAIN_REASONS = [
  NO_LLM_KEY,
  LLM_CALL_FAILED,
  NO_SUMMARIES_AVAILABLE,
  NO_SUMMARY_PRODUCED,
] as const;

export const ANALYTICAL_ABSTAIN_REASONS = [INSUFFICIENT_DATA] as const;

/** Every reason the analyzers can emit. mapToSummaries.test.ts walks this to
 *  prove each one is classified, so a new reason cannot leak into a report. */
export const ALL_ABSTAIN_REASONS: readonly string[] = [
  ...OPERATIONAL_ABSTAIN_REASONS,
  ...ANALYTICAL_ABSTAIN_REASONS,
];
