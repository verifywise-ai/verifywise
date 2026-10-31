/**
 * De-duplication of the findings of a run, so that the register and the list of findings do not
 * collect the same risk again and again, and so that a dismissed finding does not come back when
 * the vendor is researched again.
 *
 * "The same" is measured on the words of the description and the impact together, with the Jaccard
 * score of the tokeniser the vendor risk suggestions use. The thresholds are lower against the
 * register, where the wording of a person is compared with the wording of a model, than against
 * earlier findings, where the wording is the model's own. Inside a run it is also measured on the
 * events that the sources report (see clusters.ts): one event is at most one finding, whatever
 * words each candidate uses for its side of it.
 */
import { IVendorRiskFinding, NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import { jaccard, tokenise } from "../vendors/textSimilarity";

/** A candidate this similar to an active risk of the vendor is dropped. */
export const ACTIVE_RISK_THRESHOLD = 0.25;
/** A candidate this similar to an earlier finding of the vendor, or to a kept one of its run, is dropped. */
export const PRIOR_FINDING_THRESHOLD = 0.4;

/** What a dropped candidate repeated. */
export type DuplicateReason =
  "active_risk" | "earlier_finding" | "same_source" | "same_run" | "same_event";

/** Filled by `dropDuplicates`, for the trace of the run: how many candidates each reason dropped. */
export interface DedupeReport {
  reasons: Partial<Record<DuplicateReason, number>>;
}

/**
 * What is compared. The two texts of a register risk are nullable columns, though the type of a
 * risk says string, so a missing one counts as no words rather than as the word "null".
 */
export interface KnownRisk {
  risk_description: string | null;
  impact_description: string | null;
}

/** An earlier finding of the vendor, whatever became of it. */
export type PriorFinding = Pick<
  IVendorRiskFinding,
  "category" | "risk_description" | "impact_description" | "sources"
>;

const tokensOf = (finding: KnownRisk) =>
  tokenise(`${finding.risk_description ?? ""} ${finding.impact_description ?? ""}`);

/**
 * Removes the candidates that repeat something. A candidate is dropped when it is
 *
 * - at or above ACTIVE_RISK_THRESHOLD similar to an active risk of the vendor,
 * - at or above PRIOR_FINDING_THRESHOLD similar to an earlier finding of the vendor, whatever its
 *   status, or in the same category and citing a URL (compared as an exact string) that finding
 *   cited,
 * - at or above PRIOR_FINDING_THRESHOLD similar to a candidate of this run that was kept. Of two
 *   similar candidates the first is kept. A dropped candidate is not compared with later ones.
 * - about an event that a candidate of this run that was kept is about already: every source it
 *   cites is in an event (`events` maps the address of a source to its event) that a kept candidate
 *   cites. A candidate that cites a source in no event, or in an event no kept candidate cites,
 *   adds something and stays; the events it cites are then taken. The first of an event is kept,
 *   which is the most severe, since the candidates come the most severe first.
 *
 * `dropped` counts every removal. The candidates that stay keep their order.
 */
export function dropDuplicates(
  candidates: NewFinding[],
  existingRisks: KnownRisk[],
  priorFindings: PriorFinding[],
  report?: DedupeReport,
  events: ReadonlyMap<string, string> = new Map(),
): { kept: NewFinding[]; dropped: number } {
  const riskTokens = existingRisks.map(tokensOf);
  const priors = priorFindings.map((finding) => ({
    category: finding.category,
    tokens: tokensOf(finding),
    urls: new Set(finding.sources.map((source) => source.url)),
  }));

  const kept: NewFinding[] = [];
  const keptTokens: Array<Set<string>> = [];
  /** The events that a kept candidate cites. */
  const takenEvents = new Set<string>();

  /** What the candidate repeats, in the order of the rules above, or null. */
  const duplicateOf = (
    candidate: NewFinding,
    tokens: Set<string>,
    urls: string[],
  ): DuplicateReason | null => {
    if (riskTokens.some((other) => jaccard(tokens, other) >= ACTIVE_RISK_THRESHOLD)) {
      return "active_risk";
    }
    if (priors.some((prior) => jaccard(tokens, prior.tokens) >= PRIOR_FINDING_THRESHOLD)) {
      return "earlier_finding";
    }
    if (
      priors.some(
        (prior) => prior.category === candidate.category && urls.some((url) => prior.urls.has(url)),
      )
    ) {
      return "same_source";
    }
    if (keptTokens.some((other) => jaccard(tokens, other) >= PRIOR_FINDING_THRESHOLD)) {
      return "same_run";
    }
    const cited = urls.map((url) => events.get(url));
    if (cited.length > 0 && cited.every((event) => event !== undefined && takenEvents.has(event))) {
      return "same_event";
    }
    return null;
  };

  for (const candidate of candidates) {
    const tokens = tokensOf(candidate);
    const urls = candidate.sources.map((source) => source.url);

    const reason = duplicateOf(candidate, tokens, urls);
    if (reason !== null) {
      if (report) report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
      continue;
    }

    kept.push(candidate);
    keptTokens.push(tokens);
    for (const url of urls) {
      const event = events.get(url);
      if (event !== undefined) takenEvents.add(event);
    }
  }

  return { kept, dropped: candidates.length - kept.length };
}
