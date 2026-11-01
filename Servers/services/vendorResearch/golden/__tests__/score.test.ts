import type {
  CoverageSource,
  FindingSource,
  RunCoverage,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import fs from "fs";
import path from "path";
import { CREDIBILITY_PROMPT_VERSION } from "../../prompts";
import {
  checkGoldenLabels,
  formatGoldenReport,
  GOLDEN_BARS,
  meetsBars,
  scoreGoldenSet,
} from "../score";
import type { GoldenFinding, GoldenLabels, GoldenRun, GoldenVendor } from "../types";

const page = (url: string): FindingSource => ({
  url,
  title: "A page",
  quote: "A quote.",
  published_at: null,
});

/** The record of a sanctions list, as a run of the vendor risk database stores it. */
const ofacRecord: FindingSource = {
  url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=31001",
  title: "OFAC SDN list",
  quote: "Organization Established Date 2017",
  published_at: null,
  category: "official",
  publisher: "ofac",
  record: { source_id: "ofac", record_id: 3101, status: "active", match_strength: "weak" },
};

const finding = (partial: Partial<GoldenFinding> = {}): GoldenFinding => ({
  category: "security_incidents",
  risk_description: "Acme disclosed a breach of its customer database.",
  credibility: "high",
  sources: [page("https://news.example/acme-breach")],
  ...partial,
});

const list = (id: CoverageSource["id"]): CoverageSource => ({
  id,
  name: id,
  attribution: id,
  mode: "mirror",
  checked: true,
  outcome: "none",
  strong: 0,
  weak: 0,
  last_success_at: "2026-10-30T09:23:00.000Z",
  stale: false,
});

const COVERAGE: RunCoverage = {
  registry_version: "sr-2",
  sources: [list("kev"), list("ofac"), list("uk_sanctions"), list("eu_fsf")],
  lookups: [{ id: "nvd", outcome: "none" }],
  cited: { official: 0, trusted_press: 1, vendor: 0, unverified: 0 },
};

/** The one run of a vendor, on the vendor row `vendor`: a run of the credibility prompt. */
const run = (vendor: number, findings: GoldenFinding[]): GoldenRun => ({
  vendorId: vendor,
  earlier: 0,
  promptVersion: CREDIBILITY_PROMPT_VERSION,
  findings,
  coverage: COVERAGE,
});

const ACME: GoldenVendor = {
  profile: 5,
  vendorId: 1,
  name: "Acme",
  expected: [{ category: "security_incidents", anyOf: ["breach"], label: "high" }],
  traps: [],
};

const BETA: GoldenVendor = { ...ACME, vendorId: 2, name: "Beta", profile: 6 };

describe("scoreGoldenSet", () => {
  it("precision and recall count matches by category and words", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [
        { category: "security_incidents", anyOf: ["breach"], label: "high" },
        { category: "availability", anyOf: ["outage"], label: "medium" },
      ],
    };
    const runs = [
      run(1, [
        finding(),
        // The words of the breach, but another category: no match.
        finding({ category: "legal_regulatory", risk_description: "A breach led to a lawsuit." }),
        // A category the labeller expects, but none of its words.
        finding({ category: "availability", risk_description: "The vendor raised its prices." }),
        finding({ category: "availability", risk_description: "A two-day OUTAGE of the API." }),
      ]),
    ];

    const report = scoreGoldenSet([vendor], runs);

    expect(report.totals).toMatchObject({ findings: 4, matched: 2, expected: 2, recalled: 2 });
    expect(report.totals.precision).toBe(0.5);
    expect(report.totals.recall).toBe(1);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatchObject({
      vendorId: 1,
      name: "Acme",
      profile: 5,
      run: { findings: 4, matched: 2, expected: 2, recalled: 2 },
    });
  });

  it("sums the runs of the vendors that have one", () => {
    const report = scoreGoldenSet(
      [ACME, BETA],
      [run(1, [finding()]), run(2, [finding(), finding({ category: "availability" })])],
    );

    expect(report.totals).toMatchObject({ findings: 3, matched: 2, expected: 2, recalled: 2 });
    expect(report.totals.precision).toBeCloseTo(2 / 3);
    expect(report.lines.map((line) => line.vendorId)).toEqual([1, 2]);
  });

  it("scores one run per vendor: there is no run with a flag off, and no baseline", () => {
    const report = scoreGoldenSet([ACME], [run(1, [finding()])]);

    expect(report).not.toHaveProperty("off");
    expect(report).not.toHaveProperty("on");
    expect(report).not.toHaveProperty("baselineAgreement");
    expect(report.lines[0]).not.toHaveProperty("off");
    expect(report.lines[0]).not.toHaveProperty("vendorIds");
  });

  it("label agreement counts only matched findings, by the credibility the run stored", () => {
    const runs = [
      run(1, [
        finding({ credibility: "high" }),
        finding({ credibility: "medium", risk_description: "Acme's breach notice was late." }),
        // Not matched: its label is not compared, whatever it is.
        finding({ category: "certifications", credibility: "low", risk_description: "No ISO." }),
      ]),
    ];

    const report = scoreGoldenSet([ACME], runs);

    expect(report.compared).toBe(2);
    expect(report.agreed).toBe(1);
    expect(report.agreement).toBe(0.5);
  });

  it("a finding without a label never agrees with the labeller's", () => {
    const report = scoreGoldenSet([ACME], [run(1, [finding({ credibility: null })])]);

    expect(report.compared).toBe(1);
    expect(report.agreed).toBe(0);
  });

  it("a High that the labeller rates Low fails the bars", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [{ category: "security_incidents", anyOf: ["breach"], label: "low" }],
    };

    const report = scoreGoldenSet([vendor], [run(1, [finding({ credibility: "high" })])]);

    expect(report.highRatedLow).toEqual([
      { vendorId: 1, name: "Acme", finding: "Acme disclosed a breach of its customer database." },
    ]);
    const verdict = meetsBars(report);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain("1 finding labelled High is Low for the labeller");
  });

  it('a finding that cites a sanctions entry matched by name only is listed unless it says "An entity named … is on …"', () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [{ category: "legal_regulatory", anyOf: ["OFAC"], label: "low" }],
    };
    const asFact = "Acme is sanctioned by OFAC.";
    // "named" alone is no proof: this wording states the match as a fact.
    const namedAsFact = "The vendor, named Acme Limited, is sanctioned by OFAC.";
    const otherWording = "A company called Acme Limited is on the OFAC list.";
    const legal = (description: string, sources: FindingSource[] = [ofacRecord]) =>
      finding({
        category: "legal_regulatory",
        credibility: "low",
        risk_description: description,
        sources,
      });
    const runs = [
      run(1, [
        legal(asFact),
        legal(namedAsFact),
        legal(otherWording),
        legal("An entity named Acme Limited is on the OFAC SDN list; it may not be the vendor."),
        // A match by the vendor's verified website is about the vendor: no wording is asked of it.
        legal("Acme is designated on the UK Sanctions List.", [
          {
            ...ofacRecord,
            publisher: "uk_sanctions",
            record: {
              source_id: "uk_sanctions",
              record_id: 3102,
              status: "active",
              match_strength: "strong",
            },
          },
        ]),
        // Sanctions words without a record of a list: the press, not a match of a list.
        finding({
          category: "legal_regulatory",
          credibility: "medium",
          risk_description: "Reuters reports that OFAC sanctioned Acme's parent.",
        }),
      ]),
    ];

    const report = scoreGoldenSet([vendor], runs);

    expect(report.sanctionsAsFact.map((item) => item.finding)).toEqual([
      asFact,
      namedAsFact,
      otherWording,
    ]);
    expect(meetsBars(report).reasons).toContain(
      '3 sanctions findings do not say "An entity named … is on …" of an entry matched by name only',
    );
  });

  it("a trap that appears counts as a false positive", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      // The breach of Acme Bank, another company of the vendor's name, must not appear, though it
      // has the words of the vendor's own breach.
      expected: [{ category: "security_incidents", anyOf: ["breach", "Acme"], label: "high" }],
      traps: [{ anyOf: ["Acme Bank"] }],
    };
    const trap = finding({
      risk_description: "Acme Bank disclosed a breach of its customer database.",
    });

    const report = scoreGoldenSet([vendor], [run(1, [finding(), trap])]);

    expect(report.totals).toMatchObject({ findings: 2, matched: 1, traps: 1 });
    expect(report.totals.precision).toBe(0.5);
    // A trap is never a match, so its label is not compared either.
    expect(report.compared).toBe(1);
    expect(report.lines[0].run?.traps).toBe(1);
  });

  it("takes a vendor's run from its own vendor row only", () => {
    // The run of another vendor's row is not the vendor's run.
    const report = scoreGoldenSet([ACME], [run(2, [finding()])]);

    expect(report.lines[0].run).toBeNull();
    expect(report.missingRuns).toEqual([{ vendorId: 1, name: "Acme" }]);
    expect(report.totals.findings).toBe(0);
  });

  it("lists a run that followed earlier findings or risks of its vendor row, and misses the bar", () => {
    const report = scoreGoldenSet([ACME], [{ ...run(1, [finding()]), earlier: 3 }]);

    expect(report.afterEarlier).toEqual([{ vendorId: 1, name: "Acme", earlier: 3 }]);
    expect(meetsBars(report).reasons).toEqual([
      "1 run was compared with earlier findings or risks of its vendor row, which hid what it found (Acme): research each vendor on a fresh vendor row",
    ]);
  });

  it("a vendor without coverage fails the coverage bar", () => {
    const runs = [run(1, [finding()]), { ...run(2, [finding()]), coverage: null }];

    const report = scoreGoldenSet([ACME, BETA], runs);

    expect(report.coverageMissing).toEqual([{ vendorId: 2, name: "Beta" }]);
    const verdict = meetsBars(report);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["1 vendor has no coverage (Beta)"]);
  });
});

describe("meetsBars", () => {
  it("has a bar on precision and on label agreement only", () => {
    expect(GOLDEN_BARS).toEqual({ precision: 0.9, agreement: 0.8 });
  });

  it("passes a set that meets every bar", () => {
    const report = scoreGoldenSet([ACME], [run(1, [finding()])]);

    expect(meetsBars(report)).toEqual({ ok: true, reasons: [] });
  });

  it("names every bar that is missed", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [
        { category: "security_incidents", anyOf: ["breach"], label: "medium" },
        { category: "availability", anyOf: ["outage"], label: "medium" },
      ],
    };
    const runs = [
      run(1, [
        finding({ credibility: "high" }),
        finding({ category: "ai_specific", risk_description: "Trains on data." }),
      ]),
    ];

    const verdict = meetsBars(scoreGoldenSet([vendor], runs));

    expect(verdict.ok).toBe(false);
    // Recall is 0.50 too, and is not a bar.
    expect(verdict.reasons).toEqual([
      "precision 0.50, below 0.90",
      "label agreement 0 %, below 80 %",
    ]);
  });

  it("reports recall and sets no bar on it", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [
        { category: "security_incidents", anyOf: ["breach"], label: "high" },
        { category: "availability", anyOf: ["outage"], label: "medium" },
        { category: "financial_health", anyOf: ["layoffs"], label: "medium" },
      ],
    };

    const report = scoreGoldenSet([vendor], [run(1, [finding()])]);

    expect(report.totals.recall).toBeCloseTo(1 / 3);
    expect(meetsBars(report)).toEqual({ ok: true, reasons: [] });
  });

  it("meets the precision bar at 0.9 and misses it below", () => {
    const stray = finding({ category: "availability", risk_description: "A stray finding." });
    const nine = Array.from({ length: 9 }, () => finding());

    // 9 of 10 findings match.
    expect(meetsBars(scoreGoldenSet([ACME], [run(1, [...nine, stray])]))).toEqual({
      ok: true,
      reasons: [],
    });
    // 9 of 11 do not.
    expect(meetsBars(scoreGoldenSet([ACME], [run(1, [...nine, stray, stray])])).reasons).toEqual([
      "precision 0.82, below 0.90",
    ]);
  });

  it("meets the agreement bar at 80 % and misses it below", () => {
    const high = finding({ credibility: "high" });
    const medium = finding({ credibility: "medium" });

    // 4 of 5 labels agree.
    expect(meetsBars(scoreGoldenSet([ACME], [run(1, [high, high, high, high, medium])]))).toEqual({
      ok: true,
      reasons: [],
    });
    // 3 of 5 do not.
    expect(
      meetsBars(scoreGoldenSet([ACME], [run(1, [high, high, high, medium, medium])])).reasons,
    ).toEqual(["label agreement 60 %, below 80 %"]);
  });

  it("a run that matches no labelled risk has no label to compare, and fails", () => {
    const report = scoreGoldenSet([ACME], [run(1, [])]);

    expect(report.agreement).toBeNull();
    expect(meetsBars(report).reasons).toEqual([
      "no finding matched a labelled risk, so no label was compared",
    ]);
  });

  it("a vendor without a completed run fails", () => {
    const report = scoreGoldenSet([ACME, BETA], [run(1, [finding()])]);

    expect(report.missingRuns).toEqual([{ vendorId: 2, name: "Beta" }]);
    expect(meetsBars(report).reasons).toEqual(["1 vendor has no completed run (Beta)"]);
  });

  it("names the vendors that have no completed run", () => {
    const gamma: GoldenVendor = { ...ACME, vendorId: 3, name: "Gamma", profile: 7 };

    const report = scoreGoldenSet([ACME, BETA, gamma], [run(1, [finding()])]);

    expect(meetsBars(report).reasons).toEqual(["2 vendors have no completed run (Beta, Gamma)"]);
  });

  it("a run whose lists could not be checked fails the coverage bar", () => {
    const failed: RunCoverage = {
      ...COVERAGE,
      sources: [{ ...list("kev"), checked: false, outcome: "failed" }, list("ofac")],
    };

    const report = scoreGoldenSet([ACME], [{ ...run(1, [finding()]), coverage: failed }]);

    expect(report.coverageFailed).toEqual([{ vendorId: 1, name: "Acme", sources: ["kev"] }]);
    expect(meetsBars(report).reasons).toEqual([
      "1 vendor's run could not check every list (Acme: kev)",
    ]);
  });

  it("an empty set fails", () => {
    expect(meetsBars(scoreGoldenSet([], [])).reasons).toEqual(["no labelled vendor"]);
  });
});

describe("checkGoldenLabels", () => {
  const file = (vendors: unknown[]) => ({
    organizationId: 1,
    labelledBy: "A. Person",
    labelledOn: "2026-11-02",
    vendors,
  });

  it("accepts a filled file", () => {
    const labels = file([ACME]);

    expect(checkGoldenLabels(labels)).toEqual({ labels, problems: [] });
  });

  it("names what a person must still fill in", () => {
    const result = checkGoldenLabels({
      organizationId: 0,
      labelledBy: "",
      labelledOn: "soon",
      vendors: [
        {
          profile: 25,
          vendorId: 0,
          name: "Acme",
          expected: [{ category: "rumours", anyOf: [], label: "certain" }],
          traps: [{ anyOf: [""] }],
        },
        { ...ACME },
        { ...ACME, profile: 6 },
      ],
    });

    expect(result.labels).toBeNull();
    expect(result.problems).toEqual([
      "organizationId must be a positive whole number",
      "labelledBy must name the person who labelled",
      "labelledOn must be a day (YYYY-MM-DD)",
      "vendors[0].profile must be one of 1 to 24",
      "vendors[0].vendorId must be a positive whole number",
      "vendors[0].expected[0].category is not a research category",
      "vendors[0].expected[0].anyOf must hold at least one word",
      "vendors[0].expected[0].label must be low, medium or high",
      "vendors[0].traps[0].anyOf must hold at least one word",
      "vendors[2].vendorId 1 is labelled twice",
    ]);
  });

  it("asks for the vendor row of each vendor, one row, labelled once", () => {
    const { vendorId: _ignored, ...withoutId } = ACME;

    expect(checkGoldenLabels(file([withoutId])).problems).toEqual([
      "vendors[0].vendorId must give the vendor row that was researched",
    ]);
    expect(checkGoldenLabels(file([{ ...ACME, vendorId: "7" }])).problems).toEqual([
      "vendors[0].vendorId must be a positive whole number",
    ]);
    expect(checkGoldenLabels(file([{ ...ACME, vendorId: null }])).problems).toEqual([
      "vendors[0].vendorId must be a positive whole number",
    ]);
    expect(checkGoldenLabels(file([{ ...ACME, vendorId: 1.5 }])).problems).toEqual([
      "vendors[0].vendorId must be a positive whole number",
    ]);
    expect(
      checkGoldenLabels(file([ACME, { ...ACME, profile: 6, vendorId: 1, name: "Beta" }])).problems,
    ).toEqual(["vendors[1].vendorId 1 is labelled twice"]);
  });

  describe("a file of the earlier shape, with a vendor row for each flag", () => {
    const earlier = (vendorIds: unknown, extra: Record<string, unknown> = {}) => {
      const { vendorId: _dropped, ...rest } = ACME;
      return { ...rest, vendorIds, ...extra };
    };

    it("reads the row researched with the flag on as the vendor's row", () => {
      const result = checkGoldenLabels(file([earlier({ off: 1, on: 101 })]));

      expect(result.problems).toEqual([]);
      const [vendor] = (result.labels as GoldenLabels).vendors;
      expect(vendor.vendorId).toBe(101);
      // The earlier shape is read, not carried on.
      expect(vendor).not.toHaveProperty("vendorIds");
      expect(vendor).toMatchObject({ profile: 5, name: "Acme", expected: ACME.expected });
    });

    it("ignores the row researched with the flag off, whatever it holds", () => {
      expect(checkGoldenLabels(file([earlier({ off: 0, on: 101 })])).problems).toEqual([]);
      expect(checkGoldenLabels(file([earlier({ on: 101 })])).problems).toEqual([]);
      expect(checkGoldenLabels(file([earlier({ off: 101, on: 101 })])).problems).toEqual([]);
    });

    it("asks for the row researched with the flag on", () => {
      expect(checkGoldenLabels(file([earlier({ off: 1, on: 0 })])).problems).toEqual([
        "vendors[0].vendorIds.on must be a positive whole number",
      ]);
      expect(checkGoldenLabels(file([earlier({ off: 1 })])).problems).toEqual([
        "vendors[0].vendorIds.on must be a positive whole number",
      ]);
      expect(checkGoldenLabels(file([earlier("1")])).problems).toEqual([
        "vendors[0].vendorId must give the vendor row that was researched",
      ]);
    });

    it("takes vendorId before vendorIds when a vendor has both", () => {
      const result = checkGoldenLabels(file([earlier({ off: 1, on: 101 }, { vendorId: 7 })]));

      expect(result.problems).toEqual([]);
      expect((result.labels as GoldenLabels).vendors[0].vendorId).toBe(7);
      // A vendorId that is not valid is not replaced by the row of the earlier shape.
      expect(
        checkGoldenLabels(file([earlier({ off: 1, on: 101 }, { vendorId: 0 })])).problems,
      ).toEqual(["vendors[0].vendorId must be a positive whole number"]);
    });

    it("labels each row once, across both shapes", () => {
      expect(
        checkGoldenLabels(
          file([
            { ...ACME, vendorId: 101 },
            { ...earlier({ off: 5, on: 101 }), profile: 6 },
          ]),
        ).problems,
      ).toEqual(["vendors[1].vendorIds.on 101 is labelled twice"]);
    });
  });

  it("finds in the template only the blanks a person fills in", () => {
    const template: unknown = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../../../../docs/superpowers/golden-set/labels.template.json"),
        "utf8",
      ),
    );

    const { problems } = checkGoldenLabels(template);

    expect(problems).toContain("organizationId must be a positive whole number");
    // The template gives the row as vendorId, or as the earlier shape's vendorIds.on.
    expect(problems).toContainEqual(
      expect.stringMatching(/^vendors\[23\]\.vendorId(?:s\.on)? must be a positive whole number$/),
    );
    expect(
      problems.filter(
        (problem) =>
          !/ must (be a positive whole number|name|be a day|be the vendor's name)/.test(problem),
      ),
    ).toEqual([]);
  });

  it("refuses what is not a labels file", () => {
    expect(checkGoldenLabels([])).toEqual({
      labels: null,
      problems: [
        "the file must be an object with organizationId, labelledBy, labelledOn and vendors",
      ],
    });
  });
});

describe("formatGoldenReport", () => {
  it("prints the measures, the vendors and the verdict", () => {
    const report = scoreGoldenSet([ACME], [run(1, [finding()])]);

    const text = formatGoldenReport(report, meetsBars(report));

    expect(text).toContain("Golden set: 1 vendor");
    expect(text).toContain("Runs: precision 1.00, recall 1.00 (1 finding, 1 matched, 0 traps)");
    expect(text).toContain("Recall is reported only: it has no bar.");
    expect(text).toContain("Label agreement: 100 % (1 of 1)");
    expect(text).toContain("#5 Acme (vendor 1): 1/1 matched, 1/1 recalled, 1/1 labels agree");
    expect(text).toContain("Bars met: yes");
  });

  it("says nothing of a flag or of a confidence", () => {
    const report = scoreGoldenSet([ACME], [run(1, [finding()])]);

    const text = formatGoldenReport(report, meetsBars(report));

    expect(text).not.toMatch(/flag/i);
    expect(text).not.toMatch(/confidence/i);
  });

  it("names a vendor without a run, the bars that are missed and what to look at", () => {
    const stray = finding({ category: "availability", risk_description: "A stray finding." });
    const report = scoreGoldenSet([ACME, BETA], [{ ...run(1, [stray]), earlier: 2 }]);

    const text = formatGoldenReport(report, meetsBars(report));

    expect(text).toContain("#6 Beta (vendor 2): no run");
    expect(text).toContain("Missing runs:\n  - Beta (vendor 2)");
    expect(text).toContain(
      "Runs after earlier findings or risks of their vendor row:\n  - Acme (vendor 1, 2 earlier)",
    );
    expect(text).toContain("Bars met: no");
    expect(text).toContain("  - 1 vendor has no completed run (Beta)");
  });
});
