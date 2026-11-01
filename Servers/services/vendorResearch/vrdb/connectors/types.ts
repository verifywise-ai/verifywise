/**
 * A connector downloads one list the vendor risk database mirrors and parses it into records (spec
 * D4.7). It asks through the fetch the sync gives it, which is the page guard's conditional GET,
 * and it keeps no address in what it hands back: the EU file's address carries a token (Q2). Most
 * lists are taken whole; a list read by its changes (the CVE records) hands the sync the changes of
 * each day after its cursor. A read-through connector asks a database for one vendor's key at run
 * time (D4.8 step 3).
 */
import type { VrdbSourceId } from "../../../../domain.layer/interfaces/i.vendorResearch";
import type {
  ConditionalResponse,
  GuardedResponse,
  Validators,
} from "../../../webResearch/guardedFetch";
import { type PageReader, decodeBody } from "../../../webResearch/readPage";
import type { FetchJson } from "../../records/types";
import type { ResearchTarget } from "../../target";
import type { ParsedRecord } from "../types";

/** A conditional GET of a public file, with the limits of the list it is part of. */
export type ConnectorFetch = (
  url: string,
  validators: Validators,
  limits: { maxBytes: number; allowedContentTypes: readonly string[]; totalTimeoutMs: number },
) => Promise<ConditionalResponse>;

/** What a download gives: the text of each file, the validators for the next one, the size. */
export interface Snapshot {
  bodies: string[];
  etag: string | null;
  lastModified: string | null;
  bytes: number;
  /**
   * The number of record entries the download read, of which `bodies` are the ones kept; absent
   * where every entry is a body.
   */
  entries?: number;
  /**
   * For a list read by its changes, the ids of the records the day changed that the copy's filter
   * leaves out. They are not bodies: the sync takes their keys off a copy that holds them.
   */
  retired?: string[];
}

/**
 * What a parse gives: the records, the entries that could not be read, the list's own version,
 * and the root of the document: the list's own (KEV `vulnerabilities`, OFAC `SDN.CSV`, UK
 * `Designations`, EU `export`) when the body is the list, the root of an XML document of another
 * kind (counted as an error), and null when the body holds no root the parser knows. The sync
 * fails a null root as wrong_root and any error as parse_errors (vrdb/sync.ts).
 */
export interface ParseResult {
  records: ParsedRecord[];
  errors: number;
  /**
   * Entries left out because they do not parse, within what the connector tolerates: the sync
   * applies the rest and logs the number. A connector that tolerates none reports them as errors.
   */
  skipped?: number;
  /** For a list read by its changes, the ids the snapshot retired (`Snapshot.retired`). */
  retired?: string[];
  sourceVersion: string | null;
  root: string | null;
}

/** The connector of a list the sync takes whole, and compares with its copy. */
export interface Connector {
  kind?: "snapshot";
  id: VrdbSourceId;
  /**
   * The version of the connector's parsing: a change of what `parse` gives from the same file gets a
   * new number, which the sync hashes with the download, so that it parses the file again even
   * when its bytes did not change (Ruling 7 of the M2 plan).
   */
  version: number;
  download(fetch: ConnectorFetch, validators: Validators): Promise<Snapshot | "unchanged">;
  parse(snapshot: Snapshot): ParseResult;
}

/**
 * The connector of a list read by its changes (the CVE records, Ruling 8 of the M2 plan): the sync
 * keeps the last day it applied as the list's cursor, and applies the changes of each later day in
 * order, without taking a record off the copy.
 */
export interface IncrementalConnector {
  kind: "incremental";
  id: VrdbSourceId;
  /** The version of the connector's parsing, as for a list taken whole. */
  version: number;
  /**
   * The changes of each day after the cursor, oldest first, or `unchanged` when there is no new
   * day. `now` is the time of the sync: a day is read once it has ended. `through` is the hour
   * (HH00Z, UTC) up to which a day was read from an hourly release, because the list published no
   * end-of-day release for that day.
   */
  download(
    fetch: ConnectorFetch,
    cursor: { day: string } | null,
    now: Date,
  ): Promise<Array<{ day: string; snapshot: Snapshot; through?: string }> | "unchanged">;
  parse(snapshot: Snapshot): ParseResult;
}

/**
 * A database the vendor risk database asks at run time, by a key of the vendor, and whose answers
 * it keeps (readThrough.ts). Its records carry the key among their match keys.
 */
export interface ReadThroughConnector {
  id: VrdbSourceId;
  /**
   * The key the vendor is asked by, and whether it was found by the name alone (Q3); null when the
   * vendor has none. It may ask the database to find it.
   */
  keyOf(
    target: ResearchTarget,
    ctx: { signal: AbortSignal; fetchJson: FetchJson },
  ): Promise<{ key: string; weak: boolean } | null>;
  /** The records the database holds for the key. It throws a FetchError when it cannot ask. */
  fetch(
    key: string,
    ctx: { now: Date; signal: AbortSignal; fetchJson: FetchJson; readPage?: PageReader },
  ): Promise<ReadThroughFetched>;
}

/** What a read-through source answered for a key. */
export interface ReadThroughFetched {
  records: ParsedRecord[];
  /**
   * The first day (YYYY-MM-DD) of the window the answer holds in full, when it does: the copy then
   * takes the key off a stored record published since that day that the answer lacks. Null for an
   * answer that may be partial, and for a source whose answers cover no window.
   */
  coversSince: string | null;
}

/** A file cut at its size limit: it is not the list, and the sync fails as too_large. */
export class BodyTooLargeError extends Error {
  constructor() {
    super("The file is larger than its limit.");
    this.name = "BodyTooLargeError";
  }
}

/** A feed that names no file of the list at the operator's own address: the sync fails as feed_without_file. */
export class FeedWithoutFileError extends Error {
  constructor() {
    super("The feed names no file of the list.");
    this.name = "FeedWithoutFileError";
  }
}

/** A download that is a file, but not of the list: the sync fails as wrong_root. */
export class NotTheListError extends Error {
  constructor() {
    super("The file is not the list.");
    this.name = "NotTheListError";
  }
}

const DAY_MONTH_YEAR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

/**
 * A day of a list as YYYY-MM-DD, from `dd/mm/yyyy` or from an ISO 8601 date or date and time (its
 * own day, whatever the zone); null for anything else, a day that does not exist included.
 */
export function dayOf(text: string | null | undefined): string | null {
  const value = (text ?? "").trim();
  const dayMonthYear = DAY_MONTH_YEAR.exec(value);
  const iso = ISO_DAY.exec(value);
  const parts = dayMonthYear
    ? [dayMonthYear[3], dayMonthYear[2], dayMonthYear[1]]
    : iso
      ? [iso[1], iso[2], iso[3]]
      : null;
  if (parts === null) return null;
  const day = parts.join("-");
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}

/** The text of an answer read whole. A body cut at its limit is refused. */
export function bodyText(response: GuardedResponse): string {
  if (response.truncated) throw new BodyTooLargeError();
  return decodeBody(response.body, response.contentType);
}
