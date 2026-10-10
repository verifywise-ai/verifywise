import { jaccard, tokenise } from "../textSimilarity";

describe("tokenise", () => {
  it("lower-cases, splits on whitespace and drops tokens of two characters or fewer", () => {
    expect([...tokenise("Vendor holds PII at rest")].sort()).toEqual([
      "holds",
      "pii",
      "rest",
      "vendor",
    ]);
  });

  it("treats everything except letters, digits and spaces as a separator", () => {
    expect([...tokenise("Data-breach, PII! (GDPR/ISO27001)")].sort()).toEqual([
      "breach",
      "data",
      "gdpr",
      "iso27001",
      "pii",
    ]);
  });

  it("keeps each distinct word once", () => {
    expect([...tokenise("Data DATA data")]).toEqual(["data"]);
  });

  it("returns an empty set when no token is longer than two characters", () => {
    expect(tokenise("").size).toBe(0);
    expect(tokenise("it is an ok").size).toBe(0);
  });
});

describe("jaccard", () => {
  it("is the share of the union that both sets hold", () => {
    expect(jaccard(new Set(["aaa", "bbb"]), new Set(["bbb", "ccc"]))).toBeCloseTo(1 / 3);
  });

  it("is 0 when either set is empty", () => {
    expect(jaccard(new Set(["aaa"]), new Set())).toBe(0);
    expect(jaccard(new Set(), new Set(["aaa"]))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("is 1 for identical sets", () => {
    expect(jaccard(new Set(["aaa"]), new Set(["aaa"]))).toBe(1);
  });

  it("is 0 for disjoint sets", () => {
    expect(jaccard(new Set(["aaa", "bbb"]), new Set(["ccc", "ddd"]))).toBe(0);
  });

  it("does not depend on argument order", () => {
    const a = new Set(["aaa", "bbb", "ccc"]);
    const b = new Set(["bbb", "ccc", "ddd", "eee"]);
    expect(jaccard(a, b)).toBeCloseTo(2 / 5);
    expect(jaccard(b, a)).toBe(jaccard(a, b));
  });
});
