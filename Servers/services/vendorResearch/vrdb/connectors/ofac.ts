/**
 * The Specially Designated Nationals and Blocked Persons List (SDN) of the Office of Foreign Assets
 * Control (OFAC) of the United States Treasury: the people, companies, vessels and aircraft that
 * persons of the United States may not deal with. The Sanctions List Service of the Treasury
 * publishes it as two public files, keyless: SDN.CSV (the entries) and ALT.CSV (the other names of
 * the entries). The list is a work of the United States government; no licence is published (Q5).
 *
 * Only the entities (companies and organizations) are read: a vendor is a company, and a person
 * who shares a name with it is no reason to look at it twice. An entity is found by its names
 * alone, so a match is weak: a reason to check who the vendor is, never a finding that the vendor
 * is sanctioned. The parser and the text of a record live here, for the mirror (`ofacConnector`)
 * and for the per-run lookup of records/ofac.ts, which re-exports them and adds the lookup note.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText } from "../../text";
import { compactNamesOf } from "../keys";
import type { ParsedRecord } from "../types";
import { type Connector, bodyText } from "./types";

export const OFAC_SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV";
export const OFAC_ALT_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";
/** SDN.CSV is 5.8 MB today and ALT.CSV 1.1 MB. */
export const OFAC_SDN_MAX_BYTES = 16 * 1024 * 1024;
export const OFAC_ALT_MAX_BYTES = 8 * 1024 * 1024;
const OFAC_TYPES = ["text/csv", "text/plain", "application/octet-stream"];
const OFAC_TOTAL_TIMEOUT_MS = 120_000;

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const OFAC_RECORD_MARK = "OFAC Specially Designated Nationals and Blocked Persons List";

/** A name of fewer letters and digits is not looked up: "ABC" would find any company called ABC. */
export const MIN_OFAC_NAME_CHARS = 4;
export const MAX_OFAC_REMARKS_CHARS = 600;
/** The other names an entry shows in its record, and the most that are read for one entry. */
const MAX_SHOWN_ALIASES = 6;
const MAX_READ_ALIASES = 100;
/** The files have 20,000 rows each today; a file past this is not the list. */
const MAX_ROWS = 400_000;
/** The fields of a row of SDN.CSV and of ALT.CSV (spec D2.2). */
const SDN_FIELDS = 12;
const ALT_FIELDS = 5;
/** What the files write for a field that has nothing in it. */
const NIL = "-0-";

const QUOTE = 0x22;
const COMMA = 0x2c;
const LF = 0x0a;
const CR = 0x0d;

const endsField = (code: number): boolean => code === COMMA || code === LF || code === CR;

/**
 * The rows of a CSV text, each a list of fields. A field in quotes may hold commas, line breaks and
 * quotes written twice; a quote that is never closed ends at the end of the text; blank lines hold
 * no row. The text is read once from the front, so the time is that of its length whatever it holds.
 * At most `maxRows` rows are read.
 */
export function parseCsv(text: string, maxRows = Number.POSITIVE_INFINITY): string[][] {
  const { rows, cut } = readCsv(text, maxRows);
  return cut === null ? rows : [...rows, cut];
}

/**
 * The rows of a CSV text as `parseCsv` reads them, except a last row that a quote never closed,
 * which is `cut` (the text was cut short inside it), and whether more rows followed the first
 * `maxRows` (`more`).
 */
export function readCsv(
  text: string,
  maxRows = Number.POSITIVE_INFINITY,
): { rows: string[][]; cut: string[] | null; more: boolean } {
  const rows: string[][] = [];
  const length = text.length;
  let at = 0;
  let unclosed = false;
  while (at < length && rows.length < maxRows) {
    const first = text.charCodeAt(at);
    if (first === LF || first === CR) {
      at += 1;
      continue;
    }
    const row: string[] = [];
    for (;;) {
      let value = "";
      if (text.charCodeAt(at) === QUOTE) {
        at += 1;
        let start = at;
        for (;;) {
          const quote = text.indexOf('"', at);
          if (quote === -1) {
            value += text.slice(start);
            at = length;
            unclosed = true;
            break;
          }
          if (text.charCodeAt(quote + 1) === QUOTE) {
            // Two quotes are one.
            value += text.slice(start, quote + 1);
            at = quote + 2;
            start = at;
            continue;
          }
          value += text.slice(start, quote);
          at = quote + 1;
          break;
        }
      }
      // What follows a closing quote, or all of a field that is not in quotes, up to its end.
      const from = at;
      while (at < length && !endsField(text.charCodeAt(at))) at += 1;
      if (at > from) value += text.slice(from, at);
      row.push(value);
      if (at >= length) break;
      const delimiter = text.charCodeAt(at);
      at += 1;
      // A comma means another field follows, even when the line ends right here; the line feed
      // behind a carriage return is read as a blank line.
      if (delimiter !== COMMA) break;
    }
    if (unclosed) return { rows, cut: row, more: false };
    rows.push(row);
  }
  return { rows, cut: null, more: /[^\r\n]/.test(text.slice(at)) };
}

/** An entity of the list, with the other names it is listed under. */
export interface OfacEntry {
  id: number;
  name: string;
  programs: string[];
  remarks: string;
  aliases: Array<{ type: string; name: string }>;
}

export interface OfacList {
  /** How many entities the list holds; the people, vessels and aircraft are not counted. */
  entities: number;
  /** The entries by number. */
  byId: ReadonlyMap<number, OfacEntry>;
  /** The numbers of the entries listed under each name, by the compact form of the name. */
  index: ReadonlyMap<string, readonly number[]>;
}

/** A field of the files as text: without control characters and blanks, and empty when it is the null mark. */
const valueOf = (field: string | undefined): string => {
  const value = cleanText(field ?? "").trim();
  return value === NIL ? "" : value;
};

const idOf = (field: string | undefined): number | null => {
  const value = (field ?? "").trim();
  if (!/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
};

/** The programs of an entry: the field holds them as `CUBA] [IRAN`, between the brackets of the first and the last. */
const programsOf = (field: string | undefined): string[] =>
  valueOf(field)
    .replace(/^\[|\]$/g, "")
    .split(/\]\s*\[/)
    .map((program) => program.trim())
    .filter((program) => program !== "");

/**
 * The entities of the files and the other names they are listed under, how many entries of any
 * type were read, and the errors: a row of the wrong number of fields, a row whose first field is
 * no entry number, an entry without a name, a file that ends inside a quoted field or holds more
 * rows than the list can, and an ALT.CSV without one row. Each is a sign of a file cut short or of
 * another file. A blank row, and one whose first field holds only control characters (an
 * end-of-file mark), is no row.
 */
function readEntities(
  sdn: string,
  alt: string,
): { byId: Map<number, OfacEntry>; entries: number; errors: number } {
  const byId = new Map<number, OfacEntry>();
  const sdnCsv = readCsv(sdn, MAX_ROWS);
  const altCsv = readCsv(alt, MAX_ROWS);
  let entries = 0;
  let errors = [sdnCsv, altCsv].filter((csv) => csv.cut !== null || csv.more).length;
  // The columns are: number, name, type, programs, title, call sign, vessel type, tonnage, GRT,
  // flag, owner and remarks. An entity is an entry whose type is empty.
  for (const row of sdnCsv.rows) {
    if (valueOf(row[0]) === "") continue;
    const id = idOf(row[0]);
    const name = valueOf(row[1]);
    if (row.length !== SDN_FIELDS || id === null || name === "") {
      errors += 1;
      continue;
    }
    entries += 1;
    if (valueOf(row[2]) !== "" || byId.has(id)) continue;
    byId.set(id, {
      id,
      name,
      programs: programsOf(row[3]),
      remarks: valueOf(row[11]).slice(0, MAX_OFAC_REMARKS_CHARS),
      aliases: [],
    });
  }

  // The columns are: number of the entry, number of the name, type (aka, fka, nka), name, remarks.
  let aliasRows = 0;
  for (const row of altCsv.rows) {
    if (valueOf(row[0]) === "") continue;
    const id = idOf(row[0]);
    if (row.length !== ALT_FIELDS || id === null) {
      errors += 1;
      continue;
    }
    aliasRows += 1;
    const entry = byId.get(id);
    const name = valueOf(row[3]);
    if (entry === undefined || name === "" || entry.aliases.length >= MAX_READ_ALIASES) continue;
    const type = valueOf(row[2]).toLowerCase() || "aka";
    if (!entry.aliases.some((other) => other.name === name && other.type === type)) {
      entry.aliases.push({ type, name });
    }
  }
  // The list's entries have thousands of other names: an ALT.CSV without one is empty or cut.
  if (aliasRows === 0) errors += 1;
  return { byId, entries, errors };
}

/** The compact forms of the names of an entry, each as written and without its legal form. */
const ofacNameKeys = (entry: OfacEntry): string[] =>
  compactNamesOf([entry.name, ...entry.aliases.map((alias) => alias.name)]);

/**
 * The entities of the list and the names they are listed under. It throws a FetchError
 * (`unsupported_type`) when the text holds no entity, since it is then not the list.
 */
export function parseOfac(sdn: string, alt: string): OfacList {
  const { byId } = readEntities(sdn, alt);
  if (byId.size === 0) throw new FetchError("unsupported_type", "The OFAC list holds no entity");
  const index = new Map<string, number[]>();
  for (const entry of byId.values()) {
    for (const key of ofacNameKeys(entry)) {
      const ids = index.get(key);
      if (ids === undefined) index.set(key, [entry.id]);
      else ids.push(entry.id);
    }
  }
  return { entities: byId.size, byId, index };
}

/** The page of the entry in the Sanctions List Search of the Treasury. */
export const ofacEntryUrl = (id: number): string =>
  `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${id}`;

/**
 * An entity as a source: its page, its name, and its text, word for word the list's. The text
 * holds no lookup note and no day: whoever offers the record to a run adds both.
 */
export function ofacSourceOf(entry: OfacEntry): { url: string; title: string; text: string } {
  const shown = entry.aliases.slice(0, MAX_SHOWN_ALIASES);
  const rest = entry.aliases.length - shown.length;
  const aliases = shown.map((alias) => `"${alias.name}" (${alias.type})`).join(", ");
  const name = cleanText(entry.name);
  return {
    url: ofacEntryUrl(entry.id),
    title: `OFAC SDN list: ${name}`,
    text: joinSentences([
      `${OFAC_RECORD_MARK} (treasury.gov).`,
      `Entry: "${name}" (entity).`,
      sentence("Programs", entry.programs.join(", ")),
      aliases === "" ? "" : `Also listed as: ${aliases}${rest > 0 ? `, and ${rest} more` : ""}.`,
      sentence("Remarks", entry.remarks),
    ]),
  };
}

function recordOf(entry: OfacEntry): ParsedRecord {
  const { url, title, text } = ofacSourceOf(entry);
  return {
    sourceRecordId: String(entry.id),
    recordType: "sanctions_entity",
    title,
    summary: text,
    url,
    identifiers: { programs: entry.programs },
    matchKeys: ofacNameKeys(entry).map((key) => `name:${key}`),
    // The list dates no entry.
    publishedAt: null,
    sourceUpdatedAt: null,
  };
}

/** The limits of each file: SDN.CSV is the bigger. */
const limitsOf = (maxBytes: number) => ({
  maxBytes,
  allowedContentTypes: OFAC_TYPES,
  totalTimeoutMs: OFAC_TOTAL_TIMEOUT_MS,
});

export const ofacConnector: Connector = {
  id: "ofac",
  version: 1,
  // Two files and one pair of validators: a 304 on SDN.CSV would say nothing of ALT.CSV, so both
  // are asked in full and the sync's hash of the two tells an unchanged list.
  async download(fetch) {
    const bodies: string[] = [];
    let bytes = 0;
    for (const [url, maxBytes] of [
      [OFAC_SDN_URL, OFAC_SDN_MAX_BYTES],
      [OFAC_ALT_URL, OFAC_ALT_MAX_BYTES],
    ] as const) {
      const response = await fetch(url, {}, limitsOf(maxBytes));
      // Nothing was sent to make a 304 an answer; one is not the file.
      if (response.notModified) throw new FetchError("unreachable");
      bodies.push(bodyText(response));
      bytes += response.body.length;
    }
    return { bodies, etag: null, lastModified: null, bytes };
  },
  parse(snapshot) {
    const { byId, entries, errors } = readEntities(
      snapshot.bodies[0] ?? "",
      snapshot.bodies[1] ?? "",
    );
    return {
      records: [...byId.values()].map(recordOf),
      errors,
      sourceVersion: null,
      // A file in which no row is an entry is not the list, whatever it is.
      root: entries > 0 ? "SDN.CSV" : null,
    };
  },
};
