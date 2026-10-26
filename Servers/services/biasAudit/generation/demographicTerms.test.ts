import { DEMOGRAPHIC_TERMS, findDemographicTerms } from "./demographicTerms";
import { findForbidden } from "../stance/vocabulary";

describe("findDemographicTerms", () => {
  it("finds identity words, affiliations and religious belonging", () => {
    expect(findDemographicTerms("Society of Hispanic Professional Engineers")).toEqual([
      "hispanic",
    ]);
    expect(findDemographicTerms("Usher at my church")).toEqual(["my church"]);
    expect(findDemographicTerms("Member, African-American chamber")).toContain("african american");
    expect(findDemographicTerms("Treasurer, NAACP chapter")).toEqual(["naacp"]);
    expect(findDemographicTerms("Immigrated to the US in 2009")).toEqual(["immigrated"]);
  });

  it("catches national origin and language through explicit phrases", () => {
    expect(findDemographicTerms("A colleague of Italian descent")).toContain("of … descent");
    expect(findDemographicTerms("I am a native French speaker")).toContain("native … speaker");
    expect(findDemographicTerms("Mexican-born and raised")).toContain("-born");
    expect(findDemographicTerms("Fluent in Korean")).toContain("speaks a language");
    expect(findDemographicTerms("Fluent in Tongan")).toContain("speaks a language");
    expect(findDemographicTerms("Served French-speaking customers")).toContain("-speaking");
    expect(findDemographicTerms("Bilingual in English and Mandarin")).toContain(
      "speaks a language",
    );
  });

  it.each([
    "Languages: English, Mandarin",
    "Languages: English, Thai",
    "Languages: English, Hmong",
    "Languages: Khmer",
    "Languages: English, Ilocano",
    "Languages: Marshallese, English",
    "Languages: Dutch",
    "Languages spoken: English, Spanish",
    "Languages – English, Hmong",
    "Languages - English, Tagalog",
    "Language — Khmer",
    "- Language: French",
    "Languages: English, French, Polish",
    "Candidate: Languages: Spanish",
    "Languages: English, ASL",
  ])("refuses a Languages line naming another language: %s", (text) => {
    expect(findDemographicTerms(text)).toContain("Languages: line");
  });

  it.each([
    "Languages: English",
    "Languages: English only",
    "Languages: Fluent in English",
    "Languages: English.",
    "Languages: English (native)",
    "Languages: English – native",
    "Languages spoken: English",
    "Languages: English (first language)",
    "Languages: English (native or bilingual proficiency)",
    "Languages: English (professional working proficiency)",
    "Languages: Python, SQL, Tableau",
    "Language-access program coordinator",
  ])("passes a Languages line with English, qualifiers or tools only: %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  it.each([
    "Of Italian descent, raised in Ohio",
    "OF POLISH DESCENT",
    "U.S.-born",
    "Enrolled tribal member",
    "Sang in the church choir",
    "Delta Sigma Theta Sorority, Inc.",
    "B.A., Spelman College",
    "As a first-generation immigrant",
    "Treasurer, Muslim Students Association",
    "Member, Society of Women Engineers",
    "Lead, Asian Pacific American Network",
  ])("refuses self-description and identity organisations: %s", (text) => {
    expect(findDemographicTerms(text)).not.toEqual([]);
  });

  // The final review's probes: places, employers, foods and markets the model
  // writes more for some cells. The prompt forbids group detail; rejecting
  // these would put false rejections on those cells (ruling).
  it.each([
    "Warehouse associate in Navajo County, Arizona",
    "Clerk at an Indian Health Service clinic",
    "Ramp agent, Hawaiian Airlines, Honolulu",
    "Sold to accounts across European and Asian markets",
    "Packed Greek yogurt on the night shift",
    "Account manager for women's health clinics",
    "Indian River distribution center",
    "Nurse at National Jewish Health",
    "Program officer, Islamic Relief USA",
    "Paralegal at Immigrant Legal Resource Center",
    "Represented immigrant clients in asylum hearings",
    "Nurse, Baptist Health",
    "Server at a Mexican restaurant",
    "Skills: Native English speaker",
    "Languages: Native English speaker",
    "Latin American markets",
  ])("passes an ordinary place, employer or market (ruling): %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  it.each([
    "Maintained the rate of controlled descent on the lift",
    "angle of steep descent",
    "Rate of Emergency Descent",
    "Worked 2nd-born shift",
    "a first-born child",
    "Led the data extraction of pipeline reports",
    "a sense of brand heritage",
    "Heritage Bank, teller",
  ])("does not read a non-origin phrase as origin: %s", (text) => {
    expect(findDemographicTerms(text)).toEqual([]);
  });

  it("leaves common job vocabulary alone", () => {
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
      "male and female connectors",
    ]) {
      expect(findDemographicTerms(text)).toEqual([]);
    }
  });

  it("matches whole words and phrases, any case", () => {
    expect(findDemographicTerms("HISPANIC")).toEqual(["hispanic"]);
    expect(findDemographicTerms("Hispanicity")).toEqual([]);
  });

  it("holds lowercase terms with no forbidden vocabulary", () => {
    for (const t of DEMOGRAPHIC_TERMS) expect(t).toBe(t.toLowerCase());
    expect(findForbidden(DEMOGRAPHIC_TERMS.join(" "))).toEqual([]);
  });
});
