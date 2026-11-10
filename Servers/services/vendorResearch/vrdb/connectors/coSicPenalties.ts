/**
 * The consumer protection sanctions of Colombia's Superintendencia de Industria y Comercio (SIC) as
 * a mirrored list of the vendor risk database: the open dataset 73dx-n59j of the portal
 * datos.gov.co (Socrata), under CC BY-SA 4.0. A record is one sanctioned company, with the number
 * of its sanctions, the years of them, the fines they add up to and the newest three. It is a
 * list entry and no finding: it never says that a vendor did something wrong, it says that the
 * list holds sanctions against a party of that name, which may be another company.
 *
 * The whole list in two requests, one second apart (the pause that the host asks for, kit/pause.ts):
 *
 * 1. `$select=count(*)` gives the number of rows, N.
 * 2. `$select=:*,*&$order=:id&$limit=50000` gives the rows, with the system columns, in one answer.
 *
 * The bare address of the dataset gives a window of 1,000 rows out of 3,938, so it is never used,
 * and a list is the list only when its rows are exactly N (a dataset that was replaced between the
 * two requests, or an answer that was cut, is not): fewer than 3,000 rows, N of 50,000 or more (what
 * one request cannot hold), or an earliest sanction after 2014-12-31 is no list either. A list that
 * is not whole fails the download and never gives part of itself. The two requests are asked in full
 * every time, with no validators: the ETag of the portal is one of each query.
 *
 * Natural persons: about a quarter of the rows fine a person, and a cell may name several parties,
 * joined by ` Y/O `, a hyphen or a dash with a blank on one side at least (` - `, `- `, ` -`; the
 * en dash and the em dash count), `/`, ` Y `, ` E `, ` & ` or ` + ` (a blank each side, any case). The
 * Spanish person rule (`looksLikePersonEs` of kit/persons.ts, measured at 30 of 30 and 0 of 30 on
 * samples of whole cells) takes no such cell for a person's name as a whole (a `/` or an `&` refuses
 * it outright, a company beside a person refuses it too), so `read` judges the cleaned cell twice,
 * before anything is stored (`partyWithoutPersons`):
 *
 * - as a whole: a cell with the shape of a person's name is dropped (a hyphen between two names is
 *   such a cell, and read side by side its one-word side would be a company), and
 * - side by side: the cell is split on those joiners and each side is judged on its own,
 *   without its tails (`EN LIQUIDACION`, `CON SIGLA ...`: a company has them, and an organisation
 *   word in them would hide the shape of a person's name). A side with the shape of a person is
 *   removed, tails and all. When no side is left the row is dropped; when some are, the party of
 *   the row is the sides that remain joined by ` Y/O ` (one side: that side alone), and the cell,
 *   which names the person, is never a name, an id, a display, a title, a part of the text, an
 *   identifier or a key. A cell with no such side is the cleaned cell, byte for byte, its keys
 *   included (they are read by ` Y/O `, the hyphen or the dash, and `/` alone). When sides were removed, the row is
 *   made only if a side remains that a vendor could be matched by (four letters and digits once
 *   its legal form is off, and a word that is no legal form however it is written, no word of an
 *   organisation, no particle and no word of a family firm); a person beside `HERMANOS`, `LTDA`,
 *   `CIA S EN C` or `HIJOS` alone leaves no company, and the row is dropped, counted nowhere.
 *
 * A hyphen or a dash with no blank on either side, parentheses and a comma join nothing: a person
 * behind one stays in the party, a residual that a name of a person and a name of a company hold
 * alike (a compound surname holds a hyphen).
 *
 * A cell that ends in a hyphen once its tail is off (`X S.A.S. - EN LIQUIDACION`: the tail takes the
 * blank after the hyphen with it) has the company as a side of its own, and its short name is a key
 * too; its id is the one it had. The person rule is asked of a text with its typographic apostrophes
 * (U+2018, U+2019) made the ASCII one, and with a parenthesis or a number of identity (`C.C.`, `CC`,
 * `NIT` and its number) taken off its end (`personNameOf`), whole cell and side alike: what follows
 * a person's name (a legal representative in brackets, an identity number) holds words that no name
 * has, and keeps the rule from seeing the name. A text that is a person's goes whole, its end with
 * it. The cost is a company of two plain words that ends in a parenthesis: with the parenthesis off
 * it reads as a person's name, and the row is lost (no cell of the real list is one).
 *
 * What the rule does not see stays in the party (the limits of the kit's measured rule, which this
 * file does not widen): a name with a letter that Spanish does not use, a name of more than six
 * words (the particles of Spanish count as words), and the compound surname of a person that holds
 * a ` Y ` (the cell is split there). A person's name that holds one of these is a residual.
 *
 * A row that is dropped is no row that could not be read and no error: its names, its fine and its
 * numbers are never copied. The name of a company is the key of a record (`name:` keys only); a
 * person is never one. What the rule does not see stays: a side of one word, and a person's name
 * that holds a word of an organisation. What it takes for a person's that is not stays out: a side
 * of two words with no legal form and no organisation word (a trade name, say) is not a name of the
 * record, and the company beside it is.
 *
 * A party that is longer than 300 characters once cleaned (the longest of the list is 227), and a
 * party that is that long once its persons are out, is a row that could not be read: `lineWithin`
 * gives no line for a text that does not fit, and never a cut one, because a cut name is no name and
 * never an id or a key. The title and the text of a record show at most 120 characters of the
 * party, cut and marked; the body and the identifiers of the record hold it whole.
 *
 * Left out: the system columns `:id`, `:created_at` and `:version` (they belong to one load of the
 * dataset, and are no stable ids), and `:updated_at` but for its day, which the citation that the
 * portal asks for carries ("Fuente: Portal de Datos Abiertos www.datos.gov.co", the update date).
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  compareText,
  dayText,
  isObject,
  lineOf,
  lineWithin,
  shorten,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { jsonOf, readJsonArray } from "./kit/json";
import { pinnedFetch } from "./kit/paging";
import { type Sleep, pauseFor, realSleep } from "./kit/pause";
import { SPANISH_ORG_PATTERN, looksLikePersonEs } from "./kit/persons";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector, ConnectorFetch } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const CO_SIC_PENALTIES_RECORD_MARK = "Colombia SIC consumer protection sanctions";

/** The host as the first sentence of a record writes it: the operator's, without `www.`. */
const HOST = "datos.gov.co";
const DOCUMENTATION_URL = "https://www.datos.gov.co/d/73dx-n59j";
const ROOT = "73dx-n59j.json";
const OPERATOR = "Colombia's Superintendencia de Industria y Comercio";

/** Where the answers may come from, after the redirects. */
const PIN: Pin = { hosts: ["www.datos.gov.co"], pathPrefixes: ["/resource/"] };

interface RequestSpec {
  url: string;
  contentTypes: readonly string[];
  maxBytes: number;
  timeoutMs: number;
}

const COUNT_REQUEST: RequestSpec = {
  url: "https://www.datos.gov.co/resource/73dx-n59j.json?$select=count(*)",
  contentTypes: ["application/json"],
  maxBytes: 65_536,
  timeoutMs: 60_000,
};
const DATA_REQUEST: RequestSpec = {
  url: "https://www.datos.gov.co/resource/73dx-n59j.json?$select=:*,*&$order=:id&$limit=50000",
  contentTypes: ["application/json"],
  maxBytes: 8_388_608,
  timeoutMs: 120_000,
};

/** The `$limit` of the request for the list: a list of this many rows or more is not one request's. */
const MAX_ROWS = 50_000;
/** The list has 3,938 rows today; one of fewer than this is no copy of it. */
const MIN_ROWS = 3_000;
/** The oldest sanction of the list is of 2013; a list that begins after this day is cut. */
const LATEST_FIRST_DAY = "2014-12-31";

const COUNT = /^[0-9]{1,9}$/;
const RADICADO = /^[0-9]{1,2} +[0-9]{2,7}$/;
const RESOLUTION = /^[0-9]{1,7}$/;
const FINE = /^[0-9]{1,13}$/;

const PARTY_MAX = 300;
const CONDUCT_MAX = 240;
const SECTOR_MAX = 80;
const DISPLAY_MAX = 120;
/** What the text of a record shows of the conduct and of the sector of a sanction. */
const CONDUCT_SHOWN = 70;
const SECTOR_SHOWN = 40;
/** A name key has four letters and digits at least (keys.ts). */
const MIN_NAME_CHARS = 4;
const NAMES_MAX = 6;
const NEWEST_KEPT = 3;
const RESOLUTIONS_KEPT = 10;

/** The tail of a company that is being wound up, and the tail that gives its sigla (its short name). */
const LIQUIDATION = /\s+EN\s+LIQUIDACI[OÓ]N\b.*$/i;
const SIGLA = /\s+CON\s+SIGLA\s+(.*)$/i;
/**
 * A hyphen or a dash (U+2013, U+2014) that a typist set between two parties: a blank on one side at
 * least, as in ` - `, `- ` and ` -`. A hyphen or a dash with no blank on either side is a mark inside
 * a word (a compound surname holds one) and joins nothing.
 */
const DASH = String.raw`\s+[-–—]\s*|\s*[-–—]\s+`;
/** What joins the parties of one cell when the keys of a record are read: ` Y/O `, a hyphen or a dash (`DASH`) and `/`. */
const SIDES = new RegExp(String.raw`\s+Y\/O\s+|${DASH}|\/`, "i");
/**
 * What joins a person to the parties beside it, which is what the persons are looked for by: the
 * joiners of `SIDES`, and ` Y `, ` E `, ` & ` and ` + ` (a blank each side, any case). A hyphen or a
 * dash with no blank on either side, parentheses and a comma are no joiners: names of people and of
 * companies hold them alike, and a person behind one stays in the party (a documented residual). The
 * keys of a record are read by `SIDES` alone, so that a cell with no person is the cell as it is,
 * keys and all.
 */
const JOINERS = new RegExp(String.raw`\s+Y\/O\s+|${DASH}|\/|\s+(?:Y|E|&|\+)\s+`, "i");
/** The apostrophes that a word processor writes in place of the ASCII one (U+2018, U+2019). */
const TYPOGRAPHIC_APOSTROPHES = /[‘’]/g;
/** A parenthesis that ends a text, with the blanks round it. */
const TRAILING_PARENTHESIS = /\s*\([^()]*\)\s*$/;
/** A number of identity or a tax number that ends a text, with its label: `C.C. 1234567`, `CC 1.234.567`, `NIT 900.123.456-7`. */
const TRAILING_NUMBER = /\s+(?:C\.?\s?C\.?|N\.?I\.?T\.?)\s*[:#]?\s*\d[\d.,\- ]*$/i;
/** The legal forms of a Spanish company that decide whether a side of a cell is a company. */
const SPANISH_LEGAL_FORM =
  /(?<![\p{L}\p{N}])(?:S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?|LIMITADA|S\.?\s?EN\s?C\.?|E\.?\s?S\.?\s?P\.?|CIA)(?![\p{L}\p{N}])/iu;
/**
 * Every legal form of a text, and every legal form and word of an organisation of the kit's Spanish
 * pattern (`S A S` and `S. EN C.` are one match each: they are no words to be taken one by one).
 */
const LEGAL_FORMS_EVERY = new RegExp(SPANISH_LEGAL_FORM.source, "giu");
const ORGANISATION_WORDS_EVERY = new RegExp(SPANISH_ORG_PATTERN.source, "giu");
/**
 * The words of a Spanish name that no company is known by: the particles, and what follows the name
 * of a person in a family firm (`MUESTRA E HIJOS`) and is no organisation word of the kit's pattern.
 */
const NO_NAME_WORDS: ReadonlySet<string> = new Set(
  "de del la las los y e el hijos hijas sobrinos sucesores familia".split(" "),
);

/** One sanction, as the body keeps it. */
export interface SicSanction {
  /** The day it was issued, YYYY-MM-DD. */
  day: string;
  /** The number of the resolution, digits. */
  resolution: string;
  /** The case file, its space taken out. */
  radicado: string;
  /** SIC's own words for the conduct and the sector, in Spanish. */
  conduct: string;
  sector: string;
  /** The fine in Colombian pesos. */
  fine: number;
}

/** One sanctioned company: the row of the body, and what a record is made of. */
export interface SicCompany {
  /** The compact name of the party without its tails and its legal form. */
  id: string;
  /** The spelling of the party that the list uses most, whole (the title and the text show 120). */
  display: string;
  /** The names a vendor may match the record by, at most six. */
  names: string[];
  sanctions: number;
  firstYear: number;
  lastYear: number;
  totalFine: number;
  /** The newest three sanctions, the newest first. */
  newest: SicSanction[];
  /** The numbers of the newest resolutions, each once, the newest first, at most ten. */
  resolutions: string[];
  /** The day that the list was updated, the same in every company. */
  dataUpdated: string;
  /** The day of the newest sanction. */
  publishedAt: string;
}

/** What the party of a row is without its tails: its base, and its sigla when it gives one. */
function tailsOf(party: string): { base: string; sigla: string } {
  const sigla = SIGLA.exec(party)?.[1]?.replace(LIQUIDATION, "").trim() ?? "";
  return { base: party.replace(LIQUIDATION, "").replace(SIGLA, ""), sigla };
}

/** The id of a company: its party without the tails and the legal form, as letters and digits. */
const idOf = (party: string): string => compactName(shortName(tailsOf(party).base));

/**
 * What the person rule is asked of: the text with its typographic apostrophes folded to the ASCII
 * one (the letters of the rule hold that one only) and with no parenthesis and no number of
 * identity at its end, which follow a person's name (`(REPRESENTANTE LEGAL)`, `C.C. 1234567`,
 * `NIT 900.123.456-7`) and which the rule takes for words that no name has. It is for the judging
 * only: when the text is a person's, all of it goes, the end with it.
 */
function personNameOf(text: string): string {
  let name = text.replace(TYPOGRAPHIC_APOSTROPHES, "'");
  let before: string;
  do {
    before = name;
    name = name.replace(TRAILING_PARENTHESIS, "").replace(TRAILING_NUMBER, "");
  } while (name !== before);
  return name;
}

/** Whether a text, a whole cell or a side of one, has the shape of a person's name (`personNameOf`). */
const isPersonText = (text: string): boolean => looksLikePersonEs(personNameOf(text));

/**
 * Whether a side of a cell is a person's: the side without its tails (`EN LIQUIDACION`, `CON SIGLA`).
 * The rule takes a word of an organisation for a company's, and the tails hold one, so that a
 * person's name that comes before them would pass for a company's.
 */
const isPersonSide = (side: string): boolean => isPersonText(tailsOf(side).base);

/**
 * Whether a side of a cell can be a company that a vendor may be matched by: its name has four
 * letters and digits at least once its legal form is off (the name keys of keys.ts), and a word
 * that is no legal form however it is written (`S.A.S.`, `S A S`, `S. EN C.`), no word of an
 * organisation, no particle and no word of a family firm. `HERMANOS`, `LTDA`, `CIA S EN C` and
 * `HIJOS` alone, or with particles, name no company.
 */
function namesACompany(side: string): boolean {
  const base = tailsOf(side).base;
  const withoutForms = base.replace(LEGAL_FORMS_EVERY, " ").trim();
  if (compactName(shortName(withoutForms)).length < MIN_NAME_CHARS) return false;
  return base
    .replace(ORGANISATION_WORDS_EVERY, " ")
    .split(/\s+/)
    .some((word) => {
      const letters = compactName(word);
      return letters !== "" && !NO_NAME_WORDS.has(letters);
    });
}

/**
 * The party of a row without the natural persons that its cell names, or null when the cell names
 * nothing else. The cleaned cell is judged as a whole first (a cell that is a person's name is
 * dropped, whatever joiner it holds), and then side by side on the joiners of `JOINERS`. A cell
 * with no side of a person is the cell as it is. A cell with one is the sides that remain, joined by
 * ` Y/O `: the cell itself, which names the person, goes no further than this function. When sides
 * were removed and none of those that remain can be a company a vendor may be matched by
 * (`namesACompany`), the row is dropped too: a person beside a word of an organisation or a legal
 * form alone leaves no company.
 */
function partyWithoutPersons(party: string): string | null {
  if (isPersonText(party)) return null;
  const pieces = party.split(JOINERS);
  // No joiner: one party, judged as a whole, tails and all, as it always was.
  if (pieces.length < 2) return party;
  const sides = pieces.map((side) => side.trim()).filter((side) => side !== "");
  const persons = sides.map(isPersonSide);
  if (!persons.includes(true)) return party;
  const remaining = sides.filter((_, at) => !persons[at]);
  return remaining.some(namesACompany) ? remaining.join(" Y/O ") : null;
}

/** The sides of a party that holds several that themselves have a Spanish legal form. */
const sidesOf = (base: string): string[] =>
  base
    .split(SIDES)
    .map((side) => side.trim())
    .filter((side) => side !== "" && SPANISH_LEGAL_FORM.test(side));

/**
 * The names that a vendor may be known by, for one spelling of a party: the party without its
 * tails, the whole party, its sigla, and each side of a cell that holds several companies. Only the
 * names that can be a key (four letters and digits).
 */
function namesOfParty(party: string): string[] {
  const { base, sigla } = tailsOf(party);
  return [base, party, sigla, ...sidesOf(base)].filter(
    (name) => compactName(name).length >= MIN_NAME_CHARS,
  );
}

/** The first six names of the spellings, in the order of the spellings, each once. */
function namesOf(spellings: readonly string[]): string[] {
  const names = new Set<string>();
  for (const spelling of spellings) {
    for (const name of namesOfParty(spelling)) {
      names.add(name);
      if (names.size >= NAMES_MAX) return [...names];
    }
  }
  return [...names];
}

/**
 * The newer sanction first; on one day the higher resolution first, as a number; and every other
 * tie by the remaining fields, so that the order of the rows of the file never decides which
 * sanctions a record keeps.
 */
function compareSanctions(a: SicSanction, b: SicSanction): number {
  return (
    compareText(b.day, a.day) ||
    Number(b.resolution) - Number(a.resolution) ||
    compareText(a.radicado, b.radicado) ||
    compareText(a.conduct, b.conduct) ||
    compareText(a.sector, b.sector) ||
    a.fine - b.fine
  );
}

/** The day of a Socrata timestamp, which is its first ten characters; null for anything else. */
const dayOfTimestamp = (value: unknown): string | null =>
  typeof value === "string" ? dayText(value.slice(0, 10)) : null;

/** The sanction of a row, or null when one of its fields is not in its form. */
function sanctionOf(row: Record<string, unknown>): SicSanction | null {
  const radicado = lineOf(row.radicado, 32);
  const resolution = lineOf(row.res_sancion, 32);
  const fine = lineOf(row.valor, 32);
  const day = dayOfTimestamp(row.fecha_emitida);
  if (
    day === null ||
    !RADICADO.test(radicado) ||
    !RESOLUTION.test(resolution) ||
    !FINE.test(fine)
  ) {
    return null;
  }
  return {
    day,
    resolution,
    radicado: radicado.replace(/ +/g, ""),
    // Socrata leaves a null cell out of the row: the sanction is the fact, its words are detail.
    conduct: lineOf(row.conducta, CONDUCT_MAX),
    sector: lineOf(row.sector, SECTOR_MAX),
    fine: Number(fine),
  };
}

/** The rows of one company, as they are collected. */
interface Group {
  /** Each spelling of the party (whole, cleaned) and how many rows use it. */
  spellings: Map<string, number>;
  sanctions: SicSanction[];
}

/** The company of a group, or null when its fines add up to more than a number holds exactly. */
function companyOf(id: string, group: Group, dataUpdated: string): SicCompany | null {
  const sanctions = [...group.sanctions].sort(compareSanctions);
  let totalFine = 0;
  for (const sanction of sanctions) totalFine += sanction.fine;
  if (!Number.isSafeInteger(totalFine)) return null;

  // The spelling that the list uses most, the shorter of two used as often (by code unit).
  const spellings = [...group.spellings]
    .sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))
    .map(([spelling]) => spelling);
  const newest = sanctions[0];
  const oldest = sanctions[sanctions.length - 1];
  return {
    id,
    display: withoutAngles(spellings[0]),
    names: namesOf(spellings),
    sanctions: sanctions.length,
    firstYear: Number(oldest.day.slice(0, 4)),
    lastYear: Number(newest.day.slice(0, 4)),
    totalFine,
    newest: sanctions.slice(0, NEWEST_KEPT),
    resolutions: [...new Set(sanctions.map((sanction) => sanction.resolution))].slice(
      0,
      RESOLUTIONS_KEPT,
    ),
    dataUpdated,
    publishedAt: newest.day,
  };
}

/** The number that the count answer holds: `[{"count":"3938"}]`; null for any other answer. */
function countOf(text: string): number | null {
  const answer = jsonOf(text);
  if (!Array.isArray(answer) || answer.length !== 1) return null;
  const entry: unknown = answer[0];
  const count = isObject(entry) ? entry.count : undefined;
  return typeof count === "string" && COUNT.test(count) ? Number(count) : null;
}

/**
 * The companies of the two answers: null when they are not the whole list. The rows of the list are
 * its rows only when they are as many as the count says; persons are dropped here, and a group of
 * rows that cannot be a company (the fines add up to more than a number holds exactly) is counted
 * with the rows that could not be read.
 */
function read(fetched: Fetched): ReadResult<SicCompany> | null {
  const count = countOf(textOf(fetched, 0));
  if (count === null || count < MIN_ROWS || count >= MAX_ROWS) return null;
  const data = readJsonArray(textOf(fetched, 1), MAX_ROWS);
  if (data === null || data.items.length !== count) return null;

  let unreadable = 0;
  let latest = "";
  let earliest: string | null = null;
  const groups = new Map<string, Group>();
  for (const item of data.items) {
    if (!isObject(item)) {
      unreadable += 1;
      continue;
    }
    // The day of the load is a fact of the list, whoever the row fines.
    const updated = dayOfTimestamp(item[":updated_at"]);
    if (updated !== null && updated > latest) latest = updated;

    // The party as one clean line that fits: an empty one, and one that is longer than a party
    // can be, is a row that cannot be read. A cut line is never used: it is no name.
    const cell = lineWithin(item.multado, PARTY_MAX);
    if (cell === null) {
      unreadable += 1;
      continue;
    }
    // A natural person is never copied: the cell is read as the record would show it, and what
    // names a person, as a whole or on one side, is dropped, counted as nothing.
    const party = partyWithoutPersons(cell);
    if (party === null) continue;
    // The sides that remain are joined by a longer separator than a `/`: they may no longer fit.
    const named = lineWithin(party, PARTY_MAX);

    const id = named === null ? "" : idOf(named);
    const sanction = sanctionOf(item);
    if (named === null || updated === null || id === "" || sanction === null) {
      unreadable += 1;
      continue;
    }
    if (earliest === null || sanction.day < earliest) earliest = sanction.day;
    let group = groups.get(id);
    if (group === undefined) {
      group = { spellings: new Map(), sanctions: [] };
      groups.set(id, group);
    }
    group.spellings.set(named, (group.spellings.get(named) ?? 0) + 1);
    group.sanctions.push(sanction);
  }
  if (earliest === null || earliest > LATEST_FIRST_DAY) return null;

  const rows: SicCompany[] = [];
  for (const [id, group] of groups) {
    const company = companyOf(id, group, latest);
    if (company === null) unreadable += 1;
    else rows.push(company);
  }
  return { rows, total: data.items.length, unreadable, complete: !data.more };
}

/** The answer to one request: the count and the list are asked with no validators, so a 304 is no answer. */
async function answerOf(ask: ConnectorFetch, request: RequestSpec) {
  const response = await ask(
    request.url,
    {},
    {
      maxBytes: request.maxBytes,
      allowedContentTypes: request.contentTypes,
      totalTimeoutMs: request.timeoutMs,
    },
  );
  if (response.notModified) throw new FetchError("unreachable");
  return response;
}

/**
 * The count, a pause of the second that the host asks for, and then the list; every answer from the
 * pinned host and no body that was cut (`pinnedFetch`).
 */
async function fetchFiles(fetch: ConnectorFetch, sleep: Sleep): Promise<Fetched> {
  const ask = pinnedFetch(fetch, PIN);
  const count = await answerOf(ask, COUNT_REQUEST);
  await pauseFor("www.datos.gov.co", sleep);
  const data = await answerOf(ask, DATA_REQUEST);
  return {
    buffers: [count.body, data.body],
    contentTypes: [count.contentType, data.contentType],
    // The validators of the portal belong to one query each: nothing is stored to compare with.
    etag: null,
    lastModified: null,
    bytes: count.body.length + data.body.length,
  };
}

/** `1234567` as `1,234,567`, in no locale. */
const thousands = (number: number): string => String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${CO_SIC_PENALTIES_RECORD_MARK} (${HOST}), an enforcement or case list.`;

/**
 * The last sentence of every record: what a sanction on the list is and is not, which party it
 * names, and the citation that the portal asks for with the day of the update and the licence. It
 * is never cut and never left out.
 */
const closingOf = (dataUpdated: string): string =>
  "A sanction is listed when final and may later be annulled by a court; the entry names a " +
  "Colombian party and may be another company of the same name. Fuente: Portal de Datos Abiertos " +
  `www.datos.gov.co, data updated ${dataUpdated}; CC BY-SA 4.0, adapted by VerifyWise.`;

/** One of the newest sanctions: the day, the resolution, the conduct (Spanish, as SIC writes it) and the fine. */
function newestOf(sanction: SicSanction): string {
  const conduct = lineOf(sanction.conduct, CONDUCT_SHOWN);
  const sector = lineOf(sanction.sector, SECTOR_SHOWN);
  let words = "";
  if (conduct !== "") words = `conduct: ${conduct}${sector === "" ? "" : ` (${sector})`}`;
  else if (sector !== "") words = `sector: ${sector}`;
  return [
    sanction.day,
    `resolution ${sanction.resolution}`,
    words,
    `fine COP ${thousands(sanction.fine)}`,
  ]
    .filter((part) => part !== "")
    .join(", ");
}

/** What the list holds of the company: how many sanctions, when, and for how much. */
function countSentenceOf(company: SicCompany): string {
  const many = `${company.sanctions} consumer protection sanction${company.sanctions === 1 ? "" : "s"}`;
  const years =
    company.firstYear === company.lastYear
      ? `in ${company.lastYear}`
      : `${company.firstYear} to ${company.lastYear}`;
  return `${OPERATOR} lists ${many} against it, issued ${years}, fines totalling COP ${thousands(company.totalFine)}.`;
}

/**
 * The text of a record: the list and its kind (S1), the party (S2), what the list holds of it (S3),
 * the newest sanctions (S4) and the closing sentence. It is the whole when it fits in `max`;
 * otherwise the newest sanctions are dropped from the end, the third and then the second, and then
 * the name of the party is cut; the closing sentence is never cut, so that `recordOf` never has to
 * cut it. (With the caps of the fields the text is at most 1,214 characters, so this is the safety
 * net of a cap that is raised.)
 */
export function coSicSummaryOf(company: SicCompany, max: number = RECORD_SUMMARY_MAX): string {
  const closing = closingOf(company.dataUpdated);
  const entries = company.newest.map(newestOf);
  // The text shows the party cut at DISPLAY_MAX and marked; the company holds it whole.
  const party = shorten(company.display, DISPLAY_MAX);
  const sentencesOf = (display: string, shown: number): string[] => [
    FIRST_SENTENCE,
    sentence("Sanctioned party", display),
    countSentenceOf(company),
    shown === 0 ? "" : `Newest: ${entries.slice(0, shown).join("; ")}.`,
  ];
  const textOfShown = (display: string, shown: number): string =>
    joinSentences([...sentencesOf(display, shown), closing]);

  const least = Math.min(1, entries.length);
  for (let shown = entries.length; shown >= least; shown -= 1) {
    const text = textOfShown(party, shown);
    if (text.length <= max) return text;
  }
  for (let room = party.length - 1; room >= 1; room -= 1) {
    const text = textOfShown(shorten(party, room), least);
    if (text.length <= max) return text;
  }
  return summaryWithClosing(sentencesOf(party, least), closing, max);
}

/** The record of a company. */
function recordFor(company: SicCompany): ParsedRecord {
  return recordOf({
    id: company.id,
    type: "consumer_sanction_summary",
    title: `${CO_SIC_PENALTIES_RECORD_MARK}: ${shorten(company.display, DISPLAY_MAX)}`,
    summary: coSicSummaryOf(company),
    // The page of the dataset, with the company: the evidence ledger keeps one record for an address.
    url: `${DOCUMENTATION_URL}?party=${encodeURIComponent(company.id)}`,
    identifiers: { party: company.display, resolutions: company.resolutions },
    names: company.names,
    publishedAt: company.publishedAt,
    sourceUpdatedAt: null,
  });
}

/**
 * The connector, with the pause between the two requests injectable: a test hands it a sleep that
 * does not wait.
 */
export function createCoSicPenaltiesConnector({
  sleep = realSleep,
}: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<SicCompany>({
    id: "co_sic_penalties",
    version: 1,
    root: ROOT,
    sortKey: (company) => company.id,
    fetchFiles: (fetch) => fetchFiles(fetch, sleep),
    read,
    toRecords: (companies) => companies.map(recordFor),
    sourceVersion: (companies) =>
      companies.reduce<string | null>(
        (latest, company) =>
          latest === null || company.dataUpdated > latest ? company.dataUpdated : latest,
        null,
      ),
  });
}

export const coSicPenaltiesConnector: Connector = createCoSicPenaltiesConnector();
