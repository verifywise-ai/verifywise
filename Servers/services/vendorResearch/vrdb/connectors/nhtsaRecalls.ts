/**
 * The recall campaigns of the National Highway Traffic Safety Administration (NHTSA; nhtsa_recalls,
 * Q36): the recalls file of every campaign REPORTED SINCE 2010-01-01, a work of the United States
 * government, published as one static zip (FLAT_RCL_POST_2010.zip) whose single entry,
 * FLAT_RCL_POST_2010.txt, is a TAB-delimited text of 29 fields with no header row and CRLF on every
 * line: 247,176 lines and 312.8 MB inflated on 2026-11-10, one line for each component and vehicle of
 * a campaign (15,382 campaigns). A recall campaign is the filer's own report of a safety defect or of
 * a noncompliance: it is not a finding of fault, and the record counts and never judges.
 *
 * One record per FILER (MFGNAME, "the manufacturer that filed the Part 573 report", grouped by its
 * compact name without the legal form: 1,616 entities from 1,947 spellings), because a record per
 * campaign would let one filer flood a run (one has 244 campaigns in 24 months). The rows of a
 * campaign collapse into one first (its report day, its type, the units potentially affected, whether
 * NHTSA influenced it, its component, whether it carries a do-not-drive advisory, its filer), and then
 * the campaign counts once for its filer. Per filer the record holds the number of campaigns, the
 * first and last year they were reported in, the counts by report year, how many were influenced by
 * NHTSA, how many name a driver assistance or automated driving component, how many carry a
 * do-not-drive advisory, and the three newest.
 *
 * Which filers have a record. A record is found by a vendor's name, so a filer has one when some name
 * of it, as written or without its legal form, has four compact characters or more (`hasNameKey`,
 * which are the keys of `recordOf`); one with no such name (a bare acronym of three letters) could be
 * asked for by nobody and has none, and every one of today's 1,616 has a record. The id of a filer is
 * the compact name WITHOUT its legal form, and that can be under four characters when the full name
 * is not ("Abc, Inc." is `abc`): such a filer has a record, keyed by its full name, and 11 of
 * today's are such.
 *
 * What is read of a line, and what is not. Nine of the 29 fields are decoded (the row id, for the
 * shape and for the order of a campaign's rows only; the campaign number; the component; the filer;
 * the type; the units; who influenced it; the report day; the advisory); the Part 573 texts
 * (DESC_DEFECT, CONEQUENCE_DEFECT, CORRECTIVE_ACTION, NOTES), which are in the manufacturer's voice and
 * hold phone numbers, e-mail addresses, links, markup and control characters, and the three
 * manufacturer-supplied columns (third-party text outside 17 U.S.C. 105), the make, the model, the year
 * and every other field are never decoded. A row that cannot be read is one whose width is not 29,
 * whose row id is no number, whose campaign number does not have the form of one, whose type is not
 * the letter of the campaign number, whose report day is no day, whose filer's name does not fit in 80
 * units once it is cleaned (it is never cut into an id or a key), or whose chosen fields are not
 * UTF-8: it is left out and counted. The kit tolerates a hundredth of the lines of the file (2,471 of
 * today's 247,176: `ReadResult.allowanceBasis` measures it over the lines, which it would not over the
 * filers, which allow sixteen) and fails the parse as an error beyond that; a file in which more than
 * one line in twenty is such is no list at all, and the download refuses it as that. Today there is
 * none. Rows that name no filer (an empty cell, a placeholder, a name the file itself retired) are no
 * entity, and are counted apart from the rows that cannot be read: there is none today.
 *
 * The window. The file holds the campaigns reported since 2010-01-01 and no older one: its lower bound
 * is a date written in its name, the earliest report in it is in 2010, and nothing can drop out of it
 * because time passes. A file whose earliest report is not in 2010 is therefore not this list (NHTSA
 * has moved the partition), and is refused as one: taking it would withdraw every record that is no
 * longer in it.
 *
 * The file is NEVER held in memory: nhtsaFlat.ts streams the entry (312.8 MB, never held), the reducer
 * of this file keeps a small state for each campaign and then for each filer, and the result is one
 * small JSON that `read` turns into the rows of the snapshot. Everything that grows with the file is
 * therefore in `fetchFiles`, as a stream, and `read` takes milliseconds. The state is capped (campaigns,
 * filers): a hostile file past a cap fails the download as too large, and never gives a shorter list.
 * The cap on filers is 8,000: the real file has
 * 1,616, and a filer is about half a kilobyte (the JSON of today's file is 0.77 MB and its body 0.85
 * MB), so a file that reached the cap with filers of that size would give a body of about 4 MB, a
 * quarter of the 16 MiB that the JSON may have (ENVELOPE_BYTES_MAX). The cap does not bound the bytes
 * by itself (the largest filer that a file can make is about 3.3 KB, and about 5,100 of them fill the
 * 16 MiB): the size of the JSON is capped as well, and a file past that is no list (`readEnvelope`).
 *
 * The years are counted from the newest report in the file, never from the clock, so that the same
 * file read on two days is one body; every filer's row carries that year and day, since a record is
 * made of one row. Nothing here depends on the order of the lines: the minimum, the maximum, the
 * counts and the logical sum of the rows of a campaign do not, the one value that is taken from one
 * row (the units potentially affected) is taken from the row with the lowest row id, and the choices
 * that could depend on the order (the filer's spelling and the component of a campaign, the spelling
 * that is shown) are made by text.
 *
 * A vendor is matched by the filer's name alone, as written and without its legal form, and, for a
 * name such as "Chrysler (FCA US, LLC)", by the text before the parenthesis and the text inside it (as
 * the crash list does, nhtsa.ts): never by the make, and never by the maker's text (MFGTXT), which
 * names the maker of the recalled product and not the filer. Natural persons: every one of the 1,947
 * names of the real file was read, and none is a person, and rules by the shape of a name had no
 * precision, so no filter is applied; a name is a business unless proven otherwise.
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
  plausibleDay,
  readEnvelope,
  streamFlatFile,
  topSpellings,
  withThousands,
  yearsSentence,
} from "./nhtsaFlat";
import { BodyTooLargeError, type Connector, NotTheListError } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const NHTSA_RECALLS_RECORD_MARK = "NHTSA vehicle and equipment recalls";

const ENTRY_NAME = "FLAT_RCL_POST_2010.txt";

/** Where the zip is, and where an answer to it may come from (a 304 included). */
const PIN: Pin = { hosts: ["static.nhtsa.gov"], pathPrefixes: ["/odi/ffdd/rcl/"] };
const FILE: FlatFile = {
  url: "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip",
  pin: PIN,
  entryName: ENTRY_NAME,
  contentTypes: ["application/octet-stream", "application/zip"],
  timeoutMs: 120_000,
};

/**
 * The limits of a download: the zip may have 64 MiB (it is about 15 MB), the entry 512 MiB inflated
 * (1.7 times today's 312.8 MB) and the file 1,000,000 lines (4 times today's 247,176).
 */
export const NHTSA_RECALLS_LIMITS: FlatLimits = {
  maxZipBytes: 67_108_864,
  maxInflatedBytes: 536_870_912,
  maxLines: FLAT_LINES_MAX,
};

/**
 * The least that the file must hold to be the list: 10,000 campaigns of ALL the file's (15,382
 * today, those that name no filer counted), and 1,000 filers that have a record (1,616 today, as
 * many as it has entities). A file smaller than that is cut, or is another file.
 */
export const NHTSA_RECALLS_FLOORS = { campaigns: 10_000, entities: 1_000 } as const;

/** The window: the earliest report of the file is on or after this day, and in this year. */
const WINDOW_FIRST_DAY = "2010-01-01";
const WINDOW_FIRST_YEAR_LAST_DAY = "2010-12-31";

/**
 * The most campaigns and filers that the reducer keeps (7.8 and 4.9 times today's). The cap on filers
 * is 8,000 (see the header): `finish` throws at it, and
 * `read` has a backstop for what it could never see.
 */
const CAMPAIGNS_MAX = 120_000;
const ENTITIES_MAX = 8_000;

/** The width of a line: 29 fields, no header. Only the fields in `WANTED` are decoded. */
const WIDTH = 29;
const FIELD_RECORD = 1;
const FIELD_CAMPAIGN = 2;
const FIELD_COMPONENT = 7;
const FIELD_FILER = 8;
const FIELD_TYPE = 11;
const FIELD_UNITS = 12;
const FIELD_INFLUENCED_BY = 14;
const FIELD_REPORTED = 16;
const FIELD_DO_NOT_DRIVE = 28;
const WANTED = [
  FIELD_RECORD,
  FIELD_CAMPAIGN,
  FIELD_COMPONENT,
  FIELD_FILER,
  FIELD_TYPE,
  FIELD_UNITS,
  FIELD_INFLUENCED_BY,
  FIELD_REPORTED,
  FIELD_DO_NOT_DRIVE,
] as const;

/** The id of a row (a running number); the number of a campaign: year, type letter, six characters. */
const ROW_ID = /^[0-9]{1,12}$/;
const CAMPAIGN_NUMBER = /^[0-9]{2}[EVTC][0-9A-Z]{6}$/;
/** The units potentially affected: a number of at most nine digits; 0 and anything else is none. */
const UNITS = /^[0-9]{1,9}$/;
const UNITS_MAX = 999_999_999;
/** NHTSA's own words for who influenced a campaign: these two are NHTSA, the third (MFR) is the manufacturer. */
const INFLUENCED_BY_NHTSA: ReadonlySet<string> = new Set(["ODI", "OVSC"]);

/** How long a component is in a row, and how long it is in the text of a record. */
const COMPONENT_MAX = 112;
const COMPONENT_SHOWN = 40;

/**
 * At most one row in twenty may have the wrong shape for the file to be the list: more is another file.
 * The kit's allowance is narrower (a hundredth of the rows), and what lies between the two fails the
 * parse as an error, a file with a bad stretch, and is not a file that is no list.
 */
const WRONG_SHAPE_ONE_IN = 20;

/** What the type letter of a campaign number says. */
type RecallType = "V" | "E" | "T" | "C";
const TYPE_WORDS: Readonly<Record<RecallType, string>> = {
  V: "vehicle",
  E: "equipment",
  T: "tire",
  C: "child restraint",
};
const isRecallType = (value: unknown): value is RecallType =>
  value === "V" || value === "E" || value === "T" || value === "C";

/** The closing sentence of every record: what a campaign is not, and the licence's notice. */
const CLOSING_SENTENCE =
  "A recall campaign is the filer's report of a safety defect or noncompliance, not a finding of fault; " +
  "the list holds an entry for the filer. " +
  "Not endorsed by NHTSA; counts and component names adapted by VerifyWise from NHTSA's flat file.";

/** One of the (at most three) newest campaigns of a filer, as a row holds it. */
export interface RecallNewest {
  campno: string;
  /** The day NHTSA received the report. */
  rcdate: string;
  type: RecallType;
  /** The first component of the campaign by text; empty when it names none. */
  component: string;
  /** The units potentially affected (a campaign's figure: campaigns overlap, so it is never summed); null for none. */
  potaff: number | null;
  doNotDrive: boolean;
}

/** What the reducer says of a filer, as the JSON of a download holds it. */
interface RecallEnvelopeEntity {
  id: string;
  display: string;
  names: string[];
  campaigns: number;
  firstYear: number;
  lastYear: number;
  byYear: Record<string, number>;
  nhtsaInfluenced: number;
  adas: number;
  doNotDrive: number;
  newest: RecallNewest[];
  publishedAt: string;
}

/**
 * The row of a filer (the body's `P`): its counts, and the year and day of the file that the counts
 * are anchored on, since `toRecords` is given one row and nothing else.
 */
export interface RecallEntity extends RecallEnvelopeEntity {
  /** The calendar year of the newest report in the file: the years are counted back from it, never from the clock. */
  anchorYear: number;
  /** The newest report day in the file: the version of the list. */
  fileNewestDay: string;
}

/** What the reducer keeps of one campaign while the file streams by. */
interface Campaign {
  /** The earliest report day of its rows. */
  rcdate: string;
  /** The units of the row with the lowest row id, and that row's id (a tie by the units). */
  units: number | null;
  unitsRow: number;
  influenced: boolean;
  adas: boolean;
  doNotDrive: boolean;
  /** The first component by text among its rows; empty for none. */
  component: string;
  /** The first filer name by text among its rows; empty when no row names one. */
  filer: string;
}

/** What a line says, once it is known to be a row of the right shape. */
interface Row {
  rowId: number;
  campno: string;
  component: string;
  /** The filer as a clean name; empty when the cell names nobody. */
  filer: string;
  units: number | null;
  influenced: boolean;
  rcdate: string;
  doNotDrive: boolean;
}

const earlier = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a <= b ? a : b;
const later = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a >= b ? a : b;

/** The year of a stored day (`YYYY-MM-DD`). */
const yearOf = (day: string): number => Number(day.slice(0, 4));

/** The newest first: by report day, then by number, both descending, so that no tie is left to the order of the file. */
const newestFirst = (a: RecallNewest, b: RecallNewest): number =>
  compareText(b.rcdate, a.rcdate) || compareText(b.campno, a.campno);

/** What the reducer builds of a filer. */
interface Build {
  campaigns: number;
  spellings: Map<string, number>;
  years: Map<number, number>;
  firstYear: number;
  lastYear: number;
  nhtsaInfluenced: number;
  adas: number;
  doNotDrive: number;
  newest: RecallNewest[];
  publishedAt: string;
}

/**
 * Reduces the lines of the file to its filers, one line at a time, never holding more than the state
 * of a campaign and of a filer. `push` is the `onLine` of `streamFlatFile`; `finish` gives the meta of
 * the file and its filers, which `read` takes back from JSON.
 */
class RecallReducer {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly cleanName = nameCleaner();
  private readonly cleanComponent = cellCleaner(COMPONENT_MAX);
  private rows = 0;
  private blankLines = 0;
  private unreadable = 0;
  private noEntityRows = 0;
  private earliestDay: string | null = null;
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
   * The row of a line, or null when it is not one: wrong width, not UTF-8, a bad number, a bad day, a
   * type that is not the number's, or a filer name that does not fit in the cap (it is never cut into
   * an id: the line is unreadable).
   */
  private rowOf(line: Buffer): Row | null {
    const fields = tabFieldsOf(line, WIDTH, WANTED);
    if (fields === null) return null;
    const [rowId, campno, component, cell, type, units, influencedBy, reported, doNotDrive] =
      fields;
    if (!ROW_ID.test(rowId) || !CAMPAIGN_NUMBER.test(campno)) return null;
    // The type letter of the number is one of E, V, T, C (the pattern); the row must say the same.
    if (type !== campno.charAt(2)) return null;
    // The report day is required on every row: a filer always has a day.
    const rcdate = plausibleDay(reported);
    if (rcdate === null) return null;
    const filer = this.cleanName(cell);
    if (filer === null) return null;
    const count = UNITS.test(units) ? Number(units) : 0;
    return {
      rowId: Number(rowId),
      campno,
      component,
      filer,
      units: count >= 1 && count <= UNITS_MAX ? count : null,
      influenced: INFLUENCED_BY_NHTSA.has(influencedBy),
      rcdate,
      doNotDrive: doNotDrive === "Yes",
    };
  }

  private add(row: Row): void {
    this.earliestDay = earlier(this.earliestDay, row.rcdate);
    this.newestDay = later(this.newestDay, row.rcdate);

    const component = this.cleanComponent(row.component);
    const { filer } = row;
    if (filer === "") this.noEntityRows += 1;

    const campaign = this.campaigns.get(row.campno);
    if (campaign === undefined) {
      if (this.campaigns.size >= CAMPAIGNS_MAX) throw new BodyTooLargeError();
      this.campaigns.set(row.campno, {
        rcdate: row.rcdate,
        units: row.units,
        unitsRow: row.rowId,
        influenced: row.influenced,
        adas: isDriverAssistance(component),
        doNotDrive: row.doNotDrive,
        component,
        filer,
      });
      return;
    }
    campaign.rcdate = row.rcdate < campaign.rcdate ? row.rcdate : campaign.rcdate;
    // The units of the campaign are those of its first row, which is the one with the lowest row id.
    if (
      row.rowId < campaign.unitsRow ||
      (row.rowId === campaign.unitsRow && (row.units ?? 0) < (campaign.units ?? 0))
    ) {
      campaign.units = row.units;
      campaign.unitsRow = row.rowId;
    }
    campaign.influenced = campaign.influenced || row.influenced;
    campaign.adas = campaign.adas || isDriverAssistance(component);
    campaign.doNotDrive = campaign.doNotDrive || row.doNotDrive;
    if (
      component !== "" &&
      (campaign.component === "" || compareText(component, campaign.component) < 0)
    ) {
      campaign.component = component;
    }
    if (filer !== "" && (campaign.filer === "" || compareText(filer, campaign.filer) < 0)) {
      campaign.filer = filer;
    }
  }

  /**
   * The meta of the file and its filers, sorted by id, once the file is read to its end. `lines` is
   * the number of lines the splitter gave, which `read` checks against the lines this reducer
   * counted. A file with no day at all is no list.
   */
  finish(lines: number): { meta: object; entities: RecallEnvelopeEntity[] } {
    if (this.newestDay === null || this.earliestDay === null) throw new NotTheListError();
    const fileNewestDay = this.newestDay;
    const anchorYear = yearOf(fileNewestDay);
    const builds = new Map<string, Build>();

    for (const [campno, campaign] of this.campaigns) {
      if (campaign.filer === "") continue;
      const key = entityKeyOf(campaign.filer);
      if (key === "") continue;

      let build = builds.get(key);
      const year = yearOf(campaign.rcdate);
      if (build === undefined) {
        if (builds.size >= ENTITIES_MAX) throw new BodyTooLargeError();
        build = {
          campaigns: 0,
          spellings: new Map(),
          years: new Map(),
          firstYear: year,
          lastYear: year,
          nhtsaInfluenced: 0,
          adas: 0,
          doNotDrive: 0,
          newest: [],
          publishedAt: campaign.rcdate,
        };
        builds.set(key, build);
      }
      build.campaigns += 1;
      build.spellings.set(campaign.filer, (build.spellings.get(campaign.filer) ?? 0) + 1);
      build.years.set(year, (build.years.get(year) ?? 0) + 1);
      build.firstYear = Math.min(build.firstYear, year);
      build.lastYear = Math.max(build.lastYear, year);
      if (campaign.influenced) build.nhtsaInfluenced += 1;
      if (campaign.adas) build.adas += 1;
      if (campaign.doNotDrive) build.doNotDrive += 1;
      build.publishedAt = later(build.publishedAt, campaign.rcdate) ?? campaign.rcdate;
      build.newest.push({
        campno,
        rcdate: campaign.rcdate,
        type: campno.charAt(2) as RecallType,
        component: campaign.component,
        potaff: campaign.units,
        doNotDrive: campaign.doNotDrive,
      });
      build.newest.sort(newestFirst);
      if (build.newest.length > NEWEST_SHOWN) build.newest.length = NEWEST_SHOWN;
    }

    const entities: RecallEnvelopeEntity[] = [...builds]
      .sort(([a], [b]) => compareText(a, b))
      .map(([id, build]) => {
        const names = topSpellings(build.spellings);
        return {
          id,
          display: names[0],
          names,
          campaigns: build.campaigns,
          firstYear: build.firstYear,
          lastYear: build.lastYear,
          byYear: byYearOf(build.years, anchorYear),
          nhtsaInfluenced: build.nhtsaInfluenced,
          adas: build.adas,
          doNotDrive: build.doNotDrive,
          newest: build.newest,
          publishedAt: build.publishedAt,
        };
      });

    const meta: FlatMeta & { earliestRcdate: string; campaigns: number } = {
      anchorYear,
      fileNewestDay,
      earliestRcdate: this.earliestDay,
      lines,
      blankLines: this.blankLines,
      rows: this.rows,
      unreadable: this.unreadable,
      noEntityRows: this.noEntityRows,
      entities: entities.length,
      campaigns: this.campaigns.size,
    };
    return { meta, entities };
  }
}

/** A potential count of units as a row holds it: none, or a whole number of 1 to 999,999,999. */
const isUnits = (value: unknown): value is number | null =>
  value === null || (isCount(value) && value >= 1 && value <= UNITS_MAX);

function newestOf(value: unknown): RecallNewest | null {
  if (!isObject(value)) return null;
  const { campno, rcdate, type, component, potaff, doNotDrive } = value;
  if (
    typeof campno !== "string" ||
    !CAMPAIGN_NUMBER.test(campno) ||
    !isStoredDay(rcdate) ||
    !isRecallType(type) ||
    type !== campno.charAt(2) ||
    !(component === "" || isCleanLine(component, COMPONENT_MAX)) ||
    !isUnits(potaff) ||
    typeof doNotDrive !== "boolean"
  ) {
    return null;
  }
  return { campno, rcdate, type, component, potaff, doNotDrive };
}

/** The counts by year reported of a row: only the years that end at the anchor year, each above zero. */
function readByYear(
  value: unknown,
  anchorYear: number,
  campaigns: number,
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
  return Object.keys(value).length === Object.keys(years).length && total <= campaigns
    ? years
    : null;
}

/**
 * The row of a filer of the JSON of a download: the row, `"none"` for a filer that gets no record (no
 * name that a vendor can be matched by, which is every name of it under four compact characters even
 * with its legal form kept), and null for a row that is not what the reducer writes. Every field is
 * checked, and the row is built from what was checked, never from the object that came out of the
 * JSON.
 */
function entityOf(value: unknown, meta: FlatMeta): RecallEntity | "none" | null {
  if (!isObject(value)) return null;
  const { id, display, names, campaigns, firstYear, lastYear, newest, publishedAt } = value;
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
  if (!isCount(campaigns) || campaigns < 1) return null;
  const { nhtsaInfluenced, adas, doNotDrive } = value;
  if (
    !isCount(nhtsaInfluenced) ||
    !isCount(adas) ||
    !isCount(doNotDrive) ||
    nhtsaInfluenced > campaigns ||
    adas > campaigns ||
    doNotDrive > campaigns
  ) {
    return null;
  }
  // Every row has a report day, so a filer always has its years, in order.
  if (!isYear(firstYear) || !isYear(lastYear) || firstYear > lastYear) return null;
  const byYear = readByYear(value.byYear, meta.anchorYear, campaigns);
  if (byYear === null) return null;
  if (
    !Array.isArray(newest) ||
    newest.length < 1 ||
    newest.length > NEWEST_SHOWN ||
    newest.length > campaigns
  ) {
    return null;
  }
  const items: RecallNewest[] = [];
  for (const entry of newest) {
    const item = newestOf(entry);
    if (item === null) return null;
    items.push(item);
  }
  if (!isStoredDay(publishedAt)) return null;

  if (!hasNameKey(names as string[])) return "none";
  return {
    id,
    display,
    names: names as string[],
    campaigns,
    firstYear,
    lastYear,
    byYear,
    nhtsaInfluenced,
    adas,
    doNotDrive,
    newest: items,
    publishedAt,
    anchorYear: meta.anchorYear,
    fileNewestDay: meta.fileNewestDay,
  };
}

/**
 * The filers of a download's JSON as the rows of the body, or null when it is not the list: a meta or
 * a row that is not what a download writes, more than one line in twenty that cannot be read (the
 * kit's own allowance, a hundredth of the lines, is narrower: it is the kit's to apply), a file whose
 * earliest report is not in 2010 (the window has moved), fewer than 10,000 campaigns, or fewer than
 * 1,000 filers with a record. The rows are `complete` only when what the reducer counted is what the
 * JSON holds (its lines, its filers) and the filers are no more than a list can have.
 */
function readRecalls(fetched: Fetched): ReadResult<RecallEntity> | null {
  const envelope = readEnvelope(fetched);
  if (envelope === null) return null;
  const flat = flatMetaOf(envelope.meta);
  const { campaigns, earliestRcdate } = envelope.meta;
  if (flat === null || !isCount(campaigns) || !isStoredDay(earliestRcdate)) return null;

  // A report before 2010-01-01, or an earliest report in another year than 2010, is no file of this window.
  if (earliestRcdate < WINDOW_FIRST_DAY || earliestRcdate > WINDOW_FIRST_YEAR_LAST_DAY) return null;
  // Rows of the wrong shape: more than one in twenty is another file, not a list with a few bad rows.
  if (flat.unreadable * WRONG_SHAPE_ONE_IN > flat.rows) return null;
  if (campaigns < NHTSA_RECALLS_FLOORS.campaigns) return null;

  const total = flat.rows;
  const { unreadable } = flat;
  // A backstop of the reducer's own throw, which is the guard: `finish` fails the download as too
  // large before it makes more than ENTITIES_MAX entities, so a download never writes more. Only an
  // envelope that something else wrote can have more, and the kit then refuses it as too large.
  if (envelope.entities.length > ENTITIES_MAX) {
    return { rows: [], total, unreadable, complete: false };
  }
  const rows: RecallEntity[] = [];
  for (const value of envelope.entities) {
    const entity = entityOf(value, flat);
    if (entity === null) return null;
    if (entity !== "none") rows.push(entity);
  }
  if (rows.length < NHTSA_RECALLS_FLOORS.entities) return null;

  const complete =
    flat.entities === envelope.entities.length && flat.lines === flat.rows + flat.blankLines;
  // The rows are filers and `unreadable` is in lines: the allowance for the lines that cannot be read
  // is measured over the lines of the file (a hundredth of them, 2,471 of today's 247,176), never
  // over its filers, which would allow ten.
  return { rows, total, unreadable, allowanceBasis: flat.rows, complete };
}

/** One campaign of the three newest, as a sentence part of the record. */
function newestText(item: RecallNewest): string {
  const component = lineOf(item.component, COMPONENT_SHOWN);
  return (
    `${item.campno} reported ${item.rcdate} (${TYPE_WORDS[item.type]})` +
    (component === "" ? "" : `, ${component}`) +
    (item.potaff === null
      ? ""
      : `, ${withThousands(item.potaff)} ${item.potaff === 1 ? "unit" : "units"} potentially affected`) +
    (item.doNotDrive ? ", do-not-drive advisory" : "")
  );
}

/**
 * The text of a record: the list, the filer, the counts, the years, the newest three, and the closing
 * sentence, which the sentences before it are cut for and which is never cut.
 */
function summaryOf(row: RecallEntity): string {
  const counts = [
    `NHTSA's recalls file, which holds the campaigns reported since 2010, holds ${countPhrase(
      row.campaigns,
      "campaign",
      "campaigns",
    )} that it filed, reported from ${row.firstYear} to ${row.lastYear}`,
    row.nhtsaInfluenced === 0
      ? ""
      : `${row.nhtsaInfluenced} ${row.nhtsaInfluenced === 1 ? "was" : "were"} influenced by NHTSA (its defects or its compliance office)`,
    row.adas === 0
      ? ""
      : `${row.adas} ${row.adas === 1 ? "names" : "name"} a driver assistance or automated driving component`,
    row.doNotDrive === 0
      ? ""
      : `${row.doNotDrive} ${row.doNotDrive === 1 ? "carries" : "carry"} a do-not-drive advisory`,
  ].filter((part) => part !== "");

  return summaryWithClosing(
    [
      firstSentence(NHTSA_RECALLS_RECORD_MARK),
      sentence("Filer", row.display),
      `${counts.join("; ")}.`,
      yearsSentence("By report year", row.anchorYear, row.byYear),
      sentence("Newest", row.newest.map(newestText).join("; ")),
    ],
    CLOSING_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/** The record of a filer; the address is a query on NHTSA's datasets page, one for each filer. */
function recordOfRow(row: RecallEntity): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "vehicle_recall_summary",
    title: `NHTSA recalls: ${row.display}`,
    summary: summaryOf(row),
    url: `${NHTSA_DOCUMENTATION_URL}?dataset=recalls&filer=${encodeURIComponent(row.id)}`,
    identifiers: {
      filer: row.display,
      campaigns: row.campaigns,
      newest: row.newest.map((item) => item.campno),
    },
    names: keyNamesOf(row.names),
    publishedAt: row.publishedAt,
  });
}

/**
 * The spec of the list. The limits are the list's own; a test passes smaller ones, which is how the
 * caps are proven (a file one byte, one line or one zip byte over a cap).
 */
export function nhtsaRecallsSpec(limits: Partial<FlatLimits> = {}): ListSpec<RecallEntity> {
  const used: FlatLimits = { ...NHTSA_RECALLS_LIMITS, ...limits };
  return {
    id: "nhtsa_recalls",
    version: 1,
    root: ENTRY_NAME,
    sortKey: (row) => row.id,
    fetchFiles: async (fetch, validators) => {
      const reducer = new RecallReducer();
      const read = await streamFlatFile(fetch, validators, FILE, used, (line) =>
        reducer.push(line),
      );
      if (read === "unchanged") return "unchanged";
      const { meta, entities } = reducer.finish(read.lines);
      return fetchedOf(read, envelopeOf(meta, entities));
    },
    read: readRecalls,
    toRecords: (rows) => rows.map(recordOfRow),
    sourceVersion: (rows) => rows[0]?.fileNewestDay ?? null,
  };
}

export const nhtsaRecallsConnector: Connector = createFileConnector(nhtsaRecallsSpec());
