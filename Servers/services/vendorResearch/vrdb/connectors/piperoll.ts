/**
 * The PipeRoll Agent Incident Registry (piperoll.org) as a mirrored list of the vendor risk
 * database: one static JSON file of entries, each one editor's account of an incident involving an
 * AI agent. It is licensed (CC BY 4.0, its incidents/LICENSE) and complete by construction, but it
 * has NO vendor field: a company is named only in free text. So a record is one NAME and not one
 * entry, and a name comes from two rules measured on the real file:
 *
 * - Rule P, the operator: when `operator_type` begins with the word enterprise or startup, the head
 *   of its first parenthetical (`enterprise (Acme-operated SaaS, ...)` is Acme), if it is one token
 *   that holds a capital letter; a slash gives two names. The cell is read inside `read` and never
 *   kept: one cell of the real file holds an e-mail address and a nickname of third parties, and
 *   one an individual, whose category (`individual`) keeps it out of this rule.
 * - Rule B, the title: the words that have a lower-case letter followed later by a capital and no
 *   digit (OpenAI, GitHub, ChatGPT), but never a person-shaped one: a surname of the prefix shape (a
 *   prefix: Mc, Mac, De, Di, Da, La, Le, Van, Von, Du, Del, Dela, Der, Den, Ter, Ten, Fitz, San or
 *   St, then one or more capitalised parts, each a capital and lower-case letters: McZorb,
 *   DeLaZorb, VanDerZorb, McZorbJr, FitzZorb, and with one capital glued in front of it as the
 *   initial of a given name: JMcZorb) and an account handle (three or more lower-case letters
 *   before the first capital) are dropped, whoever they name (fail closed, no exception
 *   and no list of company names; a company that the operator cell names still has its key by rule
 *   P). LaMDA, DeepSeek and MacroZorb have neither shape. A word that a letter touches (an accented
 *   letter, a letter of another script, a combining mark) is the stub of a longer word, which the
 *   ASCII reader of a title stopped at (`MacZ` of an accented `MacZorb`): it is never a name.
 *   Single-capital words (Edge, Claude), acronyms (HTTP) and model versions (GPT-5) are never names,
 *   because they are also ordinary words and other companies' names. Only the part before a hyphen
 *   or an apostrophe gives a name (`QuarkHub-driven`, `QuarkHub's`, `QuarkHub'McZorb`: an
 *   apostrophe joins the parts of a word as a hyphen does, so `O'McZorb` gives `O`, no name, and
 *   `Mc'Zo'rb`, whose compact form is that of `McZorb`, gives none). In a case caption ("<party>
 *   v. <company>"; the separator is v, v., vs or vs. in any letter case, with a blank on each side)
 *   the text before the first separator is dropped: it is the first party, a natural person
 *   in every caption of the real file. A title that was cut (it ends in the mark of a cut: the
 *   reader keeps TITLE_READ_CHARS units) is read without its last word, which may be a fragment,
 *   and no fragment is a separator.
 *
 * A natural person is kept out of the keys as far as the rules can tell: the individual operators
 * are out by category, a case caption's first party is out by the caption rule, the person shapes of
 * a title word are out by shape, and a name is a token of letters and digits, never a full name with
 * a space. The names of persons in titles cannot be separated by a rule, so the shapes are all that
 * is done: another intercapped given name stays a residual of rule B, and it is a key (a lower-case
 * letter or two capitals glued in front of a surname: `jMcZorb`, `XYMcZorb`). An entry that gives no
 * name is "no entity": neither a record nor unreadable.
 *
 * Nor is a person a fragment of the text of a record. The title of each of the newest entries is
 * quoted in the text and kept in the stored row by one function (`quoteOf`): the text
 * before the first separator of a case caption is quoted as "A party" (the separator stays as it is
 * written), and each person-shaped part of a word as "[name]" (every part of a word is told, the
 * parts being cut at its hyphens and its apostrophes, so `ex-McZorb` is `ex-[name]`, `McZorb-owned`
 * is `[name]-owned` and `O'McZorb` is `O'[name]`, the possessive of a part going with it; the
 * digits at the two ends of a part are no part of a name, so `McZorb2024` is `[name]` and
 * `ex-2darkCoder` is `ex-[name]`, and a part of digits only, as in GPT-5 or 3D, is never one; a
 * stub of one with the longer word that a letter makes of it). A title that the reader cut is
 * quoted as far as it was read (the text before its last word, which may be the fragment of a name
 * that no rule can tell) and the mark of a cut, so that a replaced first party cannot leave room for
 * the fragment (`VanQ` of `VanQuorp`). Residuals, quoted as written: a person in the second
 * position of a caption, a person whose name has neither shape (JoAnn, joZorb, xXzorbXx, jMcZorb,
 * and two capitals glued in front of a surname, JPMcZorb), the other part of a double-barrelled name
 * of which one part only has a shape, a surname that apostrophes cut in the middle of its own
 * parts (`Mc'Zo'rb`: no key either, see rule B), digits inside a word (`McZorb2Quark`, `McZorb3D`:
 * only the digits at the ends of a part are taken off), a handle or a surname written wholly in
 * letters that the ASCII reader does not see (accented capitals and small letters, Cyrillic: no
 * word is read, so none is quoted as a name, and none is a key), a caption written with another word
 * (against, &, versus) or with no blank on a side, and the first party of a caption whose separator
 * the cut of a title to TITLE_READ_CHARS reached or went past. A product that is written like a
 * handle (macOS, openAI) is quoted as "[name]" and gives no key: fail closed.
 *
 * What is never read or kept: every prose field (root cause, locus, severity text, exploitation,
 * loss, confidence, telemetry, blast radius, the two dates that are prose, the status after its
 * first word, the editor's quotations of third parties), the three `*_key` fields that no record
 * uses, the `url` as written (it is checked against the id and the address of the record is built
 * from the id), the `operator_type` cell, and `aiid_incident_id`, the cross-reference to the AI
 * Incident Database, whose reuse needs its operator's permission: it is not even counted.
 *
 * Entries. An entry is unreadable when its id is not `PIR-YYYY-NNNN` or occurs twice (both are
 * left out: the file's order must never decide which survives), its status does not begin with
 * corroborated, corrected, disputed or withdrawn, its `url` is not the entry's own page, its title,
 * cause or severity is empty, its `sort_date` is no day, a month with day 00, or a year with month
 * and day 00 (41 of the 110 real dates are of the last two kinds; they are read as a precision and
 * a first day), or it gives a name whose compact form is over 160 characters. An entry that is
 * withdrawn counts nowhere. The unreadable ones are counted and left to the kit's allowance.
 *
 * The record of a name holds the counts by the registry's own status word and by severity key, the
 * first and last year, the newest three entries with their ids, dates at their precision, cause,
 * severity and title cut to 80, and the ids of the others (the record lists at most 100 ids). The
 * name in its identifiers is the first spelling WHOLE (an identifier is never a cut text; the
 * longest spelling that a cell can give, a dotted operator head of about 280 units, keeps the
 * identifiers under their budget even with 100 ids); the title and the text of the record show it
 * cut to 60.
 * Every sort has a full tie-break (day, then id; spelling count, then the order of the
 * characters), so the order of the file decides nothing. It is a weak, UNVERIFIED list (one
 * editor): a record never says that a company caused an incident; it says that the registry's
 * entries name it.
 *
 * Limits, with the kit's reading of them: a root that is no object, a `records` that
 * is no array or is empty, or fewer than 50 readable entries is not the list; more than 5,000
 * entries is a file too large to read whole (`complete` is false, and the download fails as too
 * large, never as a shorter list); entries that do not read are counted for the kit's allowance.
 */
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import { SHORTENED, compareText, dayText, endsCut, isObject, lineOf } from "./kit/clean";
import {
  type Fetched,
  type ListSpec,
  type ReadResult,
  createFileConnector,
} from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const PIPEROLL_RECORD_MARK = "PipeRoll Agent Incident Registry";

const FILE_URL = "https://piperoll.org/registry.json";
/** The page of an entry is this and the number of its id (`PIR-2026-0045` is `2026-0045/`). */
const PAGE_BASE = "https://piperoll.org/pir/";
/** The registry is 280 KB today: the limit is fifteen times that. */
const MAX_BYTES = 4_194_304;
const TIMEOUT_MS = 60_000;
/** More entries than this is not read: the registry has 110. */
const MAX_RECORDS = 5_000;
/** Fewer readable entries than this is not the registry. */
const MIN_READABLE = 50;

/** The longest compact name that is an id: the id of a record is its name. */
const MAX_KEY_CHARS = 160;
/** The shortest compact name that is a key (keys.ts: a shorter one matches no list). */
const MIN_KEY_CHARS = 4;
const TITLE_READ_CHARS = 300;
const TITLE_SHOWN_CHARS = 80;
const NAME_SHOWN_CHARS = 60;
const CAUSE_CHARS = 30;
const SEVERITY_CHARS = 20;
const STATUS_READ_CHARS = 64;
const DATE_READ_CHARS = 32;
const SPELLINGS_MAX = 5;
const NEWEST_SHOWN = 3;
const OTHER_IDS_SHOWN = 6;
const IDS_MAX = 100;

const ENTRY_ID = /^PIR-\d{4}-\d{4}$/;
const STATUS_WORD = /^(corroborated|corrected|disputed|withdrawn)\b/;
const SORT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The longest operator cell that is read; the longest of the real file is 237 characters. */
const OPERATOR_READ_CHARS = 300;
/** The category of an operator that rule P reads: a word, and no letter after it. */
const OPERATOR_CATEGORY = /^(?:enterprise|startup)(?!\p{L})/u;
/**
 * The head of an operator: one token of letters, digits, dots and ampersands that begins with a
 * letter, or two of them joined by a slash, and one of the registry's words after it.
 */
const OPERATOR_HEAD =
  /^([A-Za-z][A-Za-z0-9.&]*(?:\/[A-Za-z][A-Za-z0-9.&]*)?)(?:-operated| as provider|-built and -distributed|-built|-operated SaaS)?$/;
/**
 * The separator of a case caption: v, v., vs or vs., in any letter case, with a blank on each
 * side (a no-break space or a tab as well: a cell is cleaned to single blanks before it is read, so
 * only a blank is left). The text before the FIRST separator is the first party. A caption that is
 * written with another word (against, &, versus) or with no blank on a side is no caption here.
 */
const CASE_CAPTION = /\s(?:v|vs)\.?\s/i;
/** What a cut line ends with (kit/clean.ts): a title that carries it was cut, and its last word may be a fragment. */
const CUT_MARK = SHORTENED.trimStart();
/** The right single quotation mark, which a title writes as an apostrophe (U+2019). */
const RIGHT_QUOTE = String.fromCodePoint(0x2019);
/** A word of a title: letters and digits, and hyphens or apostrophes between the parts. */
const TITLE_TOKEN = new RegExp(`[A-Za-z][A-Za-z0-9]*(?:[-'${RIGHT_QUOTE}][A-Za-z0-9]+)*`, "g");
/** What joins the parts of a word: a hyphen, or either apostrophe. */
const PART_JOINER = new RegExp(`[-'${RIGHT_QUOTE}]`);
const POSSESSIVE = new RegExp(`['${RIGHT_QUOTE}]s$`);
/** One digit of any script, as one code point (`withoutEndDigits`). */
const DIGIT = /\p{N}/u;
/**
 * A surname of the prefix shape: a prefix, then one or more capitalised parts that each have a
 * lower-case letter (McZorb, DeLaZorb, VanDerZorb, McZorbJr, FitzZorb), with one capital glued in
 * front of it as the initial of a given name (JMcZorb). A capital that no lower-case letter
 * follows ends the shape (LaMDA, McZorbZ), and so does a prefix that goes on in lower case (DeepSeek,
 * MacroZorb); two capitals in front are no one initial.
 */
const SURNAME_SHAPE =
  /^[A-Z]?(?:Mc|Mac|De|Di|Da|La|Le|Van|Von|Du|Del|Dela|Der|Den|Ter|Ten|Fitz|San|St)(?:[A-Z][a-z]+)+$/;
/** An account handle: three or more lower-case letters before the first capital. */
const HANDLE_SHAPE = /^[a-z]{3,}[A-Z]/;
/**
 * One code point that is a letter or a combining mark. A class followed by `$` is not used for it: it
 * does not match a letter of two UTF-16 units at the end of a text in every version of V8.
 */
const LETTER_OR_MARK = /^(?:\p{L}|\p{M})$/u;
/** A word as any script writes it: letters, marks and digits, joined by hyphens and apostrophes. */
const UNICODE_WORD = new RegExp(
  `[\\p{L}\\p{M}\\p{N}]+(?:[-'${RIGHT_QUOTE}][\\p{L}\\p{M}\\p{N}]+)*`,
  "gu",
);
/** What a quote shows in place of the first party of a case caption, and of a person-shaped word. */
const PARTY_MARK = "A party";
const NAME_MARK = "[name]";

/** The severity words of the registry, in the order a text lists them. */
const SEVERITY_WORDS = ["catastrophic", "loss", "degraded", "near-miss"] as const;
type SeverityWord = (typeof SEVERITY_WORDS)[number];

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${PIPEROLL_RECORD_MARK} (piperoll.org), an AI incident list.`;
/** The second: what an entry is and is not. It comes early, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "Each entry is one editor's account of an incident involving an AI agent, not a finding of any " +
  "authority, and naming a company in an entry does not say that it caused the incident.";
/** The last: the licence's credit, which no cut of a long text may take. */
const SOURCE_SENTENCE =
  "Source: PipeRoll, CC BY 4.0; titles shortened and edited, and entries counted, by VerifyWise.";

type StatusWord = "corroborated" | "corrected" | "disputed";

/** What is kept of an entry that gives a name: no cell but these, and no cell as it was written. */
interface Entry {
  id: string;
  title: string;
  /** The day of the entry, `YYYY-MM-DD`: the first day when the registry gives a month or a year. */
  day: string;
  /** The date as the registry gives it: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
  dateText: string;
  status: StatusWord;
  cause: string;
  severity: string;
  /** The names that the entry shows, each as written, at least four compact characters. */
  names: string[];
}

/** An entry of the newest three of a name. */
interface NewestEntry {
  id: string;
  dateText: string;
  cause: string;
  severity: string;
  disputed: boolean;
  /** The title as the text quotes it (`quoteOf`: no first party, no person-shaped word), cut to what it shows. */
  title: string;
}

/** What the file says of one name: the row of the snapshot, and the record that it makes. */
interface NameRow {
  /** The compact name: the id of the record. */
  id: string;
  /** The spelling shown: the most frequent, a tie by the order of the characters. */
  display: string;
  /** The spellings, at most five, in the same order. */
  names: string[];
  entries: number;
  corroborated: number;
  corrected: number;
  disputed: number;
  severity: Record<SeverityWord, number>;
  firstYear: string;
  lastYear: string;
  newest: NewestEntry[];
  /** The ids of the other entries, newest first: as many as fit with the newest ones in IDS_MAX ids. */
  otherIds: string[];
  /** The day of the newest entry. */
  publishedAt: string;
}

type Reading = { kind: "entry"; entry: Entry } | { kind: "withdrawn" } | { kind: "unreadable" };

const UNREADABLE: Reading = { kind: "unreadable" };

/**
 * The date of an entry as a day and as the registry gives it. A real day is itself; a month with
 * day 00 is its first day, shown as the month; a year with month and day 00 is its first day, shown
 * as the year. Anything else (a month above 12, a day that does not exist, a day with a month of
 * 00, another form) is none.
 */
function sortDateOf(value: unknown): { day: string; text: string } | null {
  const match = SORT_DATE.exec(lineOf(value, DATE_READ_CHARS));
  if (match === null) return null;
  const [, year, month, day] = match;
  const first =
    month === "00" && day === "00"
      ? `${year}-01-01`
      : day === "00"
        ? `${year}-${month}-01`
        : `${year}-${month}-${day}`;
  if (dayText(first) !== first) return null;
  if (month === "00" && day === "00") return { day: first, text: year };
  if (day === "00") return { day: first, text: `${year}-${month}` };
  return { day: first, text: first };
}

/**
 * The names of the operator (rule P). The cell must begin with the word enterprise or startup (a
 * non-letter after it): an individual's cell never gives a name. The head is the part of the first
 * parenthetical before its first comma or semicolon, and it must be one token with a capital letter
 * and the usual words of the registry after it (`Acme-operated SaaS`, `Acme as provider`, ...); a
 * slash splits two names (`YouTube/Google`). The cell is cleaned first, so a character nobody sees
 * cannot hide the category, and nothing of it is kept but these names.
 */
function operatorNames(operatorType: unknown): string[] {
  const cell = lineOf(operatorType, OPERATOR_READ_CHARS);
  if (!OPERATOR_CATEGORY.test(cell)) return [];
  const open = cell.indexOf("(");
  if (open === -1) return [];
  const close = cell.indexOf(")", open + 1);
  const inside = cell.slice(open + 1, close === -1 ? undefined : close);
  const head = OPERATOR_HEAD.exec(inside.split(/[,;]/, 1)[0].trim())?.[1];
  return head !== undefined && /[A-Z]/.test(head) ? head.split("/") : [];
}

/**
 * Whether a word has a lower-case letter and, later in it, a capital (ASCII on purpose: the cell is
 * folded first). It is a shape and says nothing of whom the word names: a surname and a handle have
 * it as well, which `isPersonShaped` takes out.
 */
function isBrandShaped(word: string): boolean {
  let lower = false;
  for (const char of word) {
    if (char >= "a" && char <= "z") lower = true;
    else if (lower && char >= "A" && char <= "Z") return true;
  }
  return false;
}

/**
 * Whether a word has one of the two shapes by which a title word is taken for a person's: a surname
 * with a prefix, and one capital glued in front of it as an initial (McBlorn, DeLaBlorn, JMcBlorn:
 * `SURNAME_SHAPE`) or an account handle (darkBlorn: `HANDLE_SHAPE`). Words with one lower-case
 * letter first (iPhone, eBay, xAI, iRobot), words whose prefix letters are followed by lower case,
 * not by a capital (DeepBlorn, MacroBlorn), and words with capitals after the prefix that no
 * lower-case letter follows (LaMDA) have neither shape.
 */
function isPersonShaped(word: string): boolean {
  return SURNAME_SHAPE.test(word) || HANDLE_SHAPE.test(word);
}

/** A part of a word with the possessive that ends it taken off: the possessive belongs to its part. */
const withoutPossessive = (part: string): string => part.replace(POSSESSIVE, "");

/**
 * What a key is made of in a token: the part before its first hyphen or apostrophe (an
 * apostrophe joins parts as a hyphen does, so `O'McZorb` gives `O` and `QuarkHub's` gives `QuarkHub`).
 */
const baseOf = (token: string): string => token.split(PART_JOINER)[0];

/** A word of a title as the ASCII reader of it sees it. */
interface TitleWord {
  /** Where the word begins and ends in the text. */
  start: number;
  end: number;
  /** The word as `baseOf` makes it: what a key is made of, and what its shapes are told of. */
  base: string;
  /**
   * Whether a letter or a combining mark touches the word. The reader sees ASCII only, so it stopped
   * at an accented letter or a letter of another script: this is the stub of a longer word (`MacZ` of
   * an accented `MacZorb`), and no word of its own.
   */
  stub: boolean;
}

function titleWords(text: string): TitleWord[] {
  const words: TitleWord[] = [];
  for (const match of text.matchAll(TITLE_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Two units are the most that a code point takes, on either side of the word.
    const before = [...text.slice(Math.max(0, start - 2), start)].pop();
    const [after] = text.slice(end, end + 2);
    words.push({
      start,
      end,
      base: baseOf(match[0]),
      stub:
        (before !== undefined && LETTER_OR_MARK.test(before)) ||
        (after !== undefined && LETTER_OR_MARK.test(after)),
    });
  }
  return words;
}

/**
 * The part of a title that is read for a caption and for names: the title whole when it
 * fits, and, when it ends in the cut mark (it was cut by the reader, which keeps TITLE_READ_CHARS
 * units, or by the layer that wrote it), the text before its last word. That word may be a
 * fragment of a longer one (`VanQ` of `VanQuorp`, `ZetaCh` of `ZetaChat`), and a cut cannot be told
 * from one that fell after a blank (the line is trimmed before the mark), so it is never read: no
 * key is made of a cut text, and no fragment is the v of a caption (the real registry has a title
 * cut after the first letter of a word that begins with v). It is a prefix of the title.
 */
function readPart(title: string): string {
  if (!endsCut(title)) return title;
  const read = title.slice(0, -CUT_MARK.length);
  const last = [...read.matchAll(TITLE_TOKEN)].pop();
  return last === undefined ? read : read.slice(0, last.index ?? 0);
}

/**
 * The names of a title (rule B): its brand-shaped words with no digit, the part before a hyphen
 * only, a possessive of that part taken off, and no word that is person-shaped and none that a
 * letter touches (`TitleWord.stub`). In a case caption the text before the first separator
 * (`CASE_CAPTION`) is left out: it is the first party, a natural person in every caption of the
 * real file. A cut title is read without its last word (`readPart`); the first party of a caption
 * whose separator the cut reached or went past is read, all but its last word: no rule can see a
 * separator that is not there.
 *
 * Persons are told apart from companies ONLY by the two shapes of `isPersonShaped`, and the rule
 * fails closed: there is no exception and no list of company names, so a company whose name in a
 * title has such a shape, or has a letter of another kind beside it, gets no key from that title (it
 * still gets one when the registry names it as an operator: rule P). The names
 * of persons in titles cannot be separated by a rule; an intercapped given name that has neither
 * shape stays a residual of this rule.
 */
function titleNames(title: string): string[] {
  const read = readPart(title);
  const caption = CASE_CAPTION.exec(read);
  const text = caption === null ? read : read.slice(caption.index + caption[0].length);
  const names: string[] = [];
  for (const { base, stub } of titleWords(text)) {
    if (!stub && isBrandShaped(base) && !/\d/.test(base) && !isPersonShaped(base)) names.push(base);
  }
  return names;
}

/**
 * A text with each cased letter that is not ASCII written as an ASCII one of its case (a capital as
 * X, a small letter as x) and each combining mark as nothing (it belongs to the letter before it),
 * so that the shapes can be told of a longer word that the ASCII reader cut. Whatever else is not
 * ASCII stays, a letter with no case (CJK, Arabic) among it: it is no small letter, so three of
 * them before a capital are no handle, and no shape has it.
 */
function asciiFold(text: string): string {
  return text.replace(/\P{ASCII}/gu, (char) => {
    if (/\p{M}/u.test(char)) return "";
    if (/\p{Lu}/u.test(char)) return "X";
    return /\p{Ll}/u.test(char) ? "x" : char;
  });
}

/**
 * Whether the units at `unit`, the place of a joiner in a word that ends at `end`, are the possessive
 * that ends a hyphenated part: `'s` or its twin, then a hyphen or the end of the word. A word never
 * ends in a joiner (the readers of a title see to that), so `unit + 1` is in the word.
 */
const isPossessiveAt = (text: string, unit: number, end: number): boolean =>
  (text[unit] === "'" || text[unit] === RIGHT_QUOTE) &&
  text[unit + 1] === "s" &&
  (unit + 2 === end || text[unit + 2] === "-");

/**
 * The parts of a word between its hyphens and its apostrophes, each as the range of units it
 * takes in the text. The possessive that ends a hyphenated part belongs to the last part before it
 * and is no part of its own: `McZorb's` is one part, and `O'McZorb's` is two, `O` and `McZorb's`.
 */
function partsOf(text: string, start: number, end: number): Array<[number, number]> {
  const parts: Array<[number, number]> = [];
  let from = start;
  let unit = start;
  while (unit <= end) {
    if (unit < end && !PART_JOINER.test(text[unit])) {
      unit += 1;
    } else if (unit < end && isPossessiveAt(text, unit, end)) {
      parts.push([from, unit + 2]);
      from = unit + 3;
      unit += 3;
    } else {
      parts.push([from, unit]);
      from = unit + 1;
      unit += 1;
    }
  }
  return parts;
}

/**
 * A part without the digits at its two ends: `McZorb2024` is a surname and a year, `2darkCoder`
 * a handle with a number in front. A part of digits only is left empty, and no shape has it: a digit
 * is never a name (GPT-5, 3D). Digits inside a part stay (`McZorb2Quark` is no shape: a residual).
 */
function withoutEndDigits(part: string): string {
  const chars = [...part];
  let from = 0;
  let to = chars.length;
  while (from < to && DIGIT.test(chars[from])) from += 1;
  while (to > from && DIGIT.test(chars[to - 1])) to -= 1;
  return chars.slice(from, to).join("");
}

/**
 * Whether a part of a word is person-shaped: its letters written in ASCII, its possessive off, and
 * the digits at its ends off, in that order (`McZorb2's` is `McZorb`).
 */
const isPersonPart = (part: string): boolean =>
  isPersonShaped(withoutEndDigits(withoutPossessive(asciiFold(part))));

/**
 * The text with each person-shaped part of a word written as NAME_MARK (every part of a
 * hyphenated word is told, not the part before the first hyphen only): the part whole, its
 * possessive with it, and the hyphens and the other parts stay (`ex-McZorb` is `ex-[name]`,
 * `McZorb-owned` is `[name]-owned`). A stub is judged in the whole longer word that the letters
 * beside it make (`UNICODE_WORD`), part by part, with its letters written in ASCII (`asciiFold`),
 * and a part of it that the stub itself shows as person-shaped is written over whole as well: fail
 * closed, so that no part of an accented name is left in the quote.
 */
function withoutNames(text: string): string {
  const longer = [...text.matchAll(UNICODE_WORD)].map((match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });
  // The units of the text that a name covers. Names that overlap or touch are one, and are written
  // once. A title is read to TITLE_READ_CHARS units, so a scan finds the longer word of a stub.
  const covered = new Uint8Array(text.length);
  // The words to judge, each once: a word that no letter touches stands for itself, and the stubs
  // that lie in one longer word are judged in it together, whatever their number, with the parts
  // that the ASCII reader saw of them. A plain word and a longer word can begin at the same unit
  // (`ex` and `ex-` + an accented letter + `McZorb`), so a word is told by its start and its end.
  const judged = new Map<string, { start: number; end: number; seen: Array<[number, number]> }>();
  for (const word of titleWords(text)) {
    // A stub lies in one longer word, which begins at or before it and ends after it.
    const whole = word.stub
      ? (longer.find((span) => span.start <= word.start && word.start < span.end) ?? word)
      : word;
    const key = `${whole.start}:${whole.end}`;
    const entry = judged.get(key) ?? { start: whole.start, end: whole.end, seen: [] };
    if (word.stub) entry.seen.push(...partsOf(text, word.start, word.end));
    judged.set(key, entry);
  }
  for (const { start, end, seen } of judged.values()) {
    for (const [from, to] of partsOf(text, start, end)) {
      const shaped =
        isPersonPart(text.slice(from, to)) ||
        seen.some(([a, b]) => a < to && from < b && isPersonPart(text.slice(a, b)));
      if (shaped) covered.fill(1, from, to);
    }
  }
  let quoted = "";
  for (let unit = 0; unit < text.length; unit += 1) {
    if (covered[unit] === 0) quoted += text[unit];
    else if (unit === 0 || covered[unit - 1] === 0) quoted += NAME_MARK;
  }
  return quoted;
}

/**
 * A title as the text of a record quotes it and its stored row keeps it: the text
 * before the first separator of a case caption (`CASE_CAPTION`) is "A party" (the first party is a
 * natural person in every caption of the real file) and the separator stays as it is written, each
 * person-shaped part of a word is "[name]" (`withoutNames`), and then the line is cut to what the
 * text shows. The cut comes last, so that no part of a name is left at it. A title that was cut (it
 * ends in the mark) is quoted as far as it was read, the part before its last word (`readPart`),
 * and the mark: the last word may be the fragment of a name that no rule can tell (`VanQ`), and a
 * replaced first party can leave the quote short enough to show it. A pure function of the title, so
 * that the order of the entries decides nothing.
 */
function quoteOf(title: string): string {
  const read = readPart(title);
  const caption = CASE_CAPTION.exec(read);
  const quoted =
    caption === null
      ? withoutNames(read)
      : `${PARTY_MARK}${withoutNames(read.slice(caption.index))}`;
  // The mark follows what was read, as the kit writes a cut line: `lineOf` closes the blanks, so one
  // blank stands before it, or none when nothing was read.
  return lineOf(endsCut(title) ? `${quoted}${SHORTENED}` : quoted, TITLE_SHOWN_CHARS);
}

/**
 * The names that an entry shows, each as written, of four compact characters or more; null when
 * one is longer than an id may be (a token of 200 letters is no name, and the entry is not one the
 * reader can use).
 */
function namesOf(title: string, operatorType: unknown): string[] | null {
  const names: string[] = [];
  for (const name of [...operatorNames(operatorType), ...titleNames(title)]) {
    const key = compactName(name);
    if (key.length > MAX_KEY_CHARS) return null;
    if (key.length >= MIN_KEY_CHARS) names.push(name);
  }
  return names;
}

/** The entry that an item of the file is, or why it is none. */
function readEntry(item: unknown, occurrences: ReadonlyMap<string, number>): Reading {
  if (!isObject(item)) return UNREADABLE;
  const { id } = item;
  if (typeof id !== "string" || !ENTRY_ID.test(id) || (occurrences.get(id) ?? 0) > 1) {
    return UNREADABLE;
  }
  const statusWord = STATUS_WORD.exec(lineOf(item.status, STATUS_READ_CHARS))?.[1];
  if (statusWord === undefined) return UNREADABLE;
  // A withdrawn entry counts nowhere, so nothing else of it is read.
  if (statusWord === "withdrawn") return { kind: "withdrawn" };

  // The page of the entry is the entry's own: it is checked, and the record's address is built.
  const number = id.slice("PIR-".length);
  if (item.url !== `pir/${number}/` && item.url !== `/pir/${number}/`) return UNREADABLE;
  const title = lineOf(item.title, TITLE_READ_CHARS);
  const cause = lineOf(item.cause_key, CAUSE_CHARS);
  const severity = lineOf(item.severity_key, SEVERITY_CHARS);
  const date = sortDateOf(item.sort_date);
  if (title === "" || cause === "" || severity === "" || date === null) return UNREADABLE;
  const names = namesOf(title, item.operator_type);
  if (names === null) return UNREADABLE;
  return {
    kind: "entry",
    entry: {
      id,
      title,
      day: date.day,
      dateText: date.text,
      status: statusWord as StatusWord,
      cause,
      severity,
      names,
    },
  };
}

/** What the entries that show one name come to. */
interface Group {
  entries: Entry[];
  /** How many entries write the name each way (once for an entry, whatever the times it is written). */
  spellings: Map<string, number>;
}

/** The entries of each name: an entry counts once for each distinct name that it shows. */
function groupsOf(entries: readonly Entry[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    const counted = new Set<string>();
    for (const name of new Set(entry.names)) {
      const key = compactName(name);
      let group = groups.get(key);
      if (group === undefined) {
        group = { entries: [], spellings: new Map() };
        groups.set(key, group);
      }
      group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
      if (!counted.has(key)) {
        counted.add(key);
        group.entries.push(entry);
      }
    }
  }
  return groups;
}

/** The newest first: the later day, and of one day the greater id. */
const newestFirst = (a: Entry, b: Entry): number =>
  compareText(b.day, a.day) || compareText(b.id, a.id);

function rowOf(id: string, group: Group): NameRow {
  const entries = [...group.entries].sort(newestFirst);
  const names = [...group.spellings.keys()].sort(
    (a, b) => (group.spellings.get(b) ?? 0) - (group.spellings.get(a) ?? 0) || compareText(a, b),
  );
  const severity: Record<SeverityWord, number> = {
    catastrophic: 0,
    loss: 0,
    degraded: 0,
    "near-miss": 0,
  };
  let corroborated = 0;
  let corrected = 0;
  let disputed = 0;
  let firstYear = entries[0].day.slice(0, 4);
  let lastYear = firstYear;
  for (const entry of entries) {
    if (entry.status === "corroborated") corroborated += 1;
    else if (entry.status === "corrected") corrected += 1;
    else disputed += 1;
    const word = SEVERITY_WORDS.find((candidate) => candidate === entry.severity);
    if (word !== undefined) severity[word] += 1;
    const year = entry.day.slice(0, 4);
    if (year < firstYear) firstYear = year;
    if (year > lastYear) lastYear = year;
  }
  return {
    id,
    display: names[0],
    names: names.slice(0, SPELLINGS_MAX),
    entries: entries.length,
    corroborated,
    corrected,
    disputed,
    severity,
    firstYear,
    lastYear,
    newest: entries.slice(0, NEWEST_SHOWN).map((entry) => ({
      id: entry.id,
      dateText: entry.dateText,
      cause: entry.cause,
      severity: entry.severity,
      disputed: entry.status === "disputed",
      title: quoteOf(entry.title),
    })),
    otherIds: entries.slice(NEWEST_SHOWN, IDS_MAX).map((entry) => entry.id),
    publishedAt: entries[0].day,
  };
}

function read(fetched: Fetched): ReadResult<NameRow> | null {
  const root = jsonOf(textOf(fetched, 0));
  if (!isObject(root)) return null;
  const items: unknown = root.records;
  if (!Array.isArray(items) || items.length === 0) return null;
  // More entries than the registry can hold is no list to read whole: it is too large, and the
  // reader gives none of it rather than a part.
  const more = items.length > MAX_RECORDS;
  if (more) return { rows: [], total: items.length, unreadable: 0, complete: !more };

  const occurrences = new Map<string, number>();
  for (const item of items) {
    const id = isObject(item) ? item.id : undefined;
    if (typeof id === "string" && ENTRY_ID.test(id))
      occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  }
  const entries: Entry[] = [];
  let unreadable = 0;
  for (const item of items) {
    const reading = readEntry(item, occurrences);
    if (reading.kind === "unreadable") unreadable += 1;
    else if (reading.kind === "entry") entries.push(reading.entry);
  }
  if (items.length - unreadable < MIN_READABLE) return null;

  const rows = [...groupsOf(entries)].map(([id, group]) => rowOf(id, group));
  return {
    rows,
    // An entry can show several names: the total is no less than the rows and the entries that did not read.
    total: Math.max(items.length, rows.length + unreadable),
    unreadable,
    complete: !more,
  };
}

/** The sentence of the severity counts of a name; nothing when no entry has a severity of the four. */
function severitySentence(row: NameRow): string {
  const parts = SEVERITY_WORDS.filter((word) => row.severity[word] > 0).map(
    (word) => `${word} ${row.severity[word]}`,
  );
  return parts.length === 0 ? "" : `Severity as the registry rates it: ${parts.join(", ")}.`;
}

/**
 * A text without the full stops and blanks at its end, taken off one at a time (a pattern anchored
 * at the end would try every start of a run of them). A line of `lineOf` has single blanks only.
 */
function withoutStops(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === "." || text[end - 1] === " ")) end -= 1;
  return text.slice(0, end);
}

function newestLine(entry: NewestEntry): string {
  const facts = [entry.dateText, entry.cause, entry.severity];
  if (entry.disputed) facts.push("marked disputed");
  return `${entry.id} (${facts.join(", ")}): ${withoutStops(entry.title)}`;
}

function summaryOf(row: NameRow): string {
  const status = [
    `${row.corroborated} corroborated`,
    row.corrected > 0 ? `${row.corrected} corrected` : "",
    row.disputed > 0 ? `${row.disputed} marked disputed` : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
  const years =
    row.firstYear === row.lastYear ? row.firstYear : `${row.firstYear} to ${row.lastYear}`;
  const others = row.otherIds.slice(0, OTHER_IDS_SHOWN);
  const more = row.entries - NEWEST_SHOWN - others.length;
  return summaryWithClosing(
    [
      FIRST_SENTENCE,
      NOT_A_FINDING,
      sentence("Name in the entries", lineOf(row.display, NAME_SHOWN_CHARS)),
      `Entries that name it in the title or as the agent's operator: ${row.entries} (${status}), dated ${years}.`,
      severitySentence(row),
      `Newest: ${row.newest.map(newestLine).join("; ")}.`,
      others.length === 0
        ? ""
        : `Other entries: ${others.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`,
    ],
    SOURCE_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

function recordFor(row: NameRow): ParsedRecord {
  const newest = row.newest[0];
  if (newest === undefined) throw new UnreadableEntry();
  return recordOf({
    id: row.id,
    type: "agent_incidents",
    title: `${PIPEROLL_RECORD_MARK}: ${lineOf(row.display, NAME_SHOWN_CHARS)}`,
    summary: summaryOf(row),
    // The page of the newest entry, built from its id and never from a cell of the file.
    url: `${PAGE_BASE}${newest.id.slice("PIR-".length)}/`,
    identifiers: {
      // The whole spelling, never a cut one: an identifier is a name, and a cut text is none.
      name: row.names[0],
      entries: row.entries,
      // The newest entries and the others, which `rowOf` cut so that together they are at most IDS_MAX.
      ids: [...row.newest.map((entry) => entry.id), ...row.otherIds],
    },
    names: row.names,
    publishedAt: row.publishedAt,
    sourceUpdatedAt: null,
  });
}

const SPEC: ListSpec<NameRow> = {
  id: "piperoll",
  version: 1,
  root: "registry.json",
  sortKey: (row) => row.id,
  files: [
    {
      url: FILE_URL,
      maxBytes: MAX_BYTES,
      contentTypes: ["application/json"],
      timeoutMs: TIMEOUT_MS,
    },
  ],
  pin: { hosts: ["piperoll.org"] },
  read,
  toRecords: (rows) => rows.map(recordFor),
  sourceVersion: (rows) =>
    rows.reduce<string | null>(
      (newest, { publishedAt }) => (newest === null || publishedAt > newest ? publishedAt : newest),
      null,
    ),
};

export const piperollConnector: Connector = createFileConnector(SPEC);
