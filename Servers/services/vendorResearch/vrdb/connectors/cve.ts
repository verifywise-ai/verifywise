/**
 * The CVE Program's records (cvelistV5, spec D2.6) as a list the vendor risk database reads by its
 * changes, behind Q7 (gates.ts; Ruling 8 of the M2 plan). The programme publishes the records that
 * changed on a day as an asset of a release on GitHub: the release `cve_<day>_at_end_of_day` holds
 * `<day>_delta_CVEs_at_end_of_day.zip`, one JSON file per record. A sync asks the GitHub API for the
 * release of each day after the cursor up to yesterday (UTC), at most seven, oldest first; it reads
 * the release's list of assets, since their names are irregular, and downloads the delta from the
 * project's releases on github.com only. The lookback is filled from a baseline file an operator
 * downloaded (scripts/vrdbCveBaseline.ts), which sets the cursor: the sync refuses a list without
 * one (`no_baseline`, sync.ts), so the download's start at yesterday for no cursor is a fallback.
 *
 * The copy keeps the records published in the last 24 months whose highest CVSS base score, the
 * CNA's or any ADP's, is 9.0 or more, and every REJECTED record: a rejected CVE is rejected on every
 * list (Ruling 9). A record is matched by the vendors of its affected products (`cve:` keys,
 * keys.ts). The download keeps only the entries a sync applies, and those it cannot read, so that
 * the deltas of seven days are never held whole.
 *
 * The records are © The MITRE Corporation, under the CVE Terms of Use (sources.ts).
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText } from "../../text";
import { cveVendorKey } from "../keys";
import type { ParsedRecord } from "../types";
import { type ZipLimits, forEachZipEntry } from "../zip";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  FeedWithoutFileError,
  type IncrementalConnector,
  NotTheListError,
  type Snapshot,
  bodyText,
  dayOf,
} from "./types";

export const CVE_RELEASE_API = "https://api.github.com/repos/CVEProject/cvelistV5/releases/tags/";
/** The delta of 30 October 2026 was 11 MB; a hundred is a day of very many changes. */
export const CVE_MAX_BYTES = 104_857_600;
export const CVE_MAX_DAYS_PER_SYNC = 7;

/**
 * A delta held 5,564 records on 30 October 2026, each of a few kilobytes; a record that lists
 * many products is larger, never eight megabytes.
 */
export const CVE_DELTA_ZIP_LIMITS: ZipLimits = {
  maxEntries: 200_000,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

/**
 * A baseline holds every record of the list, about 300,000 of them (646 MB zipped when it was
 * observed), in a zip inside the zip.
 */
export const CVE_BASELINE_ZIP_LIMITS: ZipLimits = {
  maxEntries: 1_000_000,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024 * 1024,
};

const RELEASE_LIMITS = {
  maxBytes: 1_048_576,
  allowedContentTypes: ["application/json"],
  totalTimeoutMs: 30_000,
};
const DELTA_LIMITS = {
  maxBytes: CVE_MAX_BYTES,
  allowedContentTypes: ["application/zip", "application/octet-stream"],
  totalTimeoutMs: 300_000,
};

/** Where the assets of the project's releases are downloaded from. */
const DOWNLOAD_HOST = "github.com";
const DOWNLOAD_PATH = "/CVEProject/cvelistV5/releases/download/";

const WINDOW_MONTHS = 24;
const CRITICAL = 9;
const MAX_AFFECTED_SHOWN = 5;
const MAX_TEXT_CHARS = 1200;
const DAY_MS = 24 * 60 * 60 * 1000;

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;
const ENTRY_NAME = /^CVE-\d{4}-\d{4,}\.json$/;
const RECORD_PAGE = "https://www.cve.org/CVERecord?id=";
const ROOT = "cves";
/** A window no day is before: what a download kept was already inside its own. */
const ANY_DAY = { from: "" };

/** The CVSS metrics of the record format, the newest version first. */
const METRICS = [
  ["cvssV4_0", "4.0"],
  ["cvssV3_1", "3.1"],
  ["cvssV3_0", "3.0"],
  ["cvssV2_0", "2.0"],
] as const;

type Fields = Record<string, unknown>;

const objectOf = (value: unknown): Fields | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : null;
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
/** A field as one line of plain text. */
const plain = (value: unknown): string => cleanText(textOf(value)).replace(/\s+/g, " ").trim();
const isNa = (text: string): boolean => text.toLowerCase() === "n/a";

/** Whether a zip entry is a record: its base name is `CVE-<year>-<n>.json`, and its name has no `..`. */
export function isCveEntry(name: string): boolean {
  if (name.includes("..")) return false;
  return ENTRY_NAME.test(name.slice(name.lastIndexOf("/") + 1));
}

/** The first day of the window: the same day 24 months back (UTC). */
export function cveWindowStart(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - WINDOW_MONTHS, now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** The CNA's container, then each ADP's: where the scores and the affected products of a record are. */
function containersOf(containers: Fields): Fields[] {
  const cna = objectOf(containers.cna);
  const adps = listOf(containers.adp)
    .map(objectOf)
    .filter((container): container is Fields => container !== null);
  return cna === null ? adps : [cna, ...adps];
}

/** The highest CVSS base score of the containers' metrics, with its version; null for none. */
function highestScoreOf(containers: readonly Fields[]): { score: number; version: string } | null {
  let best: { score: number; version: string } | null = null;
  for (const container of containers) {
    for (const metric of listOf(container.metrics)) {
      const fields = objectOf(metric);
      if (fields === null) continue;
      for (const [key, version] of METRICS) {
        const score = objectOf(fields[key])?.baseScore;
        if (typeof score !== "number" || !(score >= 0 && score <= 10)) continue;
        if (best === null || score > best.score) best = { score, version };
      }
    }
  }
  return best;
}

/** The affected products as "vendor product", and their vendors, once each; n/a is left out. */
function affectedOf(containers: readonly Fields[]): { products: string[]; vendors: string[] } {
  const products = new Map<string, string>();
  const vendors = new Map<string, string>();
  for (const container of containers) {
    for (const item of listOf(container.affected)) {
      const fields = objectOf(item);
      if (fields === null) continue;
      const vendor = plain(fields.vendor);
      const product = plain(fields.product);
      const shown = [vendor, product].filter((part) => part !== "" && !isNa(part)).join(" ");
      if (shown !== "" && !products.has(shown.toLowerCase())) {
        products.set(shown.toLowerCase(), shown);
      }
      if (vendor !== "" && !isNa(vendor) && !vendors.has(vendor.toLowerCase())) {
        vendors.set(vendor.toLowerCase(), vendor);
      }
    }
  }
  return { products: [...products.values()], vendors: [...vendors.values()] };
}

/** The `cve:` keys of the vendors: each as written and without its legal form, once each. */
function keysOf(vendors: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const vendor of vendors) {
    for (const name of [vendor, shortName(vendor)]) {
      const key = cveVendorKey(name);
      if (key !== cveVendorKey("")) keys.add(key);
    }
  }
  return [...keys];
}

/** The English text of a list of `{ lang, value }`, else the first one's; empty for none. */
function englishOf(list: unknown): string {
  const items = listOf(list)
    .map(objectOf)
    .filter((item): item is Fields => item !== null);
  const english = items.find((item) => /^en\b/i.test(textOf(item.lang))) ?? items[0];
  return plain(english?.value);
}

/**
 * An instant a record states (`dateRejected`), ISO 8601; null for none it can read. A time without
 * a zone is UTC, as the CVE record format writes its times.
 */
function instantOf(value: unknown): string | null {
  const text = textOf(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  const time = Date.parse(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function rejectedRecordOf(id: string, meta: Fields, containers: Fields | null): ParsedRecord {
  const rejectedAt = instantOf(meta.dateRejected);
  const text = joinSentences([
    "CVE Program (cve.org).",
    sentence("CVE", id),
    sentence("Rejected", dayOf(textOf(meta.dateRejected)) ?? ""),
    sentence(
      "Reason",
      englishOf(objectOf(containers?.cna)?.rejectedReasons).slice(0, MAX_TEXT_CHARS),
    ),
  ]);
  return {
    sourceRecordId: id,
    recordType: "vulnerability",
    title: `${id}: rejected`,
    summary: text,
    url: `${RECORD_PAGE}${id}`,
    identifiers: { cveID: id, state: "REJECTED" },
    // A rejected record names no product: the copy keeps the keys it was matched by.
    matchKeys: [],
    publishedAt: dayOf(textOf(meta.datePublished)),
    sourceUpdatedAt: plain(meta.dateUpdated) || null,
    status: "rejected",
    // The copy dates the rejection by the CVE Program's day, also for a record loaded months later.
    ...(rejectedAt === null ? {} : { statusChangedAt: rejectedAt }),
  };
}

/**
 * A record of the CVE record format as the copy keeps it: a PUBLISHED one published inside the
 * window whose highest base score is 9.0 or more, and every REJECTED one; null for any other
 * record. "error" for what is not a record of a state it knows (PUBLISHED or REJECTED), and for a
 * published record without the CNA's container.
 */
export function parseCveRecord(
  json: unknown,
  window: { from: string },
): ParsedRecord | null | "error" {
  const record = objectOf(json);
  const meta = objectOf(record?.cveMetadata);
  if (record === null || meta === null) return "error";
  const id = textOf(meta.cveId);
  const state = textOf(meta.state);
  if (!CVE_ID.test(id) || (state !== "PUBLISHED" && state !== "REJECTED")) return "error";
  const containers = objectOf(record.containers);
  if (state === "REJECTED") return rejectedRecordOf(id, meta, containers);

  const cna = objectOf(containers?.cna);
  if (containers === null || cna === null) return "error";
  const published = dayOf(textOf(meta.datePublished));
  if (published === null || published < window.from) return null;
  const all = containersOf(containers);
  const best = highestScoreOf(all);
  if (best === null || best.score < CRITICAL) return null;

  const { products, vendors } = affectedOf(all);
  const score = best.score.toFixed(1);
  const text = joinSentences([
    "CVE Program (cve.org).",
    sentence("CVE", id),
    sentence("Published", published),
    sentence("Highest CVSS base score", `${score} (CVSS ${best.version})`),
    sentence("Affected", products.slice(0, MAX_AFFECTED_SHOWN).join(", ")),
    sentence("Description", englishOf(cna.descriptions).slice(0, MAX_TEXT_CHARS)),
  ]);
  return {
    sourceRecordId: id,
    recordType: "vulnerability",
    title: `${id}: critical vulnerability (CVSS ${score})`,
    summary: text,
    url: `${RECORD_PAGE}${id}`,
    identifiers: { cveID: id, state: "PUBLISHED" },
    matchKeys: keysOf(vendors),
    publishedAt: published,
    sourceUpdatedAt: plain(meta.dateUpdated) || null,
  };
}

const dayAfter = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

const yesterdayOf = (now: Date): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS)
    .toISOString()
    .slice(0, 10);

/** The days whose changes a sync reads: those after the cursor up to yesterday, at most seven. */
function daysToRead(cursor: { day: string } | null, now: Date): string[] {
  const yesterday = yesterdayOf(now);
  const days: string[] = [];
  const first = cursor === null || dayOf(cursor.day) === null ? yesterday : dayAfter(cursor.day);
  for (
    let day = first;
    day <= yesterday && days.length < CVE_MAX_DAYS_PER_SYNC;
    day = dayAfter(day)
  ) {
    days.push(day);
  }
  return days;
}

/** Whether an address is an asset of the project's releases: https, github.com, its path. */
function isDownloadAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === DOWNLOAD_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith(DOWNLOAD_PATH)
    );
  } catch {
    return false;
  }
}

/** The address of the day's delta among the release's assets; null when it names none at github.com. */
function deltaAddressOf(body: string, day: string): string | null {
  let release: unknown;
  try {
    release = JSON.parse(body);
  } catch {
    return null;
  }
  const name = `${day}_delta_CVEs_at_end_of_day.zip`;
  const asset = listOf(objectOf(release)?.assets)
    .map(objectOf)
    .find((fields) => fields !== null && textOf(fields.name) === name);
  const address = textOf(asset?.browser_download_url);
  return isDownloadAddress(address) ? address : null;
}

/**
 * The entries of a delta that a sync applies, and those it cannot read (the parse counts them as
 * errors), as text. A delta whose files are none of them is not the list.
 */
function keptEntriesOf(zip: Buffer, window: { from: string }): string[] {
  const kept: string[] = [];
  let files = 0;
  let records = 0;
  const accept = (name: string): boolean => {
    files += 1;
    const record = isCveEntry(name);
    if (record) records += 1;
    return record;
  };
  forEachZipEntry(zip, accept, CVE_DELTA_ZIP_LIMITS, ({ data }) => {
    const text = data.toString("utf8");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      kept.push(text);
      return;
    }
    if (parseCveRecord(json, window) !== null) kept.push(text);
  });
  if (files > 0 && records === 0) throw new NotTheListError();
  return kept;
}

/** The changes of one day, or null when its release is not out. */
async function changesOf(
  fetch: ConnectorFetch,
  day: string,
  window: { from: string },
): Promise<Snapshot | null> {
  let release;
  try {
    release = await fetch(`${CVE_RELEASE_API}cve_${day}_at_end_of_day`, {}, RELEASE_LIMITS);
  } catch (error) {
    if (error instanceof FetchError && error.reason === "not_found") return null;
    throw error;
  }
  // Nothing was sent to make a 304 an answer; one is not the release.
  if (release.notModified) throw new FetchError("unreachable");
  const address = deltaAddressOf(bodyText(release), day);
  if (address === null) throw new FeedWithoutFileError();
  const delta = await fetch(address, {}, DELTA_LIMITS);
  if (delta.notModified) throw new FetchError("unreachable");
  if (delta.truncated) throw new BodyTooLargeError();
  return {
    bodies: keptEntriesOf(delta.body, window),
    etag: null,
    lastModified: null,
    bytes: delta.body.length,
  };
}

export const cveConnector: IncrementalConnector = {
  kind: "incremental",
  id: "cve",
  version: 1,
  async download(fetch, cursor, now) {
    const window = { from: cveWindowStart(now) };
    const yesterday = yesterdayOf(now);
    const read: Array<{ day: string; snapshot: Snapshot }> = [];
    for (const day of daysToRead(cursor, now)) {
      const snapshot = await changesOf(fetch, day, window);
      if (snapshot === null) {
        // A day's release is made after the day ends: yesterday's may not be out yet, while an
        // earlier day without one is a gap the copy cannot step over.
        if (day === yesterday) break;
        throw new FetchError("not_found");
      }
      read.push({ day, snapshot });
    }
    return read.length === 0 ? "unchanged" : read;
  },
  parse(snapshot) {
    const records: ParsedRecord[] = [];
    let errors = 0;
    for (const body of snapshot.bodies) {
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        errors += 1;
        continue;
      }
      const record = parseCveRecord(json, ANY_DAY);
      if (record === "error") errors += 1;
      else if (record !== null) records.push(record);
    }
    return { records, errors, sourceVersion: null, root: ROOT };
  },
};
