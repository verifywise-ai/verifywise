import type {
  CoverageSource,
  FindingSource,
  RunCoverage,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import fs from "fs";
import path from "path";
import { checkGoldenLabels, formatGoldenReport, meetsBars, scoreGoldenSet } from "../score";
import type { GoldenFinding, GoldenRun, GoldenVendor } from "../types";

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
  confidence: "high",
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

/**
 * The run of a vendor with a flag, on the vendor row of that flag: the row of `vendor` for the
 * flag off, and the row 100 above it for the flag on (each flag is researched on a row of its own).
 */
const run = (vendor: number, findings: GoldenFinding[], flag: "off" | "on"): GoldenRun => ({
  vendorId: flag === "on" ? vendor + 100 : vendor,
  earlier: 0,
  promptVersion: flag === "on" ? "vr-9" : "vr-6",
  findings,
  coverage: flag === "on" ? COVERAGE : null,
});

const ACME: GoldenVendor = {
  profile: 5,
  vendorIds: { off: 1, on: 101 },
  name: "Acme",
  expected: [{ category: "security_incidents", anyOf: ["breach"], label: "high" }],
  traps: [],
};

describe("scoreGoldenSet", () => {
  it("precision and recall count matches by category and words", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [
        { category: "security_incidents", anyOf: ["breach"], label: "high" },
        { category: "availability", anyOf: ["outage"], label: "medium" },
      ],
    };
    const on = [
      run(
        1,
        [
          finding(),
          // The words of the breach, but another category: no match.
          finding({ category: "legal_regulatory", risk_description: "A breach led to a lawsuit." }),
          // A category the labeller expects, but none of its words.
          finding({ category: "availability", risk_description: "The vendor raised its prices." }),
          finding({ category: "availability", risk_description: "A two-day OUTAGE of the API." }),
        ],
        "on",
      ),
    ];
    const off = [run(1, [finding()], "off")];

    const report = scoreGoldenSet([vendor], off, on);

    expect(report.on).toMatchObject({ findings: 4, matched: 2, expected: 2, recalled: 2 });
    expect(report.on.precision).toBe(0.5);
    expect(report.on.recall).toBe(1);
    expect(report.off).toMatchObject({ findings: 1, matched: 1, expected: 2, recalled: 1 });
    expect(report.off.precision).toBe(1);
    expect(report.off.recall).toBe(0.5);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatchObject({
      vendorIds: { off: 1, on: 101 },
      name: "Acme",
      profile: 5,
    });
  });

  it("label agreement counts only matched findings", () => {
    const on = [
      run(
        1,
        [
          finding({ credibility: "high" }),
          finding({ credibility: "medium", risk_description: "Acme's breach notice was late." }),
          // Not matched: its label is not compared, whatever it is.
          finding({ category: "certifications", credibility: "low", risk_description: "No ISO." }),
        ],
        "on",
      ),
    ];

    const report = scoreGoldenSet([ACME], [run(1, [], "off")], on);

    expect(report.compared).toBe(2);
    expect(report.agreed).toBe(1);
    expect(report.agreement).toBe(0.5);
    // The run with the flag off is compared by its confidence, for the record only.
    expect(report.baselineAgreement).toBeNull();
  });

  it("a High that the labeller rates Low fails the bars", () => {
    const vendor: GoldenVendor = {
      ...ACME,
      expected: [{ category: "security_incidents", anyOf: ["breach"], label: "low" }],
    };
    const on = [run(1, [finding({ credibility: "high" })], "on")];

    const report = scoreGoldenSet([vendor], [run(1, [], "off")], on);

    expect(report.highRatedLow).toEqual([
      { vendorId: 101, name: "Acme", finding: "Acme disclosed a breach of its customer database." },
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
    const on = [
      run(
        1,
        [
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
        ],
        "on",
      ),
    ];

    const report = scoreGoldenSet([vendor], [run(1, [], "off")], on);

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
    const on = [run(1, [finding(), trap], "on")];

    const report = scoreGoldenSet([vendor], [run(1, [], "off")], on);

    expect(report.on).toMatchObject({ findings: 2, matched: 1, traps: 1 });
    expect(report.on.precision).toBe(0.5);
    // A trap is never a match, so its label is not compared either.
    expect(report.compared).toBe(1);
    expect(report.lines[0].on?.traps).toBe(1);
  });

  it("takes each flag's run from the vendor row of that flag only", () => {
    // A run with the flag on of the row researched with it off is not the flag's run.
    const onTheOffRow: GoldenRun = { ...run(1, [finding()], "on"), vendorId: 1 };

    const report = scoreGoldenSet([ACME], [run(1, [finding()], "off")], [onTheOffRow]);

    expect(report.lines[0].off).not.toBeNull();
    expect(report.lines[0].on).toBeNull();
    expect(report.missingRuns).toEqual([{ vendorId: 101, name: "Acme", flag: "on" }]);
  });

  it("lists a run that followed earlier findings or risks of its vendor row, and misses the bar", () => {
    const report = scoreGoldenSet(
      [ACME],
      [run(1, [finding()], "off")],
      [{ ...run(1, [finding()], "on"), earlier: 3 }],
    );

    expect(report.afterEarlier).toEqual([{ vendorId: 101, name: "Acme", flag: "on", earlier: 3 }]);
    expect(meetsBars(report).reasons).toEqual([
      "1 run was compared with earlier findings or risks of its vendor row, which hid what it found (Acme, flag on): research each flag on a fresh vendor row",
    ]);
  });

  it("a vendor without coverage under the flag fails the coverage bar", () => {
    const beta: GoldenVendor = {
      ...ACME,
      vendorIds: { off: 2, on: 102 },
      name: "Beta",
      profile: 6,
    };
    const on = [run(1, [finding()], "on"), { ...run(2, [finding()], "on"), coverage: null }];
    const off = [run(1, [finding()], "off"), run(2, [finding()], "off")];

    const report = scoreGoldenSet([ACME, beta], off, on);

    expect(report.coverageMissing).toEqual([{ vendorId: 102, name: "Beta" }]);
    const verdict = meetsBars(report);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["1 vendor has no coverage with the flag on (Beta)"]);
  });
});

describe("meetsBars", () => {
  it("passes a set that meets every bar", () => {
    const report = scoreGoldenSet(
      [ACME],
      [run(1, [finding()], "off")],
      [run(1, [finding()], "on")],
    );

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
    const off = [
      run(
        1,
        [finding(), finding({ category: "availability", risk_description: "An outage." })],
        "off",
      ),
    ];
    const on = [
      run(
        1,
        [
          finding({ credibility: "high" }),
          finding({ category: "ai_specific", risk_description: "Trains on data." }),
        ],
        "on",
      ),
    ];

    const verdict = meetsBars(scoreGoldenSet([vendor], off, on));

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual([
      "precision 0.50 with the flag on, below 0.90",
      "recall 0.50 with the flag on, below 1.00 with it off",
      "label agreement 0 %, below 80 %",
    ]);
  });

  it("a vendor without a run with the flag on or off fails", () => {
    const beta: GoldenVendor = {
      ...ACME,
      vendorIds: { off: 2, on: 102 },
      name: "Beta",
      profile: 6,
    };
    const report = scoreGoldenSet(
      [ACME, beta],
      [run(1, [finding()], "off")],
      [run(1, [finding()], "on")],
    );

    expect(report.missingRuns).toEqual([
      { vendorId: 2, name: "Beta", flag: "off" },
      { vendorId: 102, name: "Beta", flag: "on" },
    ]);
    expect(meetsBars(report).reasons).toEqual([
      "1 vendor has no completed run with the flag off (Beta)",
      "1 vendor has no completed run with the flag on (Beta)",
    ]);
  });

  it("a run with the flag on whose lists could not be checked fails the coverage bar", () => {
    const failed: RunCoverage = {
      ...COVERAGE,
      sources: [{ ...list("kev"), checked: false, outcome: "failed" }, list("ofac")],
    };
    const report = scoreGoldenSet(
      [ACME],
      [run(1, [finding()], "off")],
      [{ ...run(1, [finding()], "on"), coverage: failed }],
    );

    expect(report.coverageFailed).toEqual([{ vendorId: 101, name: "Acme", sources: ["kev"] }]);
    expect(meetsBars(report).reasons).toEqual([
      "1 vendor's run with the flag on could not check every list (Acme: kev)",
    ]);
  });

  it("an empty set fails", () => {
    expect(meetsBars(scoreGoldenSet([], [], [])).reasons).toEqual(["no labelled vendor"]);
  });
});

describe("checkGoldenLabels", () => {
  it("accepts a filled file", () => {
    const file = {
      organizationId: 1,
      labelledBy: "A. Person",
      labelledOn: "2026-11-02",
      vendors: [ACME],
    };

    expect(checkGoldenLabels(file)).toEqual({ labels: file, problems: [] });
  });

  it("names what a person must still fill in", () => {
    const result = checkGoldenLabels({
      organizationId: 0,
      labelledBy: "",
      labelledOn: "soon",
      vendors: [
        {
          profile: 25,
          vendorIds: { off: 1, on: 1 },
          name: "Acme",
          expected: [{ category: "rumours", anyOf: [], label: "certain" }],
          traps: [{ anyOf: [""] }],
        },
        { ...ACME },
      ],
    });

    expect(result.labels).toBeNull();
    expect(result.problems).toEqual([
      "organizationId must be a positive whole number",
      "labelledBy must name the person who labelled",
      "labelledOn must be a day (YYYY-MM-DD)",
      "vendors[0].profile must be one of 1 to 24",
      "vendors[0].vendorIds.on must be another vendor row than vendorIds.off",
      "vendors[0].expected[0].category is not a research category",
      "vendors[0].expected[0].anyOf must hold at least one word",
      "vendors[0].expected[0].label must be low, medium or high",
      "vendors[0].traps[0].anyOf must hold at least one word",
      "vendors[1].vendorIds.off 1 is labelled twice",
    ]);
  });

  it("asks for a vendor row of each flag, two rows, each labelled once", () => {
    const file = (vendors: unknown[]) => ({
      organizationId: 1,
      labelledBy: "A. Person",
      labelledOn: "2026-11-02",
      vendors,
    });
    const { vendorIds: _ignored, ...withoutIds } = ACME;

    expect(checkGoldenLabels(file([withoutIds])).problems).toEqual([
      "vendors[0].vendorIds must give the vendor row researched with the flag off and the one with it on",
    ]);
    expect(checkGoldenLabels(file([{ ...ACME, vendorId: 1 }])).problems).toEqual([]);
    expect(
      checkGoldenLabels(
        file([ACME, { ...ACME, profile: 6, vendorIds: { off: 101, on: 0 }, name: "Beta" }]),
      ).problems,
    ).toEqual([
      "vendors[1].vendorIds.off 101 is labelled twice",
      "vendors[1].vendorIds.on must be a positive whole number",
    ]);
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
    expect(problems).toContain("vendors[23].vendorIds.on must be a positive whole number");
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
    const report = scoreGoldenSet(
      [ACME],
      [run(1, [finding()], "off")],
      [run(1, [finding()], "on")],
    );

    const text = formatGoldenReport(report, meetsBars(report));

    expect(text).toContain("Flag off: precision 1.00, recall 1.00 (1 finding, 1 matched, 0 traps)");
    expect(text).toContain("Flag on: precision 1.00, recall 1.00 (1 finding, 1 matched, 0 traps)");
    expect(text).toContain("Label agreement: 100 % (1 of 1)");
    expect(text).toContain(
      "#5 Acme (vendors 1 off, 101 on): off 1/1 matched, 1/1 recalled; on 1/1 matched, 1/1 recalled, 1/1 labels agree",
    );
    expect(text).toContain("Bars met: yes");
  });
});
