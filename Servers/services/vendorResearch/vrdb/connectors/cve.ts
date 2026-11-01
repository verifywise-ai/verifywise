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
 * A day without an end-of-day release is read from its last hourly release (Q7). Three days since
 * 2024 have none (2025-01-13, 2026-06-20 and 2026-07-19), though each has hourly releases through
 * 2300Z, and refusing them would stop the copy until an operator loaded a newer baseline. The
 * hourly releases of a day (`cve_<day>_HH00Z`, with `<day>_delta_CVEs_at_HH00Z.zip`) hold the
 * changes since the day's baseline, each one those of the one before and more, so the last of them
 * stands for the day. The download asks the API for the day's tags (`CVE_REFS_API`), takes the
 * greatest hour, and reads that release as it reads an end-of-day one. It hands the day on with
 * `through` set to `HH00Z`, since the changes of the last hour may be missing, and the sync logs
 * that. This is for a day before yesterday only: yesterday's missing release ends the days read,
 * because it may not be out yet. A day with no hourly release, or whose last one cannot be found,
 * fails as `not_found` (it has never happened, and it could mean that the layout was renamed), and
 * a release that exists without its delta fails as `feed_without_file`, hourly or not. Either way
 * the cursor stays, and loading a newer baseline restarts the copy.
 *
 * The copy keeps the records published in the last 24 months whose highest CVSS base score, the
 * CNA's or any ADP's, is 9.0 or more, and every REJECTED record: a rejected CVE is rejected on every
 * list (Ruling 9). A record is matched by the vendors of its affected products (`cve:` keys,
 * keys.ts). A published record the filter leaves out may be held already, kept before it was
 * re-scored: the download hands on its id (`retired`), and the sync takes the keys off a stored
 * copy of it. The download keeps only the entries a sync applies, those it cannot read, and these
 * ids, so that the deltas of seven days are never held whole.
 *
 * An entry that does not parse is left out and counted (`skipped`), because a release never
 * changes: a day refused for one odd record would stop the copy for good. A day fails as
 * `parse_errors` only when more than ten, and more than a hundredth, of its record entries do not
 * parse (`cveUnreadableAllowed`): that is a new format, not an odd record, and the cursor waits for
 * a new parser. An entry that could not be read is not retired, because its state is unknown.
 *
 * The records carry MITRE's copyright designation, Copyright © 1999-<year>, The MITRE Corporation,
 * and are used under the CVE Terms of Use (sources.ts).
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, cutAtCodePoint } from "../../text";
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
/**
 * The project's tags that start with what follows, as a list of refs: the tags of a day are
 * `cve_<day>_`, then `at_end_of_day` or the hour of an hourly release.
 */
export const CVE_REFS_API =
  "https://api.github.com/repos/CVEProject/cvelistV5/git/matching-refs/tags/";
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
/** The language of a text in English: `en`, then at most a region after `-` or `_`; not `eng`. */
const ENGLISH = /^en(?:[_-]|$)/i;
/** What a CNA writes for a vendor or a product it does not name, in lower case. */
const NO_VALUE = new Set(["n/a", "unknown", "unspecified"]);
const RECORD_PAGE = "https://www.cve.org/CVERecord?id=";
const ROOT = "cves";
/** The ref of a tag, as the API names it: `refs/tags/<tag>`. */
const TAG_REF = "refs/tags/";
/** What follows `cve_<day>_` in the tag of an hourly release: the hour, on the hour, in UTC. */
const HOUR_TAG_END = /^([01][0-9]|2[0-3])00Z$/;
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
/** Whether a vendor or a product is a placeholder (n/a, unknown, unspecified) and so names none. */
const isNa = (text: string): boolean => NO_VALUE.has(text.trim().toLowerCase());

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
  const english = items.find((item) => ENGLISH.test(textOf(item.lang))) ?? items[0];
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
      cutAtCodePoint(englishOf(objectOf(containers?.cna)?.rejectedReasons), MAX_TEXT_CHARS),
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
 * What the copy makes of one record of the CVE record format: `kept` with the record it stores (a
 * PUBLISHED one published inside the window whose highest base score is 9.0 or more, and every
 * REJECTED one), `left_out` with its CVE id (any other PUBLISHED record: the copy's filter does not
 * take it, so a copy that holds it must stop offering it), or `error` (what is not a record of a
 * state it knows, and a published record without the CNA's container).
 */
export type CveReading =
  { kind: "kept"; record: ParsedRecord } | { kind: "left_out"; id: string } | { kind: "error" };

/**
 * Reads a record of the CVE record format as the copy keeps it (see `CveReading`). A PUBLISHED
 * record is left out when it has no day of publication that can be read, when it was published
 * before `window.from`, and when its highest base score is missing or below 9.0.
 */
export function readCveRecord(json: unknown, window: { from: string }): CveReading {
  const record = objectOf(json);
  const meta = objectOf(record?.cveMetadata);
  if (record === null || meta === null) return { kind: "error" };
  const id = textOf(meta.cveId);
  const state = textOf(meta.state);
  if (!CVE_ID.test(id) || (state !== "PUBLISHED" && state !== "REJECTED")) {
    return { kind: "error" };
  }
  const containers = objectOf(record.containers);
  if (state === "REJECTED") return { kind: "kept", record: rejectedRecordOf(id, meta, containers) };

  const cna = objectOf(containers?.cna);
  if (containers === null || cna === null) return { kind: "error" };
  const published = dayOf(textOf(meta.datePublished));
  if (published === null || published < window.from) return { kind: "left_out", id };
  const all = containersOf(containers);
  const best = highestScoreOf(all);
  if (best === null || best.score < CRITICAL) return { kind: "left_out", id };

  const { products, vendors } = affectedOf(all);
  const score = best.score.toFixed(1);
  const text = joinSentences([
    "CVE Program (cve.org).",
    sentence("CVE", id),
    sentence("Published", published),
    sentence("Highest CVSS base score", `${score} (CVSS ${best.version})`),
    sentence("Affected", products.slice(0, MAX_AFFECTED_SHOWN).join(", ")),
    sentence("Description", cutAtCodePoint(englishOf(cna.descriptions), MAX_TEXT_CHARS)),
  ]);
  return {
    kind: "kept",
    record: {
      sourceRecordId: id,
      recordType: "vulnerability",
      title: `${id}: critical vulnerability (CVSS ${score})`,
      summary: text,
      url: `${RECORD_PAGE}${id}`,
      identifiers: { cveID: id, state: "PUBLISHED" },
      matchKeys: keysOf(vendors),
      publishedAt: published,
      sourceUpdatedAt: plain(meta.dateUpdated) || null,
    },
  };
}

/**
 * A record of the CVE record format as the copy keeps it: a PUBLISHED one published inside the
 * window whose highest base score is 9.0 or more, and every REJECTED one; null for any other
 * record. "error" for what is not a record of a state it knows (PUBLISHED or REJECTED), and for a
 * published record without the CNA's container. `readCveRecord` also names the record it leaves out.
 */
export function parseCveRecord(
  json: unknown,
  window: { from: string },
): ParsedRecord | null | "error" {
  const reading = readCveRecord(json, window);
  if (reading.kind === "kept") return reading.record;
  return reading.kind === "left_out" ? null : "error";
}

/** The entries of a day that do not parse, and may be left out whatever the size of the day. */
export const CVE_MAX_UNREADABLE = 10;

/**
 * How many entries of a day, or of a baseline, may be left out because they do not parse: ten, or a
 * hundredth of its record entries when that is more. More than that is not an odd record but a
 * change of the format, and the day is refused (Q7).
 */
export const cveUnreadableAllowed = (entries: number): number =>
  Math.max(CVE_MAX_UNREADABLE, Math.floor(entries / 100));

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

/** The address of the delta among the release's assets; null when it names none at github.com. */
function deltaAddressOf(body: string, assetName: string): string | null {
  let release: unknown;
  try {
    release = JSON.parse(body);
  } catch {
    return null;
  }
  const asset = listOf(objectOf(release)?.assets)
    .map(objectOf)
    .find((fields) => fields !== null && textOf(fields.name) === assetName);
  const address = textOf(asset?.browser_download_url);
  return isDownloadAddress(address) ? address : null;
}

/**
 * What a delta gives a sync, each in the order of the delta's entries:
 * - `bodies`: the entries the sync applies, and those it cannot read (the parse counts them), as text;
 * - `retired`: the ids of the published records the copy leaves out;
 * - `entries`: the number of record entries read, which is `bodies` and `retired` together.
 * A delta whose files are none of them is not the list.
 */
function keptEntriesOf(
  zip: Buffer,
  window: { from: string },
): { bodies: string[]; retired: string[]; entries: number } {
  const bodies: string[] = [];
  const retired: string[] = [];
  let files = 0;
  let entries = 0;
  const accept = (name: string): boolean => {
    files += 1;
    const record = isCveEntry(name);
    if (record) entries += 1;
    return record;
  };
  forEachZipEntry(zip, accept, CVE_DELTA_ZIP_LIMITS, ({ data }) => {
    const text = data.toString("utf8");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      bodies.push(text);
      return;
    }
    const reading = readCveRecord(json, window);
    if (reading.kind === "left_out") retired.push(reading.id);
    else bodies.push(text);
  });
  if (files > 0 && entries === 0) throw new NotTheListError();
  return { bodies, retired, entries };
}

/**
 * The changes in the delta (`assetName`) of the release with the tag `tag`, or null when the
 * release is not found. A release that exists without its delta names no file.
 */
async function releaseChangesOf(
  fetch: ConnectorFetch,
  tag: string,
  assetName: string,
  window: { from: string },
): Promise<Snapshot | null> {
  let release;
  try {
    release = await fetch(`${CVE_RELEASE_API}${tag}`, {}, RELEASE_LIMITS);
  } catch (error) {
    if (error instanceof FetchError && error.reason === "not_found") return null;
    throw error;
  }
  // Nothing was sent to make a 304 an answer; one is not the release.
  if (release.notModified) throw new FetchError("unreachable");
  const address = deltaAddressOf(bodyText(release), assetName);
  if (address === null) throw new FeedWithoutFileError();
  const delta = await fetch(address, {}, DELTA_LIMITS);
  if (delta.notModified) throw new FetchError("unreachable");
  if (delta.truncated) throw new BodyTooLargeError();
  const { bodies, retired, entries } = keptEntriesOf(delta.body, window);
  return {
    bodies,
    etag: null,
    lastModified: null,
    bytes: delta.body.length,
    entries,
    retired,
  };
}

/**
 * The greatest hour (`HH`) among the hourly releases of a day, from the API's list of the tags
 * that start with `cve_<day>_`. A tag counts when it is `refs/tags/cve_<day>_HH00Z`: a tag, of that
 * day, on the hour. Null when none counts, when the answer is no list, and when the API answers
 * 404. A day has at most 25 tags (24 hourly ones and the end-of-day one; the lists of 2024 to 2026
 * show no day with more), which the first page of 30 of the API holds.
 */
async function lastHourOf(fetch: ConnectorFetch, day: string): Promise<string | null> {
  const prefix = `cve_${day}_`;
  let response;
  try {
    response = await fetch(`${CVE_REFS_API}${prefix}`, {}, RELEASE_LIMITS);
  } catch (error) {
    if (error instanceof FetchError && error.reason === "not_found") return null;
    throw error;
  }
  // Nothing was sent to make a 304 an answer; one is not the list of tags.
  if (response.notModified) throw new FetchError("unreachable");
  const text = bodyText(response);
  let refs: unknown;
  try {
    refs = JSON.parse(text);
  } catch {
    return null;
  }
  let last: string | null = null;
  for (const item of listOf(refs)) {
    const ref = textOf(objectOf(item)?.ref);
    if (!ref.startsWith(`${TAG_REF}${prefix}`)) continue;
    const hour = HOUR_TAG_END.exec(ref.slice(TAG_REF.length + prefix.length))?.[1];
    // The hours are two digits each, so that the greater text is the later hour.
    if (hour !== undefined && (last === null || hour > last)) last = hour;
  }
  return last;
}

export const cveConnector: IncrementalConnector = {
  kind: "incremental",
  id: "cve",
  version: 2,
  async download(fetch, cursor, now) {
    const window = { from: cveWindowStart(now) };
    const yesterday = yesterdayOf(now);
    const read: Array<{ day: string; snapshot: Snapshot; through?: string }> = [];
    for (const day of daysToRead(cursor, now)) {
      const endOfDay = await releaseChangesOf(
        fetch,
        `cve_${day}_at_end_of_day`,
        `${day}_delta_CVEs_at_end_of_day.zip`,
        window,
      );
      if (endOfDay !== null) {
        read.push({ day, snapshot: endOfDay });
        continue;
      }
      // A day's release is made after the day ends: yesterday's may not be out yet.
      if (day === yesterday) break;
      // An earlier day without one is read from its last hourly release, which holds the day's
      // changes up to that hour. A day with no hourly release either is a gap the copy cannot
      // step over: the days stop here, and a newer baseline restarts them.
      const hour = await lastHourOf(fetch, day);
      if (hour === null) throw new FetchError("not_found");
      const through = `${hour}00Z`;
      const snapshot = await releaseChangesOf(
        fetch,
        `cve_${day}_${through}`,
        `${day}_delta_CVEs_at_${through}.zip`,
        window,
      );
      if (snapshot === null) throw new FetchError("not_found");
      read.push({ day, snapshot, through });
    }
    return read.length === 0 ? "unchanged" : read;
  },
  parse(snapshot) {
    const records: ParsedRecord[] = [];
    let unreadable = 0;
    for (const body of snapshot.bodies) {
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        unreadable += 1;
        continue;
      }
      const reading = readCveRecord(json, ANY_DAY);
      if (reading.kind === "error") unreadable += 1;
      else if (reading.kind === "kept") records.push(reading.record);
    }
    // A release never changes, so a day refused for one odd record would stop the copy for good.
    // A few entries that do not parse are therefore left out and counted (`skipped`). More than the
    // day tolerates is a sign of a new format: they are reported as `errors`, and the sync refuses
    // the day.
    const refused = unreadable > cveUnreadableAllowed(snapshot.entries ?? snapshot.bodies.length);
    return {
      records,
      errors: refused ? unreadable : 0,
      skipped: refused ? 0 : unreadable,
      retired: snapshot.retired ?? [],
      sourceVersion: null,
      root: ROOT,
    };
  },
};
