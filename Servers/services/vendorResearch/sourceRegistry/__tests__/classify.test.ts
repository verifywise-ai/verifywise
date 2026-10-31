/**
 * The classifier of the source registry (spec D3.2): the category of a cited source, from the
 * vendor's own site, the registry's entries and their rules, with no model.
 */
import type { ResearchTarget } from "../../target";
import {
  AGGREGATOR_DOMAINS,
  GOVERNMENT_HOST,
  MAJOR_PUBLISHER_DOMAINS,
  REGULATOR_AND_COURT_DOMAINS,
} from "../../sourceTiers";
import {
  type ClassifiableSource,
  classifyRecord,
  classifySource,
  emailOnDomain,
  isStatementPage,
  recordMatchOf,
} from "../classify";
import { REGISTRY } from "../entries";

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};
const NO_DOMAIN: ResearchTarget = { ...ACME, domain: null };
const BLOOMBERG: ResearchTarget = { ...ACME, name: "Bloomberg", domain: "bloomberg.com" };

const at = (url: string, extra: Partial<ClassifiableSource> = {}, target: ResearchTarget = ACME) =>
  classifySource({ url, onVendorSite: false, ...extra }, target);

describe("classifySource", () => {
  it("finds the entry of a host and of its subdomains, the longest host first", () => {
    expect(at("https://www.reuters.com/x")).toMatchObject({
      category: "trusted_press",
      entry: "reuters",
      publisher: "reuters",
      reviewed: true,
    });
    expect(at("https://uk.reuters.com/x")).toMatchObject({ entry: "reuters" });
    expect(at("https://news.sky.com/story/x")).toMatchObject({ entry: "sky-news" });
    expect(at("https://www.sky.com/x")).toMatchObject({
      category: "unverified",
      entry: null,
      reviewed: false,
    });
    expect(at("https://news.google.com/articles/x")).toMatchObject({ entry: "aggregators" });
    expect(at("https://www.google.com/x")).toMatchObject({ entry: null });
  });

  it("gives the hosts of one publisher one publisher", () => {
    expect(at("https://www.bbc.co.uk/news/x").publisher).toBe("bbc");
    expect(at("https://www.bbc.com/news/x").publisher).toBe("bbc");
  });

  it.each([
    ["https://example.gov/x", "us-gov"],
    ["https://www.cisa.gov/x", "us-gov"],
    ["https://www.gov.uk/x", "uk-gov"],
    ["https://x.gov.uk/x", "uk-gov"],
    ["https://who.int/x", "int"],
    ["https://ec.europa.eu/x", "europa"],
    ["https://x.gob.ar/x", "gov-unverified"],
    ["https://ico.org.uk/x", "ico"],
  ])("classifies %s as official, entry %s", (url, entry) => {
    expect(at(url)).toMatchObject({ category: "official", entry, reviewed: true });
  });

  it("names the publisher of a suffix entry by its host, so that two agencies are two publishers", () => {
    expect(at("https://www.cisa.gov/x").publisher).toBe("cisa");
    expect(at("https://www.ftc.gov/x").publisher).toBe("ftc");
  });

  it("takes no look-alike of a government host for one", () => {
    expect(at("https://notgov.com/x")).toMatchObject({ category: "unverified", entry: null });
    expect(at("https://shop.go.it/x")).toMatchObject({ category: "unverified", entry: null });
  });

  it("takes the vendor's own site first, even on a registry host, but not a platform where users post", () => {
    expect(
      at("https://www.bloomberg.com/company/x", { onVendorSite: true }, BLOOMBERG),
    ).toMatchObject({ category: "vendor", publisher: "vendor", entry: null, reviewed: true });
    expect(at("https://www.bloomberg.com/company/x", {}, BLOOMBERG)).toMatchObject({
      category: "trusted_press",
    });
    expect(
      at(
        "https://www.linkedin.com/company/x",
        { onVendorSite: true },
        { ...ACME, domain: "linkedin.com" },
      ),
    ).toMatchObject({ category: "unverified", userContent: true, entry: "social" });
  });

  it("has no vendor's own site and no vendor's wire release for a vendor without a domain", () => {
    expect(
      at("https://acme-analytics.example/trust", { onVendorSite: true }, NO_DOMAIN),
    ).toMatchObject({ category: "unverified", reviewed: false });
    expect(
      at(
        "https://www.prnewswire.com/news-releases/x",
        { text: "Contact: press@acme-analytics.example" },
        NO_DOMAIN,
      ),
    ).toMatchObject({ category: "unverified" });
  });

  it("blocks a paste site", () => {
    expect(at("https://pastebin.com/abc")).toMatchObject({
      category: "unverified",
      blocked: true,
      entry: "pastebin",
    });
  });

  it.each([
    "https://www.forbes.com/sites/janedoe/2026/09/01/x",
    "https://councils.forbes.com/blog/x",
    "https://www.cbsnews.com/news/acme-paid-content",
    "https://www.theregister.com/2026/10/01/sponsored-acme",
    "https://vendorvoice.theregister.com/x",
    "https://cyberscoop.com/news/sponsored-content/x",
    "https://cyberscoop.com/acme-op-ed",
    "https://venturebeat.com/category/datadecisionmakers/x",
    "https://www.abc.net.au/news/analysis-and-opinion/x",
    "https://www.reuters.com/opinion/x",
  ])("downgrades %s", (url) => {
    expect(at(url)).toMatchObject({ category: "unverified", downgraded: true });
  });

  it.each([
    ["https://apnews.com/press-release/business-wire/acme-analytics-achieves-iso-27001", "apnews"],
    [
      "https://www.marketwatch.com/press-release/acme-analytics-achieves-iso-27001-2026-09-30",
      "marketwatch",
    ],
    ["https://www.nytimes.com/paidpost/acme/the-future-of-analytics.html", "nytimes"],
    ["https://www.ft.com/partnercontent/acme/the-future-of-analytics.html", "ft"],
    ["https://sponsored.bloomberg.com/article/acme/the-future-of-analytics", "bloomberg"],
    ["https://paidpost.nytimes.com/acme/the-future-of-analytics.html", "nytimes"],
    ["https://partners.wsj.com/acme/the-future-of-analytics/", "wsj"],
  ])(
    "downgrades %s, a release or paid content on the site of a trusted publisher",
    (url, entry) => {
      expect(at(url)).toMatchObject({ category: "unverified", entry, downgraded: true });
    },
  );

  it.each([
    ["https://www.forbes.com/sites/forbesstaff/article/x", "trusted_press"],
    ["https://apnews.com/article/acme-analytics-breach-0a1b2c", "trusted_press"],
    ["https://www.bloomberg.com/news/articles/2026-10-01/acme-analytics-breach", "trusted_press"],
    ["https://www.marketwatch.com/story/press-release-season-for-banks-0a1b2c", "trusted_press"],
    // A word that starts with a downgraded segment is not the segment.
    ["https://www.reuters.com/opinionated-story", "trusted_press"],
    // The generic segments apply to the trusted press only.
    ["https://ico.org.uk/opinion/x", "official"],
  ])("does not downgrade %s", (url, category) => {
    const found = at(url);
    expect(found.category).toBe(category);
    expect(found.downgraded).toBeUndefined();
  });

  describe("a syndicated copy", () => {
    const MSN = "https://www.msn.com/en-us/news/x";

    it("takes the class of the page on another registry host that it names as canonical", () => {
      expect(at(MSN, { canonicalUrl: "https://apnews.com/article/x" })).toMatchObject({
        category: "trusted_press",
        entry: "apnews",
        publisher: "apnews",
        syndicated: true,
      });
    });

    it("stays unverified with no canonical address", () => {
      expect(at(MSN)).toMatchObject({
        category: "unverified",
        entry: "republishers",
        syndicated: true,
      });
    });

    it.each([
      // Another syndicating entry.
      "https://news.yahoo.com/x",
      // An unknown host.
      "https://localnews.example/x",
      "not a url",
      // The vendor's own site.
      "https://acme-analytics.example/x",
    ])("is not credited for the canonical address %s", (canonicalUrl) => {
      expect(at(MSN, { canonicalUrl })).toMatchObject({
        category: "unverified",
        entry: "republishers",
        syndicated: true,
      });
    });

    it("is not credited for a canonical address on the vendor's own site that is a registry host", () => {
      expect(
        at(MSN, { canonicalUrl: "https://www.bloomberg.com/news/x" }, BLOOMBERG),
      ).toMatchObject({ category: "unverified", entry: "republishers", syndicated: true });
    });

    it("takes a downgrade of the page it names", () => {
      expect(at(MSN, { canonicalUrl: "https://www.forbes.com/sites/janedoe/x" })).toMatchObject({
        category: "unverified",
        downgraded: true,
        syndicated: true,
      });
    });

    it("keeps the category of an entry that republishes for its issuer", () => {
      expect(at("https://www.bailii.org/ew/cases/x")).toMatchObject({
        category: "official",
        entry: "bailii",
        syndicated: true,
      });
    });
  });

  describe("a wire release", () => {
    const WIRE = "https://www.prnewswire.com/news-releases/x";

    it("is the vendor's when it carries an e-mail address on the vendor's own domain", () => {
      expect(at(WIRE, { text: "Contact: press@acme-analytics.example" })).toMatchObject({
        category: "vendor",
        publisher: "vendor",
        entry: "wires",
      });
    });

    it("is unverified when it names the vendor only", () => {
      expect(at(WIRE, { text: "Acme Analytics announced" })).toMatchObject({
        category: "unverified",
        entry: "wires",
      });
    });
  });

  it.each([
    "https://WWW.REUTERS.COM./x",
    "https://reuters.com:8443/x",
    "https://m.reuters.com/x",
    "http://reuters.com/x",
  ])("finds the same entry for the spelling %s", (url) => {
    expect(at(url)).toMatchObject({ entry: "reuters" });
  });

  it("classifies an internationalised host and an address that cannot be read without throwing", () => {
    expect(at("https://bücher.example/")).toMatchObject({
      category: "unverified",
      entry: null,
      reviewed: false,
    });
    expect(at("not a url")).toMatchObject({
      category: "unverified",
      entry: null,
      reviewed: false,
      publisher: "not a url",
    });
  });
});

describe("user content, filings and wire releases (Q25–Q27)", () => {
  const TARGET: ResearchTarget = { name: "Acme", domain: "acme.example", provides: "" };
  const of = (
    url: string,
    extra: Partial<ClassifiableSource> = {},
    target: ResearchTarget = TARGET,
  ) => at(url, extra, target);

  it("a thread on the vendor's community host is user content", () => {
    expect(
      of("https://community.acme.example/t/data-leak/123", { onVendorSite: true }),
    ).toMatchObject({ category: "unverified", userContent: true, entry: null });
  });

  it("a forum section of the vendor's own site is user content", () => {
    expect(of("https://acme.example/en/forums/topic/1", { onVendorSite: true })).toMatchObject({
      category: "unverified",
      userContent: true,
    });
  });

  it("a post on a platform that is the vendor's website is user content", () => {
    expect(
      of(
        "https://www.linkedin.com/posts/someone_activity-1",
        { onVendorSite: true },
        { ...TARGET, domain: "linkedin.com" },
      ),
    ).toMatchObject({ category: "unverified", userContent: true, entry: "social" });
  });

  it("the vendor's own subdomain of a platform stays the vendor's", () => {
    expect(
      of(
        "https://acme.substack.com/p/security-update",
        { onVendorSite: true },
        { ...TARGET, domain: "acme.substack.com" },
      ),
    ).toMatchObject({ category: "vendor", publisher: "vendor" });
  });

  it("another blog on the same platform is not the vendor's", () => {
    expect(
      of("https://other.substack.com/p/x", {}, { ...TARGET, domain: "acme.substack.com" }),
    ).toMatchObject({ category: "unverified", userContent: true, entry: "blogs" });
  });

  it("a forum on a trusted press host is user content", () => {
    expect(of("https://forums.theregister.com/forum/all/2026/01/01/x/")).toMatchObject({
      category: "unverified",
      userContent: true,
    });
  });

  it("an EDGAR filing is unverified and a SEC release official", () => {
    expect(
      of("https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/form8-k.htm"),
    ).toMatchObject({ category: "unverified", downgraded: true, entry: "sec" });
    expect(of("https://www.sec.gov/newsroom/press-releases/2026-1")).toMatchObject({
      category: "official",
      entry: "sec",
    });
  });

  it("a public comment is unverified and an agency's document official", () => {
    expect(of("https://www.regulations.gov/comment/ABC-2026-0001-0002")).toMatchObject({
      category: "unverified",
      downgraded: true,
      entry: "regulations-gov",
    });
    expect(of("https://www.regulations.gov/document/ABC-2026-0001-0001")).toMatchObject({
      category: "official",
      entry: "regulations-gov",
    });
  });

  it("a RECAP filing is unverified and an opinion official", () => {
    expect(
      of("https://storage.courtlistener.com/recap/gov.uscourts.cand.1/gov.uscourts.cand.1.1.0.pdf"),
    ).toMatchObject({ category: "unverified", downgraded: true, entry: "courtlistener" });
    expect(of("https://www.courtlistener.com/opinion/1/acme-v-doe/")).toMatchObject({
      category: "official",
      syndicated: true,
    });
  });

  it("an EDGAR filing in a viewer of the SEC is unverified too, and EDGAR's list of a company's filings official", () => {
    for (const url of [
      "https://www.sec.gov/ix?doc=/Archives/edgar/data/1234567/000123456726000001/form8-k.htm",
      "https://www.sec.gov/ixviewer/ix.html?doc=/Archives/edgar/data/1234567/000123456726000001/form8-k.htm",
      "https://www.sec.gov/cgi-bin/viewer?action=view&cik=1234567&accession_number=0001234567-26-000001",
    ]) {
      expect(of(url)).toMatchObject({ category: "unverified", downgraded: true, entry: "sec" });
    }
    expect(
      of("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1234567"),
    ).toMatchObject({ category: "official", entry: "sec" });
  });

  it("an EDGAR filing under the vendor's stored CIK is the vendor's, in the archive and in a viewer", () => {
    const filer: ResearchTarget = { ...TARGET, identifiers: { secCik: "0000320193" } };
    for (const url of [
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/ix?doc=/Archives/edgar/data/320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/ixviewer/ix.html?doc=/Archives/edgar/data/0000320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/cgi-bin/viewer?action=view&cik=320193&accession_number=0000320193-26-000001",
    ]) {
      expect(of(url, {}, filer)).toMatchObject({
        category: "vendor",
        publisher: "vendor",
        entry: "sec",
      });
    }
  });

  it("an EDGAR filing under another CIK stays unverified", () => {
    const filer: ResearchTarget = { ...TARGET, identifiers: { secCik: "0000320193" } };
    for (const url of [
      "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/form8-k.htm",
      "https://www.sec.gov/ix?doc=/Archives/edgar/data/3201930/000123456726000001/form8-k.htm",
      "https://www.sec.gov/cgi-bin/viewer?action=view&cik=1234567&accession_number=0001234567-26-000001",
    ]) {
      expect(of(url, {}, filer)).toMatchObject({
        category: "unverified",
        downgraded: true,
        entry: "sec",
      });
    }
    // A vendor without a stored CIK: every filing is the filer's document, as before.
    expect(
      of("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/form8-k.htm"),
    ).toMatchObject({ category: "unverified", downgraded: true, entry: "sec" });
  });

  it("a file on the portal's download host is unverified: a comment's attachment looks like an agency's file", () => {
    expect(
      of("https://downloads.regulations.gov/ABC-2026-0001-0002/attachment_1.pdf"),
    ).toMatchObject({ category: "unverified", downgraded: true, entry: "regulations-gov" });
  });

  it("a RECAP document page and its attachments are unverified, and a docket official", () => {
    for (const url of [
      "https://www.courtlistener.com/docket/4214664/1/acme-v-doe/",
      "https://www.courtlistener.com/docket/4214664/1/2/acme-v-doe/",
    ]) {
      expect(of(url)).toMatchObject({
        category: "unverified",
        downgraded: true,
        entry: "courtlistener",
      });
    }
    expect(of("https://www.courtlistener.com/docket/4214664/acme-v-doe/")).toMatchObject({
      category: "official",
      entry: "courtlistener",
    });
  });

  const WIRE = "https://www.prnewswire.com/news-releases/x.html";

  it("a wire release with an e-mail on the vendor's domain is the vendor's", () => {
    expect(of(WIRE, { text: "Media contact: press@acme.example" })).toMatchObject({
      category: "vendor",
      entry: "wires",
    });
  });

  it("a wire release that links the vendor's advisory is unverified", () => {
    expect(of(WIRE, { text: "See https://acme.example/security/advisory-1" })).toMatchObject({
      category: "unverified",
      entry: "wires",
    });
  });

  it.each(["press@acme.example.evil.example", "press@notacme.example"])(
    "an e-mail on a look-alike domain is not the vendor's: %s",
    (text) => {
      expect(of(WIRE, { text })).toMatchObject({ category: "unverified", entry: "wires" });
    },
  );

  it("a forum path on a paste site stays blocked", () => {
    expect(of("https://pastebin.com/u/forum")).toMatchObject({
      category: "unverified",
      userContent: true,
      blocked: true,
    });
  });

  it("a vendor on a .gov domain is the vendor", () => {
    expect(
      of(
        "https://acme.gov/security/notice",
        { onVendorSite: true },
        { ...TARGET, domain: "acme.gov" },
      ),
    ).toMatchObject({ category: "vendor", publisher: "vendor" });
  });
});

describe("isStatementPage", () => {
  it.each([
    "https://acme-analytics.example/trust",
    "https://acme-analytics.example/trust-center/reports",
    "https://acme-analytics.example/trustcenter",
    "https://acme-analytics.example/security",
    "https://acme-analytics.example/legal/ai-use",
    "https://acme-analytics.example/privacy-policy",
    "https://acme-analytics.example/privacy.html",
    "https://acme-analytics.example/terms-of-service",
    "https://acme-analytics.example/tos",
    "https://acme-analytics.example/policies/acceptable-use",
    "https://acme-analytics.example/compliance/soc-2",
    "https://acme-analytics.example/subprocessors",
    "https://acme-analytics.example/sub-processors",
    "https://acme-analytics.example/dpa",
    "https://acme-analytics.example/gdpr",
    "https://acme-analytics.example/status",
    "https://acme-analytics.example/en/legal/privacy",
    "https://acme-analytics.example/en-us/security",
    "https://ACME-ANALYTICS.example/Legal/Privacy",
    "https://trust.acme-analytics.example/",
    "https://security.acme-analytics.example/reports",
    "https://status.acme-analytics.example/history",
  ])("takes %s for a page where the vendor states what binds it", (url) => {
    expect(isStatementPage(url)).toBe(true);
  });

  it.each([
    "https://acme-analytics.example/",
    "https://acme-analytics.example/press/acme-achieves-iso-27001",
    "https://acme-analytics.example/press-releases/acme-achieves-iso-27001",
    "https://acme-analytics.example/newsroom/acme-achieves-soc-2",
    "https://acme-analytics.example/en/press/acme-achieves-iso-27001",
    "https://acme-analytics.example/en/blog/our-soc-2-journey",
    "https://acme-analytics.example/company/news/acme-achieves-certification",
    "https://acme-analytics.example/security/blog/how-we-protect-your-data",
    "https://trust.acme-analytics.example/news/acme-achieves-soc-2",
    "https://acme-analytics.example/product/security-features",
    "https://acme-analytics.example/securityfirst",
    "not an address",
  ])("takes %s for no such page", (url) => {
    expect(isStatementPage(url)).toBe(false);
  });
});

describe("emailOnDomain", () => {
  it.each(["a.b@acme.example", "x@mail.acme.example", "Press@ACME.example."])(
    "finds an address on the domain in %j",
    (text) => {
      expect(emailOnDomain(text, "acme.example")).toBe(true);
    },
  );

  it.each([
    "acme.example",
    "@acme.example",
    "x@acme.examples",
    "x@acme.example-shop.example",
    "x@notacme.example",
  ])("finds none in %j", (text) => {
    expect(emailOnDomain(text, "acme.example")).toBe(false);
  });

  it("reads 200,000 @ signs in under 50 ms", () => {
    const text = "a@".repeat(200_000);
    const startedAt = performance.now();
    expect(emailOnDomain(text, "acme.example")).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(50);
  });
});

describe("the records of public databases", () => {
  it.each([
    ["kev", "official", "kev", "strong"],
    ["nvd", "official", "nvd", "strong"],
    ["sec", "official", "sec", "weak"],
    ["ofac", "official", "ofac", "weak"],
    ["uk_sanctions", "official", "uk_sanctions", "weak"],
    ["eu_fsf", "official", "eu_fsf", "weak"],
    ["hibp", "unverified", "hibp", null],
    ["statuspage", "vendor", "vendor", null],
  ] as const)("classifies a %s record as %s by its database", (id, category, publisher, match) => {
    expect(classifyRecord(id)).toEqual({ category, publisher, entry: null, reviewed: true });
    expect(recordMatchOf(id)).toBe(match);
  });

  it("takes a SEC record as strong when the vendor's CIK is stored, since it was asked by it", () => {
    const filer: ResearchTarget = { ...ACME, identifiers: { secCik: "0000320193" } };
    const noCik: ResearchTarget = { ...ACME, identifiers: { secCik: "CIK 12" } };

    expect(recordMatchOf("sec", filer)).toBe("strong");
    expect(recordMatchOf("sec", ACME)).toBe("weak");
    expect(recordMatchOf("sec", noCik)).toBe("weak");
    expect(recordMatchOf("ofac", filer)).toBe("weak");
    expect(recordMatchOf("hibp", filer)).toBeNull();
  });

  it("does not classify a status page by its host", () => {
    expect(at("https://status.acme-analytics.example/history")).toMatchObject({
      category: "unverified",
    });
  });
});

describe("parity with sourceTiers.ts", () => {
  it("classifies every regulator and court as official", () => {
    expect(
      REGULATOR_AND_COURT_DOMAINS.filter((host) => at(`https://${host}/x`).category !== "official"),
    ).toEqual([]);
  });

  it("classifies every major publisher as trusted press, except krebsonsecurity.com", () => {
    expect(
      MAJOR_PUBLISHER_DOMAINS.filter(
        (host) => at(`https://${host}/x`).category !== "trusted_press",
      ),
    ).toEqual(["krebsonsecurity.com"]);
    expect(at("https://krebsonsecurity.com/x").category).toBe("unverified");
  });

  it("classifies every aggregator as unverified when there is no text and no canonical", () => {
    expect(
      AGGREGATOR_DOMAINS.filter((host) => at(`https://${host}/x`).category !== "unverified"),
    ).toEqual([]);
  });

  it("puts each of these hosts in exactly one entry", () => {
    const hosts = [
      ...REGULATOR_AND_COURT_DOMAINS,
      ...MAJOR_PUBLISHER_DOMAINS,
      ...AGGREGATOR_DOMAINS,
    ];
    expect(
      hosts.filter((host) => REGISTRY.filter((entry) => entry.hosts.includes(host)).length !== 1),
    ).toEqual([]);
  });

  it("classifies as official every sample government host", () => {
    const SAMPLES = [
      "www.x.gov",
      "x.mil",
      "who.int",
      "www.gov.uk",
      "x.gov.scot",
      "x.gov.wales",
      "x.gouv.fr",
      "x.gov.au",
      "x.gov.in",
      "x.gob.es",
      "x.gob.mx",
      "x.go.jp",
      "x.go.kr",
      "x.go.id",
      "x.go.th",
      "x.go.ke",
      "x.go.tz",
      "x.go.ug",
      "x.govt.nz",
      "x.gov.br",
      "x.gv.at",
      "x.gob.ar",
      "ec.europa.eu",
      "x.admin.ch",
      "x.bund.de",
      "x.gc.ca",
      "x.canada.ca",
    ];
    // Every sample is one that today's rule takes for a government's, so none is left out below.
    expect(SAMPLES.filter((host) => !GOVERNMENT_HOST.test(host))).toEqual([]);
    expect(SAMPLES.filter((host) => at(`https://${host}/x`).category !== "official")).toEqual([]);
  });
});
