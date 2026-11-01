/**
 * The classifier of the source registry (spec D3.2): the category of a cited source, from the
 * vendor's own site, the registry's entries and their rules, with no model.
 */
import type { ResearchTarget } from "../../target";
import {
  type ClassifiableSource,
  classifyRecord,
  classifySource,
  emailOnDomain,
  isStatementPage,
  isStoredCikFiling,
  recordMatchOf,
} from "../classify";
import { REGISTRY, STATEMENT_SECTIONS } from "../entries";

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
    ["https://x.mil/x", "us-mil"],
    ["https://www.gov.uk/x", "uk-gov"],
    ["https://x.gov.uk/x", "uk-gov"],
    ["https://who.int/x", "int"],
    ["https://ec.europa.eu/x", "europa"],
    ["https://x.gov.sg/x", "gov-sld-q8"],
    ["https://x.gc.ca/x", "gov-de-facto-q8"],
    ["https://x.bund.de/x", "gov-held"],
    ["https://x.gov.co/x", "gov-co"],
    ["https://ico.org.uk/x", "ico"],
  ])("classifies %s as official, entry %s", (url, entry) => {
    expect(at(url)).toMatchObject({ category: "official", entry, reviewed: true });
  });

  describe("the government domains of Q8 (sr-5)", () => {
    // Every host of the entries that Q8 added or changed: the entry that takes it, and the status
    // of the evidence that entry rests on (V: the rule was read; P: the holder or the operator's
    // pages were read, but no rule that limits the names to a government).
    it.each([
      ["mil", "us-mil", "V"],
      ["gov.br", "gov-sld-q8", "V"],
      ["go.id", "gov-sld-q8", "V"],
      ["go.th", "gov-sld-q8", "V"],
      ["go.tz", "gov-sld-q8", "V"],
      ["gov.sg", "gov-sld-q8", "V"],
      ["gov.my", "gov-sld-q8", "V"],
      ["gov.pk", "gov-sld-q8", "V"],
      ["gob.pk", "gov-sld-q8", "V"],
      ["gov.lk", "gov-sld-q8", "V"],
      ["gov.za", "gov-sld-q8", "V"],
      ["gov.pl", "gov-sld-q8", "V"],
      ["gov.hk", "gov-sld-q8", "V"],
      ["gob.gt", "gov-sld-q8", "V"],
      ["gc.ca", "gov-de-facto-q8", "V"],
      ["gov.de", "gov-de-facto-q8", "V"],
      ["bund.de", "gov-held", "P"],
      ["gov.fi", "gov-held", "P"],
      ["gov.co", "gov-co", "P"],
    ])(
      "takes a page on x.%s for official, entry %s, evidence of status %s",
      (host, entry, status) => {
        expect(at(`https://x.${host}/x`)).toMatchObject({
          category: "official",
          entry,
          reviewed: true,
        });
        expect(REGISTRY.find((candidate) => candidate.id === entry)?.status).toBe(status);
      },
    );

    it.each([
      // Dropped, since no page that states who may hold the name could be read.
      "https://x.govt.nz/x",
      "https://x.go.ke/x",
      "https://x.go.ug/x",
      "https://x.gov.ug/x",
      "https://x.gov.ie/x",
      // Registry suffixes of a government whose rule was not read: the old pattern made them
      // official.
      "https://x.gob.ar/x",
      "https://x.gov.cn/x",
      // Ordinary registrations that the old pattern took for a government's: a label such as gob
      // or gv in front of a country code is no proof (gob.de is a software company's).
      "https://gob.de/x",
      "https://www.gob.de/x",
      "https://x.gob.de/x",
      "https://gouv.it/x",
      "https://gv.uy/x",
      "https://gob.nl/x",
    ])("takes %s for a host that no one reviewed", (url) => {
      expect(at(url)).toMatchObject({ category: "unverified", entry: null, reviewed: false });
    });

    it("takes a government label before a country code for a government's only for the 20 pairs the registry reviewed", () => {
      const letters = "abcdefghijklmnopqrstuvwxyz";
      const official: string[] = [];
      for (const label of ["gov", "govt", "gouv", "gob", "gv"]) {
        for (const first of letters) {
          for (const second of letters) {
            const pair = `${label}.${first}${second}`;
            if (at(`https://x.${pair}/x`).category === "official") official.push(pair);
          }
        }
      }
      // The old pattern took all 3,380 of them. These are the pairs of the entries of Q8 and the
      // pairs that the older entries (gov-sld, gov-de-facto, uk-gov, fr-gouv) name.
      expect(official.sort()).toEqual([
        "gob.es",
        "gob.gt",
        "gob.mx",
        "gob.pk",
        "gouv.fr",
        "gov.au",
        "gov.br",
        "gov.co",
        "gov.de",
        "gov.fi",
        "gov.hk",
        "gov.in",
        "gov.lk",
        "gov.my",
        "gov.pk",
        "gov.pl",
        "gov.sg",
        "gov.uk",
        "gov.za",
        "gv.at",
      ]);
    });
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

  describe("the trusted press of Q9 (sr-5)", () => {
    it.each([
      // The Guardian's opinion section.
      ["https://www.theguardian.com/commentisfree/2026/oct/01/the-case-for-acme", "theguardian"],
      // CNBC's paid posts and its guest posts.
      [
        "https://www.cnbc.com/advertorial/2022/02/17/understanding-the-value-of-branded-content.html",
        "cnbc",
      ],
      [
        "https://www.cnbc.com/guest-blog/2026/09/01/acme-analytics-and-data-protection.html",
        "cnbc",
      ],
      // Forbes: Councils, Advisor and Vetted are partner content, beside the contributors' /sites/.
      [
        "https://www.forbes.com/councils/forbestechcouncil/2026/09/01/acme-analytics-and-data-protection/",
        "forbes",
      ],
      ["https://www.forbes.com/advisor/business/software/best-analytics-software/", "forbes"],
      ["https://www.forbes.com/vetted/best-laptops/", "forbes"],
      ["https://www.bloomberg.com/sponsor/acme-analytics/the-future-of-analytics", "bloomberg"],
      ["https://www.bloomberg.com/sponsors/acme-analytics", "bloomberg"],
      [
        "https://www.washingtonpost.com/creativegroup/acme-analytics/the-future-of-analytics/",
        "washingtonpost",
      ],
      ["https://www.scworld.com/perspective/acme-analytics-and-data-protection", "scworld"],
    ])("downgrades %s, a part of the %s entry that is not its own reporting", (url, entry) => {
      expect(at(url)).toMatchObject({
        category: "unverified",
        entry,
        reviewed: true,
        downgraded: true,
      });
    });

    it.each([
      [
        "https://www.theguardian.com/technology/2025/nov/18/cloudflare-outage-causes-error-messages-across-the-internet",
        "theguardian",
      ],
      ["https://www.cnbc.com/2026/10/01/acme-analytics-breach.html", "cnbc"],
      ["https://www.cnbc.com/corrections/", "cnbc"],
      [
        "https://www.forbes.com/sites/forbesstaff/article/forbes-editorial-values-and-standards/",
        "forbes",
      ],
      // A slug that starts with a downgraded segment is not the segment.
      [
        "https://www.bloomberg.com/news/articles/2026-10-01/sponsorship-deal-for-acme-analytics",
        "bloomberg",
      ],
      [
        "https://www.washingtonpost.com/technology/2026/10/01/acme-analytics-breach/",
        "washingtonpost",
      ],
      ["https://www.scworld.com/news/acme-analytics-breach", "scworld"],
      ["https://www.bbc.co.uk/news/articles/c629pny4gl7o", "bbc"],
      ["https://www.usatoday.com/story/tech/2026/10/01/acme-analytics-breach/1/", "usatoday"],
      ["https://www.smh.com.au/technology/acme-analytics-breach-20261001-p5xyz.html", "smh"],
      ["https://www.cbc.ca/news/business/acme-analytics-breach-1.1", "cbc"],
      [
        "https://www.darkreading.com/cyberattacks-data-breaches/acme-analytics-breach",
        "darkreading",
      ],
    ])("does not downgrade %s, a page of the %s entry that is its own reporting", (url, entry) => {
      const found = at(url);
      expect(found).toMatchObject({ category: "trusted_press", entry, reviewed: true });
      expect(found.downgraded).toBeUndefined();
    });

    it("takes a thehackernews.com page for unverified, with no rule left to lower it", () => {
      for (const url of [
        "https://thehackernews.com/2026/10/acme-analytics-breach.html",
        "https://thehackernews.com/expert-insights/2026/10/acme-analytics-and-data-protection.html",
      ]) {
        const found = at(url);
        expect(found).toMatchObject({
          category: "unverified",
          entry: "thehackernews",
          reviewed: true,
        });
        expect(found.downgraded).toBeUndefined();
      }
    });

    it("keeps a cnn.com, an npr.org and a cnet.com page as trusted press, as the ruling of 2026-10-31 leaves them", () => {
      expect(
        at("https://www.cnn.com/2026/10/01/tech/acme-analytics-breach/index.html"),
      ).toMatchObject({ category: "trusted_press", entry: "cnn", reviewed: true });
      expect(at("https://www.npr.org/2026/10/01/acme-analytics-breach")).toMatchObject({
        category: "trusted_press",
        entry: "npr",
        reviewed: true,
      });
      expect(
        at("https://www.cnet.com/tech/services-and-software/acme-analytics-breach/"),
      ).toMatchObject({ category: "trusted_press", entry: "cnet", reviewed: true });
    });

    it("names the publisher of the entries that give a name, the two hosts of the BBC alike", () => {
      const nameOf = (url: string) => at(url).publisherName;
      expect(nameOf("https://www.bbc.co.uk/news/x")).toBe("BBC");
      expect(nameOf("https://www.bbc.com/news/x")).toBe("BBC");
      expect(nameOf("https://www.theguardian.com/technology/x")).toBe("The Guardian");
      expect(nameOf("https://www.usatoday.com/story/x")).toBe("USA TODAY");
      expect(nameOf("https://www.cnbc.com/2026/10/01/x.html")).toBe("CNBC");
    });
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

  describe("an EDGAR filing under the vendor's stored CIK (Q26, Q28)", () => {
    const filer: ResearchTarget = { ...TARGET, identifiers: { secCik: "0000320193" } };
    const UNDER_STORED_CIK = [
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/ix?doc=/Archives/edgar/data/320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/ixviewer/ix.html?doc=/Archives/edgar/data/0000320193/000032019326000001/form8-k.htm",
      "https://www.sec.gov/cgi-bin/viewer?action=view&cik=320193&accession_number=0000320193-26-000001",
    ];
    const UNDER_ANOTHER_CIK = [
      "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/form8-k.htm",
      "https://www.sec.gov/ix?doc=/Archives/edgar/data/3201930/000123456726000001/form8-k.htm",
      "https://www.sec.gov/cgi-bin/viewer?action=view&cik=1234567&accession_number=0001234567-26-000001",
    ];

    it.each(UNDER_STORED_CIK)(
      "is the vendor's word when its header says the vendor filed it: %s",
      (url) => {
        expect(of(url, { edgarFiler: "vendor" }, filer)).toMatchObject({
          category: "vendor",
          publisher: "vendor",
          entry: "sec",
        });
      },
    );

    it.each(UNDER_STORED_CIK)(
      "is unverified and downgraded when its header says somebody else filed it: %s",
      (url) => {
        expect(of(url, { edgarFiler: "other" }, filer)).toMatchObject({
          category: "unverified",
          downgraded: true,
          entry: "sec",
        });
      },
    );

    it.each(UNDER_STORED_CIK)(
      "is unverified and downgraded when nobody knows who filed it: %s",
      (url) => {
        const found = of(url, {}, filer);

        expect(found).toMatchObject({ category: "unverified", downgraded: true, entry: "sec" });
        expect(found).not.toHaveProperty("userContent");
        expect(of(url, { edgarFiler: undefined }, filer)).toEqual(found);
      },
    );

    it.each(UNDER_ANOTHER_CIK)(
      "stays unverified under another CIK, whoever the header names: %s",
      (url) => {
        for (const edgarFiler of [undefined, "other", "vendor"] as const) {
          expect(of(url, { edgarFiler }, filer)).toMatchObject({
            category: "unverified",
            downgraded: true,
            entry: "sec",
          });
        }
      },
    );

    it("is the filer's document as before for a vendor with no stored CIK, whoever the header names", () => {
      const url = UNDER_STORED_CIK[0];
      const unstored: ResearchTarget = { ...TARGET, identifiers: { secCik: "CIK 12" } };

      for (const target of [TARGET, unstored]) {
        for (const edgarFiler of [undefined, "other", "vendor"] as const) {
          expect(of(url, { edgarFiler }, target)).toMatchObject({
            category: "unverified",
            downgraded: true,
            entry: "sec",
          });
        }
      }
    });

    it("takes a stored CIK of digits only: a text that merely reads as a number is none", () => {
      const url = UNDER_STORED_CIK[0];

      for (const secCik of ["+320193", "320193.0", "320193e0", "3.20193e5", "0x4e2c1"]) {
        const target: ResearchTarget = { ...TARGET, identifiers: { secCik } };

        expect(of(url, { edgarFiler: "vendor" }, target)).toMatchObject({
          category: "unverified",
          downgraded: true,
        });
        expect(isStoredCikFiling(url, target)).toBe(false);
      }
    });

    it("makes no page of the SEC the vendor's that is not a filing, whoever the header names", () => {
      expect(
        of("https://www.sec.gov/newsroom/press-releases/2026-1", { edgarFiler: "vendor" }, filer),
      ).toMatchObject({ category: "official", entry: "sec" });
      expect(
        of(
          "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193",
          { edgarFiler: "vendor" },
          filer,
        ),
      ).toMatchObject({ category: "official", entry: "sec" });
    });

    it("lets the answer change nothing for a viewer address that names no readable filing of the stored CIK", () => {
      for (const url of [
        "https://www.sec.gov/cgi-bin/viewer?action=view&accession_number=0000320193-26-000001",
        "https://www.sec.gov/cgi-bin/viewer?action=view&cik=abc&accession_number=0000320193-26-000001",
        "https://www.sec.gov/cgi-bin/viewer?action=view&cik=00032019300&accession_number=0000320193-26-000001",
        "https://www.sec.gov/ix",
        "https://www.sec.gov/ix?doc=/news/press-release.htm",
      ]) {
        const asked = of(url, { edgarFiler: "vendor" }, filer);

        expect(asked).toEqual(of(url, {}, filer));
        expect(asked.category).not.toBe("vendor");
        expect(isStoredCikFiling(url, filer)).toBe(false);
      }
    });

    it("lets the answer count on the SEC's pages only: another host stays what the registry says", () => {
      expect(
        of(
          "https://www.example.com/Archives/edgar/data/320193/000032019326000001/f.htm",
          { edgarFiler: "vendor" },
          filer,
        ),
      ).toMatchObject({ category: "unverified", entry: null, reviewed: false });
    });

    it("keeps the class of a record of the SEC, which is its database's whoever filed", () => {
      expect(classifyRecord("sec")).toEqual({
        category: "official",
        publisher: "sec",
        entry: null,
        reviewed: true,
      });
      expect(recordMatchOf("sec", filer)).toBe("strong");
    });

    describe("isStoredCikFiling", () => {
      it.each(UNDER_STORED_CIK)("is true for %s", (url) => {
        expect(isStoredCikFiling(url, filer)).toBe(true);
      });

      it.each([...UNDER_ANOTHER_CIK, "https://www.sec.gov/newsroom/press-releases/2026-1"])(
        "is false for %s",
        (url) => {
          expect(isStoredCikFiling(url, filer)).toBe(false);
        },
      );

      it("is false for a vendor with no stored CIK, a host that is not the SEC's and an address that cannot be read", () => {
        expect(isStoredCikFiling(UNDER_STORED_CIK[0], TARGET)).toBe(false);
        expect(
          isStoredCikFiling(UNDER_STORED_CIK[0], { ...TARGET, identifiers: { secCik: "CIK 12" } }),
        ).toBe(false);
        expect(
          isStoredCikFiling(
            "https://www.example.com/Archives/edgar/data/320193/000032019326000001/f.htm",
            filer,
          ),
        ).toBe(false);
        expect(
          isStoredCikFiling(
            "https://www.sec.gov.example/Archives/edgar/data/320193/000032019326000001/f.htm",
            filer,
          ),
        ).toBe(false);
        expect(isStoredCikFiling("not a url", filer)).toBe(false);
        expect(isStoredCikFiling("", filer)).toBe(false);
      });

      it("reads the host as the classifier does: without www. and a trailing dot, in any case", () => {
        expect(
          isStoredCikFiling(
            "https://SEC.gov./Archives/edgar/data/320193/000032019326000001/f.htm",
            filer,
          ),
        ).toBe(true);
      });
    });
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

  // Rule V, widened in sr-5. The golden set cited statements of vendors on paths that the first
  // reading took for the vendor's own claims: a locale under /intl/, a section under /company/ and
  // its like, and the run-together names that some sites give their policies. Every section in
  // these tests is a word of STATEMENT_SECTIONS.
  describe("rule V, widened (sr-5)", () => {
    it.each([
      "https://acme-analytics.example/intl/en-us/legal",
      "https://acme-analytics.example/intl/en-gb/trust/security",
      "https://acme-analytics.example/intl/de-de/privacy/subprocessors",
      "https://acme-analytics.example/intl/pt_br/terms",
      "https://acme-analytics.example/intl/fr/policies/acceptable-use",
      "https://acme-analytics.example/INTL/EN-US/Legal/Privacy",
    ])("takes %s for a statement page, behind intl and a locale", (url) => {
      expect(isStatementPage(url)).toBe(true);
    });

    it.each([
      "https://acme-analytics.example/company/trust",
      "https://acme-analytics.example/company/legal/ai-use",
      "https://acme-analytics.example/about/security",
      "https://acme-analytics.example/about/privacy.html",
      "https://acme-analytics.example/about-us/legal",
      "https://acme-analytics.example/about-us/compliance/soc-2",
      "https://acme-analytics.example/corporate/privacypolicy",
      "https://acme-analytics.example/corporate/subprocessors",
      "https://acme-analytics.example/en/company/gdpr",
      "https://acme-analytics.example/intl/en-us/company/legal",
      "https://acme-analytics.example/Company/Trust",
      "https://acme-analytics.example/company/legal/?ref=footer#top",
    ])("takes %s for a statement page, behind company, about, about-us or corporate", (url) => {
      expect(isStatementPage(url)).toBe(true);
    });

    it.each([
      "https://acme-analytics.example/privacypolicy",
      "https://acme-analytics.example/privacypolicy/",
      "https://acme-analytics.example/privacypolicy.html",
      "https://acme-analytics.example/termsofservice",
      "https://acme-analytics.example/termsofuse",
      "https://acme-analytics.example/en-us/termsofuse",
      "https://acme-analytics.example/website-terms/",
    ])("takes %s for a statement page, by its run-together name", (url) => {
      expect(isStatementPage(url)).toBe(true);
    });

    it("takes every section of STATEMENT_SECTIONS, behind every prefix, for a statement", () => {
      const prefixes = [
        "",
        "/en-us",
        "/intl/en-us",
        "/company",
        "/about",
        "/about-us",
        "/corporate",
        "/en/company",
        "/intl/en-us/company",
      ];
      const missed = STATEMENT_SECTIONS.flatMap((section) =>
        prefixes.map((prefix) => `https://acme-analytics.example${prefix}/${section}/x`),
      ).filter((url) => !isStatementPage(url));
      expect(missed).toEqual([]);
    });

    it.each([
      // The company part of the site alone, or followed by what is no statement section.
      "https://acme-analytics.example/company",
      "https://acme-analytics.example/about",
      "https://acme-analytics.example/about-us/",
      "https://acme-analytics.example/company/leadership",
      "https://acme-analytics.example/about-us/careers",
      "https://acme-analytics.example/corporate/sustainability",
      // Only the first segment is read past, and only once: not a segment deeper, not two.
      "https://acme-analytics.example/product/company/security",
      "https://acme-analytics.example/company/about-us/legal",
      // The four words are the whole segment: a segment that only starts with one is no parent.
      "https://acme-analytics.example/company-info/legal",
      "https://acme-analytics.example/aboutus/legal",
      // intl is skipped only before a locale.
      "https://acme-analytics.example/intl",
      "https://acme-analytics.example/intl/en-us",
      "https://acme-analytics.example/intl/privacy",
      // A run-together name is a section only as the first segment.
      "https://acme-analytics.example/products/website-terms",
      // The newsroom veto holds behind the prefixes and the company part.
      "https://acme-analytics.example/about/newsroom/acme-achieves-soc-2",
      "https://acme-analytics.example/company/blog/our-soc-2-journey",
      "https://acme-analytics.example/company/security/blog/how-we-protect-your-data",
      "https://acme-analytics.example/about-us/legal/press/acme-achieves-iso-27001",
      "https://acme-analytics.example/intl/en-us/trust/news/acme-achieves-soc-2",
    ])("takes %s for no statement page", (url) => {
      expect(isStatementPage(url)).toBe(false);
    });

    it.each([
      "https://acme-analytics.example/intl/en-us/trust/reports",
      "https://acme-analytics.example/company/legal",
      "https://acme-analytics.example/about-us/security",
      "https://acme-analytics.example/corporate/privacypolicy",
      "https://acme-analytics.example/termsofuse",
      "https://acme-analytics.example/website-terms",
    ])("takes %s of the vendor's own site for its word and for a statement", (url) => {
      expect(at(url, { onVendorSite: true })).toEqual({
        category: "vendor",
        publisher: "vendor",
        entry: null,
        reviewed: true,
      });
      expect(isStatementPage(url)).toBe(true);
    });

    it.each([
      "https://acme-analytics.example/about/newsroom/acme-achieves-soc-2",
      "https://acme-analytics.example/company/blog/our-soc-2-journey",
    ])("takes %s of the vendor's own site for its word, but for no statement", (url) => {
      expect(at(url, { onVendorSite: true })).toMatchObject({ category: "vendor" });
      expect(isStatementPage(url)).toBe(false);
    });

    // The work is a few index reads and the veto's one pass over the segments, so a hostile path
    // costs milliseconds (2 to 40 ms measured); work quadratic in the segments, 10^10 steps here,
    // could not fit in a second.
    it("reads a path of 100,000 segments in under a second", () => {
      const path = `/intl/en-us/company${"/en-us".repeat(100_000)}`;
      const address = `https://acme-analytics.example${path}`;
      const startedAt = performance.now();
      expect(isStatementPage(address)).toBe(false);
      expect(performance.now() - startedAt).toBeLessThan(1000);
    });
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

describe("government hosts (Q8)", () => {
  it("classifies as official every sample government host, and the four that Q8 dropped as unknown", () => {
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
      "x.go.tz",
      "x.gov.br",
      "x.gv.at",
      "ec.europa.eu",
      "x.admin.ch",
      "x.bund.de",
      "x.gc.ca",
      "x.canada.ca",
      "x.gov.sg",
      "x.gov.my",
      "x.gov.pk",
      "x.gob.pk",
      "x.gov.lk",
      "x.gov.za",
      "x.gov.pl",
      "x.gov.hk",
      "x.gob.gt",
      "x.gov.de",
      "x.gov.fi",
      "x.gov.co",
    ];
    // Hosts that no page of a registry or a holder backs: the old pattern made them official, and
    // now they are unknown hosts (Q8).
    const DROPPED = ["x.go.ke", "x.go.ug", "x.govt.nz", "x.gob.ar"];
    expect(SAMPLES.filter((host) => at(`https://${host}/x`).category !== "official")).toEqual([]);
    expect(DROPPED.filter((host) => at(`https://${host}/x`).category !== "unverified")).toEqual([]);
    expect(DROPPED.filter((host) => at(`https://${host}/x`).reviewed)).toEqual([]);
  });
});
