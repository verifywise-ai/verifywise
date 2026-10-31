/**
 * The backfill's decision (spec D4.6, Rulings 3 to 6 of the M3 plan): a decided finding of a run
 * before the credibility rule keeps its confidence as a legacy label, and a pending one is decided
 * by the rule's own parts from what its run stored: the evidence pack, the trace of the snippet
 * check, and the addresses of the per-run records.
 */
import type {
  EvidenceSource,
  FindingConfidence,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  type BackfillInput,
  type LegacyFinding,
  backfillCredibilityOf,
  provenanceByAddress,
  verdictOf,
} from "../backfill";
import { credibilityOf } from "../credibility";
import { filingUrl } from "../records/sec";
import { statusHostsOf } from "../records/statuspage";
import type { ResearchTarget } from "../target";
import type { TraceStep } from "../trace";
import { ofacEntryUrl } from "../vrdb/connectors/ofac";
import { cvePageOf } from "../vrdb/connectors/kev";

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};
const ACME_WITH_CIK: ResearchTarget = { ...ACME, identifiers: { secCik: "0000320193" } };

const ICO = "https://ico.org.uk/action-weve-taken/enforcement/acme";
const ICO_RESULT = "https://ico.org.uk/action-weve-taken/enforcement/acme-result";
const NVD_PAGE = cvePageOf("CVE-2026-1001");
const OFAC_PAGE = ofacEntryUrl(36001);
const filing = (cik: string) =>
  filingUrl(cik, {
    accession: `${cik.padStart(10, "0")}-26-000001`,
    form: "8-K",
    filedAt: "2026-10-01",
    items: ["1.05"],
    document: "acme-8k.htm",
  });

const packed = (url: string, kind: EvidenceSource["kind"] = "page"): EvidenceSource => ({
  id: "S1",
  category: "security_incidents",
  kind,
  onVendorSite: false,
  url,
  title: "Acme Analytics",
  content: "Acme Analytics reported an incident.",
  publishedAt: null,
});

const legacy = (over: Partial<LegacyFinding> & { cited?: string[] } = {}): LegacyFinding => {
  const { cited = [ICO], ...rest } = over;
  return {
    id: 1,
    status: "pending",
    category: "legal_regulatory" as ResearchCategory,
    sources: cited.map((url) => ({ url, title: "", quote: "q", published_at: null })),
    snippet_only: false,
    confidence: "medium" as FindingConfidence,
    created_at: "2026-10-12T08:30:00.000Z",
    ...rest,
  };
};

const verification = (url: string, outcome: string, category = "legal_regulatory"): TraceStep => ({
  n: 1,
  by: "verification",
  tool: "read",
  category,
  url,
  outcome,
});

const backfill = (over: Partial<BackfillInput> & { finding: LegacyFinding }) =>
  backfillCredibilityOf({ evidence: [], trace: null, target: ACME, ...over });

describe("backfillCredibilityOf", () => {
  it("an accepted or dismissed finding keeps its confidence as a legacy label", () => {
    for (const status of ["accepted", "dismissed"] as const) {
      expect(backfill({ finding: legacy({ status, confidence: "medium" }) })).toEqual({
        credibility: "medium",
        basis: { rule: "legacy_confidence" },
      });
    }
  });

  it("a decided finding without a confidence is left alone", () => {
    expect(backfill({ finding: legacy({ status: "accepted", confidence: null }) })).toBeNull();
  });

  it("a pending finding citing an official page the run read is high", () => {
    const decided = backfill({ finding: legacy(), evidence: [packed(ICO)] });

    expect(decided).toMatchObject({
      credibility: "high",
      basis: { rule: "backfill_official_page", registry_version: "sr-4", name_only: false },
    });
  });

  it("the NVD page of a CVE is a strong NVD record as of the finding's day", () => {
    const decided = backfill({
      finding: legacy({ category: "security_incidents", cited: [NVD_PAGE] }),
      evidence: [packed(NVD_PAGE)],
    });

    expect(decided?.credibility).toBe("high");
    expect(decided?.basis).toMatchObject({ rule: "backfill_official_record" });
    expect(decided?.basis.rule !== "legacy_confidence" && decided?.basis.sources[0].record).toEqual(
      {
        source: "nvd",
        match: "strong",
        status: "active",
        source_record_id: "CVE-2026-1001",
        as_of: "2026-10-12",
      },
    );
  });

  it("an OFAC entry is weak, with the name-only note", () => {
    const decided = backfill({
      finding: legacy({ cited: [OFAC_PAGE] }),
      evidence: [{ ...packed(OFAC_PAGE), category: "legal_regulatory" }],
    });

    expect(decided).toMatchObject({
      credibility: "low",
      basis: { rule: "backfill_name_only", name_only: true },
    });
  });

  it("an SEC filing under the vendor's stored CIK is strong", () => {
    const url = filing("320193");
    const decided = backfill({
      finding: legacy({ category: "security_incidents", cited: [url] }),
      evidence: [packed(url)],
      target: ACME_WITH_CIK,
    });

    expect(decided).toMatchObject({
      credibility: "high",
      basis: { rule: "backfill_official_record", name_only: false },
    });
  });

  it("an SEC filing under another CIK is weak", () => {
    const url = filing("789019");
    const decided = backfill({
      finding: legacy({ category: "security_incidents", cited: [url] }),
      evidence: [packed(url)],
      target: ACME_WITH_CIK,
    });

    expect(decided).toMatchObject({
      credibility: "low",
      basis: { rule: "backfill_name_only", name_only: true },
    });
  });

  it("an SEC filing the research found itself is read as the registry reads it", () => {
    const url = filing("320193");
    const finding = legacy({ category: "certifications", cited: [url] });
    // The per-run lookup stored its filings under security incidents: this entry is the web's.
    const evidence: EvidenceSource[] = [{ ...packed(url), category: "certifications" }];
    const live = credibilityOf({
      finding,
      pack: evidence,
      provenance: new Map(),
      verdict: null,
      target: ACME_WITH_CIK,
    });

    expect(live).toMatchObject({ label: "low", basis: { rule: "self_claim" } });
    expect(backfill({ finding, evidence, target: ACME_WITH_CIK })).toMatchObject({
      credibility: "low",
      basis: { rule: "backfill_self_claim", name_only: false },
    });
  });

  it("a finding on the vendor's own status page is its statement, as the current rule says", () => {
    const [own] = statusHostsOf("acme-analytics.example");
    const url = `https://${own.host}/incidents/k2x7c9m4l1z`;
    const finding = legacy({ category: "availability", cited: [url] });
    const evidence: EvidenceSource[] = [{ ...packed(url), category: "availability" }];

    const decided = backfill({ finding, evidence });
    // The run's lookup gave the page as a status page record, which the stored pack does not say.
    const live = credibilityOf({
      finding,
      pack: evidence,
      provenance: new Map([[url, { record: "statuspage" as const }]]),
      verdict: null,
      target: ACME,
    });

    expect(live).toMatchObject({ label: "high", basis: { rule: "vendor_statement" } });
    expect(decided).toMatchObject({
      credibility: "high",
      basis: { rule: "backfill_vendor_statement", name_only: false },
    });
    expect(decided?.basis.rule !== "legacy_confidence" && decided?.basis.sources[0]).toMatchObject({
      category: "vendor",
      vendor_kind: "statement",
      reading: "read",
      record: { source: "statuspage", match: null, status: "active" },
    });
  });

  it("a page of the brand's status host that the research read itself is not the vendor's word", () => {
    const brand = statusHostsOf("acme-analytics.example").find((host) => !host.own);
    const url = `https://${brand?.host}/incidents/k2x7c9m4l1z`;
    const finding = legacy({ category: "availability", cited: [url] });

    // Read under another category: not the lookup's entry, so the host decides, as for any page.
    expect(backfill({ finding, evidence: [packed(url)] })).toMatchObject({
      credibility: "low",
      basis: { rule: "backfill_unverified" },
    });
    // The lookup's entry: a page stored under availability.
    expect(
      backfill({ finding, evidence: [{ ...packed(url), category: "availability" }] }),
    ).toMatchObject({ credibility: "high", basis: { rule: "backfill_vendor_statement" } });
  });

  it("takes a stored pack of any shape without throwing, and reads its entries that have an address", () => {
    const evidence = [null, 7, "x", { url: 5 }, packed(ICO)] as never[];

    expect(() => backfill({ finding: legacy(), evidence })).not.toThrow();
    expect(backfill({ finding: legacy(), evidence })).toMatchObject({
      credibility: "high",
      basis: { rule: "backfill_official_page" },
    });
  });

  it("a finding whose run kept no evidence is at most medium", () => {
    expect(backfill({ finding: legacy(), evidence: null })).toMatchObject({
      credibility: "medium",
      basis: { rule: "backfill_capped_unconfirmed" },
    });
    // A cited address that the stored pack lacks reads as unconfirmed too.
    expect(backfill({ finding: legacy(), evidence: [packed(ICO_RESULT)] })).toMatchObject({
      credibility: "medium",
      basis: { rule: "backfill_capped_unconfirmed" },
    });
  });

  it("a snippet-only finding the check found off the page is contradicted", () => {
    const decided = backfill({
      finding: legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "low" }),
      evidence: [packed(ICO_RESULT, "result")],
      trace: { steps: [verification(ICO_RESULT, "not_on_page")] },
    });

    expect(decided).toMatchObject({
      credibility: "low",
      basis: { rule: "backfill_contradicted" },
    });
  });

  it("a snippet-only low finding whose pages could not be read is not called contradicted", () => {
    const decided = backfill({
      finding: legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "low" }),
      evidence: [packed(ICO_RESULT, "result")],
      trace: { steps: [verification(ICO_RESULT, "failed")] },
    });

    expect(decided?.basis.rule).not.toBe("backfill_contradicted");
    expect(decided?.basis.rule !== "legacy_confidence" && decided?.basis.sources[0].reading).toBe(
      "unconfirmed",
    );
  });

  it("without a trace, a snippet-only low finding is contradicted, as the spec says", () => {
    expect(
      backfill({
        finding: legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "low" }),
        evidence: [packed(ICO_RESULT, "result")],
      }),
    ).toMatchObject({ credibility: "low", basis: { rule: "backfill_contradicted" } });
  });

  it("without a trace, a snippet-only medium finding is unconfirmed", () => {
    const decided = backfill({
      finding: legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "medium" }),
      evidence: [packed(ICO_RESULT, "result")],
    });

    expect(decided).toMatchObject({
      credibility: "medium",
      basis: { rule: "backfill_capped_unconfirmed" },
    });
  });

  it("a finding the check confirmed reads the confirming page as read", () => {
    const finding = legacy({ cited: [ICO_RESULT] });
    const evidence = [packed(ICO_RESULT, "result")];

    expect(
      backfill({ finding, evidence, trace: { steps: [verification(ICO_RESULT, "confirmed")] } }),
    ).toMatchObject({ credibility: "high", basis: { rule: "backfill_official_page" } });
    // Without the step the result is a snippet nobody confirmed.
    expect(backfill({ finding, evidence })).toMatchObject({
      credibility: "medium",
      basis: { rule: "backfill_capped_unconfirmed" },
    });
  });

  it("a finding that cites a page the run read borrows no other finding's confirmation", () => {
    const blog = "https://blog.example/acme-fined";
    const finding = legacy({ cited: [blog, ICO_RESULT] });
    const evidence = [packed(blog), packed(ICO_RESULT, "result")];
    // The trace keeps no finding id: this step is another finding's check of the same result.
    const trace = { steps: [verification(ICO_RESULT, "confirmed")] };
    // The live check examines no finding that cites a page: its verdict is null.
    const live = credibilityOf({
      finding,
      pack: evidence,
      provenance: new Map(),
      verdict: null,
      target: ACME,
    });

    expect(live).toMatchObject({ label: "medium", basis: { rule: "capped_unconfirmed" } });
    expect(backfill({ finding, evidence, trace })).toMatchObject({
      credibility: "medium",
      basis: { rule: "backfill_capped_unconfirmed" },
    });
  });
});

describe("verdictOf", () => {
  const RESULTS = new Map([[ICO_RESULT, packed(ICO_RESULT, "result")]]);

  it("reads only the checks of the finding's own addresses and category", () => {
    const finding = legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "medium" });

    // A check of another address, of another category, or by the model is not the finding's.
    expect(
      verdictOf(
        finding,
        {
          steps: [
            verification("https://ico.org.uk/other", "not_on_page"),
            verification(ICO_RESULT, "not_on_page", "security_incidents"),
            { n: 3, tool: "read", url: ICO_RESULT, outcome: "not_on_page" },
          ],
        },
        RESULTS,
      ),
    ).toEqual({ outcome: "unread" });
    // A check without a category (an older trace) is.
    const { category: _category, ...uncategorised } = verification(ICO_RESULT, "not_on_page");
    expect(verdictOf(finding, { steps: [uncategorised] }, RESULTS)).toEqual({
      outcome: "not_on_page",
      url: ICO_RESULT,
    });
  });

  it("a finding that was not snippet-only has no verdict unless a check confirmed it", () => {
    const finding = legacy({ cited: [ICO_RESULT] });

    expect(verdictOf(finding, null, RESULTS)).toBeNull();
    expect(verdictOf(finding, { steps: [verification(ICO_RESULT, "failed")] }, RESULTS)).toBeNull();
  });

  it("a finding that cites a page the run read has no verdict, as at run time", () => {
    const blog = "https://blog.example/acme-fined";
    const pack = new Map([...RESULTS, [blog, packed(blog)]]);
    const steps = [verification(ICO_RESULT, "confirmed")];

    expect(verdictOf(legacy({ cited: [blog, ICO_RESULT] }), { steps }, pack)).toBeNull();
    // A finding that cites the result alone was checked: the step can be its own.
    expect(verdictOf(legacy({ cited: [ICO_RESULT] }), { steps }, pack)).toEqual({
      outcome: "confirmed",
      url: ICO_RESULT,
    });
  });

  it("takes a trace of any shape without throwing", () => {
    const finding = legacy({ cited: [ICO_RESULT], snippet_only: true, confidence: "low" });

    for (const trace of [{}, { steps: "nope" }, { steps: [null, 7, "x"] }] as never[]) {
      expect(() => verdictOf(finding, trace, RESULTS)).not.toThrow();
    }
  });
});

describe("provenanceByAddress", () => {
  const DAY = "2026-10-12";

  it("reads the four addresses of the per-run records", () => {
    expect(provenanceByAddress(NVD_PAGE, ACME, DAY)).toEqual({
      source: "nvd",
      match: "strong",
      status: "active",
      source_record_id: "CVE-2026-1001",
      as_of: DAY,
    });
    expect(provenanceByAddress(OFAC_PAGE, ACME, DAY)).toEqual({
      source: "ofac",
      match: "weak",
      status: "active",
      source_record_id: "36001",
      as_of: DAY,
    });
    // A filing's id is its accession number, as the SEC writes it and the live records carry it.
    expect(provenanceByAddress(filing("320193"), ACME_WITH_CIK, DAY)).toEqual({
      source: "sec",
      match: "strong",
      status: "active",
      source_record_id: "0000320193-26-000001",
      as_of: DAY,
    });
    expect(
      provenanceByAddress("https://haveibeenpwned.com/api/v3/breach/AcmeAnalytics", ACME, DAY),
    ).toEqual({
      source: "hibp",
      match: null,
      status: "active",
      source_record_id: "AcmeAnalytics",
      as_of: DAY,
    });
  });

  it("reads the two addresses of the status page of the vendor's own status host", () => {
    const [own] = statusHostsOf("acme-analytics.example");
    for (const url of [
      `https://${own.host}/history`,
      `https://${own.host}/incidents/k2x7c9m4l1z`,
    ]) {
      expect(provenanceByAddress(url, ACME, DAY)).toEqual({
        source: "statuspage",
        match: null,
        status: "active",
        as_of: DAY,
      });
    }
  });

  it("a status page of the brand's hosts is a record only as the run's lookup stored it", () => {
    const brandHosts = statusHostsOf("acme-analytics.example").filter((host) => !host.own);
    expect(brandHosts).toHaveLength(2);
    for (const { host } of brandHosts) {
      const url = `https://${host}/incidents/k2x7c9m4l1z`;
      const stored: EvidenceSource = { ...packed(url), category: "availability" };
      expect(provenanceByAddress(url, ACME, DAY, stored)?.source).toBe("statuspage");
      expect(provenanceByAddress(url, ACME, DAY, { ...stored, kind: "result" })).toBeNull();
      expect(provenanceByAddress(url, ACME, DAY, packed(url))).toBeNull();
      expect(provenanceByAddress(url, ACME, DAY)).toBeNull();
    }
    // Without a domain, the lookup asked no status host.
    const [own] = statusHostsOf("acme-analytics.example");
    expect(
      provenanceByAddress(`https://${own.host}/history`, { ...ACME, domain: null }, DAY),
    ).toBeNull();
  });

  it("an SEC filing is weak without a stored CIK", () => {
    expect(provenanceByAddress(filing("320193"), ACME, DAY)?.match).toBe("weak");
  });

  it("a stored entry is a record only as a lookup stored it: a page of its category", () => {
    const [own] = statusHostsOf("acme-analytics.example");
    const cases: Array<[string, EvidenceSource["category"], ResearchTarget]> = [
      [NVD_PAGE, "security_incidents", ACME],
      [filing("320193"), "security_incidents", ACME_WITH_CIK],
      ["https://haveibeenpwned.com/api/v3/breach/AcmeAnalytics", "security_incidents", ACME],
      [OFAC_PAGE, "legal_regulatory", ACME],
      [`https://${own.host}/history`, "availability", ACME],
    ];
    for (const [url, category, target] of cases) {
      const stored: EvidenceSource = { ...packed(url), category };
      expect(provenanceByAddress(url, target, DAY, stored)).not.toBeNull();
      // The research found it itself: under another category, or as a search result.
      expect(
        provenanceByAddress(url, target, DAY, { ...stored, category: "certifications" }),
      ).toBeNull();
      expect(provenanceByAddress(url, target, DAY, { ...stored, kind: "result" })).toBeNull();
      // A run that kept no entry for it: the address decides, as before.
      expect(provenanceByAddress(url, target, DAY)).not.toBeNull();
    }
  });

  it("anything else is no record, and a long address is read in linear time", () => {
    for (const url of [
      `${NVD_PAGE}?x=1`,
      `${NVD_PAGE}/`,
      "http://nvd.nist.gov/vuln/detail/CVE-2026-1001",
      "https://nvd.nist.gov.example/vuln/detail/CVE-2026-1001",
      "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=abc",
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193",
      // A folder that is not an accession number: 10-2-6 digits.
      "https://www.sec.gov/Archives/edgar/data/320193/2600000112/acme-8k.htm",
      "https://haveibeenpwned.com/PwnedWebsites#Acme",
      "https://status.othercorp.example/incidents/k2x7c9m4l1z",
      "https://status.acme-analytics.example/history.atom",
      "https://status.acme-analytics.example/incidents/k2x7c9m4l1z/",
      `https://status.acme-analytics.example/incidents/${"a".repeat(41)}`,
      "http://status.acme-analytics.example/history",
      "not a url",
      "",
    ]) {
      expect(provenanceByAddress(url, ACME, DAY)).toBeNull();
    }
    const long = `https://nvd.nist.gov/vuln/detail/CVE-2026-${"1".repeat(200_000)}`;
    const started = Date.now();
    expect(provenanceByAddress(long, ACME, DAY)).toBeNull();
    expect(Date.now() - started).toBeLessThan(200);
  });
});
