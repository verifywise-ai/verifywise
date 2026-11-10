/**
 * The UK Competition and Markets Authority cases as a mirrored list of the vendor risk database: the
 * case pages that the CMA publishes on GOV.UK (mergers, Competition Act cases, consumer protection
 * enforcement, criminal cartels, digital markets), which the GOV.UK Search API lists with a title, a
 * case type, a state, an outcome and two dates. The licence is the Open Government Licence v3.0
 * (GOV.UK states that its content is available under it).
 *
 * The record unit is the PARTY ENTITY, not the case. A case names its parties only in its title, so
 * they are read from it by the rules below, and the parties that spell to the same compact short
 * name (`compactName(shortName(name))`, which is also the id of the record) are one entity with the
 * number of its kept cases by type, how many are open and the three newest. A newest case is shown
 * by its title (to 80 characters), type, state, outcome (the CMA's own words, whole up to 60
 * characters: the longest label of the list has 57) and day. A party to a case is context, never a
 * finding: a merger review names both companies and is no wrongdoing, and the record says that a
 * case entry is "not a finding against the party unless its outcome says so".
 *
 * What is kept. A case is kept when it can carry an intervention or an enforcement outcome: a case of
 * the types consumer protection, Competition Act, criminal cartel or digital markets whose outcome is
 * none of the three closures without action, and a merger that is open or ended in a phase 2
 * prohibition, a phase 2 clearance with remedies or phase 1 undertakings in lieu. Every other case
 * (merger clearances, mergers found not to qualify, referrals, cancellations, the types that name no
 * party) is read and left out. The search has 2,593 cases today and 456 are kept, 268 of which give a
 * party.
 *
 * Where a party is read (the first rule that gives a party wins). Rule M, a merger: the title without
 * a trailing `(OFT)`, `(CC)`, `(CMA)` or `(OFT/CC)` and without its `merger inquiry` tail is split at
 * its slashes, or is `Completed acquisition by A of B` (also anticipated, proposed, minority). Rule
 * C, the other types: `Head: tail` where the tail is a consumer protection case, or begins
 * `alleged`, `investigation`, `suspected` or `competition act`, and the head is not rejected by the
 * list of words that name a sector or a product (a head with a legal form is never rejected); the head
 * is split at ` / `. Rule P: `Name's ...` for the digital markets type, and `Investigation into
 * Name's ...` or `Suspected abuse of a dominant position in relation to Name's ...` for any other
 * kept type of these. Rule B: `conduct by Name` or `behaviour by Name`. A part of a title that ends in
 * `(now X)` or `(formerly X)` is the party and an alias of it, and the alias is one more name of the
 * entity. A party is dropped when it is longer than a name may be or has fewer than four letters and
 * digits once its legal form is off. The one rule of the connector about natural persons is the
 * honorific (Mr, Mrs, Ms, Miss, a blank after it): a party of that form is dropped, and a former or
 * new name of that form is kept out of the names of its party; the case stays for its other parties.
 * The title of such a case, which the record of its other parties quotes among its newest cases, is
 * the CMA's public wording: it is shown as the CMA gives it and is not cut for persons.
 * A kept case that gives no party is read and gives no row: that is a gap of the list, not an error.
 * A title is read to 500 characters (the longest real one has 252): a kept case with a longer one, or
 * with one that is empty once folded, is unreadable, and counted as such, not taken for a case that
 * names no party.
 *
 * What the date of a case is: its closing day, else its opening day, else none. The day of
 * republication (`public_timestamp`) is never a case date: it says when the page was last touched.
 * An entity with an open kept case has no day at all (publishedAt is null), so that the lookback never
 * hides a live case; else its day is the newest case date.
 *
 * What the file is. The search is asked in pages of 1,000 (`start` = 0, 1000, ...), at most five, and
 * the pager (govukSearch.ts) checks that the pages are one search; the server sends no ETag and no
 * Last-Modified, so the pages are downloaded in full every week (1.8 MB) and the hash of the body
 * tells that nothing changed. The body has the entities and their counts, never a title that no kept
 * entity shows, never the description of a case and never its market sector.
 */
import { shortName, isLegalFormOrArticle } from "../../identity";
import { compactName } from "../../records/match";
import { cutAtCodePoint } from "../../text";
import type { ParsedRecord } from "../types";
import { GOVUK_PIN, GOVUK_SITE, govukRowsOf, govukSearchPages } from "./govukSearch";
import { compareText, dayText, lineOf, lineWithin, shorten, withoutAngles } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { type Sleep, realSleep } from "./kit/pause";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UK_CMA_RECORD_MARK = "UK Competition and Markets Authority cases";

/** The search of the cases, up to the `start` that each page adds. */
const SEARCH_URL_BEFORE_START =
  "https://www.gov.uk/api/search.json?filter_format=cma_case&count=1000&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=case_type&fields[]=case_state&fields[]=outcome_type&fields[]=market_sector&fields[]=opened_date&fields[]=closed_date&start=";
/** The search has 2,593 cases (three pages) today; more than five pages is no longer this list. */
const PAGE_SIZE = 1_000;
const MAX_PAGES = 5;
/** A page is 0.6 MB today. */
const MAX_BYTES = 8 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 60_000;

/** Every case's address is a page under this directory of the site. */
const LINK_PATTERN = /^\/cma-cases\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)*$/;
const LINK_MAX = 200;

/** A title longer than this (as it is folded) is not read by the rules: its kept case is unreadable. */
const TITLE_MAX = 500;
/** The longest name of a party as it is displayed, and the shortest key that matches. */
const NAME_MAX = 120;
const MIN_KEY_CHARS = 4;
/** The longest key (and so id) of an entity: the compact part of an id. */
const KEY_MAX = 120;
/** The parties of the list today are 454; a list of thousands is no list of this kind. */
const MAX_ENTITIES = 5_000;
/** The names of an entity that a vendor may match: its spellings, then its aliases, at most. */
const NAMES_MAX = 10;
const ITEMS_MAX = 3;
const TITLE_SHOWN_MAX = 80;
/** The longest outcome shown whole, marker included: the longest label of the list has 57 characters. */
const OUTCOME_SHOWN_MAX = 60;
/** The longest case type, state or outcome that is read: the vocabulary of the list is far shorter. */
const WORD_MAX = 200;

const MERGERS = "mergers";
const OPEN = "open";
/** The five types of case that are kept, in the order of the summary, with the words of the summary for each. */
const TYPES: ReadonlyArray<readonly [slug: string, label: string]> = [
  [MERGERS, "merger"],
  ["ca98-and-civil-cartels", "competition (CA98 or cartel)"],
  ["consumer-enforcement", "consumer protection"],
  ["criminal-cartels", "criminal cartel"],
  ["digital-markets-unit", "digital markets"],
];
const LABELS: ReadonlyMap<string, string> = new Map(TYPES);
const DIGITAL_MARKETS = "digital-markets-unit";
/** The three outcomes with which a case of another type than a merger closed without action. */
const CLOSED_WITHOUT_ACTION: ReadonlySet<string> = new Set([
  "ca98-no-grounds-for-action-non-infringement",
  "ca98-administrative-priorities",
  "consumer-enforcement-no-action",
]);
/** The outcomes of a closed merger that are kept: the interventions. */
const MERGER_INTERVENTIONS: ReadonlySet<string> = new Set([
  "mergers-phase-2-prohibition",
  "mergers-phase-2-clearance-with-remedies",
  "mergers-phase-1-clearance-with-undertakings-in-lieu",
]);

const NO_OUTCOME = "no outcome recorded";
const NO_DATE = "no date";

const WHAT_AN_ENTRY_IS =
  "A case entry names a party to a merger review or to a competition, consumer protection or digital markets case; it is not a finding against the party unless its outcome says so.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

const WORD_CHAR = "[\\p{L}\\p{N}_]";
/** A word boundary as the Unicode patterns have it (`\b` of a regular expression is ASCII). */
const WORD_START = `(?<!${WORD_CHAR})`;
const WORD_END = `(?!${WORD_CHAR})`;

/** A name of a company in a title: a capitalised word, then up to four more, which may be `of`, `and`, `de` or `&`. */
const NAME = "([A-Z][A-Za-z0-9&.\\-]*(?: (?:[A-Z][A-Za-z0-9&.\\-]*|of|and|de|&)){0,4})";

/** Rule M. */
const OFT_TAIL = /\s*\((?:OFT|CC|CMA|OFT\/CC)\)\s*$/;
const MERGER_TAIL = /\s+(?:partnership\s+)?(?:joint venture\s+)?merger inquir(?:y|ies)\s*$/i;
const SLASH = /\s*\/\s*/;
const ACQUISITION = /^(?:completed|anticipated|proposed|minority)\s+acquisition by (.+?) of (.+)$/i;
const ALIAS = /^(.*?)\s*\((?:now|formerly)\s+(.+?)\)\s*$/i;
/** Rule C. */
const COLON = /^([^:]{2,80}):\s*(.+)$/u;
const COLON_TAIL = new RegExp(
  `^(?:consumer protection(?: enforcement)? case|(?:alleged|investigation|suspected|competition act)${WORD_END}.*)$`,
  "iu",
);
/** The words that name a sector or a product: a head that holds one is no company, unless it has a legal form. */
const STOP_WORDS = [
  "sectors?",
  "products?",
  "services?",
  "tablets?",
  "capsules?",
  "goods",
  "review",
  "fraud",
  "scheme",
  "manufacturers",
  "websites",
  "equipment",
  "homes",
  "aids",
  "drugs",
  "instruments",
  "dairy",
  "e-books",
  "contracts",
  "fares",
  "groups",
  "ophthalmology",
  "greenwashing",
  "retailer",
  "provision",
  "prosecutions?",
  "iphones",
  "remicade",
  "transport",
  "care",
  "musical",
  "leisure",
  "mobility",
  "private",
  "property",
  "pharmaceutical",
  "entertainment",
  "business continuity",
  "loan",
];
const STOPLIST = new RegExp(`${WORD_START}(?:${STOP_WORDS.join("|")})${WORD_END}`, "iu");
/** Rule P. */
const POSSESSIVE_OF_DIGITAL_MARKETS = new RegExp(`^${NAME}['’]s `, "u");
const POSSESSIVE = new RegExp(
  `^(?:Investigation into |Suspected abuse of a dominant position in relation to )${NAME}['’]s `,
  "u",
);
/** Rule B. */
const CONDUCT = new RegExp(
  `${WORD_START}(?:conduct|behaviour) by ${NAME}(?= in | of | on | and |$)`,
  "u",
);
/** A natural person's form: an honorific (with or without its full stop) and a blank. */
const PERSON = /^(?:Mr|Mrs|Ms|Miss)\.?\s/;
const THE = /^the$/i;

/** One of the newest cases of an entity: only what the summary shows. */
interface CmaItem {
  /** The path of the case's page: it begins with `/cma-cases/`. */
  link: string;
  title: string;
  /** The words of the case type in the summary. */
  type: string;
  state: "open" | "closed";
  /** The outcome as the CMA's own words (its slug with blanks), or null when the case has none. */
  outcome: string | null;
  date: string | null;
}

/** One party entity of the list, as the reader makes it. */
interface CmaEntity {
  /** `compactName(shortName(name))`: the id of the record, without its prefix. */
  key: string;
  /** The most frequent spelling, the newest of equally frequent ones. */
  name: string;
  /** The spellings that a vendor may match, the display first. */
  spellings: string[];
  /** The `(now X)` and `(formerly X)` names of the party, after the spellings and with them at most ten. */
  aliases: string[];
  /** The kept cases that name the entity. */
  count: number;
  /** The kept cases of each type, for the types that have any, in the order of `TYPES`. */
  byType: Record<string, number>;
  /** How many of them are open. */
  open: number;
  /** The newest cases, at most three. */
  items: CmaItem[];
  /** The newest case date among the cases, or null when none has one. */
  newest: string | null;
}

/** A party as a rule reads it from a title: the name, and the name it was or became, when the title says. */
interface Party {
  name: string;
  alias: string | null;
}

/** A party that was accepted: its spelling, the key of its entity, and its alias. */
interface Named {
  spelling: string;
  key: string;
  alias: string | null;
}

/** What one case of the list gives when it is read: the fields that the filter and the summary need. */
interface Case {
  link: string;
  title: string;
  type: string;
  /** The words of the type in the summary. */
  label: string;
  open: boolean;
  outcome: string | null;
  date: string | null;
}

/** The text without the characters of `chars` at either end, by position (no pattern at the end). */
function trimChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start += 1;
  while (end > start && chars.includes(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

const newerThan = (a: string | null, b: string | null): boolean =>
  a !== null && (b === null || a > b);

/** A part of a title as a party: no blank or comma at its ends, and a trailing `(now X)` as its alias. */
function partyOf(text: string): Party | null {
  const part = trimChars(text, " ,");
  if (part === "") return null;
  const found = ALIAS.exec(part);
  return found === null
    ? { name: part, alias: null }
    : { name: trimChars(found[1], " ,"), alias: trimChars(found[2], " ,") };
}

const partiesIn = (parts: readonly string[]): Party[] =>
  parts.flatMap((part) => partyOf(part) ?? []);

/** Rule M (a merger): the parties of the slashes, or the buyer and the target of an acquisition. */
function mergerParties(title: string): Party[] {
  const core = title.replace(OFT_TAIL, "").replace(MERGER_TAIL, "");
  if (core.includes("/")) return partiesIn(core.split(SLASH));
  const acquisition = ACQUISITION.exec(core);
  return acquisition === null ? [] : partiesIn([acquisition[1], acquisition[2]]);
}

/** Whether a word of the head is a legal form: the article `the` is none. */
const hasLegalForm = (head: string): boolean =>
  head
    .split(/[\s,]+/)
    .some((word) => isLegalFormOrArticle(word) && !THE.test(word.replace(/[.,]/g, "")));

/** Rule C (the other types): the head of `Head: tail`, split at ` / `, unless it names a sector or a product. */
function colonParties(title: string): Party[] {
  const found = COLON.exec(title);
  if (found === null || !COLON_TAIL.test(found[2].trim())) return [];
  const head = found[1].trim();
  if (STOPLIST.test(head) && !hasLegalForm(head)) return [];
  return partiesIn(head.split(" / "));
}

/** Rule P: the name before a possessive, for the digital markets type and after the prefixes of the others. */
function possessiveParties(title: string, type: string): Party[] {
  const found =
    (type === DIGITAL_MARKETS ? POSSESSIVE_OF_DIGITAL_MARKETS.exec(title) : null) ??
    POSSESSIVE.exec(title);
  return found === null ? [] : [{ name: found[1], alias: null }];
}

/** Rule B: the name after `conduct by` and `behaviour by`. */
function conductParties(title: string): Party[] {
  const found = CONDUCT.exec(title);
  return found === null ? [] : [{ name: found[1], alias: null }];
}

/** The parties of a title, by the first rule of its type that gives any (the drops come after). */
function partiesOf(title: string, type: string): Party[] {
  const rules =
    type === MERGERS
      ? [mergerParties, conductParties]
      : [colonParties, (text: string) => possessiveParties(text, type), conductParties];
  for (const rule of rules) {
    const parties = rule(title);
    if (parties.length > 0) return parties;
  }
  return [];
}

/** A name as the list stores it: one clean line no longer than a name may be, or null when it is not one. */
const nameOf = (text: string): string | null => lineWithin(text, NAME_MAX);

/**
 * The party as an entity names it, or null when it is dropped: a natural person's form (an
 * honorific and a blank, at the start of the name as the title was folded), no name, or too short a
 * key. A former or new name of a person's form is left out of the party, which stays without it.
 */
function namedOf(party: Party): Named | null {
  if (PERSON.test(party.name)) return null;
  const spelling = nameOf(party.name);
  if (spelling === null) return null;
  const key = compactName(shortName(spelling));
  if (key.length < MIN_KEY_CHARS) return null;
  return {
    spelling,
    key: cutAtCodePoint(key, KEY_MAX),
    alias: party.alias === null || PERSON.test(party.alias) ? null : nameOf(party.alias),
  };
}

/** A value that the API gives as a text or as a list of texts: the text, or the first of the list. */
function wordOf(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const word = typeof first === "string" ? lineOf(first, WORD_MAX) : "";
  return word === "" ? null : word;
}

/** Whether the filter keeps a case of this type (one of the five), in this state, with this outcome. */
function isKept(type: string, open: boolean, outcome: string | null): boolean {
  if (type === MERGERS) return open || (outcome !== null && MERGER_INTERVENTIONS.has(outcome));
  return outcome === null || !CLOSED_WITHOUT_ACTION.has(outcome);
}

/**
 * The fields of a case that a kept case is read by, "dropped" for a case that the filter leaves
 * out, or null when the row cannot be read: no text for a title or an address, no case type, no
 * state, or a kept case whose title is empty once folded or longer than the rules read. A case that
 * is not kept has no title read: it never reaches the body.
 */
function caseOf(row: Record<string, unknown>): Case | "dropped" | null {
  const { title, link } = row;
  const type = wordOf(row.case_type);
  const state = wordOf(row.case_state);
  if (typeof title !== "string" || typeof link !== "string" || type === null || state === null) {
    return null;
  }
  const label = LABELS.get(type);
  const open = state === OPEN;
  const outcome = wordOf(row.outcome_type);
  if (label === undefined || !isKept(type, open, outcome)) return "dropped";
  // A title that does not fit is never cut to one that does: the case cannot be read.
  const line = lineWithin(title, TITLE_MAX);
  if (line === null) return null;
  return {
    link,
    title: line,
    type,
    label,
    open,
    outcome,
    date: dayText(row.closed_date) ?? dayText(row.opened_date),
  };
}

/** The outcome as the CMA's own words: its slug with blanks for the hyphens, or null when there is none. */
const outcomeWordsOf = (outcome: string | null): string | null =>
  outcome === null ? null : lineOf(outcome.replace(/-/g, " "), OUTCOME_SHOWN_MAX) || null;

/** The newest first (a case without a day last), then by link. */
function newestFirst(a: CmaItem, b: CmaItem): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return compareText(a.link, b.link);
}

/** What is counted for an entity while the cases are read. */
interface Counting {
  /** The cases that spell the entity each way: how many, and the newest day of those. */
  spellings: Map<string, { cases: number; newest: string | null }>;
  aliases: Set<string>;
  count: number;
  byType: Map<string, number>;
  open: number;
  items: CmaItem[];
  newest: string | null;
}

const newCounting = (): Counting => ({
  spellings: new Map(),
  aliases: new Set(),
  count: 0,
  byType: new Map(),
  open: 0,
  items: [],
  newest: null,
});

/** The most cases first, then the newest, then the order of the texts. */
function bySpelling(
  [a, x]: [string, { cases: number; newest: string | null }],
  [b, y]: [string, { cases: number; newest: string | null }],
): number {
  if (x.cases !== y.cases) return y.cases - x.cases;
  if (x.newest !== y.newest) {
    if (x.newest === null) return 1;
    if (y.newest === null) return -1;
    return x.newest < y.newest ? 1 : -1;
  }
  return compareText(a, b);
}

function entityOf(key: string, counting: Counting): CmaEntity {
  const spellings = [...counting.spellings].sort(bySpelling).slice(0, NAMES_MAX);
  // In the order of TYPES, so that the body never depends on the order of the cases.
  const byType: Record<string, number> = {};
  for (const [, label] of TYPES) {
    const count = counting.byType.get(label);
    if (count !== undefined) byType[label] = count;
  }
  return {
    key,
    name: spellings[0][0],
    spellings: spellings.map(([spelling]) => spelling),
    aliases: [...counting.aliases].sort(compareText).slice(0, NAMES_MAX - spellings.length),
    count: counting.count,
    byType,
    open: counting.open,
    items: counting.items,
    newest: counting.newest,
  };
}

/** One kept case that names the entity, in the spellings and with the aliases that it gives. */
function countCase(
  counting: Counting,
  item: CmaItem,
  named: { spellings: Iterable<string>; aliases: Iterable<string> },
): void {
  for (const spelling of named.spellings) {
    const seen = counting.spellings.get(spelling);
    if (seen === undefined) {
      counting.spellings.set(spelling, { cases: 1, newest: item.date });
    } else {
      seen.cases += 1;
      if (newerThan(item.date, seen.newest)) seen.newest = item.date;
    }
  }
  for (const alias of named.aliases) counting.aliases.add(alias);
  counting.count += 1;
  counting.byType.set(item.type, (counting.byType.get(item.type) ?? 0) + 1);
  if (item.state === OPEN) counting.open += 1;
  counting.items.push(item);
  counting.items.sort(newestFirst);
  if (counting.items.length > ITEMS_MAX) counting.items.length = ITEMS_MAX;
  if (newerThan(item.date, counting.newest)) counting.newest = item.date;
}

/**
 * The party entities of the search, or null when it is not the list. A pure function of its pages:
 * it takes the cases as the pager checked them, reads the title of each kept case for its parties,
 * and keeps no more of a case than the few fields of the summary. A case with no title (or one that
 * is empty once folded), no type or no state, or whose address is no case's page, or a kept case
 * whose title is longer than the rules read, is unreadable; a case that is not kept, and a kept case
 * that names no party, are read and give no row.
 */
function readSearch(fetched: Fetched): ReadResult<CmaEntity> | null {
  const search = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
  if (search === null) return null;

  const entities = new Map<string, Counting>();
  let unreadable = 0;
  for (const row of search.rows) {
    const read = caseOf(row);
    if (read === null) {
      unreadable += 1;
      continue;
    }
    if (read === "dropped") continue;

    // Each party once for its entity, with the spellings and the aliases that the case gives it.
    const named = new Map<string, { spellings: Set<string>; aliases: Set<string> }>();
    for (const party of partiesOf(read.title, read.type)) {
      const found = namedOf(party);
      if (found === null) continue;
      const entry = named.get(found.key) ?? { spellings: new Set(), aliases: new Set() };
      entry.spellings.add(found.spelling);
      if (found.alias !== null) entry.aliases.add(found.alias);
      named.set(found.key, entry);
    }
    if (named.size === 0) continue;

    // The address is what the case's page is: a case with another is no case of this list.
    if (read.link.length > LINK_MAX || !LINK_PATTERN.test(read.link)) {
      unreadable += 1;
      continue;
    }
    const item: CmaItem = {
      link: read.link,
      title: shorten(read.title, TITLE_SHOWN_MAX),
      type: read.label,
      state: read.open ? "open" : "closed",
      outcome: outcomeWordsOf(read.outcome),
      date: read.date,
    };

    for (const [key, names] of named) {
      let counting = entities.get(key);
      if (counting === undefined) {
        // A list of more parties than any real one is no list of this kind.
        if (entities.size >= MAX_ENTITIES) return null;
        counting = newCounting();
        entities.set(key, counting);
      }
      countCase(counting, item, names);
    }
  }

  const rows = [...entities].map(([key, counting]) => entityOf(key, counting));
  return {
    rows,
    // The entities may be more than the cases (a case can name several parties).
    total: Math.max(search.total, rows.length + unreadable),
    unreadable,
    complete: search.rows.length === search.total,
  };
}

/** `merger 2, consumer protection 1`: the cases of each type that the entity has, in the order of TYPES. */
const typeCountsOf = (byType: Record<string, number>): string =>
  TYPES.filter(([, label]) => (byType[label] ?? 0) > 0)
    .map(([, label]) => `${label} ${byType[label]}`)
    .join(", ");

/** One of the newest cases: its title and what the list says of its type, state, outcome and day. */
const itemSentenceOf = (item: CmaItem): string =>
  `“${item.title}” (${item.type}, ${item.state}, ${item.outcome ?? NO_OUTCOME}, ${item.date ?? NO_DATE})`;

/** A record is the party entity: its spelling, its kept cases by type, and the newest three. */
function toRecord(row: CmaEntity): ParsedRecord {
  const name = lineOf(row.name, NAME_MAX);
  return recordOf({
    id: `cma:${row.key}`,
    type: "competition_case_summary",
    title: `CMA cases: ${name}`,
    summary: summaryWithClosing(
      [
        `${UK_CMA_RECORD_MARK} (gov.uk), an enforcement or case list.`,
        WHAT_AN_ENTRY_IS,
        `Party as written in the case titles: ${name}.`,
        `Cases kept: ${row.count} (${typeCountsOf(row.byType)}), ${row.open} open.`,
        `Newest: ${row.items.map(itemSentenceOf).join("; ")}.`,
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    // A case has no page of its own for a party: the page of the newest case that names it.
    url: `${GOVUK_SITE}${row.items[0].link}`,
    identifiers: {
      party: withoutAngles(name),
      cases: row.count,
      open: row.open,
      newest: row.newest,
      ...(row.aliases.length > 0 ? { aliases: row.aliases.map(withoutAngles) } : {}),
    },
    names: [...row.spellings, ...row.aliases],
    // A party with an open case is live whatever its age: no day, so that the lookback never hides it.
    publishedAt: row.open > 0 ? null : row.newest,
  });
}

/** The connector of the list. The pager waits between two pages: a test hands it a `sleep` that does not. */
export function createUkCmaConnector({ sleep = realSleep }: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<CmaEntity>({
    id: "uk_cma",
    version: 1,
    root: "search.json",
    sortKey: (row) => row.key,
    pin: GOVUK_PIN,
    // No validator is sent (the API has none), so the pages are downloaded in full each time.
    fetchFiles: (fetch) =>
      govukSearchPages(fetch, (start) => `${SEARCH_URL_BEFORE_START}${start}`, {
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        maxBytes: MAX_BYTES,
        timeoutMs: TOTAL_TIMEOUT_MS,
        sleep,
      }),
    read: readSearch,
    toRecords: (rows) => rows.map(toRecord),
  });
}

export const ukCmaConnector: Connector = createUkCmaConnector();
