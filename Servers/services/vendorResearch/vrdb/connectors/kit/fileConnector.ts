/**
 * The connector factory of the list kit: what every connector of a mirrored list has in common, so
 * that a new list is a spec (where its files are, how to read them, what a row becomes) and not
 * another copy of the same hardening.
 *
 * Download. The files of the spec are asked in order through the sync's fetch (the page guard's
 * conditional GET), each with the limits of its own. An answer must come from the pinned host after
 * the redirects (`isPinned`), a 304 included, or the download fails as not allowed; a file cut at its
 * limit fails as too large; and what the spec's reader does not take for the list fails as not the
 * list. The reader sees the bytes and nothing is parsed twice. A list of one file is asked with the
 * validators of the last download, and a 304 is `unchanged`; a list of several files is asked in full
 * every time, since a snapshot holds one pair of validators and a 304 on one file would say nothing
 * of the others: the sync's hash of the body tells an unchanged list. A list that needs more (a
 * first request that gives the address of the second, a join) fetches for itself (`fetchFiles`),
 * pins what it asks, and is trusted with nothing else.
 *
 * The version of the reading. The etag that a snapshot stores is `k<version>:<the server's etag>`
 * (the prefix alone when the file has none). A download sends the stored validators only when the
 * etag begins with the prefix of the version that reads now, and then without the prefix: the first
 * download after a bump of `version`, or after older code, sends none, so that a server that would
 * answer 304 gives the file again, and the new reading parses it (a 304 is `unchanged`, which the
 * sync returns before it hashes the version). A spec that fetches for itself gets the validators
 * without the prefix and returns its own etag; the factory puts the prefix on it. The reader sees
 * the server's etag as it is (`Fetched.etag`).
 *
 * A read that is partial is no read. The reader says whether its rows are the whole list
 * (`ReadResult.complete`, required): one that stopped at its limit of rows, at a quote that was
 * never closed, at a row of too many columns, or before the last page, has given part of a list,
 * and a list taken in part would mark every record that it lacks as gone. The download then fails
 * as too large. A reader that fails (a `JSON.parse` of an HTML page, a date out of range) has found
 * no list: any error of it that is not one of the download's own (`FetchError`,
 * `BodyTooLargeError`, `NotTheListError`) is `NotTheListError`, which the sync does not retry.
 *
 * The same holds for the rest of what a spec's code or a hostile file can break. An error out of
 * the spec's own fetch (`fetchFiles`) or of the sync's fetch that is not one of the download's own
 * is `NotTheListError`; the download's own are those three and `ZipError` (the sync gives each its
 * own code, and reads the status and the wait off a `FetchError`), and they come out as the same
 * object. So is a throw of the spec's `sortKey` or of `JSON.stringify`
 * for a row (a bigint, a cycle, a `toJSON` that throws). Each of these is deterministic: the same
 * file makes it again, and the sync retries an error that it does not know. What is thrown holds
 * no address, no row and nothing of the error that was caught.
 *
 * The snapshot has one body: the rows the reader gave, sorted by the spec's key (`compareText`, so
 * that no locale decides) and, for rows of one key, by the canonical JSON text of the row (never by
 * the position in the file, so that the order of the rows of a file never makes a list new and
 * never decides which of two rows of one id survives), as one canonical JSON text with the count of
 * the rows the reader saw and of those it could not read. A row must survive JSON (`P` is plain
 * data).
 *
 * Parse. The records are built from the body, one row at a time, so that a row that the record
 * builder refuses (`UnreadableEntry`) leaves out that row only. Such rows and the reader's own are
 * counted, and so is a record whose id an earlier record has when it is not the same record (the
 * store keeps the first, and the other is data that the copy lacks; a record that is equal to the
 * first is dropped without a word). They are measured against the rows of the body and the rows
 * that the reader could not read: up to ten, or a hundredth of them when that is more, and never
 * more than a tenth, they are `skipped` and the sync applies the rest; more is a new format, and
 * they are `errors`, which fail the sync. A reader that groups rows into entities counts in
 * entities: its `rows` are the entities, its `unreadable` the groups it could not make, and `total`
 * may be the raw rows. A body that is not the one the download makes has no root.
 *
 * It logs nothing and keeps no address and no message in an error: an error of the file can carry
 * the address of a list that has a token in it, and the sync stores a fixed code.
 */
import { isDeepStrictEqual } from "util";
import type { VrdbSourceId } from "../../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError, type Validators } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { ZipError } from "../../zip";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
} from "../types";
import { type Pin, isPinned } from "./address";
import { compareText, isObject, unreadableAllowed } from "./clean";
import { UnreadableEntry } from "./record";

/** A file of a list. */
export interface FileSpec {
  url: string;
  /** The most bytes of the file, after decompression; a longer file fails the sync as too large. */
  maxBytes: number;
  /** The media types the answer may have, without parameters. */
  contentTypes: readonly string[];
  /** The time for the whole download of the file; default 120,000 ms. */
  timeoutMs?: number;
}

/** What a download of the files gives the reader. */
export interface Fetched {
  /** The bytes of each file, in the order of the spec's files. */
  buffers: Buffer[];
  /** The Content-Type of each file as the server sent it, parameters included. */
  contentTypes: string[];
  /** The validators of the file when there is one, as the server sent them; null for several. */
  etag: string | null;
  lastModified: string | null;
  /** The bytes downloaded, all files together. */
  bytes: number;
}

/** What the reader makes of the files. */
export interface ReadResult<P> {
  /** The rows that could be read: the entities, for a reader that groups rows. */
  rows: P[];
  /**
   * The rows that the reader saw, those that could not be read included: at least `rows.length +
   * unreadable`, which the body is refused without. A reader that groups may count the raw rows.
   */
  total: number;
  /** The rows that it saw and could not read: the groups that it could not make, for a grouping reader. */
  unreadable: number;
  /**
   * Whether `rows` are the whole list. False for a reader that stopped at its limit of rows, at a
   * quote that was never closed or at a row of too many columns, or before the last page of a list
   * that is paged: the download then fails as too large. The table and JSON readers say it
   * themselves (`complete` of kit/table.ts and kit/json.ts), and a connector passes it on. Required,
   * so that no reader can leave it out.
   */
  complete: boolean;
}

export interface ListSpec<P> {
  id: VrdbSourceId;
  /**
   * Bump when the records change from the same file: the sync then parses it again, even when the
   * server says that the file is current (the etag of a snapshot carries the version).
   */
  version: number;
  /** The document's name: the root that a parse of the list gives, the sync's `wrong_root` when it is not. */
  root: string;
  /**
   * The canonical order of the rows, so that the hash never depends on the order of the file. It
   * returns a text: any other value fails the download as not the list, and so does an error that
   * it throws.
   */
  sortKey(row: P): string;
  /** The files, asked in order; exactly one file means a conditional GET. */
  files?: readonly FileSpec[];
  /**
   * Where the answer to each file must come from, after redirects, a 304 included. Required with
   * `files`. Each path prefix is a directory with a slash at each end (`/odi/ffdd/`); the factory
   * refuses a pin whose prefix is not.
   */
  pin?: Pin;
  /**
   * A multi-step fetch of the spec's own, in place of `files`: it pins what it asks. It is given the
   * validators without the prefix of the version, or none, and returns the server's etag as it is.
   * It throws the download's own errors (`FetchError`, `BodyTooLargeError`, `NotTheListError`,
   * `ZipError`), which come out as they are; any other error it throws fails the download as not
   * the list.
   */
  fetchFiles?(fetch: ConnectorFetch, validators: Validators): Promise<Fetched | "unchanged">;
  /**
   * The rows of the files; null when they are not the list. A pure function of hostile input: it
   * limits the rows and the columns, cleans every cell (kit/clean.ts, kit/table.ts), and says
   * whether it read the whole list (`complete`). An error that it throws is taken for a file that is
   * not the list (`NotTheListError`); only the errors of a download (`FetchError`,
   * `BodyTooLargeError`, `NotTheListError`) pass as they are.
   */
  read(fetched: Fetched): ReadResult<P> | null;
  /**
   * The records of rows, built with `recordOf`, which throws `UnreadableEntry` for a row that
   * cannot be one. It is called once for each row, with that row alone: a list whose record is made
   * of several rows groups them in `read`. It is strict: any other error is a bug of the spec, and
   * fails the parse.
   */
  toRecords(rows: readonly P[]): ParsedRecord[];
  /** The list's own version or date, from the rows; null when it has none. */
  sourceVersion?(rows: readonly P[]): string | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;
/** The version of the body's form; another is no body of this factory. */
const BODY_VERSION = 1;

/** The prefix of the stored etags that a reading of a version makes. */
const etagPrefixOf = (version: number): string => `k${version}:`;

/**
 * The validators to send for the stored ones: none, when the etag is not behind the prefix of this
 * version (a snapshot of another version, of older code, or of none); else the server's own etag
 * (null when there was none) and the date.
 */
function validatorsOf(stored: Validators, prefix: string): Validators {
  const { etag } = stored;
  if (typeof etag !== "string" || !etag.startsWith(prefix)) return {};
  const rest = etag.slice(prefix.length);
  return { etag: rest === "" ? null : rest, lastModified: stored.lastModified ?? null };
}

/** The files in order, each with its limits, each pinned: the download of a spec that has `files`. */
async function downloadFiles(
  files: readonly FileSpec[],
  pin: Pin,
  fetch: ConnectorFetch,
  validators: Validators,
): Promise<Fetched | "unchanged"> {
  const single = files.length === 1;
  const buffers: Buffer[] = [];
  const contentTypes: string[] = [];
  let bytes = 0;
  let etag: string | null = null;
  let lastModified: string | null = null;

  for (const file of files) {
    const response = await fetch(file.url, single ? validators : {}, {
      maxBytes: file.maxBytes,
      allowedContentTypes: file.contentTypes,
      totalTimeoutMs: file.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (response.notModified) {
      // Nothing was sent that could make a 304 the answer to one of several files.
      if (!single) throw new FetchError("unreachable");
      // A 304 says that the file at the address that answered is current: that address is checked.
      if (!isPinned(response.url, pin)) throw new FetchError("not_allowed");
      return "unchanged";
    }
    // The error holds no address: it can carry a token.
    if (!isPinned(response.url, pin)) throw new FetchError("not_allowed");
    if (response.truncated) throw new BodyTooLargeError();
    buffers.push(response.body);
    contentTypes.push(response.contentType);
    bytes += response.body.length;
    if (single) {
      etag = response.etag;
      lastModified = response.lastModified;
    }
  }
  return { buffers, contentTypes, etag, lastModified, bytes };
}

/** The way a spec fetches: its own, or its files; a spec with neither is refused when it is made. */
function fetcherOf<P>(
  spec: ListSpec<P>,
): (fetch: ConnectorFetch, validators: Validators) => Promise<Fetched | "unchanged"> {
  const own = spec.fetchFiles?.bind(spec);
  if (own !== undefined) return own;
  const { files, pin } = spec;
  if (files === undefined || files.length === 0 || pin === undefined) {
    throw new Error("A list needs files and a pin, or a fetch of its own.");
  }
  return (fetch, validators) => downloadFiles(files, pin, fetch, validators);
}

/**
 * Refuses, when the connector is made, a pin whose path prefix is not a directory with a slash at
 * each end: `/odi` would let `/odi-other/` through, and `odi/` no path has. The message names no
 * host and no prefix.
 */
function checkPin(pin: Pin | undefined): void {
  for (const prefix of pin?.pathPrefixes ?? []) {
    if (typeof prefix !== "string" || !prefix.startsWith("/") || !prefix.endsWith("/")) {
      throw new Error("A path prefix of a pin must begin and end with a slash.");
    }
  }
}

/**
 * What an error of the files' download is to the sync. The download's own errors come out as they
 * are (the same object), since the sync reads its code, its status and its wait off them: the
 * fetch's (`FetchError`), a file cut at its limit, a file that is not the list, and the archive's
 * (`ZipError`, whose code the sync maps by itself). Any other error is a bug of the spec's code or
 * what a hostile answer did to it (a `JSON.parse` of an HTML page, a null where a text was
 * expected): the same answer makes it again, and the sync retries an error that it does not know
 * and does not retry `NotTheListError`. What comes out holds nothing of the error: its message may
 * carry an address with a token.
 */
function downloadFailureOf(error: unknown): Error {
  if (
    error instanceof FetchError ||
    error instanceof BodyTooLargeError ||
    error instanceof NotTheListError ||
    error instanceof ZipError
  ) {
    return error;
  }
  return new NotTheListError();
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * What the spec's reader makes of the files, or the failure of a download. Its own errors are the
 * file's fault (it is hostile input), and they are deterministic: the sync does not retry
 * `NotTheListError`, and it does retry an error that it does not know. A reader that is not
 * complete has read part of a list, and a list taken in part would mark every record that it lacks
 * as gone. The counts that a parse of the body would refuse are refused now.
 */
function readOf<P>(spec: ListSpec<P>, fetched: Fetched): ReadResult<P> {
  let result: unknown;
  try {
    result = spec.read(fetched);
  } catch (error) {
    if (
      error instanceof FetchError ||
      error instanceof BodyTooLargeError ||
      error instanceof NotTheListError
    ) {
      throw error;
    }
    throw new NotTheListError();
  }
  if (!isObject(result)) throw new NotTheListError();
  if (result.complete !== true) throw new BodyTooLargeError();
  const { rows, total, unreadable } = result;
  if (
    !Array.isArray(rows) ||
    !isCount(total) ||
    !isCount(unreadable) ||
    total < rows.length + unreadable
  ) {
    throw new NotTheListError();
  }
  return { rows, total, unreadable, complete: true };
}

/**
 * The one body of a snapshot: canonical, whatever the order of the rows of the file. The text of
 * each row is written once, sorted by, and put in the body as it is.
 */
function bodyOf<P>(result: ReadResult<P>, sortKey: (row: P) => string): string {
  const keyed = result.rows.map((row) => {
    let key: unknown;
    let json: string;
    try {
      key = sortKey(row);
      // JSON writes what it cannot (undefined, a function) as null inside an array.
      json = JSON.stringify(row) ?? "null";
    } catch {
      // A row that cannot be keyed or written (a bigint, a cycle, a toJSON that throws) is no row
      // of a list, and the file makes it again: not an error to retry, and not one to quote, since
      // its message can hold the text of the row.
      throw new NotTheListError();
    }
    // A key that is no text would make every row a tie.
    if (typeof key !== "string") throw new NotTheListError();
    return { key, json };
  });
  keyed.sort((a, b) => compareText(a.key, b.key) || compareText(a.json, b.json));
  const rows = keyed.map(({ json }) => json).join(",");
  return `{"v":${BODY_VERSION},"rows":[${rows}],"total":${result.total},"unreadable":${result.unreadable}}`;
}

/** The parts of a body, or null when the text is not one that `bodyOf` made. */
function partsOf(text: string): { rows: unknown[]; total: number; unreadable: number } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(body) || body.v !== BODY_VERSION) return null;
  const { rows, total, unreadable } = body;
  if (!Array.isArray(rows) || !isCount(total) || !isCount(unreadable)) return null;
  // The reader's total counts the rows it saw, those it could not read included.
  if (total < rows.length + unreadable) return null;
  return { rows, total, unreadable };
}

const notTheList = (): ParseResult => ({ records: [], errors: 1, sourceVersion: null, root: null });

/** The connector of a list whose files a spec describes (see the comment of this file). */
export function createFileConnector<P>(spec: ListSpec<P>): Connector {
  checkPin(spec.pin);
  const fetching = fetcherOf(spec);
  const prefix = etagPrefixOf(spec.version);
  return {
    id: spec.id,
    version: spec.version,
    async download(fetch, validators) {
      const sent = validatorsOf(validators, prefix);
      let fetched: Fetched | "unchanged";
      try {
        // The call is inside the guard: a fetch that throws before it returns a promise is caught too.
        fetched = await fetching(fetch, sent);
      } catch (error) {
        throw downloadFailureOf(error);
      }
      if (fetched === "unchanged") return "unchanged";

      const result = readOf(spec, fetched);
      return {
        bodies: [bodyOf(result, spec.sortKey)],
        etag: `${prefix}${fetched.etag ?? ""}`,
        lastModified: fetched.lastModified,
        bytes: fetched.bytes,
      };
    },
    parse(snapshot) {
      const parts = snapshot.bodies.length === 1 ? partsOf(snapshot.bodies[0]) : null;
      if (parts === null) return notTheList();
      // The body is this factory's own JSON: its rows are what the reader gave.
      const rows = parts.rows as P[];

      const records: ParsedRecord[] = [];
      const kept = new Map<string, ParsedRecord>();
      let unreadable = parts.unreadable;
      for (const row of rows) {
        let made: ParsedRecord[];
        try {
          made = spec.toRecords([row]);
        } catch (error) {
          if (!(error instanceof UnreadableEntry)) throw error;
          unreadable += 1;
          continue;
        }
        for (const record of made) {
          const first = kept.get(record.sourceRecordId);
          if (first === undefined) {
            // The store keeps the first record of an id, and so does this.
            kept.set(record.sourceRecordId, record);
            records.push(record);
          } else if (!isDeepStrictEqual(first, record)) {
            // A record that is lost, and not a copy of the one kept: data that the copy lacks.
            unreadable += 1;
          }
        }
      }

      const refused = unreadable > unreadableAllowed(rows.length + parts.unreadable);
      return {
        records,
        errors: refused ? unreadable : 0,
        skipped: refused ? 0 : unreadable,
        sourceVersion: spec.sourceVersion?.(rows) ?? null,
        root: spec.root,
      };
    },
  };
}
