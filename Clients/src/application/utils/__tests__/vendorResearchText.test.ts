import { describe, it, expect } from "vitest";
import { translations } from "../../../i18n/translations";
import { LANGS, setLanguage } from "../../../test/i18nHelpers";
import type {
  CategoryOutcome,
  CategorySummaryEntry,
  CoverageSource,
  CredibilityBasis,
  CredibilityRule,
  CredibilitySource,
  RecordSourceId,
  ResearchCategory,
  RunCoverage,
  RunProgress,
  VrdbSourceId,
} from "../../../domain/interfaces/i.vendorResearch";
import {
  categoryLabel,
  confidenceLabel,
  coverageLines,
  credibilityLabel,
  credibilityRationale,
  describeCategoryLine,
  describeCategoryNote,
  describeProgress,
  describeRunError,
  dismissReasonLabel,
  formatResearchDate,
  joinAttributions,
  nameOnlyNote,
  outcomeLabel,
  recordStatusLabel,
  sourceCategoryLabel,
} from "../vendorResearchText";

/** The closed set of run errors the server stores, and the sentence each one becomes. */
const RUN_ERRORS: Array<[stored: string, sentence: string]> = [
  ["Vendor not found", "The vendor was not found."],
  ["No LLM key configured", "No LLM key is configured for your organization."],
  ["Model call failed: HTTP 503", "The model call failed with HTTP status 503."],
  ["Model call failed: timed out", "The model call timed out."],
  [
    "Model call failed: the answer did not match the expected format",
    "The model answer did not match the expected format.",
  ],
  ["Model call failed: unexpected error", "The model call failed unexpectedly."],
  ["Unexpected error", "The research run failed unexpectedly."],
  ["Saving the findings failed", "The findings could not be saved."],
  ["timed out", "The research run timed out."],
  ["could not enqueue", "The research run could not be queued."],
  [
    "The run stopped because the web could not be reached",
    "The web could not be reached from the server.",
  ],
  ["The model did not use the research actions", "The model did not carry out the research steps."],
];

/** Stored by the earlier search provider; no longer ours, so the screen no longer shows it. */
const RETIRED_RUN_ERRORS = [
  "Search provider not configured",
  "The run stopped because all searches failed: ",
  "The run stopped because all searches failed: search timed out",
  "The run stopped because all searches failed: search timed out; The search failed",
];

/** The closed set of category notes by outcome, and the sentence each one becomes. */
const FIXED_NOTES: Array<[outcome: CategoryOutcome, stored: string, sentence: string]> = [
  [
    "skipped",
    "Vendor website is missing or not a valid domain",
    "The vendor website is missing or is not a valid domain.",
  ],
  [
    "skipped",
    "Not researched: the time limit was reached",
    "Not researched: the time limit was reached.",
  ],
  [
    "skipped",
    "Not researched: the research ended before this category was covered",
    "Not researched: the research ended before this category was covered.",
  ],
  [
    "nothing_found",
    "No risks found in the sources reviewed",
    "No risks were found in the sources reviewed.",
  ],
  [
    "nothing_found",
    "No new sources since the last run",
    "No new sources were found since the last run.",
  ],
  [
    "nothing_found",
    "No risks found; 2 of 5 pages could not be read",
    "No risks were found. 2 of 5 pages could not be read.",
  ],
  [
    "nothing_found",
    "Possible risks were found but could not be verified or are already recorded",
    "Possible risks were found but could not be verified, or are already recorded.",
  ],
  ["findings", "1 potential risk found", "1 potential risk found"],
  ["findings", "3 potential risks found", "3 potential risks found"],
  ["search_failed", "The search was not available", "The search was not available."],
  ["search_failed", "The pages could not be read", "The pages could not be read."],
];

/** Notes the earlier search provider stored: no longer ours, on any outcome. */
const RETIRED_NOTES: Array<[outcome: CategoryOutcome, stored: string]> = [
  ["nothing_found", "No risks found in the search results"],
  ["search_failed", "search timed out"],
  ["search_failed", "search request failed"],
  ["search_failed", "search response could not be read"],
  ["search_failed", "Tavily search failed with status 503"],
  ["search_failed", "The search failed"],
];

const ALL_OUTCOMES: CategoryOutcome[] = ["findings", "nothing_found", "search_failed", "skipped"];

const entry = (
  outcome: CategoryOutcome,
  note: string,
  category: ResearchCategory = "security_incidents",
): CategorySummaryEntry => ({ category, outcome, note });

describe("describeRunError", () => {
  it.each(RUN_ERRORS)("turns %j into a sentence", (stored, sentence) => {
    expect(describeRunError(stored)).toBe(sentence);
  });

  it.each(RETIRED_RUN_ERRORS)(
    "gives the generic sentence for %j, which is no longer ours",
    (stored) => {
      expect(describeRunError(stored)).toBe("The research run failed.");
    },
  );

  it("never shows an unknown stored string, whatever it says", () => {
    for (const odd of [
      "connect ECONNREFUSED 10.0.0.5:5432",
      "Model call failed: HTTP abc",
      "model call failed: timed out",
      "Vendor not found. Extra detail",
    ]) {
      expect(describeRunError(odd)).toBe("The research run failed.");
    }
  });

  it("falls back to the generic sentence for null, empty and odd input without throwing", () => {
    for (const odd of [null, "", "   ", undefined, 7, {}, []]) {
      expect(describeRunError(odd as never)).toBe("The research run failed.");
    }
  });

  it("ignores the whitespace around a stored error", () => {
    expect(describeRunError("  timed out ")).toBe("The research run timed out.");
  });
});

describe("describeCategoryNote", () => {
  it.each(FIXED_NOTES)(
    "turns the %s note %j into a plain sentence",
    (outcome, stored, sentence) => {
      expect(describeCategoryNote(entry(outcome, stored))).toEqual({
        kind: "fixed",
        text: sentence,
      });
    },
  );

  it("counts potential risks with a small parser, singular and plural", () => {
    expect(describeCategoryNote(entry("findings", "1 potential risk found"))).toEqual({
      kind: "fixed",
      text: "1 potential risk found",
    });
    expect(describeCategoryNote(entry("findings", "12 potential risks found"))).toEqual({
      kind: "fixed",
      text: "12 potential risks found",
    });
  });

  it("does not turn a model's note into a system sentence because it repeats one", () => {
    // On a category where nothing was found, the note may be the model's own. A model can write
    // "3 potential risks found" or "search timed out" there; only the server's own phrases for
    // this outcome are fixed sentences, so these come back flagged as the model's.
    for (const phrase of ["3 potential risks found", "search timed out"]) {
      expect(describeCategoryNote(entry("nothing_found", phrase))).toEqual({
        kind: "model",
        text: phrase,
        label: "AI note (unverified)",
      });
    }
  });

  it("hides the phrase of one outcome on a category with another outcome", () => {
    expect(
      describeCategoryNote(entry("findings", "No risks found in the sources reviewed")),
    ).toBeNull();
    expect(describeCategoryNote(entry("skipped", "2 potential risks found"))).toBeNull();
    expect(describeCategoryNote(entry("search_failed", "1 potential risk found"))).toBeNull();
    expect(describeCategoryNote(entry("skipped", "The search was not available"))).toBeNull();
    expect(
      describeCategoryNote(entry("search_failed", "Not researched: the time limit was reached")),
    ).toBeNull();
  });

  it("fills the counts of the page note into the sentence", () => {
    expect(
      describeCategoryNote(
        entry("nothing_found", "No risks found; 1 of 1 pages could not be read"),
      ),
    ).toEqual({ kind: "fixed", text: "No risks were found. 1 of 1 pages could not be read." });
    expect(
      describeCategoryNote(
        entry("nothing_found", "No risks found; 12 of 120 pages could not be read"),
      ),
    ).toEqual({ kind: "fixed", text: "No risks were found. 12 of 120 pages could not be read." });
  });

  it("does not take a page note that the server cannot have written as its own", () => {
    // More than three digits, more pages failed than were read, a sign, a gap, other words.
    for (const odd of [
      "No risks found; 1000 of 1200 pages could not be read",
      "No risks found; 5 of 1000 pages could not be read",
      "No risks found; 6 of 5 pages could not be read",
      "No risks found; -1 of 5 pages could not be read",
      "No risks found; 2 of 5 pages could not be read.",
      "No risks found;  2 of 5 pages could not be read",
      "No risks found; 2 of 5 pages could be read",
      "Prefix. No risks found; 2 of 5 pages could not be read",
    ]) {
      // Where nothing was found it is the model's own text; on any other outcome it is hidden.
      const trimmed = odd.trim();
      expect(describeCategoryNote(entry("nothing_found", odd))).toEqual({
        kind: "model",
        text: trimmed,
        label: "AI note (unverified)",
      });
      for (const other of ["findings", "search_failed", "skipped"] as const) {
        expect(describeCategoryNote(entry(other, odd))).toBeNull();
      }
    }
  });

  it.each(RETIRED_NOTES)(
    "no longer takes the %s note %j of the earlier search provider as ours",
    (outcome, stored) => {
      // The model's own text where nothing was found, hidden everywhere else.
      expect(describeCategoryNote(entry(outcome, stored))).toEqual(
        outcome === "nothing_found"
          ? { kind: "model", text: stored, label: "AI note (unverified)" }
          : null,
      );
    },
  );

  it.each(FIXED_NOTES)(
    "takes the %s note %j as a fixed sentence for that outcome only",
    (outcome, stored) => {
      for (const other of ALL_OUTCOMES.filter((candidate) => candidate !== outcome)) {
        // Never a sentence of ours; the model's own where nothing was found, hidden elsewhere.
        expect(describeCategoryNote(entry(other, stored))).toEqual(
          other === "nothing_found"
            ? { kind: "model", text: stored, label: "AI note (unverified)" }
            : null,
        );
      }
    },
  );

  it("keeps the text of a model-written note and marks it as unverified", () => {
    expect(
      describeCategoryNote(entry("nothing_found", "  Only marketing pages were indexed.  ")),
    ).toEqual({
      kind: "model",
      text: "Only marketing pages were indexed.",
      label: "AI note (unverified)",
    });
  });

  it("does not touch the markup of a model-written note", () => {
    const note = "<img src=x onerror=alert(1)> **bold**";
    expect(describeCategoryNote(entry("nothing_found", note))).toMatchObject({
      kind: "model",
      text: note,
    });
  });

  it("hides an unknown note on any outcome but nothing found", () => {
    // The same note on a category where nothing was found is the model's own, and is shown.
    expect(
      describeCategoryNote(entry("nothing_found", "Something nobody planned for")),
    ).not.toBeNull();
    for (const outcome of ["findings", "search_failed", "skipped"] as const) {
      expect(describeCategoryNote(entry(outcome, "Something nobody planned for"))).toBeNull();
    }
  });

  it("shows nothing for an empty note, and never throws on odd input", () => {
    expect(describeCategoryNote(entry("nothing_found", "A note"))).not.toBeNull();
    expect(describeCategoryNote(entry("nothing_found", ""))).toBeNull();
    expect(describeCategoryNote(entry("nothing_found", "   "))).toBeNull();
    for (const odd of [null, undefined, {}, { outcome: "nothing_found" }, { note: 5 }]) {
      expect(describeCategoryNote(odd as never)).toBeNull();
    }
    expect(describeCategoryNote({ outcome: "mystery", note: "text" } as never)).toBeNull();
    for (const outcome of ["constructor", "__proto__", "toString"]) {
      expect(describeCategoryNote({ outcome, note: "text" } as never)).toBeNull();
    }
  });
});

describe("labels and the per-category line", () => {
  it("builds the line from the category and the outcome, never from the note", () => {
    expect(describeCategoryLine(entry("nothing_found", "Anything the model wrote"))).toBe(
      "Security incidents: nothing found",
    );
    expect(
      describeCategoryLine(entry("findings", "2 potential risks found", "certifications")),
    ).toBe("Certifications: risks found");
    expect(describeCategoryLine(entry("search_failed", "x", "legal_regulatory"))).toBe(
      "Legal and regulatory: could not be researched",
    );
    expect(describeCategoryLine(entry("skipped", "x", "ai_specific"))).toBe(
      "AI-specific risks: skipped",
    );
    expect(describeCategoryLine(entry("nothing_found", "x", "availability"))).toBe(
      "Availability: nothing found",
    );
    expect(describeCategoryLine(entry("findings", "x", "financial_health"))).toBe(
      "Financial health: risks found",
    );
  });

  it("labels the six categories, the four outcomes, the five dismissal reasons and the confidences", () => {
    expect(categoryLabel("security_incidents")).toBe("Security incidents");
    expect(categoryLabel("certifications")).toBe("Certifications");
    expect(categoryLabel("legal_regulatory")).toBe("Legal and regulatory");
    expect(categoryLabel("ai_specific")).toBe("AI-specific risks");
    expect(categoryLabel("availability")).toBe("Availability");
    expect(categoryLabel("financial_health")).toBe("Financial health");
    expect(outcomeLabel("findings")).toBe("risks found");
    expect(outcomeLabel("nothing_found")).toBe("nothing found");
    expect(outcomeLabel("search_failed")).toBe("could not be researched");
    expect(outcomeLabel("skipped")).toBe("skipped");
    expect(dismissReasonLabel("not_applicable")).toBe("Not applicable to this vendor");
    expect(dismissReasonLabel("already_covered")).toBe("Already covered by an existing risk");
    expect(dismissReasonLabel("inaccurate")).toBe("Inaccurate or not supported by the sources");
    expect(dismissReasonLabel("accepted_risk")).toBe("Accepted risk");
    expect(dismissReasonLabel("other")).toBe("Other");
    expect(confidenceLabel("low")).toBe("Low");
    expect(confidenceLabel("medium")).toBe("Medium");
    expect(confidenceLabel("high")).toBe("High");
  });

  it("does not render a value it does not know", () => {
    expect(categoryLabel("supply_chain" as never)).toBe("Other");
    expect(outcomeLabel("mystery" as never)).toBe("unknown");
    expect(dismissReasonLabel("mystery" as never)).toBe("Other");
    expect(confidenceLabel("mystery" as never)).toBe("Unknown");
    expect(describeCategoryLine(null as never)).toBe("Other: unknown");
  });
});

describe("describeProgress", () => {
  const progress = (overrides: Partial<RunProgress> = {}): RunProgress => ({
    phase: "researching",
    steps: 3,
    action: "search",
    category: "security_incidents",
    searchesUsed: 2,
    pagesRead: 1,
    categories: ["security_incidents", "certifications"],
    updatedAt: "2026-10-10T09:00:20.000Z",
    ...overrides,
  });

  it("says what the latest turn is doing, with its category", () => {
    expect(describeProgress(progress()).doing).toBe("Searching the web: Security incidents");
    expect(describeProgress(progress({ action: "read", category: "certifications" })).doing).toBe(
      "Reading a page: Certifications",
    );
  });

  it("leaves the category out of the line for a turn that had none", () => {
    expect(describeProgress(progress({ category: null })).doing).toBe("Searching the web");
    expect(describeProgress(progress({ action: "read", category: null })).doing).toBe(
      "Reading a page",
    );
  });

  it("says the research is starting before the first turn", () => {
    expect(
      describeProgress(
        progress({
          steps: 0,
          action: null,
          category: null,
          searchesUsed: 0,
          pagesRead: 0,
          categories: [],
        }),
      ),
    ).toEqual({ doing: "Starting the research", covered: null, counts: null });
  });

  it("says the findings are being analysed once the research is over", () => {
    expect(describeProgress(progress({ phase: "analysing", action: null })).doing).toBe(
      "Analysing what was found",
    );
  });

  it("says nothing of the step for a turn that did nothing on the web", () => {
    expect(describeProgress(progress({ action: null, category: null })).doing).toBeNull();
  });

  it("lists the categories worked on so far, by their labels", () => {
    expect(describeProgress(progress()).covered).toBe(
      "Researched so far: Security incidents, Certifications",
    );
    expect(describeProgress(progress({ categories: [] })).covered).toBeNull();
  });

  it("counts the searches and the pages, and says nothing while there are none", () => {
    expect(describeProgress(progress()).counts).toBe("Searches: 2, pages read: 1");
    expect(describeProgress(progress({ searchesUsed: 0, pagesRead: 0 })).counts).toBeNull();
    expect(describeProgress(progress({ searchesUsed: 0, pagesRead: 4 })).counts).toBe(
      "Searches: 0, pages read: 4",
    );
  });

  it("has nothing to say about a run without progress", () => {
    for (const none of [null, undefined]) {
      expect(describeProgress(none)).toEqual({ doing: null, covered: null, counts: null });
    }
  });

  it("does not render a value it does not know", () => {
    const odd = progress({
      phase: "mystery" as never,
      action: "mystery" as never,
      category: "supply_chain" as never,
      categories: ["supply_chain", "certifications", 7] as never,
      searchesUsed: "many" as never,
      pagesRead: Number.NaN,
    });

    expect(describeProgress(odd)).toEqual({
      doing: null,
      covered: "Researched so far: Certifications",
      counts: null,
    });
  });

  it("looks up the dictionary with the same keys whatever the data, so that a translation can be checked", () => {
    const keys = new Set<string>();
    const t = (key: string) => {
      keys.add(key);
      return key;
    };
    describeProgress(progress(), t);
    describeProgress(progress({ action: "read" }), t);
    describeProgress(progress({ category: null }), t);
    describeProgress(progress({ action: "read", category: null }), t);
    describeProgress(progress({ steps: 0, action: null }), t);
    describeProgress(progress({ phase: "analysing" }), t);

    expect([...keys].sort()).toEqual(
      [
        "Analysing what was found",
        "Certifications",
        "Reading a page",
        "Reading a page: {category}",
        "Researched so far: {categories}",
        "Searches: {searches}, pages read: {pages}",
        "Searching the web",
        "Searching the web: {category}",
        "Security incidents",
        "Starting the research",
      ].sort(),
    );
    for (const lang of LANGS) {
      expect([...keys].filter((key) => translations[lang][key] === undefined)).toEqual([]);
    }
  });
});

describe("formatResearchDate", () => {
  it("writes the day, the short month and the year in the language of the screen", () => {
    expect(formatResearchDate("2026-03-12", "en")).toBe("12 Mar 2026");
    expect(formatResearchDate("2026-03-12T23:59:59.000Z", "en")).toBe("12 Mar 2026");
    expect(formatResearchDate("2026-03-12", "de")).toBe("12. März 2026");
    expect(formatResearchDate("2026-03-12", "fr")).toBe("12 mars 2026");
    expect(formatResearchDate("2026-03-12", "es")).toBe("12 mar 2026");
  });

  it("falls back to English for a language it does not know", () => {
    expect(formatResearchDate("2026-03-12", "xx")).toBe("12 Mar 2026");
  });

  it("gives null for no date, and for one that does not parse", () => {
    expect(formatResearchDate("2026-03-12", "en")).toBe("12 Mar 2026");
    for (const odd of [null, undefined, "", "not a date", 20260312 as never]) {
      expect(formatResearchDate(odd, "en")).toBeNull();
    }
  });
});

// ── Credibility ──────────────────────────────────────────────────────────────

/** The translator of the English screen: every key is its own text. */
const english = (key: string) => key;

/** A cited source as the credibility rule saw it: by default a page of a host nobody reviewed. */
const cited = (overrides: Partial<CredibilitySource> = {}): CredibilitySource => ({
  url: "https://forum.example/thread/1",
  category: "unverified",
  publisher: "forum.example",
  entry: null,
  reviewed: false,
  reading: "read",
  ...overrides,
});

/** The record of a public database, matched strongly, from a copy of 7 Oct 2026. */
const recordOf = (
  source: RecordSourceId,
  record: Partial<NonNullable<CredibilitySource["record"]>> = {},
): CredibilitySource =>
  cited({
    url: `https://records.example/${source}/1`,
    category: "official",
    publisher: source,
    reviewed: true,
    record: {
      source,
      match: "strong",
      status: "active",
      source_record_id: "CVE-2026-28001",
      as_of: "2026-10-07",
      ...record,
    },
  });

/** A page of a trusted publisher; `name` is the publisher's name as the registry gives it. */
const press = (entry: string, name: string | undefined, url: string): CredibilitySource =>
  cited({
    url,
    category: "trusted_press",
    publisher: entry,
    entry,
    reviewed: true,
    ...(name === undefined ? {} : { publisher_name: name }),
  });

const basisOf = (
  rule: CredibilityRule,
  sources: CredibilitySource[],
  nameOnly = false,
): CredibilityBasis => ({ rule, registry_version: "2026-10-29.1", name_only: nameOnly, sources });

const RECORD_SOURCES: RecordSourceId[] = [
  "kev",
  "nvd",
  "hibp",
  "sec",
  "statuspage",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "cve",
  "un_sanctions",
];

/** The sentence of every rule, with what the server's English line says for the same basis. */
const RULE_SENTENCES: Array<[name: string, basis: CredibilityBasis, sentence: string]> = [
  [
    "a record with its id and the day of its copy",
    basisOf("official_record", [recordOf("kev")]),
    "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.",
  ],
  [
    "a record with its id only",
    basisOf("official_record", [recordOf("kev", { as_of: undefined })]),
    "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001).",
  ],
  [
    "a record with the day of its copy only",
    basisOf("official_record", [recordOf("ofac", { source_record_id: undefined })]),
    "High: OFAC Specially Designated Nationals list lists it, as of 7 Oct 2026.",
  ],
  [
    "a record looked up on the web",
    basisOf("official_record", [
      recordOf("nvd", { source_record_id: undefined, as_of: undefined }),
    ]),
    "High: the National Vulnerability Database lists it.",
  ],
  [
    "a record of the CVE List",
    basisOf("official_record", [recordOf("cve")]),
    "High: the CVE Program lists it (CVE-2026-28001), as of 7 Oct 2026.",
  ],
  [
    "an entry of the UN list matched by an identifier",
    basisOf("official_record", [recordOf("un_sanctions", { source_record_id: "EXe.012" })]),
    "High: UN Security Council Consolidated List lists it (EXe.012), as of 7 Oct 2026.",
  ],
  [
    "an official page",
    basisOf("official_page", [
      cited({ url: "https://www.sec.gov/newsroom/press-releases/2026-1", category: "official" }),
    ]),
    "High: an official source reports it (sec.gov).",
  ],
  [
    "an official page whose address does not parse",
    basisOf("official_page", [cited({ url: "not a url", category: "official" })]),
    "High: an official source reports it.",
  ],
  [
    "the vendor's statement",
    basisOf("vendor_statement", [
      cited({
        url: "https://status.acme.example/incidents/1",
        category: "vendor",
        publisher: "vendor",
        vendor_kind: "statement",
      }),
    ]),
    "High: the vendor states it on its own pages (status.acme.example).",
  ],
  [
    "the vendor's statement on a page whose address does not parse",
    basisOf("vendor_statement", [
      cited({ url: "", category: "vendor", publisher: "vendor", vendor_kind: "statement" }),
    ]),
    "High: the vendor states it on its own pages.",
  ],
  [
    "two trusted publishers",
    basisOf("trusted_press_two", [
      press("reuters", "Reuters", "https://www.reuters.com/a"),
      press("reuters", "Reuters", "https://www.reuters.com/b"),
      press("bbc", "BBC", "https://www.bbc.co.uk/news/1"),
    ]),
    "High: 2 independent trusted publishers report it (Reuters, BBC).",
  ],
  [
    "two trusted publishers with neither a name nor an address",
    basisOf("trusted_press_two", [press("a", undefined, "x"), press("b", undefined, "y")]),
    "High: 2 independent trusted publishers report it.",
  ],
  [
    "one trusted publisher",
    basisOf("trusted_press_one", [
      press("reuters", "Reuters", "https://www.reuters.com/a"),
      cited(),
    ]),
    "Medium: one trusted publisher reports it (Reuters); no official source and no second independent publisher.",
  ],
  [
    "one trusted publisher with neither a name nor an address",
    basisOf("trusted_press_one", [press("reuters", undefined, "x")]),
    "Medium: one trusted publisher reports it; no official source and no second independent publisher.",
  ],
  [
    "search results only",
    basisOf("capped_unconfirmed", [cited({ category: "official", reading: "unconfirmed" })]),
    "Medium: only search results show it; the pages could not be read.",
  ],
  [
    "contradicted results",
    basisOf("contradicted", [cited({ reading: "contradicted" })]),
    "Low: the pages do not hold what the search results quoted.",
  ],
  [
    "an entry matched by name",
    basisOf("name_only", [recordOf("ofac", { match: "weak" })], true),
    "Low: the OFAC SDN list entry matches the vendor by name only.",
  ],
  [
    "unverified sources",
    basisOf("unverified", [
      cited(),
      cited({ url: "https://www.blog.example/post" }),
      cited({ url: "https://forum.example/thread/2" }),
    ]),
    "Low: only unverified sources report it (forum.example, blog.example).",
  ],
  [
    "unverified sources whose addresses do not parse",
    basisOf("unverified", [cited({ url: "nowhere" })]),
    "Low: only unverified sources report it.",
  ],
  [
    "the vendor's own claims",
    basisOf("self_claim", [
      cited({
        url: "https://acme.example/security",
        category: "vendor",
        publisher: "vendor",
        vendor_kind: "self_claim",
      }),
    ]),
    "Low: only the vendor's own claims support it.",
  ],
  [
    "a withdrawn record",
    basisOf("inactive", [recordOf("kev", { status: "withdrawn", as_of: "2026-10-09" })]),
    "Low: CISA Known Exploited Vulnerabilities withdrew the record on 9 Oct 2026.",
  ],
  [
    "a record withdrawn on no known day",
    basisOf("inactive", [recordOf("kev", { status: "withdrawn", as_of: undefined })]),
    "Low: CISA Known Exploited Vulnerabilities withdrew the record.",
  ],
  [
    "a rejected record",
    basisOf("inactive", [recordOf("nvd", { status: "rejected", as_of: "2026-10-09" })]),
    "Low: the National Vulnerability Database rejected the record on 9 Oct 2026.",
  ],
  [
    "a record rejected on no known day",
    basisOf("inactive", [recordOf("nvd", { status: "rejected", as_of: undefined })]),
    "Low: the National Vulnerability Database rejected the record.",
  ],
  [
    "a CVE the CVE Program rejected",
    basisOf("inactive", [recordOf("cve", { status: "rejected", as_of: "2026-10-31" })]),
    "Low: the CVE Program rejected the record on 31 Oct 2026.",
  ],
  [
    "a record whose CVE the CVE Program rejected",
    basisOf("inactive", [
      recordOf("kev", { status: "rejected", as_of: "2026-10-31", rejected_by: "cve" }),
    ]),
    "Low: the CVE Program rejected the record on 31 Oct 2026.",
  ],
  [
    "a record whose CVE the NVD rejected",
    basisOf("inactive", [
      recordOf("kev", { status: "rejected", as_of: "2026-10-31", rejected_by: "nvd" }),
    ]),
    "Low: the National Vulnerability Database rejected the record on 31 Oct 2026.",
  ],
  [
    "an entry the UN delisted",
    basisOf("inactive", [recordOf("un_sanctions", { status: "delisted", as_of: "2026-10-09" })]),
    "Low: UN Security Council Consolidated List removed the record on 9 Oct 2026.",
  ],
  [
    "a delisted entry",
    basisOf("inactive", [recordOf("ofac", { status: "delisted", as_of: "2026-10-09" })]),
    "Low: OFAC Specially Designated Nationals list removed the record on 9 Oct 2026.",
  ],
  [
    "an entry delisted on no known day",
    basisOf("inactive", [recordOf("ofac", { status: "delisted", as_of: undefined })]),
    "Low: OFAC Specially Designated Nationals list removed the record.",
  ],
];

const NAME_ONLY_NOTE = "Matched by name only: this may be another company.";

describe("credibilityRationale", () => {
  it.each(RULE_SENTENCES)("words %s as the server's line does", (_name, basis, sentence) => {
    expect(credibilityRationale(basis, english, "en")).toEqual({ sentence, stale: null });
  });

  it("names a publisher by its host when the registry gives no name, and each entry once", () => {
    const { sentence } = credibilityRationale(
      basisOf("trusted_press_two", [
        press("ft", undefined, "https://www.ft.com/content/1"),
        press("bbc", "BBC", "https://www.bbc.co.uk/news/1"),
        press("bbc", "BBC News", "https://www.bbc.co.uk/news/2"),
      ]),
      english,
      "en",
    );
    expect(sentence).toBe("High: 2 independent trusted publishers report it (ft.com, BBC).");
  });

  it("holds with what supports the label: the first source read, never a contradicted one or an inactive record", () => {
    const page = credibilityRationale(
      basisOf("official_page", [
        cited({ url: "https://www.ftc.gov/a", category: "official", reading: "contradicted" }),
        cited({ url: "https://www.sec.gov/b", category: "official", reading: "unconfirmed" }),
        cited({ url: "https://www.fca.org.uk/c", category: "official" }),
      ]),
      english,
      "en",
    );
    expect(page.sentence).toBe("High: an official source reports it (fca.org.uk).");

    const record = credibilityRationale(
      basisOf("official_record", [
        recordOf("kev", { status: "withdrawn", source_record_id: "CVE-2026-1" }),
        recordOf("ofac", { match: "weak", source_record_id: "29001" }),
        recordOf("kev", { source_record_id: "CVE-2026-2" }),
      ]),
      english,
      "en",
    );
    expect(record.sentence).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-2), as of 7 Oct 2026.",
    );
  });

  it("names the list of every database a record can match by name", () => {
    const sentenceOf = (source: RecordSourceId) =>
      credibilityRationale(
        basisOf("name_only", [recordOf(source, { match: "weak" })], true),
        english,
        "en",
      ).sentence;
    expect(sentenceOf("uk_sanctions")).toBe(
      "Low: the UK Sanctions List entry matches the vendor by name only.",
    );
    expect(sentenceOf("eu_fsf")).toBe(
      "Low: the EU financial sanctions list entry matches the vendor by name only.",
    );
    expect(sentenceOf("sec")).toBe(
      "Low: the SEC EDGAR filings entry matches the vendor by name only.",
    );
    expect(sentenceOf("nvd")).toBe("Low: the NVD entry matches the vendor by name only.");
    expect(sentenceOf("cve")).toBe("Low: the CVE List entry matches the vendor by name only.");
    expect(sentenceOf("un_sanctions")).toBe(
      "Low: the UN Security Council Consolidated List entry matches the vendor by name only.",
    );
  });

  it("a rejected CVE reads as rejected by the CVE Program, whichever list's record it was", () => {
    const rejected = (source: RecordSourceId) =>
      credibilityRationale(
        basisOf("inactive", [
          recordOf(source, { status: "rejected", as_of: undefined, rejected_by: "cve" }),
        ]),
        english,
        "en",
      ).sentence;
    for (const source of ["kev", "nvd", "cve"] as const) {
      expect(rejected(source)).toBe("Low: the CVE Program rejected the record.");
    }
    // A list the screen does not know rejected it: no sentence, rather than one that blames the
    // record's own list.
    expect(
      credibilityRationale(
        basisOf("inactive", [
          recordOf("kev", { status: "rejected", rejected_by: "mystery" as RecordSourceId }),
        ]),
        english,
        "en",
      ),
    ).toEqual({ sentence: "", stale: null });
  });

  it("an identifier match has no name-only note", () => {
    const basis = basisOf("official_record", [
      recordOf("un_sanctions", { source_record_id: "EXe.012" }),
      recordOf("uk_sanctions", { source_record_id: "RUS3601" }),
    ]);
    expect(credibilityRationale(basis, english, "en").sentence).toBe(
      "High: UN Security Council Consolidated List lists it (EXe.012), as of 7 Oct 2026.",
    );
    expect(nameOnlyNote(basis, english)).toBeNull();
  });

  it("reads the day of a copy only from a day or an ISO time, as the server does", () => {
    const dayOf = (as_of: string) =>
      credibilityRationale(basisOf("official_record", [recordOf("kev", { as_of })]), english, "en")
        .sentence;
    expect(dayOf("2026-10-07T09:23:00.000Z")).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.",
    );
    for (const odd of ["7 Oct 2026", "Oct 7, 2026", "2026-10-07 09:23", "2026-13-45", ""]) {
      expect(dayOf(odd)).toBe(
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001).",
      );
    }
  });

  it("adds the day of the oldest out-of-date copy that a finding cites", () => {
    const words = credibilityRationale(
      basisOf("official_record", [
        recordOf("kev", { stale: true, as_of: "2026-10-07" }),
        recordOf("ofac", { match: "weak", stale: true, as_of: "2026-10-05" }),
        recordOf("uk_sanctions", { stale: true, as_of: undefined }),
        recordOf("eu_fsf", { as_of: "2026-10-01" }),
      ]),
      english,
      "en",
    );
    expect(words).toEqual({
      sentence:
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.",
      stale: "The source has not been updated since 5 Oct 2026.",
    });
  });

  it("shows nothing for a rule it does not know, a basis without the source its rule needs, or no basis", () => {
    const nothing = { sentence: "", stale: null };
    const stale = recordOf("kev", { stale: true });
    for (const basis of [
      basisOf("mystery" as CredibilityRule, [stale]),
      basisOf("constructor" as CredibilityRule, [stale]),
      basisOf("official_record", [cited(), recordOf("kev", { match: "weak" })]),
      basisOf("official_record", [recordOf("mystery" as RecordSourceId)]),
      basisOf("official_page", [recordOf("kev")]),
      basisOf("vendor_statement", [cited({ category: "vendor", vendor_kind: "self_claim" })]),
      basisOf("name_only", [recordOf("ofac")]),
      basisOf("name_only", [recordOf("mystery" as RecordSourceId, { match: "weak" })]),
      basisOf("inactive", [recordOf("kev", { stale: true })]),
      basisOf("inactive", [recordOf("kev", { status: "revoked" as never })]),
      { ...basisOf("official_record", []), sources: "nope" as never },
      { ...basisOf("official_record", []), sources: [null, 7] as never },
    ]) {
      expect(credibilityRationale(basis, english, "en")).toEqual(nothing);
    }
    expect(credibilityRationale(null, english, "en")).toEqual(nothing);
    expect(credibilityRationale(undefined, english, "en")).toEqual(nothing);
  });

  it("writes the days in the language of the screen", () => {
    const t = (key: string) => translations.de[key] ?? key;
    const words = credibilityRationale(
      basisOf("official_record", [recordOf("kev", { stale: true, as_of: "2026-03-12" })]),
      t,
      "de",
    );
    expect(words.sentence).toContain(formatResearchDate("2026-03-12", "de"));
    expect(words.sentence).not.toContain("Mar 2026");
    expect(words.stale).toContain(formatResearchDate("2026-03-12", "de"));
  });
});

describe("nameOnlyNote", () => {
  it("is the note whenever a cited record matched by name only, whatever the rule", () => {
    expect(
      nameOnlyNote(basisOf("name_only", [recordOf("ofac", { match: "weak" })], true), english),
    ).toBe(NAME_ONLY_NOTE);
    // The weak record caps only what it gives: two trusted publishers still make High, with the note.
    expect(
      nameOnlyNote(
        basisOf(
          "trusted_press_two",
          [
            recordOf("ofac", { match: "weak" }),
            press("reuters", "Reuters", "https://www.reuters.com/a"),
            press("bbc", "BBC", "https://www.bbc.co.uk/news/1"),
          ],
          true,
        ),
        english,
      ),
    ).toBe(NAME_ONLY_NOTE);
  });

  it("is nothing otherwise", () => {
    expect(nameOnlyNote(basisOf("official_record", [recordOf("kev")]), english)).toBeNull();
    expect(
      nameOnlyNote({ ...basisOf("name_only", []), name_only: "true" as never }, english),
    ).toBeNull();
    expect(nameOnlyNote(null, english)).toBeNull();
    expect(nameOnlyNote(undefined, english)).toBeNull();
  });
});

describe("the labels the backfill wrote (M3)", () => {
  it("a label carried over from the confidence says so, and nothing else", () => {
    expect(credibilityRationale({ rule: "legacy_confidence" }, english, "en")).toEqual({
      sentence: "Rated with the earlier confidence rule.",
      stale: null,
    });
  });

  it("a label the backfill decided again reads its rule's sentence, then that it was rated again", () => {
    expect(
      credibilityRationale(
        { ...basisOf("unverified", [cited()]), rule: "backfill_unverified" },
        english,
        "en",
      ),
    ).toEqual({
      sentence:
        "Low: only unverified sources report it (forum.example). Rated again with the current rule.",
      stale: null,
    });
  });

  it("a label the backfill decided again under a rule without a sentence reads only the note", () => {
    expect(
      credibilityRationale(
        { ...basisOf("official_record", [cited()]), rule: "backfill_official_record" },
        english,
        "en",
      ).sentence,
    ).toBe("Rated again with the current rule.");
    // A rule nobody knows under the backfill's name is no rule.
    expect(
      credibilityRationale(
        { ...basisOf("unverified", [cited()]), rule: "backfill_mystery" as never },
        english,
        "en",
      ),
    ).toEqual({ sentence: "", stale: null });
  });

  it("the name-only note follows a basis of the backfill, and a carried-over label has none", () => {
    expect(
      nameOnlyNote(
        {
          ...basisOf("name_only", [recordOf("ofac", { match: "weak" })], true),
          rule: "backfill_name_only",
        },
        english,
      ),
    ).toBe(NAME_ONLY_NOTE);
    expect(nameOnlyNote({ rule: "legacy_confidence" }, english)).toBeNull();
  });
});

describe("the labels of credibility", () => {
  it("names each label, each category of a source and each status of a record that is not active", () => {
    expect(
      ["low", "medium", "high"].map((label) => credibilityLabel(label as never, english)),
    ).toEqual(["Low", "Medium", "High"]);
    expect(
      ["official", "trusted_press", "vendor", "unverified"].map((category) =>
        sourceCategoryLabel(category as never, english),
      ),
    ).toEqual(["Official", "Trusted press", "Vendor", "Unverified"]);
    expect(
      ["withdrawn", "rejected", "delisted"].map((status) =>
        recordStatusLabel(status as never, english),
      ),
    ).toEqual(["Withdrawn", "Rejected", "Delisted"]);
  });

  it("shows nothing for a value it does not know, and nothing for an active record", () => {
    for (const odd of ["certain", "constructor", "", null, undefined]) {
      expect(credibilityLabel(odd as never, english)).toBeNull();
      expect(sourceCategoryLabel(odd as never, english)).toBeNull();
      expect(recordStatusLabel(odd as never, english)).toBeNull();
    }
    expect(sourceCategoryLabel("toString" as never, english)).toBeNull();
    expect(recordStatusLabel("active", english)).toBeNull();
  });
});

describe("coverageLines", () => {
  /** One list as a run saw it: asked, nothing found, a copy an hour old. Its name is the server's. */
  const listCopy = (id: VrdbSourceId, overrides: Partial<CoverageSource> = {}): CoverageSource => ({
    id,
    name: "The server's name",
    attribution: "The server's attribution",
    mode: "mirror",
    checked: true,
    outcome: "none",
    strong: 0,
    weak: 0,
    last_success_at: "2026-10-10T11:00:00.000Z",
    stale: false,
    ...overrides,
  });
  const coverageOf = (overrides: Partial<RunCoverage> = {}): RunCoverage => ({
    registry_version: "2026-10-29.1",
    sources: [
      listCopy("kev", { outcome: "found", strong: 1 }),
      listCopy("ofac", { outcome: "found", weak: 2 }),
      listCopy("uk_sanctions"),
      listCopy("eu_fsf"),
    ],
    lookups: [
      { id: "nvd", outcome: "found" },
      { id: "sec", outcome: "none" },
      { id: "hibp", outcome: "not_researched" },
      { id: "statuspage", outcome: "failed" },
    ],
    cited: { official: 2, trusted_press: 1, vendor: 0, unverified: 3 },
    ...overrides,
  });
  const linesOf = (coverage: RunCoverage) => coverageLines(coverage, english, "en");
  const ATTRIBUTIONS = [
    "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
    "OFAC Specially Designated Nationals list, US Department of the Treasury",
    "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
    "EU consolidated list of financial sanctions, © European Union",
  ];

  it("lists what the run checked, with the records each list held, in the screen's own names", () => {
    expect(linesOf(coverageOf()).checked).toBe(
      "Checked: CISA Known Exploited Vulnerabilities (1), OFAC Specially Designated Nationals list (2), UK Sanctions List (0), EU consolidated list of financial sanctions (0), the National Vulnerability Database, SEC EDGAR",
    );
  });

  it("names the lists and the databases the run could not check", () => {
    expect(linesOf(coverageOf()).notChecked).toBe("Not checked: the vendor's status page");
    const noCopy = coverageOf({
      sources: [
        listCopy("kev", { outcome: "found", strong: 1 }),
        listCopy("ofac", { checked: false, outcome: "failed", last_success_at: null }),
        listCopy("uk_sanctions", { checked: false, outcome: "failed", last_success_at: null }),
        listCopy("eu_fsf", { checked: false, outcome: "not_researched" }),
      ],
      lookups: [
        { id: "nvd", outcome: "found" },
        { id: "hibp", outcome: "off" },
      ],
    });
    expect(linesOf(noCopy).notChecked).toBe(
      "Not checked: OFAC Specially Designated Nationals list, UK Sanctions List",
    );
    expect(linesOf(coverageOf({ lookups: [] })).notChecked).toBeNull();
  });

  it("says which lists held no record, as of the days of their copies", () => {
    expect(linesOf(coverageOf()).none).toBe(
      "No records in UK Sanctions List, EU consolidated list of financial sanctions as of 10 Oct 2026",
    );
    const twoDays = coverageOf({
      sources: [
        listCopy("ofac", { last_success_at: "2026-10-09T23:00:00.000Z" }),
        listCopy("uk_sanctions"),
        listCopy("eu_fsf"),
      ],
    });
    expect(linesOf(twoDays).none).toBe(
      "No records in OFAC Specially Designated Nationals list, UK Sanctions List, EU consolidated list of financial sanctions as of 9 Oct 2026, 10 Oct 2026",
    );
    const found = coverageOf({ sources: [listCopy("kev", { outcome: "found", strong: 1 })] });
    expect(linesOf(found).none).toBeNull();
  });

  it("names each out-of-date list the run checked, with the day of its copy", () => {
    const stale = coverageOf({
      sources: [
        listCopy("kev", {
          outcome: "found",
          strong: 1,
          stale: true,
          last_success_at: "2026-10-07T09:23:00.000Z",
        }),
        listCopy("ofac", { stale: true, last_success_at: "2026-10-07T09:41:00.000Z" }),
        // Not asked by this run, so not what its findings rest on.
        listCopy("uk_sanctions", {
          checked: false,
          outcome: "not_researched",
          stale: true,
          last_success_at: "2026-10-06T00:00:00.000Z",
        }),
        listCopy("eu_fsf"),
      ],
    });
    expect(linesOf(stale).stale).toEqual([
      "CISA Known Exploited Vulnerabilities: last updated 7 Oct 2026, not up to date",
      "OFAC Specially Designated Nationals list: last updated 7 Oct 2026, not up to date",
    ]);
    expect(linesOf(coverageOf()).stale).toEqual([]);
  });

  it("counts the sources that the findings cite, by category", () => {
    expect(linesOf(coverageOf()).cited).toBe(
      "Sources cited: 2 official, 1 trusted press, 0 vendor, 3 unverified",
    );
    const odd = coverageOf({
      cited: { official: "2" as never, trusted_press: -1, vendor: Number.NaN, unverified: 1.7 },
    });
    expect(linesOf(odd).cited).toBe(
      "Sources cited: 0 official, 0 trusted press, 0 vendor, 1 unverified",
    );
    expect(linesOf(coverageOf({ cited: undefined as never })).cited).toBe(
      "Sources cited: 0 official, 0 trusted press, 0 vendor, 0 unverified",
    );
  });

  it("says the public databases are turned off when every list is", () => {
    const off = coverageOf({
      sources: (["kev", "ofac", "uk_sanctions", "eu_fsf"] as const).map((id) =>
        listCopy(id, { checked: false, outcome: "off" }),
      ),
      lookups: [
        { id: "nvd", outcome: "off" },
        { id: "sec", outcome: "off" },
      ],
      cited: { official: 0, trusted_press: 1, vendor: 0, unverified: 0 },
    });
    expect(linesOf(off)).toEqual({
      checked: null,
      notChecked: null,
      none: null,
      stale: [],
      cited: "Sources cited: 0 official, 1 trusted press, 0 vendor, 0 unverified",
      off: true,
      attributions: [],
    });
  });

  it("does not call the databases turned off when the run checked none of them for another reason", () => {
    expect(linesOf(coverageOf({ sources: [], lookups: [] })).off).toBe(false);
    const someOff = coverageOf({
      sources: [
        listCopy("kev", { checked: false, outcome: "off" }),
        listCopy("ofac", { checked: false, outcome: "failed" }),
      ],
    });
    expect(linesOf(someOff).off).toBe(false);
  });

  it("gives the attribution of every list it checked, in the screen's own words", () => {
    expect(linesOf(coverageOf()).attributions).toEqual(ATTRIBUTIONS);
    const ukFailed = coverageOf({
      sources: [
        listCopy("kev", { outcome: "found", strong: 1 }),
        listCopy("ofac"),
        listCopy("uk_sanctions", { checked: false, outcome: "failed" }),
        listCopy("eu_fsf", { checked: false, outcome: "not_researched" }),
      ],
    });
    expect(linesOf(ukFailed).attributions).toEqual(ATTRIBUTIONS.slice(0, 2));
  });

  describe("with the lists of M2: the NVD and the SEC read through, the CVE and UN lists mirrored", () => {
    const NOTICES = {
      nvd: "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
      sec: "SEC EDGAR, US Securities and Exchange Commission",
      cve: "CVE® records © The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse)",
      un_sanctions: "United Nations Security Council Consolidated List",
    };
    /** A run of the M2 server: the NVD is a source of the vendor risk database, not a lookup. */
    const m2 = (overrides: Partial<RunCoverage> = {}) =>
      coverageOf({
        sources: [
          listCopy("kev", { outcome: "found", strong: 1 }),
          listCopy("nvd", {
            mode: "read_through",
            outcome: "found",
            strong: 2,
            last_success_at: "2026-10-10T08:30:00.000Z",
          }),
          listCopy("ofac", { outcome: "found", weak: 2 }),
          listCopy("uk_sanctions"),
          listCopy("eu_fsf"),
        ],
        lookups: [
          { id: "hibp", outcome: "not_researched" },
          { id: "sec", outcome: "none" },
          { id: "statuspage", outcome: "failed" },
        ],
        ...overrides,
      });

    it("the NVD is checked as a database, with its notice in the data sources", () => {
      const lines = linesOf(m2());
      expect(lines.checked).toBe(
        "Checked: CISA Known Exploited Vulnerabilities (1), the National Vulnerability Database (2), OFAC Specially Designated Nationals list (2), UK Sanctions List (0), EU consolidated list of financial sanctions (0), SEC EDGAR",
      );
      expect(lines.notChecked).toBe("Not checked: the vendor's status page");
      expect(lines.attributions).toEqual([ATTRIBUTIONS[0], NOTICES.nvd, ...ATTRIBUTIONS.slice(1)]);
    });

    it("says when the NVD answered nothing, failed or was not asked, as it does for a copy", () => {
      const nvd = (overrides: Partial<CoverageSource>) =>
        linesOf(
          m2({
            sources: [
              listCopy("nvd", {
                mode: "read_through",
                last_success_at: "2026-10-09T23:00:00.000Z",
                ...overrides,
              }),
            ],
            lookups: [],
          }),
        );

      const none = nvd({ outcome: "none" });
      expect(none.checked).toBe("Checked: the National Vulnerability Database (0)");
      expect(none.none).toBe("No records in the National Vulnerability Database as of 9 Oct 2026");
      expect(none.attributions).toEqual([NOTICES.nvd]);

      const failed = nvd({ checked: false, outcome: "failed", last_success_at: null });
      expect(failed.checked).toBeNull();
      expect(failed.notChecked).toBe("Not checked: the National Vulnerability Database");
      expect(failed.attributions).toEqual([]);

      // A vendor with nothing to ask the NVD by (no domain, no product): not a gap of the run.
      const unasked = nvd({ checked: false, outcome: "not_researched", last_success_at: null });
      expect(unasked.checked).toBeNull();
      expect(unasked.notChecked).toBeNull();
      expect(unasked.attributions).toEqual([]);

      const stale = nvd({ outcome: "none", stale: true });
      expect(stale.stale).toEqual([
        "the National Vulnerability Database: last updated 9 Oct 2026, not up to date",
      ]);
    });

    it("names the SEC, the CVE List and the UN list, with what their terms ask the screen to say", () => {
      const lines = linesOf(
        m2({
          sources: [
            listCopy("sec", { mode: "read_through", outcome: "found", strong: 1 }),
            listCopy("cve"),
            listCopy("un_sanctions", { outcome: "found", strong: 1 }),
          ],
          lookups: [
            { id: "hibp", outcome: "none" },
            { id: "statuspage", outcome: "none" },
          ],
        }),
      );
      expect(lines.checked).toBe(
        "Checked: SEC EDGAR (1), the CVE Program (0), UN Security Council Consolidated List (1), Have I Been Pwned, the vendor's status page",
      );
      expect(lines.none).toBe("No records in the CVE Program as of 10 Oct 2026");
      expect(lines.attributions).toEqual([NOTICES.sec, NOTICES.cve, NOTICES.un_sanctions]);
    });

    it("turned off, the NVD is off with the lists", () => {
      const off = linesOf(
        m2({
          sources: (["kev", "nvd", "ofac", "uk_sanctions", "eu_fsf"] as const).map((id) =>
            listCopy(id, {
              checked: false,
              outcome: "off",
              mode: id === "nvd" ? "read_through" : "mirror",
            }),
          ),
        }),
      );
      expect(off.off).toBe(true);
      expect(off.attributions).toEqual([]);
    });

    it("a run stored before M2 still shows the NVD among the databases it asked", () => {
      expect(linesOf(coverageOf()).checked).toContain(
        "EU consolidated list of financial sanctions (0), the National Vulnerability Database, SEC EDGAR",
      );
    });
  });

  it("leaves out a list or a database it does not know", () => {
    const lines = linesOf(
      coverageOf({
        sources: [
          listCopy("mystery" as VrdbSourceId, { outcome: "found", strong: 3, stale: true }),
          listCopy("constructor" as VrdbSourceId),
          listCopy("kev"),
        ],
        lookups: [{ id: "mystery" as RecordSourceId, outcome: "found" }],
      }),
    );
    expect(lines.checked).toBe("Checked: CISA Known Exploited Vulnerabilities (0)");
    expect(lines.none).toBe("No records in CISA Known Exploited Vulnerabilities as of 10 Oct 2026");
    expect(lines.stale).toEqual([]);
    expect(lines.attributions).toEqual(ATTRIBUTIONS.slice(0, 1));
    expect(JSON.stringify(lines)).not.toContain("server");
  });

  it("writes the days in the language of the screen", () => {
    const t = (key: string) => translations.fr[key] ?? key;
    const lines = coverageLines(
      coverageOf({
        sources: [listCopy("ofac", { stale: true, last_success_at: "2026-03-12T11:00:00.000Z" })],
      }),
      t,
      "fr",
    );
    expect(lines.none).toContain(formatResearchDate("2026-03-12", "fr"));
    expect(lines.stale[0]).toContain(formatResearchDate("2026-03-12", "fr"));
  });
});

describe("joinAttributions", () => {
  it("drops an attribution's own full stop before the semicolon that joins it to the next", () => {
    expect(
      joinAttributions([
        "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
        "OFAC Specially Designated Nationals list, US Department of the Treasury",
        "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
        "EU consolidated list of financial sanctions, © European Union",
      ]),
    ).toBe(
      "CISA Known Exploited Vulnerabilities catalog (CC0 1.0); OFAC Specially Designated Nationals list, US Department of the Treasury; UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0; EU consolidated list of financial sanctions, © European Union",
    );
  });

  it("leaves the last attribution as its owner wrote it, and a lone one too", () => {
    const NVD =
      "This product uses data from the NVD API but is not endorsed or certified by the NVD.";
    expect(joinAttributions(["United Nations Security Council Consolidated List", NVD])).toBe(
      `United Nations Security Council Consolidated List; ${NVD}`,
    );
    expect(joinAttributions([NVD])).toBe(NVD);
    expect(joinAttributions([])).toBe("");
  });
});

describe("translation", () => {
  /** Every key the helpers look up while describing the whole closed sets. */
  const keysRequested = () => {
    const keys = new Set<string>();
    const t = (key: string) => {
      keys.add(key);
      return key;
    };
    for (const [stored] of RUN_ERRORS) describeRunError(stored, t);
    for (const stored of RETIRED_RUN_ERRORS) describeRunError(stored, t);
    describeRunError("unknown", t);
    describeRunError(null, t);
    for (const [outcome, stored] of FIXED_NOTES) describeCategoryNote(entry(outcome, stored), t);
    describeCategoryNote(entry("nothing_found", "A note the model wrote"), t);
    for (const category of [
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
      "availability",
      "financial_health",
    ] as const) {
      for (const outcome of ["findings", "nothing_found", "search_failed", "skipped"] as const) {
        describeCategoryLine(entry(outcome, "", category), t);
      }
    }
    for (const reason of [
      "not_applicable",
      "already_covered",
      "inaccurate",
      "accepted_risk",
      "other",
    ] as const) {
      dismissReasonLabel(reason, t);
    }
    for (const confidence of ["low", "medium", "high"] as const) confidenceLabel(confidence, t);
    // What a value the client does not know is shown as.
    categoryLabel("mystery" as never, t);
    outcomeLabel("mystery" as never, t);
    dismissReasonLabel("mystery" as never, t);
    confidenceLabel("mystery" as never, t);
    // Every sentence of the credibility rules, and the names of the databases they name.
    for (const [, basis] of RULE_SENTENCES) credibilityRationale(basis, t, "en");
    credibilityRationale(basisOf("official_record", [recordOf("kev", { stale: true })]), t, "en");
    for (const source of RECORD_SOURCES) {
      credibilityRationale(basisOf("official_record", [recordOf(source)]), t, "en");
      credibilityRationale(
        basisOf("name_only", [recordOf(source, { match: "weak" })], true),
        t,
        "en",
      );
    }
    nameOnlyNote(basisOf("name_only", [], true), t);
    for (const label of ["low", "medium", "high"] as const) credibilityLabel(label, t);
    for (const category of ["official", "trusted_press", "vendor", "unverified"] as const) {
      sourceCategoryLabel(category, t);
    }
    for (const status of ["withdrawn", "rejected", "delisted"] as const)
      recordStatusLabel(status, t);
    // The coverage of a run, with every list and every database checked, and a stale copy.
    coverageLines(
      {
        registry_version: "2026-10-29.1",
        sources: (
          ["kev", "nvd", "sec", "ofac", "uk_sanctions", "eu_fsf", "cve", "un_sanctions"] as const
        ).map((id) => ({
          id,
          name: id,
          attribution: id,
          mode: "mirror" as const,
          checked: true,
          outcome: "none" as const,
          strong: 0,
          weak: 0,
          last_success_at: "2026-10-10T11:00:00.000Z",
          stale: true,
        })),
        lookups: RECORD_SOURCES.map((id) => ({ id, outcome: "found" as const })),
        cited: { official: 1, trusted_press: 1, vendor: 1, unverified: 1 },
      },
      t,
      "en",
    );
    return [...keys];
  };

  it("looks up the dictionary for the closed sets, so that the check below has something to check", () => {
    expect(keysRequested()).toEqual(
      expect.arrayContaining([
        "The model call timed out.",
        "The web could not be reached from the server.",
        "{category}: {outcome}",
        "AI note (unverified)",
        "Not applicable to this vendor",
        "High: {operator} lists it ({record}), as of {date}.",
        "Low: {operator} removed the record.",
        "The source has not been updated since {date}.",
        "Matched by name only: this may be another company.",
        "Trusted press",
        "Delisted",
        "the vendor's status page",
        "OFAC SDN list",
        "No records in {sources} as of {dates}",
        "{source}: last updated {date}, not up to date",
        "the CVE Program",
        "UN Security Council Consolidated List",
        "NVD",
        "SEC EDGAR filings",
        "CVE List",
      ]),
    );
  });

  it.each(LANGS)("has a %s entry for every sentence and label the helpers can produce", (lang) => {
    const missing = keysRequested().filter((key) => translations[lang][key] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(LANGS)("describes a run error and a category line in %s", (lang) => {
    const t = (key: string) => translations[lang][key] ?? key;
    expect(describeRunError("timed out", t)).toBe(
      translations[lang]["The research run timed out."],
    );
    expect(describeRunError("Model call failed: HTTP 502", t)).toContain("502");
    expect(describeRunError("Model call failed: HTTP 502", t)).not.toContain("{status}");
    expect(describeCategoryLine(entry("nothing_found", ""), t)).not.toBe(
      "Security incidents: nothing found",
    );
    expect(describeCategoryNote(entry("nothing_found", "A note"), t)).toEqual({
      kind: "model",
      text: "A note",
      label: translations[lang]["AI note (unverified)"],
    });
  });

  it.each(LANGS)("fills the counts of the page note into the %s sentence", (lang) => {
    const t = (key: string) => translations[lang][key] ?? key;
    const note = describeCategoryNote(
      entry("nothing_found", "No risks found; 2 of 5 pages could not be read"),
      t,
    );
    expect(note).toMatchObject({ kind: "fixed" });
    const text = note?.text ?? "";
    expect(text).toContain("2");
    expect(text).toContain("5");
    expect(text).not.toContain("{");
    expect(text).not.toBe("No risks were found. 2 of 5 pages could not be read.");
  });

  it("reads the language that is active when no translator is passed", async () => {
    await setLanguage("de");
    try {
      expect(describeRunError("timed out")).toBe(translations.de["The research run timed out."]);
    } finally {
      await setLanguage("en");
    }
  });
});
