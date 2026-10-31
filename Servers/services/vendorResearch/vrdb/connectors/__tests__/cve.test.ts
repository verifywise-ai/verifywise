/**
 * The CVE Program's records as a list read by its changes (M2 Task 8, Ruling 8 of the M2 plan):
 * the end-of-day releases of cvelistV5 after the cursor, asked of the GitHub API by tag, the delta
 * zip of each day, and the records a sync keeps. The records are written from the CVE record format
 * 5.x (`cveMetadata`, `containers.cna`, `containers.adp`); no test reaches the network.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { type WriterEntry, writeZip } from "../../__tests__/helpers/zipWriter";
import type { ParsedRecord } from "../../types";
import { ZipError } from "../../zip";
import {
  CVE_MAX_BYTES,
  CVE_MAX_DAYS_PER_SYNC,
  CVE_RELEASE_API,
  cveConnector,
  cveWindowStart,
  isCveEntry,
  parseCveRecord,
} from "../cve";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  FeedWithoutFileError,
  NotTheListError,
} from "../types";

const NOW = new Date("2026-10-31T03:00:00Z");
const WINDOW = { from: "2024-10-31" };
const CNA = "00000000-0000-4000-8000-000000000001";
const ADP = "00000000-0000-4000-8000-000000000002";

type MetricKey = "cvssV4_0" | "cvssV3_1" | "cvssV3_0" | "cvssV2_0";

const metric = (score: number, key: MetricKey = "cvssV3_1") => ({
  format: "CVSS",
  [key]: {
    version: key.slice("cvssV".length).replace("_", "."),
    vectorString: "AV:N/AC:L/Au:N/C:C/I:C/A:C",
    baseScore: score,
    ...(key === "cvssV2_0" ? {} : { baseSeverity: score >= 9 ? "CRITICAL" : "HIGH" }),
  },
});

interface Published {
  id: string;
  published?: string;
  metrics?: unknown[];
  adpMetrics?: unknown[];
  affected?: Array<{ vendor: string; product: string }>;
  description?: string;
}

/** A PUBLISHED record of the CVE record format 5.1. */
function published(options: Published) {
  return {
    dataType: "CVE_RECORD",
    dataVersion: "5.1",
    cveMetadata: {
      cveId: options.id,
      assignerOrgId: CNA,
      assignerShortName: "example",
      state: "PUBLISHED",
      dateReserved: "2026-10-01T00:00:00.000Z",
      datePublished: `${options.published ?? "2026-10-29"}T14:00:00.000Z`,
      dateUpdated: "2026-10-30T09:00:00.000Z",
    },
    containers: {
      cna: {
        providerMetadata: { orgId: CNA, shortName: "example" },
        descriptions: [
          {
            lang: "en",
            value:
              options.description ??
              "A heap overflow in the example service lets a remote attacker run code.",
          },
        ],
        affected: (
          options.affected ?? [{ vendor: "Example Corp", product: "Example Gateway" }]
        ).map((item) => ({ ...item, versions: [{ version: "1.0", status: "affected" }] })),
        references: [{ url: "https://vendor.example/advisories/1" }],
        ...(options.metrics === undefined ? {} : { metrics: options.metrics }),
      },
      ...(options.adpMetrics === undefined
        ? {}
        : {
            adp: [
              {
                providerMetadata: { orgId: ADP, shortName: "CISA-ADP" },
                title: "CISA ADP Vulnrichment",
                metrics: options.adpMetrics,
              },
            ],
          }),
    },
  };
}

/** A REJECTED record: a CNA container with the reason, and no affected products. */
function rejected(id: string, day = "2026-10-30") {
  return {
    dataType: "CVE_RECORD",
    dataVersion: "5.1",
    cveMetadata: {
      cveId: id,
      assignerOrgId: CNA,
      state: "REJECTED",
      dateReserved: "2026-10-01T00:00:00.000Z",
      dateRejected: `${day}T10:00:00.000Z`,
      dateUpdated: `${day}T10:00:00.000Z`,
    },
    containers: {
      cna: {
        providerMetadata: { orgId: CNA },
        rejectedReasons: [{ lang: "en", value: "This candidate is a duplicate of CVE-2026-0999." }],
      },
    },
  };
}

const critical = (id: string, published_?: string) =>
  published({ id, metrics: [metric(9.8)], published: published_ });

const asRecord = (value: ParsedRecord | null | "error"): ParsedRecord => {
  if (value === null || value === "error") throw new Error(`not a record: ${value}`);
  return value;
};

// ---------------------------------------------------------------------------
// The GitHub API and the downloads of cvelistV5's releases
// ---------------------------------------------------------------------------

const tagOf = (day: string) => `cve_${day}_at_end_of_day`;
const assetOf = (day: string) => `${day}_delta_CVEs_at_end_of_day.zip`;
const downloadOf = (day: string) =>
  `https://github.com/CVEProject/cvelistV5/releases/download/${tagOf(day)}/${assetOf(day)}`;

/** The delta zip of a day: each record under deltaCves/, named by its id, then the extra entries. */
const deltaOf = (records: unknown[], extra: WriterEntry[] = []): Buffer =>
  writeZip([
    ...records.map((record) => ({
      name: `deltaCves/${(record as { cveMetadata: { cveId: string } }).cveMetadata.cveId}.json`,
      data: JSON.stringify(record),
    })),
    ...extra,
  ]);

interface Day {
  zip?: Buffer;
  assets?: Array<{ name: string; browser_download_url: string }>;
  truncated?: boolean;
}

const answer = (url: string, body: string | Buffer, contentType: string, truncated = false) => ({
  notModified: false as const,
  url,
  status: 200 as const,
  contentType,
  body: Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"),
  truncated,
  etag: null,
  lastModified: null,
});

/** The releases of the days it is given, each with its delta and its notes; any other day has none. */
function github(days: Record<string, Day>) {
  const asked: Array<{ url: string; maxBytes: number; types: readonly string[] }> = [];
  const fetch: ConnectorFetch = async (url, _validators, limits) => {
    asked.push({ url, maxBytes: limits.maxBytes, types: limits.allowedContentTypes });
    if (url.startsWith(CVE_RELEASE_API)) {
      const tag = url.slice(CVE_RELEASE_API.length);
      const day = /^cve_(\d{4}-\d{2}-\d{2})_at_end_of_day$/.exec(tag)?.[1];
      const entry = day === undefined ? undefined : days[day];
      if (day === undefined || entry === undefined) {
        throw new FetchError("not_found", undefined, { status: 404 });
      }
      const assets = entry.assets ?? [
        { name: assetOf(day), browser_download_url: downloadOf(day) },
        {
          name: "release_notes.md",
          browser_download_url: `https://github.com/CVEProject/cvelistV5/releases/download/${tag}/release_notes.md`,
        },
      ];
      const release = {
        tag_name: tag,
        prerelease: false,
        assets: assets.map((asset, index) => ({
          id: index + 1,
          size: 11_131_890,
          content_type: "application/zip",
          ...asset,
        })),
      };
      return answer(url, JSON.stringify(release), "application/json; charset=utf-8");
    }
    const day = Object.keys(days).find((key) => url === downloadOf(key));
    if (day === undefined) throw new FetchError("not_found", undefined, { status: 404 });
    const { zip, truncated } = days[day];
    return answer(url, zip ?? deltaOf([]), "application/octet-stream", truncated);
  };
  return { fetch, asked };
}

const daysOf = (result: Awaited<ReturnType<typeof cveConnector.download>>) =>
  result === "unchanged" ? result : result.map(({ day }) => day);

const releaseUrls = (asked: Array<{ url: string }>) =>
  asked.filter(({ url }) => url.startsWith(CVE_RELEASE_API)).map(({ url }) => url);

// ---------------------------------------------------------------------------

describe("parseCveRecord", () => {
  it("keeps a critical record inside the window and a rejected one; drops the rest", () => {
    expect(parseCveRecord(critical("CVE-2026-1001"), WINDOW)).toEqual({
      sourceRecordId: "CVE-2026-1001",
      recordType: "vulnerability",
      title: "CVE-2026-1001: critical vulnerability (CVSS 9.8)",
      summary:
        "CVE Program (cve.org). CVE: CVE-2026-1001. Published: 2026-10-29. Highest CVSS base score: 9.8 (CVSS 3.1). Affected: Example Corp Example Gateway. Description: A heap overflow in the example service lets a remote attacker run code.",
      url: "https://www.cve.org/CVERecord?id=CVE-2026-1001",
      identifiers: { cveID: "CVE-2026-1001", state: "PUBLISHED" },
      matchKeys: ["cve:examplecorp", "cve:example"],
      publishedAt: "2026-10-29",
      sourceUpdatedAt: "2026-10-30T09:00:00.000Z",
    });
    expect(parseCveRecord(rejected("CVE-2026-1003"), WINDOW)).toEqual({
      sourceRecordId: "CVE-2026-1003",
      recordType: "vulnerability",
      title: "CVE-2026-1003: rejected",
      summary:
        "CVE Program (cve.org). CVE: CVE-2026-1003. Rejected: 2026-10-30. Reason: This candidate is a duplicate of CVE-2026-0999.",
      url: "https://www.cve.org/CVERecord?id=CVE-2026-1003",
      identifiers: { cveID: "CVE-2026-1003", state: "REJECTED" },
      matchKeys: [],
      publishedAt: null,
      sourceUpdatedAt: "2026-10-30T10:00:00.000Z",
      status: "rejected",
      // The copy dates the rejection by the CVE Program's own day, not by the day of the sync.
      statusChangedAt: "2026-10-30T10:00:00.000Z",
    });
    // A high score is not a critical one, and no score is none.
    expect(parseCveRecord(published({ id: "CVE-2026-1004", metrics: [metric(8.9)] }), WINDOW)).toBe(
      null,
    );
    expect(parseCveRecord(published({ id: "CVE-2026-1005" }), WINDOW)).toBeNull();
    // The window starts on its first day.
    expect(parseCveRecord(critical("CVE-2024-1006", "2024-10-30"), WINDOW)).toBeNull();
    expect(parseCveRecord(critical("CVE-2024-1007", "2024-10-31"), WINDOW)).not.toBeNull();
  });

  it("gives a rejected record no day of its rejection when the record states none it can read", () => {
    for (const dateRejected of [undefined, "", "not a date", 20261030]) {
      const record = rejected("CVE-2026-1008");
      const meta: Record<string, unknown> = { ...record.cveMetadata, dateRejected };
      if (dateRejected === undefined) delete meta.dateRejected;

      const parsed = asRecord(parseCveRecord({ ...record, cveMetadata: meta }, WINDOW));

      expect(parsed.status).toBe("rejected");
      expect(parsed).not.toHaveProperty("statusChangedAt");
    }
  });

  it("takes the highest base score of any metric of the CNA and of every ADP", () => {
    const fromAdp = asRecord(
      parseCveRecord(
        published({ id: "CVE-2026-1010", metrics: [metric(7.5)], adpMetrics: [metric(9.1)] }),
        WINDOW,
      ),
    );
    expect(fromAdp.title).toBe("CVE-2026-1010: critical vulnerability (CVSS 9.1)");
    expect(fromAdp.summary).toContain("Highest CVSS base score: 9.1 (CVSS 3.1).");

    const versions = asRecord(
      parseCveRecord(
        published({
          id: "CVE-2026-1011",
          metrics: [metric(8.1, "cvssV3_0"), metric(9.3, "cvssV4_0"), metric(6.4, "cvssV2_0")],
        }),
        WINDOW,
      ),
    );
    expect(versions.summary).toContain("Highest CVSS base score: 9.3 (CVSS 4.0).");
    // A score that is no number of 0 to 10 is no score.
    expect(
      parseCveRecord(
        published({
          id: "CVE-2026-1012",
          metrics: [
            { cvssV3_1: { baseScore: "9.8" } },
            { cvssV3_1: { baseScore: 98 } },
            { other: { type: "text", content: { score: 10 } } },
          ],
        }),
        WINDOW,
      ),
    ).toBeNull();
  });

  it("keys a record by each vendor it affects, not n/a, once each", () => {
    const record = asRecord(
      parseCveRecord(
        published({
          id: "CVE-2026-1013",
          metrics: [metric(10)],
          affected: [
            { vendor: "Example Corp", product: "Gateway" },
            { vendor: "n/a", product: "Some library" },
            { vendor: "N/A", product: "n/a" },
            { vendor: "example corp", product: "Manager" },
            { vendor: "Other Vendor GmbH", product: "Router" },
          ],
        }),
        WINDOW,
      ),
    );
    expect(record.matchKeys).toEqual([
      "cve:examplecorp",
      "cve:example",
      "cve:othervendorgmbh",
      "cve:othervendor",
    ]);
    expect(record.summary).toContain(
      "Affected: Example Corp Gateway, Some library, example corp Manager, Other Vendor GmbH Router.",
    );
  });

  it("keys a record by the vendors an ADP adds", () => {
    const record = published({ id: "CVE-2026-1014", metrics: [metric(9.8)] });
    const withAdp = {
      ...record,
      containers: {
        ...record.containers,
        adp: [
          {
            providerMetadata: { orgId: ADP, shortName: "CISA-ADP" },
            affected: [{ vendor: "Example Systems", product: "Gateway", cpes: [] }],
          },
        ],
      },
    };
    expect(asRecord(parseCveRecord(withAdp, WINDOW)).matchKeys).toEqual([
      "cve:examplecorp",
      "cve:example",
      "cve:examplesystems",
    ]);
  });

  it("shows at most five affected products and 1,200 characters of the description", () => {
    const record = asRecord(
      parseCveRecord(
        published({
          id: "CVE-2026-1015",
          metrics: [metric(9)],
          affected: Array.from({ length: 7 }, (_, index) => ({
            vendor: "Example",
            product: `Product ${index + 1}`,
          })),
          description: "x".repeat(1300),
        }),
        WINDOW,
      ),
    );
    expect(record.summary).toContain(
      `Affected: Example Product 1, Example Product 2, Example Product 3, Example Product 4, Example Product 5. Description: ${"x".repeat(1200)}.`,
    );
    expect(record.matchKeys).toEqual(["cve:example"]);
  });

  it("is an error for what is not a CVE record of a state it knows", () => {
    const record = critical("CVE-2026-1016");
    expect(parseCveRecord(null, WINDOW)).toBe("error");
    expect(parseCveRecord("CVE-2026-1016", WINDOW)).toBe("error");
    expect(parseCveRecord({}, WINDOW)).toBe("error");
    expect(
      parseCveRecord(
        { ...record, cveMetadata: { ...record.cveMetadata, cveId: "CVE-26-1" } },
        WINDOW,
      ),
    ).toBe("error");
    expect(
      parseCveRecord(
        { ...record, cveMetadata: { ...record.cveMetadata, state: "RESERVED" } },
        WINDOW,
      ),
    ).toBe("error");
    expect(parseCveRecord({ ...record, containers: {} }, WINDOW)).toBe("error");
  });

  it("starts the window 24 months before the day", () => {
    expect(cveWindowStart(NOW)).toBe("2024-10-31");
    expect(cveWindowStart(new Date("2026-03-01T23:59:00Z"))).toBe("2024-03-01");
  });
});

describe("isCveEntry", () => {
  it("takes an entry named as a CVE record, never one with ..", () => {
    expect(isCveEntry("deltaCves/CVE-2026-1001.json")).toBe(true);
    expect(isCveEntry("cves/2026/1xxx/CVE-2026-1001.json")).toBe(true);
    expect(isCveEntry("CVE-2026-100001.json")).toBe(true);
    expect(isCveEntry("../CVE-2026-1001.json")).toBe(false);
    expect(isCveEntry("deltaCves/../CVE-2026-1001.json")).toBe(false);
    expect(isCveEntry("deltaCves/delta.json")).toBe(false);
    expect(isCveEntry("deltaCves/CVE-2026-1001.json.bak")).toBe(false);
    expect(isCveEntry("deltaCves/CVE-2026-1.json")).toBe(false);
  });
});

describe("cveConnector.download", () => {
  it("reads the end-of-day releases after the cursor, oldest first, at most seven", async () => {
    const days = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`2026-10-${21 + index}`, {}]),
    );
    const { fetch, asked } = github(days);

    const result = await cveConnector.download(fetch, { day: "2026-10-20" }, NOW);

    const read = Array.from({ length: 7 }, (_, index) => `2026-10-${21 + index}`);
    expect(CVE_MAX_DAYS_PER_SYNC).toBe(7);
    expect(daysOf(result)).toEqual(read);
    expect(releaseUrls(asked)).toEqual(read.map((day) => `${CVE_RELEASE_API}${tagOf(day)}`));
    expect(asked.map(({ url }) => url).filter((url) => !url.startsWith(CVE_RELEASE_API))).toEqual(
      read.map(downloadOf),
    );
  });

  it("a first sync starts at yesterday", async () => {
    const { fetch, asked } = github({
      "2026-10-30": { zip: deltaOf([critical("CVE-2026-1001")]) },
    });

    const result = await cveConnector.download(fetch, null, NOW);

    expect(daysOf(result)).toEqual(["2026-10-30"]);
    expect(asked.map(({ url }) => url)).toEqual([
      `${CVE_RELEASE_API}cve_2026-10-30_at_end_of_day`,
      downloadOf("2026-10-30"),
    ]);
  });

  it("reads nothing when the cursor is at yesterday", async () => {
    const { fetch, asked } = github({ "2026-10-30": {} });

    expect(await cveConnector.download(fetch, { day: "2026-10-30" }, NOW)).toBe("unchanged");
    expect(await cveConnector.download(fetch, { day: "2026-11-02" }, NOW)).toBe("unchanged");
    expect(asked).toEqual([]);
  });

  it("a release not yet out for yesterday ends the days read; one missing for an earlier day fails", async () => {
    const { fetch } = github({ "2026-10-29": {} });
    expect(daysOf(await cveConnector.download(fetch, { day: "2026-10-28" }, NOW))).toEqual([
      "2026-10-29",
    ]);
    expect(await cveConnector.download(fetch, { day: "2026-10-29" }, NOW)).toBe("unchanged");

    const gap = github({ "2026-10-29": {}, "2026-10-30": {} });
    await expect(
      cveConnector.download(gap.fetch, { day: "2026-10-27" }, NOW),
    ).rejects.toMatchObject({ name: "FetchError", reason: "not_found" });
  });

  it("a release whose asset is missing fails", async () => {
    const { fetch } = github({
      "2026-10-30": {
        assets: [
          {
            name: "release_notes.md",
            browser_download_url: `https://github.com/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/release_notes.md`,
          },
          // The baseline's name, or a doubled .zip, is not the day's delta.
          {
            name: "2026-10-30_all_CVEs_at_midnight.zip.zip",
            browser_download_url: `https://github.com/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/2026-10-30_all_CVEs_at_midnight.zip.zip`,
          },
          {
            name: `${assetOf("2026-10-30")}.zip`,
            browser_download_url: `${downloadOf("2026-10-30")}.zip`,
          },
        ],
      },
    });
    await expect(cveConnector.download(fetch, null, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );
  });

  it("a release that is not a release of assets names no file", async () => {
    const notJson: ConnectorFetch = async (url) =>
      answer(url, "<html>rate limited</html>", "application/json");
    await expect(cveConnector.download(notJson, null, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );
    const noAssets: ConnectorFetch = async (url) =>
      answer(url, JSON.stringify({ message: "Not Found" }), "application/json");
    await expect(cveConnector.download(noAssets, null, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );
  });

  it("an asset on another host is not followed", async () => {
    const elsewhere = [
      `https://downloads.example/${assetOf("2026-10-30")}`,
      `https://downloads.example/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `https://github.com.example/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `https://someone@github.com/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `https://:secret@github.com/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `http://github.com/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `https://github.com:8443/CVEProject/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      `https://github.com/someone/cvelistV5/releases/download/${tagOf("2026-10-30")}/${assetOf("2026-10-30")}`,
      "not an address",
    ];
    for (const address of elsewhere) {
      const { fetch, asked } = github({
        "2026-10-30": { assets: [{ name: assetOf("2026-10-30"), browser_download_url: address }] },
      });
      await expect(cveConnector.download(fetch, null, NOW)).rejects.toBeInstanceOf(
        FeedWithoutFileError,
      );
      expect(asked.map(({ url }) => url)).toEqual([`${CVE_RELEASE_API}${tagOf("2026-10-30")}`]);
    }
  });

  it("asks for the release as JSON and for the delta within its limits", async () => {
    const { fetch, asked } = github({ "2026-10-30": {} });

    await cveConnector.download(fetch, null, NOW);

    expect(asked[0]).toEqual({
      url: `${CVE_RELEASE_API}${tagOf("2026-10-30")}`,
      maxBytes: 1_048_576,
      types: ["application/json"],
    });
    expect(CVE_MAX_BYTES).toBe(104_857_600);
    expect(asked[1]).toEqual({
      url: downloadOf("2026-10-30"),
      maxBytes: CVE_MAX_BYTES,
      types: ["application/zip", "application/octet-stream"],
    });
  });

  it("keeps the entries a sync applies, and those it cannot read", async () => {
    const zip = deltaOf(
      [
        critical("CVE-2026-1001"),
        published({ id: "CVE-2026-1004", metrics: [metric(5.3)] }),
        rejected("CVE-2026-1003"),
        critical("CVE-2023-1020", "2023-01-05"),
      ],
      [{ name: "deltaCves/CVE-2026-1021.json", data: "{not json" }],
    );
    const { fetch } = github({ "2026-10-30": { zip } });

    const result = await cveConnector.download(fetch, null, NOW);

    if (result === "unchanged") throw new Error("expected a day");
    const [{ snapshot }] = result;
    expect(snapshot.bytes).toBe(zip.length);
    expect(snapshot.bodies).toHaveLength(3);
    const parsed = cveConnector.parse(snapshot);
    expect(parsed.records.map((record) => record.sourceRecordId)).toEqual([
      "CVE-2026-1001",
      "CVE-2026-1003",
    ]);
    expect(parsed.errors).toBe(1);
    expect(parsed.root).not.toBeNull();
  });

  it("an entry named ../x.json is skipped", async () => {
    const zip = deltaOf(
      [critical("CVE-2026-1001")],
      [
        { name: "../CVE-2026-1002.json", data: JSON.stringify(critical("CVE-2026-1002")) },
        { name: "../x.json", data: "{not json" },
      ],
    );
    const { fetch } = github({ "2026-10-30": { zip } });

    const result = await cveConnector.download(fetch, null, NOW);

    if (result === "unchanged") throw new Error("expected a day");
    const parsed = cveConnector.parse(result[0].snapshot);
    expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["CVE-2026-1001"]);
    expect(parsed.errors).toBe(0);
  });

  it("a day without changes is an empty delta", async () => {
    const { fetch } = github({ "2026-10-30": { zip: deltaOf([]) } });

    const result = await cveConnector.download(fetch, null, NOW);

    if (result === "unchanged") throw new Error("expected a day");
    expect(cveConnector.parse(result[0].snapshot)).toEqual({
      records: [],
      errors: 0,
      sourceVersion: null,
      root: "cves",
    });
  });

  it("a delta whose files are no CVE records is not the list", async () => {
    const zip = writeZip([{ name: "deltaCves/README.txt", data: "The records moved." }]);
    const { fetch } = github({ "2026-10-30": { zip } });

    await expect(cveConnector.download(fetch, null, NOW)).rejects.toBeInstanceOf(NotTheListError);
  });

  it("a delta that is no zip, or that was cut at its limit, fails", async () => {
    const page = github({ "2026-10-30": { zip: Buffer.from("<html>Not a zip</html>") } });
    const notZip = cveConnector.download(page.fetch, null, NOW);
    await expect(notZip).rejects.toBeInstanceOf(ZipError);
    await expect(notZip).rejects.toMatchObject({ code: "not_zip" });
    const cut = github({
      "2026-10-30": { zip: deltaOf([critical("CVE-2026-1001")]), truncated: true },
    });
    await expect(cveConnector.download(cut.fetch, null, NOW)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });
});
