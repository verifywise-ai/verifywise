/**
 * The Dutch Algorithm Register as a mirrored list of the vendor risk database: the algorithms that
 * Dutch public bodies publish in the national register (algoritmes.overheid.nl, run for the Ministry
 * of the Interior and Kingdom Relations; the public bodies write the descriptions), read from the
 * register's own bulk download, one CSV of 31 columns and 1,638 rows. The column `provider` names
 * the supplier of an algorithm, as free text that each public body typed; a record is one provider
 * key and the descriptions that name it. It is a state (what the bodies publish today), the public
 * bodies' own statement and no finding about the provider, and the Dutch government does not
 * endorse it.
 *
 * One file, one plain GET: the server sends no ETag, no Last-Modified and no length, so the file is
 * asked again in full on every run (1.7 MB on the wire) and the sync's hash of the body decides
 * whether anything changed. The answer must come from the downloads' path on the register's host
 * after the redirects. Nothing in the answer says that it is whole, so the reader checks what it
 * can: the last byte is a line feed (a stream cut in a row has none), the header holds the seven
 * columns, every row is as wide as the header, and a file of fewer than 1,000 rows is not this list.
 *
 * Seven columns are read, by name: `provider`, `organization`, `org_id`, `status`,
 * `publication_category`, `publication_dt` and `algorithm_id`. Everything else is dropped before a
 * row is built, `contact_email` (personal and functional addresses) first of all, then the free text
 * that 353 public bodies wrote (descriptions, goals, legal bases, risks, methods), the address
 * columns and the algorithm's own name. The id of an algorithm is checked (eight digits, held by
 * one row only) and then only counted. A row is unreadable when it is not as wide as the header,
 * when its status or its category is not one of the register's three values, when its id is not one
 * or is held by another row too (both rows go: neither can be trusted, and neither order of the
 * file may decide), when its publication day is no day or when it names no public body. A cell that
 * is kept as an id or a name is never a cut text, as in the other lists: an
 * org_id of more than 20 units and a public body's name of more than 80 make the row unreadable, as
 * does a provider cell of more than a megabyte, which is refused before it is read.
 *
 * Rule N reads `provider`: a cell of more than 60 characters is a sentence and gives no name (it
 * may name a supplier, and that loss is accepted: such sentences hide global AI vendors as
 * well). Web addresses and parentheticals (an unclosed one too) are cut out of a shorter cell;
 * it is split at a semicolon, a comma, a slash and the word "en" (an ampersand and a hyphen are no
 * separators: "ZyAcme eDiscovery & Compliance Services B.V." is one name); the blanks and `. , : -`
 * are cut off both ends of a name. A name is dropped when it starts with a marker of the public body
 * itself or of an empty field (is, intern, eigen, zelf, het, de, dit, deze, er, geen, niet, nvt,
 * n.v.t, onbekend, gemeente, provincie: the short ones as whole words, so that "Decolab" stays), or
 * holds an academic title, or has a key of fewer than four characters. The key is
 * `compactName(shortName(name))`: "Acme B.V." and "Acme BV" are one. A row counts once for each key
 * it names. No host is a key: the addresses in the cells are typed by public bodies.
 * Natural persons are told apart by the academic title alone (the few cells of the file that carry
 * one were all persons); the other rule that was tried, two or three capitalised words, found
 * no person in 22 hits and is not applied. A title is a word at the start of a name or after a
 * blank, a colon, a semicolon, a comma or a bracket (a square one too), in any case and
 * whatever follows it: prof, dr, drs, ir, mr, the honorifics dhr, mevr and mevrouw, and ing
 * and bc with a full stop ("dr. J. Voorbeeld", "Prof.dr.ir. J.P. Voorbeeld", "dhr. Jan Voorbeeld",
 * "bc. J. Voorbeeld"), and prof, dr, drs, ir, mr, dhr, mevr and mevrouw without one, but not a bare
 * "ING", which is the bank, nor a bare "bc". A post-nominal (MSc, MBA, PhD, LLM and RA, in any
 * case, with or without the full stops of M.Sc., Ph.D., LL.M. and R.A.) AFTER a name is a marker as
 * well, a whole word in the piece or as the text of brackets ("Jan Voorbeeld MSc", "J. Voorbeeld
 * (M.B.A.)", "Voorbeeld, J., MSc"); a name that BEGINS with the letters of one ("MSC Software",
 * "RA Works") is a company's. The rule fails closed, since a person is never a key: a company whose
 * name starts with a title word (a brand "Dr. ...") or is followed by a post-nominal ("Acme B.V.
 * MSc") is dropped as a person is, and so is a company whose name ends in LLM, MBA or RA. The title
 * rule is this register's own, so it stays here and not in the person rules of the kit.
 *
 * A title that FOLLOWS the name it qualifies is the same person: brackets whose text begins
 * with a title ("Jan Voorbeeld (dr.)", "Voorbeeld, J. (Prof.)") drop the piece they belong to, and a
 * piece that begins with a title, or has such brackets, is a title piece that drops the piece before
 * it when a comma separated the two (the surname of "Voorbeeld, dr. J."). Another separator (a
 * semicolon, a slash, the word en) separates two parties, so "Acme en dr. Voorbeeld" keeps Acme.
 * The rule fails closed here too: "Acme B.V., dr. Voorbeeld" loses Acme, since a comma is also what
 * separates a surname from its title. A title later in brackets ("(contact: dr. J. Voorbeeld)") or
 * after other words of a piece that does not begin with one is a residual, as is every person
 * with no title at all.
 *
 * A title that stands after initials, or after more pieces, is a TITLE PIECE too: a piece that
 * holds a marker and whose every other word is an initial ("J.", "J.P.") or one capitalised word,
 * with no legal form and no organisation word ("J. dr.", "J.P. prof.", "Jan MSc", "dr."). The
 * comma-separated pieces before it that are initials or one capitalised word go with it ("Voorbeeld,
 * J. dr.", "Voorbeeld, J. P., dr.", "Voorbeeld, Jan, dr."), walking back to a piece that holds a
 * legal form or an organisation word, has two capitalised words or a lower-case word, or that
 * another separator set apart: "Acme B.V., Quorpel, J. Dr." keeps Acme B.V.. A piece that holds a
 * title after other words ("Acme B.V., Beta Works dr. Voorbeeld") is no title piece and takes no
 * piece before it. Residuals: a title glued to initials ("J.P.dr."), a name with a particle or of
 * two capitalised words ("Van Dijk, J. dr."), a surname in lower case, and an initial in lower case
 * ("Voorbeeld, j. dr." keeps "Voorbeeld"; a capital with no full stop, "J dr.", is an initial), a
 * hyphenated initial, the title `mw.` and `t.a.v.` before a person, and the post-nominals BSc, MA,
 * MD, RC, RE and EMIA, which the rule does not read.
 *
 * A row whose provider cell holds the sign © or the word "auteursrecht" is left out and is not
 * unreadable: the register's copyright page excludes an item that states a restriction.
 *
 * The reader groups the rows into providers: its `rows` are the providers, its `unreadable` the
 * rows that cannot be read, and its `total` the rows that it saw (or the providers, when a few rows
 * name many). A file of more than 20,000 rows, of more than 5,000 providers, of a row of more than
 * 100 cells, or that ends inside a quote is cut: the download fails as too large, and never gives a
 * shorter list.
 */
import { isLegalFormOrArticle, shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  LINE_INPUT_MAX,
  compareText,
  dayText,
  isObject,
  lineOf,
  lineWithin,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { GENERIC_ORG_WORDS } from "./kit/persons";
import { IDENTIFIERS_MAX_CHARS, RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, columnsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names the list by. */
export const NL_ALGORITMEREGISTER_RECORD_MARK = "Dutch Algorithm Register";

/** The host as the first sentence of a record writes it. */
const HOST = "algoritmes.overheid.nl";
const FILE_URL = `https://${HOST}/api/downloads/NLD?filetype=csv`;
/** The register's search: it lists every public body that describes an algorithm of the provider. */
const SEARCH_URL = `https://${HOST}/nl/algoritme?searchtext=`;
/** The name of the document, which is the same on every run (the file's own name carries the day). */
const ROOT = "algoritmeregister.csv";
const PIN: Pin = { hosts: [HOST], pathPrefixes: ["/api/downloads/"] };

/** The columns that are read, by their exact names; the file is not the list without all of them. */
const WANTED = {
  provider: "provider",
  organization: "organization",
  orgId: "org_id",
  status: "status",
  category: "publication_category",
  published: "publication_dt",
  id: "algorithm_id",
} as const;

/** A file of fewer data rows is not this list (1,638 today). */
const MIN_ROWS = 1000;
/** A file of more data rows is cut by its limit, and fails as too large. */
const MAX_ROWS = 20_000;
/** The register has 31 columns; a row of more than this many is no row of it. */
const MAX_COLUMNS = 100;
/** The most providers of a list (248 today): more are held in memory by no list of this kind. */
const MAX_PROVIDERS = 5000;
const LINE_FEED = 0x0a;

/**
 * A provider cell is read to this many characters. A cell of more than NAME_MAX_CHARS gives no
 * name, so the cut loses none.
 */
const PROVIDER_CELL_MAX = 200;
const ORGANIZATION_CELL_MAX = 80;
const ORG_ID_CELL_MAX = 20;
const ID_CELL_MAX = 20;
const STATUS_CELL_MAX = 40;
const CATEGORY_CELL_MAX = 40;
const PUBLISHED_CELL_MAX = 40;
/** The length of a day, YYYY-MM-DD: the publication stamp is read as its first characters. */
const DAY_CHARS = 10;

/** A provider cell of more characters is a sentence, and a name of more is none. */
const NAME_MAX_CHARS = 60;
const KEY_MIN_CHARS = 4;
const DISPLAY_MAX = 80;
const NAMES_MAX = 5;
const BODY_NAMES_MAX = 30;
/** The form of a body's name that the text of a record shows: the name cut to this many characters. */
const BODY_SHOWN_CHARS = 40;
/** What of the identifiers the names of the bodies may take, so that the rest always fits. */
const BODY_NAMES_JSON_MAX = IDENTIFIERS_MAX_CHARS - 500;
const BODIES_SHOWN = 3;

type StatusKey = "inUse" | "inDevelopment" | "outOfUse";

/** The register's three statuses, in the words that its file has them. */
const STATUS_OF: ReadonlyMap<string, StatusKey> = new Map([
  ["In gebruik", "inUse"],
  ["In ontwikkeling", "inDevelopment"],
  ["Buiten gebruik", "outOfUse"],
]);

/** The one label that a public body gives its own algorithm when it finds it a high-risk AI system. */
const HIGH_RISK = "Hoog-risico AI-systeem";
/** The register's three categories, in the words that its file has them. */
const CATEGORIES: ReadonlySet<string> = new Set([
  "Overige algoritmes",
  "Impactvolle algoritmes",
  HIGH_RISK,
]);

/** The id of an algorithm in the register: eight digits. */
const ALGORITHM_ID = /^\d{8}$/;

/** A web address, or an address that begins with www. */
const ADDRESSES = /(?:https?:\/\/|www\.)\S+/gi;
/** A parenthetical qualifier, an unclosed one too (it runs to the end of the cell). */
const PARENTHETICALS = /\([^)]*\)?/g;
/**
 * Square brackets, an unclosed pair too. Only the ones that hold a marker of a natural person are cut
 * out of a cell (as the round ones are): the others are text of the name, as they always were.
 */
const SQUARE_BRACKETS = /\[[^\]]*\]?/g;
/**
 * Where a provider cell is split: ";" "," "/" and the Dutch word for "and" between blanks. The
 * separator is kept in the split (a group), to tell a comma from the others.
 */
const SEPARATORS = /([;,/]|\sen\s)/i;
/**
 * A name that starts with a marker of the body itself or of an empty field. The short words must
 * stand alone ("Decolab" is not "de"); the longer markers are prefixes ("Intern ontwikkeld",
 * "Interne ontwikkeling").
 */
const NOT_A_PROVIDER =
  /^(?:is\b|intern|eigen|zelf|het\b|de\b|dit\b|deze\b|er\b|geen\b|niet\b|nvt\b|n\.v\.t|onbekend|gemeente\b|provincie\b)/i;
/**
 * The words of a title or an honorific before a name: prof, dr, drs, ir, mr, dhr, mevr and mevrouw
 * as whole words (neither a letter nor a digit follows them, so "dhr." and "dhr" are both one), and
 * ing and bc with a full stop (see `ACADEMIC_TITLE`).
 */
const TITLE_WORD = String.raw`(?:(?:ing|bc)\.|(?:prof|dr|drs|ir|mr|dhr|mevr|mevrouw)(?![\p{L}\p{N}]))`;
/**
 * An academic title or an honorific, which marks a natural person (never a provider): a word at the
 * start of a name or after a blank, a colon, a semicolon, a comma or a bracket (round or square), in
 * any case and whatever follows it. With a full stop it is prof, dr, drs, ir, mr, dhr, mevr, ing or
 * bc ("dr. J. Voorbeeld", "Prof.dr.ir.", "dhr. J. Voorbeeld", "Bc. Jan"); without one it is prof, dr,
 * drs, ir, mr, dhr, mevr or mevrouw, as a whole word (neither a letter nor a digit follows it), and
 * never ing or bc: a bare "ING" is a company, the bank. A full stop is neither a letter nor a digit,
 * so the whole word covers the full stop of the whole-word titles, and only ing and bc need the full
 * stop spelled out. Each title matches on its own, so stacked titles need no case of their own. The
 * rule fails closed: a company whose name starts with one of these words (a brand "Dr. ...") is
 * dropped too.
 */
const ACADEMIC_TITLE = new RegExp(String.raw`(?:^|[\s:;,(\[])${TITLE_WORD}`, "iu");
/**
 * The same title as the first word of a text (blanks before it are allowed): what a piece of a cell
 * begins with, or the text of brackets. A title later in the text is no such beginning.
 */
const LEADING_TITLE = new RegExp(String.raw`^\s*${TITLE_WORD}`, "iu");
/**
 * A post-nominal, the degree that follows a name: MSc, MBA, PhD, LLM and RA, in any case,
 * with or without the full stops between their letters (M.Sc., M.B.A., Ph.D., LL.M., R.A.), as a whole
 * word.
 */
const POST_NOMINAL_WORD = String.raw`(?:m\.?sc|m\.?b\.?a|ph\.?d|ll\.?m|r\.?a)(?![\p{L}\p{N}])`;
/**
 * A post-nominal AFTER a name: it follows a blank that follows another word of the piece, so that a
 * name that BEGINS with the letters of one ("MSC Software", "RA Works") is no person's. A piece that
 * is made of post-nominals alone is a post-nominal piece (`POST_NOMINAL_ONLY`).
 */
const POST_NOMINAL = new RegExp(String.raw`(?<=\S )${POST_NOMINAL_WORD}`, "iu");
/** A piece of nothing but post-nominals ("MSc", "M.Sc. MBA"), as in "Voorbeeld, J., MSc". */
const POST_NOMINAL_ONLY = new RegExp(
  String.raw`^${POST_NOMINAL_WORD}(?: ${POST_NOMINAL_WORD})*$`,
  "iu",
);
/**
 * The text of brackets that is nothing but post-nominals ("MSc)", "M.Sc., MBA)", "PhD"): a bracket
 * that begins with one and goes on with other words ("(MBA Group)", "(LLM provider)") is no such text.
 */
const POST_NOMINAL_BRACKET = new RegExp(
  String.raw`^\s*${POST_NOMINAL_WORD}(?:[\s,]+${POST_NOMINAL_WORD})*[\s.]*[)\]]?$`,
  "iu",
);
/** Every marker of a natural person in a text, wherever it stands: what is left of a piece without them. */
const MARKER_WORDS = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${TITLE_WORD}|${POST_NOMINAL_WORD})`,
  "giu",
);
/** A word that is one capital letter: an initial ("J" of "J." and of "J.P."). */
const INITIAL = /^\p{Lu}$/u;
/** A word of a capital and letters after it: a surname or a given name ("Voorbeeld", "O'Brien", "Jan-Willem"). */
const NAME_WORD = /^\p{Lu}[\p{L}\p{M}'\u2019-]+$/u;
/** What the kit's word lists take off a word before they look it up. */
const WORD_STOPS = /[.,;()]/g;
/**
 * Stands in the text of a cell for brackets that begin with an academic title, in the piece that the
 * brackets belong to. A cell is a clean line, which has no control character, so nothing that
 * a cell holds can be taken for it.
 */
const TITLE_BRACKETS = String.fromCharCode(0);
/** What the register's copyright page excludes: an item that states a restriction. */
const RESTRICTION = /©|auteursrecht/i;

/** What a provider row of the body holds: plain JSON data, every list in an order that no file decides. */
interface ProviderRow {
  /** The key: `compactName(shortName(name))`. */
  id: string;
  /** The most frequent spelling of the name. */
  display: string;
  /** At most five spellings, the most frequent first. */
  names: string[];
  /** The descriptions that name the provider. */
  algorithms: number;
  /** The public bodies that published them, counted by org_id. */
  bodies: number;
  /** The bodies' names, those with most descriptions first. */
  bodyNames: string[];
  status: Record<StatusKey, number>;
  /** The descriptions that their body labels a high-risk AI system. */
  highRisk: number;
  /** The newest publication day of them, YYYY-MM-DD. */
  newestPublished: string;
}

/** A cell as one clean line without `<` and `>`, cut at `max`. */
const cellOf = (cell: string, max: number): string => withoutAngles(lineOf(cell, max));

/**
 * A cell as one clean line without `<` and `>` that is at most `max` units long, or null when it is
 * empty or does not fit (`lineWithin`: a text that does not fit is never cut here, so that no cut
 * text is a key, an id or an identifier).
 */
function cellWithin(cell: string, max: number): string | null {
  const line = lineWithin(cell, max);
  return line === null ? null : withoutAngles(line);
}

/** The text without the blanks and the punctuation `. , : -` at either end. */
function trimmed(text: string): string {
  const isCut = (char: string): boolean =>
    char === " " || char === "." || char === "," || char === ":" || char === "-";
  let start = 0;
  let end = text.length;
  while (start < end && isCut(text[start])) start += 1;
  while (end > start && isCut(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/** A piece of a provider cell between two separators, as `providersOf` reads it. */
interface Piece {
  /** The name that the piece gives: its brackets cut out, its blanks closed up, its ends trimmed. */
  name: string;
  /** The piece has brackets that begin with a marker of a natural person (a title, a post-nominal). */
  marked: boolean;
  /** The piece holds a marker: brackets that begin with one, a title, or a post-nominal after a name. */
  holds: boolean;
  /**
   * The piece is a title: it begins with an academic title or an honorific, is nothing but
   * post-nominals, or has brackets that begin with a marker. The piece before it is the person's, when
   * a comma separated the two.
   */
  isTitle: boolean;
  /**
   * The piece is a person's title piece: it holds a marker and every other word of it is an
   * initial or one capitalised word ("J. dr.", "J.P. prof.", "dr.", "Jan MSc"), with no legal form
   * and no organisation word. The pieces before it that are a person's go with it.
   */
  isPerson: boolean;
  /** The separator before the piece is a comma, and not another one. */
  afterComma: boolean;
}

/** Whether a text holds a marker of a natural person: an academic title, an honorific, a post-nominal after a name. */
const holdsMarker = (text: string): boolean =>
  ACADEMIC_TITLE.test(text) || POST_NOMINAL.test(text) || POST_NOMINAL_ONLY.test(text);

/** Whether the text of brackets (what follows the opening one) begins with a title or is nothing but post-nominals. */
const isMarkedBrackets = (inside: string): boolean =>
  LEADING_TITLE.test(inside) || POST_NOMINAL_BRACKET.test(inside);

/**
 * Whether a piece can be a natural person's: initials and at most one capitalised word, with
 * no legal form and no organisation word (kit/persons.ts, identity.ts): "Voorbeeld", "Jan", "J. P.",
 * "J.P.", "J. Voorbeeld". A piece that holds no word is nobody's, and stands in the way of nothing.
 * A name of two capitalised words ("Beta Works", "Van Dijk"), one with a lower-case word ("van
 * Dijk") and a company ("Acme B.V.") are not read as a person's.
 */
function isPersonal(name: string): boolean {
  let capitalised = 0;
  for (const word of name.split(" ")) {
    if (word === "") continue;
    if (isLegalFormOrArticle(word)) return false;
    if (GENERIC_ORG_WORDS.has(word.replace(WORD_STOPS, "").toLowerCase())) return false;
    for (const token of word.split(".")) {
      if (token === "" || INITIAL.test(token)) continue;
      if (!NAME_WORD.test(token)) return false;
      capitalised += 1;
    }
  }
  return capitalised <= 1;
}

/**
 * The providers that a provider cell names, as `cellOf` gives it, with the key of each, each key
 * once with the first spelling that gives it (rule N of the comment of this file).
 */
function providersOf(line: string): Array<{ key: string; name: string }> {
  // A sentence: it may name a supplier, and no name is guessed from it.
  if (line.length > NAME_MAX_CHARS) return [];
  // Brackets are cut out; ones that begin with a marker of a natural person (a title, or nothing but
  // post-nominals) leave their mark in the piece that they belong to, since a title that follows a
  // name qualifies that name. Square brackets that hold no marker stay as text.
  const text = line
    .replace(ADDRESSES, " ")
    .replace(PARENTHETICALS, (brackets) =>
      isMarkedBrackets(brackets.slice(1)) ? ` ${TITLE_BRACKETS} ` : " ",
    )
    .replace(SQUARE_BRACKETS, (brackets) =>
      isMarkedBrackets(brackets.slice(1)) ? ` ${TITLE_BRACKETS} ` : brackets,
    );
  // The pieces and the separators between them, in turn: piece, separator, piece, ...
  const parts = text.split(SEPARATORS);
  const pieces: Piece[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    const marked = parts[at].includes(TITLE_BRACKETS);
    // The piece as written, with its blanks closed up, and the name that it gives, with its ends
    // trimmed: a title is looked for in both, since the trim takes the full stop of "ing." and "bc."
    // that ends a piece.
    const written = parts[at].split(TITLE_BRACKETS).join(" ").replace(/\s+/g, " ").trim();
    const name = trimmed(written);
    const holds = marked || holdsMarker(name) || holdsMarker(written);
    pieces.push({
      name,
      marked,
      holds,
      isTitle:
        marked ||
        LEADING_TITLE.test(name) ||
        LEADING_TITLE.test(written) ||
        POST_NOMINAL_ONLY.test(name) ||
        POST_NOMINAL_ONLY.test(written),
      isPerson:
        holds && isPersonal(trimmed(written.replace(MARKER_WORDS, " ").replace(/\s+/g, " "))),
      afterComma: at > 0 && parts[at - 1] === ",",
    });
  }
  // The pieces that are a person's. A comma is what separates a surname from its title ("Voorbeeld,
  // dr. J."): the piece that a comma separates from a title is the person's and goes with it, whatever
  // it is. A title that stands after initials, or after more pieces ("Voorbeeld, J. dr.",
  // "Voorbeeld, Jan, dr."), takes with it the comma-separated pieces before it that are a person's, back
  // to a piece that is not (a legal form, an organisation word, two capitalised words) or that another
  // separator set apart: after another separator the title piece is another party, and this piece stays.
  const goes = pieces.map(() => false);
  pieces.forEach((piece, at) => {
    if (piece.isTitle && piece.afterComma) goes[at - 1] = true;
    if (!piece.isPerson) return;
    for (let back = at; back > 0 && pieces[back].afterComma; back -= 1) {
      if (!isPersonal(pieces[back - 1].name)) break;
      goes[back - 1] = true;
    }
  });
  const providers = new Map<string, string>();
  pieces.forEach((piece, at) => {
    const { name } = piece;
    if (name === "" || piece.marked || piece.holds || goes[at]) return;
    if (NOT_A_PROVIDER.test(name)) return;
    const key = compactName(shortName(name));
    if (key.length >= KEY_MIN_CHARS && !providers.has(key)) providers.set(key, name);
  });
  return [...providers].map(([key, name]) => ({ key, name }));
}

/** What the rows say of one provider, while they are read. */
interface Group {
  spellings: Map<string, number>;
  algorithms: number;
  bodies: Set<string>;
  bodyNames: Map<string, number>;
  status: Record<StatusKey, number>;
  highRisk: number;
  newest: string;
}

const newGroup = (): Group => ({
  spellings: new Map(),
  algorithms: 0,
  bodies: new Set(),
  bodyNames: new Map(),
  status: { inUse: 0, inDevelopment: 0, outOfUse: 0 },
  highRisk: 0,
  newest: "",
});

/** One description that names providers, as far as it is read. */
interface Description {
  status: StatusKey;
  highRisk: boolean;
  orgId: string;
  organization: string;
  published: string;
  providers: Array<{ key: string; name: string }>;
}

/**
 * Adds a description to the group of each provider it names, once for each; false when there are
 * too many providers.
 */
function addDescription(groups: Map<string, Group>, description: Description): boolean {
  for (const { key, name } of description.providers) {
    let group = groups.get(key);
    if (group === undefined) {
      if (groups.size >= MAX_PROVIDERS) return false;
      group = newGroup();
      groups.set(key, group);
    }
    group.algorithms += 1;
    group.status[description.status] += 1;
    if (description.highRisk) group.highRisk += 1;
    group.bodies.add(description.orgId);
    group.bodyNames.set(
      description.organization,
      (group.bodyNames.get(description.organization) ?? 0) + 1,
    );
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    if (description.published > group.newest) group.newest = description.published;
  }
  return true;
}

/** The entries of a count map, the largest count first and then by text, so that no order of rows decides. */
const byCountThenText = (counts: ReadonlyMap<string, number>): Array<[string, number]> =>
  [...counts].sort(([a, x], [b, y]) => y - x || compareText(a, b));

/**
 * The names of the bodies for the identifiers of a record: the first thirty of them by their
 * counts, each WHOLE (an identifier is never a cut text: a name is at most
 * ORGANIZATION_CELL_MAX units, since a longer one is no row to read), and no more than what of the
 * identifiers they may take as JSON (a name of quotes costs twice its length).
 */
function bodyNamesOf(counts: ReadonlyMap<string, number>): string[] {
  const names: string[] = [];
  let json = 2;
  for (const [name] of byCountThenText(counts)) {
    // The name, its quotes and the comma that follows it.
    const cost = JSON.stringify(name).length + 1;
    if (names.length >= BODY_NAMES_MAX || json + cost > BODY_NAMES_JSON_MAX) break;
    names.push(name);
    json += cost;
  }
  return names;
}

/** The row of a provider: every list in the order that never depends on the order of the file. */
function rowOf(key: string, group: Group): ProviderRow {
  const spellings = byCountThenText(group.spellings).map(([name]) => name);
  return {
    id: key,
    display: lineOf(spellings[0], DISPLAY_MAX),
    names: spellings.slice(0, NAMES_MAX),
    algorithms: group.algorithms,
    bodies: group.bodies.size,
    bodyNames: bodyNamesOf(group.bodyNames),
    status: group.status,
    highRisk: group.highRisk,
    newestPublished: group.newest,
  };
}

/** The id of an algorithm as its cell has it, or null when it is not eight digits. */
function idOf(cell: string): string | null {
  const id = lineOf(cell, ID_CELL_MAX);
  return ALGORITHM_ID.test(id) ? id : null;
}

const CUT: ReadResult<ProviderRow> = { rows: [], total: 0, unreadable: 0, complete: false };

/**
 * The providers of the register's CSV, or null when the file is not the list (no line feed at its
 * end, a header without one of the seven columns, fewer than MIN_ROWS data rows). A file that was
 * cut (a quote that was never closed, more than MAX_ROWS rows, a row of more than MAX_COLUMNS
 * cells, more than MAX_PROVIDERS providers) gives a read that says so, and the download fails as
 * too large, whatever else the file holds. A row that cannot be read is counted in `unreadable`.
 */
function read(fetched: Fetched): ReadResult<ProviderRow> | null {
  // The file ends with a line feed; a stream that was cut in a row has none.
  const bytes = fetched.buffers[0];
  if (bytes === undefined || bytes[bytes.length - 1] !== LINE_FEED) return null;

  // The header is one of the rows: one more than the data rows that the list may have.
  const table = readCsvText(textOf(fetched, 0), MAX_ROWS + 1, MAX_COLUMNS);
  if (!table.complete) return CUT;

  const [header] = table.rows;
  if (header === undefined) return null;
  const columns = columnsOf(header, WANTED);
  const total = table.rows.length - 1;
  if (columns === null || total < MIN_ROWS) return null;

  // The ids first: a row whose id another row holds too is unreadable, and so is that other row,
  // whichever comes first.
  const holders = new Map<string, number>();
  for (let at = 1; at < table.rows.length; at += 1) {
    const cells = cellsOf(table.rows[at], header.length);
    const id = cells === null ? null : idOf(cells[columns.id]);
    if (id !== null) holders.set(id, (holders.get(id) ?? 0) + 1);
  }

  const groups = new Map<string, Group>();
  let unreadable = 0;
  for (let at = 1; at < table.rows.length; at += 1) {
    const cells = cellsOf(table.rows[at], header.length);
    if (cells === null) {
      unreadable += 1;
      continue;
    }
    const id = idOf(cells[columns.id]);
    const status = STATUS_OF.get(lineOf(cells[columns.status], STATUS_CELL_MAX));
    const category = lineOf(cells[columns.category], CATEGORY_CELL_MAX);
    const published = dayText(
      lineOf(cells[columns.published], PUBLISHED_CELL_MAX).slice(0, DAY_CHARS),
    );
    // A body's name and id are keys and identifiers, and are never cut texts: one that
    // is empty or does not fit makes the row unreadable.
    const organization = cellWithin(cells[columns.organization], ORGANIZATION_CELL_MAX);
    const orgId = lineWithin(cells[columns.orgId], ORG_ID_CELL_MAX);
    if (
      id === null ||
      holders.get(id) !== 1 ||
      status === undefined ||
      !CATEGORIES.has(category) ||
      published === null ||
      organization === null ||
      orgId === null ||
      // `lineOf` reads a cell to LINE_INPUT_MAX units and, when the cell is longer, writes the cut
      // marker on the line that it read: a first megabyte of blanks after a name would read as a
      // provider named by the cut text. A cell that long is no cell to read, and it is counted.
      cells[columns.provider].length > LINE_INPUT_MAX
    ) {
      unreadable += 1;
      continue;
    }

    const line = cellOf(cells[columns.provider], PROVIDER_CELL_MAX);
    // The copyright page excludes an item that states a restriction: its description is left out.
    if (RESTRICTION.test(line)) continue;
    const providers = providersOf(line);
    if (providers.length === 0) continue;
    const description: Description = {
      status,
      highRisk: category === HIGH_RISK,
      orgId,
      organization,
      published,
      providers,
    };
    if (!addDescription(groups, description)) return CUT;
  }
  const rows = [...groups].map(([key, group]) => rowOf(key, group));
  return {
    rows,
    // A few rows may name many providers: the total is never below what was made of them.
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

const isDay = (value: unknown): value is string =>
  typeof value === "string" && dayText(value) === value;

/** Whether a row of a body is a row of this list: what `read` makes, and nothing else. */
function isProviderRow(value: unknown): value is ProviderRow {
  if (!isObject(value)) return false;
  const { id, display, names, algorithms, bodies, bodyNames, status, highRisk, newestPublished } =
    value;
  if (
    typeof id !== "string" ||
    typeof display !== "string" ||
    display.length > DISPLAY_MAX ||
    !isTexts(names, NAMES_MAX, NAME_MAX_CHARS) ||
    names.length < 1 ||
    !isCount(algorithms) ||
    algorithms < 1 ||
    !isCount(bodies) ||
    bodies < 1 ||
    bodies > algorithms ||
    !isTexts(bodyNames, BODY_NAMES_MAX, ORGANIZATION_CELL_MAX) ||
    bodyNames.length < 1 ||
    !isObject(status) ||
    !isCount(status.inUse) ||
    !isCount(status.inDevelopment) ||
    !isCount(status.outOfUse) ||
    !isCount(highRisk) ||
    !isDay(newestPublished)
  ) {
    return false;
  }
  const described = status.inUse + status.inDevelopment + status.outOfUse;
  return described === algorithms && highRisk <= algorithms;
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${NL_ALGORITMEREGISTER_RECORD_MARK} (${HOST}), a register or status list.`;

/** What a record is and is not; second, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "A record is Dutch public bodies' own descriptions of algorithms they use that name this " +
  "provider; it says nothing about the provider's conduct or the algorithms' quality, and the " +
  "Dutch government does not endorse it.";

/** The last sentence of every record, never cut and never left out: where the entry is from. */
const CLOSING_SENTENCE =
  "Source: Algoritmeregister van de Nederlandse overheid; adapted by VerifyWise.";

/** The counts by status as the text writes them: the statuses that no description is in are left out. */
function statusText(status: Record<StatusKey, number>): string {
  return [
    [status.inUse, "in use"],
    [status.inDevelopment, "in development"],
    [status.outOfUse, "out of use"],
  ]
    .filter(([count]) => count !== 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(", ");
}

/** The register's search for the provider, as written; a text that no address can hold is no record. */
function searchUrlOf(display: string): string {
  try {
    return `${SEARCH_URL}${encodeURIComponent(display)}`;
  } catch {
    throw new UnreadableEntry();
  }
}

/** A count with its noun: the noun is in the singular when the count is exactly one. */
const nounOf = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The record of a provider: the public bodies' own descriptions that name it. */
function recordFor(value: ProviderRow): ParsedRecord {
  if (!isProviderRow(value)) throw new UnreadableEntry();
  const row = value;
  const labelled =
    row.highRisk > 0
      ? `; ${row.highRisk} labelled high-risk AI system by the publishing body itself`
      : "";
  const counted =
    `${nounOf(row.algorithms, "algorithm description", "algorithm descriptions")} from ` +
    `${nounOf(row.bodies, "public body", "public bodies")} ${row.algorithms === 1 ? "names" : "name"} ` +
    `it (${statusText(row.status)})${labelled}.`;
  // The text shows the first bodies by their 40-unit form; the identifiers hold their whole names.
  const shown = row.bodyNames.slice(0, BODIES_SHOWN).map((name) => lineOf(name, BODY_SHOWN_CHARS));
  const more = row.bodies - shown.length;
  const published =
    `Published by ${shown.join(", ")}${more > 0 ? ` and ${nounOf(more, "other public body", "other public bodies")}` : ""}; ` +
    `newest published ${row.newestPublished}.`;

  return recordOf({
    id: row.id,
    type: "algorithm_register_supplier",
    title: `${NL_ALGORITMEREGISTER_RECORD_MARK}: ${row.display}`,
    summary: summaryWithClosing(
      [
        FIRST_SENTENCE,
        NOT_A_FINDING,
        sentence("Provider as written", row.display),
        counted,
        published,
      ],
      CLOSING_SENTENCE,
      RECORD_SUMMARY_MAX,
    ),
    url: searchUrlOf(row.display),
    identifiers: {
      provider: row.display,
      algorithms: row.algorithms,
      bodies: row.bodies,
      bodyNames: row.bodyNames,
    },
    names: row.names,
    // For their order only: a state is offered as of the copy, and its lookback is never applied.
    publishedAt: row.newestPublished,
    sourceUpdatedAt: null,
  });
}

/** The newest publication day of the rows, the version of the list; null when no row holds one. */
function newestDay(rows: readonly ProviderRow[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    const day: unknown = isObject(row) ? row.newestPublished : undefined;
    if (isDay(day) && (newest === null || day > newest)) newest = day;
  }
  return newest;
}

export const nlAlgoritmeregisterConnector: Connector = createFileConnector<ProviderRow>({
  id: "nl_algoritmeregister",
  version: 1,
  root: ROOT,
  sortKey: (row) => row.id,
  files: [{ url: FILE_URL, maxBytes: 33_554_432, contentTypes: ["text/csv"], timeoutMs: 180_000 }],
  pin: PIN,
  read,
  toRecords: (rows) => rows.map(recordFor),
  sourceVersion: newestDay,
});
