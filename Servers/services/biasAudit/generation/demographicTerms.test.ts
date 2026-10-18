import { DEMOGRAPHIC_TERMS, findDemographicTerms } from "./demographicTerms";
import { findForbidden } from "../stance/vocabulary";

describe("findDemographicTerms", () => {
  it("finds affiliations, heritage languages, nationality and religion", () => {
    expect(findDemographicTerms("Society of Hispanic Professional Engineers")).toEqual([
      "hispanic",
    ]);
    expect(findDemographicTerms("Fluent in Tongan")).toContain("tongan");
    expect(findDemographicTerms("Born a Nigerian citizen")).toEqual(["nigerian"]);
    expect(findDemographicTerms("Usher at my church")).toEqual(["my church"]);
    expect(findDemographicTerms("Member, African-American chamber")).toContain("african american");
  });

  it("catches national origin and language through explicit phrases (ruling)", () => {
    expect(findDemographicTerms("A colleague of Italian descent")).toEqual(["of … descent"]);
    expect(findDemographicTerms("I am a native French speaker")).toContain("native … speaker");
    expect(findDemographicTerms("Mexican-born and raised")).toEqual(["-born"]);
    expect(findDemographicTerms("Fluent in Korean")).toEqual(["speaks a language"]);
    expect(findDemographicTerms("Served French-speaking customers")).toEqual(["-speaking"]);
    expect(findDemographicTerms("Bilingual in English and Mandarin")).toContain(
      "speaks a language",
    );
  });

  it("leaves common job vocabulary alone (ruling)", () => {
    for (const text of [
      "cleaned and polish floors",
      "accounts running Apache Kafka",
      "Sioux Falls",
      "served French fries and Italian sodas",
      "worked the kosher line",
      "Lean Six Sigma black belt",
      "whiteboard sessions",
      "won the race to close the quarter",
      "tribal knowledge of the warehouse",
      "handled hotel reservations",
      "proficient in Excel and Salesforce",
      "a shipment of uncertain origin",
      "She led the team; Mr. Lee approved the budget",
    ]) {
      expect(findDemographicTerms(text)).toEqual([]);
    }
  });

  it("matches whole words and phrases, any case", () => {
    expect(findDemographicTerms("SPANISH")).toEqual(["spanish"]);
    expect(findDemographicTerms("Spanishtown Logistics")).toEqual([]);
    expect(findDemographicTerms("females")).toEqual([]);
  });

  it("holds lowercase terms with no forbidden vocabulary", () => {
    for (const t of DEMOGRAPHIC_TERMS) expect(t).toBe(t.toLowerCase());
    expect(findForbidden(DEMOGRAPHIC_TERMS.join(" "))).toEqual([]);
  });
});
