import { parseKev } from "../kev";

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
