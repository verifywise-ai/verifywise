/**
 * The Government of Canada AI Register as a mirrored list of the vendor risk database: the open
 * dataset fcbc0200-79ba-4fa4-94a6-00e32facea6b of open.canada.ca, published by the Treasury Board of
 * Canada Secretariat under the Open Government Licence - Canada. The register is a CSV of the
 * federal AI systems, as the departments themselves report them, with a free-text column that names
 * the vendor of a system. A record is one vendor key and the systems whose vendor information names
 * it. It is a state (a snapshot of what departments reported, as of its release), a statement of
 * the departments and no finding about the vendor, and the register says that no update is planned:
 * the text of a record names the release.
 *
 * Two requests, 20 seconds apart (the Crawl-delay of open.canada.ca, kit/pause.ts):
 *
 * 1. The dataset record (`package_show`, JSON). It must be the dataset, with the licence
 *    `ca-ogl-lgo`, and hold exactly one CSV resource in English. The resource's address is not
 *    stable (its file name carries the release, and a new release may be a new resource), so it is
 *    read from the record every time, and it must be the portal's own address of a CSV file of this
 *    dataset. The record's contact fields are never read.
 * 2. That CSV. The portal redirects it to a signed address of its storage host; the answer must
 *    come from the storage host under the directory of the resources. The signed address is never
 *    kept, logged or put in an error: the page guard follows the redirect, and only the host and the
 *    path of the answer are checked.
 *
 * The record says when the file was last modified and how big it is. Those, with the resource's id,
 * are the validator of this list (`<resource id>|<last_modified>|<size>`, in `lastModified`): when
 * it equals the stored one the download answers `unchanged` after the first request, with no second
 * request and no pause. The day of `last_modified` is the release the records are dated by, and
 * passes to `read` in a second, small buffer (`{"release": "YYYY-MM-DD"}`).
 *
 * The file has a byte order mark, CRLF row ends and bare line feeds inside quoted cells; it has 24
 * columns of which six are read by name. Everything else is dropped before a row is built: the
 * prose columns (descriptions, capabilities, data sources, results, personal information banks:
 * text that departments wrote, outside what a vendor record needs), every French column, the primary
 * users, the personal information and notification flags, the year of the status and `developed_by_en`
 * (which is read to know the file, and never printed).
 *
 * The vendor of a system is `vendor_information`, typed by hand: several names in one cell, with a
 * comma, a slash, a semicolon or a line break between them, and a comma that is part of a legal
 * form ("Acme Inc, Subs"). An ampersand is no separator: "Acme & Sons" is one firm, and splitting
 * it would make a record of a half name that is the exact name of another company. A cell is split
 * into its names; a name is a key when it is not a
 * placeholder and has at least four letters and digits once its legal form is off (`AWS` and `IBM`
 * give none). The key of a vendor is `compactName(shortName(name))`: "Open AI" and "OpenAI" are
 * one, and "Microsoft Azure" stays apart from "Microsoft". The register's own system ids carry the
 * fiscal year ("2526-...") and are not stable from release to release: they are kept in the
 * identifiers only.
 *
 * Cut texts. The vendor cell is cut at 200 units and the name that the cut ended is no name (the
 * test is the marker that the cut writes, not the length of the line: the cut takes a blank before
 * it off and never splits a pair of surrogates, so a cut line can be shorter than the cap). A cell
 * that was cut is read only up to its last real separator (a semicolon, a line break, " / "): its
 * last name goes with all that follows that separator, commas included, since a comma before a legal
 * form joins two parts of one name and the cut can fall right after that comma or inside the legal
 * form, where the join cannot be told; a cut cell with no such separator names no vendor. No real
 * cell is that long (the longest has 95 units). The id and the keys of a vendor hold its whole
 * name, and so does `identifiers.vendor` (an identifier is never a cut text); only the title and
 * the text show it cut at 80 units. The departments of a vendor are counted by the whole English
 * part of the cell, and only the three that are named are cut; a cell that does not fit 300 units
 * as a line is left out of the count. A vendor cell longer than `lineOf` reads (a megabyte) makes
 * its row unreadable: it would read as naming no vendor.
 *
 * Natural persons: no rule tells a person from a company in this column (the best was one hit in
 * five), and the one person that the file names in 127 names is a sole trader that a department
 * itself names as the supplier. None is applied: the residual under one percent is accepted, and a
 * record names the operator's own statement, whoever the supplier is.
 *
 * The reader groups the rows into vendors: its `rows` are the vendors, its `unreadable` the rows of
 * another width than the header and those with a vendor cell that is too long to read, and its
 * `total` the rows that it saw (or the vendors, when a few rows name many). A file of fewer than 200
 * data rows is not this list (412 today), and one of more than 5,000 rows, of more than 5,000
 * vendors, of a row of more than 100 cells or that ends inside a quote is cut: the download fails as
 * too large and never gives a shorter list.
 */
import { FetchError, type Validators } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  LINE_INPUT_MAX,
  SHORTENED,
  compareText,
  dayText,
  isObject,
  lineOf,
  lineWithin,
  shorten,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { pinnedFetch } from "./kit/paging";
import { type Sleep, pauseFor, realSleep } from "./kit/pause";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, columnsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector, ConnectorFetch } from "./types";
import { NotTheListError } from "./types";

/** What the text of a record begins with, and what the analysis prompt names the list by. */
export const CANADA_AI_REGISTER_RECORD_MARK = "Government of Canada AI Register";

/** The host as the first sentence of a record writes it. */
const HOST = "open.canada.ca";
const DATASET_ID = "fcbc0200-79ba-4fa4-94a6-00e32facea6b";
const LICENCE_ID = "ca-ogl-lgo";
/** The dataset is the list's one stable name: the file's own name carries the release. */
const ROOT = DATASET_ID;
const PACKAGE_URL = `https://${HOST}/data/api/action/package_show?id=${DATASET_ID}`;
const DOCUMENTATION_URL = `https://${HOST}/data/en/dataset/${DATASET_ID}`;

/** Where the dataset record may come from, after the redirects. */
const PACKAGE_PIN: Pin = { hosts: [HOST], pathPrefixes: ["/data/api/action/"] };
/** Where the file may come from, after the portal's redirect: its storage host, the resources only. */
const FILE_PIN: Pin = {
  hosts: ["opencanada.blob.core.windows.net"],
  pathPrefixes: ["/opengovprod/resources/"],
};

const PACKAGE_LIMITS = {
  maxBytes: 1_048_576,
  allowedContentTypes: ["application/json"],
  totalTimeoutMs: 60_000,
};
const FILE_LIMITS = {
  maxBytes: 8_388_608,
  allowedContentTypes: ["text/csv", "application/octet-stream"],
  totalTimeoutMs: 120_000,
};

/** The portal's own address of a CSV file of this dataset; the group is the resource's id. */
const RESOURCE_URL = new RegExp(
  `^https://open\\.canada\\.ca/data/dataset/${DATASET_ID}/resource/([0-9a-f-]{36})/download/` +
    "[A-Za-z0-9._-]{1,200}\\.csv$",
);
const RESOURCE_URL_MAX_CHARS = 2048;
/** `last_modified` of a resource: a day, or a day and time (CKAN writes `2026-03-14T09:26:53.123456`). */
const MODIFIED = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const MODIFIED_MAX_CHARS = 40;
/** The longest validator that is stored: id, `last_modified` and size together. */
const VALIDATOR_MAX_CHARS = 200;
const DIGITS = /^\d+$/;

/** The columns that are read, by their exact names; the file is not the list without all of them. */
const WANTED = {
  registerId: "ai_register_id",
  system: "name_ai_system_en",
  department: "government_organization",
  vendor: "vendor_information",
  developedBy: "developed_by_en",
  status: "ai_system_status_en",
} as const;

/** A file of fewer data rows is not this list (412 today). */
const MIN_ROWS = 200;
/** A file of more data rows is cut by its limit, and fails as too large. */
const MAX_ROWS = 5000;
/** The register has 24 columns; a row of more than this many is no row of it. */
const MAX_COLUMNS = 100;
/** The most vendors of a list (120 today): more is a file that names a thousand vendors in a row. */
const MAX_VENDORS = 5000;

/** The longest vendor cell that is read: a longer cell is cut, and the name that the cut ended is no name. */
const VENDOR_CELL_MAX = 200;
const VENDOR_KEY_MIN_CHARS = 4;
/** The id of a record is its key: no key of a vendor is longer. */
const VENDOR_KEY_MAX_CHARS = 160;
const DISPLAY_MAX = 80;
/**
 * The longest department cell (`English / French`) that is counted: a cell that does not fit as a
 * line is left out of the count, never cut into a name to count by (`departmentOf`).
 */
const DEPARTMENT_CELL_MAX = 300;
/** The longest department as it is shown: a longer name is cut for the text and counted whole. */
const DEPARTMENT_MAX = 80;
const SYSTEM_NAME_MAX = 60;
const STATUS_CELL_MAX = 40;
const REGISTER_ID_CELL_MAX = 80;
const NAMES_MAX = 5;
const DEPARTMENTS_SHOWN = 3;
const SYSTEMS_SHOWN = 3;
const REGISTER_IDS_MAX = 20;

/** `2526-AcRe-AcRe-001`: a fiscal year and the department's own letters and digits (mixed case occurs). */
const REGISTER_ID = /^[0-9]{4}-[A-Za-z0-9-]{3,60}$/;

/** A line break in a vendor cell separates two names, as a semicolon does. */
const LINE_BREAKS = /[\r\n]+/g;
/** A word that makes the comma before it part of a legal form: "Gamma Corp, Subs", "Acme, Inc.". */
const LEGAL_FORM_AHEAD = /^\s*(?:inc|ltd|llc|corp|corporation|limited|subs)(?![\p{L}\p{N}])/iu;
/** What a department writes when it names no vendor. */
const PLACEHOLDER =
  /^(?:n\/?a|none|unknown|not applicable|tbd|in[- ]house|internal|government of canada|open source)$/i;
/** Besides blanks, the punctuation that is cut off both ends of a name. */
const END_PUNCTUATION = new Set([".", ",", ";", ":", "-"]);

type StatusKey = "production" | "development" | "retired" | "none";

/** The status of a system as the register writes it (the spellings vary in case and in blanks). */
const STATUS_OF: ReadonlyMap<string, StatusKey> = new Map<string, StatusKey>([
  ["in production", "production"],
  ["in development", "development"],
  ["retired", "retired"],
]);
/** The order that the names of a record's systems are listed in: those in use first. */
const STATUS_RANK: Readonly<Record<StatusKey, number>> = {
  production: 0,
  development: 1,
  retired: 2,
  none: 3,
};

/** The vendor, with the systems whose vendor information names it: the row of this list. */
interface VendorRow {
  /** `compactName(shortName(name))`: stable, and the same for "Open AI" and "OpenAI". */
  id: string;
  /** The spelling that most systems use, cut to at most DISPLAY_MAX characters: for the title and the text only. */
  display: string;
  /**
   * The distinct spellings, whole, the most used first, at most NAMES_MAX: the names the keys are made
   * of. The first is the one that `display` is cut from, and the vendor of the identifiers.
   */
  names: string[];
  /** How many systems name the vendor (a system once, however often its cell names it). */
  systems: number;
  status: Record<StatusKey, number>;
  /**
   * The departments with the most systems, at most DEPARTMENTS_SHOWN: the English part of the name, cut
   * to DEPARTMENT_MAX for the text (the count below is of the whole names).
   */
  departments: string[];
  /** The departments that name the vendor, all of them, each counted by its whole English part. */
  departmentCount: number;
  /** The names of at most SYSTEMS_SHOWN systems, the ones in use first. */
  systemNames: string[];
  /** The register's own ids of the systems that have one in the form it has, at most REGISTER_IDS_MAX. */
  registerIds: string[];
  /** The day of the release the register's file is of: the same in every row. */
  release: string;
}

interface Resource {
  url: string;
  release: string;
  /** `<resource id>|<last_modified>|<size>`: what tells a new release, stored in `lastModified`. */
  validator: string;
}

/** The text of an answer, decoded as every list of the kit is (charset, byte order mark). */
const answerText = (response: { body: Buffer; contentType: string }): string =>
  textOf(
    {
      buffers: [response.body],
      contentTypes: [response.contentType],
      etag: null,
      lastModified: null,
      bytes: response.body.length,
    },
    0,
  );

/** A resource that is a CSV file and says that it is in English. */
const isEnglishCsv = (item: unknown): item is Record<string, unknown> =>
  isObject(item) &&
  typeof item.format === "string" &&
  item.format.trim().toUpperCase() === "CSV" &&
  Array.isArray(item.language) &&
  item.language.includes("en");

/** The size as a text of digits; nothing for a size that is none (the record has resources with none). */
function sizeText(size: unknown): string {
  if (typeof size === "number") return Number.isSafeInteger(size) && size >= 0 ? String(size) : "";
  return typeof size === "string" && DIGITS.test(size) ? size : "";
}

/**
 * The CSV resource of the dataset record, or `NotTheListError`: the record must be the dataset's
 * (its id, the licence), and hold exactly one CSV in English, at the portal's own address of a CSV
 * file of this dataset. The record's other fields, the contact ones included, are not read.
 */
function resourceOf(response: { body: Buffer; contentType: string }): Resource {
  const record = jsonOf(answerText(response));
  if (!isObject(record) || record.success !== true || !isObject(record.result)) {
    throw new NotTheListError();
  }
  const { result } = record;
  if (
    result.id !== DATASET_ID ||
    result.license_id !== LICENCE_ID ||
    !Array.isArray(result.resources)
  ) {
    throw new NotTheListError();
  }
  const csvs: unknown[] = result.resources.filter(isEnglishCsv);
  if (csvs.length !== 1 || !isObject(csvs[0])) throw new NotTheListError();
  const { id, url, last_modified: modified, size } = csvs[0];

  if (typeof id !== "string" || typeof url !== "string" || typeof modified !== "string") {
    throw new NotTheListError();
  }
  const address = url.length <= RESOURCE_URL_MAX_CHARS ? RESOURCE_URL.exec(url) : null;
  // The resource's own id is the one its address names: a record that says otherwise is not this one.
  if (address === null || address[1] !== id) throw new NotTheListError();
  if (modified.length > MODIFIED_MAX_CHARS || !MODIFIED.test(modified)) {
    throw new NotTheListError();
  }
  const release = dayText(modified.slice(0, 10));
  if (release === null) throw new NotTheListError();

  const validator = `${id}|${modified}|${sizeText(size)}`;
  if (validator.length > VALIDATOR_MAX_CHARS) throw new NotTheListError();
  return { url, release, validator };
}

/**
 * The two steps of the download. Nothing is sent that could make a 304 the answer to either
 * request: the dataset record has no validators of its own, and the validator of this list is the
 * resource's composite. The answer to each request must come from where it should (`pinnedFetch`),
 * and the signed address of the file is never kept.
 */
async function fetchRegister(
  fetch: ConnectorFetch,
  validators: Validators,
  sleep: Sleep,
): Promise<Fetched | "unchanged"> {
  const record = await pinnedFetch(fetch, PACKAGE_PIN)(PACKAGE_URL, {}, PACKAGE_LIMITS);
  if (record.notModified) throw new FetchError("unreachable");
  const resource = resourceOf(record);
  // The release is the same file: one request, no pause, and the file is not asked.
  if (validators.lastModified === resource.validator) return "unchanged";

  await pauseFor(HOST, sleep);
  const file = await pinnedFetch(fetch, FILE_PIN)(resource.url, {}, FILE_LIMITS);
  if (file.notModified) throw new FetchError("unreachable");
  return {
    buffers: [file.body, Buffer.from(JSON.stringify({ release: resource.release }))],
    contentTypes: [file.contentType, "application/json"],
    etag: null,
    lastModified: resource.validator,
    bytes: record.body.length + file.body.length,
  };
}

/** The release day that `fetchRegister` passed on, or null when there is none. */
function releaseOf(fetched: Fetched): string | null {
  if (fetched.buffers.length < 2) return null;
  const given = jsonOf(textOf(fetched, 1));
  return isObject(given) ? dayText(given.release) : null;
}

/** A cell as one clean line without `<` and `>`, cut at `max`. */
const cellOf = (cell: string, max: number): string => withoutAngles(lineOf(cell, max));

/** The text without the blanks and the punctuation of END_PUNCTUATION at either end. */
function trimmed(text: string): string {
  const isCut = (char: string): boolean => char === " " || END_PUNCTUATION.has(char);
  let start = 0;
  let end = text.length;
  while (start < end && isCut(text[start])) start += 1;
  while (end > start && isCut(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/**
 * The text split on commas, except a comma that a legal form follows (Inc, Ltd, LLC, Corp,
 * Corporation, Limited, Subs, in any case, ending the word): that comma is part of the name.
 */
function splitOnCommas(text: string): string[] {
  const parts = text.split(",");
  const names = [parts[0]];
  for (let at = 1; at < parts.length; at += 1) {
    if (LEGAL_FORM_AHEAD.test(parts[at])) names[names.length - 1] += `,${parts[at]}`;
    else names.push(parts[at]);
  }
  return names;
}

/** The pieces of a vendor cell between its separators, not yet trimmed. */
function piecesOf(text: string): string[] {
  const pieces: string[] = [];
  for (const part of text.split(";")) {
    for (const piece of part.split(" / ")) pieces.push(...splitOnCommas(piece));
  }
  return pieces;
}

/**
 * The text of a cell that was cut, up to its last real separator (a semicolon, which a line break
 * became, or " / "): the last name of the cell goes, with everything that follows that separator. What
 * the cut ended is the front of a name, and where that name begins cannot be told when it holds commas:
 * a comma before a legal form is part of the name, the join is decided by the text after the comma, and
 * a cut right after the comma or inside the legal form (`X Corp, Su`) leaves `X Corp` looking like a
 * whole name. So the commas of the tail are no separators here, and a cell with no real separator at
 * all is left out whole (no real cell is that long).
 */
function beforeLastSeparator(text: string): string {
  const at = Math.max(text.lastIndexOf(";"), text.lastIndexOf(" / "));
  return at === -1 ? "" : text.slice(0, at);
}

/**
 * The names of a vendor cell (`vendor_information`) with the key each gives, each spelling once:
 * the cell cut at VENDOR_CELL_MAX (a cell that was cut is read up to its last real separator, and the
 * name that the cut ended is no name: `beforeLastSeparator`) and split at a semicolon, a line break,
 * " / " and a comma that no legal form follows (an ampersand is no separator); the blanks and
 * the punctuation cut off both ends; no placeholder, no name of fewer than four letters and digits
 * once its legal form is off (the key is the id of the record, and a name that short has none), and
 * none whose key is longer than VENDOR_KEY_MAX_CHARS.
 */
function vendorsOf(cell: string): Array<{ key: string; name: string }> {
  const line = cellOf(cell.replace(LINE_BREAKS, ";"), VENDOR_CELL_MAX);
  // The marker is no text of the cell: a cell that was cut is read without it, up to its last real separator.
  const cut = line.endsWith(SHORTENED);
  const pieces = piecesOf(cut ? beforeLastSeparator(line.slice(0, -SHORTENED.length)) : line);

  const seen = new Set<string>();
  const vendors: Array<{ key: string; name: string }> = [];
  for (const piece of pieces) {
    const name = trimmed(piece);
    if (name === "" || seen.has(name) || PLACEHOLDER.test(name)) continue;
    seen.add(name);
    const key = compactName(shortName(name));
    if (key.length < VENDOR_KEY_MIN_CHARS || key.length > VENDOR_KEY_MAX_CHARS) continue;
    vendors.push({ key, name });
  }
  return vendors;
}

/** What the register's rows say of one vendor, while they are read. */
interface Group {
  spellings: Map<string, number>;
  systems: number;
  status: Record<StatusKey, number>;
  departments: Map<string, number>;
  /** The name of each system, with the best rank of the systems of that name. */
  systemNames: Map<string, number>;
  registerIds: Set<string>;
}

const newGroup = (): Group => ({
  spellings: new Map(),
  systems: 0,
  status: { production: 0, development: 0, retired: 0, none: 0 },
  departments: new Map(),
  systemNames: new Map(),
  registerIds: new Set(),
});

/** One system of the register, as far as it is read. */
interface System {
  registerId: string | null;
  name: string;
  /** The English part of its department, whole; an empty text when its cell does not fit (`departmentOf`). */
  department: string;
  status: StatusKey;
  vendors: Array<{ key: string; name: string }>;
}

/**
 * The department of a system, the name that its departments are counted by: the English part of the
 * cell, which is `English / French`, whole and as one clean line without `<` and `>`. A cell that does
 * not fit DEPARTMENT_CELL_MAX units as a line (`lineWithin`: never a cut line, whatever the cut left)
 * names no department that is counted, and neither does an empty one: two departments that share the
 * front of a long name stay two, and a cut text is never the name of one. The cell is bounded as a
 * whole, so a long French part leaves the department out as well. Only what is shown is cut
 * (`rowOf`).
 */
function departmentOf(cell: string): string {
  const line = lineWithin(cell, DEPARTMENT_CELL_MAX);
  return line === null ? "" : withoutAngles(line.split(" / ")[0]);
}

/** The system of a row of cells of the width of the header. */
function systemOf(cells: readonly string[], columns: Record<keyof typeof WANTED, number>): System {
  const registerId = lineOf(cells[columns.registerId], REGISTER_ID_CELL_MAX);
  return {
    registerId: REGISTER_ID.test(registerId) ? registerId : null,
    name: cellOf(cells[columns.system], SYSTEM_NAME_MAX),
    department: departmentOf(cells[columns.department]),
    status: STATUS_OF.get(lineOf(cells[columns.status], STATUS_CELL_MAX).toLowerCase()) ?? "none",
    vendors: vendorsOf(cells[columns.vendor]),
  };
}

/** Adds a system to the group of each vendor it names, once for each; false when there are too many vendors. */
function addSystem(groups: Map<string, Group>, system: System): boolean {
  const spellings = new Map<string, Set<string>>();
  for (const { key, name } of system.vendors) {
    const names = spellings.get(key) ?? new Set<string>();
    names.add(name);
    spellings.set(key, names);
  }
  for (const [key, names] of spellings) {
    let group = groups.get(key);
    if (group === undefined) {
      if (groups.size >= MAX_VENDORS) return false;
      group = newGroup();
      groups.set(key, group);
    }
    group.systems += 1;
    group.status[system.status] += 1;
    for (const name of names) group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    if (system.department !== "") {
      group.departments.set(system.department, (group.departments.get(system.department) ?? 0) + 1);
    }
    if (system.name !== "") {
      const rank = STATUS_RANK[system.status];
      group.systemNames.set(
        system.name,
        Math.min(rank, group.systemNames.get(system.name) ?? rank),
      );
    }
    if (system.registerId !== null) group.registerIds.add(system.registerId);
  }
  return true;
}

/** The entries of a count map, the largest count first and then by text, so that no order of rows decides. */
const byCountThenText = (counts: ReadonlyMap<string, number>): Array<[string, number]> =>
  [...counts].sort(([a, x], [b, y]) => y - x || compareText(a, b));

/** The row of a vendor: every list in the order that never depends on the order of the file. */
function rowOf(key: string, group: Group, release: string): VendorRow {
  const spellings = byCountThenText(group.spellings).map(([name]) => name);
  const departments = byCountThenText(group.departments);
  return {
    id: key,
    display: lineOf(spellings[0], DISPLAY_MAX),
    names: spellings.slice(0, NAMES_MAX),
    systems: group.systems,
    status: group.status,
    // Counted whole, cut only for the text: two names that share their first units are two departments.
    departments: departments
      .slice(0, DEPARTMENTS_SHOWN)
      .map(([name]) => shorten(name, DEPARTMENT_MAX)),
    departmentCount: departments.length,
    systemNames: [...group.systemNames]
      .sort(([a, x], [b, y]) => x - y || compareText(a, b))
      .slice(0, SYSTEMS_SHOWN)
      .map(([name]) => name),
    registerIds: [...group.registerIds].sort(compareText).slice(0, REGISTER_IDS_MAX),
    release,
  };
}

/**
 * The vendors of the register's CSV, or null when the files are not the list (no release, a header
 * without one of the six columns, fewer than MIN_ROWS data rows). A file that was cut (a quote that
 * was never closed, more than MAX_ROWS rows, a row of more than MAX_COLUMNS cells, more than
 * MAX_VENDORS vendors) gives a read that says so, and the download fails as too large, whatever else
 * the file holds. A row of another width than the header is unreadable.
 */
function read(fetched: Fetched): ReadResult<VendorRow> | null {
  const release = releaseOf(fetched);
  if (release === null) return null;
  // The header is one of the rows: one more than the data rows that the list may have.
  const table = readCsvText(textOf(fetched, 0), MAX_ROWS + 1, MAX_COLUMNS);
  const cut: ReadResult<VendorRow> = { rows: [], total: 0, unreadable: 0, complete: false };
  if (!table.complete) return cut;

  const [header] = table.rows;
  if (header === undefined) return null;
  const columns = columnsOf(header, WANTED);
  const total = table.rows.length - 1;
  if (columns === null || total < MIN_ROWS) return null;

  const groups = new Map<string, Group>();
  let unreadable = 0;
  for (let at = 1; at < table.rows.length; at += 1) {
    const cells = cellsOf(table.rows[at], header.length);
    // `lineOf` reads a cell to LINE_INPUT_MAX units, and gives an empty line, with no marker, when that
    // part cleans to nothing: a vendor cell longer than that would read as naming no vendor, and the
    // vendors written after its first megabyte would be lost without a count. It is no cell to read.
    if (cells === null || cells[columns.vendor].length > LINE_INPUT_MAX) {
      unreadable += 1;
    } else if (!addSystem(groups, systemOf(cells, columns))) {
      return cut;
    }
  }
  const rows = [...groups].map(([key, group]) => rowOf(key, group, release));
  return {
    rows,
    // A few rows may name many vendors: the total is never below what was made of them.
    total: Math.max(total, rows.length + unreadable),
    unreadable,
    complete: true,
  };
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isTexts = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every((text) => typeof text === "string");

/** Whether a row of a body is a row of this list: what `read` makes, and nothing else. */
function isVendorRow(value: unknown): value is VendorRow {
  if (!isObject(value)) return false;
  const { id, display, names, systems, status, departments, departmentCount } = value;
  const { systemNames, registerIds, release } = value;
  return (
    typeof id === "string" &&
    typeof display === "string" &&
    isTexts(names, NAMES_MAX) &&
    // The first spelling is the vendor of the identifiers: a row that has none is no row of this list.
    names.length >= 1 &&
    isCount(systems) &&
    systems >= 1 &&
    isObject(status) &&
    isCount(status.production) &&
    isCount(status.development) &&
    isCount(status.retired) &&
    isCount(status.none) &&
    isTexts(departments, DEPARTMENTS_SHOWN) &&
    isCount(departmentCount) &&
    departmentCount >= departments.length &&
    isTexts(systemNames, SYSTEMS_SHOWN) &&
    isTexts(registerIds, REGISTER_IDS_MAX) &&
    typeof release === "string" &&
    dayText(release) === release
  );
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${CANADA_AI_REGISTER_RECORD_MARK} (${HOST}), a register or status list.`;

/** What a record is and is not; second, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "A record is federal departments' own statement that AI systems they use name this vendor in " +
  "their vendor information; it says nothing about the vendor's conduct or the systems' quality.";

/**
 * The last sentence of every record, never cut and never left out: the register is a snapshot that
 * says that it is not updated, and the licence asks for the attribution.
 */
const CLOSING_SENTENCE =
  "The register is not planned to be updated. Contains information licensed under the Open " +
  "Government Licence - Canada; adapted by VerifyWise.";

/** The counts by status as the text writes them: the states that no system is in are left out. */
function statusText(status: Record<StatusKey, number>): string {
  return [
    ["in production", status.production],
    ["in development", status.development],
    ["retired", status.retired],
    ["no status", status.none],
  ]
    .filter(([, count]) => count !== 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");
}

/** A count with its noun: the noun is in the singular when the count is exactly one. */
const nounOf = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The record of a vendor: the register's statement of it, as of its release. */
function recordFor(value: VendorRow): ParsedRecord {
  if (!isVendorRow(value)) throw new UnreadableEntry();
  const row = value;
  const others = row.departmentCount - row.departments.length;
  const reportedBy =
    row.departments.length === 0
      ? ""
      : `, reported by ${row.departments.join(", ")}${others > 0 ? ` and ${nounOf(others, "other department", "other departments")}` : ""}`;
  const systems = nounOf(row.systems, "AI system", "AI systems");
  const counted = `Release of ${row.release}: ${systems} ${row.systems === 1 ? "names" : "name"} it (${statusText(row.status)})${reportedBy}.`;

  return recordOf({
    id: row.id,
    type: "algorithm_register_supplier",
    title: `${CANADA_AI_REGISTER_RECORD_MARK}: ${row.display}`,
    summary: summaryWithClosing(
      [
        FIRST_SENTENCE,
        NOT_A_FINDING,
        sentence("Vendor as written", row.display),
        counted,
        sentence("Systems", row.systemNames.join("; ")),
      ],
      CLOSING_SENTENCE,
      RECORD_SUMMARY_MAX,
    ),
    // One page for the dataset, so that a vendor's address is its own: the portal ignores the query.
    url: `${DOCUMENTATION_URL}?vendor=${encodeURIComponent(row.id)}`,
    // An identifier is never a cut text: the first spelling whole, which the title and
    // the summary show cut as `display`. It is at most VENDOR_CELL_MAX units, far inside the limit.
    identifiers: {
      vendor: row.names[0],
      systems: row.systems,
      release: row.release,
      registerIds: row.registerIds,
    },
    names: row.names,
    publishedAt: null,
    sourceUpdatedAt: null,
  });
}

/**
 * The connector of the register. It waits between its two requests with `sleep` (a timer by
 * default): a test hands it one that does not wait.
 */
export function createCanadaAiRegisterConnector({
  sleep = realSleep,
}: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<VendorRow>({
    id: "canada_ai_register",
    version: 1,
    root: ROOT,
    sortKey: (row) => row.id,
    fetchFiles: (fetch, validators) => fetchRegister(fetch, validators, sleep),
    read,
    toRecords: (rows) => rows.map(recordFor),
    // The body's rows are JSON of any shape until a record is made of them: nothing is assumed.
    sourceVersion: (rows) =>
      rows.reduce<string | null>((latest, row) => {
        const release: unknown = isObject(row) ? row.release : undefined;
        return typeof release === "string" && (latest === null || release > latest)
          ? release
          : latest;
      }, null),
  });
}

export const canadaAiRegisterConnector: Connector = createCanadaAiRegisterConnector();
