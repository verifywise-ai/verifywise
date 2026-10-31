/**
 * The KEV connector (spec D4.1): the CISA catalog as records of the vendor risk database. The
 * fixture is written from the catalog's schema, with fictional vendors.
 */
import fs from "fs";
import path from "path";
import { KEV_URL, kevRecords, parseKev } from "../../../records/kev";
import { kevConnector } from "../kev";
import type { ConnectorFetch } from "../types";

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures/kev.json"), "utf8");
const snapshotOf = (body: string) => ({
  bodies: [body],
  etag: null,
  lastModified: null,
  bytes: body.length,
});
const parse = (body: string = FIXTURE) => kevConnector.parse(snapshotOf(body));

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
    const today = kevRecords(parseKev(JSON.parse(FIXTURE)), { keys: ["acmeanalytics"] });
    expect(record?.summary).toBe(today.records[0].text);
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

  it("counts an entry without cveID as an error", () => {
    const catalog = JSON.parse(FIXTURE);
    const { cveID: _cveID, ...withoutId } = catalog.vulnerabilities[0];
    catalog.vulnerabilities.push(withoutId, null);

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
