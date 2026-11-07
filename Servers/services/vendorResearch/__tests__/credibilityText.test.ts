/**
 * The English line of a credibility label (spec D5.5): one sentence per rule, from the stored
 * basis, for the clients that do not translate it. The client renders the same basis in the
 * person's language.
 */
import type {
  CredibilityBasis,
  CredibilityRule,
  CredibilitySource,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { NAME_ONLY_NOTE, credibilityRationale, dayOf } from "../credibilityText";

const source = (overrides: Partial<CredibilitySource> & Pick<CredibilitySource, "url">) =>
  ({
    category: "unverified",
    publisher: new URL(overrides.url).hostname.replace(/^www\./, ""),
    entry: null,
    reviewed: false,
    reading: "read",
    ...overrides,
  }) as CredibilitySource;

const basis = (
  rule: CredibilityRule,
  sources: CredibilitySource[],
  nameOnly = false,
): CredibilityBasis => ({ rule, registry_version: "sr-2", name_only: nameOnly, sources });

const KEV_RECORD = source({
  url: "https://nvd.nist.gov/vuln/detail/CVE-2026-31337",
  category: "official",
  publisher: "kev",
  reviewed: true,
  record: {
    source: "kev",
    match: "strong",
    status: "active",
    source_record_id: "CVE-2026-31337",
    as_of: "2026-10-28",
  },
});
const REUTERS = source({
  url: "https://www.reuters.com/technology/acme-breach-2026-10-01/",
  category: "trusted_press",
  publisher: "reuters",
  publisher_name: "Reuters",
  entry: "reuters",
  reviewed: true,
});
const BBC = source({
  url: "https://www.bbc.co.uk/news/technology-1",
  category: "trusted_press",
  publisher: "bbc",
  publisher_name: "BBC",
  entry: "bbc",
  reviewed: true,
});
const OFAC_BY_NAME = source({
  url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=1001",
  category: "official",
  publisher: "ofac",
  reviewed: true,
  record: {
    source: "ofac",
    match: "weak",
    status: "active",
    source_record_id: "1001",
    as_of: "2026-10-29",
  },
});
// A case study of MITRE ATLAS is trusted press by class but only ever matches by name, so it is
// no publisher: the sentence of the Medium rule must not count it among the trusted publishers.
const ATLAS_BY_NAME = source({
  url: "https://atlas.mitre.org/studies/AML.CS9001",
  category: "trusted_press",
  publisher: "atlas",
  reviewed: true,
  record: {
    source: "atlas",
    match: "weak",
    status: "active",
    source_record_id: "AML.CS9001",
    as_of: "2026-10-29",
  },
});

// An entry of the US Consolidated Screening List and a recall of an AI-enabled device are official
// records that only ever match by name or, for the screening list, by a website: the line names the
// list as its definition (vrdb/sources.ts) calls it.
const CSL_BY_NAME = source({
  url: "https://www.trade.gov/consolidated-screening-list?list=el&entry=acmeanalytics",
  category: "official",
  publisher: "csl",
  reviewed: true,
  record: {
    source: "csl",
    match: "weak",
    status: "active",
    source_record_id: "el:acmeanalytics",
    as_of: "2026-11-07",
  },
});
const CSL_BY_WEBSITE = {
  ...CSL_BY_NAME,
  record: { ...CSL_BY_NAME.record!, match: "strong" },
} as CredibilitySource;
const RECALL_BY_NAME = source({
  url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=90001",
  category: "official",
  publisher: "fda_device_recalls",
  reviewed: true,
  record: {
    source: "fda_device_recalls",
    match: "weak",
    status: "active",
    source_record_id: "90001",
    as_of: "2026-11-07",
  },
});

describe("credibilityRationale", () => {
  it("an official record: its operator, its id and the day of the copy", () => {
    expect(credibilityRationale(basis("official_record", [KEV_RECORD]))).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026.",
    );
  });

  it("an official record of a database that is not mirrored: its name, and no id or day it lacks", () => {
    const nvd = source({
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1",
      category: "official",
      publisher: "nvd",
      record: { source: "nvd", match: "strong", status: "active" },
    });

    expect(credibilityRationale(basis("official_record", [nvd]))).toBe(
      "High: the National Vulnerability Database lists it.",
    );
  });

  it("an official record the NVD was read through for: its name, its id and the day of its answer", () => {
    const nvd = source({
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1",
      category: "official",
      publisher: "nvd",
      record: {
        source: "nvd",
        match: "strong",
        status: "active",
        source_record_id: "CVE-2026-1",
        as_of: "2026-10-30",
      },
    });

    expect(credibilityRationale(basis("official_record", [nvd]))).toBe(
      "High: the National Vulnerability Database lists it (CVE-2026-1), as of 30 Oct 2026.",
    );
  });

  it("an official page: its host", () => {
    const page = source({
      url: "https://www.ftc.gov/news-events/news/press-releases/acme",
      category: "official",
      entry: "ftc",
    });

    expect(credibilityRationale(basis("official_page", [page]))).toBe(
      "High: an official source reports it (ftc.gov).",
    );
  });

  it("a statement of the vendor: the host of its page", () => {
    const statement = source({
      url: "https://acme.example/security/incident-2026",
      category: "vendor",
      publisher: "vendor",
      vendor_kind: "statement",
    });

    expect(credibilityRationale(basis("vendor_statement", [statement]))).toBe(
      "High: the vendor states it on its own pages (acme.example).",
    );
  });

  it("two trusted publishers: their count and names, each once", () => {
    const secondReuters = { ...REUTERS, url: "https://www.reuters.com/world/acme-2/" };

    expect(credibilityRationale(basis("trusted_press_two", [REUTERS, secondReuters, BBC]))).toBe(
      "High: 2 independent trusted publishers report it (Reuters, BBC).",
    );
  });

  it("a trusted publisher without a name in the registry is named by its host", () => {
    const unnamed = { ...BBC, publisher_name: undefined };

    expect(credibilityRationale(basis("trusted_press_two", [REUTERS, unnamed]))).toBe(
      "High: 2 independent trusted publishers report it (Reuters, bbc.co.uk).",
    );
  });

  it("one trusted publisher", () => {
    expect(credibilityRationale(basis("trusted_press_one", [REUTERS]))).toBe(
      "Medium: one trusted publisher reports it (Reuters); no official source and no second independent publisher.",
    );
  });

  it("one trusted publisher beside a weak trusted-press record: the record is no publisher, whatever the order", () => {
    const line =
      "Medium: one trusted publisher reports it (Reuters); no official source and no second independent publisher. " +
      NAME_ONLY_NOTE;

    expect(credibilityRationale(basis("trusted_press_one", [REUTERS, ATLAS_BY_NAME], true))).toBe(
      line,
    );
    expect(credibilityRationale(basis("trusted_press_one", [ATLAS_BY_NAME, REUTERS], true))).toBe(
      line,
    );
  });

  it("only search results nobody could confirm", () => {
    expect(
      credibilityRationale(basis("capped_unconfirmed", [{ ...REUTERS, reading: "unconfirmed" }])),
    ).toBe("Medium: only search results show it; the pages could not be read.");
  });

  it("only unverified sources: their hosts, each once", () => {
    const blog = source({ url: "https://medium.com/@someone/acme-leak" });
    const forum = source({ url: "https://forums.example/t/acme/1" });
    const sameBlog = source({ url: "https://medium.com/@other/acme" });

    expect(credibilityRationale(basis("unverified", [blog, forum, sameBlog]))).toBe(
      "Low: only unverified sources report it (medium.com, forums.example).",
    );
  });

  it("only the vendor's claims", () => {
    const claim = source({
      url: "https://acme.example/blog/we-are-secure",
      category: "vendor",
      publisher: "vendor",
      vendor_kind: "self_claim",
    });

    expect(credibilityRationale(basis("self_claim", [claim]))).toBe(
      "Low: only the vendor's own claims support it.",
    );
  });

  it("a record found by name only: the list it is on", () => {
    expect(credibilityRationale(basis("name_only", [OFAC_BY_NAME], true))).toBe(
      "Low: the OFAC SDN list entry matches the vendor by name only.",
    );
  });

  it.each([
    ["the screening list", CSL_BY_NAME, "US Consolidated Screening List"],
    ["the FDA device recalls", RECALL_BY_NAME, "FDA device recall database"],
  ] as const)("a record of %s found by name only: the list it is on", (_label, record, list) => {
    expect(credibilityRationale(basis("name_only", [record], true))).toBe(
      `Low: the ${list} entry matches the vendor by name only.`,
    );
  });

  it("an entry of the screening list found by a website of the vendor: its name, its id and the day of the copy", () => {
    expect(credibilityRationale(basis("official_record", [CSL_BY_WEBSITE]))).toBe(
      "High: US Consolidated Screening List lists it (el:acmeanalytics), as of 7 Nov 2026.",
    );
  });

  it.each([
    ["delisted", "removed", CSL_BY_NAME, "US Consolidated Screening List"],
    ["withdrawn", "withdrew", RECALL_BY_NAME, "FDA recalls of AI-enabled medical devices"],
  ] as const)(
    "a record the list %s: %s, with the day of the copy, and the note of a match by name",
    (status, verb, record, list) => {
      const inactive = { ...record, record: { ...record.record!, status } } as CredibilitySource;

      expect(credibilityRationale(basis("inactive", [inactive], true))).toBe(
        `Low: ${list} ${verb} the record on 7 Nov 2026. ${NAME_ONLY_NOTE}`,
      );
    },
  );

  it("a contradicted quote", () => {
    expect(
      credibilityRationale(basis("contradicted", [{ ...REUTERS, reading: "contradicted" }])),
    ).toBe("Low: the pages do not hold what the search results quoted.");
  });

  it.each([
    ["withdrawn", "withdrew"],
    ["rejected", "rejected"],
    ["delisted", "removed"],
  ] as const)("a record the database %s: %s, with the day of the copy", (status, verb) => {
    const inactive = {
      ...KEV_RECORD,
      record: { ...KEV_RECORD.record!, status },
    } as CredibilitySource;

    expect(credibilityRationale(basis("inactive", [inactive]))).toBe(
      `Low: CISA Known Exploited Vulnerabilities ${verb} the record on 28 Oct 2026.`,
    );
  });

  it("a CVE the CVE Program rejected: the CVE Program, with the day it did (D5.7 case 10)", () => {
    const cve = source({
      url: "https://www.cve.org/CVERecord?id=CVE-2026-31337",
      category: "official",
      publisher: "cve",
      reviewed: true,
      record: {
        source: "cve",
        match: "strong",
        status: "rejected",
        source_record_id: "CVE-2026-31337",
        as_of: "2026-10-31",
      },
    });

    expect(credibilityRationale(basis("inactive", [cve]))).toBe(
      "Low: the CVE Program rejected the record on 31 Oct 2026.",
    );
  });

  it("a record whose CVE another list rejected: the list that rejected it (Ruling 9 of the M2 plan)", () => {
    const rejected = {
      ...KEV_RECORD,
      record: {
        ...KEV_RECORD.record!,
        status: "rejected",
        as_of: "2026-10-31",
        rejected_by: "nvd",
      },
    } as CredibilitySource;

    expect(credibilityRationale(basis("inactive", [rejected]))).toBe(
      "Low: the National Vulnerability Database rejected the record on 31 Oct 2026.",
    );
  });

  it("adds the stale sentence for a copy that is out of date, with its oldest day, then the note", () => {
    const stale = {
      ...KEV_RECORD,
      record: { ...KEV_RECORD.record!, as_of: "2026-10-26", stale: true },
    } as CredibilitySource;
    const staleSanctions = {
      ...OFAC_BY_NAME,
      record: { ...OFAC_BY_NAME.record!, as_of: "2026-10-25", stale: true },
    } as CredibilitySource;

    expect(credibilityRationale(basis("official_record", [stale, staleSanctions], true))).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 26 Oct 2026. " +
        "The source has not been updated since 25 Oct 2026. " +
        "Matched by name only: this may be another company.",
    );
  });

  it("adds the name-only note to a label a weak record did not decide", () => {
    expect(
      credibilityRationale(basis("trusted_press_two", [REUTERS, BBC, OFAC_BY_NAME], true)),
    ).toBe(`High: 2 independent trusted publishers report it (Reuters, BBC). ${NAME_ONLY_NOTE}`);
  });

  it("an unknown rule gives an empty line", () => {
    expect(credibilityRationale(basis("made_up" as CredibilityRule, [KEV_RECORD]))).toBe("");
  });

  it("names the note as the spec writes it", () => {
    expect(NAME_ONLY_NOTE).toBe("Matched by name only: this may be another company.");
  });
});

describe("the bases the backfill stored (M3)", () => {
  const NVD_RECORD = source({
    url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1001",
    category: "official",
    publisher: "nvd",
    record: {
      source: "nvd",
      match: "strong",
      status: "active",
      source_record_id: "CVE-2026-1001",
      as_of: "2026-10-12",
    },
  });

  it("a legacy basis reads the earlier confidence rule", () => {
    expect(credibilityRationale({ rule: "legacy_confidence" })).toBe(
      "Rated with the earlier confidence rule.",
    );
  });

  it("a stored basis of another shape gives no line and never throws", () => {
    // One row a list returns is enough to fail the whole list if this throws (withRationale).
    for (const stored of [
      {},
      { rule: null },
      { rule: 5 },
      { rule: ["backfill_name_only"] },
      "backfill_name_only",
      [],
      7,
    ] as never[]) {
      expect(credibilityRationale(stored)).toBe("");
    }
  });

  it("a backfilled basis reads its rule and the current rule", () => {
    expect(
      credibilityRationale({
        ...basis("official_record", [NVD_RECORD]),
        rule: "backfill_official_record",
      }),
    ).toBe(
      "High: the National Vulnerability Database lists it (CVE-2026-1001), as of 12 Oct 2026. Rated again with the current rule.",
    );
  });

  it("a backfilled basis puts the note right after its rule's sentence, as the screen does", () => {
    // The screen shows the rule's sentence with the note, then the stale day, and the name-only
    // note on a line of its own: the server's line is that, with the name-only note last.
    const staleSanctions = {
      ...OFAC_BY_NAME,
      record: { ...OFAC_BY_NAME.record!, as_of: "2026-10-25", stale: true },
    } as CredibilitySource;

    expect(
      credibilityRationale({
        ...basis("official_record", [KEV_RECORD, staleSanctions], true),
        rule: "backfill_official_record",
      }),
    ).toBe(
      "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026. " +
        "Rated again with the current rule. " +
        "The source has not been updated since 25 Oct 2026. " +
        "Matched by name only: this may be another company.",
    );
  });

  it("a backfilled basis of a rule without a sentence reads only the note", () => {
    // official_record says nothing without a strong official record among its sources.
    expect(
      credibilityRationale({
        ...basis("official_record", [REUTERS]),
        rule: "backfill_official_record",
      }),
    ).toBe("Rated again with the current rule.");
  });
});

describe("dayOf", () => {
  it("writes a day as 28 Oct 2026, in UTC, without a leading zero", () => {
    expect(dayOf("2026-10-28")).toBe("28 Oct 2026");
    expect(dayOf("2026-01-05")).toBe("5 Jan 2026");
    expect(dayOf("2026-10-28T23:30:00-05:00")).toBe("29 Oct 2026");
  });

  it("gives null for anything that is no day", () => {
    expect(dayOf("")).toBeNull();
    expect(dayOf("not a day")).toBeNull();
  });
});
