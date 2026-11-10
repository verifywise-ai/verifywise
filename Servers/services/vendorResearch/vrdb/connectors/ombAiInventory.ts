/**
 * The US federal AI use case inventory as a mirrored list of the vendor risk database: the 2025
 * Federal Agency AI Use Case Inventory, compiled by the Office of Management and Budget (OMB) from
 * the agencies' public inventories and published in the repository ombegov/2025-Federal-Agency-AI-
 * Use-Case-Inventory (a work of the US Government, with no licence of its own). Its individually
 * reported use cases are one CSV of 36 columns and 3,611 rows. The column `vendor_name` names the
 * vendors that were involved in developing or maintaining a use case (OMB's data dictionary), as
 * the agency wrote them; a record is one vendor key and the use cases that name it. It is a state
 * (an annual snapshot of what agencies reported), the agencies' own report and no finding about the
 * vendor, and the text of a record names its edition.
 *
 * One file, one conditional GET, with the validators of the last download (the stored etag is the
 * server's own, a weak one for a compressed answer, which the kit keeps and sends back). The answer
 * must come from the repository's path on raw.githubusercontent.com after the redirects, a 304
 * included. GitHub serves the CSV as `text/plain`.
 *
 * The editions are a fixed table in code, and the newest entry is the one that is read: every
 * edition is a new repository whose name changes from year to year, so no rule can guess the next
 * one, and a new edition is invisible until a release adds its entry (the pin's path prefix comes
 * from the same entry). The text of a record names the edition, so that its age is visible.
 *
 * Four columns are read, by name: `agency` (an abbreviation of one to six capital letters, else the
 * row is unreadable), `vendor_name`, `development_stage` and `is_high_impact`. Everything else is
 * dropped before a row is built, `contact_email` (the addresses of federal staff) first of all, then
 * the free text that agencies and their contractors wrote (use case names, problem statements,
 * benefits, outputs, data descriptions, justifications), the address columns and the rest.
 *
 * Rule V reads `vendor_name`, which is typed by hand: several names in one cell, separated with a
 * comma, a slash, " and " or a semicolon, with parentheticals, addresses, placeholders and contract
 * numbers. A cell of more than LINE_INPUT_MAX (1,048,576) characters is no cell to read (`lineOf`
 * reads no further, so its first megabyte may be blank while a vendor stands after it): its row is
 * unreadable, counted, and adds nothing, not even its agency. Any other cell is cut at 400
 * characters (a name that the cut ended is no name, however short the cut line is: the cut is told
 * by its marker, never by the length of the line). A cell that was cut is read only up to its last
 * real separator (a semicolon, a line break, a slash, " and "): its last name goes with all that
 * follows that separator, commas included, since a comma before a legal form joins two parts of one
 * name and the cut can fall right after that comma or inside the legal form, where the join cannot
 * be told; a cut cell with no such separator names no vendor. What the cut left of an address
 * (`https:` and at most two slashes at the end of the text) is taken off first: no address pattern
 * reads it, and its slash is no separator. No real cell is that long (the longest has 138
 * characters). Addresses and parentheticals (an unclosed one too) are cut out; it
 * is split at a semicolon, a line break, a slash, " and " and a comma that no legal form follows
 * (an ampersand is no separator: "Acme & Sons" is one name); the blanks and `. , : -` are cut off
 * both ends of a name. A name is dropped when it is longer than 60 characters, is a placeholder
 * ("Not available", "In-house", "Contractor teams", ...), holds the word PIID or a run of five
 * digits (a contract number, and the Excel artefact "1899-12-31 11:59:00", whose letters and digits
 * are a run of fourteen), or has a key of fewer than four or more than 40 characters. The key is
 * `compactName(shortName(name))`: "Open AI" and "OpenAI" are one, "Microsoft Azure" is not
 * "Microsoft". The name is not told from a person's: no natural person was found among its 430
 * strings, and none is kept apart. No host is a key: the addresses in the cells are typed by
 * agencies.
 *
 * The reader groups the rows into vendors: its `rows` are the vendors, its `unreadable` the rows of
 * another width than the header, those of another agency shape and those of a vendor cell that is
 * too long to read (above), and its `total` the rows that it saw (or the vendors, when a few rows
 * name many). The identifier `vendor` of a record is a name of at most 60 characters, under the 80
 * of the display, so it is never a cut text. A file of fewer than 2,500 data rows is not this
 * list (3,611 today), and one of more than 100 agencies (41 today) is not either; a file of more than
 * 10,000 rows, of more than 10,000 vendors, of a row of more than 100 cells, or that ends inside a
 * quote is cut: the download fails as too large, and never gives a shorter list.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  LINE_INPUT_MAX,
  SHORTENED,
  compareText,
  isObject,
  lineOf,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, columnsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names the list by. */
export const OMB_AI_INVENTORY_RECORD_MARK = "US federal AI use case inventory";

/** The host as the first sentence of a record writes it. */
const HOST = "github.com/ombegov";
const OWNER = "ombegov";

/** One edition of the inventory: a year's repository and the file of its individually reported use cases. */
interface Edition {
  label: string;
  repository: string;
  file: string;
}

/** The editions that the connector knows, oldest first: the last is read, and a new one is a release. */
const EDITIONS: readonly Edition[] = [
  {
    label: "2025",
    repository: "2025-Federal-Agency-AI-Use-Case-Inventory",
    file: "2025_individually_reported_AI_use_cases.csv",
  },
];
const EDITION = EDITIONS[EDITIONS.length - 1];

const FILE_URL = `https://raw.githubusercontent.com/${OWNER}/${EDITION.repository}/main/Data/${EDITION.file}`;
const DOCUMENTATION_URL = `https://github.com/${OWNER}/${EDITION.repository}`;
/** The repository's directory on the file host: the answer of a download comes from under it. */
const PIN: Pin = {
  hosts: ["raw.githubusercontent.com"],
  pathPrefixes: [`/${OWNER}/${EDITION.repository}/`],
};

/** The columns that are read, by their exact names; the file is not the list without all of them. */
const WANTED = {
  agency: "agency",
  vendor: "vendor_name",
  stage: "development_stage",
  impact: "is_high_impact",
} as const;

/** A file of fewer data rows is not this list (3,611 today). */
const MIN_ROWS = 2500;
/** A file of more data rows is cut by its limit, and fails as too large. */
const MAX_ROWS = 10_000;
/** The inventory has 36 columns; a row of more than this many is no row of it. */
const MAX_COLUMNS = 100;
/** The most vendors of a list (377 today). */
const MAX_VENDORS = 10_000;
/** The most agencies of a file (41 today): more is not this list, and bounds the row of a vendor. */
const MAX_AGENCIES = 100;

/** The agency of a use case: its abbreviation. */
const AGENCY = /^[A-Z]{1,6}$/;
const AGENCY_CELL_MAX = 20;
const STAGE_CELL_MAX = 40;
const IMPACT_CELL_MAX = 60;
/** The one label of the file that the agencies give a use case that they find high-impact. */
const HIGH_IMPACT = "High-impact";

const VENDOR_CELL_MAX = 400;
const TOKEN_MAX_CHARS = 60;
const KEY_MIN_CHARS = 4;
const KEY_MAX_CHARS = 40;
const DISPLAY_MAX = 80;
const NAMES_MAX = 5;
const AGENCIES_SHOWN = 6;

/** A line break in a vendor cell separates two names, as a semicolon does. */
const LINE_BREAKS = /[\r\n]+/g;
const ADDRESSES = /https?:\/\/\S+/gi;
/** What the cut of a cell leaves of an address that it ended, with no character after the slashes (ADDRESSES needs one): `https:`, `http:/`, `https://`. */
const CUT_ADDRESS = /https?:\/{0,2}$/i;
/** A parenthetical qualifier, an unclosed one too (it runs to the end of the cell). */
const PARENTHETICALS = /\([^)]*\)?/g;
/** " and " between two names; the blanks are the separator's own. */
const AND = /\sand\s/i;
/** A word that makes the comma before it part of a legal form: "Acme, Inc.", "Acme, LLC". */
const LEGAL_FORM_AHEAD =
  /^\s*(?:inc|ltd|llc|llp|lp|corp|co|ulc|limited|incorporated|corporation|plc|gmbh|pllc|pc)(?![\p{L}\p{N}])/iu;
/** What an agency writes when it names no vendor, or names one that is none. */
const PLACEHOLDER =
  /^(?:n\/?a|not available|not applicable|tbd|tba|none|unknown|other|various|multiple|contractor teams?|contractors?|open[- ]?source.*|ai (?:service|model) provider|in[- ]?house.*|internal.*|agency.*|federal.*|government.*|law enforcement sensitive.*|commercial.*|cots|vendor|vendors|third[- ]party.*|proprietary.*)$/i;
/** The word that a contract number comes with (the procurement instrument identifier). */
const CONTRACT_WORD = /\bpiid\b/i;
/** A run of five digits: a contract number, or the Excel artefact of a time, once its punctuation is off. */
const DIGIT_RUN = /\d{5,}/;
/** Besides blanks, the punctuation that is cut off both ends of a name. */
const END_PUNCTUATION = new Set([".", ",", ":", "-", "\t"]);

type StageKey = "deployedOrPiloted" | "preDeployment" | "retired" | "none";

/** The development stage of a use case as the file writes it; any other text is no stage. */
const STAGE_OF: ReadonlyMap<string, StageKey> = new Map<string, StageKey>([
  ["Deployed", "deployedOrPiloted"],
  ["Pilot", "deployedOrPiloted"],
  ["Pre-deployment", "preDeployment"],
  ["Retired", "retired"],
]);

/** The vendor, with the use cases that name it: the row of this list. */
interface VendorRow {
  /** `compactName(shortName(name))`: stable, and the same for "Open AI" and "OpenAI". */
  id: string;
  /** The spelling that most use cases use, at most DISPLAY_MAX characters. */
  display: string;
  /** The distinct spellings, the most used first, at most NAMES_MAX: the names the keys are made of. */
  names: string[];
  /** How many use cases name the vendor (a use case once, however often its cell names it). */
  useCases: number;
  /** The agencies that name it, the one with the most use cases first, then in the order of their text. */
  agencies: string[];
  stages: Record<StageKey, number>;
  /** The use cases that the agency labels exactly "High-impact". */
  highImpact: number;
  /** The year of the edition that the file is of: the same in every row. */
  edition: string;
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
 * The text split on commas, except a comma that a legal form follows (Inc, Ltd, LLC, LLP, LP, Corp,
 * Co, ULC, Limited, Incorporated, Corporation, PLC, GmbH, PLLC, PC, in any case, ending the word,
 * with or without a full stop): that comma is part of the name.
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
    for (const piece of part.split("/")) {
      for (const name of piece.split(AND)) pieces.push(...splitOnCommas(name));
    }
  }
  return pieces;
}

/**
 * The text of a cell that was cut, up to its last real separator (a semicolon, which a line break
 * became, a slash, or " and "): the last name of the cell goes, with everything that follows that
 * separator. What the cut ended is the front of a name, and where that name begins cannot be told when
 * it holds commas: a comma before a legal form is part of the name, the join is decided by the text
 * after the comma, and a cut right after the comma or inside the legal form (`X, LL`) leaves `X`
 * looking like a whole name. So the commas of the tail are no separators here, and a cell with no real
 * separator at all is left out whole (no real cell is that long).
 *
 * An address that the cut ended right after `https:/` or `https://` is no address to ADDRESSES (it
 * needs a character after the slashes), and its slash would be the last real separator: the name
 * before it, `X` in `X https://`, would stand as a whole name with `https` on its end. So what the
 * cut left of an address is taken off first, from the end of the text only.
 */
function beforeLastSeparator(kept: string): string {
  const text = kept.replace(CUT_ADDRESS, " ");
  let at = Math.max(text.lastIndexOf(";"), text.lastIndexOf("/"));
  const ands = new RegExp(AND.source, "gi");
  for (let found = ands.exec(text); found !== null; found = ands.exec(text)) {
    at = Math.max(at, found.index);
  }
  return at === -1 ? "" : text.slice(0, at);
}

/**
 * The names of a vendor cell (`vendor_name`) with the key each gives, each spelling once (rule V of
 * the comment of this file).
 */
function vendorsOf(cell: string): Array<{ key: string; name: string }> {
  const line = cellOf(cell.replace(LINE_BREAKS, ";"), VENDOR_CELL_MAX);
  const cut = line.endsWith(SHORTENED);
  const text = (cut ? line.slice(0, line.length - SHORTENED.length) : line)
    .replace(ADDRESSES, " ")
    .replace(PARENTHETICALS, " ");
  // The last name of a cell that was cut may be only the front of one: it goes, with all that follows the last real separator.
  const pieces = piecesOf(cut ? beforeLastSeparator(text) : text);

  const seen = new Set<string>();
  const vendors: Array<{ key: string; name: string }> = [];
  for (const piece of pieces) {
    const name = trimmed(piece);
    if (name === "" || name.length > TOKEN_MAX_CHARS || seen.has(name)) continue;
    seen.add(name);
    if (PLACEHOLDER.test(name) || CONTRACT_WORD.test(name)) continue;
    const key = compactName(shortName(name));
    if (key.length < KEY_MIN_CHARS || key.length > KEY_MAX_CHARS || DIGIT_RUN.test(key)) continue;
    vendors.push({ key, name });
  }
  return vendors;
}

/** What the inventory's rows say of one vendor, while they are read. */
interface Group {
  spellings: Map<string, number>;
  useCases: number;
  agencies: Map<string, number>;
  stages: Record<StageKey, number>;
  highImpact: number;
}

const newGroup = (): Group => ({
  spellings: new Map(),
  useCases: 0,
  agencies: new Map(),
  stages: { deployedOrPiloted: 0, preDeployment: 0, retired: 0, none: 0 },
  highImpact: 0,
});

/** One use case that names vendors, as far as it is read. */
interface UseCase {
  agency: string;
  stage: StageKey;
  highImpact: boolean;
  vendors: Array<{ key: string; name: string }>;
}

/**
 * Adds a use case to the group of each vendor it names, once for each; false when there are too
 * many vendors.
 */
function addUseCase(groups: Map<string, Group>, useCase: UseCase): boolean {
  const spellings = new Map<string, Set<string>>();
  for (const { key, name } of useCase.vendors) {
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
    group.useCases += 1;
    group.stages[useCase.stage] += 1;
    if (useCase.highImpact) group.highImpact += 1;
    group.agencies.set(useCase.agency, (group.agencies.get(useCase.agency) ?? 0) + 1);
    for (const name of names) group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
  }
  return true;
}

/** The entries of a count map, the largest count first and then by text, so that no order of rows decides. */
const byCountThenText = (counts: ReadonlyMap<string, number>): Array<[string, number]> =>
  [...counts].sort(([a, x], [b, y]) => y - x || compareText(a, b));

/** The row of a vendor: every list in the order that never depends on the order of the file. */
function rowOf(key: string, group: Group): VendorRow {
  const spellings = byCountThenText(group.spellings).map(([name]) => name);
  return {
    id: key,
    display: lineOf(spellings[0], DISPLAY_MAX),
    names: spellings.slice(0, NAMES_MAX),
    useCases: group.useCases,
    agencies: byCountThenText(group.agencies).map(([agency]) => agency),
    stages: group.stages,
    highImpact: group.highImpact,
    edition: EDITION.label,
  };
}

/**
 * The vendors of the inventory's CSV, or null when the file is not the list (a header without one
 * of the four columns, fewer than MIN_ROWS data rows, more than MAX_AGENCIES agencies). A file that
 * was cut (a quote that was never closed, more than MAX_ROWS rows, a row of more than MAX_COLUMNS
 * cells, more than MAX_VENDORS vendors) gives a read that says so, and the download fails as too
 * large, whatever else the file holds. A row of another width than the header, or of an agency that
 * is no abbreviation, is unreadable.
 */
function read(fetched: Fetched): ReadResult<VendorRow> | null {
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
  const agencies = new Set<string>();
  let unreadable = 0;
  for (let at = 1; at < table.rows.length; at += 1) {
    const cells = cellsOf(table.rows[at], header.length);
    const agency = cells === null ? "" : lineOf(cells[columns.agency], AGENCY_CELL_MAX);
    // `lineOf` reads no more than LINE_INPUT_MAX units of a cell, and gives an empty line, with no
    // marker, when that part cleans to nothing: a vendor cell whose first megabyte is blank would name
    // no vendor, and the vendor written after it would be lost without a count. Such a cell is no cell
    // to read, and a row that cannot be read adds nothing, not even its agency.
    if (cells === null || !AGENCY.test(agency) || cells[columns.vendor].length > LINE_INPUT_MAX) {
      unreadable += 1;
      continue;
    }
    agencies.add(agency);
    if (agencies.size > MAX_AGENCIES) return null;

    const vendors = vendorsOf(cells[columns.vendor]);
    if (vendors.length === 0) continue;
    const useCase: UseCase = {
      agency,
      stage: STAGE_OF.get(lineOf(cells[columns.stage], STAGE_CELL_MAX)) ?? "none",
      highImpact: lineOf(cells[columns.impact], IMPACT_CELL_MAX) === HIGH_IMPACT,
      vendors,
    };
    if (!addUseCase(groups, useCase)) return cut;
  }
  const rows = [...groups].map(([key, group]) => rowOf(key, group));
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

const isTexts = (value: unknown, max: number, longest: number): value is string[] =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every((text) => typeof text === "string" && text.length <= longest);

/** Whether a row of a body is a row of this list: what `read` makes, and nothing else. */
function isVendorRow(value: unknown): value is VendorRow {
  if (!isObject(value)) return false;
  const { id, display, names, useCases, agencies, stages, highImpact, edition } = value;
  if (
    typeof id !== "string" ||
    typeof display !== "string" ||
    display.length > DISPLAY_MAX ||
    !isTexts(names, NAMES_MAX, TOKEN_MAX_CHARS) ||
    !isCount(useCases) ||
    useCases < 1 ||
    !isTexts(agencies, MAX_AGENCIES, 6) ||
    agencies.length < 1 ||
    !agencies.every((agency) => AGENCY.test(agency)) ||
    !isObject(stages) ||
    !isCount(stages.deployedOrPiloted) ||
    !isCount(stages.preDeployment) ||
    !isCount(stages.retired) ||
    !isCount(stages.none) ||
    !isCount(highImpact) ||
    typeof edition !== "string"
  ) {
    return false;
  }
  const staged = stages.deployedOrPiloted + stages.preDeployment + stages.retired + stages.none;
  return staged === useCases && highImpact <= useCases && /^[0-9]{4}$/.test(edition);
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${OMB_AI_INVENTORY_RECORD_MARK} (${HOST}), a register or status list.`;

/** What a record is and is not; second, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "A record is US federal agencies' own report, compiled by the Office of Management and Budget, " +
  "that a vendor was involved in developing or maintaining AI use cases they list; it says " +
  "nothing about the vendor's conduct or the systems' quality.";

/** The last sentence of every record, never cut and never left out: where the entry is from. */
const closingOf = (edition: string): string =>
  `Source: US Office of Management and Budget, ${edition} Federal Agency AI Use Case Inventory; ` +
  "entries adapted by VerifyWise.";

/** The counts by stage as the text writes them: the stages that no use case is in are left out. */
function stagesText(stages: Record<StageKey, number>): string {
  return [
    [stages.deployedOrPiloted, "deployed or piloted"],
    [stages.preDeployment, "before deployment"],
    [stages.retired, "retired"],
    [stages.none, "with no stage"],
  ]
    .filter(([count]) => count !== 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(", ");
}

/** A count with its noun: the noun is in the singular when the count is exactly one. */
const nounOf = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The record of a vendor: the agencies' own report of it, as of the edition. */
function recordFor(value: VendorRow): ParsedRecord {
  if (!isVendorRow(value)) throw new UnreadableEntry();
  const row = value;
  const impact =
    row.highImpact > 0 ? `; ${row.highImpact} of them high-impact by the agency's own label` : "";
  const counted =
    `${row.edition} edition: ${nounOf(row.useCases, "use case", "use cases")} from ` +
    `${nounOf(row.agencies.length, "agency", "agencies")} ${row.useCases === 1 ? "names" : "name"} ` +
    `it (${stagesText(row.stages)})${impact}.`;
  const more = row.agencies.length - AGENCIES_SHOWN;
  const agencies = row.agencies.slice(0, AGENCIES_SHOWN).join(", ");

  return recordOf({
    id: row.id,
    type: "algorithm_register_supplier",
    title: `${OMB_AI_INVENTORY_RECORD_MARK}: ${row.display}`,
    summary: summaryWithClosing(
      [
        FIRST_SENTENCE,
        NOT_A_FINDING,
        sentence("Vendor as written", row.display),
        counted,
        sentence("Agencies", more > 0 ? `${agencies} and ${more} more` : agencies),
      ],
      closingOf(row.edition),
      RECORD_SUMMARY_MAX,
    ),
    // One page for the repository, so that a vendor's address is its own: GitHub ignores the query.
    url: `${DOCUMENTATION_URL}?vendor=${encodeURIComponent(row.id)}`,
    identifiers: {
      // Whole, never a cut text: a name is at most TOKEN_MAX_CHARS (60) characters,
      // under the DISPLAY_MAX (80) of the display, so `lineOf` does not cut it.
      vendor: row.display,
      useCases: row.useCases,
      agencies: row.agencies.length,
      edition: row.edition,
    },
    names: row.names,
    publishedAt: null,
    sourceUpdatedAt: null,
  });
}

export const ombAiInventoryConnector: Connector = createFileConnector<VendorRow>({
  id: "omb_ai_inventory",
  version: 1,
  root: EDITION.file,
  sortKey: (row) => row.id,
  files: [
    { url: FILE_URL, maxBytes: 25_165_824, contentTypes: ["text/plain"], timeoutMs: 120_000 },
  ],
  pin: PIN,
  read,
  toRecords: (rows) => rows.map(recordFor),
  sourceVersion: () => EDITION.label,
});
