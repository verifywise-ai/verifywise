import {
  type CoverageOutcome,
  type CoverageSource,
  RESEARCH_CATEGORIES,
  ResearchCategory,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { FetchedPage, PageReadError } from "../../webResearch/readPage";
import { SearchKind, SearchResult } from "../../webResearch/webSearch";
import { type LedgerEntry, SESSION_LIMITS, createWebSession } from "../../webResearch/webSession";
import {
  GATHER_TIMEOUT_MS,
  GatheredAction,
  MAX_NEWS_READS_PER_CATEGORY,
  MAX_SITE_READS_PER_CATEGORY,
  MIN_CANDIDATES_BEFORE_GUESSING,
  classifySitePage,
  coverageOfLookups,
  describeGathered,
  gatherSources,
  planNewsReads,
  planSearches,
  planSiteReads,
  sitemapAddresses,
  traceStepOfRecords,
  traceStepOfSitemap,
} from "../gather";
import { createVendorMatcher } from "../identity";
import type { WebsiteCheck } from "../preflight";
import type { RecordsLookup, RecordsOutcome } from "../records";
import { ResearchTarget, buildTarget } from "../target";
import { vrdbSourceOf } from "../vrdb/sources";
import type { VrdbOutcome, VrdbRecordMeta } from "../vrdb/types";

const target = buildTarget({
  vendor_name: "Acme",
  website: "acme.com",
  vendor_provides: "Cloud hosting",
});
const NO_WEBSITE_TARGET = buildTarget({
  vendor_name: "Acme",
  website: "",
  vendor_provides: "Cloud hosting",
});
const ALL: readonly ResearchCategory[] = [
  "security_incidents",
  "certifications",
  "legal_regulatory",
  "ai_specific",
  "availability",
];
const NEWS_ONLY: readonly ResearchCategory[] = [
  "security_incidents",
  "legal_regulatory",
  "availability",
];
const ORIGIN = "https://www.acme.com";
const DOMAINS = ["acme.com"];

describe("classifySitePage", () => {
  it.each([
    ["https://acme.com/security", "", "certifications", 4],
    ["https://acme.com/trust", "", "certifications", 5],
    ["https://acme.com/trust-center", "", "certifications", 5],
    ["https://acme.com/compliance/soc-2", "", "certifications", 3],
    ["https://acme.com/legal/sub-processors", "", "ai_specific", 5],
    ["https://acme.com/legal/dpa", "", "ai_specific", 4],
    ["https://acme.com/privacy-policy", "", "ai_specific", 4],
    ["https://acme.com/responsible-ai", "", "ai_specific", 3],
    ["https://acme.com/terms", "", "ai_specific", 2],
    ["https://acme.com/s/1234", "Security and trust", "certifications", 5],
    // A PDF is a page now that it can be read: a data processing agreement is often only that.
    ["https://acme.com/legal/dpa.pdf", "", "ai_specific", 4],
    ["https://acme.com/files/Security-Whitepaper.PDF", "", "certifications", 4],
  ] as const)("%s (%s) serves %s with weight %s", (address, text, category, score) => {
    expect(classifySitePage(address, text)).toEqual({ category, score });
  });

  it("gives a page that fits two categories the better fit, and certifications a tie", () => {
    expect(classifySitePage("https://acme.com/privacy-and-security")).toEqual({
      category: "certifications",
      score: 4,
    });
    expect(classifySitePage("https://acme.com/trust-and-privacy")).toEqual({
      category: "certifications",
      score: 5,
    });
  });

  it.each([
    "https://acme.com/pricing",
    "https://acme.com/careers/security-engineer",
    "https://acme.com/blog/how-we-think-about-security",
    "https://acme.com/news/acme-wins-an-award",
    "https://acme.com/images/security.png",
    "https://acme.com/files/security-overview.docx",
    "https://acme.com/email-signature",
    "not a url",
  ])("serves no category: %s", (address) => {
    expect(classifySitePage(address)).toBeNull();
  });

  it("takes AI as a word and not as a part of 'email', 'maintain' or 'said'", () => {
    expect(classifySitePage("https://acme.com/ai-principles")?.category).toBe("ai_specific");
    expect(classifySitePage("https://acme.com/email")).toBeNull();
    expect(classifySitePage("https://acme.com/maintain")).toBeNull();
  });
});

describe("sitemapAddresses", () => {
  const markup = (...locs: string[]) =>
    `<?xml version="1.0"?><urlset>${locs.map((loc) => `<url><loc>${loc}</loc><lastmod>2026-01-01</lastmod></url>`).join("")}</urlset>`;

  it("lists the addresses of the vendor's domains in the order of the sitemap, once each", () => {
    const found = sitemapAddresses(
      markup(
        "https://www.acme.com/security",
        "https://other.example/security",
        "https://trust.acme.com/",
        "https://www.acme.com/security",
        "https://www.acme.com/privacy#top",
      ),
      DOMAINS,
    );

    expect(found).toEqual([
      "https://www.acme.com/security",
      "https://trust.acme.com/",
      "https://www.acme.com/privacy",
    ]);
  });

  it("reads a sitemap made to be slow within a short time", () => {
    const startedAt = performance.now();

    sitemapAddresses(`<loc>${" ".repeat(100_000)}a${" ".repeat(100_000)}`, DOMAINS);
    sitemapAddresses("<loc>".repeat(100_000), DOMAINS);

    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it("decodes the entities of the markup and skips what is not a page of the site", () => {
    const found = sitemapAddresses(
      markup(
        "https://www.acme.com/legal?doc=dpa&amp;lang=en",
        "https://www.acme.com/sitemap-blog.xml",
        "ftp://www.acme.com/file",
        "not an address",
        "  https://www.acme.com/terms  ",
      ),
      DOMAINS,
    );

    expect(found).toEqual([
      "https://www.acme.com/legal?doc=dpa&lang=en",
      "https://www.acme.com/terms",
    ]);
  });

  it("looks at no more than 5000 addresses and gives nothing for text without a sitemap", () => {
    const many = markup(...Array.from({ length: 6000 }, (_, n) => `https://www.acme.com/p${n}`));

    expect(sitemapAddresses(many, DOMAINS)).toHaveLength(5000);
    expect(sitemapAddresses("Contact: mailto:security@acme.com", DOMAINS)).toEqual([]);
  });
});

describe("planSiteReads", () => {
  const link = (text: string, url: string) => ({ text, url });
  const plan = (input: Partial<Parameters<typeof planSiteReads>[0]> = {}) =>
    planSiteReads({
      origin: ORIGIN,
      domains: DOMAINS,
      links: [],
      sitemap: [],
      researchable: ALL,
      ...input,
    });

  it("reads the pages the home page links to, for the category each fits, certifications first", () => {
    const reads = plan({
      links: [
        link("Privacy", "https://www.acme.com/privacy"),
        link("Security", "https://www.acme.com/security"),
        link("Trust center", "https://trust.acme.com/"),
        link("DPA", "https://www.acme.com/legal/dpa"),
      ],
    });

    expect(reads).toEqual([
      { category: "certifications", url: "https://trust.acme.com/" },
      { category: "certifications", url: "https://www.acme.com/security" },
      { category: "ai_specific", url: "https://www.acme.com/privacy" },
      { category: "ai_specific", url: "https://www.acme.com/legal/dpa" },
    ]);
  });

  it("reads a page before a PDF of the same fit, and a PDF when there is room for it", () => {
    const reads = plan({
      links: [
        link("DPA", "https://www.acme.com/legal/dpa.pdf"),
        link("Privacy", "https://www.acme.com/privacy"),
      ],
      sitemap: ["https://www.acme.com/data-protection"],
      researchable: ["ai_specific"],
    });

    expect(reads.map((read) => read.url)).toEqual([
      "https://www.acme.com/privacy",
      "https://www.acme.com/data-protection",
      "https://www.acme.com/legal/dpa.pdf",
    ]);
  });

  it("reads a PDF of a better fit before a page of a worse one", () => {
    const reads = plan({
      links: [
        link("Terms", "https://www.acme.com/terms"),
        link("Sub-processors", "https://www.acme.com/legal/sub-processors.pdf"),
      ],
      researchable: ["ai_specific"],
    });

    expect(reads.map((read) => read.url)).toEqual([
      "https://www.acme.com/legal/sub-processors.pdf",
      "https://www.acme.com/terms",
    ]);
  });

  it("reads at most three pages for a category: the best fit, the links before the sitemap, the shorter path first", () => {
    const reads = plan({
      links: [link("Privacy", "https://www.acme.com/privacy")],
      sitemap: [
        "https://www.acme.com/legal/privacy/archive/2021",
        "https://www.acme.com/legal/privacy",
        "https://www.acme.com/privacy-notice",
        "https://www.acme.com/trust",
        "https://www.acme.com/security",
        "https://www.acme.com/security/overview/details",
        "https://www.acme.com/compliance",
        "https://www.acme.com/certifications",
      ],
    });

    expect(
      reads.filter((read) => read.category === "certifications").map((read) => read.url),
    ).toEqual([
      "https://www.acme.com/trust",
      "https://www.acme.com/security",
      "https://www.acme.com/security/overview/details",
    ]);
    expect(reads.filter((read) => read.category === "ai_specific").map((read) => read.url)).toEqual(
      [
        "https://www.acme.com/privacy",
        "https://www.acme.com/privacy-notice",
        "https://www.acme.com/legal/privacy",
      ],
    );
    expect(MAX_SITE_READS_PER_CATEGORY).toBe(3);
  });

  it("reads a page once when the home page and the sitemap both name it", () => {
    const reads = plan({
      links: [link("Security", "https://www.acme.com/security")],
      sitemap: ["https://www.acme.com/security/", "https://www.acme.com/trust"],
    });

    expect(reads.filter((read) => read.url.includes("/security"))).toHaveLength(1);
  });

  it("leaves out the links of other sites", () => {
    const reads = plan({
      links: [
        link("Security", "https://other.example/security"),
        link("Privacy", "https://www.acme.com/privacy"),
        link("Trust", "https://trust.acme.com/"),
      ],
    });

    expect(reads.map((read) => read.url)).not.toContain("https://other.example/security");
  });

  it("adds the usual pages to a category that the links and the sitemap leave with fewer than two", () => {
    const reads = plan({ links: [link("Security", "https://www.acme.com/security")] });

    // One certifications page from the links, then the usual ones, up to three.
    expect(
      reads.filter((read) => read.category === "certifications").map((read) => read.url),
    ).toEqual([
      "https://www.acme.com/security",
      "https://www.acme.com/trust",
      "https://trust.acme.com/",
    ]);
    expect(reads.filter((read) => read.category === "ai_specific").map((read) => read.url)).toEqual(
      [
        "https://www.acme.com/privacy",
        "https://www.acme.com/legal/privacy",
        "https://www.acme.com/privacy-policy",
      ],
    );
    expect(MIN_CANDIDATES_BEFORE_GUESSING).toBe(2);
  });

  it("adds no usual page to a category that has two", () => {
    const reads = plan({
      links: [
        link("Security", "https://www.acme.com/security"),
        link("Trust", "https://www.acme.com/trust"),
      ],
    });

    expect(reads.filter((read) => read.category === "certifications")).toHaveLength(2);
  });

  it("plans only for the categories that are researched", () => {
    expect(plan({ researchable: NEWS_ONLY })).toEqual([]);
    expect(
      plan({ researchable: ["certifications"] }).every(
        (read) => read.category === "certifications",
      ),
    ).toBe(true);
  });

  it("guesses on the host the site answered from, and the subdomains on the vendor's domain", () => {
    const reads = plan({ origin: "https://www.acme.co.uk", domains: ["acme.co.uk"] });

    expect(reads.map((read) => read.url)).toEqual(
      expect.arrayContaining(["https://www.acme.co.uk/security", "https://trust.acme.co.uk/"]),
    );
  });
});

describe("planSearches", () => {
  it("asks the queries that work for the news categories that are researched", () => {
    expect(planSearches(target, ALL)).toEqual([
      { category: "security_incidents", query: "Acme data breach" },
      { category: "security_incidents", query: "Acme security incident" },
      { category: "legal_regulatory", query: "Acme lawsuit" },
      { category: "legal_regulatory", query: "Acme fined" },
      { category: "legal_regulatory", query: "Acme FTC" },
      { category: "legal_regulatory", query: "Acme settlement" },
      { category: "availability", query: "Acme outage" },
    ]);
  });

  it("asks nothing for a category that is not researched, and nothing for the categories that read the site", () => {
    expect(planSearches(target, ["legal_regulatory"])).toEqual([
      { category: "legal_regulatory", query: "Acme lawsuit" },
      { category: "legal_regulatory", query: "Acme fined" },
      { category: "legal_regulatory", query: "Acme FTC" },
      { category: "legal_regulatory", query: "Acme settlement" },
    ]);
    expect(planSearches(target, ["availability"])).toEqual([
      { category: "availability", query: "Acme outage" },
    ]);
    expect(planSearches(target, ["certifications", "ai_specific"])).toEqual([]);
  });

  it("adds a search led by the first other name of the vendor for each news category, before the hints", () => {
    const known = { ...target, aliases: ["Initech Ltd", "Initrode"] };
    const hints = [{ category: "security_incidents" as const, query: "Acme ransomware" }];

    expect(planSearches(known, ALL, hints)).toEqual([
      { category: "security_incidents", query: "Acme data breach" },
      { category: "security_incidents", query: "Acme security incident" },
      { category: "security_incidents", query: "Initech data breach" },
      { category: "legal_regulatory", query: "Acme lawsuit" },
      { category: "legal_regulatory", query: "Acme fined" },
      { category: "legal_regulatory", query: "Acme FTC" },
      { category: "legal_regulatory", query: "Acme settlement" },
      { category: "legal_regulatory", query: "Initech lawsuit" },
      { category: "availability", query: "Acme outage" },
      { category: "availability", query: "Initech outage" },
      { category: "security_incidents", query: "Acme ransomware" },
    ]);
  });

  it("adds the searches in the language of the vendor's market after the English ones, with the language, before the hints", () => {
    const german = buildTarget({
      vendor_name: "Brise GmbH",
      website: "brise.de",
      vendor_provides: "Cloud hosting",
    });
    const hints = [{ category: "security_incidents" as const, query: "Brise ransomware" }];

    expect(planSearches(german, ALL, hints)).toEqual([
      { category: "security_incidents", query: "Brise data breach" },
      { category: "security_incidents", query: "Brise security incident" },
      { category: "security_incidents", query: "Brise Datenleck", language: "German" },
      { category: "security_incidents", query: "Brise Cyberangriff", language: "German" },
      { category: "legal_regulatory", query: "Brise lawsuit" },
      { category: "legal_regulatory", query: "Brise fined" },
      { category: "legal_regulatory", query: "Brise Datenschutz Bußgeld", language: "German" },
      { category: "legal_regulatory", query: "Brise Klage", language: "German" },
      // The outage news is asked in English for every market.
      { category: "availability", query: "Brise outage" },
      { category: "security_incidents", query: "Brise ransomware" },
    ]);
  });

  it("adds the searches of the hints after the baseline ones", () => {
    const hints = [{ category: "security_incidents" as const, query: "Acme ransomware" }];

    const plan = planSearches(target, ALL, hints);

    expect(plan.slice(0, 7).map((search) => search.query)).toEqual([
      "Acme data breach",
      "Acme security incident",
      "Acme lawsuit",
      "Acme fined",
      "Acme FTC",
      "Acme settlement",
      "Acme outage",
    ]);
    expect(plan[7]).toEqual({ category: "security_incidents", query: "Acme ransomware" });
    expect(plan).toHaveLength(8);
  });
});

describe("planNewsReads", () => {
  const entry = (
    url: string,
    overrides: Partial<LedgerEntry<ResearchCategory>> = {},
  ): LedgerEntry<ResearchCategory> => ({
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    title: "Acme data breach",
    content: "Acme said attackers reached customer data.",
    publishedAt: "2031-03-01T08:00:00.000Z",
    ...overrides,
    url,
  });
  const urls = (ledger: LedgerEntry<ResearchCategory>[], researchable = ALL) =>
    planNewsReads({ ledger, target, researchable }).map((read) => read.url);

  it("news reads are ordered by registry category: official, trusted press, the vendor, unverified", () => {
    const ledger = [
      entry("https://blog.example.net/acme"),
      entry("https://acme.com/blog/incident", { onVendorSite: true }),
      entry("https://www.reuters.com/technology/acme"),
      entry("https://ico.org.uk/action/acme"),
    ];

    // The vendor's own post is not the best: a regulator and a trusted publisher come before it.
    expect(urls(ledger)).toEqual([
      "https://ico.org.uk/action/acme",
      "https://www.reuters.com/technology/acme",
    ]);
    // With the regulator and the publisher out, the vendor comes before the unverified.
    expect(urls(ledger.slice(0, 2))).toEqual([
      "https://acme.com/blog/incident",
      "https://blog.example.net/acme",
    ]);
  });

  it("reads the best two results of each news category, the categories in their order", () => {
    const ledger = [
      entry("https://a.example/1", { category: "legal_regulatory" }),
      entry("https://a.example/2", { category: "legal_regulatory" }),
      entry("https://a.example/3", { category: "legal_regulatory" }),
      entry("https://b.example/1"),
      entry("https://b.example/2"),
      entry("https://b.example/3"),
    ];

    expect(MAX_NEWS_READS_PER_CATEGORY).toBe(2);
    expect(
      planNewsReads({ ledger, target, researchable: ALL }).map((read) => [read.category, read.url]),
    ).toEqual([
      ["security_incidents", "https://b.example/1"],
      ["security_incidents", "https://b.example/2"],
      ["legal_regulatory", "https://a.example/1"],
      ["legal_regulatory", "https://a.example/2"],
    ]);
  });

  it("counts a title that names the vendor by one of its other names as naming the vendor", () => {
    const known = { ...target, aliases: ["Initech"] };
    const ledger = [
      entry("https://a.example/passing", { title: "Cloud outages of the week" }),
      entry("https://b.example/about", { title: "Initech data breach" }),
    ];

    expect(planNewsReads({ ledger, target: known, researchable: ALL }).map((r) => r.url)).toEqual([
      "https://b.example/about",
      "https://a.example/passing",
    ]);
    expect(planNewsReads({ ledger, target, researchable: ALL }).map((r) => r.url)).toEqual([
      "https://a.example/passing",
      "https://b.example/about",
    ]);
  });

  it("puts a result whose title names the vendor before one that names it only in its text", () => {
    const ledger = [
      entry("https://a.example/passing", { title: "Cloud outage hits customers" }),
      entry("https://b.example/named"),
      entry("https://c.example/named"),
    ];

    expect(urls(ledger)).toEqual(["https://b.example/named", "https://c.example/named"]);
  });

  it("prefers a regulator or a major publisher to a site nobody knows or an aggregator", () => {
    const ledger = [
      entry("https://www.reddit.com/r/security/acme"),
      entry("https://blog.example/acme"),
      entry("https://www.reuters.com/acme-breach"),
      entry("https://www.sec.gov/acme-8k"),
    ];

    expect(urls(ledger)).toEqual([
      "https://www.sec.gov/acme-8k",
      "https://www.reuters.com/acme-breach",
    ]);
    // An aggregator and a site nobody knows are both unverified: the order of the search decides.
    expect(urls(ledger.slice(0, 2))).toEqual([
      "https://www.reddit.com/r/security/acme",
      "https://blog.example/acme",
    ]);
  });

  it("puts relevance before credibility: an article about the vendor on a small site comes before a passing mention in a big one", () => {
    const ledger = [
      entry("https://www.reuters.com/roundup", { title: "Cloud outages this week" }),
      entry("https://small.example/acme"),
      entry("https://other.example/acme"),
    ];

    expect(urls(ledger)).toEqual(["https://small.example/acme", "https://other.example/acme"]);
  });

  it("puts credibility before recency", () => {
    const ledger = [
      entry("https://small.example/new", { publishedAt: "2031-03-10T00:00:00.000Z" }),
      entry("https://www.reuters.com/old", { publishedAt: "2030-01-01T00:00:00.000Z" }),
      entry("https://other.example/newer", { publishedAt: "2031-03-11T00:00:00.000Z" }),
    ];

    expect(urls(ledger)).toEqual(["https://www.reuters.com/old", "https://other.example/newer"]);
  });

  it("ranks the vendor's own notice after a trusted publisher and before a site nobody knows", () => {
    const ledger = [
      entry("https://blog.example/acme"),
      entry("https://acme.com/security-notice", { onVendorSite: true }),
      entry("https://www.reuters.com/acme-breach"),
    ];

    expect(urls(ledger)).toEqual([
      "https://www.reuters.com/acme-breach",
      "https://acme.com/security-notice",
    ]);
  });

  it("prefers the more recent of two equal results, and puts an undated one last", () => {
    const ledger = [
      entry("https://a.example/undated", { publishedAt: null }),
      entry("https://b.example/old", { publishedAt: "2030-01-01T00:00:00.000Z" }),
      entry("https://c.example/new", { publishedAt: "2031-02-01T00:00:00.000Z" }),
    ];

    expect(urls(ledger)).toEqual(["https://c.example/new", "https://b.example/old"]);
  });

  it("keeps the order of the search for results that nothing tells apart", () => {
    const ledger = [
      entry("https://a.example/first", { publishedAt: null }),
      entry("https://b.example/second", { publishedAt: null }),
      entry("https://c.example/third", { publishedAt: null }),
    ];

    expect(urls(ledger)).toEqual(["https://a.example/first", "https://b.example/second"]);
  });

  it("takes results of different publishers before a second one of the same publisher", () => {
    const ledger = [
      entry("https://www.reuters.com/one"),
      entry("https://www.reuters.com/two"),
      entry("https://www.bbc.com/three", { publishedAt: "2030-01-01T00:00:00.000Z" }),
    ];

    expect(urls(ledger)).toEqual(["https://www.reuters.com/one", "https://www.bbc.com/three"]);
  });

  it("takes a second result of the same publisher when no other publisher has one", () => {
    const ledger = [entry("https://www.reuters.com/one"), entry("https://www.reuters.com/two")];

    expect(urls(ledger)).toEqual(["https://www.reuters.com/one", "https://www.reuters.com/two"]);
  });

  it("leaves out pages that were read, the categories that read the site, and categories the run cannot use", () => {
    const ledger = [
      entry("https://a.example/page", { kind: "page" }),
      entry("https://a.example/trust", { category: "certifications" }),
      entry("https://a.example/ai", { category: "ai_specific" }),
      entry("https://a.example/suit", { category: "legal_regulatory" }),
      entry("https://a.example/breach"),
    ];

    expect(urls(ledger, ["security_incidents"])).toEqual(["https://a.example/breach"]);
    expect(urls(ledger, ALL)).toEqual(["https://a.example/breach", "https://a.example/suit"]);
  });

  it("plans nothing when the searches found nothing", () => {
    expect(urls([])).toEqual([]);
  });
});

describe("describeGathered", () => {
  const search = (
    query: string,
    results: number,
    category: ResearchCategory = "security_incidents",
  ): GatheredAction => ({
    tool: "search",
    category,
    kind: "news",
    query,
    outcome: results === 0 ? "empty" : "ok",
    results,
    ms: 5,
  });
  const entry = (
    title: string,
    url: string,
    kind: "page" | "result",
    category: ResearchCategory,
  ) => ({
    category,
    kind,
    onVendorSite: false,
    url,
    title,
    content: "x",
    publishedAt: "2031-03-01T08:00:00.000Z",
  });

  describe("with the records of public databases", () => {
    const outcome = (
      source: RecordsOutcome["source"],
      count: number,
      failed = false,
    ): RecordsOutcome => ({
      source,
      url: `https://db.example/${source}`,
      outcome: failed ? "failed" : count === 0 ? "empty" : "ok",
      ...(failed ? { reason: "unreachable" as const } : {}),
      records: Array.from({ length: count }, (_, index) => ({
        url: `https://db.example/${source}/${index}`,
        title: `Record ${source} ${index}`,
        text: "x",
        publishedAt: "2031-03-01",
      })),
      omitted: {},
      ms: 5,
    });

    it("says what each database gave, and that a database could not be reached", () => {
      const text = describeGathered([search("Acme data breach", 0)], [], undefined, [
        outcome("kev", 2),
        outcome("nvd", 0),
        outcome("hibp", 0, true),
        outcome("sec", 1),
        outcome("statuspage", 3),
        outcome("ofac", 1),
      ]);

      expect(text).toContain(
        "Records of public databases (looked up by the code with the name and the domain of the vendor):",
      );
      expect(text).toContain("- CISA Known Exploited Vulnerabilities catalog: 2 records");
      expect(text).toContain(
        "- National Vulnerability Database (critical vulnerabilities, each with its date): no records",
      );
      expect(text).toContain(
        "- Have I Been Pwned (breaches of the vendor's domain): the database could not be reached",
      );
      expect(text).toContain(
        "- SEC EDGAR (Form 8-K Item 1.05, the vendor's own reports of material cybersecurity incidents): 1 record",
      );
      expect(text).toContain(
        "- Status page of the vendor (the incident history it publishes): 3 records",
      );
      expect(text).toContain(
        "- OFAC sanctions list of the US Treasury (entities that have the name of the vendor): 1 record",
      );
    });

    it("says 1 record for one", () => {
      const text = describeGathered([search("Acme data breach", 0)], [], undefined, [
        outcome("hibp", 1),
      ]);

      expect(text).toContain("- Have I Been Pwned (breaches of the vendor's domain): 1 record");
      expect(text).not.toContain("1 records");
    });

    it("marks the sources that are records, and no other", () => {
      const records = [outcome("kev", 1)];
      const text = describeGathered(
        [search("Acme data breach", 1)],
        [
          entry("Record kev 0", "https://db.example/kev/0", "page", "security_incidents"),
          entry("Acme breach", "https://news.example/a", "result", "security_incidents"),
          entry("Trust", "https://acme.com/trust", "page", "certifications"),
        ],
        undefined,
        records,
      );

      expect(text).toContain("- Record kev 0 - https://db.example/kev/0 - 2031-03-01 (record)");
      expect(text).toContain("- Acme breach - https://news.example/a - 2031-03-01 (search result)");
      expect(text).toContain("- Trust - https://acme.com/trust - 2031-03-01 (page read)");
    });

    it("says nothing of them to a loop that does not research their category", () => {
      const text = describeGathered(
        [search("Acme lawsuit", 0, "legal_regulatory")],
        [],
        ["legal_regulatory"],
        [outcome("kev", 2), outcome("statuspage", 1)],
      );

      expect(text).not.toContain("Records of public databases");
    });

    it("tells a loop of one category only of the databases of that category", () => {
      const records = [outcome("kev", 2), outcome("hibp", 1), outcome("statuspage", 3)];

      const security = describeGathered([], [], ["security_incidents"], records);
      const availability = describeGathered([], [], ["availability"], records);

      expect(security).toContain("- CISA Known Exploited Vulnerabilities catalog: 2 records");
      expect(security).toContain("- Have I Been Pwned (breaches of the vendor's domain): 1 record");
      expect(security).not.toContain("Status page");
      expect(availability).toContain(
        "- Status page of the vendor (the incident history it publishes): 3 records",
      );
      expect(availability).not.toContain("CISA");
      expect(availability).not.toContain("Have I Been Pwned");
    });

    it("tells a loop of legal and regulatory matters of the sanctions list, and of no other database", () => {
      const records = [outcome("kev", 2), outcome("ofac", 1), outcome("statuspage", 1)];

      const legal = describeGathered([], [], ["legal_regulatory"], records);

      expect(legal).toContain(
        "- OFAC sanctions list of the US Treasury (entities that have the name of the vendor): 1 record",
      );
      expect(legal).not.toContain("CISA");
      expect(legal).not.toContain("Status page");
      expect(describeGathered([], [], ["security_incidents"], records)).not.toContain("OFAC");
    });

    it("tells a loop of several categories of the databases of each", () => {
      const text = describeGathered(
        [],
        [],
        ["legal_regulatory", "availability", "security_incidents"],
        [outcome("kev", 1), outcome("statuspage", 1)],
      );

      expect(text).toContain("- CISA Known Exploited Vulnerabilities catalog: 1 record");
      expect(text).toContain("- Status page of the vendor");
    });

    it("marks the records of the status page in the sources of availability", () => {
      const text = describeGathered(
        [],
        [
          entry(
            "Status page: the outage",
            "https://db.example/statuspage/0",
            "page",
            "availability",
          ),
          entry("Acme outage", "https://news.example/outage", "result", "availability"),
        ],
        ["availability"],
        [outcome("statuspage", 1)],
      );

      expect(text).toContain(
        "- Status page: the outage - https://db.example/statuspage/0 - 2031-03-01 (record)",
      );
      expect(text).toContain(
        "- Acme outage - https://news.example/outage - 2031-03-01 (search result)",
      );
    });

    it("has a briefing when only the records were looked up", () => {
      const text = describeGathered([], [], ["security_incidents"], [outcome("kev", 1)]);

      expect(text).toContain("Records of public databases");
      expect(text).toContain("- CISA Known Exploited Vulnerabilities catalog: 1 record");
    });

    it("says nothing when there are no records and nothing was done", () => {
      expect(describeGathered([], [], undefined, [])).toBeNull();
    });
  });

  it("says nothing when the code did nothing", () => {
    expect(describeGathered([], [])).toBeNull();
  });

  it("lists the searches with what they found and the sources by category", () => {
    const text = describeGathered(
      [search("Acme data breach", 2), search("Acme security incident", 0)],
      [
        entry("Acme breach", "https://news.example/a", "result", "security_incidents"),
        entry("Trust", "https://acme.com/trust", "page", "certifications"),
      ],
    );

    expect(text).toContain("- security_incidents: Acme data breach - 2 results");
    expect(text).toContain("- security_incidents: Acme security incident - no results");
    expect(text).toContain(
      "security_incidents:\n- Acme breach - https://news.example/a - 2031-03-01 (search result)",
    );
    expect(text).toContain(
      "certifications:\n- Trust - https://acme.com/trust - 2031-03-01 (page read)",
    );
    expect(text).toMatch(/Do not repeat them/);
  });

  it("says which query the engine was given when it is not the one asked for", () => {
    const text = describeGathered(
      [{ ...search("Acme breach", 1), usedQuery: "Acme breach news" }],
      [],
    );

    expect(text).toContain("Acme breach news");
  });

  it("says in which language a search was made, when it was not English", () => {
    const text = describeGathered(
      [{ ...search("Brise Datenleck", 1), language: "German" }, search("Brise data breach", 0)],
      [],
    );

    expect(text).toContain("- security_incidents: Brise Datenleck (German) - 1 result");
    expect(text).toContain("- security_incidents: Brise data breach - no results");
  });

  it("counts the pages of the site that were read, and names a source without a title by its address", () => {
    const text = describeGathered(
      [
        {
          tool: "read",
          category: "certifications",
          url: "https://acme.com/trust",
          outcome: "ok",
          results: 1,
          ms: 1,
        },
        {
          tool: "read",
          category: "certifications",
          url: "https://acme.com/x",
          outcome: "failed",
          reason: "not_found",
          ms: 1,
        },
      ],
      [entry("", "https://acme.com/.well-known/security.txt", "page", "certifications")],
    );

    expect(text).toContain("1 of 2 were read");
    expect(text).toContain(
      "- https://acme.com/.well-known/security.txt - https://acme.com/.well-known/security.txt",
    );
  });

  it("counts the articles of the search results apart from the pages of the site", () => {
    const read = (
      category: ResearchCategory,
      url: string,
      outcome: "ok" | "failed",
    ): GatheredAction => ({
      tool: "read",
      category,
      url,
      outcome,
      ...(outcome === "ok" ? { results: 1 } : { reason: "blocked_by_site" }),
      ms: 1,
    });

    const text = describeGathered(
      [
        read("certifications", "https://acme.com/trust", "ok"),
        read("security_incidents", "https://news.example/a", "ok"),
        read("legal_regulatory", "https://news.example/b", "failed"),
        read("legal_regulatory", "https://news.example/c", "failed"),
      ],
      [],
    );

    expect(text).toContain("Pages of the vendor's website: 1 of 1 were read");
    expect(text).toContain("Articles from the search results: 1 of 3 were read");
  });

  it("lists at most six sources of a category, with titles cut to 100 characters", () => {
    const entries = Array.from({ length: 9 }, (_, n) =>
      entry(
        `Title ${n} ${"x".repeat(200)}`,
        `https://news.example/${n}`,
        "result",
        "security_incidents",
      ),
    );

    const text = describeGathered([search("Acme data breach", 9)], entries) ?? "";

    expect(text.match(/https:\/\/news\.example\/\d/g)).toHaveLength(6);
    expect(text).not.toContain("x".repeat(101));
  });

  describe("for the categories of one loop", () => {
    const read = (category: ResearchCategory, url: string): GatheredAction => ({
      tool: "read",
      category,
      url,
      outcome: "ok",
      results: 1,
      ms: 1,
    });
    const actions = [
      search("Acme data breach", 2),
      search("Acme lawsuit", 1, "legal_regulatory"),
      read("security_incidents", "https://news.example/a"),
      read("certifications", "https://acme.com/trust"),
    ];
    const ledger = [
      entry("Acme breach", "https://news.example/a", "page", "security_incidents"),
      entry("Acme sued", "https://news.example/b", "result", "legal_regulatory"),
      entry("Trust", "https://acme.com/trust", "page", "certifications"),
    ];

    it("lists only the searches, the reads and the sources of those categories", () => {
      const text = describeGathered(actions, ledger, ["security_incidents"]) ?? "";

      expect(text).toContain("- security_incidents: Acme data breach - 2 results");
      expect(text).toContain("Articles from the search results: 1 of 1 were read");
      expect(text).toContain("https://news.example/a");
      expect(text).not.toContain("Acme lawsuit");
      expect(text).not.toContain("https://news.example/b");
      expect(text).not.toContain("https://acme.com/trust");
      expect(text).not.toContain("Pages of the vendor's website");
    });

    it("lists the categories it is given in the order of the categories", () => {
      const text =
        describeGathered(actions, ledger, ["legal_regulatory", "security_incidents"]) ?? "";

      expect(text.indexOf("security_incidents:\n")).toBeLessThan(
        text.indexOf("legal_regulatory:\n"),
      );
      expect(text).toContain("Acme lawsuit");
      expect(text).not.toContain("acme.com/trust");
    });

    it("says nothing when the code did nothing for those categories", () => {
      expect(describeGathered(actions, ledger, ["ai_specific"])).toBeNull();
    });

    it("describes all the categories when none are given", () => {
      expect(describeGathered(actions, ledger)).toBe(
        describeGathered(actions, ledger, RESEARCH_CATEGORIES),
      );
    });
  });
});

describe("traceStepOfRecords", () => {
  const outcome = (over: Partial<RecordsOutcome> = {}): RecordsOutcome => ({
    source: "kev",
    url: "https://db.example/kev.json",
    outcome: "ok",
    records: [
      { url: "https://db.example/1", title: "t", text: "x", publishedAt: "2031-03-01" },
      { url: "https://db.example/2", title: "t", text: "x", publishedAt: "2031-03-02" },
    ],
    omitted: {},
    ms: 120,
    ...over,
  });

  it("is a step of the code for the lookup, with the address asked and the records it gave", () => {
    expect(traceStepOfRecords(outcome())).toEqual({
      by: "code",
      tool: "gather",
      category: "security_incidents",
      url: "https://db.example/kev.json",
      outcome: "ok",
      results: 2,
      ms: 120,
    });
  });

  it("is about the category of its database: availability for the status page, legal and regulatory for the sanctions list", () => {
    expect(traceStepOfRecords(outcome({ source: "statuspage" })).category).toBe("availability");
    expect(traceStepOfRecords(outcome({ source: "ofac" })).category).toBe("legal_regulatory");
    for (const source of ["kev", "nvd", "hibp", "sec"] as const) {
      expect(traceStepOfRecords(outcome({ source })).category).toBe("security_incidents");
    }
  });

  it("keeps the reason a lookup failed for, and what it left out", () => {
    expect(
      traceStepOfRecords(
        outcome({
          outcome: "failed",
          reason: "blocked_by_site",
          records: [],
          omitted: { old: 3, more: 1 },
        }),
      ),
    ).toEqual({
      by: "code",
      tool: "gather",
      category: "security_incidents",
      url: "https://db.example/kev.json",
      outcome: "failed",
      reason: "blocked_by_site",
      results: 0,
      omitted: { old: 3, more: 1 },
      ms: 120,
    });
  });

  it("leaves out a count of zero, and the whole key when nothing was left out", () => {
    expect(traceStepOfRecords(outcome({ omitted: { old: 0, more: 2 } })).omitted).toEqual({
      more: 2,
    });
    expect(traceStepOfRecords(outcome({ omitted: { old: 0 } }))).not.toHaveProperty("omitted");
  });

  it("holds none of the text of a record", () => {
    expect(JSON.stringify(traceStepOfRecords(outcome()))).not.toContain("Record");
  });
});

describe("traceStepOfSitemap", () => {
  const SITEMAP = "https://acme.com/sitemap.xml";

  it("has no step when no sitemap was read", () => {
    expect(traceStepOfSitemap(null)).toBeNull();
  });

  it("is a step of the code, with the addresses it listed", () => {
    expect(traceStepOfSitemap({ url: SITEMAP, outcome: "ok", urls: 42, ms: 130 })).toEqual({
      by: "code",
      tool: "gather",
      url: SITEMAP,
      outcome: "ok",
      results: 42,
      ms: 130,
    });
  });

  it("says empty for a sitemap that lists no address of the site", () => {
    expect(traceStepOfSitemap({ url: SITEMAP, outcome: "ok", urls: 0, ms: 5 })).toMatchObject({
      outcome: "empty",
      results: 0,
    });
  });

  it("keeps the reason a read failed for", () => {
    expect(
      traceStepOfSitemap({ url: SITEMAP, outcome: "failed", reason: "not_found", urls: 0, ms: 9 }),
    ).toEqual({
      by: "code",
      tool: "gather",
      url: SITEMAP,
      outcome: "failed",
      reason: "not_found",
      results: 0,
      ms: 9,
    });
  });
});

describe("gatherSources", () => {
  const NEWS_BREACH: SearchResult = {
    title: "Acme data breach exposes customers",
    url: "https://news.example/acme-breach",
    snippet: "Acme said attackers reached customer data last week.",
    publishedAt: "2031-03-01T08:00:00.000Z",
    source: "Example News",
  };
  const NOW_CUTOFFS = {
    security_incidents: "2029-04-20",
    certifications: "2029-04-20",
    legal_regulatory: "2028-04-20",
    ai_specific: "2029-04-20",
    availability: "2030-04-20",
  };

  const readable = (
    overrides: Partial<Extract<WebsiteCheck, { status: "readable" }>> = {},
  ): WebsiteCheck => ({
    status: "readable",
    url: "https://www.acme.com/",
    namesVendor: true,
    redirectedTo: null,
    alias: null,
    links: [
      { text: "Security", url: "https://www.acme.com/security" },
      { text: "Privacy", url: "https://www.acme.com/privacy" },
    ],
    ...overrides,
  });

  interface Setup {
    answers?: Record<string, SearchResult[] | Error>;
    pages?: Record<string, Partial<FetchedPage> | PageReadError>;
    domain?: string | null;
    aliasDomains?: string[];
    /** The vendor the session keeps results for; the one of the file by default. */
    vendor?: ResearchTarget;
  }

  function setup(options: Setup = {}) {
    const asked: Array<{ query: string; kind: SearchKind }> = [];
    const search = jest.fn(async (query: string, kind: SearchKind) => {
      asked.push({ query, kind });
      const answer = options.answers?.[query] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    });
    const readPage = jest.fn(async (url: string): Promise<FetchedPage> => {
      const fields = options.pages?.[url];
      if (fields === undefined || fields instanceof PageReadError) {
        throw fields ?? new PageReadError("not_found");
      }
      return {
        url,
        title: `Page at ${url}`,
        publishedAt: null,
        text: `Text of ${url}`,
        links: [],
        ...fields,
      };
    });
    const matcher = createVendorMatcher(options.vendor ?? target);
    const session = createWebSession<ResearchCategory>({
      engine: { id: "replay", kinds: ["web", "news"], newsWindowMonths: null, search },
      readPage,
      domain: options.domain === undefined ? "acme.com" : options.domain,
      aliasDomains: options.aliasDomains,
      cutoffs: NOW_CUTOFFS,
      isRelevant: ({ title, snippet, url }) => matcher({ title, content: snippet, url }),
    });
    return { session, search, readPage, asked };
  }

  const run = (
    environment: ReturnType<typeof setup>,
    input: Partial<Parameters<typeof gatherSources>[0]> = {},
  ) =>
    gatherSources(
      {
        target,
        researchable: ALL,
        website: readable(),
        signal: new AbortController().signal,
        ...input,
      },
      { session: environment.session, readPage: environment.readPage },
    );

  describe("the records of public databases", () => {
    const NOW = new Date("2031-04-20T12:00:00Z");
    const kev = (count = 1): RecordsOutcome => ({
      source: "kev",
      url: "https://db.example/kev.json",
      outcome: count === 0 ? "empty" : "ok",
      records: Array.from({ length: count }, (_, index) => ({
        url: `https://nvd.example/CVE-2031-000${index}`,
        title: `CVE-2031-000${index}: Acme flaw`,
        text: `CISA entry ${index}`,
        publishedAt: "2031-04-01",
      })),
      omitted: {},
      ms: 30,
    });
    const statuspage = (count = 1): RecordsOutcome => ({
      source: "statuspage",
      url: "https://status.acme.com/history.atom",
      outcome: count === 0 ? "empty" : "ok",
      records: Array.from({ length: count }, (_, index) => ({
        url: `https://status.acme.com/incidents/abc${index}`,
        title: `Status page of Acme: outage ${index}`,
        text: `Acme status entry ${index}`,
        publishedAt: "2031-04-10",
      })),
      omitted: {},
      ms: 40,
    });
    const withRecords = (
      environment: ReturnType<typeof setup>,
      lookup: RecordsLookup,
      input: Partial<Parameters<typeof gatherSources>[0]> = {},
    ) =>
      gatherSources(
        {
          target,
          researchable: ALL,
          website: readable(),
          signal: new AbortController().signal,
          now: NOW,
          cutoffs: NOW_CUTOFFS,
          ...input,
        },
        { session: environment.session, readPage: environment.readPage, records: lookup },
      );

    describe("of the vendor risk database", () => {
      const KEV_META: VrdbRecordMeta = {
        recordId: 41,
        sourceId: "kev",
        sourceRecordId: "CVE-2031-0000",
        strength: "strong",
        method: "kev_vendor",
        matchedKey: "kev:acme",
        status: "active",
        asOf: "2031-04-19",
        stale: false,
      };
      const OFAC_META: VrdbRecordMeta = {
        recordId: 42,
        sourceId: "ofac",
        sourceRecordId: "901",
        strength: "weak",
        method: "name_exact",
        matchedKey: "name:acme",
        status: "active",
        asOf: "2031-04-19",
        stale: false,
      };
      const coverageOf = (
        id: VrdbSourceId,
        outcome: CoverageOutcome,
        counts = { strong: 0, weak: 0 },
      ): CoverageSource => ({
        id,
        name: vrdbSourceOf(id).name,
        attribution: vrdbSourceOf(id).attribution,
        mode: "mirror",
        checked: outcome === "found" || outcome === "none",
        outcome,
        ...counts,
        last_success_at: outcome === "failed" ? null : "2031-04-19T06:41:00.000Z",
        stale: false,
      });
      const OUTCOME: VrdbOutcome = {
        records: [
          {
            source: "kev",
            records: [
              {
                url: "https://nvd.example/CVE-2031-0000",
                title: "CVE-2031-0000: Acme flaw",
                text: "CISA entry. As of 2031-04-19.",
                publishedAt: "2031-04-01",
                vrdb: KEV_META,
              },
            ],
            omitted: {},
          },
          {
            source: "ofac",
            records: [
              {
                url: "https://sanctions.example/?id=901",
                title: "OFAC SDN list: ACME LLC",
                text: "OFAC entry. As of 2031-04-19.",
                publishedAt: "2031-04-19",
                vrdb: OFAC_META,
              },
            ],
            omitted: { more: 1 },
          },
          { source: "uk_sanctions", records: [], omitted: {} },
        ],
        coverage: [
          coverageOf("kev", "found", { strong: 1, weak: 0 }),
          coverageOf("ofac", "found", { strong: 0, weak: 1 }),
          coverageOf("uk_sanctions", "none"),
          coverageOf("eu_fsf", "failed"),
        ],
      };
      const withVrdb = (
        environment: ReturnType<typeof setup>,
        lookups: { records?: RecordsLookup; vrdb: jest.Mock },
      ) =>
        gatherSources(
          {
            target,
            researchable: ALL,
            website: readable(),
            signal: new AbortController().signal,
            now: NOW,
            cutoffs: NOW_CUTOFFS,
          },
          { session: environment.session, readPage: environment.readPage, ...lookups },
        );

      it("a VRDB record enters the ledger with its meta, before the other records", async () => {
        const environment = setup({ answers: { "Acme data breach": [NEWS_BREACH] } });
        const vrdb = jest.fn(async () => OUTCOME);

        const result = await withVrdb(environment, {
          records: async () => [statuspage(1)],
          vrdb,
        });

        expect(vrdb).toHaveBeenCalledWith({
          target,
          researchable: ALL,
          cutoffs: NOW_CUTOFFS,
          now: NOW,
          verifiedDomains: ["acme.com"],
          // The read-through sources are asked within the run's time, and may read pages.
          signal: expect.any(AbortSignal),
          readPage: environment.readPage,
        });
        expect(
          environment.session
            .snapshot()
            .ledger.slice(0, 4)
            .map((entry) => [entry.url, entry.category, entry.record, entry.vrdb]),
        ).toEqual([
          ["https://nvd.example/CVE-2031-0000", "security_incidents", "kev", KEV_META],
          ["https://sanctions.example/?id=901", "legal_regulatory", "ofac", OFAC_META],
          ["https://status.acme.com/incidents/abc0", "availability", "statuspage", undefined],
          ["https://news.example/acme-breach", "security_incidents", undefined, undefined],
        ]);
        expect(result.vrdb).toEqual(OUTCOME);
        // The lists are outcomes like the lookups', at the page that documents each list.
        expect(result.records.map((o) => [o.source, o.outcome, o.records.length, o.url])).toEqual([
          ["kev", "ok", 1, vrdbSourceOf("kev").documentationUrl],
          ["ofac", "ok", 1, vrdbSourceOf("ofac").documentationUrl],
          ["uk_sanctions", "empty", 0, vrdbSourceOf("uk_sanctions").documentationUrl],
          ["eu_fsf", "failed", 0, vrdbSourceOf("eu_fsf").documentationUrl],
          ["statuspage", "ok", 1, "https://status.acme.com/history.atom"],
        ]);
        expect(result.records[1].omitted).toEqual({ more: 1 });
      });

      it("the VRDB lookup gets no verified domain when the home page does not name the vendor", async () => {
        const environment = setup();
        const vrdb = jest.fn(async () => OUTCOME);

        await gatherSources(
          {
            target,
            researchable: ALL,
            website: readable({ namesVendor: false }),
            signal: new AbortController().signal,
            now: NOW,
            cutoffs: NOW_CUTOFFS,
          },
          { session: environment.session, readPage: environment.readPage, vrdb },
        );

        expect(vrdb).toHaveBeenCalledWith(expect.objectContaining({ verifiedDomains: [] }));
      });

      it("an NVD record at the address of a VRDB record adds its words to it", async () => {
        const environment = setup();
        const nvd: RecordsOutcome = {
          source: "nvd",
          url: "https://db.example/nvd.json",
          outcome: "ok",
          records: [
            {
              url: "https://nvd.example/CVE-2031-0000",
              title: "CVE-2031-0000",
              text: "NVD: CVSS 9.8.",
              publishedAt: "2031-04-02",
            },
          ],
          omitted: {},
          ms: 20,
        };

        const result = await withVrdb(environment, {
          records: async () => [nvd],
          vrdb: jest.fn(async () => OUTCOME),
        });

        const sameAddress = environment.session
          .snapshot()
          .ledger.filter((entry) => entry.url === "https://nvd.example/CVE-2031-0000");
        expect(sameAddress).toEqual([
          expect.objectContaining({
            record: "kev",
            vrdb: KEV_META,
            content: "CISA entry. As of 2031-04-19. NVD: CVSS 9.8.",
          }),
        ]);
        expect(result.records.find((o) => o.source === "nvd")).toMatchObject({
          outcome: "empty",
          records: [],
        });
      });

      it("the briefing names the lists of the vendor risk database", async () => {
        const result = await withVrdb(setup(), { vrdb: jest.fn(async () => OUTCOME) });

        expect(result.digest).toContain("- CISA Known Exploited Vulnerabilities catalog: 1 record");
        expect(result.digest).toContain(
          "- UK Sanctions List of the FCDO (entities that have the name or the verified website of the vendor): no records",
        );
        expect(result.digest).toContain(
          "- EU consolidated list of financial sanctions (entities that have the name or the verified website of the vendor): the database could not be reached",
        );
        expect(result.digest).toMatch(
          /OFAC SDN list: ACME LLC - https:\/\/sanctions\.example\/\?id=901 - 2031-04-19 \(record\)/,
        );
      });

      it("the briefing says a list that could not be asked again offers the records of its last answer", async () => {
        const failedNvd: VrdbOutcome = {
          records: [
            {
              source: "nvd",
              records: [
                {
                  url: "https://nvd.example/CVE-2031-0001",
                  title: "CVE-2031-0001: critical vulnerability (CVSS 9.8)",
                  text: "NVD entry. As of 2031-04-18.",
                  publishedAt: "2031-04-01",
                  vrdb: { ...KEV_META, sourceId: "nvd", sourceRecordId: "CVE-2031-0001" },
                },
              ],
              omitted: {},
            },
          ],
          coverage: [
            { ...coverageOf("nvd", "failed"), mode: "read_through" },
            { ...coverageOf("ofac", "failed"), last_success_at: null },
          ],
        };

        const result = await withVrdb(setup(), { vrdb: jest.fn(async () => failedNvd) });

        expect(result.digest).toContain(
          "- National Vulnerability Database (critical vulnerabilities, each with its date): the database could not be reached; 1 record from its last answer",
        );
        expect(result.digest).toContain(
          "- OFAC sanctions list of the US Treasury (entities that have the name of the vendor): the database could not be reached\n",
        );
      });

      it("says what each database asked beside it answered, and not the NVD or the SEC, which it reads through", async () => {
        const nvd: RecordsOutcome = {
          source: "nvd",
          url: "https://db.example/nvd.json",
          outcome: "ok",
          records: [
            {
              url: "https://nvd.example/CVE-2031-0000",
              title: "CVE-2031-0000",
              text: "NVD: CVSS 9.8.",
              publishedAt: "2031-04-02",
            },
          ],
          omitted: {},
          ms: 20,
        };
        const failed: RecordsOutcome = {
          source: "statuspage",
          url: "https://status.acme.com/history.atom",
          outcome: "failed",
          reason: "unreachable",
          records: [],
          omitted: {},
          ms: 8000,
        };

        const result = await withVrdb(setup(), {
          records: async () => [nvd, failed],
          vrdb: jest.fn(async () => OUTCOME),
        });

        // The SEC is read through by the database now that Q4 is open, so it is no lookup beside it.
        expect(result.lookups).toEqual([
          { id: "hibp", outcome: "not_researched" },
          { id: "statuspage", outcome: "failed" },
        ]);
      });

      it("names Have I Been Pwned and the status page: the databases the run asks beside the vendor risk database", () => {
        expect(coverageOfLookups([]).map((lookup) => lookup.id)).toEqual(["hibp", "statuspage"]);
      });

      it("says the databases beside it are off without the lookup of records", async () => {
        const result = await withVrdb(setup(), { vrdb: jest.fn(async () => OUTCOME) });

        expect(result.lookups.map((lookup) => lookup.outcome)).toEqual(["off", "off"]);
      });

      it("is none without the lookup of the vendor risk database", async () => {
        const result = await withRecords(setup(), async () => [kev(1)]);

        expect(result.vrdb).toBeNull();
      });
    });

    it("puts them in the ledger under security incidents, before the results of the searches", async () => {
      const environment = setup({ answers: { "Acme data breach": [NEWS_BREACH] } });
      const lookup = jest.fn(async () => [kev(2)]);

      const result = await withRecords(environment, lookup);

      const ledger = environment.session.snapshot().ledger;
      expect(ledger.slice(0, 3).map((entry) => [entry.url, entry.kind, entry.category])).toEqual([
        ["https://nvd.example/CVE-2031-0000", "page", "security_incidents"],
        ["https://nvd.example/CVE-2031-0001", "page", "security_incidents"],
        ["https://news.example/acme-breach", "result", "security_incidents"],
      ]);
      expect(result.records).toEqual([kev(2)]);
    });

    it("puts the records of the status page in the ledger under availability, and the others under security incidents", async () => {
      const environment = setup();

      await withRecords(environment, async () => [kev(1), statuspage(2)]);

      expect(
        environment.session
          .snapshot()
          .ledger.map((entry) => [entry.url, entry.kind, entry.category, entry.onVendorSite]),
      ).toEqual([
        ["https://nvd.example/CVE-2031-0000", "page", "security_incidents", false],
        ["https://status.acme.com/incidents/abc0", "page", "availability", false],
        ["https://status.acme.com/incidents/abc1", "page", "availability", false],
      ]);
    });

    it("puts each record into the ledger with the id of its database", async () => {
      const environment = setup();

      await withRecords(environment, async () => [kev(1), statuspage(1)]);

      expect(
        environment.session.snapshot().ledger.map((entry) => [entry.url, entry.record]),
      ).toEqual([
        ["https://nvd.example/CVE-2031-0000", "kev"],
        ["https://status.acme.com/incidents/abc0", "statuspage"],
      ]);
    });

    it("applies the cutoff of the category of each database to its records", async () => {
      const environment = setup();
      const old = statuspage(1);
      old.records[0].publishedAt = "2030-04-19";
      const recent = statuspage(1);
      recent.records[0] = { ...recent.records[0], url: "https://status.acme.com/incidents/new" };
      recent.records[0].publishedAt = "2030-04-20";

      await withRecords(environment, async () => [old, recent]);

      // The cutoff of availability is 2030-04-20: the older record is left out.
      expect(environment.session.snapshot().ledger.map((entry) => entry.url)).toEqual([
        "https://status.acme.com/incidents/new",
      ]);
    });

    it("gives the lookup the vendor, the categories that are researched with their cutoffs, the day and the signal of the run, and no page reader", async () => {
      const environment = setup();
      const lookup = jest.fn(async () => []);
      const signal = new AbortController().signal;

      await withRecords(environment, lookup, { signal });

      expect(lookup).toHaveBeenCalledTimes(1);
      // The lookup reads no document that a record points to any more (the filings of the SEC are
      // read through the vendor risk database), so it is given no reader.
      expect(lookup).toHaveBeenCalledWith({
        target,
        researchable: ALL,
        cutoffs: NOW_CUTOFFS,
        now: NOW,
        signal,
      });
    });

    it("tells the lookup which categories are researched, so that it asks the databases of those", async () => {
      const environment = setup({ domain: null });
      const lookup = jest.fn(async () => []);

      await withRecords(environment, lookup, {
        target: NO_WEBSITE_TARGET,
        researchable: NEWS_ONLY,
        website: { status: "no_website" },
      });

      expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ researchable: NEWS_ONLY }));
    });

    it("starts the lookup before it reads the sitemap, so that the two wait together", async () => {
      const order: string[] = [];
      const environment = setup();
      environment.readPage.mockImplementation(async (url: string) => {
        order.push(`read ${url}`);
        throw new PageReadError("not_found");
      });

      await withRecords(environment, async () => {
        order.push("lookup");
        return [];
      });

      expect(order[0]).toBe("lookup");
      expect(order[1]).toBe("read https://www.acme.com/sitemap.xml");
    });

    it("costs nothing of the budget of the model or of the code, and makes no search or read of its own", async () => {
      const environment = setup();
      const before = environment.session.budget();

      await withRecords(environment, async () => [kev(3)]);

      expect(environment.session.budget()).toEqual(before);
      expect(environment.asked.map((entry) => entry.query)).toEqual([
        "Acme data breach",
        "Acme security incident",
        "Acme lawsuit",
        "Acme fined",
        "Acme FTC",
        "Acme settlement",
        "Acme outage",
      ]);
    });

    it("costs nothing for the records of the status page either, and reads none of them", async () => {
      const environment = setup();
      const before = environment.session.budget();

      const result = await withRecords(environment, async () => [statuspage(3)]);

      expect(environment.session.budget()).toEqual(before);
      expect(environment.session.snapshot().searchesUsed).toBe(7);
      expect(result.actions.map((action) => action.url)).not.toContain(
        "https://status.acme.com/incidents/abc0",
      );
      expect(environment.readPage).not.toHaveBeenCalledWith(
        "https://status.acme.com/incidents/abc0",
        expect.anything(),
      );
    });

    it("does not look up without a lookup", async () => {
      const environment = setup();
      const noLookup = await gatherSources(
        {
          target,
          researchable: ALL,
          website: readable(),
          signal: new AbortController().signal,
        },
        { session: setup().session, readPage: environment.readPage },
      );

      expect(noLookup.records).toEqual([]);
    });

    it("is a briefing with the databases and the records, and has the sources marked", async () => {
      const environment = setup();

      const result = await withRecords(environment, async () => [kev(1)]);

      expect(result.digest).toContain("- CISA Known Exploited Vulnerabilities catalog: 1 record");
      expect(result.digest).toContain(
        "- CVE-2031-0000: Acme flaw - https://nvd.example/CVE-2031-0000 - 2031-04-01 (record)",
      );
    });

    it("is a briefing with the status page and its records, under availability", async () => {
      const environment = setup();

      const result = await withRecords(environment, async () => [statuspage(1)]);

      expect(result.digest).toContain(
        "- Status page of the vendor (the incident history it publishes): 1 record",
      );
      expect(result.digest).toContain(
        "- Status page of Acme: outage 0 - https://status.acme.com/incidents/abc0 - 2031-04-10 (record)",
      );
    });

    it("goes on when a database could not be reached: that is an answer", async () => {
      const environment = setup({ answers: { "Acme data breach": [NEWS_BREACH] } });
      const failed: RecordsOutcome = {
        source: "hibp",
        url: "https://db.example/hibp",
        outcome: "failed",
        reason: "unreachable",
        records: [],
        omitted: {},
        ms: 12_000,
      };

      const result = await withRecords(environment, async () => [failed]);

      expect(result.records).toEqual([failed]);
      expect(environment.session.snapshot().ledger.map((entry) => entry.kind)).toEqual(["result"]);
      expect(result.digest).toContain("the database could not be reached");
    });
  });

  it("makes the news searches, then reads the site's pages, and says what it did in order", async () => {
    const environment = setup({
      answers: { "Acme data breach": [NEWS_BREACH] },
      pages: {
        "https://www.acme.com/security": { title: "Security at Acme" },
        "https://www.acme.com/privacy": { title: "Privacy at Acme" },
      },
    });

    const result = await run(environment);

    expect(environment.asked.map((entry) => entry.query)).toEqual([
      "Acme data breach",
      "Acme security incident",
      "Acme lawsuit",
      "Acme fined",
      "Acme FTC",
      "Acme settlement",
      "Acme outage",
    ]);
    expect(environment.asked.every((entry) => entry.kind === "news")).toBe(true);
    expect(
      result.actions.slice(0, 7).map((action) => [action.tool, action.category, action.outcome]),
    ).toEqual([
      ["search", "security_incidents", "ok"],
      ["search", "security_incidents", "empty"],
      ["search", "legal_regulatory", "empty"],
      ["search", "legal_regulatory", "empty"],
      ["search", "legal_regulatory", "empty"],
      ["search", "legal_regulatory", "empty"],
      ["search", "availability", "empty"],
    ]);
    const reads = result.actions.filter((action) => action.tool === "read");
    expect(
      reads.slice(0, 2).map((action) => [action.url, action.category, action.outcome]),
    ).toEqual([
      ["https://www.acme.com/security", "certifications", "ok"],
      ["https://www.acme.com/trust", "certifications", "failed"],
    ]);
    const ledger = environment.session.snapshot().ledger;
    expect(ledger.map((entry) => [entry.kind, entry.url])).toEqual(
      expect.arrayContaining([
        ["result", NEWS_BREACH.url],
        ["page", "https://www.acme.com/security"],
        ["page", "https://www.acme.com/privacy"],
      ]),
    );
  });

  it("pays for its own work, so that the model keeps its share of the budgets", async () => {
    const environment = setup({ answers: { "Acme data breach": [NEWS_BREACH] } });

    await run(environment);

    expect(environment.session.snapshot().searchesUsed).toBe(7);
    expect(environment.session.budget()).toEqual({
      searchesLeft: SESSION_LIMITS.maxSearches,
      readsLeft: SESSION_LIMITS.maxReads,
    });
  });

  it("reads the sitemap outside the session: no budget, no ledger entry, no page counted", async () => {
    const environment = setup({
      pages: {
        "https://www.acme.com/sitemap.xml": {
          text: "<urlset><url><loc>https://www.acme.com/trust</loc></url><url><loc>https://www.acme.com/subprocessors</loc></url></urlset>",
        },
        "https://www.acme.com/trust": {},
        "https://www.acme.com/subprocessors": {},
      },
    });

    const result = await run(environment, { website: readable({ links: [] }) });

    expect(result.sitemap).toMatchObject({
      url: "https://www.acme.com/sitemap.xml",
      outcome: "ok",
      urls: 2,
    });
    const urls = environment.session.snapshot().ledger.map((entry) => entry.url);
    expect(urls).toEqual(["https://www.acme.com/trust", "https://www.acme.com/subprocessors"]);
    expect(urls).not.toContain("https://www.acme.com/sitemap.xml");
    expect(environment.session.snapshot().pagesRead).toBe(2);
  });

  it("goes on without a sitemap, and says why it has none", async () => {
    const environment = setup();

    const result = await run(environment);

    expect(result.sitemap).toMatchObject({ outcome: "failed", reason: "not_found", urls: 0 });
    expect(result.actions.some((action) => action.tool === "read")).toBe(true);
  });

  it("does not read the site when it is closed, but still searches", async () => {
    const environment = setup();

    const result = await run(environment, { website: { status: "closed", reason: "unreachable" } });

    expect(result.actions.every((action) => action.tool === "search")).toBe(true);
    expect(result.sitemap).toBeNull();
    expect(environment.readPage).not.toHaveBeenCalled();
  });

  it.each([
    ["a home page that does not name the vendor", readable({ namesVendor: false })],
    [
      "a home page that redirected off the vendor's site",
      readable({ redirectedTo: "social.example" }),
    ],
  ])("does not read the site for %s", async (_label, website) => {
    const environment = setup();

    const result = await run(environment, { website });

    expect(result.actions.every((action) => action.tool === "search")).toBe(true);
    expect(environment.readPage).not.toHaveBeenCalled();
  });

  it("reads the site that the vendor's domain moved to", async () => {
    const environment = setup({
      pages: { "https://www.acme-analytics.com/security": { title: "Security" } },
      aliasDomains: ["acme-analytics.com"],
    });

    const result = await run(environment, {
      website: readable({
        url: "https://www.acme-analytics.com/",
        redirectedTo: "www.acme-analytics.com",
        alias: "acme-analytics.com",
        links: [{ text: "Security", url: "https://www.acme-analytics.com/security" }],
      }),
    });

    expect(
      result.actions.find((action) => action.url === "https://www.acme-analytics.com/security"),
    ).toMatchObject({
      outcome: "ok",
    });
  });

  it("reads the site of a home page that is built by a script, and of a check that broke", async () => {
    for (const website of [
      { status: "unreadable", reason: "needs_javascript" } as const,
      { status: "unchecked" } as const,
    ]) {
      const environment = setup();

      const result = await run(environment, { website });

      expect(result.actions.some((action) => action.tool === "read")).toBe(true);
      expect(environment.readPage).toHaveBeenCalledWith(
        "https://acme.com/sitemap.xml",
        expect.anything(),
      );
    }
  });

  it("makes the searches only, for a vendor without a domain", async () => {
    const environment = setup({ domain: null });

    const result = await run(environment, {
      target: NO_WEBSITE_TARGET,
      researchable: NEWS_ONLY,
      website: { status: "no_website" },
    });

    expect(result.actions).toHaveLength(7);
    expect(result.actions.every((action) => action.tool === "search")).toBe(true);
    expect(environment.readPage).not.toHaveBeenCalled();
  });

  it("takes a search that fails and a page that cannot be read for results, not for errors", async () => {
    const environment = setup({
      answers: {
        "Acme data breach": new (jest.requireActual(
          "../../webResearch/webSearch",
        ).SearchEngineError)(),
      },
      pages: { "https://www.acme.com/security": new PageReadError("blocked_by_site") },
    });

    const result = await run(environment);

    expect(result.actions[0]).toMatchObject({
      tool: "search",
      outcome: "failed",
      reason: "search_unavailable",
    });
    expect(
      result.actions.find((action) => action.url === "https://www.acme.com/security"),
    ).toMatchObject({
      tool: "read",
      outcome: "failed",
      reason: "blocked_by_site",
    });
  });

  it("gives the loop a digest of what it collected", async () => {
    const environment = setup({ answers: { "Acme data breach": [NEWS_BREACH] } });

    const result = await run(environment);

    expect(result.digest).toContain("Acme data breach - 1 result");
    expect(result.digest).toContain(NEWS_BREACH.url);
  });

  it("searches for the hints it is given with the others, as the code, and lists them in the digest", async () => {
    const environment = setup({
      answers: {
        "Acme ransomware": [
          { ...NEWS_BREACH, url: "https://news.example/acme-ransomware", title: "Acme ransomware" },
        ],
      },
    });

    const result = await run(environment, {
      hints: [{ category: "security_incidents", query: "Acme ransomware" }],
    });

    expect(environment.asked.map((entry) => entry.query)).toEqual([
      "Acme data breach",
      "Acme security incident",
      "Acme lawsuit",
      "Acme fined",
      "Acme FTC",
      "Acme settlement",
      "Acme outage",
      "Acme ransomware",
    ]);
    expect(environment.session.snapshot().searchesUsed).toBe(8);
    expect(environment.session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches);
    expect(result.actions[7]).toMatchObject({
      tool: "search",
      category: "security_incidents",
      query: "Acme ransomware",
      outcome: "ok",
    });
    expect(result.digest).toContain("- security_incidents: Acme ransomware - 1 result");
  });

  describe("the articles of the search results", () => {
    const ARTICLE_TEXT = `${"A long introduction that says nothing of the vendor. ".repeat(250)}\n\nAcme confirmed on Monday that attackers reached customer data.`;

    it("reads the best results with the pages of the site, for the code, and puts the articles last", async () => {
      const environment = setup({
        answers: { "Acme data breach": [NEWS_BREACH] },
        pages: {
          [NEWS_BREACH.url]: { text: "The full report of the breach." },
          "https://www.acme.com/security": {},
          "https://www.acme.com/privacy": {},
        },
      });

      const result = await run(environment);

      const reads = result.actions.filter((action) => action.tool === "read");
      expect(reads[reads.length - 1]).toMatchObject({
        url: NEWS_BREACH.url,
        category: "security_incidents",
        outcome: "ok",
      });
      const ledger = environment.session.snapshot().ledger;
      // The page replaces the snippet and keeps the title of the result.
      expect(ledger.find((entry) => entry.url === NEWS_BREACH.url)).toMatchObject({
        kind: "page",
        title: NEWS_BREACH.title,
        content: "The full report of the breach.",
      });
    });

    it("reads the article around the name of the vendor", async () => {
      const environment = setup({
        answers: { "Acme data breach": [NEWS_BREACH] },
        pages: { [NEWS_BREACH.url]: { text: ARTICLE_TEXT } },
      });

      await run(environment);

      const entry = environment.session.snapshot().ledger.find((e) => e.url === NEWS_BREACH.url);
      expect(entry?.content).toContain("Acme confirmed on Monday");
    });

    it("reads an article that is about the vendor under another name around that name", async () => {
      const known = { ...target, aliases: ["Initech"] };
      const article = {
        ...NEWS_BREACH,
        title: "Initech data breach exposes customers",
        url: "https://news.example/initech-breach",
        snippet: "Initech said attackers reached customer data last week.",
      };
      const text = `${"A long introduction that says nothing of the vendor. ".repeat(250)}\n\nInitech confirmed on Monday that attackers reached customer data.`;
      const environment = setup({
        vendor: known,
        answers: { "Initech data breach": [article] },
        pages: { [article.url]: { text } },
      });

      await run(environment, { target: known });

      const entry = environment.session.snapshot().ledger.find((e) => e.url === article.url);
      expect(entry).toMatchObject({ kind: "page" });
      expect(entry?.content).toContain("Initech confirmed on Monday");
    });

    it("makes the searches in the language of the vendor's market, and says the language of each", async () => {
      const german = buildTarget({
        vendor_name: "Brise GmbH",
        website: "brise.de",
        vendor_provides: "Cloud hosting",
      });
      const article = {
        ...NEWS_BREACH,
        title: "Brise: Datenleck bei dem Cloud-Anbieter",
        url: "https://news.example/brise-datenleck",
        snippet: "Bei Brise ist ein Datenleck aufgetreten.",
      };
      const environment = setup({
        vendor: german,
        domain: "brise.de",
        answers: { "Brise Datenleck": [article] },
      });

      const result = await run(environment, { target: german, researchable: NEWS_ONLY });

      expect(environment.asked.map((search) => search.query)).toEqual([
        "Brise data breach",
        "Brise security incident",
        "Brise Datenleck",
        "Brise Cyberangriff",
        "Brise lawsuit",
        "Brise fined",
        "Brise Datenschutz Bußgeld",
        "Brise Klage",
        "Brise outage",
      ]);
      expect(
        result.actions
          .filter((action) => action.tool === "search")
          .map((action) => [action.query, action.language]),
      ).toEqual([
        ["Brise data breach", undefined],
        ["Brise security incident", undefined],
        ["Brise Datenleck", "German"],
        ["Brise Cyberangriff", "German"],
        ["Brise lawsuit", undefined],
        ["Brise fined", undefined],
        ["Brise Datenschutz Bußgeld", "German"],
        ["Brise Klage", "German"],
        // The outage news is asked in English for every market.
        ["Brise outage", undefined],
      ]);
      expect(result.digest).toContain("- security_incidents: Brise Datenleck (German) - 1 result");
      // The code pays for them: the model keeps its own share.
      expect(environment.session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches);
    });

    it("reads an article around the names of the vendor without their legal forms", async () => {
      const known = { ...target, name: "Acme Analytics, Inc.", aliases: ["Initech Ltd"] };
      const article = {
        ...NEWS_BREACH,
        title: "Acme Analytics data breach exposes customers",
        url: "https://news.example/acme-analytics-breach",
        snippet: "Acme Analytics said attackers reached customer data last week.",
      };
      // "inc" is in "incident" and "since": a focus with the legal form in it would prefer the
      // first paragraph, which has the brand and the legal form but not the name of the vendor.
      const decoy = `Acme was named in the report. ${"The incident since then. ".repeat(250)}`;
      const named = `${"Details that say nothing of the vendor. ".repeat(160)}Acme Analytics confirmed on Monday that attackers reached customer data.`;
      const text = ["Introduction. ".repeat(100), decoy, named].join("\n\n");
      const environment = setup({
        vendor: known,
        answers: { "Acme Analytics data breach": [article] },
        pages: { [article.url]: { text } },
      });

      await run(environment, { target: known });

      const entry = environment.session.snapshot().ledger.find((e) => e.url === article.url);
      expect(entry?.content).toContain("Acme Analytics confirmed on Monday");
    });

    it("puts the name of the vendor before its other names, where the focus has room for eight words", async () => {
      const known = {
        ...target,
        name: "Acme Analytics",
        aliases: ["Alpha Beta Gamma Delta Epsilon Zeta Eta Theta"],
      };
      const article = {
        ...NEWS_BREACH,
        title: "Acme Analytics data breach exposes customers",
        url: "https://news.example/acme-analytics-breach",
        snippet: "Acme Analytics said attackers reached customer data last week.",
      };
      const text = [
        "Introduction. ".repeat(100),
        "Unrelated filler paragraph. ".repeat(400),
        "Acme Analytics confirmed on Monday that attackers reached customer data.",
      ].join("\n\n");
      const environment = setup({
        vendor: known,
        answers: { "Acme Analytics data breach": [article] },
        pages: { [article.url]: { text } },
      });

      await run(environment, { target: known });

      const entry = environment.session.snapshot().ledger.find((e) => e.url === article.url);
      expect(entry?.content).toContain("Acme Analytics confirmed on Monday");
    });

    it("pays for the reads apart from the model's, so that its share is as it was", async () => {
      const environment = setup({
        answers: { "Acme data breach": [NEWS_BREACH] },
        pages: { [NEWS_BREACH.url]: {} },
      });

      await run(environment);

      expect(environment.session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("keeps the snippet and says why when the article cannot be read", async () => {
      const environment = setup({
        answers: { "Acme data breach": [NEWS_BREACH] },
        pages: { [NEWS_BREACH.url]: new PageReadError("blocked_by_site") },
      });

      const result = await run(environment);

      expect(result.actions.find((action) => action.url === NEWS_BREACH.url)).toMatchObject({
        outcome: "failed",
        reason: "blocked_by_site",
      });
      expect(
        environment.session.snapshot().ledger.find((entry) => entry.url === NEWS_BREACH.url),
      ).toMatchObject({ kind: "result" });
    });

    it("reads no article when the searches found none, and none for a site-only category", async () => {
      const environment = setup();

      const result = await run(environment, { researchable: ["certifications", "ai_specific"] });

      expect(result.actions.filter((action) => action.category === "security_incidents")).toEqual(
        [],
      );
      expect(environment.readPage).not.toHaveBeenCalledWith(NEWS_BREACH.url, expect.anything());
    });
  });

  it("has a time limit of 30 seconds", () => {
    expect(GATHER_TIMEOUT_MS).toBe(30_000);
  });

  it("passes its signal on to the searches and the reads", async () => {
    const environment = setup({ pages: { "https://www.acme.com/security": {} } });
    const controller = new AbortController();

    await run(environment, { signal: controller.signal });

    expect(environment.search).toHaveBeenCalledWith(expect.any(String), "news", controller.signal);
    expect(environment.readPage).toHaveBeenCalledWith(
      "https://www.acme.com/security",
      controller.signal,
    );
  });
});
