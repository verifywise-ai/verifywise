import { REPEATED_QUERY_JACCARD, queryWords, similarity } from "../queryMatch";

describe("queryWords", () => {
  it("gives the lower-case words of a query, once each", () => {
    expect([...queryWords("Acme DATA breach, acme!")].sort()).toEqual(["acme", "breach", "data"]);
  });

  it("reads letters and digits in any script as words", () => {
    expect([...queryWords("Müller GmbH Datenschutz 2026")].sort()).toEqual([
      "2026",
      "datenschutz",
      "gmbh",
      "müller",
    ]);
  });

  it("treats the plural of a word as the word", () => {
    expect(queryWords("incidents breaches fines lawsuits vulnerabilities")).toEqual(
      queryWords("incident breach fine lawsuit vulnerability"),
    );
  });

  it("leaves a short word and a word ending in ss alone", () => {
    expect([...queryWords("AI bus class")].sort()).toEqual(["ai", "bus", "class"]);
  });

  it("is empty for a query with no letter or digit", () => {
    expect(queryWords("?! -- ...").size).toBe(0);
  });
});

describe("similarity", () => {
  const between = (a: string, b: string) => similarity(queryWords(a), queryWords(b));

  it("is 1 for the same words in any order, case and punctuation", () => {
    expect(between("Acme data breach", "breach, DATA acme")).toBe(1);
  });

  it("is the share of the words that two queries have in common", () => {
    expect(between("Acme data breach", "Acme lawsuit")).toBeCloseTo(1 / 4);
    expect(between("a b c d e", "a b c d e f")).toBeCloseTo(5 / 6);
  });

  it("is 0 for queries with nothing in common, and for two queries with no words", () => {
    expect(between("Acme breach", "Globex lawsuit")).toBe(0);
    expect(between("???", "...")).toBe(0);
  });

  it("is at or above the threshold for a query with one word added to five", () => {
    expect(between("a b c d e", "a b c d e f")).toBeGreaterThanOrEqual(REPEATED_QUERY_JACCARD);
    expect(between("a b c d", "a b c d e")).toBeCloseTo(0.8);
    expect(between("a b c d", "a b c d e")).toBeGreaterThanOrEqual(REPEATED_QUERY_JACCARD);
  });

  it("is below the threshold for a query with a different word in four", () => {
    expect(between("Acme data breach 2026", "Acme data breach 2025")).toBeLessThan(
      REPEATED_QUERY_JACCARD,
    );
  });
});
