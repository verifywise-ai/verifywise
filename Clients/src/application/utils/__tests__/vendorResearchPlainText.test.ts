import { describe, it, expect } from "vitest";
import {
  coverage,
  credibleFinding,
  finding,
  KEV_RECORD,
  listCopy,
} from "../../../presentation/pages/Vendors/VendorResearchFindings/__tests__/fixtures";
import type {
  CredibilityRule,
  FindingSource,
  StoredCredibilityBasis,
  VendorRiskFinding,
} from "../../../domain/interfaces/i.vendorResearch";
import { translations } from "../../../i18n/translations";
import type { PendingSummary } from "../vendorResearchList";
import { coverageLines } from "../vendorResearchText";
import {
  credibilityLine,
  earlierLegend,
  pendingSentence,
  readSourceLink,
  recordTag,
  rowCautions,
  scalesLine,
  sourceTag,
  topicsSentence,
  uncheckedSentence,
} from "../vendorResearchPlainText";

const english = (key: string) => key;
const german = (key: string) => translations.de[key] ?? key;

const summary = (overrides: Partial<PendingSummary> = {}): PendingSummary => ({
  total: 16,
  complete: true,
  high: 10,
  topics: [
    { category: "legal_regulatory", count: 7 },
    { category: "security_incidents", count: 5 },
  ],
  earlier: 13,
  ...overrides,
});

const source = (url: string, overrides: Partial<FindingSource> = {}): FindingSource => ({
  url,
  title: "t",
  quote: "q",
  published_at: null,
  ...overrides,
});

const basisOf = (rule: CredibilityRule | `backfill_${CredibilityRule}`): StoredCredibilityBasis =>
  ({
    rule,
    registry_version: "2026-10-29.1",
    name_only: false,
    sources: [],
  }) as StoredCredibilityBasis;

describe("the sentence that counts what is pending", () => {
  it.each([
    [summary(), "16 possible risks to review. 10 are high risk."],
    [summary({ total: 2, high: 1 }), "2 possible risks to review. 1 is high risk."],
    [summary({ total: 3, high: 3 }), "3 possible risks to review. All are high risk."],
    [summary({ total: 1, high: 1 }), "1 possible risk to review. It is high risk."],
    [summary({ total: 1, high: 0 }), "1 possible risk to review."],
    [summary({ total: 4, high: 0 }), "4 possible risks to review."],
  ])("reads %#", (given, sentence) => {
    expect(pendingSentence(given, english)).toBe(sentence);
  });

  it("counts only, when the server holds more findings than it sent", () => {
    expect(pendingSentence(summary({ total: 250, complete: false }), english)).toBe(
      "250 possible risks to review.",
    );
  });

  it("is worded in the language of the screen", () => {
    expect(pendingSentence(summary(), german)).toBe(
      "16 mögliche Risiken zu prüfen. 10 davon sind hohe Risiken.",
    );
  });
});

describe("the sentence that names the categories with the most", () => {
  it("names the two categories and how many findings each has", () => {
    expect(topicsSentence(summary(), english)).toBe(
      "Most are about: Legal and regulatory (7), Security incidents (5).",
    );
  });

  it("names the categories in the language of the screen", () => {
    expect(topicsSentence(summary(), german)).toBe(
      "Die meisten betreffen: Recht und Regulierung (7), Sicherheitsvorfälle (5).",
    );
  });

  it("says nothing when there are no categories to name", () => {
    expect(topicsSentence(summary({ topics: [] }), english)).toBeNull();
  });

  it("says nothing when the server holds more findings than it sent", () => {
    expect(topicsSentence(summary({ total: 250, complete: false }), english)).toBeNull();
  });
});

describe("the sentence of what a run could not check", () => {
  it("names the one source", () => {
    expect(uncheckedSentence(["the CVE Program"], english)).toBe(
      "One source could not be checked, so results may be incomplete: the CVE Program.",
    );
  });

  it("counts and names several", () => {
    expect(uncheckedSentence(["the CVE Program", "SEC EDGAR"], english)).toBe(
      "2 sources could not be checked, so results may be incomplete: the CVE Program, SEC EDGAR.",
    );
  });

  it("says nothing when everything was checked", () => {
    expect(uncheckedSentence([], english)).toBeNull();
  });

  it("is worded from the names the coverage of a run gives", () => {
    const lines = coverageLines(
      coverage({
        sources: [
          listCopy("kev", { outcome: "found", strong: 1 }),
          listCopy("ofac", { outcome: "failed", checked: false }),
        ],
        lookups: [
          { id: "nvd", outcome: "found" },
          { id: "cve", outcome: "failed" },
          { id: "not_a_database" as "nvd", outcome: "failed" },
        ],
      }),
      english,
      "en",
    );

    // The lists first, then the databases; a database this screen does not know is left out, as
    // it is in the line of the coverage.
    expect(lines.unchecked).toEqual([
      "OFAC Specially Designated Nationals list",
      "the CVE Program",
    ]);
    expect(lines.notChecked).toBe(
      "Not checked: OFAC Specially Designated Nationals list, the CVE Program",
    );
    expect(uncheckedSentence(lines.unchecked, english)).toBe(
      "2 sources could not be checked, so results may be incomplete: OFAC Specially Designated Nationals list, the CVE Program.",
    );
  });

  it("has no names for a run that checked everything", () => {
    const lines = coverageLines(
      coverage({ lookups: [{ id: "nvd", outcome: "found" }] }),
      english,
      "en",
    );

    expect(lines.unchecked).toEqual([]);
  });
});

describe("the legend of the earlier estimates", () => {
  it.each([
    [
      13,
      "* Earlier estimate: 13 of these findings were rated before the current rules for rating sources.",
    ],
    [
      1,
      "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.",
    ],
  ])("counts %i", (count, legend) => {
    expect(earlierLegend(count, english)).toBe(legend);
  });

  it("is not shown when no finding carries an earlier estimate", () => {
    expect(earlierLegend(0, english)).toBeNull();
  });
});

describe("the credibility line of a row", () => {
  const legacy = (overrides: Partial<VendorRiskFinding> = {}) =>
    finding({
      credibility: "high",
      credibility_basis: { rule: "legacy_confidence" },
      ...overrides,
    });

  it("counts the sources of an earlier estimate and names their hosts, marked with an asterisk", () => {
    const given = legacy({
      sources: [
        source("https://www.bbc.com/news/1"),
        source("https://www.reuters.com/a"),
        source("https://www.nytimes.com/b"),
      ],
    });

    expect(credibilityLine(given, english, "en")).toEqual({
      text: "High*: 3 sources report it (www.bbc.com, www.reuters.com, www.nytimes.com).",
      earlier: true,
    });
  });

  it("names a host once, however many of the sources are on it", () => {
    const given = legacy({
      sources: [source("https://www.bbc.com/news/1"), source("https://www.bbc.com/news/2")],
    });

    expect(credibilityLine(given, english, "en")?.text).toBe(
      "High*: 2 sources report it (www.bbc.com).",
    );
  });

  it("says one source for one", () => {
    const given = legacy({
      credibility: "medium",
      sources: [source("https://news.example.com/a")],
    });

    expect(credibilityLine(given, english, "en")?.text).toBe(
      "Medium*: one source reports it (news.example.com).",
    );
  });

  it("names no host for sources whose address is not a web address", () => {
    expect(
      credibilityLine(legacy({ sources: [source("javascript:alert(1)")] }), english, "en")?.text,
    ).toBe("High*: one source reports it.");
    expect(
      credibilityLine(
        legacy({ sources: [source("not a url"), source("ftp://files.example.com/x")] }),
        english,
        "en",
      )?.text,
    ).toBe("High*: 2 sources report it.");
  });

  it("shows the label alone for an earlier estimate that lists no source", () => {
    expect(credibilityLine(legacy({ sources: [] }), english, "en")).toEqual({
      text: "High*",
      earlier: true,
    });
  });

  it("words an earlier estimate in the language of the screen", () => {
    const given = legacy({ sources: [source("https://www.bbc.com/news/1")] });

    expect(credibilityLine(given, german, "de")?.text).toBe(
      "Hoch*: Eine Quelle berichtet darüber (www.bbc.com).",
    );
  });

  it("is the sentence of the rule for a label the rule decided", () => {
    expect(credibilityLine(credibleFinding(), english, "en")).toEqual({
      text: "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.",
      earlier: false,
    });
  });

  it("adds the day of an out-of-date copy to the sentence of the rule", () => {
    const given = credibleFinding({
      credibility_basis: {
        rule: "official_record",
        registry_version: "2026-10-29.1",
        name_only: false,
        sources: [{ ...KEV_RECORD, record: { ...KEV_RECORD.record!, stale: true } }],
      },
    });

    expect(credibilityLine(given, english, "en")?.text).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026. The source has not been updated since 7 Oct 2026.",
    );
  });

  it("leaves out that a label was rated again, until the whole line is asked for", () => {
    const given = finding({
      credibility: "low",
      credibility_basis: basisOf("backfill_self_claim"),
    });

    expect(credibilityLine(given, english, "en")).toEqual({
      text: "Low: only the vendor's own claims support it.",
      earlier: false,
    });
    expect(credibilityLine(given, english, "en", { full: true })?.text).toBe(
      "Low: only the vendor's own claims support it. Rated again with the current rule.",
    );
  });

  it("is the label alone when there is no basis, or one this screen cannot word", () => {
    expect(
      credibilityLine(finding({ credibility: "medium", credibility_basis: null }), english, "en"),
    ).toEqual({ text: "Medium", earlier: false });
    expect(
      credibilityLine(
        finding({
          credibility: "low",
          credibility_basis: basisOf("some_new_rule" as CredibilityRule),
        }),
        english,
        "en",
      )?.text,
    ).toBe("Low");
  });

  it("is nothing for a finding with no label, or a label this screen does not know", () => {
    expect(credibilityLine(finding({ credibility: null }), english, "en")).toBeNull();
    expect(
      credibilityLine(
        finding({ credibility: "certain" as VendorRiskFinding["credibility"] }),
        english,
        "en",
      ),
    ).toBeNull();
  });
});

describe("the cautions of a row", () => {
  const SNIPPET = "Based on search results only: it could not be confirmed on the source pages.";
  const NAME = "Matched by name only: this may be another company.";

  it("has none for a finding that needs none", () => {
    expect(rowCautions(finding(), english)).toEqual([]);
    expect(rowCautions(finding({ snippet_only: false }), english)).toEqual([]);
  });

  it("says that a finding rests on search results only", () => {
    expect(rowCautions(finding({ snippet_only: true }), english)).toEqual([SNIPPET]);
  });

  it.each([
    "capped_unconfirmed",
    "contradicted",
    "backfill_capped_unconfirmed",
    "backfill_contradicted",
  ] as const)("does not say it twice when the credibility line of %s says it", (rule) => {
    expect(
      rowCautions(finding({ snippet_only: true, credibility_basis: basisOf(rule) }), english),
    ).toEqual([]);
  });

  it("says that a record matched the vendor by name only", () => {
    const given = finding({
      credibility_basis: {
        ...basisOf("trusted_press_two"),
        name_only: true,
      } as StoredCredibilityBasis,
    });

    expect(rowCautions(given, english)).toEqual([NAME]);
  });

  it("says that a cited record is no longer stood by, once for each way", () => {
    const record = (status: "active" | "withdrawn" | "rejected" | "delisted") => ({
      source_id: "kev" as const,
      record_id: 1,
      status,
      match_strength: "strong" as const,
    });
    const given = finding({
      sources: [
        source("https://a.example/1", { record: record("delisted") }),
        source("https://a.example/2", { record: record("withdrawn") }),
        source("https://a.example/3", { record: record("withdrawn") }),
        source("https://a.example/4", { record: record("rejected") }),
        source("https://a.example/5", { record: record("active") }),
        source("https://a.example/6"),
      ],
    });

    expect(rowCautions(given, english)).toEqual([
      "A cited record was withdrawn by its source.",
      "A cited record was rejected by its source.",
      "A cited record was removed from its list.",
    ]);
  });

  it.each(["inactive", "backfill_inactive"] as const)(
    "does not say it twice when the credibility line of %s says it",
    (rule) => {
      const given = finding({
        credibility_basis: basisOf(rule),
        sources: [
          source("https://a.example/1", {
            record: {
              source_id: "kev",
              record_id: 1,
              status: "withdrawn",
              match_strength: "strong",
            },
          }),
        ],
      });

      expect(rowCautions(given, english)).toEqual([]);
    },
  );

  it("lists them in one order: search results, name only, records", () => {
    const given = finding({
      snippet_only: true,
      credibility_basis: { ...basisOf("unverified"), name_only: true } as StoredCredibilityBasis,
      sources: [
        source("https://a.example/1", {
          record: { source_id: "ofac", record_id: 1, status: "delisted", match_strength: "weak" },
        }),
      ],
    });

    expect(rowCautions(given, english)).toEqual([
      SNIPPET,
      NAME,
      "A cited record was removed from its list.",
    ]);
  });
});

describe("the tags of a source", () => {
  it.each([
    ["official", "Official source"],
    ["trusted_press", "Trusted publisher"],
    ["vendor", "Vendor's own page"],
    ["unverified", "Unverified source"],
  ] as const)("says what kind of source %s is", (category, tag) => {
    expect(sourceTag(category, english)).toBe(tag);
  });

  it.each([undefined, null, "constructor", "blog"])(
    "has no tag for the category %j",
    (category) => {
      expect(sourceTag(category as never, english)).toBeNull();
    },
  );

  it.each([
    ["withdrawn", "Record withdrawn"],
    ["rejected", "Record rejected"],
    ["delisted", "Removed from the list"],
  ] as const)("says that a %s record is no longer stood by", (status, tag) => {
    expect(recordTag(status, english)).toBe(tag);
  });

  it.each([undefined, null, "active", "toString"])("has no tag for the status %j", (status) => {
    expect(recordTag(status as never, english)).toBeNull();
  });
});

describe("the line of the scales", () => {
  it("names the severity and the likelihood behind the risk level", () => {
    expect(scalesLine(finding(), english)).toBe("Severity: Major · Likelihood: Likely");
  });

  it("translates the words of the register with the caption of each", () => {
    // The words of the two scales are the register's own, in the dictionary since before this
    // line: it is read from there, so that the test is about the line and not about a word.
    const severity = translations.de.Major;
    const likelihood = translations.de.Likely;
    expect([severity, likelihood]).not.toContain(undefined);

    expect(scalesLine(finding(), german)).toBe(
      `Schweregrad: ${severity} · Wahrscheinlichkeit: ${likelihood}`,
    );
    expect(scalesLine(finding(), german)).not.toMatch(/Major|Likely|Severity|Likelihood/);
  });
});

describe("the link of a source", () => {
  it("reads a web address into its normalized address and its host", () => {
    expect(readSourceLink("HTTPS://Upper.Example.com/x")).toEqual({
      href: "https://upper.example.com/x",
      host: "upper.example.com",
    });
    expect(readSourceLink("http://news.example.com/a?b=1")).toEqual({
      href: "http://news.example.com/a?b=1",
      host: "news.example.com",
    });
  });

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "vbscript:msgbox(1)",
    "ftp://files.example.com/report",
    "data:text/html,<b>x</b>",
    "not a url",
    "//evil.example.com/x",
    "/x",
    "http://",
    "",
  ])("reads no link from %j", (url) => {
    expect(readSourceLink(url)).toBeNull();
  });
});

describe("the dictionary", () => {
  const LANGS = ["de", "fr", "es"] as const;

  /**
   * Every key the plain words ask the dictionary for, gathered by running each of their branches
   * with a translator that only writes the keys down.
   */
  const keysRequested = (): string[] => {
    const keys = new Set<string>();
    const t = (key: string) => {
      keys.add(key);
      return key;
    };
    for (const pending of [
      summary(),
      summary({ total: 1, high: 0 }),
      summary({ total: 1, high: 1 }),
      summary({ total: 3, high: 1 }),
      summary({ total: 3, high: 3 }),
    ]) {
      pendingSentence(pending, t);
      topicsSentence(pending, t);
    }
    uncheckedSentence(["one"], t);
    uncheckedSentence(["one", "two"], t);
    earlierLegend(1, t);
    earlierLegend(2, t);
    for (const sources of [
      [],
      [source("no address")],
      [source("https://a.example/1")],
      [source("no address"), source("none either")],
      [source("https://a.example/1"), source("https://b.example/1")],
    ]) {
      credibilityLine(
        finding({ credibility_basis: { rule: "legacy_confidence" }, sources }),
        t,
        "en",
      );
    }
    rowCautions(
      finding({
        snippet_only: true,
        sources: (["withdrawn", "rejected", "delisted"] as const).map((status) =>
          source("https://a.example/1", {
            record: { source_id: "kev", record_id: 1, status, match_strength: "strong" },
          }),
        ),
      }),
      t,
    );
    for (const category of ["official", "trusted_press", "vendor", "unverified"] as const) {
      sourceTag(category, t);
    }
    for (const status of ["withdrawn", "rejected", "delisted"] as const) recordTag(status, t);
    scalesLine(finding(), t);
    return [...keys];
  };

  it("is asked for every sentence of the summary, the row and its sources, so that the checks below have something to check", () => {
    expect(keysRequested()).toEqual(
      expect.arrayContaining([
        "{count} possible risks to review.",
        "1 possible risk to review.",
        "{count} are high risk.",
        "1 is high risk.",
        "All are high risk.",
        "It is high risk.",
        "Most are about: {topics}.",
        "One source could not be checked, so results may be incomplete: {sources}.",
        "{count} sources could not be checked, so results may be incomplete: {sources}.",
        "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.",
        "* Earlier estimate: {count} of these findings were rated before the current rules for rating sources.",
        "{label}*: one source reports it.",
        "{label}*: one source reports it ({host}).",
        "{label}*: {count} sources report it.",
        "{label}*: {count} sources report it ({hosts}).",
        "Based on search results only: it could not be confirmed on the source pages.",
        "A cited record was withdrawn by its source.",
        "A cited record was rejected by its source.",
        "A cited record was removed from its list.",
        "Official source",
        "Trusted publisher",
        "Vendor's own page",
        "Unverified source",
        "Record withdrawn",
        "Record rejected",
        "Removed from the list",
        "Severity: {severity} · Likelihood: {likelihood}",
      ]),
    );
  });

  it.each(LANGS)(
    "has a %s entry for every sentence and tag the plain words can produce",
    (lang) => {
      const missing = keysRequested().filter((key) => translations[lang][key] === undefined);
      expect(missing).toEqual([]);
    },
  );

  // A sentence is filled by name: a translation that lost a name would show it unfilled, or drop
  // a count or a source from what the reader is told.
  it.each(LANGS)("keeps every name a sentence is filled with in %s", (lang) => {
    const lost = keysRequested().flatMap((key) =>
      (key.match(/\{\w+\}/g) ?? [])
        .filter((name) => !(translations[lang][key] ?? "").includes(name))
        .map((name) => `${key}: ${name}`),
    );
    expect(lost).toEqual([]);
  });
});
