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
    expect(findDemographicTerms("A colleague of Italian descent")).toContain("of … descent");
    expect(findDemographicTerms("I am a native French speaker")).toContain("native … speaker");
    expect(findDemographicTerms("Mexican-born and raised")).toContain("-born");
    expect(findDemographicTerms("Fluent in Korean")).toContain("speaks a language");
    expect(findDemographicTerms("Served French-speaking customers")).toContain("-speaking");
    expect(findDemographicTerms("Bilingual in English and Mandarin")).toContain(
      "speaks a language",
    );
  });

  // The review's probes (round 3).
  it.each([
    "Mexican citizen with a US work permit",
    "Volunteer at the Korean Community Center",
    "Chinese-American Association member",
    "Indian Students Association",
    "Hawaiian Civic Club",
    "Grew up in a Catholic parish",
    "mexican-born",
    "Languages: English, Mandarin",
    "Korean-American",
    "Latin American markets",
  ])("refuses national origin, religion or language: %s", (text) => {
    expect(findDemographicTerms(text)).not.toEqual([]);
  });

  // The review's probes (round 5).
  it.each([
    "Maintained the rate of controlled descent on the lift",
    "angle of steep descent",
    "Languages: English only",
    "Languages: Fluent in English",
    "Languages: English.",
    "Languages: English \u2013 native",
    "Languages: Python, SQL",
    "Language-access program coordinator",
    "Worked 2nd-born shift",
  ])("passes (round 5): %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  // Parked from Task 5 (must fix before merge): languages missing from the
  // name list, and the "spoken" and dash forms of the line.
  it.each([
    "Languages: English, Thai",
    "Languages: English, Hmong",
    "Languages: Khmer",
    "Languages: English, Ilocano",
    "Languages: Marshallese, English",
    "Languages: Dutch",
    "Languages spoken: English, Spanish",
    "Languages spoken: English, Thai",
    "Languages \u2013 English, Hmong",
    "Languages - English, Tagalog",
    "Language \u2014 Khmer",
  ])("refuses a Languages line naming another language: %s", (text) => {
    expect(findDemographicTerms(text)).not.toEqual([]);
  });

  it.each([
    "Languages spoken: English",
    "Languages \u2013 English (native)",
    "Languages: English (professional working proficiency)",
    "Languages: Python, SQL, Excel",
  ])("passes a Languages line with English, qualifiers or tools only: %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  it.each(["Candidate: Languages: Spanish", "Languages: English, Italian", "Of Italian descent"])(
    "still refuses (round 5): %s",
    (text) => {
      expect(findDemographicTerms(text)).not.toEqual([]);
    },
  );

  // The review's probes (round 4).
  it.each([
    "Of Italian descent, raised in Ohio",
    "of Italian descent",
    "OF POLISH DESCENT",
    "Languages: English, Italian",
    "Languages: English, French, Polish",
    "- Language: French",
    "Member of the Cherokee Nation",
    "U.S.-born",
    "Server at a Mexican restaurant",
    "Ramp agent, Hawaiian Airlines",
    "Nurse, Baptist Health",
  ])("refuses (round 4): %s", (text) => {
    expect(findDemographicTerms(text)).not.toEqual([]);
  });

  it.each([
    "Rate of Emergency Descent",
    "Languages: English",
    "Languages: English (native)",
    "a first-born child",
  ])("passes (round 4): %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  it.each([
    "Led the data extraction of pipeline reports",
    "a history of oil extraction",
    "the value of data extraction",
    "a sense of brand heritage",
    "a first-born child",
  ])("does not read a non-origin phrase as origin: %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
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
