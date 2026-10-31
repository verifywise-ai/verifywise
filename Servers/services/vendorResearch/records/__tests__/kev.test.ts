import { MAX_RECORDS } from "../types";
import { KevEntry, kevRecords, parseKev } from "../kev";

const raw = (over: Record<string, unknown> = {}) => ({
  cveID: "CVE-2026-1001",
  vendorProject: "Brise Networks",
  product: "BriseOS",
  vulnerabilityName: "Brise Networks BriseOS Authentication Bypass Vulnerability",
  dateAdded: "2026-10-20",
  shortDescription: "BriseOS contains an authentication bypass that lets a remote attacker log in.",
  requiredAction: "Apply mitigations per vendor instructions or discontinue use of the product.",
  dueDate: "2026-11-10",
  knownRansomwareCampaignUse: "Known",
  notes: "https://example.com/advisory",
  cwes: ["CWE-287"],
  ...over,
});

const entry = (over: Partial<KevEntry> = {}): KevEntry => ({ ...(raw() as KevEntry), ...over });

describe("parseKev", () => {
  it("reads the entries of the catalog and keeps the fields it uses", () => {
    expect(parseKev({ title: "CISA", count: 1, vulnerabilities: [raw()] })).toEqual([
      {
        cveID: "CVE-2026-1001",
        vendorProject: "Brise Networks",
        product: "BriseOS",
        vulnerabilityName: "Brise Networks BriseOS Authentication Bypass Vulnerability",
        dateAdded: "2026-10-20",
        shortDescription:
          "BriseOS contains an authentication bypass that lets a remote attacker log in.",
        requiredAction:
          "Apply mitigations per vendor instructions or discontinue use of the product.",
        dueDate: "2026-11-10",
        knownRansomwareCampaignUse: "Known",
      },
    ]);
  });

  it("drops an entry whose id is no CVE id, whose date is no day, or that names no vendor", () => {
    const parsed = parseKev({
      vulnerabilities: [
        raw({ cveID: "not-an-id" }),
        raw({ cveID: "CVE-2026-1002", dateAdded: "yesterday" }),
        raw({ cveID: "CVE-2026-1003", vendorProject: "" }),
        raw({ cveID: "CVE-2026-1004", vendorProject: 7 }),
        raw({ cveID: "CVE-2026-1005" }),
        null,
        "text",
      ],
    });

    expect(parsed.map((item) => item.cveID)).toEqual(["CVE-2026-1005"]);
  });

  it("drops an id that is not a whole CVE id, and a date that is not a whole day", () => {
    const parsed = parseKev({
      vulnerabilities: [
        raw({ cveID: "CVE-26-1001" }),
        raw({ cveID: "CVE-20266-1001" }),
        raw({ cveID: "CVE-2026-100" }),
        raw({ cveID: "xCVE-2026-1001" }),
        raw({ cveID: "CVE-2026-1001x" }),
        raw({ cveID: "CVE-2026-1006", dateAdded: "2026-10-20x" }),
        raw({ cveID: "CVE-2026-1007", dateAdded: "x2026-10-20" }),
        raw({ cveID: "CVE-2026-10080" }),
      ],
    });

    expect(parsed.map((item) => item.cveID)).toEqual(["CVE-2026-10080"]);
  });

  it("trims the vendor of an entry", () => {
    const [parsed] = parseKev({ vulnerabilities: [raw({ vendorProject: "  Brise Networks \n" })] });

    expect(parsed.vendorProject).toBe("Brise Networks");
  });

  it("turns a field that is missing or is no text into an empty one", () => {
    const [parsed] = parseKev({
      vulnerabilities: [raw({ product: undefined, requiredAction: 4, dueDate: null })],
    });

    expect(parsed.product).toBe("");
    expect(parsed.requiredAction).toBe("");
    expect(parsed.dueDate).toBe("");
  });

  it.each([null, undefined, "catalog", 4, [], {}, { vulnerabilities: "none" }])(
    "gives no entry for %p, which is no catalog",
    (body) => {
      expect(parseKev(body)).toEqual([]);
    },
  );
});

describe("kevRecords", () => {
  const keys = ["brisenetworks"];
  const run = (entries: KevEntry[], cutoff?: string) => kevRecords(entries, { keys, cutoff });

  it("writes an entry of the vendor as a source: the catalog's words, the page of the CVE, the day it was added", () => {
    const { records, omitted } = run([entry()]);

    expect(omitted).toEqual({});
    expect(records).toEqual([
      {
        url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1001",
        title: "CVE-2026-1001: Brise Networks BriseOS Authentication Bypass Vulnerability",
        text:
          "CISA Known Exploited Vulnerabilities Catalog (cisa.gov). CVE: CVE-2026-1001. " +
          "Vendor or project: Brise Networks. Product: BriseOS. " +
          "Vulnerability name: Brise Networks BriseOS Authentication Bypass Vulnerability. " +
          "Date added to the catalog: 2026-10-20. " +
          "Description: BriseOS contains an authentication bypass that lets a remote attacker log in. " +
          "Required action: Apply mitigations per vendor instructions or discontinue use of the product. " +
          "Due date: 2026-11-10. Known use in ransomware campaigns: Known.",
        publishedAt: "2026-10-20",
      },
    ]);
  });

  it("does not write a full stop twice, and leaves out a field the catalog does not give", () => {
    const { records } = run([
      entry({ shortDescription: "It is exploited.", dueDate: "", knownRansomwareCampaignUse: "" }),
    ]);

    expect(records[0].text).toContain("Description: It is exploited. Required action:");
    expect(records[0].text).not.toContain("..");
    expect(records[0].text).not.toContain("Due date");
    expect(records[0].text).not.toContain("ransomware");
  });

  it("takes the entries of the vendor only, by the whole name", () => {
    const { records } = run([
      entry({ cveID: "CVE-2026-2001", vendorProject: "Brise" }),
      entry({ cveID: "CVE-2026-2002", vendorProject: "Brise Networks Staffing" }),
      entry({ cveID: "CVE-2026-2003", vendorProject: "BRISE-networks" }),
    ]);

    expect(records.map((record) => record.title.slice(0, 13))).toEqual(["CVE-2026-2003"]);
  });

  it("gives the newest first, and for one day the greater CVE id first", () => {
    const { records } = run([
      entry({ cveID: "CVE-2026-0001", dateAdded: "2026-10-01" }),
      entry({ cveID: "CVE-2026-0002", dateAdded: "2026-10-05" }),
      entry({ cveID: "CVE-2026-0003", dateAdded: "2026-10-05" }),
    ]);

    expect(records.map((record) => record.url.slice(-13))).toEqual([
      "CVE-2026-0003",
      "CVE-2026-0002",
      "CVE-2026-0001",
    ]);
  });

  it("gives the greater CVE id first for one day by its number, not by its letters", () => {
    const { records } = run([
      entry({ cveID: "CVE-2026-999", dateAdded: "2026-10-05" }),
      entry({ cveID: "CVE-2026-1001", dateAdded: "2026-10-05" }),
    ]);

    expect(records.map((record) => record.url.split("/").pop())).toEqual([
      "CVE-2026-1001",
      "CVE-2026-999",
    ]);
  });

  it("titles an entry that has no name by its CVE id alone", () => {
    const { records } = run([entry({ vulnerabilityName: "" })]);

    expect(records[0].title).toBe("CVE-2026-1001");
  });

  it("leaves out an entry added before the cutoff and counts it, and keeps one added on the day", () => {
    const { records, omitted } = run(
      [
        entry({ cveID: "CVE-2024-0001", dateAdded: "2024-09-30" }),
        entry({ cveID: "CVE-2024-0002", dateAdded: "2024-10-01" }),
        entry({ cveID: "CVE-2025-0003", dateAdded: "2025-03-01" }),
      ],
      "2024-10-01",
    );

    expect(records.map((record) => record.url.slice(-13))).toEqual([
      "CVE-2025-0003",
      "CVE-2024-0002",
    ]);
    expect(omitted).toEqual({ old: 1 });
  });

  it("gives the newest five and counts the others", () => {
    const entries = Array.from({ length: 8 }, (_, index) =>
      entry({ cveID: `CVE-2026-${1000 + index}`, dateAdded: `2026-10-0${index + 1}` }),
    );

    const { records, omitted } = run(entries);

    expect(MAX_RECORDS.kev).toBe(5);
    expect(records).toHaveLength(5);
    expect(records[0].url.endsWith("CVE-2026-1007")).toBe(true);
    expect(records[4].url.endsWith("CVE-2026-1003")).toBe(true);
    expect(omitted).toEqual({ more: 3 });
  });

  it("gives nothing for a vendor with no entry", () => {
    expect(run([entry({ vendorProject: "Other" })])).toEqual({ records: [], omitted: {} });
  });
});
