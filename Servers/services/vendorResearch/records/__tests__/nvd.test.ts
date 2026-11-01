import { Cve, nvdSourceOf, nvdUrl, nvdWindowStart, parseNvd } from "../nvd";

const NOW = new Date("2026-10-28T12:00:00Z");

const rawCve = (over: Record<string, unknown> = {}) => ({
  cve: {
    id: "CVE-2026-5001",
    published: "2026-10-01T10:15:00.000",
    descriptions: [
      { lang: "es", value: "Una falla." },
      { lang: "en", value: "A flaw in  Brise Gateway\nlets an attacker run code." },
    ],
    metrics: {
      cvssMetricV31: [
        { cvssData: { baseScore: 7.5, baseSeverity: "HIGH" } },
        { cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } },
      ],
    },
    ...over,
  },
});

const cve = (over: Partial<Cve> = {}): Cve => ({
  id: "CVE-2026-5001",
  published: "2026-10-01",
  score: 9.8,
  severity: "CRITICAL",
  description: "A flaw in Brise Gateway lets an attacker run code.",
  ...over,
});

describe("nvdWindowStart", () => {
  it("is 119 days back, so that the window is within the 120 days the API allows", () => {
    expect(nvdWindowStart(NOW)).toBe("2026-07-01");
  });

  it("is the cutoff when that is later", () => {
    expect(nvdWindowStart(NOW, "2026-09-15")).toBe("2026-09-15");
    expect(nvdWindowStart(NOW, "2025-01-01")).toBe("2026-07-01");
  });
});

describe("nvdUrl", () => {
  it("asks for the critical CVEs published in the window, for the products of one CPE vendor", () => {
    const url = new URL(nvdUrl("brise", NOW));

    expect(url.origin + url.pathname).toBe("https://services.nvd.nist.gov/rest/json/cves/2.0");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      virtualMatchString: "cpe:2.3:a:brise",
      cvssV3Severity: "CRITICAL",
      pubStartDate: "2026-07-01T00:00:00.000",
      pubEndDate: "2026-10-28T23:59:59.999",
      resultsPerPage: "50",
    });
  });
});

describe("parseNvd", () => {
  it("reads a critical CVE: the highest score of its metrics, the English description in one line", () => {
    expect(parseNvd({ vulnerabilities: [rawCve()] })).toEqual([cve()]);
  });

  it("keeps the NVD's status of a CVE it rejected, and nothing for any other status", () => {
    const parsed = parseNvd({
      vulnerabilities: [
        rawCve({ vulnStatus: "Rejected" }),
        rawCve({ id: "CVE-2026-5002", vulnStatus: "Analyzed" }),
        rawCve({ id: "CVE-2026-5003", vulnStatus: "rejected" }),
      ],
    });

    expect(parsed).toEqual([
      cve({ status: "rejected" }),
      cve({ id: "CVE-2026-5002" }),
      cve({ id: "CVE-2026-5003" }),
    ]);
  });

  it("takes the highest score among the metrics of any version", () => {
    const [parsed] = parseNvd({
      vulnerabilities: [
        rawCve({
          metrics: {
            cvssMetricV31: [{ cvssData: { baseScore: 7.5, baseSeverity: "HIGH" } }],
            cvssMetricV40: [{ cvssData: { baseScore: 9.3, baseSeverity: "CRITICAL" } }],
          },
        }),
      ],
    });

    expect(parsed.score).toBe(9.3);
    expect(parsed.severity).toBe("CRITICAL");
  });

  it("leaves out a CVE under 9.0, or with no score, no CVE id or no day", () => {
    const parsed = parseNvd({
      vulnerabilities: [
        rawCve({
          id: "CVE-2026-0001",
          metrics: { cvssMetricV31: [{ cvssData: { baseScore: 8.9 } }] },
        }),
        rawCve({ id: "CVE-2026-0002", metrics: {} }),
        rawCve({ id: "CVE-2026-0003", metrics: undefined }),
        rawCve({ id: "not-an-id" }),
        rawCve({ id: "CVE-2026-0004", published: "recently" }),
        rawCve({
          id: "CVE-2026-0005",
          metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9 } }] },
        }),
        null,
        {},
      ],
    });

    expect(parsed.map((item) => item.id)).toEqual(["CVE-2026-0005"]);
  });

  it("leaves out an id that is only part of a whole one", () => {
    const parsed = parseNvd({
      vulnerabilities: [
        rawCve({ id: "xCVE-2026-0001" }),
        rawCve({ id: "CVE-2026-0002x" }),
        rawCve({ id: "CVE-2026-0003" }),
      ],
    });

    expect(parsed.map((item) => item.id)).toEqual(["CVE-2026-0003"]);
  });

  it("passes over a list of metrics that is no list", () => {
    const [parsed] = parseNvd({
      vulnerabilities: [
        rawCve({
          metrics: {
            cvssMetricV2: "none",
            cvssMetricV30: 5,
            cvssMetricV31: null,
            cvssMetricV40: [{ cvssData: { baseScore: 9.5, baseSeverity: "CRITICAL" } }],
          },
        }),
      ],
    });

    expect(parsed.score).toBe(9.5);
  });

  it("has an empty description when the CVE has no English one", () => {
    const [parsed] = parseNvd({
      vulnerabilities: [rawCve({ descriptions: [{ lang: "es", value: "Una falla." }] })],
    });

    expect(parsed.description).toBe("");
  });

  it.each([null, undefined, "x", 4, [], {}, { vulnerabilities: "none" }])(
    "gives nothing for %p",
    (body) => {
      expect(parseNvd(body)).toEqual([]);
    },
  );
});

describe("nvdSourceOf", () => {
  it("writes a CVE as a source: the scores and the description of the NVD, the page of the CVE", () => {
    expect(nvdSourceOf(cve())).toEqual({
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-5001",
      title: "CVE-2026-5001: critical vulnerability (CVSS 9.8)",
      text:
        "National Vulnerability Database (nvd.nist.gov). CVE: CVE-2026-5001. " +
        "Published: 2026-10-01. CVSS base score: 9.8 (CRITICAL). " +
        "Description: A flaw in Brise Gateway lets an attacker run code.",
      publishedAt: "2026-10-01",
    });
  });

  it("writes a score of nine as 9.0, and leaves out a severity it does not have", () => {
    const record = nvdSourceOf(cve({ score: 9, severity: "", description: "" }));

    expect(record.text).toContain("CVSS base score: 9.0.");
    expect(record.title).toBe("CVE-2026-5001: critical vulnerability (CVSS 9.0)");
    expect(record.text).not.toContain("Description");
  });

  it("cuts a long description at 1,200 characters", () => {
    const record = nvdSourceOf(cve({ description: "x".repeat(3000) }));

    expect(record.text.endsWith(`Description: ${"x".repeat(1200)}.`)).toBe(true);
  });
});
