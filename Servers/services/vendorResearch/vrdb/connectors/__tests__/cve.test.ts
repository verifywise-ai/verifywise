/**
 * The CVE Program's records as a list read by its changes (M2 Task 8, Ruling 8 of the M2 plan):
 * the end-of-day releases of cvelistV5 after the cursor, asked of the GitHub API by tag, the delta
 * zip of each day, and the records a sync keeps. The records are written from the CVE record format
 * 5.x (`cveMetadata`, `containers.cna`, `containers.adp`); no test reaches the network.
 *
 * A day applies the records it can read: the published ones the copy's filter leaves out are
 * handed on by id (`retired`), and a few entries that do not parse are counted (`skipped`) instead
 * of failing the day (Q7, `badRecord`). A day before yesterday that has no end-of-day release is
 * read from its last hourly release, found through the API's list of the day's tags (Q7,
 * `missingRelease`).
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { type WriterEntry, writeZip } from "../../__tests__/helpers/zipWriter";
import type { ParsedRecord } from "../../types";
import { ZipError } from "../../zip";
import {
  CVE_MAX_BYTES,
  CVE_MAX_DAYS_PER_SYNC,
  CVE_MAX_UNREADABLE,
  CVE_REFS_API,
  CVE_RELEASE_API,
  cveConnector,
  cveUnreadableAllowed,
  cveWindowStart,
  isCveEntry,
  parseCveRecord,
  readCveRecord,
} from "../cve";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  FeedWithoutFileError,
  NotTheListError,
  type Snapshot,
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
const downloadAt = (tag: string, asset: string) =>
  `https://github.com/CVEProject/cvelistV5/releases/download/${tag}/${asset}`;
const downloadOf = (day: string) => downloadAt(tagOf(day), assetOf(day));
/** The hourly release of a day, by the hour as its tag writes it: `2300Z`. */
const hourTagOf = (day: string, at: string) => `cve_${day}_${at}`;
const hourAssetOf = (day: string, at: string) => `${day}_delta_CVEs_at_${at}.zip`;
const hourDownloadOf = (day: string, at: string) =>
  downloadAt(hourTagOf(day, at), hourAssetOf(day, at));
/** The refs the API lists for tags of a day, by the hour (or any other end) each tag writes. */
const refsOf = (day: string, ...ends: string[]) => ends.map((end) => `refs/tags/cve_${day}_${end}`);

/** The delta zip of a day: each record under deltaCves/, named by its id, then the extra entries. */
const deltaOf = (records: unknown[], extra: WriterEntry[] = []): Buffer =>
  writeZip([
    ...records.map((record) => ({
      name: `deltaCves/${(record as { cveMetadata: { cveId: string } }).cveMetadata.cveId}.json`,
      data: JSON.stringify(record),
    })),
    ...extra,
  ]);

interface Release {
  zip?: Buffer;
  assets?: Array<{ name: string; browser_download_url: string }>;
  truncated?: boolean;
}

/** What the fake GitHub adds for the hourly fallback. */
interface Fallback {
  /** The hourly releases, by `<day>_<hour>`: `2026-10-28_2300Z`. */
  hourly?: Record<string, Release>;
  /** What the API lists for the tags of a day, by day: its refs, or 404. A day not given has none. */
  refs?: Record<string, string[] | 404>;
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

/**
 * The end-of-day releases of the days it is given, each with its delta and its notes; any other day
 * has none. `hourly` adds hourly releases: like the programme's, each lists the day's baseline
 * first, which is never served, then its delta. `refs` is what the API answers when asked for the
 * tags of a day.
 */
function github(days: Record<string, Release>, { hourly = {}, refs = {} }: Fallback = {}) {
  const asked: Array<{ url: string; maxBytes: number; types: readonly string[] }> = [];
  const releases = new Map<string, { asset: string; names: string[]; entry: Release }>();
  for (const [day, entry] of Object.entries(days)) {
    releases.set(tagOf(day), {
      asset: assetOf(day),
      names: [assetOf(day), "release_notes.md"],
      entry,
    });
  }
  for (const [key, entry] of Object.entries(hourly)) {
    const [day, at] = key.split("_");
    releases.set(hourTagOf(day, at), {
      asset: hourAssetOf(day, at),
      names: [`${day}_all_CVEs_at_midnight.zip.zip`, hourAssetOf(day, at), "release_notes.md"],
      entry,
    });
  }
  const fetch: ConnectorFetch = async (url, _validators, limits) => {
    asked.push({ url, maxBytes: limits.maxBytes, types: limits.allowedContentTypes });
    if (url.startsWith(CVE_REFS_API)) {
      const day = /^cve_(\d{4}-\d{2}-\d{2})_$/.exec(url.slice(CVE_REFS_API.length))?.[1];
      const listed = day === undefined ? [] : (refs[day] ?? []);
      if (listed === 404) throw new FetchError("not_found", undefined, { status: 404 });
      const list = listed.map((ref) => ({ ref, object: { type: "commit" } }));
      return answer(url, JSON.stringify(list), "application/json; charset=utf-8");
    }
    if (url.startsWith(CVE_RELEASE_API)) {
      const tag = url.slice(CVE_RELEASE_API.length);
      const found = releases.get(tag);
      if (found === undefined) throw new FetchError("not_found", undefined, { status: 404 });
      const assets =
        found.entry.assets ??
        found.names.map((name) => ({
          name,
          browser_download_url: downloadAt(tag, name),
        }));
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
    for (const [tag, { asset, entry }] of releases) {
      if (url !== downloadAt(tag, asset)) continue;
      return answer(url, entry.zip ?? deltaOf([]), "application/octet-stream", entry.truncated);
    }
    throw new FetchError("not_found", undefined, { status: 404 });
  };
  return { fetch, asked };
}

/**
 * The fake GitHub, except that the API answers the list of a day's tags as `onRefs` does.
 * `refsAsked` holds the addresses it was asked for.
 */
function withRefs(inner: ConnectorFetch, onRefs: (url: string) => ReturnType<ConnectorFetch>) {
  const refsAsked: string[] = [];
  const fetch: ConnectorFetch = (url, validators, limits) => {
    if (!url.startsWith(CVE_REFS_API)) return inner(url, validators, limits);
    refsAsked.push(url);
    return onRefs(url);
  };
  return { fetch, refsAsked };
}

const daysOf = (result: Awaited<ReturnType<typeof cveConnector.download>>) =>
  result === "unchanged" ? result : result.map(({ day }) => day);

const releaseUrls = (asked: Array<{ url: string }>) =>
  asked.filter(({ url }) => url.startsWith(CVE_RELEASE_API)).map(({ url }) => url);

const refsUrls = (asked: Array<{ url: string }>) =>
  asked.filter(({ url }) => url.startsWith(CVE_REFS_API)).map(({ url }) => url);

/** The end-of-day releases of the 29th and 30th, which a test of the 28th leaves as they are. */
const LATER_DAYS: Record<string, Release> = { "2026-10-29": {}, "2026-10-30": {} };
/** A cursor on the 27th: at NOW the sync reads the 28th, the 29th and 30th (yesterday). */
const FROM_THE_27TH = { day: "2026-10-27" };
/** The requests that look for the last hour of a day: its end-of-day release (missing), then its tags. */
const upToTheTags = (day: string) => [
  `${CVE_RELEASE_API}${tagOf(day)}`,
  `${CVE_REFS_API}cve_${day}_`,
];

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

  it("treats unknown and unspecified, as it treats n/a, as no vendor and no product", () => {
    const record = asRecord(
      parseCveRecord(
        published({
          id: "CVE-2026-1030",
          metrics: [metric(9.8)],
          affected: [
            { vendor: "Unknown", product: "Gateway" },
            { vendor: "Example Corp", product: "UNSPECIFIED" },
            { vendor: " unspecified ", product: "unknown" },
            { vendor: "UNKNOWN", product: "Library" },
            // Only the whole value is a placeholder: a name that holds the word is a name.
            { vendor: "Unknown Systems", product: "Router" },
          ],
        }),
        WINDOW,
      ),
    );
    expect(record.matchKeys).toEqual(["cve:examplecorp", "cve:example", "cve:unknownsystems"]);
    expect(record.summary).toContain(
      "Affected: Gateway, Example Corp, Library, Unknown Systems Router.",
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

  it("cuts a description and a rejection reason before a surrogate pair the limit would split", () => {
    // 1,199 units, then two pairs: the limit of 1,200 falls between the halves of the first.
    const face = String.fromCodePoint(0x1f600);
    const text = `${"x".repeat(1199)}${face}${face}`;
    const replacement = String.fromCharCode(0xfffd);

    const kept = asRecord(
      parseCveRecord(
        published({ id: "CVE-2026-1031", metrics: [metric(9.8)], description: text }),
        WINDOW,
      ),
    );
    expect(kept.summary).toContain(`Description: ${"x".repeat(1199)}.`);
    expect(kept.summary).not.toContain(replacement);

    const base = rejected("CVE-2026-1032");
    const withReason = {
      ...base,
      containers: {
        cna: { ...base.containers.cna, rejectedReasons: [{ lang: "en", value: text }] },
      },
    };
    const gone = asRecord(parseCveRecord(withReason, WINDOW));
    expect(gone.summary).toContain(`Reason: ${"x".repeat(1199)}.`);
    expect(gone.summary).not.toContain(replacement);
  });

  it("reads the description in English for en, en-US and en_GB, and not for eng", () => {
    const record = published({ id: "CVE-2026-1033", metrics: [metric(9.8)] });
    const summaryWith = (descriptions: unknown[]): string =>
      asRecord(
        parseCveRecord(
          {
            ...record,
            containers: { ...record.containers, cna: { ...record.containers.cna, descriptions } },
          },
          WINDOW,
        ),
      ).summary;
    const german = { lang: "de", value: "Deutscher Text" };

    for (const lang of ["en", "en-US", "en_GB", "EN_gb"]) {
      expect(summaryWith([german, { lang, value: "English text" }])).toContain(
        "Description: English text.",
      );
    }
    // Another tag is not English, and a list without English gives its first text.
    for (const lang of ["eng", "english", "enx", ""]) {
      expect(summaryWith([german, { lang, value: "English text" }])).toContain(
        "Description: Deutscher Text.",
      );
    }
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

describe("readCveRecord", () => {
  it("leaves out, by its id, a PUBLISHED record below 9.0, without a score, without a day of publication or published before the window", () => {
    // A high score is not a critical one, and no score is none.
    expect(
      readCveRecord(published({ id: "CVE-2026-1004", metrics: [metric(8.9)] }), WINDOW),
    ).toEqual({ kind: "left_out", id: "CVE-2026-1004" });
    expect(readCveRecord(published({ id: "CVE-2026-1005" }), WINDOW)).toEqual({
      kind: "left_out",
      id: "CVE-2026-1005",
    });
    // A score that is no number of 0 to 10 is no score. A score of an ADP counts: this one is low.
    expect(
      readCveRecord(
        published({
          id: "CVE-2026-1012",
          metrics: [{ cvssV3_1: { baseScore: "9.8" } }, { cvssV3_1: { baseScore: 98 } }],
          adpMetrics: [metric(7.5)],
        }),
        WINDOW,
      ),
    ).toEqual({ kind: "left_out", id: "CVE-2026-1012" });

    // No day of publication that can be read.
    const record = critical("CVE-2026-1006");
    for (const datePublished of [undefined, "", "not a date", 20261029]) {
      const meta: Record<string, unknown> = { ...record.cveMetadata, datePublished };
      if (datePublished === undefined) delete meta.datePublished;

      expect(readCveRecord({ ...record, cveMetadata: meta }, WINDOW)).toEqual({
        kind: "left_out",
        id: "CVE-2026-1006",
      });
    }

    // The window starts on its first day.
    expect(readCveRecord(critical("CVE-2024-1006", "2024-10-30"), WINDOW)).toEqual({
      kind: "left_out",
      id: "CVE-2024-1006",
    });
    expect(readCveRecord(critical("CVE-2024-1007", "2024-10-31"), WINDOW).kind).toBe("kept");
  });

  it("keeps what parseCveRecord keeps, and is an error where parseCveRecord gives one", () => {
    const kept = critical("CVE-2026-1001");
    expect(readCveRecord(kept, WINDOW)).toEqual({
      kind: "kept",
      record: asRecord(parseCveRecord(kept, WINDOW)),
    });
    // A rejected record is kept whatever its date and its score.
    const gone = rejected("CVE-2026-1003");
    expect(readCveRecord(gone, WINDOW)).toEqual({
      kind: "kept",
      record: asRecord(parseCveRecord(gone, WINDOW)),
    });

    const unreadable: unknown[] = [
      null,
      "CVE-2026-1016",
      {},
      { ...kept, cveMetadata: { ...kept.cveMetadata, cveId: "CVE-26-1" } },
      { ...kept, cveMetadata: { ...kept.cveMetadata, state: "RESERVED" } },
      { ...kept, containers: {} },
    ];
    for (const json of unreadable) {
      expect(readCveRecord(json, WINDOW)).toEqual({ kind: "error" });
      expect(parseCveRecord(json, WINDOW)).toBe("error");
    }
  });

  it("gives parseCveRecord null for a record it leaves out", () => {
    const json = published({ id: "CVE-2026-1004", metrics: [metric(8.9)] });
    expect(readCveRecord(json, WINDOW).kind).toBe("left_out");
    expect(parseCveRecord(json, WINDOW)).toBeNull();
  });
});

describe("cveUnreadableAllowed", () => {
  it("allows ten unreadable entries, or a hundredth of the entries when that is more", () => {
    expect(CVE_MAX_UNREADABLE).toBe(10);
    expect(cveUnreadableAllowed(0)).toBe(10);
    expect(cveUnreadableAllowed(999)).toBe(10);
    expect(cveUnreadableAllowed(1000)).toBe(10);
    expect(cveUnreadableAllowed(1099)).toBe(10);
    expect(cveUnreadableAllowed(1100)).toBe(11);
    expect(cveUnreadableAllowed(5564)).toBe(55);
    expect(cveUnreadableAllowed(417486)).toBe(4174);
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

  it("a release not yet out for yesterday ends the days read", async () => {
    // Yesterday has hourly releases, and they are not read: its own release may only be late.
    const { fetch, asked } = github(
      { "2026-10-29": {} },
      {
        hourly: { "2026-10-30_0000Z": {}, "2026-10-30_2300Z": {} },
        refs: { "2026-10-30": refsOf("2026-10-30", "0000Z", "2300Z") },
      },
    );

    expect(daysOf(await cveConnector.download(fetch, { day: "2026-10-28" }, NOW))).toEqual([
      "2026-10-29",
    ]);
    expect(await cveConnector.download(fetch, { day: "2026-10-29" }, NOW)).toBe("unchanged");

    // Of yesterday, only its end-of-day release was asked for: once in each download.
    expect(asked.filter(({ url }) => url.includes("2026-10-30")).map(({ url }) => url)).toEqual([
      `${CVE_RELEASE_API}${tagOf("2026-10-30")}`,
      `${CVE_RELEASE_API}${tagOf("2026-10-30")}`,
    ]);
    expect(refsUrls(asked)).toEqual([]);
  });

  it("a day before yesterday without an end-of-day release is read from its last hourly release", async () => {
    const zip = deltaOf([
      critical("CVE-2026-1001"),
      published({ id: "CVE-2026-1004", metrics: [metric(5.3)] }),
      rejected("CVE-2026-1003"),
    ]);
    const { fetch, asked } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "0000Z", "0300Z", "2300Z") },
      // The earlier hours have releases too: only the last one is read.
      hourly: { "2026-10-28_0000Z": {}, "2026-10-28_0300Z": {}, "2026-10-28_2300Z": { zip } },
    });

    const result = await cveConnector.download(fetch, FROM_THE_27TH, NOW);

    expect(asked.map(({ url }) => url)).toEqual([
      `${CVE_RELEASE_API}cve_2026-10-28_at_end_of_day`,
      `${CVE_REFS_API}cve_2026-10-28_`,
      `${CVE_RELEASE_API}cve_2026-10-28_2300Z`,
      "https://github.com/CVEProject/cvelistV5/releases/download/cve_2026-10-28_2300Z/2026-10-28_delta_CVEs_at_2300Z.zip",
      `${CVE_RELEASE_API}cve_2026-10-29_at_end_of_day`,
      downloadOf("2026-10-29"),
      `${CVE_RELEASE_API}cve_2026-10-30_at_end_of_day`,
      downloadOf("2026-10-30"),
    ]);
    if (result === "unchanged") throw new Error("expected days");
    expect(result.map(({ day, through }) => ({ day, through }))).toEqual([
      { day: "2026-10-28", through: "2300Z" },
      { day: "2026-10-29", through: undefined },
      { day: "2026-10-30", through: undefined },
    ]);
    // A day read from its end-of-day release has no `through` at all.
    expect(result[1]).not.toHaveProperty("through");
    expect(result[2]).not.toHaveProperty("through");

    // The hourly delta is kept as an end-of-day one is: bodies, entries, and the ids left out.
    const [{ snapshot }] = result;
    expect(snapshot.bytes).toBe(zip.length);
    expect(snapshot.bodies).toHaveLength(2);
    expect(snapshot.entries).toBe(3);
    expect(snapshot.retired).toEqual(["CVE-2026-1004"]);
    const parsed = cveConnector.parse(snapshot);
    expect(parsed.records.map((record) => record.sourceRecordId)).toEqual([
      "CVE-2026-1001",
      "CVE-2026-1003",
    ]);
    expect(parsed).toMatchObject({ errors: 0, skipped: 0, retired: ["CVE-2026-1004"] });
  });

  it.each([
    { name: "only the first hour", hours: ["0000Z"], last: "0000Z" },
    { name: "the first and the last hour", hours: ["0000Z", "2300Z"], last: "2300Z" },
    { name: "the last hour before the first", hours: ["2300Z", "0000Z"], last: "2300Z" },
    {
      name: "hours in no order",
      hours: ["1000Z", "0900Z", "2000Z", "0300Z", "1900Z"],
      last: "2000Z",
    },
  ])("takes the greatest hour of the day's tags: $name", async ({ hours, last }) => {
    // Only the release of the greatest hour is served: asking for any other fails the day.
    const { fetch } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", ...hours) },
      hourly: { [`2026-10-28_${last}`]: {} },
    });

    const result = await cveConnector.download(fetch, FROM_THE_27TH, NOW);

    if (result === "unchanged") throw new Error("expected days");
    expect(result[0]).toMatchObject({ day: "2026-10-28", through: last });
  });

  it("reads each earlier day without an end-of-day release from its own last hourly release", async () => {
    const { fetch, asked } = github(
      {},
      {
        refs: {
          "2026-10-28": refsOf("2026-10-28", "0000Z", "2300Z"),
          "2026-10-29": refsOf("2026-10-29", "0100Z", "2100Z"),
          // Yesterday's tags are never asked for.
          "2026-10-30": refsOf("2026-10-30", "2300Z"),
        },
        hourly: { "2026-10-28_2300Z": {}, "2026-10-29_2100Z": {}, "2026-10-30_2300Z": {} },
      },
    );

    const result = await cveConnector.download(fetch, FROM_THE_27TH, NOW);

    if (result === "unchanged") throw new Error("expected days");
    expect(result.map(({ day, through }) => ({ day, through }))).toEqual([
      { day: "2026-10-28", through: "2300Z" },
      { day: "2026-10-29", through: "2100Z" },
    ]);
    expect(refsUrls(asked)).toEqual([
      `${CVE_REFS_API}cve_2026-10-28_`,
      `${CVE_REFS_API}cve_2026-10-29_`,
    ]);
  });

  it("a day before yesterday with no release of any kind fails as not_found", async () => {
    // The API lists no tag of the day, or answers that there is nothing at all.
    const answers: Array<string[] | 404> = [[], 404];
    for (const refs of answers) {
      const { fetch, asked } = github(LATER_DAYS, { refs: { "2026-10-28": refs } });

      await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toMatchObject({
        name: "FetchError",
        reason: "not_found",
      });

      // Nothing was asked for after the list of tags.
      expect(asked.map(({ url }) => url)).toEqual(upToTheTags("2026-10-28"));
    }
  });

  it("an hourly tag of another shape or day is not taken", async () => {
    const others = [
      // The end-of-day tag is no hourly one: its release was not found.
      "refs/tags/cve_2026-10-28_at_end_of_day",
      "refs/tags/cve_2026-10-28_2400Z",
      "refs/tags/cve_2026-10-28_230Z",
      "refs/tags/cve_2026-10-28_2330Z",
      "refs/tags/cve_2026-10-28_2300z",
      "refs/tags/cve_2026-10-28_2300Z.zip",
      "refs/tags/cve_2026-10-29_2300Z",
      "refs/tags/xcve_2026-10-28_2300Z",
      // Not a tag, whatever its name: `refs/pull/` is as long as `refs/tags/`.
      "refs/heads/cve_2026-10-28_2300Z",
      "refs/pull/cve_2026-10-28_2300Z",
      "cve_2026-10-28_2300Z",
    ];
    // Each alone, then all together: with none of them taken, the day has no hour.
    for (const refs of [...others.map((ref) => [ref]), others]) {
      const { fetch, asked } = github(LATER_DAYS, { refs: { "2026-10-28": refs } });

      await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toMatchObject({
        name: "FetchError",
        reason: "not_found",
      });

      // No release of an hour was asked for.
      expect(asked.map(({ url }) => url)).toEqual(upToTheTags("2026-10-28"));
    }
  });

  it("an hourly tag among others of the day is taken, and the others are left", async () => {
    const { fetch } = github(LATER_DAYS, {
      refs: {
        "2026-10-28": [
          "refs/tags/cve_2026-10-28_at_end_of_day",
          "refs/tags/cve_2026-10-28_2400Z",
          "refs/tags/cve_2026-10-29_2300Z",
          ...refsOf("2026-10-28", "0600Z", "1500Z"),
        ],
      },
      hourly: { "2026-10-28_1500Z": {} },
    });

    const result = await cveConnector.download(fetch, FROM_THE_27TH, NOW);

    if (result === "unchanged") throw new Error("expected days");
    expect(result[0]).toMatchObject({ day: "2026-10-28", through: "1500Z" });
  });

  it("an hourly release that cannot be found fails as not_found", async () => {
    const { fetch, asked } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "0000Z", "2300Z") },
      // The release of an earlier hour exists; the last one does not.
      hourly: { "2026-10-28_0000Z": {} },
    });

    await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toMatchObject({
      name: "FetchError",
      reason: "not_found",
    });

    expect(asked.map(({ url }) => url)).toEqual([
      ...upToTheTags("2026-10-28"),
      `${CVE_RELEASE_API}cve_2026-10-28_2300Z`,
    ]);
  });

  it("an hourly release without its delta names no file", async () => {
    // The release lists the day's baseline, its notes, and the files of other hours and days.
    const asset = (name: string) => ({
      name,
      browser_download_url: downloadAt(hourTagOf("2026-10-28", "2300Z"), name),
    });
    const { fetch, asked } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "2300Z") },
      hourly: {
        "2026-10-28_2300Z": {
          assets: [
            asset("2026-10-28_all_CVEs_at_midnight.zip.zip"),
            asset("release_notes.md"),
            asset(hourAssetOf("2026-10-28", "2200Z")),
            asset(hourAssetOf("2026-10-27", "2300Z")),
            asset(assetOf("2026-10-28")),
            asset(`${hourAssetOf("2026-10-28", "2300Z")}.zip`),
          ],
        },
      },
    });

    await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );

    // Nothing was downloaded: the baseline is half a gigabyte.
    expect(asked.map(({ url }) => url)).toEqual([
      ...upToTheTags("2026-10-28"),
      `${CVE_RELEASE_API}cve_2026-10-28_2300Z`,
    ]);
  });

  it("an end-of-day release that exists without its delta is not replaced by an hourly one", async () => {
    const { fetch, asked } = github(
      {
        ...LATER_DAYS,
        "2026-10-28": {
          assets: [
            {
              name: "release_notes.md",
              browser_download_url: downloadAt(tagOf("2026-10-28"), "release_notes.md"),
            },
          ],
        },
      },
      {
        refs: { "2026-10-28": refsOf("2026-10-28", "2300Z") },
        hourly: { "2026-10-28_2300Z": {} },
      },
    );

    await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );

    expect(asked.map(({ url }) => url)).toEqual([`${CVE_RELEASE_API}cve_2026-10-28_at_end_of_day`]);
  });

  it("an hourly asset on another host is not followed", async () => {
    const name = hourAssetOf("2026-10-28", "2300Z");
    const { fetch, asked } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "2300Z") },
      hourly: {
        "2026-10-28_2300Z": {
          assets: [
            {
              name,
              browser_download_url: `https://downloads.example/CVEProject/cvelistV5/releases/download/cve_2026-10-28_2300Z/${name}`,
            },
          ],
        },
      },
    });

    await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBeInstanceOf(
      FeedWithoutFileError,
    );

    expect(asked.map(({ url }) => url)).toEqual([
      ...upToTheTags("2026-10-28"),
      `${CVE_RELEASE_API}cve_2026-10-28_2300Z`,
    ]);
  });

  it("an hourly delta that was cut at its limit fails", async () => {
    const { fetch } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "2300Z") },
      hourly: {
        "2026-10-28_2300Z": { zip: deltaOf([critical("CVE-2026-1001")]), truncated: true },
      },
    });

    await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  it("asks for the day's tags as JSON within the limits of a release", async () => {
    const { fetch, asked } = github(LATER_DAYS, {
      refs: { "2026-10-28": refsOf("2026-10-28", "2300Z") },
      hourly: { "2026-10-28_2300Z": {} },
    });

    await cveConnector.download(fetch, FROM_THE_27TH, NOW);

    const release = { maxBytes: 1_048_576, types: ["application/json"] };
    expect(asked.slice(0, 4)).toEqual([
      { url: `${CVE_RELEASE_API}cve_2026-10-28_at_end_of_day`, ...release },
      { url: `${CVE_REFS_API}cve_2026-10-28_`, ...release },
      { url: `${CVE_RELEASE_API}cve_2026-10-28_2300Z`, ...release },
      {
        url: hourDownloadOf("2026-10-28", "2300Z"),
        maxBytes: CVE_MAX_BYTES,
        types: ["application/zip", "application/octet-stream"],
      },
    ]);
  });

  describe("when the API does not answer the day's tags with a list", () => {
    const json = (body: string) => (url: string) =>
      Promise.resolve(answer(url, body, "application/json"));
    /** The only address the tags are asked at: the 28th has no end-of-day release. */
    const TAGS = `${CVE_REFS_API}cve_2026-10-28_`;

    it("a body that is not a list of tags names no hour", async () => {
      const bodies = [
        JSON.stringify({ message: "Not Found" }),
        "null",
        JSON.stringify("refs/tags/cve_2026-10-28_2300Z"),
        "<html>rate limited</html>",
        "",
      ];
      for (const body of bodies) {
        const { fetch, refsAsked } = withRefs(github(LATER_DAYS).fetch, json(body));

        await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toMatchObject({
          name: "FetchError",
          reason: "not_found",
        });

        expect(refsAsked).toEqual([TAGS]);
      }
    });

    it("an item that is no ref is passed over", async () => {
      const items = [
        null,
        "refs/tags/cve_2026-10-28_2300Z",
        7,
        { ref: 7 },
        {},
        [],
        { ref: "refs/tags/cve_2026-10-28_0900Z" },
      ];
      const inner = github(LATER_DAYS, { hourly: { "2026-10-28_0900Z": {} } });
      const { fetch, refsAsked } = withRefs(inner.fetch, json(JSON.stringify(items)));

      const result = await cveConnector.download(fetch, FROM_THE_27TH, NOW);

      if (result === "unchanged") throw new Error("expected days");
      expect(result[0]).toMatchObject({ day: "2026-10-28", through: "0900Z" });
      expect(refsAsked).toEqual([TAGS]);
    });

    it("a 304 is not an answer", async () => {
      const { fetch, refsAsked } = withRefs(github(LATER_DAYS).fetch, (url) =>
        Promise.resolve({ notModified: true as const, url }),
      );

      await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toMatchObject({
        name: "FetchError",
        reason: "unreachable",
      });

      expect(refsAsked).toEqual([TAGS]);
    });

    it("any other failure of the request is the failure of the sync, with the wait it asked for", async () => {
      const failures = [
        new FetchError("blocked_by_site", undefined, { status: 403, retryAfterMs: 60_000 }),
        new FetchError("unreachable"),
      ];
      for (const failure of failures) {
        const { fetch, refsAsked } = withRefs(github(LATER_DAYS).fetch, () =>
          Promise.reject(failure),
        );

        await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBe(failure);

        // The same error, not a missing day, and the request was not repeated.
        expect(refsAsked).toEqual([TAGS]);
      }
    });

    it("tags cut at the limit fail as too large", async () => {
      const { fetch, refsAsked } = withRefs(github(LATER_DAYS).fetch, (url) =>
        Promise.resolve(answer(url, "[]", "application/json", true)),
      );

      await expect(cveConnector.download(fetch, FROM_THE_27TH, NOW)).rejects.toBeInstanceOf(
        BodyTooLargeError,
      );

      expect(refsAsked).toEqual([TAGS]);
    });
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

  it("keeps the entries a sync applies, those it cannot read, and the ids of those the copy leaves out", async () => {
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
    // Every entry of a record is counted; a left-out one is named, in the order of the entries.
    expect(snapshot.entries).toBe(5);
    expect(snapshot.retired).toEqual(["CVE-2026-1004", "CVE-2023-1020"]);
    const parsed = cveConnector.parse(snapshot);
    expect(parsed.records.map((record) => record.sourceRecordId)).toEqual([
      "CVE-2026-1001",
      "CVE-2026-1003",
    ]);
    // One entry in five does not parse: few enough for the day to be applied, and counted.
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(1);
    expect(parsed.retired).toEqual(["CVE-2026-1004", "CVE-2023-1020"]);
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
      skipped: 0,
      retired: [],
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

describe("cveConnector.parse", () => {
  const snapshotOf = (
    bodies: string[],
    extra: Pick<Snapshot, "entries" | "retired"> = {},
  ): Snapshot => ({ bodies, etag: null, lastModified: null, bytes: 0, ...extra });
  /** Records that parse: critical ones, each of its own id. */
  const readable = (count: number): string[] =>
    Array.from({ length: count }, (_, index) =>
      JSON.stringify(critical(`CVE-2026-${3000 + index}`)),
    );
  /** Entries that do not parse. */
  const unreadable = (count: number): string[] => Array.from({ length: count }, () => "{not json");

  it("is the second version of the parsing, which tolerates a few records it cannot read", () => {
    expect(cveConnector.version).toBe(2);
  });

  it("applies a day with a few records that do not parse, and counts them", () => {
    const result = cveConnector.parse(
      snapshotOf(
        [
          JSON.stringify(critical("CVE-2026-1001")),
          JSON.stringify(rejected("CVE-2026-1003")),
          ...unreadable(1),
        ],
        { entries: 5, retired: ["CVE-2026-1004", "CVE-2023-1020"] },
      ),
    );

    expect(result.records.map((record) => record.sourceRecordId)).toEqual([
      "CVE-2026-1001",
      "CVE-2026-1003",
    ]);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.retired).toEqual(["CVE-2026-1004", "CVE-2023-1020"]);
    expect(result.root).toBe("cves");
  });

  it("counts as unreadable both JSON that does not parse and JSON that is no CVE record", () => {
    const bodies = [
      ...readable(3),
      "{not json",
      JSON.stringify({}),
      JSON.stringify("CVE-2026-1016"),
    ];

    const result = cveConnector.parse(snapshotOf(bodies, { entries: 6 }));

    expect(result.records).toHaveLength(3);
    expect(result).toMatchObject({ errors: 0, skipped: 3 });
  });

  it("fails a day where more than ten, and more than a hundredth, of its records do not parse", () => {
    // Twenty entries: ten may be left out, eleven may not.
    expect(
      cveConnector.parse(snapshotOf([...readable(10), ...unreadable(10)], { entries: 20 })),
    ).toMatchObject({ errors: 0, skipped: 10 });
    expect(
      cveConnector.parse(snapshotOf([...readable(9), ...unreadable(11)], { entries: 20 })),
    ).toMatchObject({ errors: 11, skipped: 0 });
    // Two thousand entries: a hundredth is twenty.
    expect(
      cveConnector.parse(snapshotOf([...readable(1980), ...unreadable(20)], { entries: 2000 })),
    ).toMatchObject({ errors: 0, skipped: 20 });
    expect(
      cveConnector.parse(snapshotOf([...readable(1979), ...unreadable(21)], { entries: 2000 })),
    ).toMatchObject({ errors: 21, skipped: 0 });
  });

  it("measures what does not parse against all the entries of the day, those it left out included", () => {
    // 30 bodies, 20 unreadable. Of 2,000 entries a hundredth is twenty. Of 30, the limit is ten.
    const bodies = [...readable(10), ...unreadable(20)];

    expect(cveConnector.parse(snapshotOf(bodies, { entries: 2000 }))).toMatchObject({
      errors: 0,
      skipped: 20,
    });
    // A snapshot that does not say how many entries it read is measured by its bodies.
    expect(cveConnector.parse(snapshotOf(bodies))).toMatchObject({ errors: 20, skipped: 0 });
    expect(cveConnector.parse(snapshotOf(unreadable(10)))).toMatchObject({
      errors: 0,
      skipped: 10,
    });
    expect(cveConnector.parse(snapshotOf(unreadable(11)))).toMatchObject({
      errors: 11,
      skipped: 0,
    });
  });

  it("hands on the ids a day retired, and none for a snapshot that names none", () => {
    expect(cveConnector.parse(snapshotOf(readable(2))).retired).toEqual([]);
    expect(
      cveConnector.parse(snapshotOf(readable(2), { retired: ["CVE-2026-1004"] })).retired,
    ).toEqual(["CVE-2026-1004"]);
  });
});
