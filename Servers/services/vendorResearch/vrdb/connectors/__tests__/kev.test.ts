/**
 * The KEV connector (spec D4.1): the CISA catalog as records of the vendor risk database. The
 * fixture is written from the catalog's schema, with fictional vendors.
 */
import fs from "fs";
import path from "path";
import { KEV_URL, type KevEntry, parseKev } from "../../../records/kev";
import { kevConnector, kevSourceOf } from "../kev";
import type { ConnectorFetch } from "../types";

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures/kev.json"), "utf8");
const snapshotOf = (body: string) => ({
  bodies: [body],
  etag: null,
  lastModified: null,
  bytes: body.length,
});
const parse = (body: string = FIXTURE) => kevConnector.parse(snapshotOf(body));

/** The free-text fields of an entry: the ones the catalog may pad with white space. */
const FREE_TEXT_FIELDS = [
  "vendorProject",
  "product",
  "vulnerabilityName",
  "shortDescription",
  "requiredAction",
  "dueDate",
  "knownRansomwareCampaignUse",
] as const;

describe("kevConnector.parse", () => {
  it("parses an entry into a record", () => {
    const { records, errors, root } = parse();
    const record = records.find((item) => item.sourceRecordId === "CVE-2026-31337");

    expect(errors).toBe(0);
    expect(root).toBe("vulnerabilities");
    expect(records).toHaveLength(3);
    expect(record).toMatchObject({
      sourceRecordId: "CVE-2026-31337",
      recordType: "vulnerability",
      title: "CVE-2026-31337: Acme Analytics Insight Server Authentication Bypass Vulnerability",
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-31337",
      publishedAt: "2026-09-14",
      sourceUpdatedAt: null,
      matchKeys: ["kev:acmeanalytics"],
      identifiers: {
        cveID: "CVE-2026-31337",
        vendorProject: "Acme Analytics",
        product: "Insight Server",
      },
    });
    expect(record?.summary).toBe(
      "CISA Known Exploited Vulnerabilities Catalog (cisa.gov). CVE: CVE-2026-31337. " +
        "Vendor or project: Acme Analytics. Product: Insight Server. " +
        "Vulnerability name: Acme Analytics Insight Server Authentication Bypass Vulnerability. " +
        "Date added to the catalog: 2026-09-14. " +
        "Description: Acme Analytics Insight Server contains an authentication bypass that lets a remote attacker read reports. " +
        "Required action: Apply mitigations per vendor instructions or discontinue use of the product if mitigations are unavailable. " +
        "Due date: 2026-10-05. Known use in ransomware campaigns: Unknown.",
    );
    expect(record?.summary).not.toMatch(/as of|Lookup note/i);
  });

  it("ignores fields it does not know", () => {
    const catalog = JSON.parse(FIXTURE);
    catalog.vulnerabilities[0].someFutureField = { nested: true };
    catalog.someFutureList = [1, 2, 3];

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(0);
    expect(records).toHaveLength(3);
  });

  it("leaves out forensicTriage, a field of the real catalog that no record uses", () => {
    const catalog = JSON.parse(FIXTURE);
    const triaged = catalog.vulnerabilities.filter(
      (item: Record<string, unknown>) => typeof item.forensicTriage === "string",
    );
    for (const item of catalog.vulnerabilities) delete item.forensicTriage;

    const parsed = parse();

    expect(triaged.length).toBeGreaterThan(0);
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(3);
    expect(parsed).toEqual(parse(JSON.stringify(catalog)));
    expect(Object.keys(parsed.records[0].identifiers)).toEqual([
      "cveID",
      "vendorProject",
      "product",
    ]);
  });

  it.each(FREE_TEXT_FIELDS)("trims the white space around %s", (field) => {
    const catalog = JSON.parse(FIXTURE);
    const original: string = catalog.vulnerabilities[0][field];
    catalog.vulnerabilities[0][field] = ` \t${original}\n `;

    const [entry] = parseKev(catalog);

    expect(entry[field]).toBe(original);
  });

  it("gives the same records for a catalog that pads its text with white space", () => {
    const catalog = JSON.parse(FIXTURE);
    for (const item of catalog.vulnerabilities) {
      for (const field of FREE_TEXT_FIELDS) item[field] = ` \t${item[field]}\n `;
    }

    const padded = parse(JSON.stringify(catalog));

    expect(padded).toEqual(parse());
    expect(padded.records[0].title).toBe(
      "CVE-2026-31337: Acme Analytics Insight Server Authentication Bypass Vulnerability",
    );
    expect(padded.records[0].identifiers.product).toBe("Insight Server");
  });

  it("counts one error when the count of the catalog is not the length of its list", () => {
    const catalog = JSON.parse(FIXTURE);
    catalog.vulnerabilities.pop();

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(1);
    expect(records).toHaveLength(2);
  });

  it("counts one error when the list is longer than the count of the catalog", () => {
    const catalog = JSON.parse(FIXTURE);
    catalog.count = 2;

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(1);
    expect(records).toHaveLength(3);
  });

  it("adds the error of the count to the errors of the entries", () => {
    const catalog = JSON.parse(FIXTURE);
    catalog.vulnerabilities.push(null);

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(2);
    expect(records).toHaveLength(3);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["text", "3"],
  ])("does not count a catalog whose count is %s", (_label, count) => {
    const catalog = JSON.parse(FIXTURE);
    catalog.vulnerabilities.pop();
    catalog.count = count;

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(0);
    expect(records).toHaveLength(2);
  });

  it("counts an entry without cveID as an error", () => {
    const catalog = JSON.parse(FIXTURE);
    const { cveID: _cveID, ...withoutId } = catalog.vulnerabilities[0];
    catalog.vulnerabilities.push(withoutId, null);
    catalog.count = catalog.vulnerabilities.length;

    const { records, errors } = parse(JSON.stringify(catalog));

    expect(errors).toBe(2);
    expect(records).toHaveLength(3);
  });

  it("reads catalogVersion as the source version", () => {
    expect(parse().sourceVersion).toBe("2026.10.29");
  });

  it("gives no root, and an error, for a body that is not the catalog", () => {
    expect(parse("<html><body>Maintenance</body></html>")).toEqual({
      records: [],
      errors: 1,
      sourceVersion: null,
      root: null,
    });
    expect(parse('{"title":"x"}')).toMatchObject({ records: [], errors: 1, root: null });
  });
});

describe("kevSourceOf", () => {
  // The text of a record is what the model reads and quotes, word for word the catalog's. It moved
  // here from the per-run lookup, which no longer reads the catalog (M3 Part B).
  const entry = (over: Partial<KevEntry> = {}): KevEntry => ({
    cveID: "CVE-2026-1001",
    vendorProject: "Brise Networks",
    product: "BriseOS",
    vulnerabilityName: "Brise Networks BriseOS Authentication Bypass Vulnerability",
    dateAdded: "2026-10-20",
    shortDescription:
      "BriseOS contains an authentication bypass that lets a remote attacker log in.",
    requiredAction: "Apply mitigations per vendor instructions or discontinue use of the product.",
    dueDate: "2026-11-10",
    knownRansomwareCampaignUse: "Known",
    ...over,
  });

  it("writes an entry as a source: the catalog's words and the page of the CVE", () => {
    expect(kevSourceOf(entry())).toEqual({
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
    });
  });

  it("does not write a full stop twice, and leaves out a field the catalog does not give", () => {
    const { text } = kevSourceOf(
      entry({ shortDescription: "It is exploited.", dueDate: "", knownRansomwareCampaignUse: "" }),
    );

    expect(text).toContain("Description: It is exploited. Required action:");
    expect(text).not.toContain("..");
    expect(text).not.toContain("Due date");
    expect(text).not.toContain("ransomware");
  });

  it("titles an entry that has no name by its CVE id alone", () => {
    expect(kevSourceOf(entry({ vulnerabilityName: "" })).title).toBe("CVE-2026-1001");
  });
});

describe("kevConnector.version", () => {
  it("is 2, because the trim and the count rule change what a file parses to", () => {
    expect(kevConnector.version).toBe(2);
  });
});

describe("kevConnector.download", () => {
  it("download sends the validators and answers unchanged on 304", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return { notModified: true, url: args[0] };
    };
    const validators = { etag: '"v1"', lastModified: "Wed, 29 Oct 2026 10:00:00 GMT" };

    await expect(kevConnector.download(fetch, validators)).resolves.toBe("unchanged");
    expect(calls).toEqual([
      [
        KEV_URL,
        validators,
        {
          maxBytes: 8 * 1024 * 1024,
          allowedContentTypes: ["application/json"],
          totalTimeoutMs: 60_000,
        },
      ],
    ]);
  });

  it("keeps the body and the new validators of a 200, and no address", async () => {
    const fetch: ConnectorFetch = async (url) => ({
      notModified: false,
      url,
      status: 200,
      contentType: "application/json",
      body: Buffer.from(FIXTURE),
      truncated: false,
      etag: '"v2"',
      lastModified: "Thu, 30 Oct 2026 10:00:00 GMT",
    });

    const snapshot = await kevConnector.download(fetch, {});

    expect(snapshot).toEqual({
      bodies: [FIXTURE],
      etag: '"v2"',
      lastModified: "Thu, 30 Oct 2026 10:00:00 GMT",
      bytes: Buffer.byteLength(FIXTURE),
    });
  });

  it("refuses a body cut at its limit", async () => {
    const fetch: ConnectorFetch = async (url) => ({
      notModified: false,
      url,
      status: 200,
      contentType: "application/json",
      body: Buffer.from("{"),
      truncated: true,
      etag: null,
      lastModified: null,
    });

    await expect(kevConnector.download(fetch, {})).rejects.toMatchObject({
      name: "BodyTooLargeError",
    });
  });
});
