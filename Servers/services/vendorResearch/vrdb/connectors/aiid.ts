/**
 * The AI Incident Database (AIID) of the Responsible AI Collaborative (spec D2.14): a public index
 * of incidents in which an AI system is alleged to have caused or nearly caused harm. It is built
 * and tested behind the closed gate Q29 (gates.ts): the incidents collection is CC BY-SA 4.0, but
 * the site's terms bar commercial exploitation of "any aspect of the Site" without permission, so
 * until the operator confirms or the product owner accepts the risk the list is never downloaded,
 * scheduled or looked up.
 *
 * The operator publishes one bulk file a week, an Excel export, in a public bucket of its own. The
 * file's name carries the export's date, so its address is read from the operator's page of
 * snapshots at every sync: the connector takes the greatest date among the links to the pinned
 * bucket's host and a file of that name, keeps the address in a local variable only, and asks for
 * the file with the validators of the last one. Nothing it hands back or throws holds an address.
 * One page and at most one file a week is the operator's own bulk channel; no page of an incident
 * is ever fetched.
 *
 * Only the `Incidents` sheet is read, and the workbook is read on the hardened readers (xlsx.ts),
 * never on a spreadsheet library. `download` unzips the workbook and keeps the XML of that one
 * sheet (and the shared strings when it has any: the export has none, its cells are inline strings)
 * as the snapshot's bodies, the first of which is the export's date (YYYYMMDD), the list's version.
 * `parse` reads the cells. Of the sheet's columns it reads the id, the date, the title, the
 * description (written by the database's editors), the developer, the deployer and the count of
 * reports. It never reads `harmed` (people and small businesses, the victims), `Editors` (ids of
 * contributors), `Editor Notes`, `Data Sources`, the taxonomy columns, `Implicated Systems`, or
 * the sheets of the reports and the entities: the report text is what the licence leaves out.
 *
 * An incident is matched to a vendor by the names of its developer and deployer alone, so a match
 * is weak and its finding can reach Low at best. Each cell lists entities between commas; a part
 * that names a kind of party ("Facial Recognition Developers", "Unknown") and not a party is not a
 * name. The text of a record says in its last sentence that the database records allegations.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, collapseBlanks, cutAtCodePoint } from "../../text";
import { nameKeysOf } from "../keys";
import type { ParsedRecord } from "../types";
import { decodeEntities } from "../xmlScan";
import {
  type CellValue,
  type SheetLimits,
  dayOfExcelSerial,
  readSheetParts,
  sheetRowsOf,
} from "../xlsx";
import type { ZipLimits } from "../zip";
import {
  BodyTooLargeError,
  type Connector,
  FeedWithoutFileError,
  NotTheListError,
  bodyText,
  dayOf,
} from "./types";

export const AIID_SNAPSHOTS_URL = "https://incidentdatabase.ai/research/snapshots/";
/** The public bucket the operator publishes its exports in: the one host the file is read from. */
export const AIID_EXPORT_HOST = "pub-72b2b2fc36ec423189843747af98f80e.r2.dev";
/** What the text of a record begins with, and what the analysis prompt names it by. */
export const AIID_RECORD_MARK = "AI Incident Database";
const RECORD_PAGE = "https://incidentdatabase.ai/cite/";
const SHEET_NAME = "Incidents";
const SHEET_ROOT = "worksheet";

/** The page of snapshots is a few kilobytes of links. */
const PAGE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  allowedContentTypes: ["text/html"],
  totalTimeoutMs: 30_000,
};
/** The export was 2.6 MB on 2026-11-02, with 1,784 incidents. */
const FILE_LIMITS = {
  maxBytes: 16 * 1024 * 1024,
  allowedContentTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  totalTimeoutMs: 120_000,
};
/** The `Incidents` sheet was 6.7 MB inflated on 2026-11-02; the limits hold some seven times that. */
export const AIID_ZIP_LIMITS: ZipLimits = {
  maxEntries: 64,
  maxEntryBytes: 48 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
};
/** 1,787 rows and 59 columns on 2026-11-02; the sheet gains some 400 incidents a year. */
export const AIID_SHEET_LIMITS: SheetLimits = { maxRows: 20_000, maxColumns: 256 };

/** The address of an export: https, the pinned host, any folders, then the file named by its date. */
const EXPORT_ADDRESS = new RegExp(
  `^https://${AIID_EXPORT_HOST.replace(/\./g, "\\.")}/(?:[^?#\\s"'<>\\\\]*/)?AIID_Excel_Export-(\\d{8})\\.xlsx$`,
);
const EXPORT_NAME_START = "AIID_Excel_Export-";
/** What ends an address in the text of a page: a quote, a bracket, white space, a comma. */
const ADDRESS_END = /^[\s"'<>\\),;\]]$/;
/** A name is the start, eight digits of a date, and the extension. */
const EXPORT_NAME_CHARS = EXPORT_NAME_START.length + 8 + ".xlsx".length;
/** How far before a file's name its address can start: the host and any folders. */
const MAX_ADDRESS_PREFIX_CHARS = 400;
const EXPORT_DATE = /^[0-9]{8}$/;

/** The column A of the header row is this, and the header is among the first rows. */
const HEADER_CELL = "Incident ID";
const HEADER_ROWS = 10;

/** The longest description, with the marker of a shortened one (as the OFAC remarks are, ofac.ts). */
const MAX_DESCRIPTION_CHARS = 600;
const SHORTENED = " [shortened]";
/** The longest title or list of entities: the longest of the export is 528 characters. */
const MAX_FIELD_CHARS = 1000;
const MAX_INCIDENT_ID_DIGITS = 9;

/** An HTML tag, or a comment or declaration without a `<` or `>` in it; `<5 and 7>` is not one. */
const TAG = /<\/?[A-Za-z!?][^<>]*>/g;
/** `[text](url)`, the url with at most one level of parentheses; each part is read once. */
const MARKDOWN_LINK = /\[([^[\]]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/g;
const BLANK_LINE = /\r?\n[^\S\r\n]*\r?\n/;

/**
 * The last words that make a part of an entity list a kind of party and not a party: an incident
 * that lists "Facial Recognition Developers" as its developer names no company. The first eight
 * are the ruling's (R5); the rest are the kinds of party that the export of 2026-11-02 lists most
 * (a quarter of its keys were such parts: "Scammers", "Deepfake creators", "Students"). A word is
 * here only when no company is likely to end its name with it.
 */
const KIND_OF_PARTY_WORDS: ReadonlySet<string> = new Set([
  "developers",
  "deployers",
  "users",
  "operators",
  "companies",
  "researchers",
  "individuals",
  "systems",
  "actors",
  "creators",
  "scammers",
  "criminals",
  "cybercriminals",
  "hackers",
  "stalkers",
  "phishers",
  "students",
  "minors",
  "boys",
  "lawyers",
  "firms",
  "drivers",
  "authors",
  "writers",
  "teachers",
  "doctors",
  "tourists",
]);

/**
 * The parts that are a kind of party or none whole, where their last word alone would also drop a
 * party: "Immigration and Customs Enforcement" is an agency, "Law enforcement" is not.
 */
const KIND_OF_PARTY_PARTS: ReadonlySet<string> = new Set([
  "unknown",
  "none",
  "unnamed",
  "lawenforcement",
]);

const isDay = (date: string): boolean =>
  dayOf(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`) !== null;

/**
 * The export with the greatest date among the links the page names, and its address; null for
 * none. A link counts when its address is https, on the pinned host, without a query or a
 * fragment, and ends in `AIID_Excel_Export-<YYYYMMDD>.xlsx` with a date that exists. The page is
 * read as text, from each file name back to the `https://` before it and on to the character after
 * it, so that a link counts whichever way the page writes it, and each name costs a bounded look
 * at the text around it.
 */
function latestExportIn(page: string): { address: string; date: string } | null {
  let latest: { address: string; date: string } | null = null;
  for (
    let at = page.indexOf(EXPORT_NAME_START);
    at !== -1;
    at = page.indexOf(EXPORT_NAME_START, at + EXPORT_NAME_START.length)
  ) {
    // The name must end the address: a query, a fragment or a longer name is another address.
    const after = page.charAt(at + EXPORT_NAME_CHARS);
    if (after !== "" && !ADDRESS_END.test(after)) continue;
    const before = page.slice(Math.max(0, at - MAX_ADDRESS_PREFIX_CHARS), at);
    const start = before.lastIndexOf("https://");
    if (start === -1) continue;
    const address = before.slice(start) + page.slice(at, at + EXPORT_NAME_CHARS);
    const date = EXPORT_ADDRESS.exec(address)?.[1];
    if (date === undefined || !isDay(date)) continue;
    if (latest === null || date > latest.date) latest = { address, date };
  }
  return latest;
}

/** Whether an address is on the operator's bucket, over https. */
function isExportHost(address: string): boolean {
  try {
    const url = new URL(address);
    return (
      url.protocol === "https:" &&
      url.hostname === AIID_EXPORT_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

const oneLine = (text: string): string => collapseBlanks(text).trim();

/** The characters that are no one's text: format characters (zero-width, soft hyphen, byte order mark, the tag characters that spell invisible ASCII) and variation selectors. */
const HIDDEN = /[\p{Cf}\p{Variation_Selector}]/gu;
/** A line or paragraph separator of Unicode, which is a line break to a reader. */
const SEPARATORS = /[\p{Zl}\p{Zp}]/gu;

/**
 * The text as a reader sees it: the separators of Unicode as line breaks and the hidden characters
 * gone. Taken out before a paragraph is split (a zero-width space on a blank line would keep a
 * second paragraph in the first) and again after the references are decoded (one can spell them).
 */
const visible = (text: string): string => text.replace(SEPARATORS, "\n").replace(HIDDEN, "");

const textOf = (value: CellValue | undefined): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

/** A cell as one line of plain text, no longer than MAX_FIELD_CHARS. */
const lineOf = (value: CellValue | undefined): string =>
  cutAtCodePoint(oneLine(cleanText(visible(textOf(value)))), MAX_FIELD_CHARS);

/** A description of more than MAX_DESCRIPTION_CHARS, cut between two words and said to be cut. */
function shortened(text: string): string {
  if (text.length <= MAX_DESCRIPTION_CHARS) return text;
  const head = cutAtCodePoint(text, MAX_DESCRIPTION_CHARS - SHORTENED.length);
  const atWord = text.charAt(head.length) === " " ? head.length : head.lastIndexOf(" ");
  return `${(atWord > 0 ? head.slice(0, atWord) : head).trimEnd()}${SHORTENED}`;
}

/**
 * The description of an incident as its record keeps it: tags out, a link of the form [text](url)
 * reduced to its text, the character references decoded once and last (so that a tag they spell is
 * out too), the first paragraph (up to the first blank line) as one line, and no more than
 * MAX_DESCRIPTION_CHARS. The editors write a plain sentence or three, so this changes nothing in
 * them; it keeps a description that carried markup from putting it before the model.
 */
export function aiidDescriptionOf(text: string): string {
  const reduced = visible(text).replace(TAG, "").replace(MARKDOWN_LINK, "$1");
  const decoded = visible(decodeEntities(reduced)).replace(TAG, "");
  return shortened(oneLine(cleanText(decoded.trim().split(BLANK_LINE, 1)[0])));
}

/** Whether a part of an entity list names a kind of party, or none ("Unknown"), and not a party. */
function isKindOfParty(part: string): boolean {
  if (KIND_OF_PARTY_PARTS.has(compactName(part))) return true;
  const words = part.split(" ");
  return KIND_OF_PARTY_WORDS.has(compactName(words[words.length - 1]));
}

/** The parties a cell lists: its parts between commas, without the kinds of party. */
const partiesOf = (cell: string): string[] =>
  cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !isKindOfParty(part));

/** The id of an incident as digits: a whole number from 1 as a number or as text; null for any other cell. */
function incidentIdOf(value: CellValue | undefined): string | null {
  const text = typeof value === "number" ? String(value) : textOf(value).trim();
  return /^[1-9][0-9]*$/.test(text) && text.length <= MAX_INCIDENT_ID_DIGITS ? text : null;
}

/** The count of reports as digits; empty for a cell that is no whole number from 0. */
function reportCountOf(value: CellValue | undefined): string {
  const text = typeof value === "number" ? String(value) : textOf(value).trim();
  return /^(?:0|[1-9][0-9]*)$/.test(text) && text.length <= MAX_INCIDENT_ID_DIGITS ? text : "";
}

/** The place of each column the connector reads in the header row. */
interface Columns {
  id: number;
  date: number;
  title: number;
  description: number;
  deployer: number;
  developer: number;
  reportCount: number | null;
}

/**
 * The header row, the first of the first ten whose column A is `Incident ID` (the export has a
 * title and a row of groups above it), and the columns by their names; null when no row is one or
 * when it lacks a column the connector needs. A column of the same name twice is the first.
 */
function headerOf(rows: readonly CellValue[][]): { index: number; columns: Columns } | null {
  const index = rows
    .slice(0, HEADER_ROWS)
    .findIndex((row) => typeof row[0] === "string" && row[0].trim() === HEADER_CELL);
  if (index === -1) return null;
  const places = new Map<string, number>();
  rows[index].forEach((cell, column) => {
    const name = typeof cell === "string" ? cell.trim() : "";
    if (name !== "" && !places.has(name)) places.set(name, column);
  });
  const id = places.get(HEADER_CELL);
  const date = places.get("date");
  const title = places.get("title");
  const description = places.get("description");
  const deployer = places.get("deployer");
  const developer = places.get("developer");
  if (
    id === undefined ||
    date === undefined ||
    title === undefined ||
    description === undefined ||
    deployer === undefined ||
    developer === undefined
  ) {
    return null;
  }
  return {
    index,
    columns: {
      id,
      date,
      title,
      description,
      deployer,
      developer,
      reportCount: places.get("report_count") ?? null,
    },
  };
}

/** An incident as a record; null for a row without an id, without a title or with a date that is no day. */
function recordOf(row: readonly CellValue[], columns: Columns): ParsedRecord | null {
  const id = incidentIdOf(row[columns.id]);
  const title = lineOf(row[columns.title]);
  const dateCell = row[columns.date];
  const day = typeof dateCell === "number" ? dayOfExcelSerial(dateCell) : null;
  if (id === null || title === "" || day === null) return null;
  const developer = lineOf(row[columns.developer]);
  const deployer = lineOf(row[columns.deployer]);
  const reports = columns.reportCount === null ? "" : reportCountOf(row[columns.reportCount]);

  return {
    sourceRecordId: id,
    recordType: "ai_incident",
    title: `Incident ${id}: ${title}`,
    summary: joinSentences([
      `${AIID_RECORD_MARK} (incidentdatabase.ai).`,
      sentence("Incident", id),
      sentence("Title", title),
      sentence("Date of the incident", day),
      sentence("Alleged developer", developer),
      sentence("Alleged deployer", deployer),
      sentence(
        "Description, written by the database's editors",
        aiidDescriptionOf(textOf(row[columns.description])),
      ),
      sentence("Reports linked to the incident", reports),
      "The database records allegations as reported; it does not establish them.",
    ]),
    url: `${RECORD_PAGE}${id}`,
    identifiers: {
      incidentId: id,
      ...(developer === "" ? {} : { developer }),
      ...(deployer === "" ? {} : { deployer }),
    },
    matchKeys: nameKeysOf([...partiesOf(developer), ...partiesOf(deployer)]),
    publishedAt: day,
    sourceUpdatedAt: null,
  };
}

/**
 * How many rows may be left out because they do not parse: ten, or a hundredth of the rows when
 * that is more, as for the CVE records (cve.ts `cveUnreadableAllowed`, Q7). More than that is not
 * an odd row but a change of the format.
 */
const unreadableAllowed = (rows: number): number => Math.max(10, Math.floor(rows / 100));

export const aiidConnector: Connector = {
  id: "aiid",
  version: 1,
  async download(fetch, validators) {
    const page = await fetch(AIID_SNAPSHOTS_URL, {}, PAGE_LIMITS);
    // Nothing was sent to make a 304 an answer; one is not the page.
    if (page.notModified) throw new FetchError("unreachable");
    const latest = latestExportIn(bodyText(page));
    if (latest === null) throw new FeedWithoutFileError();
    let response;
    try {
      response = await fetch(latest.address, validators, FILE_LIMITS);
    } catch (error) {
      // The page guard's own errors have fixed messages; another may name the address, so it does
      // not leave here.
      if (error instanceof FetchError || error instanceof BodyTooLargeError) throw error;
      throw new Error("The file of the AI Incident Database could not be read.");
    }
    // The guard follows redirects: the file counts only if the operator's bucket served it.
    if (!isExportHost(response.url)) throw new FeedWithoutFileError();
    if (response.notModified) return "unchanged";
    if (response.truncated) throw new BodyTooLargeError();
    const parts = readSheetParts(response.body, SHEET_NAME, AIID_ZIP_LIMITS);
    // A serial counts days from another day in a workbook of 1904, and the dates would be wrong.
    if (parts.date1904) throw new NotTheListError();
    return {
      bodies: [
        latest.date,
        parts.sheetXml,
        ...(parts.sharedStringsXml === null ? [] : [parts.sharedStringsXml]),
      ],
      etag: response.etag,
      lastModified: response.lastModified,
      bytes: response.body.length,
    };
  },
  parse(snapshot) {
    const [exportDate, sheetXml, sharedStringsXml] = snapshot.bodies;
    if (exportDate === undefined || !EXPORT_DATE.test(exportDate) || sheetXml === undefined) {
      return { records: [], errors: 1, sourceVersion: null, root: null };
    }
    const sheet = sheetRowsOf(sheetXml, sharedStringsXml ?? null, AIID_SHEET_LIMITS);
    const header = sheet.root === SHEET_ROOT ? headerOf(sheet.rows) : null;
    if (header === null) {
      return { records: [], errors: sheet.errors + 1, sourceVersion: null, root: null };
    }

    const records: ParsedRecord[] = [];
    let rows = 0;
    let unreadable = 0;
    for (const row of sheet.rows.slice(header.index + 1)) {
      // A blank row is no row: a sheet may end in some.
      if (row.every((cell) => cell === null || (typeof cell === "string" && cell.trim() === ""))) {
        continue;
      }
      rows += 1;
      const record = recordOf(row, header.columns);
      if (record === null) unreadable += 1;
      else records.push(record);
    }
    // A row that does not parse is left out and counted (`skipped`), as for the CVE records. More
    // than the list tolerates is a sign of a new format: they are reported as `errors`, and the
    // sync refuses the file.
    const refused = unreadable > unreadableAllowed(rows);
    return {
      records,
      errors: sheet.errors + (refused ? unreadable : 0),
      skipped: refused ? 0 : unreadable,
      sourceVersion: exportDate,
      root: SHEET_NAME,
    };
  },
};
