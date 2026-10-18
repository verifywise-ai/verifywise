import { DEMOGRAPHIC_TERMS, findDemographicTerms } from "./demographicTerms";
import { findForbidden } from "../stance/vocabulary";

describe("findDemographicTerms", () => {
  it("finds affiliations, heritage languages, nationality and religion", () => {
    expect(findDemographicTerms("Society of Hispanic Professional Engineers")).toEqual([
      "hispanic",
    ]);
    expect(findDemographicTerms("Fluent in Tongan")).toEqual(["tongan"]);
    expect(findDemographicTerms("Born a Nigerian citizen")).toEqual(["nigerian"]);
    expect(findDemographicTerms("Usher at church")).toEqual(["church"]);
    expect(findDemographicTerms("Member, African-American chamber")).toContain("african american");
  });

  it("matches whole words and phrases, any case", () => {
    expect(findDemographicTerms("SPANISH")).toEqual(["spanish"]);
    expect(findDemographicTerms("Spanishtown Logistics")).toEqual([]);
    expect(findDemographicTerms("females")).toEqual([]);
  });

  it("leaves words with a common non-demographic sense alone", () => {
    for (const text of [
      "Lean Six Sigma black belt",
      "whiteboard sessions",
      "won the race to close the quarter",
      "tribal knowledge of the warehouse",
      "handled hotel reservations",
      "She led the team; Mr. Lee approved the budget",
    ]) {
      expect(findDemographicTerms(text)).toEqual([]);
    }
  });

  it("holds lowercase terms with no forbidden vocabulary", () => {
    for (const t of DEMOGRAPHIC_TERMS) expect(t).toBe(t.toLowerCase());
    expect(findForbidden(DEMOGRAPHIC_TERMS.join(" "))).toEqual([]);
  });
});
