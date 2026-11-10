/**
 * The Consolidated Canadian Autonomous Sanctions List (Global Affairs Canada, "SEMA": the Special
 * Economic Measures Act and its regulations) as a mirrored list of the vendor risk database. The
 * list is one static XML file, regenerated daily, whose `record` elements are individuals, ships and
 * entities. The licence (Open Government Licence - Canada) does not cover personal information, so
 * ONLY the entities are read: one record for each listed entity, which says that Canada lists it
 * under an autonomous sanctions regulation, the schedule and the item, and the day. It is a state
 * ("listed as of the last copy"), no finding, and the closing sentence says what Global Affairs
 * Canada itself says of the list.
 *
 * Individuals and ships are told apart by the file's own elements, on their PRESENCE (even an empty
 * one), before any other cell of the record is read: a given name or a family name makes an
 * individual, an IMO number makes a ship, and so does a date of birth or build date or a title or
 * ship type (only individuals and ships have them; a record that has one is never an entity, which
 * is the safe side of a file that may change). Such a record is skipped: it is not copied and not
 * counted as unreadable, and none of its cells is read, not even its listing day (the floors of
 * the entities and of the earliest listing are measured on the entities alone).
 *
 * An entity is named in the element `EntityOrShip-EntiteOuNavire`, in English, sometimes with the
 * French name behind a ` / `, and sometimes with another name inside `(also known as ...)`. Its
 * ENGLISH name (before the first ` / ` and before the parenthesis) gives its id, and the match keys
 * are its names: the whole name, the English part, the text of the parenthesis and the aliases (the
 * element `Aliases-Alias`, split on a semicolon and a line break and on nothing else, since "A or B"
 * is one alias; those with a Latin letter first, eight at the most; at most the first hundred parts
 * of the element are read). A part, or the text of the parenthesis, that is longer than 120
 * characters once folded is no alias at all, and a list of names with commas is such a part: it is
 * never cut into a key and never shown cut, and the record keeps
 * its primary name and its other aliases. The length is decided by `lineWithin` (kit/clean.ts),
 * which gives a text that fits or nothing and never a cut one: a text that is only read with a
 * character to spare could be cut to the limit by a blank or a pair of surrogates at the cut, and
 * pass for one that fits.
 *
 * Cells that do not fit. The primary name (230 characters once
 * folded), the regulation (its English part, 100) and the schedule (as the body writes it, 20) are
 * read the same way, and a record whose name, regulation or schedule does not fit is unreadable: it
 * is counted, and more than the allowance fails the parse. No id, key or identifier is made of a
 * cut text; what the title and the summary SHOW of the name (150) and of the other names (240) is
 * cut, as a display may be. A schedule cell that is longer than the kit reads (LINE_INPUT_MAX, a
 * megabyte of units) is one of them as well, whatever it shows: its read part may clean to nothing,
 * which is not "no schedule".
 *
 * An entity that no name makes a key for (a name of three letters with no alias) gets no row and is
 * no unreadable record, but it is an entity of the file all the same: the floors count it. One whose
 * short name has an alias that is a key keeps its record, keyed by the alias.
 *
 * Records of one English name are one entity: its listings are kept oldest first, three at the
 * most, in the order of the day, the regulation, the schedule and the item, so that no order of the
 * file decides what is kept. Grouping happens in `read`; a row is one entity.
 *
 * A record that is none of these, or whose item is not one to four digits, whose day is not a day
 * that exists, that names no regulation, or whose name, regulation or schedule does not fit, is
 * unreadable: it is counted, and more than the allowance (kit/clean.ts) fails the parse. A file
 * that is not a `data-set` of `record` elements, that the scanner reports an error in, with fewer
 * than 3,000 records or 1,000 entities, or whose earliest entity was listed after 2010-12-31, is
 * not the list; a file of more than 20,000 records is read no further: the download fails as too
 * large and never gives a shorter list.
 *
 * Nothing is logged, and no address, record or name enters an error.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { compactNamesOf } from "../keys";
import { type XmlElement, childText, scanElements } from "../xmlScan";
import { LINE_INPUT_MAX, compareText, dayText, distinct, lineOf, lineWithin } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names the list by. */
export const CANADA_SEMA_RECORD_MARK = "Consolidated Canadian Autonomous Sanctions List";

const MIB = 1024 * 1024;
const FILE_DIRECTORY =
  "/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/";
const FILE_URL = `https://www.international.gc.ca${FILE_DIRECTORY}sema-lmes.xml`;
const DOCUMENTATION_URL =
  "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng";

const ROOT = "data-set";
const RECORD_ELEMENT = "record";

/** The elements of a record, as the file names them (English and French in one name). */
const TAG = {
  country: "Country-Pays",
  name: "EntityOrShip-EntiteOuNavire",
  aliases: "Aliases-Alias",
  schedule: "Schedule-Annexe",
  item: "Item-NumeroDarticle",
  day: "DateOfListing-DateDinscription",
} as const;

/** The elements that only an individual or a ship has: the presence of one is no entity. */
const NOT_AN_ENTITY: ReadonlySet<string> = new Set([
  "GivenName-Prenom",
  "LastName-NomDeFamille",
  "ShipIMONumber-NumeroOMIDuNavire",
  "DateOfBirthOrShipBuildDate-DateDeNaissanceOuDateDeConstructionDuNavire",
  "TitleOrShipType-TitreOuTypeDeNavire",
]);

/** The floors that make a file the list. */
const RECORDS_MIN = 3000;
const ENTITIES_MIN = 1000;
const EARLIEST_BY = "2010-12-31";
/** The most records that are read: the file holds about 5,800 today. */
const RECORDS_MAX = 20_000;

/** The longest primary name (once folded): a record with a longer one is unreadable. */
const NAME_MAX = 230;
/** The most of the regulation cell that is read, to find the end of its English part. */
const REGULATION_CELL_MAX = 230;
/** The longest alias (once folded), and the longest text of `(also known as ...)`: a longer one is no alias. */
const ALIAS_MAX = 120;
const ALIAS_PARTS_MAX = 100;
const ALIASES_MAX = 8;
const NAMES_MAX = 12;
const REGULATION_MAX = 100;
const SCHEDULE_MAX = 20;
const LISTINGS_MAX = 3;
const ITEM = /^[0-9]{1,4}$/;
/** The parenthesis that gives another name of the entity. */
const ALSO_KNOWN_AS = /\(also known as/i;
const LATIN_LETTER = /\p{Script=Latin}/u;

/** What the summary shows, at the most. */
const NAME_SHOWN = 150;
const ALIASES_SHOWN = 240;

const FIRST_SENTENCE = `${CANADA_SEMA_RECORD_MARK} (international.gc.ca), a sanctions list.`;

const CLOSING =
  "Global Affairs Canada states that the list is for administrative purposes only, is not a " +
  "regulation, has no force of law and may not be up to date; an entry names an entity, which may " +
  "be another company of the same name. Contains information licensed under the Open Government " +
  "Licence - Canada; adapted by VerifyWise.";

/** One listing of an entity: the regulation (its English part), the schedule, the item, the day. */
export interface SemaListing {
  regulation: string;
  schedule: string;
  item: string;
  day: string;
}

/** One listed entity: the row that the body holds. */
export interface SemaEntity {
  /** The compact English name without the legal form. */
  id: string;
  /** The name as the file writes it, cleaned: both languages and the parenthesis. */
  name: string;
  /** The names that match keys are made of: the name, its English part, the parenthesis, the aliases. */
  names: string[];
  aliases: string[];
  /** The listings, oldest first, three at the most. */
  listings: SemaListing[];
  /** The day of the earliest listing. */
  publishedAt: string | null;
}

/** An entity record as it is read, before records of one name are grouped. */
interface Entry {
  id: string;
  name: string;
  names: string[];
  aliases: string[];
  listing: SemaListing;
  /** Whether any name of the entity is a match key: an entity without one is left out of the rows. */
  keyed: boolean;
}

/** The aliases with a Latin letter first, the others after them, each group in its own order. */
const latinFirst = (aliases: readonly string[]): string[] => [
  ...aliases.filter((alias) => LATIN_LETTER.test(alias)),
  ...aliases.filter((alias) => !LATIN_LETTER.test(alias)),
];

/**
 * One alias, or the text of `(also known as ...)`, as a clean line; an empty line when it is empty
 * or longer than an alias may be. `lineWithin` gives the line as it is or nothing and never a cut
 * text, so a part over the limit is NO alias at all (not a key, not shown cut). A list of names with
 * commas is such a part and is not split.
 */
function aliasOf(text: string): string {
  return lineWithin(text, ALIAS_MAX) ?? "";
}

/** The aliases of the element's text: split on `;` and line breaks only, clean lines, once each. */
function aliasesOf(text: string | null): string[] {
  if (text === null) return [];
  const parts = text
    .split(/[;\r\n]/, ALIAS_PARTS_MAX)
    .map(aliasOf)
    .filter((part) => part !== "");
  return latinFirst(distinct(parts, Number.POSITIVE_INFINITY)).slice(0, ALIASES_MAX);
}

/**
 * The schedule: `1,Part 3` and `1, Part 3 ` are one, `1, Part 3`. An empty text when the record has
 * none, and null when it is longer than a schedule may be once it is written so, or longer than the
 * kit reads: it is never cut.
 */
function scheduleOf(text: string | null): string | null {
  if (text === null) return "";
  // A cell that the kit does not read whole is no schedule that fits, and it is not an empty one: its
  // read part may clean to nothing (a first megabyte of hidden characters), and that is not "no
  // schedule".
  if (text.length > LINE_INPUT_MAX) return null;
  // Folded to three times the limit first, so that the cost of a cell is bounded: a longer cell is
  // cut there, ends in the cut marker and never fits.
  const written = lineOf(text, SCHEDULE_MAX * 3).replace(/\s*,\s*/g, ", ");
  return written === "" ? "" : lineWithin(written, SCHEDULE_MAX);
}

/** The entity of a record, or `null` when the record cannot be read. */
function entryOf(record: XmlElement): Entry | null {
  const nameText = childText(record, [TAG.name]);
  const countryText = childText(record, [TAG.country]);
  const item = childText(record, [TAG.item]);
  const day = dayText(childText(record, [TAG.day]));
  if (nameText === null || countryText === null || item === null || day === null) return null;
  if (!ITEM.test(item)) return null;

  // The regulation is written in two languages when it is bilingual: its English part is the
  // regulation. One that does not fit (or that is empty) makes the record unreadable: it is not cut.
  const country = lineOf(countryText, REGULATION_CELL_MAX);
  const slashAt = country.indexOf(" / ");
  const regulation = lineWithin(
    slashAt === -1 ? country : country.slice(0, slashAt),
    REGULATION_MAX,
  );
  if (regulation === null) return null;
  const schedule = scheduleOf(childText(record, [TAG.schedule]));
  if (schedule === null) return null;

  // A name that does not fit is no name: the record is unreadable, and its id is never a cut text.
  const name = lineWithin(nameText, NAME_MAX);
  if (name === null) return null;
  const slash = name.indexOf(" / ");
  const known = ALSO_KNOWN_AS.exec(name);
  const ends = [slash, known === null ? -1 : known.index].filter((at) => at !== -1);
  const english = (ends.length === 0 ? name : name.slice(0, Math.min(...ends))).trim();
  const id = compactName(shortName(english));
  // A name that holds no letter and no digit cannot be an id.
  if (id === "") return null;

  let otherName = "";
  if (known !== null) {
    const rest = name.slice(known.index + known[0].length);
    const close = rest.indexOf(")");
    otherName = aliasOf(close === -1 ? rest : rest.slice(0, close));
  }
  const aliases = aliasesOf(childText(record, [TAG.aliases]));
  const names = distinct(
    [name, english, otherName, ...aliases].filter((text) => text !== ""),
    NAMES_MAX,
  );

  return {
    id,
    name,
    names,
    aliases,
    listing: { regulation, schedule, item, day },
    keyed: compactNamesOf(names).length > 0,
  };
}

/** The order of the listings: the day, then the regulation, the schedule and the item. */
const compareListings = (a: SemaListing, b: SemaListing): number =>
  compareText(a.day, b.day) ||
  compareText(a.regulation, b.regulation) ||
  compareText(a.schedule, b.schedule) ||
  compareText(a.item, b.item);

/** The entities of the records: the records of one id are one, whatever the order of the file. */
function entitiesOf(entries: readonly Entry[]): SemaEntity[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.id);
    if (group === undefined) groups.set(entry.id, [entry]);
    else group.push(entry);
  }

  const rows: SemaEntity[] = [];
  for (const [id, group] of groups) {
    const sorted = [...group].sort(
      (a, b) => compareListings(a.listing, b.listing) || compareText(a.name, b.name),
    );
    const listings: SemaListing[] = [];
    for (const { listing } of sorted) {
      const last = listings[listings.length - 1];
      if (last === undefined || compareListings(last, listing) !== 0) listings.push(listing);
    }
    const aliases = latinFirst(
      distinct(
        sorted.flatMap((entry) => entry.aliases),
        Number.POSITIVE_INFINITY,
      ),
    ).slice(0, ALIASES_MAX);
    rows.push({
      id,
      name: sorted[0].name,
      names: distinct(
        sorted.flatMap((entry) => entry.names),
        NAMES_MAX,
      ),
      aliases,
      listings: listings.slice(0, LISTINGS_MAX),
      publishedAt: sorted[0].listing.day,
    });
  }
  return rows;
}

function read(fetched: Fetched): ReadResult<SemaEntity> | null {
  const entries: Entry[] = [];
  const count = { seen: 0, entities: 0, unreadable: 0 };
  const earliest: { day: string | null } = { day: null };
  const scan = scanElements(textOf(fetched, 0), RECORD_ELEMENT, (record) => {
    count.seen += 1;
    // Past the limit nothing is kept: the list is refused below, and never read in part.
    if (count.seen > RECORDS_MAX) return;
    // Individuals and ships are skipped on the presence of an element, before any cell is read.
    if (record.children.some((child) => NOT_AN_ENTITY.has(child.name))) return;
    const entry = entryOf(record);
    if (entry === null) {
      count.unreadable += 1;
      return;
    }
    // An entity that no name makes a key for is no record, but it is an entity of the file: the
    // floors count it, and so does the day of the earliest listing.
    count.entities += 1;
    if (earliest.day === null || entry.listing.day < earliest.day) earliest.day = entry.listing.day;
    if (entry.keyed) entries.push(entry);
  });
  if (scan.root !== ROOT || scan.errors > 0) return null;

  const complete = count.seen <= RECORDS_MAX;
  if (!complete) return { rows: [], total: count.seen, unreadable: 0, complete };
  if (count.seen < RECORDS_MIN || count.entities < ENTITIES_MIN) return null;
  if (earliest.day === null || earliest.day > EARLIEST_BY) return null;

  const rows = entitiesOf(entries);
  // A reader that groups records into entities never gives a total below its rows and the records
  // it could not read (the kit refuses such a body). A record names one entity here, so the records
  // seen are always enough; the rule is kept for a file that one day names several.
  return {
    rows,
    total: Math.max(count.seen, rows.length + count.unreadable),
    unreadable: count.unreadable,
    complete,
  };
}

/** The sentence of a listing: the regulation, the schedule when it has one, the item and the day. */
function listingText(listing: SemaListing): string {
  const regulation = /regulations$/i.test(listing.regulation)
    ? listing.regulation
    : `${listing.regulation} regulations`;
  const schedule = listing.schedule === "" ? "" : `, schedule ${listing.schedule}`;
  return `Listed under the ${regulation}${schedule}, item ${listing.item}, on ${listing.day}.`;
}

/**
 * The summary of an entity. When the sentences are longer than a summary may be, the youngest of
 * its listings are left out one at a time (the third, then the second), so that the closing
 * sentence, which says what the list is not, always stays whole and last.
 */
function summaryOf(row: SemaEntity): string {
  const head = [FIRST_SENTENCE, sentence("Entity", lineOf(row.name, NAME_SHOWN))];
  const aliases =
    row.aliases.length === 0
      ? ""
      : sentence("Other names", lineOf(row.aliases.join("; "), ALIASES_SHOWN));
  const sentencesFor = (shown: number): string[] => [
    ...head,
    ...row.listings.slice(0, shown).map(listingText),
    aliases,
  ];
  let shown = row.listings.length;
  while (
    shown > 1 &&
    joinSentences([...sentencesFor(shown), CLOSING]).length > RECORD_SUMMARY_MAX
  ) {
    shown -= 1;
  }
  return summaryWithClosing(sentencesFor(shown), CLOSING, RECORD_SUMMARY_MAX);
}

export const canadaSemaConnector: Connector = createFileConnector<SemaEntity>({
  id: "canada_sema",
  version: 1,
  root: ROOT,
  sortKey: (row) => row.id,
  files: [
    {
      url: FILE_URL,
      maxBytes: 8 * MIB,
      contentTypes: ["text/xml", "application/xml"],
      timeoutMs: 120_000,
    },
  ],
  pin: { hosts: ["www.international.gc.ca"], pathPrefixes: [FILE_DIRECTORY] },
  read,
  toRecords: (rows) =>
    rows.map((row) =>
      recordOf({
        id: row.id,
        type: "sanctions_entity",
        title: `${CANADA_SEMA_RECORD_MARK}: ${lineOf(row.name, NAME_SHOWN)}`,
        summary: summaryOf(row),
        // One address for each entity: the page that describes the list, and the entity.
        url: `${DOCUMENTATION_URL}&entity=${encodeURIComponent(row.id)}`,
        identifiers: { entity: row.name, listings: row.listings },
        names: row.names,
        publishedAt: row.publishedAt,
        sourceUpdatedAt: null,
      }),
    ),
});
