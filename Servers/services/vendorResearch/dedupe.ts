/**
 * De-duplication of the findings of a run, so that the register and the list of findings do not
 * collect the same risk again and again, and so that a dismissed finding does not come back when
 * the vendor is researched again.
 *
 * "The same" is measured on the words of the description and the impact together, with the Jaccard
 * score of the tokeniser the vendor risk suggestions use. The thresholds are lower against the
 * register, where the wording of a person is compared with the wording of a model, than against
 * earlier findings, where the wording is the model's own.
 */
import { IVendorRiskFinding, NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import { jaccard, tokenise } from "../vendors/textSimilarity";

/** A candidate this similar to an active risk of the vendor is dropped. */
export const ACTIVE_RISK_THRESHOLD = 0.25;
/** A candidate this similar to an earlier finding of the vendor, or to a kept one of its run, is dropped. */
export const PRIOR_FINDING_THRESHOLD = 0.4;

/**
 * What is compared. The two texts of a register risk are nullable columns, though the type of a
 * risk says string, so a missing one counts as no words rather than as the word "null".
 */
interface Described {
  risk_description: string | null;
  impact_description: string | null;
}

const tokensOf = (finding: Described) =>
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
 *
 * `dropped` counts every removal. The candidates that stay keep their order.
 */
export function dropDuplicates(
  candidates: NewFinding[],
  existingRisks: Described[],
  priorFindings: Array<
    Pick<IVendorRiskFinding, "category" | "risk_description" | "impact_description" | "sources">
  >,
): { kept: NewFinding[]; dropped: number } {
  const riskTokens = existingRisks.map(tokensOf);
  const priors = priorFindings.map((finding) => ({
    category: finding.category,
    tokens: tokensOf(finding),
    urls: new Set(finding.sources.map((source) => source.url)),
  }));

  const kept: NewFinding[] = [];
  const keptTokens: Array<Set<string>> = [];

  for (const candidate of candidates) {
    const tokens = tokensOf(candidate);
    const urls = candidate.sources.map((source) => source.url);

    const isDuplicate =
      riskTokens.some((other) => jaccard(tokens, other) >= ACTIVE_RISK_THRESHOLD) ||
      priors.some(
        (prior) =>
          jaccard(tokens, prior.tokens) >= PRIOR_FINDING_THRESHOLD ||
          (prior.category === candidate.category && urls.some((url) => prior.urls.has(url))),
      ) ||
      keptTokens.some((other) => jaccard(tokens, other) >= PRIOR_FINDING_THRESHOLD);
    if (isDuplicate) continue;

    kept.push(candidate);
    keptTokens.push(tokens);
  }

  return { kept, dropped: candidates.length - kept.length };
}
