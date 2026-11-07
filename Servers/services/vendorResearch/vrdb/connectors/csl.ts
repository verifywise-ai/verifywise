/**
 * The US Consolidated Screening List (CSL; spec D2.19, Q33): the export control and trade
 * restriction lists of the Departments of Commerce, State and Treasury, compiled by the
 * International Trade Administration (ITA) and published as one JSON file, keyless, at a fixed
 * address. The CSL publishes no licence. It is a work of the United States government, accepted in
 * the way of the OFAC list (Q5, Q33); the attribution that sources.ts holds says that the entries
 * are adapted, and every cut of a text here is marked (` [shortened]`).
 *
 * Eleven lists are kept: the Entity List, the Denied Persons List, the Unverified List, the Military
 * End User List, the ITAR Debarred List and the Nonproliferation Sanctions of Commerce and State
 * (none of them has a type: a person cannot be told from a company, so every entry is kept), and
 * Treasury's SSI, NS-MBS, CMIC, CAP and FSE lists (which have types, so only their entities are
 * kept, as `ofac` keeps only the entities of the SDN list). The SDN list is `ofac`'s and the PLC
 * list holds legislators only: both are left out, and so is every entry of the other lists whose
 * OFAC entity number is that of an SDN entry of the same file (ninety SSI entries today), so that
 * two records do not state one fact. A listing on the Entity List or the Military End User List
 * means an export licence is required, which is not a sanction; the text of a record says which
 * list it is.
 *
 * The file is read once, inside `download`, and only a projection of it leaves. The file's
 * `search_performed_at` changes every hour and its ids for the non-OFAC lists are hashes that nothing
 * shows to be stable, so hashing the file would never tell an unchanged list; and the 34 MB text and
 * the 26,000 objects it parses into must not be held by the sync while it works. The projection
 * keeps the whitelisted fields of the kept entries, cleaned (no control, zero-width or bidirectional
 * character, white space collapsed) and cut (` [shortened]`), sorted so that the order of the file
 * decides nothing, as one canonical JSON text; `parse` reads that text. It never holds a street, a
 * city, a state, a postal code, a date or place of birth, a citizenship, a nationality, a gender, a
 * title, a passport or national identification number, a vessel field, the file's own hashed id, the
 * standard order, or the times of the import: a Denied Persons entry is a private person's, and
 * the record keeps the country alone. An `Individual` of a typed list is not kept at all.
 *
 * A denial order that ended before the day of the download is left out of the projection (the Denied
 * Persons List keeps its expired orders), with a clock the connector is given, and not in `parse`:
 * the sync hashes the bodies and answers `unchanged` when the hash is the last success's, so a
 * filter that depends on the day must change the bodies. Known limit: while ITA's file keeps its
 * ETag (it is regenerated daily) the download is a 304, and an order that ended since stays until
 * the file is regenerated. An order that ends today is still in force; an entry without an end date,
 * or with one that cannot be read, is kept.
 *
 * Entries that repeat a name on one list (one name, several orders: 101 names today, 86 of them on
 * the Entity List) are one record, whose fields are those of the entry with the newest start date;
 * the text says how many entries the name has. A record is matched by
 * the names of the entry (a weak match), by the host of each website of its ids (a strong one, as
 * for the UK and EU lists) and by the legal entity number or registration number of its ids (an LEI
 * is strong alone, any other number only beside the name, Q1). Never by an address, nor by another
 * kind of identifier: a number of a listed security, a bank code or a person's document is no key.
 * The text shows the websites and numbers a record matches by, so that a person and the model see
 * what an entry matched by (the lesson of the UK list's M2 review).
 *
 * An entry that cannot be read (no name, a field of the wrong JSON type, a name or other name of more
 * than 500 characters) is left out and counted, up to ten entries or a hundredth of the entries
 * read when that is more, as the CVE records are (connectors/cve.ts, Q7); more than that is a new
 * format, and every one of them is reported as an error, which fails the sync. An entry of a list
 * the connector does not know is skipped and counted, never an error: a new list does not fail the
 * sync, and a renamed large one fails through the sync's shrink check. The download counts both,
 * since only it sees the file's entries, and the projection carries the counts to `parse`.
 *
 * The file's address is fixed. The answer must come from data.trade.gov over https after redirects,
 * a 304 included, or the download fails as wrong_root (NotTheListError); so does a file that is not
 * JSON, is no object, or is not the whole list (the paging fields say so). No address enters a
 * record or an error.
 */
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { isSharedHost } from "../../sharedHosts";
import { cleanText, cutAtCodePoint } from "../../text";
import { domainKey, hostsOf, identifierKeysOf, nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { fdaDayOf } from "./fda";
import { type Connector, NotTheListError, type ParseResult, bodyText, dayOf } from "./types";

export const CSL_URL =
  "https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json";
/** The file is 34 MB today (26,265 entries); the limit holds about twice that. */
export const CSL_MAX_BYTES = 64 * 1024 * 1024;
export const CSL_ALLOWED_TYPES: readonly string[] = [
  "application/json",
  "application/octet-stream",
];
export const CSL_TOTAL_TIMEOUT_MS = 180_000;
/** The only host the file may come from, after redirects. */
const CSL_HOST = "data.trade.gov";
/** The root of the document: the name of the file. */
export const CSL_ROOT = "consolidated.json";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const CSL_RECORD_MARK = "US Consolidated Screening List";

/** A list of the file that the connector keeps. */
export interface CslList {
  /** What the record's id and address call the list: the file's code, except for two lists. */
  id: string;
  /** The code in the first parentheses of the file's `source` for the list. */
  code: string;
  /** The list as the text of a record names it. */
  name: string;
  /** The list as the title of a record names it: without the agency. */
  short: string;
  /** Treasury's lists: each entry has a type, and only the entities are kept. */
  typed: boolean;
}

export const CSL_LISTS: readonly CslList[] = [
  { id: "el", code: "EL", name: "Entity List (Commerce, BIS)", short: "Entity List", typed: false },
  {
    id: "dpl",
    code: "DPL",
    name: "Denied Persons List (Commerce, BIS)",
    short: "Denied Persons List",
    typed: false,
  },
  {
    id: "uvl",
    code: "UVL",
    name: "Unverified List (Commerce, BIS)",
    short: "Unverified List",
    typed: false,
  },
  {
    id: "meu",
    code: "MEU",
    name: "Military End User List (Commerce, BIS)",
    short: "Military End User List",
    typed: false,
  },
  {
    id: "dtc",
    code: "DTC",
    name: "ITAR Debarred List (State, DDTC)",
    short: "ITAR Debarred List",
    typed: false,
  },
  {
    id: "isn",
    code: "ACN",
    name: "Nonproliferation Sanctions (State)",
    short: "Nonproliferation Sanctions",
    typed: false,
  },
  {
    id: "ssi",
    code: "SSI",
    name: "Sectoral Sanctions Identifications List (Treasury, OFAC)",
    short: "Sectoral Sanctions Identifications List",
    typed: true,
  },
  {
    id: "nsmbs",
    code: "NS-MBS List",
    name: "Non-SDN Menu-Based Sanctions List (Treasury, OFAC)",
    short: "Non-SDN Menu-Based Sanctions List",
    typed: true,
  },
  {
    id: "cmic",
    code: "CMIC",
    name: "Non-SDN Chinese Military-Industrial Complex Companies List (Treasury, OFAC)",
    short: "Non-SDN Chinese Military-Industrial Complex Companies List",
    typed: true,
  },
  {
    id: "cap",
    code: "CAP",
    name: "Capta List (Treasury, OFAC)",
    short: "Capta List",
    typed: true,
  },
  {
    id: "fse",
    code: "FSE",
    name: "Foreign Sanctions Evaders List (Treasury, OFAC)",
    short: "Foreign Sanctions Evaders List",
    typed: true,
  },
];

/** The lists the connector reads and leaves out: `ofac` has the SDN list, and the PLC has no company. */
const SDN_CODE = "SDN";
const DROPPED_CODES: ReadonlySet<string> = new Set([SDN_CODE, "PLC"]);

/** Maps, so that a code or an id that a file sends as `constructor` finds nothing. */
const LIST_BY_CODE: ReadonlyMap<string, CslList> = new Map(
  CSL_LISTS.map((list) => [list.code, list]),
);
const LIST_BY_ID: ReadonlyMap<string, CslList> = new Map(CSL_LISTS.map((list) => [list.id, list]));
const DENIED_PERSONS = "dpl";

/** The type of the entries of a typed list that are kept. */
const ENTITY = "Entity";

/** The types of `ids` that are read: a website, the names an issuer is known by, and the numbers that are keys. */
const WEBSITE = "Website";
const ISSUER_NAME = "Issuer Name";
const REGISTRATION_TYPES: ReadonlySet<string> = new Set([
  "Legal Entity Number",
  "Registration Number",
  "Registration ID",
  "Company Number",
  "Business Registration Number",
  "Public Registration Number",
  "Unified Social Credit Code (USCC)",
  "Tax ID No.",
]);

/** The longest name or other name of an entry; the longest in the file of 2026-11-07 has 381. */
const MAX_NAME_CHARS = 500;
/** The longest key of an entry: its compact name, which is in its id and in its address. */
const MAX_KEY_CHARS = 160;
/** The other names read for one entry (the most today is 28); names past it are left out. */
const MAX_OTHER_NAMES = 100;
/** The other names, countries, websites and numbers a text shows. */
const MAX_SHOWN_NAMES = 6;
const MAX_SHOWN_COUNTRIES = 6;
const MAX_SHOWN_WEBSITES = 5;
const MAX_SHOWN_REGISTRATIONS = 6;
/** The countries, programs, websites and numbers of an entry that are read (the most today are 5, 3, 2 and 4). */
const MAX_COUNTRIES = 50;
const MAX_PROGRAMS = 20;
const MAX_WEBSITES = 10;
const MAX_REGISTRATIONS = 20;
/** A country, a program, a website or number, and an entity number longer than this is cut or left out. */
const MAX_COUNTRY_CHARS = 60;
const MAX_PROGRAM_CHARS = 120;
const MAX_ID_CHARS = 200;
const MAX_ENTITY_NUMBER_CHARS = 40;
const MAX_URL_CHARS = 300;
/** The longest text of a field of an entry as a record keeps it, the marker of a cut one included (R6). */
const MAX_NOTICE_CHARS = 200;
const MAX_LICENSE_CHARS = 300;
const MAX_REMARKS_CHARS = 400;
/** The name keys of a record (R5): each name gives two. */
export const CSL_MAX_NAME_KEYS = 200;
/** The keys of a record that come from its numbers. */
const MAX_NUMBER_KEYS = 100;
/** The text of a record, enforced after it is put together; its last sentence stays. */
export const CSL_MAX_SUMMARY_CHARS = 4_000;
/** More records than the list can have: a file past this is not the list. */
export const CSL_MAX_RECORDS = 20_000;
/** The entries that do not parse and may be left out whatever the size of the list. */
const MAX_UNREADABLE = 10;

/** What a text that was cut ends with, so that nobody takes the part kept for the whole. */
const SHORTENED = " [shortened]";

const CLOSING =
  "The Consolidated Screening List is an aid to screening and not the official list: check the entry against the official publication of the list (the Federal Register for the lists of Commerce and State) before acting on it.";

const DOCUMENTATION_PAGE = vrdbSourceOf("csl").documentationUrl;

/**
 * How many entries may be left out because they do not parse: ten, or a hundredth of the entries
 * read when that is more. More is a change of the format, and the sync refuses the list.
 */
export const cslUnreadableAllowed = (entries: number): number =>
  Math.max(MAX_UNREADABLE, Math.floor(entries / 100));

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Text: one cleaned line, cut with a marker
// ---------------------------------------------------------------------------------------------

/**
 * What the bytes 0x80 to 0x9F are in windows-1252, as code points. The file holds some (the
 * apostrophe of a program, a country) that were read as ISO 8859-1 before it was written as UTF-8;
 * the five bytes windows-1252 leaves undefined go with the other control characters.
 */
const WINDOWS_1252_C1 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const C1_CONTROLS = /[\x80-\x9f]/g;
const WHITE_SPACE = /\s+/g;
/**
 * Characters a reader does not see (zero-width, the right-to-left overrides, the tag characters
 * that spell ASCII invisibly, the byte order mark, the variation selectors) and the control
 * characters, as the ATLAS connector's `normalise` removes them. Every pattern here is a class under
 * one quantifier, so the time is linear in the text, whatever it holds.
 */
const UNSEEN = /[\p{Cc}\p{Cf}\p{Variation_Selector}]/gu;

/** What an unseen character becomes: a blank for the three that separate words, nothing for the rest. */
const unseenAs = (character: string): string =>
  character === "\t" || character === "\n" || character === "\r" ? " " : "";

/** A control character U+0080 to U+009F as windows-1252 reads its byte; nothing for an undefined one. */
function windows1252Of(control: string): string {
  const code = WINDOWS_1252_C1[control.charCodeAt(0) - 0x80];
  return code >= 0x80 && code <= 0x9f ? "" : String.fromCodePoint(code);
}

/**
 * A cell as one line of plain text (R10.1): compatibility forms folded (a full-width `<` is a `<`,
 * which the prompt's escaping then sees), no control, zero-width or bidirectional character (the
 * byte order mark, which `\s` matches, goes with them and is not a blank), white space collapsed to
 * one blank, none around it.
 */
function lineOf(text: string): string {
  return cleanText(text.replace(C1_CONTROLS, windows1252Of).normalize("NFKC"))
    .replace(UNSEEN, unseenAs)
    .replace(WHITE_SPACE, " ")
    .trim();
}

/**
 * The text as it is when it has at most `max` characters, else cut so that the text and the marker
 * that says it was shortened are that long together: at the last `;` that leaves room, else at the
 * last blank, else hard, never between the halves of a surrogate pair (the way `ofac` shortens a
 * remark). The `;` or blank is not kept, and a cut that would keep nothing is not taken.
 */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = max - SHORTENED.length;
  for (const at of [text.lastIndexOf(";", room), text.lastIndexOf(" ", room)]) {
    const kept = at > 0 ? text.slice(0, at).trimEnd() : "";
    if (kept !== "") return `${kept}${SHORTENED}`;
  }
  return `${cutAtCodePoint(text, room)}${SHORTENED}`;
}

/** The compact form of a name that makes a record's id and address, and groups the entries of a name. */
const keyOf = (name: string): string => cutAtCodePoint(compactName(name), MAX_KEY_CHARS);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}(?:$|[T ])/;

/**
 * A day of the file as YYYY-MM-DD: an ISO date or date and time (`dayOf`), else `M/D/YYYY` with the
 * blank the file puts in front of one of its dates (`fdaDayOf`, the month first). Slashes are never
 * read day first, as `dayOf` would: that would swap the month and the day of 10/11/2018. Null for
 * anything else, a value that is no text included; it is not an error.
 */
function dayFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return ISO_DAY.test(text) ? dayOf(text) : fdaDayOf(text);
}

// ---------------------------------------------------------------------------------------------
// The projection: what `download` keeps of the file
// ---------------------------------------------------------------------------------------------

/**
 * An entry of a kept list as the projection holds it. A field that an entry lacks is absent. Every
 * text is a cleaned line, cut where R6 says; the order of the keys is that of this declaration, so
 * that the canonical text of a projection does not depend on the file's.
 */
interface CslEntry {
  /** The id of the entry's list (`CslList.id`). */
  list: string;
  name: string;
  /** The other names: `alt_names`, then the issuer names of `ids`; none that has the compact form of an earlier one. */
  other?: string[];
  /** YYYY-MM-DD */
  start?: string;
  /** YYYY-MM-DD; the Denied Persons List only. */
  end?: string;
  /** The countries of the addresses and of the entry, once each, sorted. */
  countries?: string[];
  programs?: string[];
  /** OFAC's entity number, of the lists that have one. */
  entityNumber?: string;
  notice?: string;
  requirement?: string;
  policy?: string;
  remarks?: string;
  /** The official page of the list that the entry gives (`source_list_url`), when it is an https address. */
  listUrl?: string;
  websites?: string[];
  registrations?: Array<{ type: string; number: string }>;
}

/** What `download` hands to `parse`, as JSON. */
interface Projection {
  /** The day each kept list was last updated (`source_last_updated`), by list id. */
  versions: Record<string, string>;
  /** Entries of a list the connector does not know. */
  skipped: number;
  /** Entries of a kept list that could not be read. */
  unreadable: number;
  entries: CslEntry[];
}

type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Thrown inside `readEntry` for an entry that cannot be read; it never leaves this module. */
const UNREADABLE = new Error("The entry cannot be read.");
const unreadable = (): never => {
  throw UNREADABLE;
};

/** A field that is an array, null or absent: its items; any other value makes the entry unreadable. */
const itemsOf = (value: unknown): readonly unknown[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : unreadable();
};

/** A field that is text, null or absent: its line, cut at `max`, empty for null and absent; anything else makes the entry unreadable. */
function textOf(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? shorten(lineOf(value), max) : unreadable();
}

/** The name of an entry: text of 1 to 500 characters with a letter or digit in it. */
function nameOf(value: unknown): string {
  if (typeof value !== "string") return unreadable();
  const name = lineOf(value);
  return name === "" || name.length > MAX_NAME_CHARS || keyOf(name) === "" ? unreadable() : name;
}

/** The code in the first parentheses of a `source`: "Entity List (EL) - Bureau of Industry and Security" is EL. */
function codeOf(source: string): string | null {
  const open = source.indexOf("(");
  const close = open === -1 ? -1 : source.indexOf(")", open + 1);
  return close === -1 ? null : source.slice(open + 1, close).trim();
}

/** The websites and numbers of `ids` that are read, and the issuer names. */
function idsOf(value: unknown): {
  websites: string[];
  registrations: Array<{ type: string; number: string }>;
  issuers: string[];
} {
  const websites: string[] = [];
  const registrations: Array<{ type: string; number: string }> = [];
  const issuers: string[] = [];
  for (const item of itemsOf(value)) {
    if (!isRaw(item)) return unreadable();
    if (item.type === null || item.type === undefined) continue;
    if (typeof item.type !== "string") return unreadable();
    const type = item.type.trim();
    // Another kind of id is not read at all: its number may be of any type.
    if (type !== WEBSITE && type !== ISSUER_NAME && !REGISTRATION_TYPES.has(type)) continue;
    if (item.number === null || item.number === undefined) continue;
    if (typeof item.number !== "string") return unreadable();
    const number = lineOf(item.number);
    if (number === "") continue;
    if (type === ISSUER_NAME) {
      if (issuers.length < MAX_OTHER_NAMES) issuers.push(number);
    } else if (number.length <= MAX_ID_CHARS) {
      if (type === WEBSITE) {
        if (!websites.includes(number) && websites.length < MAX_WEBSITES) websites.push(number);
      } else if (
        registrations.length < MAX_REGISTRATIONS &&
        !registrations.some((known) => known.type === type && known.number === number)
      ) {
        registrations.push({ type, number });
      }
    }
  }
  return { websites, registrations, issuers };
}

/**
 * The other names of an entry: its `alt_names`, then the names its issuer is known by, once each by
 * compact form and none that is the entry's own name. A name of more than 500 characters makes the
 * entry unreadable: a cut name would be another name.
 */
function otherNamesOf(altNames: unknown, issuers: readonly string[], name: string): string[] {
  const known = new Set([keyOf(name)]);
  const others: string[] = [];
  const add = (other: string): void => {
    if (other === "") return;
    if (other.length > MAX_NAME_CHARS) return unreadable();
    if (others.length >= MAX_OTHER_NAMES) return;
    const key = keyOf(other);
    if (key === "" || known.has(key)) return;
    known.add(key);
    others.push(other);
  };
  // One pass and no list of the cleaned names: an entry with a million of them costs time, not memory.
  for (const item of itemsOf(altNames)) add(typeof item === "string" ? lineOf(item) : unreadable());
  issuers.forEach(add);
  return others;
}

/** A country as the file writes it: a code in upper case, a name as written, one line. */
const countryOf = (text: string): string => {
  const line = lineOf(text);
  return /^[A-Za-z]{2}$/.test(line) ? line.toUpperCase() : shorten(line, MAX_COUNTRY_CHARS);
};

/**
 * The countries of the addresses of an entry and of the entry itself (`country`), once each, sorted.
 * Nothing else of an address is read. A country written in several cases is one country, with the
 * smallest of its spellings, so that the order of the addresses does not decide which.
 */
function countriesOf(addresses: unknown, country: unknown): string[] {
  const found = new Map<string, string>();
  const add = (value: unknown): void => {
    if (value === null || value === undefined) return;
    if (typeof value !== "string") return unreadable();
    const text = countryOf(value);
    if (text === "") return;
    const key = text.toLowerCase();
    const known = found.get(key);
    if (known === undefined ? found.size < MAX_COUNTRIES : text < known) found.set(key, text);
  };
  for (const address of itemsOf(addresses)) {
    if (!isRaw(address)) return unreadable();
    add(address.country);
  }
  add(country);
  return [...found.values()].sort(compareText);
}

function programsOf(value: unknown): string[] {
  const programs: string[] = [];
  for (const item of itemsOf(value)) {
    if (typeof item !== "string") return unreadable();
    const program = shorten(lineOf(item), MAX_PROGRAM_CHARS);
    if (program !== "" && !programs.includes(program) && programs.length < MAX_PROGRAMS) {
      programs.push(program);
    }
  }
  return programs;
}

/** The official page of a list as an entry gives it: an https address, else nothing. */
function listUrlOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return unreadable();
  const text = lineOf(value);
  try {
    const url = new URL(text);
    const usable = url.protocol === "https:" && url.username === "" && url.password === "";
    return usable && text.length <= MAX_URL_CHARS ? text : "";
  } catch {
    return "";
  }
}

/** OFAC's entity number of an entry as text; nothing for one that is empty or longer than any number. */
function entityNumberOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return unreadable();
  const number = lineOf(value);
  return number.length <= MAX_ENTITY_NUMBER_CHARS ? number : "";
}

/** The fields of an entry that has them all, before the empty ones are left out. */
interface EntryFields {
  other: string[];
  start: string | null;
  end: string | null;
  countries: string[];
  programs: string[];
  entityNumber: string;
  notice: string;
  requirement: string;
  policy: string;
  remarks: string;
  listUrl: string;
  websites: string[];
  registrations: Array<{ type: string; number: string }>;
}

/** An entry with the fields that have something in them, in the order of the interface. */
function entryOf(list: string, name: string, fields: EntryFields): CslEntry {
  const entry: CslEntry = { list, name };
  if (fields.other.length > 0) entry.other = fields.other;
  if (fields.start !== null) entry.start = fields.start;
  if (fields.end !== null) entry.end = fields.end;
  if (fields.countries.length > 0) entry.countries = fields.countries;
  if (fields.programs.length > 0) entry.programs = fields.programs;
  if (fields.entityNumber !== "") entry.entityNumber = fields.entityNumber;
  if (fields.notice !== "") entry.notice = fields.notice;
  if (fields.requirement !== "") entry.requirement = fields.requirement;
  if (fields.policy !== "") entry.policy = fields.policy;
  if (fields.remarks !== "") entry.remarks = fields.remarks;
  if (fields.listUrl !== "") entry.listUrl = fields.listUrl;
  if (fields.websites.length > 0) entry.websites = fields.websites;
  if (fields.registrations.length > 0) entry.registrations = fields.registrations;
  return entry;
}

/**
 * The projection of an entry of a kept list: the entry, `"dropped"` for an entry the rules of R1 leave
 * out (an entry of a typed list that is not an entity, a denial order that ended before `today`, an
 * entry of an entity number that the SDN list has), or it throws UNREADABLE. The checks that drop an
 * entry come first: an entry that is left out anyway is not an error.
 */
function readEntry(
  raw: Raw,
  list: CslList,
  sdn: ReadonlySet<string>,
  today: string,
): CslEntry | "dropped" {
  if (list.typed) {
    if (typeof raw.type !== "string") return unreadable();
    if (raw.type.trim() !== ENTITY) return "dropped";
  }
  const end = list.id === DENIED_PERSONS ? dayFrom(raw.end_date) : null;
  if (end !== null && end < today) return "dropped";
  const entityNumber = entityNumberOf(raw.entity_number);
  if (entityNumber !== "" && sdn.has(entityNumber)) return "dropped";

  const name = nameOf(raw.name);
  const { websites, registrations, issuers } = idsOf(raw.ids);
  return entryOf(list.id, name, {
    other: otherNamesOf(raw.alt_names, issuers, name),
    start: dayFrom(raw.start_date),
    end,
    countries: countriesOf(raw.addresses, raw.country),
    programs: programsOf(raw.programs),
    entityNumber,
    notice: textOf(raw.federal_register_notice, MAX_NOTICE_CHARS),
    requirement: textOf(raw.license_requirement, MAX_LICENSE_CHARS),
    policy: textOf(raw.license_policy, MAX_LICENSE_CHARS),
    remarks: textOf(raw.remarks, MAX_REMARKS_CHARS),
    listUrl: listUrlOf(raw.source_list_url),
    websites,
    registrations,
  });
}

/** The entity numbers of the SDN entries of the file: the entries of the other lists that have one are `ofac`'s. */
function sdnEntityNumbers(results: readonly unknown[]): Set<string> {
  const numbers = new Set<string>();
  for (const raw of results) {
    if (!isRaw(raw) || typeof raw.source !== "string" || codeOf(raw.source) !== SDN_CODE) continue;
    if (typeof raw.entity_number !== "string") continue;
    const number = lineOf(raw.entity_number);
    if (number !== "") numbers.add(number);
  }
  return numbers;
}

/**
 * What becomes of one entry of the file: its projection, `"dropped"` (a list or an entry that is
 * left out by rule), `"unknown"` (the code of a list the connector does not know: skipped and
 * counted) or `"unreadable"` (counted, and an error past what a list tolerates).
 */
function projectEntry(
  raw: unknown,
  sdn: ReadonlySet<string>,
  today: string,
): CslEntry | "dropped" | "unknown" | "unreadable" {
  if (!isRaw(raw) || typeof raw.source !== "string") return "unreadable";
  const code = codeOf(raw.source);
  if (code === null) return "unknown";
  if (DROPPED_CODES.has(code)) return "dropped";
  const list = LIST_BY_CODE.get(code);
  if (list === undefined) return "unknown";
  try {
    return readEntry(raw, list, sdn, today);
  } catch (error) {
    if (error === UNREADABLE) return "unreadable";
    throw error;
  }
}

/** The day each kept list was last updated, by list id, in the order of the ids. */
function versionsOf(sources: readonly unknown[]): Record<string, string> {
  const found = new Map<string, string>();
  for (const source of sources) {
    if (!isRaw(source) || typeof source.source !== "string") continue;
    const code = codeOf(source.source);
    const list = code === null ? undefined : LIST_BY_CODE.get(code);
    const day = dayFrom(source.source_last_updated);
    if (list === undefined || day === null) continue;
    const known = found.get(list.id);
    if (known === undefined || day > known) found.set(list.id, day);
  }
  return Object.fromEntries([...found].sort(([a], [b]) => compareText(a, b)));
}

/**
 * The entries in an order that depends only on what they hold: by list, compact name, start date and
 * name, and, so that two entries that agree on all of these have an order too, by their own JSON.
 */
function sortedEntries(entries: readonly CslEntry[]): CslEntry[] {
  return entries
    .map((entry) => ({ entry, key: keyOf(entry.name), json: JSON.stringify(entry) }))
    .sort(
      (a, b) =>
        compareText(a.entry.list, b.entry.list) ||
        compareText(a.key, b.key) ||
        compareText(a.entry.start ?? "", b.entry.start ?? "") ||
        compareText(a.entry.name, b.entry.name) ||
        compareText(a.json, b.json),
    )
    .map(({ entry }) => entry);
}

/**
 * The canonical text of the projection of the file: parsed once, checked (the root, and that the
 * answer is the whole list), projected, sorted. Neither the text nor the objects it parses into
 * outlive this call: it returns a string.
 */
function projectionOf(text: string, today: string): string {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new NotTheListError();
  }
  if (!isRaw(file)) throw new NotTheListError();
  const { results, sources_used: sources, offset, total } = file;
  // A paged answer holds a part of the list: the entries of the rest would be taken off the copy.
  if (
    !Array.isArray(results) ||
    !Array.isArray(sources) ||
    offset !== 0 ||
    total !== results.length
  ) {
    throw new NotTheListError();
  }

  const sdn = sdnEntityNumbers(results);
  const entries: CslEntry[] = [];
  let skipped = 0;
  let unreadableEntries = 0;
  for (const raw of results) {
    const projected = projectEntry(raw, sdn, today);
    if (projected === "dropped") continue;
    if (projected === "unknown") skipped += 1;
    else if (projected === "unreadable") unreadableEntries += 1;
    else entries.push(projected);
  }
  const projection: Projection = {
    versions: versionsOf(sources),
    skipped,
    unreadable: unreadableEntries,
    entries: sortedEntries(entries),
  };
  return JSON.stringify(projection);
}

// ---------------------------------------------------------------------------------------------
// `parse`: the records of a projection
// ---------------------------------------------------------------------------------------------

/** An entry of the projection with its list. */
interface Checked {
  list: CslList;
  entry: CslEntry;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** A field that is absent or an array of text: the text; null for anything else. */
const stringsOf = (value: unknown): string[] | null => {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
};

/** A field that is absent or text: the text, empty when absent; null for anything else. */
const stringOf = (value: unknown): string | null => {
  if (value === undefined) return "";
  return typeof value === "string" ? value : null;
};

/** A field that is absent or a day written as text: the day, or null for a text that is no day; false for any other value. */
const dayField = (value: unknown): string | null | false =>
  value === undefined ? null : typeof value === "string" ? dayFrom(value) : false;

/** A field that is absent or a list of `{ type, number }` of text; null for anything else. */
function registrationsField(value: unknown): Array<{ type: string; number: string }> | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const found: Array<{ type: string; number: string }> = [];
  for (const item of value) {
    if (!isRaw(item) || typeof item.type !== "string" || typeof item.number !== "string") {
      return null;
    }
    found.push({ type: item.type, number: item.number });
  }
  return found;
}

/** An entry as the projection holds it; null for one that does not have its shape. */
function checkedEntry(value: unknown): Checked | null {
  if (!isRaw(value)) return null;
  const list = typeof value.list === "string" ? LIST_BY_ID.get(value.list) : undefined;
  if (list === undefined || typeof value.name !== "string" || keyOf(value.name) === "") return null;
  const fields = {
    other: stringsOf(value.other),
    start: dayField(value.start),
    end: dayField(value.end),
    countries: stringsOf(value.countries),
    programs: stringsOf(value.programs),
    entityNumber: stringOf(value.entityNumber),
    notice: stringOf(value.notice),
    requirement: stringOf(value.requirement),
    policy: stringOf(value.policy),
    remarks: stringOf(value.remarks),
    listUrl: stringOf(value.listUrl),
    websites: stringsOf(value.websites),
    registrations: registrationsField(value.registrations),
  };
  const { start, end, ...rest } = fields;
  if (start === false || end === false || Object.values(rest).some((field) => field === null)) {
    return null;
  }
  // Every field that was not null or false is of its type: the checks above are the narrowing.
  return {
    list,
    entry: entryOf(list.id, value.name, {
      ...(rest as Omit<EntryFields, "start" | "end">),
      start,
      end,
    }),
  };
}

interface ReadProjection {
  versions: string[];
  skipped: number;
  /** The entries that could not be read, in the download and here. */
  unreadable: number;
  entries: Checked[];
}

/** The projection of a body; null when the body is not one. */
function readProjection(text: string): ReadProjection | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRaw(body)) return null;
  const { versions, skipped, unreadable: unreadableCount, entries } = body;
  if (
    !isRaw(versions) ||
    !isCount(skipped) ||
    !isCount(unreadableCount) ||
    !Array.isArray(entries)
  ) {
    return null;
  }
  const checked: Checked[] = [];
  let unreadableEntries = unreadableCount;
  for (const value of entries) {
    const entry = checkedEntry(value);
    if (entry === null) unreadableEntries += 1;
    else checked.push(entry);
  }
  return {
    versions: Object.values(versions).filter(
      (day): day is string => typeof day === "string" && dayFrom(day) === day,
    ),
    skipped,
    unreadable: unreadableEntries,
    entries: checked,
  };
}

/** The entry that supplies the fields of a group: the newest start date; of equal ones, a total order. */
function newestOf(group: readonly Checked[]): Checked {
  const rank = ({ entry }: Checked) => [entry.start ?? "", entry.name, JSON.stringify(entry)];
  return group.reduce((best, candidate) => {
    const [a, b] = [rank(candidate), rank(best)];
    for (let at = 0; at < a.length; at += 1) {
      if (a[at] !== b[at]) return a[at] > b[at] ? candidate : best;
    }
    return best;
  });
}

const quoted = (names: readonly string[]): string => names.map((name) => `"${name}"`).join(", ");
const moreOf = (rest: number, separator = ","): string =>
  rest > 0 ? `${separator} and ${rest} more` : "";

/** The websites and numbers of an entry as sentences: what its keys come from. */
function idSentences(entry: CslEntry): string[] {
  const websites = entry.websites ?? [];
  const registrations = entry.registrations ?? [];
  return [
    sentence(
      "Websites",
      `${websites.slice(0, MAX_SHOWN_WEBSITES).join(", ")}${moreOf(websites.length - MAX_SHOWN_WEBSITES)}`,
    ),
    sentence(
      "Registration numbers",
      `${registrations
        .slice(0, MAX_SHOWN_REGISTRATIONS)
        .map(({ type, number }) => `${type} ${number}`)
        .join("; ")}${moreOf(registrations.length - MAX_SHOWN_REGISTRATIONS, ";")}`,
    ),
  ];
}

/**
 * The text of a record: the sentences of R6, each left out when its field is empty, then the closing
 * sentence that no cut removes. The summary is at most 4,000 characters after it is put together:
 * what comes before the closing sentence is cut, with the marker, when it would not fit.
 */
function summaryOf(list: CslList, entry: CslEntry, count: number): string {
  const others = entry.other ?? [];
  const countries = entry.countries ?? [];
  const shownNames = others.slice(0, MAX_SHOWN_NAMES);
  const shownCountries = countries.slice(0, MAX_SHOWN_COUNTRIES);
  const body = joinSentences([
    `${CSL_RECORD_MARK} (trade.gov).`,
    sentence("List", list.name),
    `Entry: "${entry.name}".`,
    shownNames.length === 0
      ? ""
      : `Also listed as: ${quoted(shownNames)}${moreOf(others.length - shownNames.length)}.`,
    sentence(
      "Countries",
      `${shownCountries.join(", ")}${moreOf(countries.length - shownCountries.length)}`,
    ),
    sentence("Programs", (entry.programs ?? []).join(", ")),
    ...idSentences(entry),
    sentence("Listed since", entry.start ?? ""),
    sentence("Denial order ends", entry.end ?? ""),
    sentence("Federal Register notice", entry.notice ?? ""),
    sentence("License requirement", entry.requirement ?? ""),
    sentence("License policy", entry.policy ?? ""),
    sentence("Remarks", entry.remarks ?? ""),
    count > 1 ? `Entries of this name on the list: ${count}.` : "",
  ]);
  return `${shorten(body, CSL_MAX_SUMMARY_CHARS - CLOSING.length - 1)} ${CLOSING}`;
}

/** The keys of a record (R5): its names, the hosts of its websites, the numbers of its ids; no other. */
function matchKeysOf(entry: CslEntry): string[] {
  const hostKeys = (entry.websites ?? [])
    .flatMap(hostsOf)
    .filter((host) => !isSharedHost(host))
    .map(domainKey);
  return [
    ...nameKeysOf([entry.name, ...(entry.other ?? [])]).slice(0, CSL_MAX_NAME_KEYS),
    ...new Set(hostKeys),
    ...identifierKeysOf((entry.registrations ?? []).map(({ number }) => number)).slice(
      0,
      MAX_NUMBER_KEYS,
    ),
  ];
}

/** The record of the entries of one name on one list. */
function recordOf(sourceRecordId: string, group: readonly Checked[]): ParsedRecord {
  const { list, entry } = newestOf(group);
  const entityNumbers = [
    ...new Set(group.flatMap((member) => member.entry.entityNumber ?? [])),
  ].sort(compareText);
  const countries = entry.countries ?? [];
  return {
    sourceRecordId,
    recordType: "restricted_party",
    title: `Consolidated Screening List, ${list.short}: ${entry.name}`,
    summary: summaryOf(list, entry, group.length),
    url: `${DOCUMENTATION_PAGE}?list=${list.id}&entry=${encodeURIComponent(keyOf(entry.name))}`,
    identifiers: {
      list: list.name,
      listCode: list.code,
      ...(entry.listUrl === undefined ? {} : { officialListUrl: entry.listUrl }),
      ...(entityNumbers.length === 0 ? {} : { entityNumbers }),
      ...(entry.programs === undefined ? {} : { programs: entry.programs }),
      ...(countries.length === 0 ? {} : { countries }),
      ...(entry.websites === undefined ? {} : { websites: entry.websites }),
      ...(entry.registrations === undefined ? {} : { registrations: entry.registrations }),
    },
    matchKeys: matchKeysOf(entry),
    // The newest start date of the group is the one of the entry that supplies the fields.
    publishedAt: entry.start ?? null,
    sourceUpdatedAt: null,
  };
}

/** One record for each list and compact name, in the order of the ids. */
function recordsOf(entries: readonly Checked[]): ParsedRecord[] {
  const groups = new Map<string, Checked[]>();
  for (const checked of entries) {
    const id = `${checked.list.id}:${keyOf(checked.entry.name)}`;
    const group = groups.get(id);
    if (group === undefined) groups.set(id, [checked]);
    else group.push(checked);
  }
  return [...groups]
    .sort(([a], [b]) => compareText(a, b))
    .map(([id, group]) => recordOf(id, group));
}

const notTheList = (): ParseResult => ({
  records: [],
  errors: 1,
  sourceVersion: null,
  root: null,
});

function parseSnapshot(body: string): ParseResult {
  const projection = readProjection(body);
  if (projection === null) return notTheList();
  const records = recordsOf(projection.entries);
  // A file of more records than the list can have is not the list.
  if (records.length > CSL_MAX_RECORDS) return notTheList();
  const unreadableEntries = projection.unreadable;
  const read = projection.entries.length + unreadableEntries;
  // A few entries that do not parse are left out and counted (`skipped`); more than the list
  // tolerates is a new format, and each is an error, which fails the sync (Q7's way).
  const refused = unreadableEntries > cslUnreadableAllowed(read);
  return {
    records,
    errors: refused ? unreadableEntries : 0,
    skipped: projection.skipped + (refused ? 0 : unreadableEntries),
    sourceVersion: projection.versions.reduce<string | null>(
      (newest, day) => (newest === null || day > newest ? day : newest),
      null,
    ),
    root: CSL_ROOT,
  };
}

/** Whether an address is the file's: https, the host data.trade.gov, no port other than 443, no user. */
function isCslAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === CSL_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/**
 * The connector, with the clock that tells which day it is for the denial orders that have ended
 * (R1): the tests give it a day, the sync the time.
 */
export function createCslConnector(now: () => Date = () => new Date()): Connector {
  return {
    id: "csl",
    version: 1,
    async download(fetch, validators) {
      const response = await fetch(CSL_URL, validators, {
        maxBytes: CSL_MAX_BYTES,
        allowedContentTypes: CSL_ALLOWED_TYPES,
        totalTimeoutMs: CSL_TOTAL_TIMEOUT_MS,
      });
      // The guard follows redirects and says where the answer came from; a 304 is checked as well,
      // since it says the file at that address is current.
      if (!isCslAddress(response.url)) throw new NotTheListError();
      if (response.notModified) return "unchanged";
      return {
        bodies: [projectionOf(bodyText(response), now().toISOString().slice(0, 10))],
        etag: response.etag,
        lastModified: response.lastModified,
        bytes: response.body.length,
      };
    },
    parse: (snapshot) => parseSnapshot(snapshot.bodies[0] ?? ""),
  };
}

export const cslConnector: Connector = createCslConnector();
