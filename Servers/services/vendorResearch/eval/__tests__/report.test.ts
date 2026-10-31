import { classify, formatReport, type CaseReport } from "../report";
import type { CaseScore } from "../scorer";

const SCORE: CaseScore = {
  kept: 1,
  matched: 1,
  expected: 1,
  recalled: 1,
  precision: 1,
  recall: 1,
  citationsRejected: 0,
  candidatesRejected: 0,
  irrelevantSources: 4,
  duplicateSources: 0,
  badUrls: 0,
  datedWebResults: 0,
  snippetOnlyFindings: 0,
  overconfident: 0,
  mislabelled: 0,
  duplicateClusters: 0,
  sources: 6,
  searches: 3,
  reads: 2,
  modelCalls: 5,
  ms: 12,
  tokens: 3400,
};

const report = (partial: Partial<CaseReport>): CaseReport => ({
  id: "a-case",
  title: "A case",
  score: SCORE,
  missed: [],
  gaps: {},
  ...partial,
});

describe("classify", () => {
  it("is clean when the targets that are missed are exactly the gaps that are declared", () => {
    expect(
      classify(report({ missed: ["maxIrrelevantSources"], gaps: { maxIrrelevantSources: 4 } })),
    ).toEqual({
      regressions: [],
      fixed: [],
      open: ["maxIrrelevantSources"],
    });
  });

  it("calls a missed target that is not a declared gap a regression", () => {
    expect(classify(report({ missed: ["maxKept"], gaps: {} })).regressions).toEqual(["maxKept"]);
  });

  it("calls a declared gap that is met a fixed one, to be removed from the case", () => {
    expect(classify(report({ missed: [], gaps: { maxBadUrls: 7 } })).fixed).toEqual(["maxBadUrls"]);
  });
});

describe("formatReport", () => {
  it("writes one line per case with the measures a person reads first", () => {
    const text = formatReport([report({})]);

    expect(text).toContain("a-case");
    expect(text).toMatch(/precision 1\.00/);
    expect(text).toMatch(/recall 1\.00/);
    expect(text).toMatch(/kept 1/);
    expect(text).toMatch(/irrelevant 4/);
    expect(text).toMatch(/tokens 3400/);
  });

  it("writes the mislabelled count after overconfident", () => {
    const text = formatReport([report({ score: { ...SCORE, overconfident: 2, mislabelled: 3 } })]);

    expect(text).toMatch(/snippet-only 0, overconfident 2, mislabelled 3, cluster repeats 0/);
  });

  it("writes a dash for a measure that is not defined", () => {
    const text = formatReport([report({ score: { ...SCORE, precision: null, recall: null } })]);

    expect(text).toMatch(/precision -/);
    expect(text).toMatch(/recall -/);
  });

  it("names the open gaps with the idea that is meant to close them, and flags regressions and stale gaps", () => {
    const text = formatReport([
      report({ id: "open", missed: ["maxIrrelevantSources"], gaps: { maxIrrelevantSources: 4 } }),
      report({ id: "broken", missed: ["maxKept"] }),
      report({ id: "stale", gaps: { maxBadUrls: 7 } }),
    ]);

    expect(text).toMatch(/open[\s\S]*gap maxIrrelevantSources \(idea 4\)/);
    expect(text).toMatch(/broken[\s\S]*REGRESSION maxKept/);
    expect(text).toMatch(/stale[\s\S]*FIXED maxBadUrls \(idea 7\): remove it from gaps/);
  });

  it("ends with the totals of the run", () => {
    const text = formatReport([report({ id: "one" }), report({ id: "two", missed: ["maxKept"] })]);

    expect(text).toMatch(/2 cases, 1 regression, 0 fixed gaps/);
  });
});
