/**
 * The FDA list of AI-enabled medical devices (spec D2.17): one public CSV file, keyless, with a row
 * for each device that the FDA has authorized (cleared, granted or approved) and that uses AI. The
 * FDA's site says its content may be republished freely, so the list is public domain.
 *
 * A row is a device, and one company has dozens of them (the most has 67 in the file of
 * 2026-09-04), so a record is a company: the name the list writes most often, how many devices it
 * has on the list, the first and the latest day of their final decisions, and the three newest
 * devices. Rows are grouped by the compact form of the company (compactName: "Acme Scan, Inc." and
 * "ACME SCAN INC" are one), and every spelling the file uses for it is a name key. The list holds no
 * identifier, no website and no vendor field, so a match is by name alone and weak. The text of
 * each record says that the list records authorizations, a status, and not an incident, a recall
 * or an adverse event; the lookup offers it as of the copy (vrdb/lookup.ts: a state).
 *
 * The file has one fixed address. The server sends Last-Modified and no ETag, so the download is
 * conditional on the stored Last-Modified, and its day is the source version. The page guard does
 * not expose Content-Disposition, which would name the file, so the file is told from another by
 * where it came from and by what it holds: the answer must come from www.fda.gov after redirects,
 * and the header row must hold exactly the six columns of the list. The first fails the download
 * as wrong_root (NotTheListError), the second gives no root. No address enters a record or an error.
 *
 * Dates are MM/DD/YYYY. The shared `dayOf` reads dd/mm/yyyy, so it would drop every date past the
 * 12th and swap the others: `fdaDayOf` reads them.
 *
 * A row that cannot be read (no company, no submission number, a date that is none) is left out and
 * counted (`skipped`) up to ten rows, or a hundredth of the rows when that is more, as for the CVE
 * records (Q7); more than that is a new format and the file is refused (`errors`). The real file
 * has a few cells with a tab or a line break around a name, trailing commas, and 34 device names
 * with a control character in place of a trade mark, dash or quotation mark: the bytes 0x80 to
 * 0x9F of windows-1252 that were read as ISO 8859-1 before the file was written as UTF-8. Cells are
 * cleaned, and those characters are put back.
 */
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, cutAtCodePoint } from "../../text";
import { nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { readCsv } from "./ofac";
import { type Connector, NotTheListError, bodyText } from "./types";

export const FDA_URL = "https://www.fda.gov/media/178541/download?attachment";
/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FDA_RECORD_MARK = "FDA list of AI-enabled medical devices";
/** The file is 141 KB today (1,614 rows); the limit holds some 24,000 rows. */
export const FDA_MAX_BYTES = 2 * 1024 * 1024;
const FDA_TYPES = ["text/csv", "application/octet-stream"];
const FDA_TOTAL_TIMEOUT_MS = 60_000;
/** The only host the file may come from, after redirects. */
const FDA_HOST = "www.fda.gov";
/** The root of the document: the name of the file. */
const FDA_ROOT = "aiml-devices-csv.csv";

/** The header row of the list: exactly these columns, in this order. */
export const FDA_COLUMNS = [
  "Date of Final Decision",
  "Submission Number",
  "Device",
  "Company",
  "Panel (Lead)",
  "Primary Product Code",
] as const;
const DATE = 0;
const SUBMISSION = 1;
const DEVICE = 2;
const COMPANY = 3;
const PANEL = 4;
const CODE = 5;

/** The rows read, the header included. A file past this is not the list. */
const MAX_ROWS = 20_000;
/** The devices a record names. */
const MAX_NEWEST = 3;
/** The longest key of a company: its id, and the query parameter of its address. */
const MAX_KEY_CHARS = 160;
/**
 * A company or a submission number longer than this is none, and its row is left out. The longest
 * in the file have 61 characters and 12.
 */
const MAX_COMPANY_CHARS = 200;
const MAX_SUBMISSION_CHARS = 60;
/**
 * A device name, a panel or a product code longer than this is cut and says so. The longest in the
 * file have 438 characters, 27 and 3.
 */
const MAX_DEVICE_CHARS = 500;
const MAX_FIELD_CHARS = 100;
/** What a cell that was cut ends with, so that nobody takes the part kept for the whole. */
const SHORTENED = " [shortened]";
/** The rows that do not parse and may be left out whatever the size of the file. */
const MAX_UNREADABLE = 10;

const CLOSING =
  "The list records FDA marketing authorizations of devices that use AI; it is not a record of incidents, recalls or adverse events.";

const DOCUMENTATION_PAGE = vrdbSourceOf("fda_ai_devices").documentationUrl;

/**
 * How many rows may be left out because they do not parse: ten, or a hundredth of the file's rows
 * when that is more. More than that is not an odd row but a change of the format, and the file is
 * refused.
 */
const unreadableAllowed = (rows: number): number =>
  Math.max(MAX_UNREADABLE, Math.floor(rows / 100));

/** `YYYY-MM-DD` for a year, a month and a day that exist (month and day of one or two digits). */
function existingDay(year: string, month: string, day: string): string | null {
  const text = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${text}T00:00:00Z`);
  // The date parser carries a 30th of February over to March: only a day it gives back as it was
  // written exists.
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

const MONTH_DAY_YEAR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * A day of the list as YYYY-MM-DD, from `MM/DD/YYYY` (the month first: 06/29/2026 is 2026-06-29;
 * the month and the day may lack their leading zero); null for anything else, a day that does not
 * exist included. It is not `dayOf` of connectors/types.ts, which reads the day first.
 */
export function fdaDayOf(text: string | null | undefined): string | null {
  const parts = MONTH_DAY_YEAR.exec((text ?? "").trim());
  return parts === null ? null : existingDay(parts[3], parts[1], parts[2]);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HTTP_DATE = /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) \d{2}:\d{2}:\d{2} GMT$/;

/** The day of a Last-Modified header (an HTTP date, in GMT) as YYYY-MM-DD; null for anything else. */
function lastModifiedDay(header: string | null): string | null {
  const parts = HTTP_DATE.exec((header ?? "").trim());
  const month = parts === null ? -1 : MONTHS.indexOf(parts[2]);
  return parts === null || month < 0 ? null : existingDay(parts[3], String(month + 1), parts[1]);
}

/** Whether an address is the file's: https, the host www.fda.gov, no port other than 443, no user. */
function isFdaAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === FDA_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/**
 * What the bytes 0x80 to 0x9F are in windows-1252, as code points. The five bytes it leaves
 * undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) stand for themselves.
 */
const WINDOWS_1252_C1 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const C1_CONTROLS = /[\x80-\x9f]/g;

/** A control character U+0080 to U+009F as windows-1252 reads its byte; nothing for an undefined one. */
function windows1252Of(control: string): string {
  const code = WINDOWS_1252_C1[control.charCodeAt(0) - 0x80];
  return code >= 0x80 && code <= 0x9f ? "" : String.fromCodePoint(code);
}

/**
 * A cell as one line of plain text: no control characters (the ones of windows-1252 are put back),
 * white space collapsed to one blank, none around it. Every step is linear in the cell's length,
 * whatever it holds.
 */
const lineOf = (cell: string): string =>
  cleanText(cell).replace(C1_CONTROLS, windows1252Of).replace(/\s+/g, " ").trim();

/** The text without the commas and blanks at its end. It looks at the end only, so the time is linear. */
function withoutTrailingCommas(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === "," || text[end - 1] === " ")) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}

/** The text as it is when it has at most `max` characters, else cut so that it and the marker have. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${cutAtCodePoint(text, max - SHORTENED.length).trimEnd()}${SHORTENED}`;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const withoutBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** Whether a row is the header of the list: its six columns, by name and in order. */
const isListHeader = (row: readonly string[] | undefined): boolean =>
  row !== undefined &&
  row.length === FDA_COLUMNS.length &&
  FDA_COLUMNS.every((name, at) => lineOf(row[at]) === name);

/** A device on the list, as a row says it. */
interface Device {
  day: string;
  submission: string;
  device: string;
  panel: string;
  code: string;
}

/** A way the file writes the name of a company, how often, and the latest decision that used it. */
interface Spelling {
  text: string;
  count: number;
  latest: string;
}

interface Company {
  spellings: Map<string, Spelling>;
  devices: Device[];
  first: string;
  latest: string;
}

/**
 * The company and the device of a row of cleaned cells; null when the row cannot be read: it does
 * not have six cells, no company (nothing but punctuation is none), a company or a submission
 * number longer than any the list holds, no submission number, or a date that is none.
 */
function readRow(
  cells: readonly string[],
): { key: string; company: string; device: Device } | null {
  if (cells.length !== FDA_COLUMNS.length) return null;
  const day = fdaDayOf(cells[DATE]);
  const submission = cells[SUBMISSION];
  const company = withoutTrailingCommas(cells[COMPANY]);
  if (
    day === null ||
    submission === "" ||
    submission.length > MAX_SUBMISSION_CHARS ||
    company.length > MAX_COMPANY_CHARS
  ) {
    return null;
  }
  const key = cutAtCodePoint(compactName(company), MAX_KEY_CHARS);
  if (key === "") return null;
  return {
    key,
    company,
    device: {
      day,
      submission,
      device: shorten(cells[DEVICE], MAX_DEVICE_CHARS),
      panel: shorten(cells[PANEL], MAX_FIELD_CHARS),
      code: shorten(cells[CODE], MAX_FIELD_CHARS),
    },
  };
}

function addDevice(
  companies: Map<string, Company>,
  { key, company, device }: { key: string; company: string; device: Device },
): void {
  let entry = companies.get(key);
  if (entry === undefined) {
    entry = { spellings: new Map(), devices: [], first: device.day, latest: device.day };
    companies.set(key, entry);
  }
  entry.devices.push(device);
  if (device.day < entry.first) entry.first = device.day;
  if (device.day > entry.latest) entry.latest = device.day;
  const spelling = entry.spellings.get(company);
  if (spelling === undefined) {
    entry.spellings.set(company, { text: company, count: 1, latest: device.day });
  } else {
    spelling.count += 1;
    if (device.day > spelling.latest) spelling.latest = device.day;
  }
}

/**
 * The spelling the file uses most comes first. A tie goes to the one of the newer decision, and a
 * tie of that to the text, so that the record does not depend on the order of the rows.
 */
const bySpelling = (a: Spelling, b: Spelling): number =>
  b.count - a.count || compareText(b.latest, a.latest) || compareText(a.text, b.text);

/** The newest decision first, and the higher submission number first on one day. */
const newestFirst = (a: Device, b: Device): number =>
  compareText(b.day, a.day) || compareText(b.submission, a.submission);

function deviceText(entry: Device): string {
  const facts = [
    entry.submission,
    `decided ${entry.day}`,
    entry.panel === "" ? "" : `panel ${entry.panel}`,
    entry.code === "" ? "" : `product code ${entry.code}`,
  ].filter((fact) => fact !== "");
  return `${entry.device === "" ? "Unnamed device" : entry.device} (${facts.join(", ")})`;
}

function recordOf(key: string, entry: Company): ParsedRecord {
  const spellings = [...entry.spellings.values()].sort(bySpelling);
  const company = spellings[0].text;
  const newest = [...entry.devices].sort(newestFirst).slice(0, MAX_NEWEST);
  return {
    sourceRecordId: key,
    recordType: "ai_device_authorizations",
    title: `FDA AI-enabled medical devices: ${company}`,
    summary: joinSentences([
      `${FDA_RECORD_MARK} (fda.gov).`,
      sentence("Company", company),
      sentence(
        "Devices on the list",
        `${entry.devices.length}, with final decisions from ${entry.first} to ${entry.latest}`,
      ),
      sentence("Newest", newest.map(deviceText).join("; ")),
      CLOSING,
    ]),
    url: `${DOCUMENTATION_PAGE}?company=${encodeURIComponent(key)}`,
    identifiers: {
      company,
      devices: entry.devices.length,
      newestSubmissionNumbers: newest.map((device) => device.submission),
    },
    matchKeys: nameKeysOf(spellings.map((spelling) => spelling.text)),
    publishedAt: entry.latest,
    sourceUpdatedAt: null,
  };
}

export const fdaConnector: Connector = {
  id: "fda_ai_devices",
  version: 1,
  async download(fetch, validators) {
    const response = await fetch(FDA_URL, validators, {
      maxBytes: FDA_MAX_BYTES,
      allowedContentTypes: FDA_TYPES,
      totalTimeoutMs: FDA_TOTAL_TIMEOUT_MS,
    });
    // The guard follows redirects and says where the answer came from; a 304 is checked as well,
    // since it says the file at that address is current.
    if (!isFdaAddress(response.url)) throw new NotTheListError();
    if (response.notModified) return "unchanged";
    return {
      bodies: [bodyText(response)],
      etag: response.etag,
      lastModified: response.lastModified,
      bytes: response.body.length,
    };
  },
  parse(snapshot) {
    const { rows, cut, more } = readCsv(withoutBom(snapshot.bodies[0] ?? ""), MAX_ROWS);
    const [header, ...body] = rows;
    if (!isListHeader(header)) return { records: [], errors: 1, sourceVersion: null, root: null };

    const companies = new Map<string, Company>();
    let read = 0;
    let unreadable = 0;
    for (const row of body) {
      const cells = row.map(lineOf);
      // A blank line, a row of empty cells and an end-of-file mark are no row.
      if (cells.every((cell) => cell === "")) continue;
      read += 1;
      const entry = readRow(cells);
      if (entry === null) unreadable += 1;
      else addDevice(companies, entry);
    }
    const refused = unreadable > unreadableAllowed(read);
    return {
      records: [...companies].map(([key, entry]) => recordOf(key, entry)),
      // A file that ends inside a quoted cell was cut short, and one of more rows than the list can
      // hold is not the list: each is an error.
      errors: (cut === null ? 0 : 1) + (more ? 1 : 0) + (refused ? unreadable : 0),
      skipped: refused ? 0 : unreadable,
      sourceVersion: lastModifiedDay(snapshot.lastModified),
      root: FDA_ROOT,
    };
  },
};
