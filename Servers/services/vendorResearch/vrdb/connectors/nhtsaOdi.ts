/**
 * The defect investigations of the National Highway Traffic Safety Administration (NHTSA; nhtsa_odi,
 * Q35): the investigations file of the Office of Defects Investigation, a work of the United States
 * government, published as one static zip (FLAT_INV.zip) whose single entry, FLAT_INV.txt, is a
 * TAB-delimited text of 11 fields with no header row and a line feed at the end of every line but the
 * last: 154,460 lines and 390.6 MB inflated on 2026-11-10, one line for each component and vehicle of
 * an investigation (an investigation has 1 to 71,004 of them). An investigation is not a finding that
 * a defect exists, and the file says nothing of its outcome: the record counts and never judges.
 *
 * One record per MANUFACTURER (MFR_NAME grouped by its compact name without the legal form, 587
 * entities today, 583 of them with a record), because a record per investigation would let one
 * manufacturer flood a run and a record per line would be 154,460. The rows of an investigation
 * collapse into one first (its opening and closing day, its subject, its components, whether it is
 * linked to a recall campaign, the manufacturers it names), and then the investigation counts once
 * for EACH distinct manufacturer it names (228 name two or more). Per manufacturer the record holds
 * the number of investigations, the first and last year they were opened in, the counts by year
 * opened, how many are linked to a recall campaign, how many opened in the last seven calendar years
 * have no close date recorded, how many name a driver assistance or automated driving component, and
 * the three newest.
 *
 * Which manufacturers have a record. A record is found by a vendor's name, so a manufacturer has one
 * when some name of it, as written or without its legal form, has four compact characters or more
 * (`hasNameKey`, which are the keys of `recordOf`); one with no such name (a bare acronym of three
 * letters) could be asked for by nobody and has none: 4 of today's 587. The id of a manufacturer is
 * the compact name WITHOUT its legal form, and that can be under four characters when the full name
 * is not ("Abc, Inc." is `abc`): such a manufacturer has a record, keyed by its full name, and 8 of
 * today's have one.
 *
 * What is read of a line, and what is not. Seven of the eleven fields are decoded (the investigation
 * id, the component, the manufacturer, the two days, the campaign number as a yes or no, and the
 * subject); the vehicle's make, model and year are never decoded, and neither is SUMMARY, NHTSA's
 * detail text, which names petitioners and complainants, holds phone numbers, links, quoted letters
 * and control characters. Rows that name no manufacturer (the cell is empty, or one of the file's
 * placeholders, or a name the file itself retired) are no entity and are counted apart from the rows
 * that cannot be read: they are 1,401 of the 154,460 lines. A row that cannot be read is one whose
 * width is not 11, whose id does not have the form of an investigation id, whose days are not days,
 * whose manufacturer's name does not fit in 80 units once it is cleaned (it is never cut into an id or
 * a key), or whose chosen fields are not UTF-8: it is left out and counted. The kit tolerates a
 * hundredth of the lines of the file (1,544 of today's 154,460: `ReadResult.allowanceBasis` measures it
 * over the lines, which it would not over the manufacturers, which allow ten) and fails the parse as
 * an error beyond that; a file in which more than one line in twenty is such is no list at all, and
 * the download refuses it as that. Today there is none.
 *
 * The file is NEVER held in memory: nhtsaFlat.ts streams the entry (390.6 MB, never held), the reducer
 * of this file keeps a small state for each investigation and then for each manufacturer, and the
 * result is one small JSON that `read` turns into the rows of the snapshot. Everything that grows with
 * the file is therefore in `fetchFiles`, as a stream, and `read` takes milliseconds. The state is
 * capped (investigations, the components and manufacturers they name, manufacturers): a hostile file
 * past a cap fails the download as too large, and never gives a shorter list.
 *
 * The years are counted from the newest day in the file, never from the clock, so that the same file
 * read on two days is one body; every manufacturer's row carries that year and day, since a record is
 * made of one row. Nothing here depends on the order of the lines: the minimum, the maximum, the sets
 * and the counts do not, and the one choice that could (which spelling is shown) is made by count and
 * then by text.
 *
 * A vendor is matched by the manufacturer's name alone, as written and without its legal form, and,
 * for a name such as "Acme (Acme Motor Co.)", by the text before the parenthesis and the text inside
 * it (as the crash list does, nhtsa.ts): never by the make, which a robotaxi operator can bear on a
 * vehicle of another maker. Natural persons: every one of the 595 names of the real file was read, and
 * none is a person, and rules by the shape of a name had no precision, so no filter is applied; a name
 * is a business unless proven otherwise.
 */
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import { compareText, isObject, lineOf } from "./kit/clean";
import {
  type Fetched,
  type ListSpec,
  type ReadResult,
  createFileConnector,
} from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { tabFieldsOf } from "./kit/stream";
import { summaryWithClosing } from "./kit/summary";
import {
  ENTITY_NAME_MAX,
  FLAT_LINES_MAX,
  type FlatFile,
  type FlatLimits,
  type FlatMeta,
  NEWEST_SHOWN,
  NHTSA_DOCUMENTATION_URL,
  YEARS_SHOWN,
  byYearOf,
  cellCleaner,
  countPhrase,
  entityKeyOf,
  envelopeOf,
  fetchedOf,
  firstSentence,
  flatMetaOf,
  hasNameKey,
  isCleanLine,
  isCount,
  isDriverAssistance,
  isEntityId,
  isStoredDay,
  isYear,
  keyNamesOf,
  nameCleaner,
  optionalDay,
  readEnvelope,
  streamFlatFile,
  topSpellings,
  yearsSentence,
} from "./nhtsaFlat";
import { BodyTooLargeError, type Connector, NotTheListError } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const NHTSA_ODI_RECORD_MARK = "NHTSA defect investigations";

const ENTRY_NAME = "FLAT_INV.txt";

/** Where the zip is, and where an answer to it may come from (a 304 included). */
const PIN: Pin = { hosts: ["static.nhtsa.gov"], pathPrefixes: ["/odi/ffdd/inv/"] };
const FILE: FlatFile = {
  url: "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip",
  pin: PIN,
  entryName: ENTRY_NAME,
  contentTypes: ["application/octet-stream", "application/zip"],
  timeoutMs: 120_000,
};

/**
 * The limits of a download: the zip may have 32 MiB (it is about 4.3 MB), the entry 600 MiB inflated
 * (1.6 times today's 390.6 MB) and the file 1,000,000 lines (6.5 times today's 154,460).
 */
export const NHTSA_ODI_LIMITS: FlatLimits = {
  maxZipBytes: 33_554_432,
  maxInflatedBytes: 629_145_600,
  maxLines: FLAT_LINES_MAX,
};

/**
 * The least that the file must hold to be the list: 4,000 investigations of ALL the file's (5,357
 * today, those that name no manufacturer counted), and 400 manufacturers that have a record (583
 * today, of 587 entities). A file smaller than that is cut, or is another file.
 */
export const NHTSA_ODI_FLOORS = { investigations: 4_000, entities: 400 } as const;

/** The most investigations, manufacturers, and (investigation, component or manufacturer) pairs that the reducer keeps. */
const INVESTIGATIONS_MAX = 50_000;
const ENTITIES_MAX = 2_000;
const PAIRS_MAX = 200_000;

/** The width of a line: 11 fields, no header. Fields 2 to 4 and 11 are never decoded. */
const WIDTH = 11;
const FIELD_ID = 1;
const FIELD_COMPONENT = 5;
const FIELD_MANUFACTURER = 6;
const FIELD_OPENED = 7;
const FIELD_CLOSED = 8;
const FIELD_CAMPAIGN = 9;
const FIELD_SUBJECT = 10;
const WANTED = [
  FIELD_ID,
  FIELD_COMPONENT,
  FIELD_MANUFACTURER,
  FIELD_OPENED,
  FIELD_CLOSED,
  FIELD_CAMPAIGN,
  FIELD_SUBJECT,
] as const;

/** The id of an investigation: two letters of the kind, the year, an optional letter, the serial. */
const INVESTIGATION_ID = /^[A-Z]{1,2}[0-9]{2}[A-Z]?[0-9]{2,3}$/;

/** How long a component and a subject may be in a row, and how long each is in the text of a record. */
const COMPONENT_MAX = 112;
const SUBJECT_MAX = 135;
const COMPONENT_SHOWN = 40;
const SUBJECT_SHOWN = 80;

/** An investigation opened in or after the anchor year minus this counts when it has no close date. */
const NO_CLOSE_YEARS = 6;

/**
 * At most one row in twenty may have the wrong shape for the file to be the list: more is another file.
 * The kit's allowance is narrower (a hundredth of the rows), and what lies between the two fails the
 * parse as an error, a file with a bad stretch, and is not a file that is no list.
 */
const WRONG_SHAPE_ONE_IN = 20;

/** The closing sentence of every record: what an investigation is not, and the licence's notice. */
const CLOSING_SENTENCE =
  "An investigation is not a finding that a defect exists; the list holds an entry for the manufacturer. " +
  "Not endorsed by NHTSA; adapted by VerifyWise from NHTSA's flat file.";

/** One of the (at most three) newest investigations of a manufacturer, as a row holds it. */
export interface OdiNewest {
  id: string;
  /** The day it was opened, or null when the file has none. */
  odate: string | null;
  /** The day it was closed, or null when the file has none: that is no proof that it is open. */
  cdate: string | null;
  /** The component it names most often; empty when it names none. */
  component: string;
  /** Its subject; empty when the file says UNKNOWN or nothing. */
  subject: string;
}

/** What the reducer says of a manufacturer, as the JSON of a download holds it. */
interface OdiEnvelopeEntity {
  id: string;
  display: string;
  names: string[];
  investigations: number;
  firstYear: number | null;
  lastYear: number | null;
  byYear: Record<string, number>;
  linked: number;
  noClose: number;
  adas: number;
  newest: OdiNewest[];
  /** The newest day of any of its investigations (opening or closing); null when it has none. */
  publishedAt: string | null;
}

/**
 * The row of a manufacturer (the body's `P`): its counts, and the year and day of the file that the
 * counts are anchored on, since `toRecords` is given one row and nothing else.
 */
export interface OdiEntity extends Omit<OdiEnvelopeEntity, "publishedAt"> {
  publishedAt: string;
  /** The calendar year of the newest day in the file: the years are counted back from it, never from the clock. */
  anchorYear: number;
  /** The newest day in the file: the version of the list. */
  fileNewestDay: string;
}

/** What the reducer keeps of one investigation while the file streams by. */
interface Investigation {
  /** The earliest opening day of its rows. */
  odate: string | null;
  /** The latest closing day of its rows. */
  cdate: string | null;
  /** The smallest usable subject of its rows. */
  subject: string;
  linked: boolean;
  /** Its components, with the number of rows of each. */
  components: Map<string, number>;
  /** The spellings of the manufacturers it names. */
  manufacturers: Set<string>;
}

/** What a line says, once it is known to be a row of the right shape. */
interface Row {
  id: string;
  component: string;
  /** The manufacturer as a clean name; empty when the cell names nobody. */
  manufacturer: string;
  odate: string | null;
  cdate: string | null;
  linked: boolean;
  subject: string;
}

const earlier = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a <= b ? a : b;
const later = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a >= b ? a : b;

/** The year of a stored day (`YYYY-MM-DD`). */
const yearOf = (day: string): number => Number(day.slice(0, 4));

const isNoComponent = (component: string): boolean => component.toUpperCase() === "NONE";
const isNoSubject = (subject: string): boolean => subject.toUpperCase() === "UNKNOWN";

/** The component that most of the rows of an investigation name, a tie by text; empty for none. */
function topComponent(components: ReadonlyMap<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [component, count] of components) {
    if (count > bestCount || (count === bestCount && compareText(component, best) < 0)) {
      best = component;
      bestCount = count;
    }
  }
  return best;
}

/** A newest investigation of a manufacturer, with the day it is ranked by. */
interface Ranked {
  day: string;
  item: OdiNewest;
}

/** The newest first: by day, then by id, both descending, so that no tie is left to the order of the file. */
const newestFirst = (a: Ranked, b: Ranked): number =>
  compareText(b.day, a.day) || compareText(b.item.id, a.item.id);

/** What the reducer builds of a manufacturer. */
interface Build {
  investigations: number;
  spellings: Map<string, number>;
  years: Map<number, number>;
  firstYear: number | null;
  lastYear: number | null;
  linked: number;
  noClose: number;
  adas: number;
  newest: Ranked[];
  publishedAt: string | null;
}

const newBuild = (): Build => ({
  investigations: 0,
  spellings: new Map(),
  years: new Map(),
  firstYear: null,
  lastYear: null,
  linked: 0,
  noClose: 0,
  adas: 0,
  newest: [],
  publishedAt: null,
});

/**
 * Reduces the lines of the file to its manufacturers, one line at a time, never holding more than the
 * state of an investigation and of a manufacturer. `push` is the `onLine` of `streamFlatFile`; `finish`
 * gives the meta of the file and its manufacturers, which `read` takes back from JSON.
 */
class OdiReducer {
  private readonly investigations = new Map<string, Investigation>();
  private readonly cleanName = nameCleaner();
  private readonly cleanComponent = cellCleaner(COMPONENT_MAX);
  private readonly cleanSubject = cellCleaner(SUBJECT_MAX);
  private rows = 0;
  private blankLines = 0;
  private unreadable = 0;
  private noEntityRows = 0;
  /** The (investigation, component) and (investigation, manufacturer) pairs held: capped, since a file chooses them. */
  private pairs = 0;
  private newestDay: string | null = null;

  /** One line of the file: a Buffer valid during the call, or null for a line too long to read. */
  push(line: Buffer | null): void {
    if (line !== null && line.length === 0) {
      this.blankLines += 1;
      return;
    }
    this.rows += 1;
    const row = line === null ? null : this.rowOf(line);
    if (row === null) {
      this.unreadable += 1;
      return;
    }
    this.add(row);
  }

  /**
   * The row of a line, or null when it is not one: wrong width, not UTF-8, a bad id, a bad day, or a
   * manufacturer name that does not fit in the cap (it is never cut into an id: the line is unreadable).
   */
  private rowOf(line: Buffer): Row | null {
    const fields = tabFieldsOf(line, WIDTH, WANTED);
    if (fields === null) return null;
    const [id, component, cell, opened, closed, campaign, subject] = fields;
    if (!INVESTIGATION_ID.test(id)) return null;
    const odate = optionalDay(opened);
    const cdate = optionalDay(closed);
    if (odate === undefined || cdate === undefined) return null;
    const manufacturer = this.cleanName(cell);
    if (manufacturer === null) return null;
    return { id, component, manufacturer, odate, cdate, linked: campaign !== "", subject };
  }

  private add(row: Row): void {
    this.newestDay = later(this.newestDay, later(row.odate, row.cdate));

    let investigation = this.investigations.get(row.id);
    if (investigation === undefined) {
      if (this.investigations.size >= INVESTIGATIONS_MAX) throw new BodyTooLargeError();
      investigation = {
        odate: null,
        cdate: null,
        subject: "",
        linked: false,
        components: new Map(),
        manufacturers: new Set(),
      };
      this.investigations.set(row.id, investigation);
    }
    investigation.odate = earlier(investigation.odate, row.odate);
    investigation.cdate = later(investigation.cdate, row.cdate);
    investigation.linked = investigation.linked || row.linked;

    const subject = this.cleanSubject(row.subject);
    if (subject !== "" && !isNoSubject(subject)) {
      if (investigation.subject === "" || compareText(subject, investigation.subject) < 0) {
        investigation.subject = subject;
      }
    }

    const component = this.cleanComponent(row.component);
    if (component !== "" && !isNoComponent(component)) {
      const count = investigation.components.get(component);
      if (count === undefined) this.countPair();
      investigation.components.set(component, (count ?? 0) + 1);
    }

    const name = row.manufacturer;
    if (name === "") {
      this.noEntityRows += 1;
    } else if (!investigation.manufacturers.has(name)) {
      this.countPair();
      investigation.manufacturers.add(name);
    }
  }

  private countPair(): void {
    this.pairs += 1;
    if (this.pairs > PAIRS_MAX) throw new BodyTooLargeError();
  }

  /**
   * The meta of the file and its manufacturers, sorted by id, once the file is read to its end.
   * `lines` is the number of lines the splitter gave, which `read` checks against the lines this
   * reducer counted. A file with no day at all is no list.
   */
  finish(lines: number): { meta: object; entities: OdiEnvelopeEntity[] } {
    if (this.newestDay === null) throw new NotTheListError();
    const fileNewestDay = this.newestDay;
    const anchorYear = yearOf(fileNewestDay);
    const builds = new Map<string, Build>();

    for (const [id, investigation] of this.investigations) {
      const keyed = new Map<string, string[]>();
      for (const spelling of investigation.manufacturers) {
        const key = entityKeyOf(spelling);
        if (key === "") continue;
        const spellings = keyed.get(key);
        if (spellings === undefined) keyed.set(key, [spelling]);
        else spellings.push(spelling);
      }
      if (keyed.size === 0) continue;

      const component = topComponent(investigation.components);
      const adas = [...investigation.components.keys()].some(isDriverAssistance);
      const day = later(investigation.odate, investigation.cdate);
      const openedYear = investigation.odate === null ? null : yearOf(investigation.odate);
      const noClose =
        investigation.cdate === null &&
        openedYear !== null &&
        openedYear >= anchorYear - NO_CLOSE_YEARS;

      for (const [key, spellings] of keyed) {
        let build = builds.get(key);
        if (build === undefined) {
          if (builds.size >= ENTITIES_MAX) throw new BodyTooLargeError();
          build = newBuild();
          builds.set(key, build);
        }
        build.investigations += 1;
        for (const spelling of spellings) {
          build.spellings.set(spelling, (build.spellings.get(spelling) ?? 0) + 1);
        }
        if (openedYear !== null) {
          build.years.set(openedYear, (build.years.get(openedYear) ?? 0) + 1);
          build.firstYear =
            build.firstYear === null ? openedYear : Math.min(build.firstYear, openedYear);
          build.lastYear =
            build.lastYear === null ? openedYear : Math.max(build.lastYear, openedYear);
        }
        if (investigation.linked) build.linked += 1;
        if (noClose) build.noClose += 1;
        if (adas) build.adas += 1;
        if (day !== null) {
          build.publishedAt = later(build.publishedAt, day);
          build.newest.push({
            day,
            item: {
              id,
              odate: investigation.odate,
              cdate: investigation.cdate,
              component,
              subject: investigation.subject,
            },
          });
          build.newest.sort(newestFirst);
          if (build.newest.length > NEWEST_SHOWN) build.newest.length = NEWEST_SHOWN;
        }
      }
    }

    const entities: OdiEnvelopeEntity[] = [...builds]
      .sort(([a], [b]) => compareText(a, b))
      .map(([id, build]) => {
        const names = topSpellings(build.spellings);
        return {
          id,
          display: names[0],
          names,
          investigations: build.investigations,
          firstYear: build.firstYear,
          lastYear: build.lastYear,
          byYear: byYearOf(build.years, anchorYear),
          linked: build.linked,
          noClose: build.noClose,
          adas: build.adas,
          newest: build.newest.map((ranked) => ranked.item),
          publishedAt: build.publishedAt,
        };
      });

    const meta: FlatMeta & { investigations: number } = {
      anchorYear,
      fileNewestDay,
      lines,
      blankLines: this.blankLines,
      rows: this.rows,
      unreadable: this.unreadable,
      noEntityRows: this.noEntityRows,
      entities: entities.length,
      investigations: this.investigations.size,
    };
    return { meta, entities };
  }
}

/** A cell that a row holds: nothing, or a clean line of at most `max` units. */
const isCleanOrEmpty = (value: unknown, max: number): value is string =>
  value === "" || isCleanLine(value, max);

function newestOf(value: unknown): OdiNewest | null {
  if (!isObject(value)) return null;
  const { id, odate, cdate, component, subject } = value;
  if (
    typeof id !== "string" ||
    !INVESTIGATION_ID.test(id) ||
    !(odate === null || isStoredDay(odate)) ||
    !(cdate === null || isStoredDay(cdate)) ||
    !isCleanOrEmpty(component, COMPONENT_MAX) ||
    !isCleanOrEmpty(subject, SUBJECT_MAX)
  ) {
    return null;
  }
  return { id, odate, cdate, component, subject };
}

/** The counts by year opened of a row: only the years that end at the anchor year, each above zero. */
function readByYear(
  value: unknown,
  anchorYear: number,
  investigations: number,
): Record<string, number> | null {
  if (!isObject(value)) return null;
  const years: Record<string, number> = {};
  let total = 0;
  for (let year = anchorYear - YEARS_SHOWN + 1; year <= anchorYear; year += 1) {
    const count = value[String(year)];
    if (count === undefined) continue;
    if (!isCount(count) || count === 0) return null;
    years[String(year)] = count;
    total += count;
  }
  return Object.keys(value).length === Object.keys(years).length && total <= investigations
    ? years
    : null;
}

/**
 * The row of a manufacturer of the JSON of a download: the row, `"none"` for a manufacturer that gets
 * no record (no name that a vendor can be matched by, which is every name of it under four compact
 * characters even with its legal form kept; or no day at all), and null for a row that is not what the
 * reducer writes. Every field is checked, and the row is built from what was checked, never from the
 * object that came out of the JSON.
 */
function entityOf(value: unknown, meta: FlatMeta): OdiEntity | "none" | null {
  if (!isObject(value)) return null;
  const { id, display, names, investigations, firstYear, lastYear, newest, publishedAt } = value;
  if (!isEntityId(id) || !isCleanLine(display, ENTITY_NAME_MAX)) return null;
  if (
    !Array.isArray(names) ||
    names.length < 1 ||
    names.length > 5 ||
    names[0] !== display ||
    !names.every((name) => isCleanLine(name, ENTITY_NAME_MAX) && entityKeyOf(name as string) === id)
  ) {
    return null;
  }
  if (!isCount(investigations) || investigations < 1) return null;
  const { linked, noClose, adas } = value;
  if (
    !isCount(linked) ||
    !isCount(noClose) ||
    !isCount(adas) ||
    linked > investigations ||
    noClose > investigations ||
    adas > investigations
  ) {
    return null;
  }
  // The years that it was opened in: both, in order, or neither (no investigation of it has an opening day).
  const openedYears =
    firstYear === null && lastYear === null
      ? true
      : isYear(firstYear) && isYear(lastYear) && firstYear <= lastYear;
  if (!openedYears) return null;
  const byYear = readByYear(value.byYear, meta.anchorYear, investigations);
  if (byYear === null) return null;
  if (!Array.isArray(newest) || newest.length > NEWEST_SHOWN || newest.length > investigations) {
    return null;
  }
  const items: OdiNewest[] = [];
  for (const entry of newest) {
    const item = newestOf(entry);
    if (item === null) return null;
    items.push(item);
  }
  if (publishedAt !== null && !isStoredDay(publishedAt)) return null;

  if (publishedAt === null || !hasNameKey(names as string[])) return "none";
  return {
    id,
    display,
    names: names as string[],
    investigations,
    firstYear: firstYear as number | null,
    lastYear: lastYear as number | null,
    byYear,
    linked,
    noClose,
    adas,
    newest: items,
    publishedAt,
    anchorYear: meta.anchorYear,
    fileNewestDay: meta.fileNewestDay,
  };
}

/**
 * The manufacturers of a download's JSON as the rows of the body, or null when it is not the list: a
 * meta or a row that is not what a download writes, more than one line in twenty that cannot be read
 * (the kit's own allowance, a hundredth of the lines, is narrower: it is the kit's to apply), fewer
 * than 4,000 investigations, or fewer than 400 manufacturers with a record. The rows are `complete`
 * only when what the reducer counted is what the JSON holds (its lines, its manufacturers) and the
 * manufacturers are no more than a list can have.
 */
function readOdi(fetched: Fetched): ReadResult<OdiEntity> | null {
  const envelope = readEnvelope(fetched);
  if (envelope === null) return null;
  const flat = flatMetaOf(envelope.meta);
  const { investigations } = envelope.meta;
  if (flat === null || !isCount(investigations)) return null;

  // Rows of the wrong shape: more than one in twenty is another file, not a list with a few bad rows.
  if (flat.unreadable * WRONG_SHAPE_ONE_IN > flat.rows) return null;
  if (investigations < NHTSA_ODI_FLOORS.investigations) return null;

  const total = flat.rows;
  const { unreadable } = flat;
  // A backstop of the reducer's own throw, which is the guard: `finish` fails the download as too
  // large before it makes more than ENTITIES_MAX entities, so a download never writes more. Only an
  // envelope that something else wrote can have more, and the kit then refuses it as too large.
  if (envelope.entities.length > ENTITIES_MAX) {
    return { rows: [], total, unreadable, complete: false };
  }
  const rows: OdiEntity[] = [];
  for (const value of envelope.entities) {
    const entity = entityOf(value, flat);
    if (entity === null) return null;
    if (entity !== "none") rows.push(entity);
  }
  if (rows.length < NHTSA_ODI_FLOORS.entities) return null;

  const complete =
    flat.entities === envelope.entities.length && flat.lines === flat.rows + flat.blankLines;
  // The rows are manufacturers and `unreadable` is in lines: the allowance for the lines that cannot
  // be read is measured over the lines of the file (a hundredth of them, 1,544 of today's 154,460),
  // never over its manufacturers, which would allow ten.
  return { rows, total, unreadable, allowanceBasis: flat.rows, complete };
}

/** One investigation of the three newest, as a sentence part of the record. */
function newestText(item: OdiNewest): string {
  const opened = item.odate === null ? "opened on an unrecorded day" : `opened ${item.odate}`;
  const closed = item.cdate === null ? "no close date recorded" : `closed ${item.cdate}`;
  const component = lineOf(item.component, COMPONENT_SHOWN);
  const subject = lineOf(item.subject, SUBJECT_SHOWN);
  return (
    `${item.id} ${opened}, ${closed}` +
    (component === "" ? "" : `, ${component}`) +
    (subject === "" ? "" : `: ${subject}`)
  );
}

/**
 * The text of a record: the list, the manufacturer, the counts, the years, the newest three, and the
 * closing sentence, which the sentences before it are cut for and which is never cut.
 */
function summaryOf(row: OdiEntity): string {
  const counts = [
    `The investigations file of NHTSA's Office of Defects Investigation names it in ${countPhrase(
      row.investigations,
      "investigation",
      "investigations",
    )}` + (row.firstYear === null ? "" : ` opened from ${row.firstYear} to ${row.lastYear}`),
    row.linked === 0
      ? ""
      : `${row.linked} ${row.linked === 1 ? "is" : "are"} linked to a recall campaign`,
    row.noClose === 0
      ? ""
      : `${row.noClose} opened since ${row.anchorYear - NO_CLOSE_YEARS} ${row.noClose === 1 ? "has" : "have"} no close date recorded in the file`,
    row.adas === 0
      ? ""
      : `${row.adas} ${row.adas === 1 ? "names" : "name"} a driver assistance or automated driving component`,
  ].filter((part) => part !== "");

  return summaryWithClosing(
    [
      firstSentence(NHTSA_ODI_RECORD_MARK),
      sentence("Manufacturer", row.display),
      `${counts.join("; ")}.`,
      yearsSentence("By year opened", row.anchorYear, row.byYear),
      sentence("Newest", row.newest.map(newestText).join("; ")),
    ],
    CLOSING_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/** The record of a manufacturer; the address is a query on NHTSA's datasets page, one for each manufacturer. */
function recordOfRow(row: OdiEntity): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "defect_investigations",
    title: `${NHTSA_ODI_RECORD_MARK}: ${row.display}`,
    summary: summaryOf(row),
    url: `${NHTSA_DOCUMENTATION_URL}?dataset=investigations&manufacturer=${encodeURIComponent(row.id)}`,
    identifiers: {
      manufacturer: row.display,
      investigations: row.investigations,
      newest: row.newest.map((item) => item.id),
    },
    names: keyNamesOf(row.names),
    publishedAt: row.publishedAt,
  });
}

/**
 * The spec of the list. The limits are the list's own; a test passes smaller ones, which is how the
 * caps are proven (a file one byte, one line or one zip byte over a cap).
 */
export function nhtsaOdiSpec(limits: Partial<FlatLimits> = {}): ListSpec<OdiEntity> {
  const used: FlatLimits = { ...NHTSA_ODI_LIMITS, ...limits };
  return {
    id: "nhtsa_odi",
    version: 1,
    root: ENTRY_NAME,
    sortKey: (row) => row.id,
    fetchFiles: async (fetch, validators) => {
      const reducer = new OdiReducer();
      const read = await streamFlatFile(fetch, validators, FILE, used, (line) =>
        reducer.push(line),
      );
      if (read === "unchanged") return "unchanged";
      const { meta, entities } = reducer.finish(read.lines);
      return fetchedOf(read, envelopeOf(meta, entities));
    },
    read: readOdi,
    toRecords: (rows) => rows.map(recordOfRow),
    sourceVersion: (rows) => rows[0]?.fileNewestDay ?? null,
  };
}

export const nhtsaOdiConnector: Connector = createFileConnector(nhtsaOdiSpec());
