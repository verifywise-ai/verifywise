/**
 * The Standing General Order crash reports of the National Highway Traffic Safety Administration
 * (NHTSA; spec D2.16, Q31): the reports that makers of automated driving systems (ADS) and of Level
 * 2 driver assistance (ADAS) must file after a crash, published as three public CSV files, keyless:
 * ADS, ADAS and OTHER. NHTSA publishes no licence for them. They are a work of the United States
 * government and accepted in the way of the OFAC list (Q5, Q31). NHTSA says the data may be
 * incomplete or unverified: a report is what a manufacturer filed, never a finding of fault.
 *
 * A file holds a row for every version of every report (4,201 rows in the three files of
 * 2026-11-05, 116 columns), each with the vehicle, the place, the time and a narrative of the crash.
 * The connector copies none of that. It counts: one record per reporting entity and file, with the
 * number of reports, the highest injury severity alleged, the reports by year of the incident and the
 * three newest. A record per report would let one entity flood a run (one has more than two
 * thousand Level 2 reports) and would put the places of crashes into the database (Ruling R6). Eight
 * columns are read by name and no other, so the VIN, the serial number, the coordinates, the address, the city, the zip
 * code, the time, the narrative, the operating entity, the driver type and every column marked CBI
 * (confidential business information) cannot reach a record. The State of a crash is kept.
 *
 * A vendor is matched by the Reporting Entity alone, as written, without its legal form, and, for a
 * name such as "Acme (Acme Motor Co.)", by the text before the parenthesis and the text inside it.
 * Never by the Make (a vehicle of a robotaxi operator can bear the make of a carmaker) and never by
 * the Operating Entity: the entity that filed the report is the one the list is about (Ruling R5).
 *
 * The dates of the files are months, written `AUG-2026`, and not days (Ruling R10.3). A report
 * counts once, at its highest version; the rows of older versions are dropped, wherever the file
 * lists them (the real files list the newer version first). One real report has no incident month
 * (the column is empty and `Incident Date - Unknown` says Y): it counts in the total and in the
 * severity, and is left out of the years and of the newest reports. So does a report whose date is
 * flagged Y, whatever the cell holds. A date that is there, is no month and is not flagged is not
 * that case, it is a change of the format, and the row is unreadable.
 *
 * A row that cannot be read (no usable report id, version or entity, a month that does not parse,
 * or a number of cells that is not the header's) is left out and counted (`skipped`) up to ten, or a
 * hundredth of the rows when that is more, as the CVE records are (connectors/cve.ts); more is a
 * new format, and they are reported as `errors`, which fails the sync.
 *
 * The three files are asked in full every day, with no conditional GET: a snapshot holds one pair of
 * validators, and the sync's hash of the three bodies tells an unchanged list. They are read only
 * from NHTSA's own directory. No address enters a record or an error.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, cutAtCodePoint } from "../../text";
import { nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { readCsv } from "./ofac";
import { type Connector, bodyText } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const NHTSA_RECORD_MARK = "NHTSA Standing General Order crash reports";

const FILE_HOST = "static.nhtsa.gov";
const FILE_DIRECTORY = "/odi/ffdd/sgo-2021-01/";

type Automation = "ads" | "adas" | "other";

/**
 * The files in the order they are asked and read, with what a record says of the automation in
 * each. The files are 2.8 MB (ADS), 2.5 MB (ADAS) and 34 KB (OTHER) on 2026-11-05. Every report of
 * OTHER says `Unknown, see Narrative` in `Automation System Engaged?` that day: the reporter did
 * not say whether an ADS or a Level 2 system was engaged, so the record does not name one.
 */
const FILES: ReadonlyArray<{ automation: Automation; url: string; label: string }> = [
  {
    automation: "ads",
    url: `https://${FILE_HOST}${FILE_DIRECTORY}SGO-2021-01_Incident_Reports_ADS.csv`,
    label: "Automated Driving System",
  },
  {
    automation: "adas",
    url: `https://${FILE_HOST}${FILE_DIRECTORY}SGO-2021-01_Incident_Reports_ADAS.csv`,
    label: "Level 2 driver assistance",
  },
  {
    automation: "other",
    url: `https://${FILE_HOST}${FILE_DIRECTORY}SGO-2021-01_Incident_Reports_OTHER.csv`,
    label: "automation not identified",
  },
];

/** The limit of each file: about ten times the largest of today. */
export const NHTSA_MAX_BYTES = 32 * 1024 * 1024;
const NHTSA_TYPES = ["text/csv", "application/csv", "application/octet-stream"];
const NHTSA_TOTAL_TIMEOUT_MS = 120_000;
const NHTSA_ROOT = "SGO-2021-01_Incident_Reports";

/**
 * The most reports (rows under the header) a file may hold. The largest file of the real list has
 * 2,574 on 2026-11-05 and 32 MiB cannot hold many more than 25,000 of the 116-column rows, so a file
 * past this is not the list: the reader stops there instead of holding millions of short rows.
 */
export const NHTSA_MAX_ROWS = 60_000;

/** The rows of the three files that may be left out because they do not parse, whatever the size. */
export const NHTSA_MAX_UNREADABLE = 10;

/**
 * How many rows of the three files may be left out because they do not parse: ten, or a hundredth
 * of all the rows when that is more. More is a change of the format, and the sync refuses the list.
 */
export const nhtsaUnreadableAllowed = (rows: number): number =>
  Math.max(NHTSA_MAX_UNREADABLE, Math.floor(rows / 100));

/** The longest entity name, the longest compact name (the key of a record) and the longest short cell. */
const MAX_ENTITY_CHARS = 200;
const MAX_KEY_CHARS = 160;
const MAX_CELL_CHARS = 60;
/** The newest reports a record lists. */
const NEWEST_SHOWN = 3;

/** An id of the files looks like `30270-12345`; one with a space or markup in it is no id. */
const REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const VERSION = /^\d{1,6}$/;

/** The sentence every text ends with, so that nobody reads a count as a finding (Ruling R10.4). */
const NOT_A_FINDING =
  "The Standing General Order requires these reports; a report is not a finding of fault, and counts depend on fleet size and reporting rules.";

const MONTH_NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTH_TEXT = /^([A-Za-z]{3})-(\d{4})$/;
/** The order began in 2021; a year outside these is a value that is not a year of the list. */
const FIRST_YEAR = 2000;
const LAST_YEAR = 2099;

/**
 * A month of the files, `AUG-2026` (three letters of an English month, then the year), as
 * `YYYY-MM`; null for anything else. The case and the white space around it are tolerated.
 */
export function nhtsaMonthOf(text: string): string | null {
  const match = MONTH_TEXT.exec(text.trim());
  if (match === null) return null;
  const name = match[1].toLowerCase();
  const month = MONTH_NAMES.findIndex((candidate) => candidate.toLowerCase() === name);
  const year = Number(match[2]);
  if (month === -1 || year < FIRST_YEAR || year > LAST_YEAR) return null;
  return `${match[2]}-${String(month + 1).padStart(2, "0")}`;
}

/** `YYYY-MM` as `Aug 2026`. */
const monthLabel = (month: string): string =>
  `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

export type NhtsaSeverity = "fatality" | "serious" | "moderate" | "minor" | "none" | "unknown";

/**
 * The bucket of a `Highest Injury Severity Alleged`: Fatality; Serious, Moderate and Minor, each
 * with or without hospitalization; No Injured Reported, with or without property damage; and
 * anything else, an empty cell included, unknown.
 */
export function nhtsaSeverityOf(text: string): NhtsaSeverity {
  const value = text.trim().toLowerCase();
  if (value === "fatality") return "fatality";
  if (value.startsWith("serious")) return "serious";
  if (value.startsWith("moderate")) return "moderate";
  if (value.startsWith("minor")) return "minor";
  if (value === "no injured reported" || value === "property damage. no injured reported") {
    return "none";
  }
  return "unknown";
}

/** How a report's severity reads in the list of the newest reports. */
const SEVERITY_PHRASES: Record<NhtsaSeverity, string> = {
  fatality: "fatality",
  serious: "serious injury",
  moderate: "moderate injury",
  minor: "minor injury",
  none: "no injury or property damage only",
  unknown: "injury unknown",
};

/** The position of each column that is read, in the header of a file. */
interface Columns {
  id: number;
  version: number;
  entity: number;
  submitted: number;
  incident: number;
  severity: number;
  state: number;
  crashWith: number;
  /** `Incident Date - Unknown`, where a file has the column (the real ones do); else -1. */
  incidentUnknown: number;
}

/** The columns by name, or null when one that is needed is missing: the file is then not the list. */
function columnsOf(header: readonly string[]): Columns | null {
  const names = header.map((cell) => cell.trim());
  const needed = {
    id: names.indexOf("Report ID"),
    version: names.indexOf("Report Version"),
    entity: names.indexOf("Reporting Entity"),
    submitted: names.indexOf("Report Submission Date"),
    incident: names.indexOf("Incident Date"),
    severity: names.indexOf("Highest Injury Severity Alleged"),
    state: names.indexOf("State"),
    crashWith: names.indexOf("Crash With"),
  };
  if (Object.values(needed).includes(-1)) return null;
  return { ...needed, incidentUnknown: names.indexOf("Incident Date - Unknown") };
}

/** What is kept of a report: no cell but these. */
interface Report {
  id: string;
  version: number;
  automation: Automation;
  /** The reporting entity as the row writes it, on one line. */
  entity: string;
  /** The compact name of the entity: with the automation, the id of the record. */
  key: string;
  /** The month of the incident, `YYYY-MM`; null where the row gives none. */
  month: string | null;
  /** The month the version was submitted, `YYYY-MM`; null where it cannot be read. */
  submitted: string | null;
  state: string;
  crashWith: string;
  severity: NhtsaSeverity;
}

/** A cell as one line: without control characters, white space as single blanks, cut at `max`. */
const lineOf = (cell: string, max: number): string =>
  cutAtCodePoint(cleanText(cell).replace(/\s+/g, " ").trim(), max).trimEnd();

/** The report a row holds; null when the row cannot be read. */
function reportOf(
  row: readonly string[],
  width: number,
  columns: Columns,
  automation: Automation,
): Report | null {
  // A row of another width is shifted or cut: its cells are not the columns of the header.
  if (row.length !== width) return null;
  const id = row[columns.id].trim();
  const version = row[columns.version].trim();
  const entity = lineOf(row[columns.entity], MAX_ENTITY_CHARS);
  const key = cutAtCodePoint(compactName(entity), MAX_KEY_CHARS);
  if (!REPORT_ID.test(id) || !VERSION.test(version) || key === "") return null;
  const incident = row[columns.incident].trim();
  const month = nhtsaMonthOf(incident);
  // A report the file dates nowhere has an empty date, and Y in `Incident Date - Unknown`: it
  // counts, without a month. A date that is there, is not a month and is not flagged as unknown is
  // a changed format.
  const unknown =
    incident === "" ||
    (columns.incidentUnknown !== -1 && row[columns.incidentUnknown].trim().toUpperCase() === "Y");
  if (month === null && !unknown) return null;
  return {
    id,
    version: Number(version),
    automation,
    entity,
    key,
    month,
    submitted: nhtsaMonthOf(row[columns.submitted]),
    state: lineOf(row[columns.state], MAX_CELL_CHARS),
    crashWith: lineOf(row[columns.crashWith], MAX_CELL_CHARS),
    severity: nhtsaSeverityOf(row[columns.severity]),
  };
}

interface FileReading {
  reports: Report[];
  /** The rows that hold something, the unreadable ones included. */
  rows: number;
  unreadable: number;
  /** True when the file ends inside a quoted field: it was cut short. */
  cut: boolean;
}

/** One file as reports; null when it is not the list (no header, or a column missing). */
function readFile(text: string, automation: Automation): FileReading | null {
  // A byte order mark in front of a quoted first cell would hide the quote from the reader. The
  // header counts as a row, so the reader stops one row past the limit of reports.
  const csv = readCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, NHTSA_MAX_ROWS + 1);
  if (csv.more) return null;
  const [header, ...body] = csv.rows;
  if (header === undefined) return null;
  const columns = columnsOf(header);
  if (columns === null) return null;
  const reading: FileReading = { reports: [], rows: 0, unreadable: 0, cut: csv.cut !== null };
  for (const row of body) {
    if (row.every((cell) => cell.trim() === "")) continue;
    reading.rows += 1;
    const report = reportOf(row, header.length, columns, automation);
    if (report === null) reading.unreadable += 1;
    else reading.reports.push(report);
  }
  return reading;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A report counts once, at its highest version; of two of one version, the first stays. */
function currentReports(readings: readonly FileReading[]): Report[] {
  const kept = new Map<string, Report>();
  for (const { reports } of readings) {
    for (const report of reports) {
      const known = kept.get(report.id);
      if (known === undefined || report.version > known.version) kept.set(report.id, report);
    }
  }
  return [...kept.values()];
}

interface Group {
  automation: Automation;
  key: string;
  reports: Report[];
}

/** The reports of each entity and file, in the order of the files, then of the compact names. */
function groupsOf(reports: readonly Report[]): Group[] {
  const groups = new Map<string, Group>();
  for (const report of reports) {
    const id = `${report.key}:${report.automation}`;
    const group = groups.get(id);
    if (group === undefined) {
      groups.set(id, { automation: report.automation, key: report.key, reports: [report] });
    } else {
      group.reports.push(report);
    }
  }
  const positionOf = (automation: Automation) =>
    FILES.findIndex((file) => file.automation === automation);
  return [...groups.values()].sort(
    (a, b) => positionOf(a.automation) - positionOf(b.automation) || compareText(a.key, b.key),
  );
}

/**
 * The spellings of the entity in a group, the most frequent first, a tie by the one that sorts
 * first: the order of the rows decides nothing.
 */
function spellingsOf(reports: readonly Report[]): string[] {
  const counts = new Map<string, number>();
  for (const { entity } of reports) counts.set(entity, (counts.get(entity) ?? 0) + 1);
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || compareText(a, b),
  );
}

/**
 * The names a spelling of an entity stands for: the whole, the text before ` (`, and the text
 * inside the parentheses ("Acme (Acme Motor Co.)" is both Acme and Acme Motor Co.). A parenthesis that is never closed runs to the end.
 */
function namesOf(entity: string): string[] {
  const open = entity.indexOf(" (");
  if (open === -1) return [entity];
  const close = entity.indexOf(")", open + 2);
  return [entity, entity.slice(0, open), entity.slice(open + 2, close === -1 ? undefined : close)];
}

type DatedReport = Report & { month: string };

/** The newest incident month first, then the newest submission, then the greatest report id. */
const newestFirst = (a: DatedReport, b: DatedReport): number =>
  compareText(b.month, a.month) ||
  compareText(b.submitted ?? "", a.submitted ?? "") ||
  b.id.localeCompare(a.id, "en", { numeric: true }) ||
  compareText(b.id, a.id);

/** A report in the list of the newest: its id, month, state, crash partner and severity. */
const reportLine = (report: DatedReport): string =>
  [
    report.id,
    monthLabel(report.month),
    report.state,
    report.crashWith === "" ? "" : `crash with ${report.crashWith}`,
    SEVERITY_PHRASES[report.severity],
  ]
    .filter((part) => part !== "")
    .join(", ");

/** The documentation page of the list: a record cites it with its entity and automation. */
const DOCUMENTATION_PAGE = vrdbSourceOf("nhtsa_sgo").documentationUrl;

function recordOf({ automation, key, reports }: Group): ParsedRecord {
  const spellings = spellingsOf(reports);
  const entity = spellings[0];
  const label = FILES.find((file) => file.automation === automation)?.label ?? automation;

  const severities: Record<NhtsaSeverity, number> = {
    fatality: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    none: 0,
    unknown: 0,
  };
  const years = new Map<string, number>();
  const dated: DatedReport[] = [];
  for (const report of reports) {
    severities[report.severity] += 1;
    if (report.month === null) continue;
    dated.push({ ...report, month: report.month });
    const year = report.month.slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  dated.sort(newestFirst);
  const newest = dated[0]?.month ?? null;
  const oldest = dated.reduce<string | null>(
    (first, { month }) => (first === null || month < first ? month : first),
    null,
  );
  const range =
    newest === null || oldest === null
      ? ""
      : newest === oldest
        ? ` (${monthLabel(newest)})`
        : ` (${monthLabel(oldest)} to ${monthLabel(newest)})`;

  return {
    sourceRecordId: `${key}:${automation}`,
    recordType: "crash_report_summary",
    title: `NHTSA crash reports: ${entity} (${label})`,
    summary: joinSentences([
      `${NHTSA_RECORD_MARK} (nhtsa.gov).`,
      sentence("Reporting entity", entity),
      sentence("Automation", label),
      sentence(`Crash reports in NHTSA's current files${range}`, String(reports.length)),
      sentence(
        "Highest injury severity alleged",
        `fatality ${severities.fatality}, serious ${severities.serious}, moderate ${severities.moderate}, ` +
          `minor ${severities.minor}, no injury or property damage only ${severities.none}, ` +
          `unknown ${severities.unknown}`,
      ),
      sentence(
        "Reports by year of the incident",
        [...years]
          .sort(([a], [b]) => compareText(a, b))
          .map(([year, count]) => `${year}: ${count}`)
          .join(", "),
      ),
      sentence("Newest reports", dated.slice(0, NEWEST_SHOWN).map(reportLine).join("; ")),
      NOT_A_FINDING,
    ]),
    url: `${DOCUMENTATION_PAGE}?reportingEntity=${encodeURIComponent(key)}&automation=${automation}`,
    identifiers: { reportingEntity: entity, automation, reports: reports.length },
    matchKeys: nameKeysOf(spellings.flatMap(namesOf)),
    publishedAt: newest === null ? null : `${newest}-01`,
    sourceUpdatedAt: null,
  };
}

/** Whether an address is a file of NHTSA's directory: https, its host and port, its path. */
function isFileAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === FILE_HOST &&
      url.port === "" &&
      url.pathname.startsWith(FILE_DIRECTORY)
    );
  } catch {
    return false;
  }
}

const FILE_LIMITS = {
  maxBytes: NHTSA_MAX_BYTES,
  allowedContentTypes: NHTSA_TYPES,
  totalTimeoutMs: NHTSA_TOTAL_TIMEOUT_MS,
};

export const nhtsaConnector: Connector = {
  id: "nhtsa_sgo",
  version: 1,
  // Three files and one pair of validators: a 304 on one would say nothing of the others, so all
  // three are asked in full and the sync's hash of the three tells an unchanged list.
  async download(fetch) {
    const bodies: string[] = [];
    let bytes = 0;
    for (const file of FILES) {
      const response = await fetch(file.url, {}, FILE_LIMITS);
      // Nothing was sent to make a 304 an answer; one is not the file.
      if (response.notModified) throw new FetchError("unreachable");
      // A redirect off NHTSA's directory is not the list; the error holds no address.
      if (!isFileAddress(response.url)) throw new FetchError("not_allowed");
      bodies.push(bodyText(response));
      bytes += response.body.length;
    }
    return { bodies, etag: null, lastModified: null, bytes };
  },
  parse(snapshot) {
    const readings: FileReading[] = [];
    for (const [at, file] of FILES.entries()) {
      const reading = readFile(snapshot.bodies[at] ?? "", file.automation);
      if (reading === null) return { records: [], errors: 1, sourceVersion: null, root: null };
      readings.push(reading);
    }
    const rows = readings.reduce((sum, reading) => sum + reading.rows, 0);
    const unreadable = readings.reduce((sum, reading) => sum + reading.unreadable, 0);
    const cut = readings.filter((reading) => reading.cut).length;
    const reports = currentReports(readings);
    // A list is refused for rows that do not parse only past what a list tolerates (Q7's way).
    const refused = unreadable > nhtsaUnreadableAllowed(rows);
    return {
      records: groupsOf(reports).map(recordOf),
      errors: cut + (refused ? unreadable : 0),
      skipped: refused ? 0 : unreadable,
      sourceVersion: reports.reduce<string | null>(
        (newest, { submitted }) =>
          submitted !== null && (newest === null || submitted > newest) ? submitted : newest,
        null,
      ),
      root: NHTSA_ROOT,
    };
  },
};
