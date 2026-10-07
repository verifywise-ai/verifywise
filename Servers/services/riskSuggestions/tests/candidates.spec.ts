import { MIT_CANDIDATE_LIMIT, rankCatalogCandidates, tokenizeUseCaseText } from "../candidates";
import { MIT_RISK_CATALOG } from "../../../structures/risk-catalogs/mit";

const HIRING_USE_CASE = [
  "Resume screening assistant for hiring.",
  "Automates candidate screening and ranking of job applicants.",
  "Large language model trained on historical hiring decisions and employee data;",
  "must avoid biased outcomes.",
].join(" ");

describe("rankCatalogCandidates", () => {
  it("surfaces relevant MIT entries for a realistic use case", () => {
    const ranked = rankCatalogCandidates(MIT_RISK_CATALOG, HIRING_USE_CASE);
    const ids = new Set(ranked.map((entry) => entry.id));

    // Entries whose summaries share vocabulary with the use case must outrank
    // the catalog's bulk.
    expect(ids.has(262)).toBe(true); // "Biased AI decisions require data preprocessing"
    const biasRelated = [7, 8, 33, 70].filter((id) => ids.has(id));
    expect(biasRelated.length).toBeGreaterThan(0);
  });

  it("respects the top-N bound and is deterministic", () => {
    const first = rankCatalogCandidates(MIT_RISK_CATALOG, HIRING_USE_CASE);
    const second = rankCatalogCandidates(MIT_RISK_CATALOG, HIRING_USE_CASE);

    expect(first.length).toBe(MIT_CANDIDATE_LIMIT);
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
  });

  it("returns the first N entries by id for empty input instead of crashing", () => {
    const ranked = rankCatalogCandidates(MIT_RISK_CATALOG, "");

    expect(ranked.length).toBe(MIT_CANDIDATE_LIMIT);
    expect(ranked.map((entry) => entry.id)).toEqual(
      [...ranked.map((entry) => entry.id)].sort((a, b) => a - b),
    );
  });

  it("honours a custom limit", () => {
    expect(rankCatalogCandidates(MIT_RISK_CATALOG, HIRING_USE_CASE, 5).length).toBe(5);
  });
});

describe("tokenizeUseCaseText", () => {
  it("lowercases, strips punctuation, and drops stop words and short tokens", () => {
    const tokens = tokenizeUseCaseText("The AI system, using data, screens candidates!");

    expect(tokens.has("ai")).toBe(false); // length <= 2
    expect(tokens.has("the")).toBe(false); // stop word
    expect(tokens.has("using")).toBe(false); // stop word
    expect(tokens.has("screens")).toBe(true);
    expect(tokens.has("candidates")).toBe(true);
  });
});
