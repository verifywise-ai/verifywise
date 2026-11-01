/**
 * The credibility rule (spec D5.3, with Rulings 7, 12 and 13 of the M0 plan): the worked cases of
 * D5.7, the extras of D6.3, and the inputs the plan's review focus names. A test is named after
 * its worked case.
 */
import type {
  EvidenceSource,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { credibilityOf, decideCredibility, describeSources } from "../credibility";
import { REGISTRY_VERSION } from "../sourceRegistry/entries";
import type { SourceProvenance } from "../evidence";
import type { ResearchTarget } from "../target";
import type { SnippetVerdict } from "../verifySnippets";
import type { VrdbRecordMeta } from "../vrdb/types";

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};
const NO_DOMAIN: ResearchTarget = { ...ACME, domain: null };
const SITE = "https://acme-analytics.example";

const source = (url: string, over: Partial<EvidenceSource> = {}): EvidenceSource => ({
  id: "S1",
  category: "security_incidents",
  kind: "page",
  onVendorSite: false,
  url,
  title: "Acme Analytics",
  content: "Acme Analytics reported an incident.",
  publishedAt: null,
  ...over,
});
const result = (url: string, over: Partial<EvidenceSource> = {}) =>
  source(url, { kind: "result", ...over });
const own = (url: string, over: Partial<EvidenceSource> = {}) =>
  source(url, { onVendorSite: true, ...over });

const rate = (
  category: ResearchCategory,
  pack: EvidenceSource[],
  opts: {
    provenance?: Record<string, SourceProvenance>;
    verdict?: SnippetVerdict | null;
    target?: ResearchTarget;
    cited?: string[];
  } = {},
) =>
  credibilityOf({
    finding: {
      category,
      sources: (opts.cited ?? pack.map((s) => s.url)).map((url) => ({
        url,
        title: "",
        quote: "q",
        published_at: null,
      })),
    },
    pack,
    provenance: new Map(Object.entries(opts.provenance ?? {})),
    verdict: opts.verdict ?? null,
    target: opts.target ?? ACME,
  });

const NVD_PAGE = "https://nvd.nist.gov/vuln/detail/CVE-2026-31337";
const OFAC_PAGE = "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=1";
const SEC_PAGE = "https://www.sec.gov/Archives/edgar/data/1/x.htm";
const REUTERS = "https://www.reuters.com/technology/acme-breach";
const BBC_UK = "https://www.bbc.co.uk/news/acme-breach";
const BBC_COM = "https://www.bbc.com/news/acme-breach";
const ICO = "https://ico.org.uk/action-weve-taken/enforcement/acme";
const ICO_RESULT = "https://ico.org.uk/x";
const LOCAL_NEWS = "https://localnews.example/x";
const INCIDENT_NOTICE = `${SITE}/blog/security-update`;
const WIRE = "https://www.prnewswire.com/news-releases/acme-iso-27001";

describe("credibilityOf", () => {
  describe("the worked cases of D5.7", () => {
    it("1: one KEV entry for the vendor's product is high", () => {
      expect(
        rate("security_incidents", [source(NVD_PAGE)], {
          provenance: { [NVD_PAGE]: { record: "kev" } },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "official_record", name_only: false } });
    });

    it("2: Reuters and BBC reporting the same breach is high", () => {
      expect(rate("security_incidents", [source(REUTERS), source(BBC_UK)])).toMatchObject({
        label: "high",
        basis: { rule: "trusted_press_two", name_only: false },
      });
    });

    it("3: one BBC story on bbc.co.uk and bbc.com is medium", () => {
      expect(
        rate("security_incidents", [result(BBC_UK), result(BBC_COM)], {
          verdict: { outcome: "unread" },
        }),
      ).toMatchObject({ label: "medium", basis: { rule: "trusted_press_one", name_only: false } });
    });

    const COPIES = [
      source("https://news.yahoo.com/acme-breach"),
      source("https://www.msn.com/en-us/news/acme-breach"),
      source("https://localnews-one.example/acme"),
      source("https://localnews-two.example/acme"),
      source("https://localnews-three.example/acme"),
    ];

    it("4: syndicated copies of an AP story with a canonical link are medium", () => {
      const canonical = { canonicalUrl: "https://apnews.com/article/x" };
      expect(
        rate("security_incidents", COPIES, {
          provenance: { [COPIES[0].url]: canonical, [COPIES[1].url]: canonical },
        }),
      ).toMatchObject({ label: "medium", basis: { rule: "trusted_press_one", name_only: false } });
    });

    it("4b: the same copies with no canonical link are low", () => {
      expect(rate("security_incidents", COPIES)).toMatchObject({
        label: "low",
        basis: { rule: "unverified", name_only: false },
      });
    });

    it("5: a single Medium post alleging a breach is low", () => {
      expect(
        rate("security_incidents", [source("https://medium.com/@x/acme-breach")]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("6: the vendor's press release claiming ISO 27001 is low", () => {
      expect(rate("certifications", [own(`${SITE}/press/acme-achieves-iso-27001`)])).toMatchObject({
        label: "low",
        basis: { rule: "self_claim", name_only: false },
      });
    });

    it("6b: its copy on a wire with an e-mail on the vendor's domain is low", () => {
      expect(
        rate("certifications", [
          source(WIRE, {
            content:
              "Acme Analytics achieves ISO 27001. Media contact: press@acme-analytics.example",
          }),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "self_claim", name_only: false } });
    });

    it("6d: its copy on a wire that only names the vendor's domain is low, and not the vendor's", () => {
      expect(
        rate("certifications", [
          source(WIRE, { content: "Acme Analytics achieves ISO 27001. acme-analytics.example" }),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("6c: its copy on a wire that names no domain is low", () => {
      expect(
        rate("certifications", [source(WIRE, { content: "Acme Analytics achieves ISO 27001." })]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("7: the vendor's own incident notice is high", () => {
      expect(rate("security_incidents", [own(INCIDENT_NOTICE)])).toMatchObject({
        label: "high",
        basis: { rule: "vendor_statement", name_only: false },
      });
    });

    it("8: a news article and the ICO page it cites, read, is high", () => {
      expect(rate("legal_regulatory", [source(LOCAL_NEWS), source(ICO)])).toMatchObject({
        label: "high",
        basis: { rule: "official_page", name_only: false },
      });
    });

    it("9: a sanctions entry with the vendor's name is low, with the note", () => {
      expect(
        rate("legal_regulatory", [source(OFAC_PAGE)], {
          provenance: { [OFAC_PAGE]: { record: "ofac" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "name_only", name_only: true } });
    });

    it("9b: the same, with Reuters and BBC reporting the designation, is high, with the note", () => {
      expect(
        rate("legal_regulatory", [source(OFAC_PAGE), source(REUTERS), source(BBC_UK)], {
          provenance: { [OFAC_PAGE]: { record: "ofac" } },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "trusted_press_two", name_only: true } });
    });

    it("10: a rejected CVE is low", () => {
      expect(
        rate("security_incidents", [source(NVD_PAGE)], {
          provenance: { [NVD_PAGE]: { record: "nvd", status: "rejected" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "inactive", name_only: false } });
    });

    it("11: a delisted sanctions entry is low, with the note", () => {
      expect(
        rate("legal_regulatory", [source(OFAC_PAGE)], {
          provenance: { [OFAC_PAGE]: { record: "ofac", status: "delisted" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "inactive", name_only: true } });
    });

    it("13: two trusted publishers seen only in search results are medium", () => {
      expect(
        rate("security_incidents", [result(REUTERS), result(BBC_COM)], {
          verdict: { outcome: "unread" },
        }),
      ).toMatchObject({ label: "medium", basis: { rule: "capped_unconfirmed", name_only: false } });
    });

    it("14: a contributor post on forbes.com/sites is low", () => {
      expect(
        rate("security_incidents", [
          source("https://www.forbes.com/sites/janedoe/2026/09/01/acme"),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("15: one trusted publisher and the vendor's marketing page in certifications is medium", () => {
      expect(
        rate("certifications", [source(REUTERS), own(`${SITE}/product/overview`)]),
      ).toMatchObject({ label: "medium", basis: { rule: "trusted_press_one", name_only: false } });
    });

    it("16: the vendor's status page listing an outage is high", () => {
      const STATUS = "https://status.acme-analytics.example/history";
      expect(
        rate("availability", [source(STATUS)], {
          provenance: { [STATUS]: { record: "statuspage" } },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "vendor_statement", name_only: false } });
    });

    it("17: a Have I Been Pwned breach entry is low", () => {
      const HIBP = "https://haveibeenpwned.com/PwnedWebsites#Acme";
      expect(
        rate("security_incidents", [source(HIBP)], { provenance: { [HIBP]: { record: "hibp" } } }),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("18: a law firm's investor alert on a paid wire is low", () => {
      expect(
        rate("legal_regulatory", [
          source("https://www.businesswire.com/news/home/x", {
            content: "A law firm announces an investigation of Acme Analytics.",
          }),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });
  });

  describe("the extras of D6.3", () => {
    it("gives an inactive record no support", () => {
      expect(
        rate("security_incidents", [source(NVD_PAGE)], {
          provenance: { [NVD_PAGE]: { record: "kev", status: "withdrawn" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "inactive", name_only: false } });
    });

    it("keeps a vendor statement high beside an unknown site", () => {
      expect(rate("security_incidents", [own(INCIDENT_NOTICE), source(LOCAL_NEWS)])).toMatchObject({
        label: "high",
        basis: { rule: "vendor_statement", name_only: false },
      });
    });

    it("makes a finding with only contradicted sources low", () => {
      expect(
        rate("security_incidents", [result(REUTERS), result(BBC_COM)], {
          verdict: { outcome: "not_on_page", url: REUTERS },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "contradicted", name_only: false } });
    });

    it("caps an unconfirmed official page at medium", () => {
      expect(
        rate("legal_regulatory", [result(ICO_RESULT)], { verdict: { outcome: "unread" } }),
      ).toMatchObject({ label: "medium", basis: { rule: "capped_unconfirmed", name_only: false } });
    });

    it("lets a read source name the rule before an unconfirmed one", () => {
      expect(
        rate("security_incidents", [result(ICO_RESULT), own(INCIDENT_NOTICE)], {
          verdict: { outcome: "unread" },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "vendor_statement", name_only: false } });
    });

    it("takes one confirmed trusted result as enough with a second publisher", () => {
      expect(
        rate("security_incidents", [result(REUTERS), result(BBC_COM)], {
          verdict: { outcome: "confirmed", url: REUTERS },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "trusted_press_two", name_only: false } });
    });
  });

  describe("user content and wire releases (Q25, Q27)", () => {
    it("a community thread on the vendor's domain gives Low in an event category", () => {
      expect(
        rate("security_incidents", [
          own("https://community.acme-analytics.example/t/data-leak/123"),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });

    it("a release with the vendor's e-mail is a statement in an event category", () => {
      expect(
        rate("security_incidents", [
          source(WIRE, {
            content:
              "Acme Analytics reports a security incident. Media contact: press@acme-analytics.example",
          }),
        ]),
      ).toMatchObject({ label: "high", basis: { rule: "vendor_statement", name_only: false } });
    });
  });

  describe("the stored basis (M1)", () => {
    const UK_PAGE = "https://www.gov.uk/government/publications/the-uk-sanctions-list?uid=RUS0001";
    const vrdb = (over: Partial<VrdbRecordMeta> = {}): VrdbRecordMeta => ({
      recordId: 7,
      sourceId: "uk_sanctions",
      sourceRecordId: "RUS0001",
      strength: "weak",
      method: "name_exact",
      matchedKey: "name:acmeanalytics",
      status: "active",
      asOf: "2026-10-26",
      stale: false,
      ...over,
    });
    const ukRecord = (meta: VrdbRecordMeta) =>
      rate("legal_regulatory", [source(UK_PAGE)], {
        provenance: { [UK_PAGE]: { record: "uk_sanctions", vrdb: meta } },
      });

    it("a VRDB record takes its match from the lookup", () => {
      expect(
        ukRecord(vrdb({ strength: "strong", method: "domain", matchedKey: "domain:acme.example" })),
      ).toMatchObject({ label: "high", basis: { rule: "official_record", name_only: false } });
      expect(ukRecord(vrdb())).toMatchObject({
        label: "low",
        basis: { rule: "name_only", name_only: true },
      });
      expect(ukRecord(vrdb({ status: "delisted" }))).toMatchObject({
        label: "low",
        basis: { rule: "inactive", name_only: true },
      });
    });

    it("the basis keeps the record's id, the date of its data and its staleness", () => {
      expect(ukRecord(vrdb({ stale: true })).basis.sources[0].record).toEqual({
        source: "uk_sanctions",
        match: "weak",
        status: "active",
        source_record_id: "RUS0001",
        as_of: "2026-10-26",
        stale: true,
      });
      expect(ukRecord(vrdb()).basis.sources[0].record).toEqual({
        source: "uk_sanctions",
        match: "weak",
        status: "active",
        source_record_id: "RUS0001",
        as_of: "2026-10-26",
      });
    });

    it("a trusted press source carries its publisher's name", () => {
      expect(rate("security_incidents", [source(REUTERS)]).basis.sources[0]).toMatchObject({
        category: "trusted_press",
        publisher: "reuters",
        publisher_name: "Reuters",
      });
      expect(
        rate("security_incidents", [source(LOCAL_NEWS)]).basis.sources[0].publisher_name,
      ).toBeUndefined();
    });

    it("a read trusted page and an unconfirmed official result give Medium by trusted_press_one", () => {
      expect(
        rate("legal_regulatory", [source(REUTERS), result(ICO_RESULT)], {
          verdict: { outcome: "unread" },
        }),
      ).toMatchObject({ label: "medium", basis: { rule: "trusted_press_one", name_only: false } });
    });

    it("a page is classified by the address that answered", () => {
      const SHORT = "https://t.co/abc";
      const rated = rate("security_incidents", [source(SHORT)], {
        provenance: { [SHORT]: { answeredUrl: "https://www.reuters.com/world/x" } },
      });
      expect(rated.basis.sources[0]).toMatchObject({
        url: SHORT,
        category: "trusted_press",
        entry: "reuters",
      });
      expect(rated).toMatchObject({ label: "medium", basis: { rule: "trusted_press_one" } });
    });

    it("user content is marked in the basis", () => {
      const THREAD = "https://www.reddit.com/r/sysadmin/comments/1/acme_breach/";
      expect(rate("security_incidents", [source(THREAD)]).basis.sources[0]).toMatchObject({
        category: "unverified",
        entry: "forums",
        user_content: true,
      });
    });
  });

  describe("the review focus", () => {
    it("a SEC record of a stored CIK is High with no note", () => {
      // The per-run lookup asks the SEC by the CIK a person stored, not by the name (Ruling 14).
      const filer = { ...ACME, identifiers: { secCik: "0000000001" } };

      expect(
        rate("security_incidents", [source(SEC_PAGE)], {
          provenance: { [SEC_PAGE]: { record: "sec" } },
          target: filer,
        }),
      ).toMatchObject({ label: "high", basis: { rule: "official_record", name_only: false } });
      expect(
        rate("security_incidents", [source(SEC_PAGE)], {
          provenance: { [SEC_PAGE]: { record: "sec" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "name_only", name_only: true } });
    });

    it("gives a weak and a strong record high from the strong one, with the note", () => {
      expect(
        rate("security_incidents", [source(NVD_PAGE), source(SEC_PAGE)], {
          provenance: { [NVD_PAGE]: { record: "kev" }, [SEC_PAGE]: { record: "sec" } },
        }),
      ).toMatchObject({ label: "high", basis: { rule: "official_record", name_only: true } });
    });

    it("takes a page of a vendor whose site is a registry host for the vendor's own claim", () => {
      expect(
        rate(
          "ai_specific",
          [own("https://www.bloomberg.com/company/about", { title: "About Bloomberg" })],
          { target: { ...ACME, name: "Bloomberg", domain: "bloomberg.com" } },
        ),
      ).toMatchObject({ label: "low", basis: { rule: "self_claim", name_only: false } });
    });

    it("classifies the pages of a vendor without a domain by their host", () => {
      expect(
        rate("security_incidents", [own(INCIDENT_NOTICE)], { target: NO_DOMAIN }),
      ).toMatchObject({ label: "low", basis: { rule: "unverified", name_only: false } });
    });
  });

  describe("an EDGAR filing under the stored CIK (Q28)", () => {
    const STORED = { ...ACME, identifiers: { secCik: "0000000001" } };
    const FILING = "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/acme-8k.htm";

    it("is the vendor's statement when its header says the vendor filed it", () => {
      const rated = rate("security_incidents", [source(FILING)], {
        provenance: { [FILING]: { edgarFiler: "vendor" } },
        target: STORED,
      });

      expect(rated).toMatchObject({ label: "high", basis: { rule: "vendor_statement" } });
      expect(rated.basis.sources[0]).toMatchObject({
        category: "vendor",
        entry: "sec",
        vendor_kind: "statement",
        reading: "read",
      });
      expect(rated.basis.sources[0]).not.toHaveProperty("downgraded");
    });

    it("is the vendor's own claim outside an event category, which is low", () => {
      expect(
        rate("certifications", [source(FILING, { category: "certifications" })], {
          provenance: { [FILING]: { edgarFiler: "vendor" } },
          target: STORED,
        }),
      ).toMatchObject({ label: "low", basis: { rule: "self_claim" } });
    });

    it.each([
      ["somebody else filed it", { edgarFiler: "other" as const }],
      ["nobody knows who filed it", {}],
    ])("is unverified and downgraded when %s", (_label, provenance) => {
      const rated = rate("security_incidents", [source(FILING)], {
        provenance: { [FILING]: provenance },
        target: STORED,
      });

      expect(rated).toMatchObject({ label: "low", basis: { rule: "unverified" } });
      expect(rated.basis.sources[0]).toMatchObject({
        category: "unverified",
        entry: "sec",
        downgraded: true,
      });
    });

    it("is unverified when the run has no provenance for it at all", () => {
      expect(rate("security_incidents", [source(FILING)], { target: STORED })).toMatchObject({
        label: "low",
        basis: { rule: "unverified" },
      });
    });

    it("is unverified for a vendor with no stored CIK, whatever the answer", () => {
      expect(
        rate("security_incidents", [source(FILING)], {
          provenance: { [FILING]: { edgarFiler: "vendor" } },
        }),
      ).toMatchObject({ label: "low", basis: { rule: "unverified" } });
    });

    it("reads the filing at the address that answered, and keeps the cited address", () => {
      const SHORT = "https://t.co/abc";
      const rated = rate("security_incidents", [source(SHORT)], {
        provenance: { [SHORT]: { answeredUrl: FILING, edgarFiler: "vendor" } },
        target: STORED,
      });

      expect(rated).toMatchObject({ label: "high", basis: { rule: "vendor_statement" } });
      expect(rated.basis.sources[0]).toMatchObject({
        url: SHORT,
        category: "vendor",
        entry: "sec",
      });
    });

    it("leaves a SEC record to its database: the answer does not change its class or its strength", () => {
      for (const edgarFiler of [undefined, "other", "vendor"] as const) {
        const provenance = { [FILING]: { record: "sec" as const, edgarFiler } };

        expect(
          rate("security_incidents", [source(FILING)], { provenance, target: STORED }),
        ).toMatchObject({ label: "high", basis: { rule: "official_record", name_only: false } });
        expect(rate("security_incidents", [source(FILING)], { provenance })).toMatchObject({
          label: "low",
          basis: { rule: "name_only", name_only: true },
        });
      }
    });
  });

  describe("the vendor's own pages outside an event category (rule V)", () => {
    it.each([
      "/press-releases/acme-achieves-iso-27001",
      "/newsroom/acme-achieves-soc-2-type-ii",
      "/en/press/acme-achieves-iso-27001",
      "/en/blog/our-soc-2-journey",
      "/company/news/acme-achieves-certification",
      "/security/blog/how-we-protect-your-data",
      "/product/security-features",
    ])("takes %s, a page of what the vendor announces, for its own claim", (path) => {
      expect(rate("certifications", [own(`${SITE}${path}`)])).toMatchObject({
        label: "low",
        basis: { rule: "self_claim" },
      });
    });

    it("reads no title: an AI tagline on the home page is a claim", () => {
      expect(
        rate("ai_specific", [own(`${SITE}/`, { title: "Acme Analytics | AI-powered analytics" })]),
      ).toMatchObject({ label: "low", basis: { rule: "self_claim" } });
    });

    it.each([
      `${SITE}/trust/soc2-report`,
      `${SITE}/legal/ai-use`,
      `${SITE}/en-us/privacy`,
      `${SITE}/policies/acceptable-use`,
      `${SITE}/sub-processors`,
      "https://trust.acme-analytics.example/",
      "https://security.acme-analytics.example/reports",
    ])("takes %s, a page where the vendor states what binds it, for its statement", (url) => {
      expect(rate("certifications", [own(url)])).toMatchObject({
        label: "high",
        basis: { rule: "vendor_statement" },
      });
    });

    it("takes the press page of a vendor whose site is a registry host for its own claim (focus 1)", () => {
      expect(
        rate(
          "certifications",
          [
            own(
              "https://www.bloomberg.com/company/press/bloomberg-achieves-iso-27001-certification/",
              {
                title: "Bloomberg achieves ISO 27001 certification",
              },
            ),
          ],
          { target: { ...ACME, name: "Bloomberg", domain: "bloomberg.com" } },
        ),
      ).toMatchObject({ label: "low", basis: { rule: "self_claim" } });
    });
  });

  describe("a release on the site of a trusted publisher", () => {
    it("is no reporting of the publisher's: a law firm's alert on the release pages of AP and MarketWatch is low", () => {
      expect(
        rate("legal_regulatory", [
          source("https://apnews.com/press-release/globe-newswire/acme-analytics-investor-alert"),
          source(
            "https://www.marketwatch.com/press-release/acme-analytics-investor-alert-2026-10-01",
          ),
        ]),
      ).toMatchObject({ label: "low", basis: { rule: "unverified" } });
    });
  });

  describe("the trusted press under the evidence ruling (Q9, sr-5)", () => {
    const HACKER_NEWS = "https://thehackernews.com/2026/10/acme-analytics-breach.html";
    const GUARDIAN_NEWS =
      "https://www.theguardian.com/technology/2026/oct/01/acme-analytics-breach";

    it("a story on thehackernews.com alone is low: no standards page was seen, so it is unverified", () => {
      expect(rate("security_incidents", [source(HACKER_NEWS)])).toMatchObject({
        label: "low",
        basis: { rule: "unverified", name_only: false },
      });
    });

    it("Reuters and thehackernews.com reporting the same breach is medium: the second is no trusted publisher", () => {
      expect(rate("security_incidents", [source(REUTERS), source(HACKER_NEWS)])).toMatchObject({
        label: "medium",
        basis: { rule: "trusted_press_one", name_only: false },
      });
    });

    it("Reuters and a news story of The Guardian reporting the same breach is high", () => {
      expect(rate("security_incidents", [source(REUTERS), source(GUARDIAN_NEWS)])).toMatchObject({
        label: "high",
        basis: { rule: "trusted_press_two", name_only: false },
      });
    });

    it.each([
      "https://www.theguardian.com/commentisfree/2026/oct/01/the-case-for-acme",
      "https://www.cnbc.com/advertorial/2022/02/17/understanding-the-value-of-branded-content.html",
      "https://www.cnbc.com/guest-blog/2026/09/01/acme-analytics-and-data-protection.html",
      "https://www.forbes.com/councils/forbestechcouncil/2026/09/01/acme-analytics-and-data-protection/",
      "https://www.forbes.com/advisor/business/software/best-analytics-software/",
      "https://www.forbes.com/vetted/best-laptops/",
    ])("%s is low: it is not the publisher's own reporting", (url) => {
      const rated = rate("security_incidents", [source(url)]);
      expect(rated).toMatchObject({ label: "low", basis: { rule: "unverified" } });
      expect(rated.basis.sources[0]).toMatchObject({ downgraded: true });
    });
  });

  describe("totality", () => {
    it("rates a cited address that is not in the pack as unconfirmed", () => {
      expect(rate("legal_regulatory", [], { cited: [ICO_RESULT] })).toMatchObject({
        label: "medium",
        basis: { rule: "capped_unconfirmed", name_only: false },
      });
    });

    it("rates a finding with no sources low", () => {
      expect(rate("security_incidents", [])).toEqual({
        label: "low",
        basis: {
          rule: "unverified",
          registry_version: REGISTRY_VERSION,
          name_only: false,
          sources: [],
        },
      });
    });

    it("never throws, for a cited address that cannot be read either", () => {
      expect(() => rate("security_incidents", [], { cited: ["not a url", ""] })).not.toThrow();
      expect(rate("security_incidents", [], { cited: ["not a url"] })).toMatchObject({
        label: "low",
        basis: { rule: "unverified" },
      });
    });
  });

  describe("the basis", () => {
    it("is exactly what case 8 shows", () => {
      expect(rate("legal_regulatory", [source(LOCAL_NEWS), source(ICO)]).basis).toEqual({
        rule: "official_page",
        registry_version: REGISTRY_VERSION,
        name_only: false,
        sources: [
          {
            url: "https://localnews.example/x",
            category: "unverified",
            publisher: "localnews",
            entry: null,
            reviewed: false,
            reading: "read",
          },
          {
            url: "https://ico.org.uk/action-weve-taken/enforcement/acme",
            category: "official",
            publisher: "ico",
            entry: "ico",
            reviewed: true,
            reading: "read",
          },
        ],
      });
    });

    it("describes a record by its database, its match and its status, and a vendor source by its kind", () => {
      const { basis } = rate(
        "certifications",
        [source(OFAC_PAGE, { category: "legal_regulatory" }), own(`${SITE}/product/overview`)],
        { provenance: { [OFAC_PAGE]: { record: "ofac" } } },
      );
      expect(basis.sources).toEqual([
        {
          url: OFAC_PAGE,
          category: "official",
          publisher: "ofac",
          entry: null,
          reviewed: true,
          reading: "read",
          record: { source: "ofac", match: "weak", status: "active" },
        },
        {
          url: `${SITE}/product/overview`,
          category: "vendor",
          publisher: "vendor",
          entry: null,
          reviewed: true,
          reading: "read",
          vendor_kind: "self_claim",
        },
      ]);
    });

    it("keeps the flags of a downgraded, a syndicated and a blocked source", () => {
      const { basis } = rate("security_incidents", [
        source("https://www.forbes.com/sites/janedoe/x"),
        source("https://www.msn.com/en-us/news/x"),
        source("https://pastebin.com/abc"),
      ]);
      expect(
        basis.sources.map(({ downgraded, syndicated, blocked }) => [
          downgraded,
          syndicated,
          blocked,
        ]),
      ).toEqual([
        [true, undefined, undefined],
        [undefined, true, undefined],
        [undefined, undefined, true],
      ]);
    });
  });
});

describe("describeSources", () => {
  it("describeSources gives what credibilityOf's basis holds", () => {
    // The backfill (M3) describes the sources of a stored finding with the rule's own part.
    const pack = [source(LOCAL_NEWS), result(ICO_RESULT), source(NVD_PAGE)];
    const input = {
      finding: {
        category: "legal_regulatory" as ResearchCategory,
        sources: [LOCAL_NEWS, ICO_RESULT, NVD_PAGE, "https://unknown.example/a"].map((url) => ({
          url,
          title: "",
          quote: "q",
          published_at: null,
        })),
      },
      pack,
      provenance: new Map<string, SourceProvenance>([[NVD_PAGE, { record: "nvd" }]]),
      verdict: { outcome: "confirmed", url: ICO_RESULT } as SnippetVerdict,
      target: ACME,
    };

    expect(describeSources(input)).toEqual(credibilityOf(input).basis.sources);
  });
});

describe("decideCredibility", () => {
  // The status job (vrdb/relabel.ts) decides a stored finding again from the sources its basis
  // described, with no pack, provenance or verdict: the label must be the one credibilityOf gave.
  const OFAC = { [OFAC_PAGE]: { record: "ofac" as const } };
  const cases: Array<[string, ReturnType<typeof rate>]> = [
    [
      "1",
      rate("security_incidents", [source(NVD_PAGE)], {
        provenance: { [NVD_PAGE]: { record: "kev" } },
      }),
    ],
    ["2", rate("security_incidents", [source(REUTERS), source(BBC_UK)])],
    [
      "3",
      rate("security_incidents", [result(BBC_UK), result(BBC_COM)], {
        verdict: { outcome: "unread" },
      }),
    ],
    ["6", rate("certifications", [own(`${SITE}/press/acme-achieves-iso-27001`)])],
    ["7", rate("security_incidents", [own(INCIDENT_NOTICE)])],
    ["8", rate("legal_regulatory", [source(LOCAL_NEWS), source(ICO)])],
    ["9", rate("legal_regulatory", [source(OFAC_PAGE)], { provenance: OFAC })],
    [
      "9b",
      rate("legal_regulatory", [source(OFAC_PAGE), source(REUTERS), source(BBC_UK)], {
        provenance: OFAC,
      }),
    ],
    [
      "10",
      rate("security_incidents", [source(NVD_PAGE)], {
        provenance: { [NVD_PAGE]: { record: "nvd", status: "rejected" } },
      }),
    ],
    [
      "11",
      rate("legal_regulatory", [source(OFAC_PAGE)], {
        provenance: { [OFAC_PAGE]: { record: "ofac", status: "delisted" } },
      }),
    ],
    [
      "13",
      rate("security_incidents", [result(REUTERS), result(BBC_COM)], {
        verdict: { outcome: "unread" },
      }),
    ],
    ["15", rate("certifications", [source(REUTERS), own(`${SITE}/product/overview`)])],
    ["no sources", rate("security_incidents", [])],
  ];

  it.each(cases)(
    "gives the label credibilityOf gave, from the sources it described: case %s",
    (_case, rated) => {
      expect(decideCredibility(rated.basis.sources, { contradicted: false })).toEqual({
        label: rated.label,
        rule: rated.basis.rule,
        nameOnly: rated.basis.name_only,
      });
    },
  );

  it("a contradicted finding is low whatever its sources earn", () => {
    const contradicted = rate("security_incidents", [result(REUTERS), source(BBC_UK)], {
      verdict: { outcome: "not_on_page", url: REUTERS },
    });
    expect(contradicted).toMatchObject({ label: "low", basis: { rule: "contradicted" } });

    const twoPublishers = rate(
      "legal_regulatory",
      [source(OFAC_PAGE), source(REUTERS), source(BBC_UK)],
      {
        provenance: OFAC,
      },
    );
    expect(decideCredibility(twoPublishers.basis.sources, { contradicted: true })).toEqual({
      label: "low",
      rule: "contradicted",
      nameOnly: true,
    });
  });
});
