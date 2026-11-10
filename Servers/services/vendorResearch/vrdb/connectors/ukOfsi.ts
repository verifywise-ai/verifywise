/**
 * The enforcement notices of the UK Office of Financial Sanctions Implementation (OFSI, HM
 * Treasury) as a mirrored list of the vendor risk database: the notices of a monetary penalty and
 * the notices of a disclosure of a breach of UK financial sanctions, as GOV.UK publishes them. The
 * list has no file of its own. The GOV.UK Search API gives every document of the organisation
 * (guidance, general licences, news, reports, and the notices among them) in one answer of 249
 * results today, and the notices are the results whose `content_store_document_type` is `notice`
 * (19 today). The pager that the GOV.UK lists share asks the pages (at most two) and proves that
 * they are one search (`govukSearchPages`, `govukRowsOf`: kit-level checks of `total`, `start` and
 * the distinct links); this file reads the notices out of them.
 *
 * The record unit is the PARTY, not the notice. A notice names the party of a penalty or of a
 * disclosure, and a record is the notices that name one party (`compactName(shortName(party))`, so
 * that `Example Bank PLC` and `Example Bank Limited` are one party), with the newest three of them.
 * A record says that the list holds a notice that names the party, and that a notice is not a
 * designation: a penalty is OFSI's civil finding of a breach, and nothing in a record says that the
 * vendor did anything. The match is by the NAME alone (weak), and a name is read from text, so a
 * shape that is not known gives NO party and never a wrong one.
 *
 * What is read. Of a notice: its `title`, its `link`, its `public_timestamp`, and, only for a
 * disclosure notice whose title is a date, its `description` up to the end of the party list. The
 * link is kept for every notice but one that names a person (below). Nothing else is read or kept:
 * not the other documents, not the `format`, `display_type` or `first_published_at` that the
 * request asks for, not the rest of a description. The link is never a source of the party or of
 * the kind (a link that says `disclosure-notice` may be a penalty): the kind comes from the title.
 *
 * Where the party is. Rule 1, the title of a penalty: `Imposition of [a] monetary penalty`, a colon,
 * an en dash or a hyphen, then the party. Rule 2, the title of a disclosure that names its party:
 * `Disclosure notice`, a separator, then the party. Rule 3, the title of a disclosure that is a date
 * (`Disclosure notice: 08 September 2025`): the party is in the description, after `Disclosure
 * notice of an offence under financial sanctions by`, optionally `charities`, up to a bracket
 * alias or a spaced dash; the list is split at a comma and at the word and. A trailing bracket alias
 * (`(EBL)`, `(“EBL”)`) is cut from every party, and `London Branch` stays. A title of any other
 * kind (a joint statement of a task force) names no party, and is no failure.
 *
 * What is refused. A party that holds markup, has no letter, begins with a date, is nothing but
 * legal forms, begins with `and` (an Oxford comma), is an empty part, has a comma at its end, ends
 * in the mark of a cut (` [shortened]`: another layer cut it, and a name that is cut is no key) or
 * is longer than 150 characters, a title of more than 300 characters or one that ends in the mark,
 * a description of more than 1,000 characters or one that ends in the mark (a text that does not fit
 * is never read from its cut: `lineWithin`), and a notice of more than 25 parties, make the notice
 * UNREADABLE: it is counted (kit allowance), and nothing of it is kept. A party whose key
 * (`compactName(shortName(party))`, the id of its record) is longer than 120 units is refused the
 * same way: a key is never cut. A shape that only looks like the rule is never
 * repaired.
 *
 * Natural persons. The list publishes penalties on companies; OFSI's own page says that personal
 * data is excluded (Q52). A party that has the SHAPE of a person's name is dropped, with no trace
 * in the body or in a count. The shape is two to five words, each a name word or a one-letter
 * initial (with or without its dot), and at least one that is no initial. A name word is a capital
 * and lower-case letters (`Sample`; accents and the other scripts that have case too) or capitals
 * alone (`SAMPLE`), with hyphens and apostrophes inside it (`Sample-Lee`, `O'Sample`, `D'arcy`, and a
 * closing one, `Lanterns’`), and a capital inside it only after `Mc`, `Mac`, `De`, `Da`, `Di`,
 * `Du`, `La`, `Le`, `Van`, `Von`, `Fitz` or an apostrophe (`McSample`, `McSAMPLE`, `DeSample`). The
 * particles of a name (`de`, `van`, `von`, `bin`, `al`, `la`, `le`, `dos`, `y`, `zu` and the like:
 * see PARTICLES) may stand between two names, and an article that a hyphen joins may lead one
 * (`al-Sample`). A title leads the name and a suffix ends it, with or without its dot and in any
 * case (`Mrs. Casey Sample`, `Dr. Prof. Casey Sample`, `dr Sample`, `Casey Sample Jr.`, `Casey
 * Sample jr`: see HONORIFICS and SUFFIXES), and `St` is a word of a name anywhere (`Casey st
 * Sample`); one that stands elsewhere is no name word (`Casey mr Sample`, `Casey Sample mr`). A
 * role phrase does not hide a person: the lower-case words before a name (`its director Casey
 * Sample`) and a comma or a dash with lower-case words after it (`Casey Sample, owner`, `Casey
 * Sample - director`) are put aside, and the rest is read (a title that opens the one name that is
 * left stays: `its owner mr Sample`); a part that is made of the words of a role alone (`director`,
 * `its owner`) is no party and no person, and is left out of a list. A trailing role that is made
 * of legal forms alone is the company's, no role: one to three words, each of them
 * `ltd`, `inc`, `co`, `corp` or another of the list that the keys take off a name
 * (`isLegalFormOrArticle`; not the words `the`, `as` and `company`, which a role holds too:
 * `isLegalForm`), or the letters of one written apart (`s a`). `Example Sample, ltd`, `Example
 * Sample - co ltd` and `Example Sample, s a` stay one party, as `Example Sample, Ltd` does; a form
 * among other words is a part of a role (`Casey Sample, co owner`, `Casey Sample, ltd owner`,
 * `Casey Sample, owner of ltd`), and the person goes. A title that is a list reads a tail of forms
 * at its end as a part of the party before it, and a lower-case part in the middle of a list, or a
 * part of a description, is still a role. Never a person: a party with a legal form or with one of
 * the words of an organisation (Bank, Branch, Company, Group, Trust, Charity, Ministries,
 * Association, Services, Shipping, Trading, Management, Holdings, Payments, International,
 * Partners, Foundation) in any case, once the role is put aside; a party introduced by the word
 * `charities`; a name with a digit or a symbol, and one in a script that has no case. The rule
 * drops a real company now and then (one with no legal form and no such word, whose words look like
 * a name); the weakness is accepted because a person must never be a key. A party too short for any
 * name key (fewer than four letters and digits, with and without its legal form) is dropped as
 * well: no vendor can match it.
 *
 * The rest of the person rule. More forms end a company's name when they are its LAST word
 * (`Corporation`, `Incorporated`, `Corp`, `NV`, `SARL`, `Oy`, `KK`, `Kft`, `ASA`, `OOO`, `JSC`,
 * `PJSC`, `AB`, `LP`, and `Sdn Bhd` as its last two words: LAST_WORD_FORMS). More markers of a trade
 * name read as `t/a` does, in both positions (`d/b/a`, `dba`, `a/k/a`, `aka`, `f/k/a`, `fka`,
 * `n/k/a`, `nka`, `also known as`, `formerly known as`, `now known as`, `formerly`), and so do the
 * linkers that tie a person to a company (`owned by`, `operated by`, `managed by`, `run by`, `on
 * behalf of`, `acting for`, `acting on behalf of`); the joiners of a title and of a description
 * include `and/or`, `together with`, `as well as`, `plus`, `c/o`, `vs` and `versus`. `et al` ends a
 * name as a role word, and a legal form or a word of an organisation that a possessive follows
 * (`Example Ltd's director Casey Sample`) ends the company there. More titles lead a name (`Rt.
 * Hon.`, `The Hon.`, `Capt.`, `Col.`, `Fr.`, `Sr.`), more suffixes end it (`Esq.`, `PhD`, `Ph.D.`,
 * `Jnr.`, `Snr.`, `the younger`), a suffix that a comma sets apart in one slot (`Casey Sample, Jr.`,
 * `, MBE`, `, M.D.`) is a part of the name before it, and joined initials (`J.R.`, `Ph.D.`) are
 * initials in any position. One quote before and one after a word, and one pair round a whole part, a
 * side or the inside of a bracket, are taken off before the person test (`Ostrid "Orly" Orlenvy`);
 * U+02BC is an apostrophe and U+2212 a hyphen, `d'` and `l'` before a capital begin a name word, and
 * `abu`, `ben`, `ap` and `bat` are particles of a name.
 *
 * A title names one party, and is read as a list only where it holds a person: it is split at a
 * comma, at the word and (also after a comma: `, and`, the part is read without the and), at an
 * ampersand, a slash, a semicolon and the word with, each between blanks (a semicolon has its blank
 * after it only), and every part is read as a description's part is. It reads as a list when every
 * part has the shape of a person's name, or when a part with that shape comes after a part that
 * ends a name (with a legal form, also alone, or with a word of an organisation): `Example Ltd &
 * Casey Sample`. A description is split at a comma and at the word and whatever the parts are, and
 * then each of its parts is read as a title's slot is. A sole trader is read wherever it stands:
 * `t/a`, `T/A`, `trading as` and `trading under` (after a blank or a comma) divide a text into the
 * words before and after them, and a bracket that is no alias (an alias is two to eight capitals)
 * into the words outside it and inside it; a side that has the shape of a person's name is a
 * person, and the other sides stay parties (`Casey Sample t/a Example Services`, `Casey Sample
 * (Example Ltd)`). A bracket is one part: a comma, the word and or a dash inside it splits nothing,
 * its inside is read as a text of its own, and a bracket that a cut left open reads to the end of
 * the text. The persons are dropped and the other parts are the parties; one company that holds the
 * word and in that shape is recorded under its first part alone. A title that opens with the shape
 * and ends with a legal form (`Example Bread and Sons Ltd`), and a list whose company has neither a
 * legal form nor an organisation word, cannot be told from one name that holds the word and: it
 * stays one party. A notice that names a person next to a party shows its kind alone as its title,
 * for its own title may hold the name, and it has no page of its own in the list: GOV.UK makes the
 * end of the address of a page from its title, so the link is never kept (the body holds null for
 * it), and a record whose newest notice is such a notice shows the collection page of the list, the
 * `documentationUrl` of the list in sources.ts, as its `url`. Every other record shows the
 * page of its newest notice. Records that share the collection page never meet in a run: the
 * evidence pack keeps the first of two records with one address, and a lookup gives a run one
 * record of this list at most (MAX_RECORDS).
 *
 * What the person rule does not read (residuals). A person that comes first in a title's list
 * (`Casey Sample & Example Ltd`, with any joiner, and `Casey Sample, Example Ltd`) cannot be told
 * from one name that holds the joiner: the title stays one party; a description splits at a
 * comma and at the word and whatever the order, and reads the other joiners as a title does. A name
 * of one word is out of the rule of two to five words, so what is left of `Example Ltd and Casey`
 * stays in its party and its key. A name in a script that has no case, and the last name first
 * (`Sample, Casey`), are no person. A joiner with no blank around it, a bracket that is left
 * open before another bracket, `Mr and Mrs Casey Sample`, and a role that begins with a capital
 * (`Casey Sample, Director`) are not read either. A description is split at its commas before a
 * sole trader's marker is read, so a marker that follows a comma stays in front of its party
 * (`trading as Example Services`); a title reads it right. A role after a comma that holds a word
 * of an organisation or has five words or more (`Casey Sample, owner of the company`) is put aside
 * by a title of one slot, which drops the person; a description keeps that part as a party of its
 * own, for a role has four words at most and none of an organisation. A lower-case part of a list
 * is read as a role and left out, so a name that is written in lower case alone is lost from a
 * list. A tail of legal forms alone is the company's even when it is a role (`Casey Sample, co`,
 * for co-owner): the person stays in that party, and a title that is a list and ends so has no
 * person left and is one party (`Examplecorp Limited and Casey Sample, co`). A person with a
 * role and then a tail of forms (`Casey Sample, owner, co`) is one party too: the tail at the end
 * is the company's, and the role before it stays with the name. A description splits at its commas
 * before any tail is read and ends its list at a spaced dash, so no tail is read there outside a
 * bracket: `Example Sample, ltd` is unreadable, `Example Sample, corp` is the person alone (the
 * form is left out as a role), and `Example Sample - ltd` is the person before the dash, as with a
 * capital `Ltd`. The inside of a bracket is read as a title's slot, in a description too, so
 * `Examplecorp Limited (Casey Sample, corp)` is one party. The legal forms of this rule's own list
 * and of LAST_WORD_FORMS are fewer than those of the keys, so `Example Pty` and `Example Srl` are
 * still read as a person. The address of a
 * page is GOV.UK's: it keeps the path of a page when its document is retitled, so a notice that was
 * first published under a person's name and was retitled to a company keeps an address that holds
 * the name, and the record of the company shows it. A check of the address against the current
 * title was measured on the real list and not shipped: only some of the real addresses are the slug
 * of their title (8 of 19 today), so the check would hide the page of plain notices.
 *
 * More residuals of the person rule, listed so that nobody takes them for bugs. A joiner
 * that is not named above (`or`, `for`, `via`, `through`, `+` and any other) and a spaced dash of any
 * kind between a company and a person join them in a way that nothing tells apart from one name (3
 * titles and 10 descriptions of the real page hold a dash, and a split at it would break them). A
 * person's possessive before a company (`Casey Sample's Example Ltd`) is how real companies are
 * written (`Alden Brook's`), and a person that comes first before any joiner stays in one party.
 * A name of six words or more, counted with its titles, suffixes and particles, is kept. A company
 * whose only form is a bare `Co`, `AS` or `SAS` is read as a person and dropped, as one that ends
 * in a dotted form that no list names (`S.R.L.`, joined initials) is; a person whose last word is a
 * form of LAST_WORD_FORMS (`AB`, `Oy`, `LP`) is read as a company and kept. Two quotes in a row, a
 * quote inside a word, and a pair of quotes that a comma splits in a description (`"Casey Sample,
 * owner"`) are not taken off. The words that stand between a company and a linker stay with the
 * company (`Example Ltd wholly owned by Casey Sample` keeps `Example Ltd wholly`), and a side of a
 * trade-name marker that is in lower case alone (`Casey Sample t/a acme`) is left out as a role is.
 * A role word after a title (`Ms. director Casey Sample`) is not read, and a part that opens with
 * `and director` makes its notice unreadable. A bracket whose inside begins with `and` (`Example Ltd
 * (and director Casey Sample)`) stays in its party with the person, a name made of initials alone
 * (`J.R. K.L.`) is kept as a party, `et al` after a company (`Example Ltd et al`) stays in its party,
 * and a role in a bracket after a person (`Casey Sample (director)`) is kept as a party of its own.
 *
 * Days. A notice's day is the Europe/London calendar day of its `public_timestamp` (43 of the
 * timestamps are local midnight written in UTC, so the UTC day would be the day before in summer);
 * the clock is never read, so that the same list gives the same records on any day. The version of
 * the list is the newest day of its notices.
 *
 * What the reader counts. `total` is the notices read, and never fewer than the parties and the
 * notices that could not be read (a notice that names three charities makes three parties). A list
 * that gives fewer than twelve parties is not this list (it holds 19 and does not shrink: a parser
 * that broke would give few, and the kit's allowance of ten would hide it), and neither is one that
 * gives more than 2,000. The API sends no validator, so every sync downloads the list, and the hash
 * of the body (parties sorted, notices newest first) tells whether anything changed.
 */
import { isLegalFormOrArticle, shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import { nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { GOVUK_PIN, GOVUK_SITE, govukRowsOf, govukSearchPages } from "./govukSearch";
import {
  compareText,
  distinct,
  dayText,
  endsCut,
  instantText,
  lineOf,
  lineWithin,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { type Sleep, realSleep } from "./kit/pause";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UK_OFSI_RECORD_MARK = "UK OFSI financial sanctions enforcement notices";

/** The search of the organisation's documents, newest first; the page is asked at `start`. */
const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_organisations=office-of-financial-sanctions-implementation&count=1000&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=display_type&fields[]=first_published_at&start=";
const PAGE_SIZE = 1_000;
/** One page today (249 documents); a search that needs more than two is not the list this was built for. */
const MAX_PAGES = 2;
const MAX_BYTES = 4_194_304;
const TOTAL_TIMEOUT_MS = 60_000;

/** The type of the documents that are read. */
const NOTICE_TYPE = "notice";
/** Where the page of a notice is: the link must be under it, and have a slug. */
const PUBLICATION_PATH = "/government/publications/";
const LINK_MAX = 200;
/** What an address of a page may not hold: white space, controls, hidden characters, lone surrogates. */
const UNSAFE_LINK = /[\s\p{Cc}\p{Cf}\u{D800}-\u{DFFF}]/u;
/**
 * The page of the list itself: the collection of GOV.UK that holds the notices, which is the
 * `documentationUrl` of the list in sources.ts (the other connectors read theirs there too). A
 * record whose newest notice names a person shows this page, and never the notice's own.
 */
const COLLECTION_PAGE = vrdbSourceOf("uk_ofsi").documentationUrl;

/** The longest title and description that are read: the real ones are far shorter. */
const TITLE_MAX = 300;
const DESCRIPTION_MAX = 1_000;
/** The longest party: it is also the longest name that a record shows. */
const PARTY_MAX = 150;
const MAX_PARTIES_PER_NOTICE = 25;
const ITEM_TITLE_MAX = 120;
const DISPLAY_MAX = PARTY_MAX;
const ITEMS_SHOWN = 3;
const SPELLINGS_MAX = 5;
/** The list holds 19 parties today. */
const MIN_PARTIES = 12;
const MAX_ENTITIES = 2_000;
/** The longest key of a party: the id of its record. */
const KEY_MAX = 120;

/** Rule 1: the title of a penalty (the case-sensitive part of the pattern is only the party). */
const PENALTY_TITLE = /^imposition of (?:a )?monetary penalty\s*[:–-]\s*(.+)$/iu;
/** What a title that is meant to be a penalty begins with, whether or not the rest can be read. */
const PENALTY_PREFIX = /^imposition of (?:a )?monetary penalty/i;
/** Rules 2 and 3: the title of a disclosure. */
const DISCLOSURE_TITLE = /^disclosure notice\s*[:–-]\s*(.+)$/iu;
const DISCLOSURE_PREFIX = /^disclosure notice/i;
/** The title of a disclosure that is a date: the party is in the description. */
const DATE_TITLE = /^\d{1,2} [A-Z][a-z]+ \d{4}$/;
/**
 * A party that begins with a date, in any writing (`8 Sept. 2025`, `08 SEPTEMBER 2025 Example`), is
 * no name: it is refused, never read as one. A title is a date title only when it is the date alone
 * (DATE_TITLE), so a date with words after it must not be taken for a party either.
 */
const DATE_LIKE = /^\d{1,2}\s+\p{L}+\.?\s+\d{4}/u;
/** The words that open the description of a disclosure (tested apart: the rest is case-sensitive). */
const DESCRIPTION_PREFIX = /^disclosure notice of an offence under financial sanctions by /i;
/** After the prefix: `charities` in lower case, the parties, a bracket alias, a spaced dash and the rest. */
const DESCRIPTION_PARTIES = /^(charities )?(.+?)(?:\s*\([A-Z]{2,8}\))?(?:\s+[–-]\s+.*)?\s*$/u;
/** Where a list of a description is split: a comma or the word and, between blanks. */
const PARTY_SEPARATOR = /, | and /;
/**
 * Where a title is split when it may list a person: the comma and the word and of a
 * description, and the others that tell parties apart: a comma and the word and (`, and`, so that the
 * part is read without the and), an ampersand, a slash, a semicolon and the word with, and the joiners
 * `and/or`, `together with`, `as well as`, `plus`, `c/o`, `vs` and `versus`. A joiner has
 * blanks around it (a semicolon, after it only) and is written in lower case, and `, and` comes before
 * `, `, so that it is the one that matches where both do. No other joiner is read: a spaced dash, a
 * plus sign, `or`, `for`, `via` and `through` join a company and a person that nothing tells apart.
 */
const TITLE_SEPARATOR =
  /, and | and |, | & | \/ |; | with | and\/or | together with | as well as | plus | c\/o | vs | versus /;
/**
 * The words that mark the trade name of a sole trader, who is a natural person, and the other names
 * of one party: `Casey Sample t/a Example Services`, `Casey Sample, trading as Example Services`,
 * `Example Ltd d/b/a Casey Sample`, `Example Ltd formerly Casey Sample`; and the linkers that
 * tie a person to a company: `Example Ltd owned by Casey Sample`, `Casey Sample acting for Example Ltd`.
 * A blank is before it (and a comma may be) and a blank after it. A longer marker comes
 * before a shorter one that begins the same (`formerly known as`, `formerly`), so that the side after
 * it is the name and no more; a linker that another ends (`acting on behalf of`, `on behalf of`) needs
 * no order, for the text is read from its start and the earlier blank is the one that matches.
 */
const TRADING_MARKERS = [
  "t/a",
  "trading as",
  "trading under",
  "d/b/a",
  "dba",
  "a/k/a",
  "aka",
  "f/k/a",
  "fka",
  "n/k/a",
  "nka",
  "also known as",
  "formerly known as",
  "now known as",
  "formerly",
  "owned by",
  "operated by",
  "managed by",
  "run by",
  "acting on behalf of",
  "on behalf of",
  "acting for",
];
const TRADING_MARKER = new RegExp(`,? (?:${TRADING_MARKERS.join("|")}) `, "i");
/**
 * A marker or joiner written with slashes that opens a cell: a description is split at its commas
 * before it reads a marker, so `Example Ltd, t/a Casey Sample` has the cell `t/a Casey Sample`. Like a
 * role word in lower case (`its director`), it is taken off the front of a party before the person
 * test, so that the person that it leads is read (the words `trading as` are read so too).
 */
const SLASHED_LEAD = /^(?:t\/a|d\/b\/a|a\/k\/a|f\/k\/a|n\/k\/a|c\/o|and\/or)$/i;
/**
 * A bracket that holds no bracket, closed or (at the end of the text) not: the group of an alias, or
 * of a name. A text that a cut left open (`Example Ltd (Casey Sample`) reads to its end.
 */
const BRACKET_GROUP = /\(([^()]*)(?:\)|$)/g;
/** What an alias is inside its brackets: two to eight capitals, with or without the quotes the list writes. */
const ALIAS_INSIDE = /^[“"']?[A-Z]{2,8}[”"']?$/u;
/** A bracket alias at the end of a party, with or without quotes: `(EBL)`, `(“EBL”)`. */
const ALIAS = /\s*\((?:[“"']?[A-Z]{2,8}[”"']?)\)\s*$/u;
/**
 * The apostrophes of a name and of a possessive: the straight one, the typographic one (U+2019) and
 * the modifier letter (U+02BC), built from their code points so that this file stays plain text.
 */
const APOSTROPHES = `'${String.fromCodePoint(0x2019)}${String.fromCodePoint(0x02bc)}`;
/**
 * A part of a word of a person's name: a capital and lower-case letters (`Sample`), a capital and
 * capitals (`SAMPLE`), a capital alone (`J`), or one of the prefixes `Mc`, `Mac`, `De`, `Da`, `Di`,
 * `Du`, `La`, `Le`, `Van`, `Von`, `Fitz` and a name (`McSample`, `DeSample`, `McSAMPLE`); a combining
 * mark may follow any letter. A script that has no case has no capital, so its words are no part of
 * a name. Every part has ONE way to match, whatever its letters: the first alternative needs a
 * prefix and then a capital, and the second has a capital, the marks, then a run that begins with a
 * lower-case or with a capital letter, never both. The second never matches a text that the first
 * does (the lower-case run of `De` is never followed by a capital, as `DeS` has), and a prefix does
 * not begin with another, so no input has two ways to match one part: a word that fails late (a name
 * of one-letter parts, `A-A-A-...-A1`, or of prefixes, `DeD-DeD-...-A1`) costs no more than its
 * length, whereas two ways to match one capital would double the work for each part.
 */
const NAME_PART = String.raw`(?:(?:Mc|Mac|De|Da|Di|Du|La|Le|Van|Von|Fitz)\p{Lu}\p{M}*(?:\p{Ll}[\p{Ll}\p{M}]*|\p{Lu}[\p{Lu}\p{M}]*)?|\p{Lu}\p{M}*(?:\p{Ll}[\p{Ll}\p{M}]*|\p{Lu}[\p{Lu}\p{M}]*)?)`;
/**
 * A word of a person's name: parts that a hyphen of any kind or an apostrophe joins (`Sample-Lee`,
 * `O'Sample`, `D'arcy`), and an apostrophe may close it (`Lanterns’`). A capital inside a word is
 * read only after a prefix of NAME_PART and after an apostrophe, so that a name such as `SampleCorp`
 * is none.
 */
const NAME_WORD = new RegExp(
  `^${NAME_PART}(?:\\p{Pd}${NAME_PART}|['’]${NAME_PART}|['’][\\p{Ll}\\p{M}]+)*['’]?$`,
  "u",
);
/** A name word that an article in lower case leads, joined to it by a hyphen: `al-Sample`. */
const ARTICLE_NAME = /^(?:al|el)-(.+)$/u;
/**
 * A name word that `d'` or `l'` in lower case leads: `d'Arcy`, `l'Estrange`. What follows the
 * prefix is read as a name word (`isNameWord`), which begins with a capital: `d'arcy` is none.
 */
const ELISION_NAME = new RegExp(`^[dl][${APOSTROPHES}](.+)$`, "u");
/** A one-letter word of a name, with or without its dot: `J`, `J.`. */
const INITIAL = /^\p{Lu}\.?$/u;
/**
 * Joined initials, each with its dot: a capital and a lower-case letter at most, then the dot, at
 * least twice (`J.R.`, `J.R.R.`, `Ph.D.`, `M.D.`). They stand for the initials of a name in any
 * position, as `J.` does. Every unit begins with a capital and ends with the dot, so each
 * unit has one way to match.
 */
const JOINED_INITIALS = /^(?:\p{Lu}\p{Ll}?\.){2,}$/u;
/** The words of a name that are written in lower case and stand between its other words. */
const PARTICLES: ReadonlySet<string> = new Set([
  "abu",
  "af",
  "al",
  "ap",
  "bat",
  "ben",
  "bin",
  "bint",
  "da",
  "das",
  "de",
  "del",
  "della",
  "den",
  "der",
  "di",
  "do",
  "dos",
  "du",
  "e",
  "el",
  "ibn",
  "la",
  "las",
  "le",
  "los",
  "op",
  "ten",
  "ter",
  "van",
  "von",
  "y",
  "zu",
]);
/**
 * The titles that lead a person's name, lower case and without their dot: `Mr.`, `Dr.`, `Prof.`,
 * `Rt. Hon.`, `Capt.`, `Col.`, `Fr.` and `Sr.` (`The` leads a run of titles too, see `isTitle`).
 */
const HONORIFICS: ReadonlySet<string> = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "rev",
  "sir",
  "lord",
  "lady",
  "dame",
  "hon",
  "rt",
  "capt",
  "col",
  "fr",
  "sr",
]);
/**
 * The suffixes that end a person's name, lower case and without their dot: `Jr.`, `III.`, `Esq.`,
 * `PhD`, `Jnr.`, `Snr.`.
 */
const SUFFIXES: ReadonlySet<string> = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "esq",
  "phd",
  "jnr",
  "snr",
]);
/**
 * What a comma may set apart from the name before it inside one slot (`Casey Sample, Jr.`,
 * `Casey Sample, MBE`): the suffixes of SUFFIXES and the post-nominals `MBE`, `OBE`, `CBE`, `KC`, `QC`
 * and `M.D.`, lower case and without dots (`formOf`).
 */
const COMMA_SUFFIXES: ReadonlySet<string> = new Set([
  ...SUFFIXES,
  "mbe",
  "obe",
  "cbe",
  "kc",
  "qc",
  "md",
]);
/** The word that leads a title and is none (`The Hon. Casey Sample`), lower case. */
const THE = "the";
/** The abbreviation of a saint's name, which is a word of a name wherever it stands: `St. Sample`. */
const SAINT = "st";
/**
 * A word of letters that a dot may close: `Mr.` and `mr`, `Jr.` and `jr`, `St.` and `st`. It is a
 * word of a name where its place says so (`isAbbreviation`), in any case, with its dot or without
 * it, so that a person is never kept for want of a dot; a dot elsewhere makes no name word.
 */
const ABBREVIATION = /^(\p{L}+)\.?$/u;
/** The lower-case words that open the name that follows them, if no word of a role comes between. */
const NAME_OPENERS: ReadonlySet<string> = new Set([...HONORIFICS, SAINT]);
/** A word of lower-case letters, with hyphens and apostrophes inside it: a word of a role (`director`, `co-owner`). */
const LOWER_WORD = String.raw`\p{Ll}[\p{Ll}\p{M}'’\p{Pd}]*`;
const LOWER_ONLY = new RegExp(`^${LOWER_WORD}$`, "u");
/** What joins the words of a role: a blank, or a dash with a blank on each side (`owner - director`). */
const ROLE_JOINT = String.raw`(?: | \p{Pd} )`;
/**
 * A role at the end of a party: a comma or a dash, then lower-case words (`, owner`, ` - its
 * director`). The group is the words of the role, without the comma or the dash. It is the one
 * pattern of the person rule that is QUADRATIC in the length of its input (a run of ` - a` that fails at
 * its end: every dash starts a match that runs to the end and gives up word by word), so it must only
 * ever see a party that `partyOf` has capped at PARTY_MAX units: see `withoutRole`.
 */
const TRAILING_ROLE = new RegExp(
  `(?:, | \\p{Pd} )(${LOWER_WORD}(?:${ROLE_JOINT}${LOWER_WORD})*)$`,
  "u",
);
/** A part that is made of the words of a role alone: one to four lower-case words (`director`, `its owner`). */
const ROLE_FRAGMENT = new RegExp(`^${LOWER_WORD}(?:${ROLE_JOINT}${LOWER_WORD}){0,3}$`, "u");
/**
 * `et al` at the end of a party, with its dot or without, in any case, a blank before it and a comma
 * before that if the name has one: a role word that `withoutRole` takes off. `Casey Sample et
 * al.` is the person `Casey Sample`, whom others follow. No party reaches `withoutRole` with a comma
 * before `et al` today (every comma of a cell is a TITLE_SEPARATOR, and the part `et al` is an aside,
 * ET_AL_ALONE), so the comma is not observable; it stays so that a path that does hand it over still
 * reads the person.
 */
const ET_AL = /,? et al\.?$/i;
/** `et al` as a part of a list: no party and no person. */
const ET_AL_ALONE = /^et al\.?$/i;
/** `the younger` at the end of a party, in any case: it is taken off as a role word is. */
const THE_YOUNGER = / the younger$/i;
/** The fewest and the most words of a person's name that the rule reads. */
const PERSON_WORDS_MIN = 2;
const PERSON_WORDS_MAX = 5;

/** The legal forms of this person rule, lower case and without dots (`N.A.` is `na`). */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
  "limited",
  "ltd",
  "plc",
  "llp",
  "llc",
  "ag",
  "sa",
  "na",
  "inc",
  "gmbh",
  "bv",
]);
/** The words of an organisation's name in this person rule. */
const ORGANISATION_WORDS = [
  "bank",
  "branch",
  "company",
  "group",
  "trust",
  "charity",
  "ministries",
  "association",
  "services",
  "shipping",
  "trading",
  "management",
  "holdings",
  "payments",
  "international",
  "partners",
  "foundation",
];
const NOT_A_PERSON: ReadonlySet<string> = new Set([...LEGAL_FORMS, ...ORGANISATION_WORDS]);
/**
 * The legal forms that make a company when they are the LAST word of a name, lower case and
 * without dots (`N.V.` is `nv`): `Alden Brook Corporation`, `Alden Brook NV`. They are not in
 * LEGAL_FORMS, for a name that holds one elsewhere is a person's (`Casey NV Sample`); `Sdn Bhd` is the
 * last TWO words. `Co`, `AS` and `SAS` are NOT here: a surname can be written like them, so a company
 * whose only form is one of them is still read as a person's name (privacy beats recall).
 */
const LAST_WORD_FORMS: ReadonlySet<string> = new Set([
  "corporation",
  "incorporated",
  "corp",
  "nv",
  "sarl",
  "oy",
  "kk",
  "kft",
  "asa",
  "ooo",
  "jsc",
  "pjsc",
  "ab",
  "lp",
]);

/** The text of a record's first sentence: the list, the host, and the class that the prompt gives it. */
const FIRST = `${UK_OFSI_RECORD_MARK} (gov.uk), an enforcement or case list.`;
/** What a notice is and is not: never cut, and never says that the party did anything. */
const WHAT_A_NOTICE_IS =
  "A notice of the Office of Financial Sanctions Implementation names the party of a monetary penalty or of a published disclosure for a breach of UK financial sanctions; it is not a designation, and the party is not on a sanctions list because of it.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

export type OfsiKind = "monetary penalty" | "disclosure";

/** What a notice that names a person is shown as: its kind alone. */
const KIND_TITLES: Readonly<Record<OfsiKind, string>> = {
  "monetary penalty": "Imposition of monetary penalty",
  disclosure: "Disclosure notice",
};

/** What a title and a description make of a notice (see `ofsiReadingOf`). */
export type OfsiReading =
  | { shape: "none" }
  | { shape: "unreadable" }
  | { shape: "notice"; kind: OfsiKind; parties: string[]; persons: number };

const NONE: OfsiReading = Object.freeze({ shape: "none" });
const UNREADABLE: OfsiReading = Object.freeze({ shape: "unreadable" });

/** One of the newest notices of a party. */
interface OfsiItem {
  /**
   * The path of the page of the notice on GOV.UK, or null for a notice that names a person: GOV.UK
   * writes the end of that address from the title, which may hold the name, so it is never kept.
   */
  link: string | null;
  title: string;
  kind: OfsiKind;
  date: string;
}

/** One party of the list, with its notices: what the reader makes and the body holds. */
interface OfsiRow {
  /** `compactName(shortName(party))`, at most KEY_MAX units: the id of the record. */
  key: string;
  /** The party as the newest notice writes it, without its alias. */
  displayName: string;
  /** The spellings of the party, newest first, at most five: the names that a vendor may match. */
  spellings: string[];
  /** The notices that name the party. */
  count: number;
  /** The newest three, newest first. */
  items: OfsiItem[];
  /** The day of the newest notice. */
  newest: string;
}

/** A party as one notice names it. */
interface Mention extends OfsiItem {
  party: string;
}

let londonDays: Intl.DateTimeFormat | undefined;

/**
 * The Europe/London calendar day (YYYY-MM-DD) of a publication time, or null for anything that is
 * not an ISO 8601 day and time with a zone, with seconds, that exists in the years 1 to 9999. The
 * zone rules of London (summer time from the last Sunday of March, 01:00 UTC, to the last Sunday of
 * October, 01:00 UTC) are the platform's; no clock is read. The day that is built is checked as a
 * day of a list is (`dayText`), so that a year that has fewer than four digits is none.
 */
export function londonDayOf(value: unknown): string | null {
  const instant = instantText(value);
  // A day alone is no publication time: the zone decides the day, so the time must be there.
  if (instant === null || !instant.includes("T")) return null;
  if (londonDays === undefined) {
    londonDays = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const parts = londonDays.formatToParts(Date.parse(instant));
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? "";
  return dayText(`${part("year")}-${part("month")}-${part("day")}`);
}

/** A word as the lists of legal forms and organisation words write it: lower case, no dots, no commas. */
const formOf = (word: string): string => word.toLowerCase().replace(/[.,]/g, "");

/**
 * Whether the words of a name end in a legal form of LAST_WORD_FORMS: the last word is
 * one of them, or the last two are `Sdn Bhd`. A form that stands anywhere else is a name word.
 */
function endsInMoreForms(words: readonly string[]): boolean {
  const last = formOf(words[words.length - 1]);
  if (LAST_WORD_FORMS.has(last)) return true;
  return last === "bhd" && words.length >= 2 && formOf(words[words.length - 2]) === "sdn";
}

/**
 * The words of the list of legal forms that the keys use (`isLegalFormOrArticle`) that a role holds
 * as well: the article (`the owner`), `as` (`as director`) and `company` (`owner of the company`,
 * which is also a word of an organisation here). They are no legal form of this rule.
 */
const WORDS_OF_A_ROLE: ReadonlySet<string> = new Set(["the", "as", "company"]);

/**
 * Whether a word of a role (LOWER_WORD: lower case, no dot) is the legal form of a company: one of
 * this rule's own (`LEGAL_FORMS`) or one that the keys take off a name (`co`, `corp`), but none of
 * the words that a role holds too. The same word with a capital is never in a role.
 */
const isLegalForm = (word: string): boolean =>
  LEGAL_FORMS.has(word) || (isLegalFormOrArticle(word) && !WORDS_OF_A_ROLE.has(word));

/** The most words that a tail made of legal forms may have: `co pty ltd`. */
const FORM_TAIL_WORDS_MAX = 3;

/**
 * Whether the words of a tail (the lower-case words of a role, one blank between two of them, with
 * no comma or dash before the first) are made of legal forms ALONE: at most
 * FORM_TAIL_WORDS_MAX words, and every one a legal form (`ltd`, `pty ltd`, `co ltd`), or single
 * letters that spell one when they are put together (`s a`, `l l c`). A form among other words is a
 * part of a role: `co owner` (`co` for co-owner), `ltd owner`, `owner of ltd`, `ltd and others`. A
 * dash between two words is a word of its own that is no form, so a tail with one is a role.
 */
function consistsOfLegalForms(words: string): boolean {
  const each = words.split(" ");
  if (each.length > FORM_TAIL_WORDS_MAX) return false;
  if (each.every((word) => isLegalForm(word))) return true;
  // The letters of one form written apart: `s a` is `sa`, `l l c` is `llc`.
  return each.every((word) => word.length === 1) && isLegalForm(each.join(""));
}

/** Whether a word is a word of a person's name: a name word, or one that an article in lower case leads. */
function isNameWord(word: string): boolean {
  if (NAME_WORD.test(word)) return true;
  const led = ARTICLE_NAME.exec(word) ?? ELISION_NAME.exec(word);
  return led !== null && NAME_WORD.test(led[1]);
}

/** A word without the dot that closes it, in lower case: `Mrs.` is `mrs`. */
const bareOf = (word: string): string =>
  (word.endsWith(".") ? word.slice(0, -1) : word).toLowerCase();

/**
 * The quotes that may stand around a word, a part, a side or the inside of a bracket: the
 * straight double and single quote, and the typographic ones (U+201C, U+201D, U+2018, U+2019, U+201E,
 * U+00AB, U+00BB), built from their code points so that this file stays plain text.
 */
const QUOTES = `"'${String.fromCodePoint(0x201c, 0x201d, 0x2018, 0x2019, 0x201e, 0x00ab, 0x00bb)}`;
const LEADING_QUOTE = new RegExp(`^[${QUOTES}]`);
const TRAILING_QUOTE = new RegExp(`[${QUOTES}]$`);

/**
 * A word without the quote before it and the quote after it, one of each at most: `"Orly"`
 * is `Orly`.
 */
const unquoteWord = (word: string): string =>
  word.replace(LEADING_QUOTE, "").replace(TRAILING_QUOTE, "");

/**
 * A text without the one pair of quotes that stands round all of it, when it has one: the
 * first unit is a quote and the last is a quote, of any kind, and what is left is read as the text.
 */
const withoutQuotePair = (text: string): string =>
  LEADING_QUOTE.test(text) && TRAILING_QUOTE.test(text) ? text.slice(1, -1) : text;

const MODIFIER_APOSTROPHE = new RegExp(String.fromCodePoint(0x02bc), "g");
const MINUS_SIGN = new RegExp(String.fromCodePoint(0x2212), "g");

/**
 * A text with U+02BC written as the apostrophe and U+2212 as the hyphen: the patterns of a
 * name and of a role are written with the apostrophes of NAME_WORD and the hyphens of `\p{Pd}`.
 */
const foldedOf = (text: string): string =>
  text.replace(MODIFIER_APOSTROPHE, "'").replace(MINUS_SIGN, "-");

/**
 * Whether a word of letters that a dot may close is a word of a name where it stands: a title in the
 * run of titles that leads the name, a suffix in the run of suffixes that ends it, and `St` anywhere.
 * The case and the dot make no difference: `Mr.`, `mr` and `MR` are one word.
 */
function isAbbreviation(word: string, inTitles: boolean, inSuffixes: boolean): boolean {
  const found = ABBREVIATION.exec(word);
  if (found === null) return false;
  const name = found[1].toLowerCase();
  return (inTitles && HONORIFICS.has(name)) || (inSuffixes && SUFFIXES.has(name)) || name === SAINT;
}

/**
 * Whether a word leads a name as a title: a word of HONORIFICS, or `The`, which leads a title and
 * stands first in a run of them (`The Hon. Casey Sample`). The case and the dot make no
 * difference.
 */
function isTitle(word: string): boolean {
  const bare = bareOf(word);
  return HONORIFICS.has(bare) || bare === THE;
}

/**
 * A party without its role: a comma or a dash and the lower-case words that follow it are
 * taken off the end (as many times as there are such roles), and the lower-case words that are no
 * particle are taken off the front, always leaving one word. `its director Casey Sample` and `Casey
 * Sample, owner` are `Casey Sample`. A title (or `st`) that is the last of the words taken off the
 * front, with one word left after it, is the opening of that name and stays: `its owner mr Sample`
 * is `mr Sample`. A tail that is made of legal forms alone is no role, it is the company's:
 * `Example Sample, ltd` and `Example Sample - co ltd` stay as they are; a form among
 * other words is a part of a role (`Casey Sample, co owner`), and is taken off. `et al` is a role
 * word that ends a party too, with its dot or without: `Casey Sample, owner, et al.` is
 * `Casey Sample`.
 *
 * The input is ALWAYS a party of at most PARTY_MAX (150) units: the one caller,
 * `isPersonShaped`, is reached only with the result of `partyOf`, which refuses a longer cell, and a
 * title or a description that does not fit in TITLE_MAX or DESCRIPTION_MAX is refused by `lineWithin`
 * before any cell is made. The cap comes FIRST and this reading SECOND, because TRAILING_ROLE is
 * quadratic and a role is taken off once for each pass of the loop: measured on a run of ` - a` that
 * fails at its end, it takes 0.5 ms on 150 units, 1.5 s on 100,000 and 6 s on 200,000 (four times as
 * long for each doubling: minutes on a megabyte). Never call this function on a text that `partyOf`
 * has not passed; a test pins the order on a megabyte title and a megabyte description.
 */
function withoutRole(party: string): string {
  let rest = party;
  for (;;) {
    const taken = ET_AL.exec(rest) ?? THE_YOUNGER.exec(rest);
    if (taken !== null) {
      rest = rest.slice(0, taken.index);
      continue;
    }
    const role = TRAILING_ROLE.exec(rest);
    if (role === null || consistsOfLegalForms(role[1])) break;
    rest = rest.slice(0, role.index);
  }
  const words = rest.split(" ");
  let at = 0;
  while (
    at < words.length - 1 &&
    (LOWER_ONLY.test(words[at]) || SLASHED_LEAD.test(words[at])) &&
    !PARTICLES.has(words[at])
  ) {
    at += 1;
  }
  if (at > 0 && at === words.length - 1 && NAME_OPENERS.has(words[at - 1])) at -= 1;
  return at === 0 ? rest : words.slice(at).join(" ");
}

/**
 * Whether a part of a list is the words of a role alone (`director`, `its owner`): one to four
 * lower-case words, none of them a legal form, a word of an organisation's name or a particle of a
 * name (a particle is never a word of a role). It is no party and no person, and a list leaves it
 * out.
 */
function isRoleFragment(part: string): boolean {
  const folded = foldedOf(part);
  return (
    ROLE_FRAGMENT.test(folded) &&
    !folded.split(" ").some((word) => NOT_A_PERSON.has(formOf(word)) || PARTICLES.has(word))
  );
}

/**
 * Whether a part of a list is made of the suffixes that a comma sets apart from the name before it
 * (COMMA_SUFFIXES) and nothing else: `Jr.`, `MBE`, `M.D.`, in any case, with their dots or without.
 * It is a part of the name before it, so it is no party and no person of its own.
 */
function isSuffixPart(part: string): boolean {
  return part.split(" ").every((word) => COMMA_SUFFIXES.has(formOf(unquoteWord(word))));
}

/**
 * Whether a part of a list is an aside: the words of a role alone (`isRoleFragment`), `et al` alone
 * (`al` is a particle of a name, so the words of a role never hold it) or a suffix alone
 * (`isSuffixPart`). It is no party and no person, and a list leaves it out.
 */
const isAside = (part: string): boolean =>
  isRoleFragment(part) || ET_AL_ALONE.test(part) || isSuffixPart(part);

/**
 * Whether a party has the shape of a person's name: two to five words,
 * each a name word (NAME_WORD) or an initial (one letter, or joined initials such as `J.R.` and
 * `Ph.D.`), with the particles of a name (PARTICLES) between two of them, once its role is put aside
 * (`withoutRole`); a title leads the name and a suffix ends it, with a dot or without and in any case
 * (a run of them counts), `St` stands anywhere; at least one name word that is no initial; none of
 * the words a legal form or a word of an organisation's name, in any case, and no name that ends in
 * one of the forms of LAST_WORD_FORMS (`endsInMoreForms`). Before the words are read, the one pair
 * of quotes that stands round the party is taken off, U+02BC and U+2212 are written as the
 * apostrophe and the hyphen (`foldedOf`), and the quote before and after each word is taken off
 * (`unquoteWord`). Nothing else is read: the party is a line already.
 */
function isPersonShaped(party: string): boolean {
  const words = withoutRole(withoutQuotePair(foldedOf(party)))
    .split(" ")
    .map(unquoteWord);
  if (words.length < PERSON_WORDS_MIN || words.length > PERSON_WORDS_MAX) return false;
  // A name that ends in a legal form of another country is a company's.
  if (endsInMoreForms(words)) return false;
  let titles = 0;
  while (titles < words.length && isTitle(words[titles])) titles += 1;
  let suffixes = 0;
  while (suffixes < words.length && SUFFIXES.has(bareOf(words[words.length - 1 - suffixes]))) {
    suffixes += 1;
  }
  let full = 0;
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at];
    if (NOT_A_PERSON.has(formOf(word))) return false;
    if (PARTICLES.has(word)) {
      // A particle joins two names: it is never the first word or the last.
      if (at === 0 || at === words.length - 1) return false;
    } else if (!INITIAL.test(word) && !JOINED_INITIALS.test(word)) {
      // A word of one letter, or of joined initials, is an initial, whatever else it is: only a longer
      // word is a name.
      if (!isNameWord(word) && !isAbbreviation(word, at < titles, at >= words.length - suffixes)) {
        return false;
      }
      full += 1;
    }
  }
  return full >= 1;
}

/** Whether a text is made of legal forms alone (`Ltd`, `N.A.`, `Ltd, Inc`). */
const isLegalFormsOnly = (text: string): boolean =>
  text.split(" ").every((word) => LEGAL_FORMS.has(formOf(word)));

/**
 * The party of one cell of a title or a description, or null when the cell is no party: the alias
 * cut, then refused when it is empty, longer than PARTY_MAX, holds `<` or `>`, has no letter, is a
 * date, begins with the word and, begins or ends with a comma, ends in the mark of a cut (it was cut
 * by another layer, and is no whole name), or is made of legal forms alone. The cell is a line
 * already (`lineOf`: one blank between words, none at the ends).
 */
function partyOf(cell: string): string | null {
  const party = cell.replace(ALIAS, "");
  if (party === "" || party.length > PARTY_MAX) return null;
  if (/[<>]/.test(party) || !/\p{L}/u.test(party) || DATE_LIKE.test(party)) return null;
  if (/^and /i.test(party) || party.startsWith(",") || party.endsWith(",")) return null;
  if (endsCut(party) || isLegalFormsOnly(party)) return null;
  return party;
}

/**
 * The key of a party: `compactName(shortName(party))`, whole. It is the id of the record, so it is
 * never cut: a party whose key is longer than KEY_MAX units is refused where it is read
 * (`ofsiReadingOf`), and every key that is kept is KEY_MAX units or fewer.
 */
const entityKeyOf = (party: string): string => compactName(shortName(party));

/**
 * The cells of the party list of a disclosure whose title is a date, from its description: the
 * description is read as one line, must open with the words of rule 3, and is cut at the bracket
 * alias or the spaced dash that follows the parties; the rest is never kept. The list is split at a
 * comma and at the word and; unless it names charities, a part that is an aside (`isAside`: the words
 * of a role alone, `et al`, or suffixes alone such as `Jr.`) is left out, and a part that joins a
 * person to a party by another word is split as a title's slot is (`cellsOfSlot`). Null when the
 * description is no text, is longer than DESCRIPTION_MAX, does not have that shape, or has no part
 * left.
 */
function describedCellsOf(description: unknown): { cells: string[]; charities: boolean } | null {
  // `lineWithin`, not a cut and a compare: a description that does not fit is no description that a
  // notice has, and a cut of it that has 1,000 units or fewer (a blank or a pair of surrogates at
  // the cut) is not a whole line.
  const text = lineWithin(description, DESCRIPTION_MAX);
  if (text === null) return null;
  const prefix = DESCRIPTION_PREFIX.exec(text);
  if (prefix === null) return null;
  const found = DESCRIPTION_PARTIES.exec(text.slice(prefix[0].length));
  if (found === null) return null;
  const charities = found[1] !== undefined;
  // The word `charities` names the parties organisations: the person rule does not apply, nor does it read them.
  if (charities) return { cells: found[2].split(PARTY_SEPARATOR), charities };
  const read = splitOutsideBrackets(found[2], PARTY_SEPARATOR)
    .filter((cell) => !isAside(cell))
    .flatMap((cell) => cellsOfSlot(cell));
  return read.length === 0 ? null : { cells: read, charities };
}

/** Whether the last word of a party is a legal form or a word of an organisation's name: the name ends there. */
function closesName(party: string): boolean {
  const words = party.split(" ").map(unquoteWord);
  return NOT_A_PERSON.has(formOf(words[words.length - 1])) || endsInMoreForms(words);
}

/**
 * The spans of the bracket groups of a text (BRACKET_GROUP), each as its first and its end index.
 */
function bracketSpansOf(text: string): Array<[number, number]> {
  return [...text.matchAll(BRACKET_GROUP)].map((group) => {
    const start = group.index ?? 0;
    return [start, start + group[0].length];
  });
}

/**
 * Whether an index is inside a bracket group of the spans (`bracketSpansOf`), the brackets
 * themselves apart.
 */
const isInside = (spans: ReadonlyArray<readonly [number, number]>, at: number): boolean =>
  spans.some(([start, end]) => at > start && at < end);

/**
 * `text.split(separator)`, except that a separator inside a bracket group (BRACKET_GROUP) is left
 * alone: `Example Ltd (Casey Sample, director)` is one part, whose inside is read as a text of its
 * own (`sidesOf`).
 */
function splitOutsideBrackets(text: string, separator: RegExp): string[] {
  const spans = bracketSpansOf(text);
  if (spans.length === 0) return text.split(separator);
  const parts: string[] = [];
  let from = 0;
  for (const found of text.matchAll(new RegExp(separator.source, "g"))) {
    const at = found.index ?? 0;
    if (isInside(spans, at)) continue;
    parts.push(text.slice(from, at));
    from = at + found[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * A possessive and the blank that the next word follows: an apostrophe, then `s` in either case.
 */
const POSSESSIVE = new RegExp(`[${APOSTROPHES}][sS] `, "g");

/**
 * The last `count` words of `text.slice(from, end)`, in order, found from the end: the words before
 * them are never looked at, so a text of many possessives is read in one pass. `from` is the start of
 * the text or the index after a blank (the one that a possessive ends with), so the blank that is
 * found before a word is never before `from`.
 */
function lastWordsOf(text: string, from: number, end: number, count: number): string[] {
  const words: string[] = [];
  let stop = end;
  while (words.length < count && stop > from) {
    const start = text.lastIndexOf(" ", stop - 1) + 1;
    words.unshift(text.slice(start, stop));
    stop = start - 1;
  }
  return words;
}

/**
 * `text` cut where a legal form or a word of an organisation's name is followed by a possessive, outside
 * brackets, the possessive and its blank left out: `Example Ltd's director Casey Sample` is
 * `Example Ltd` and `director Casey Sample`. The company ends at the form, and the rest is the next
 * part, which a list reads as it reads any part. The forms are those that the rule knows: its own
 * (`LEGAL_FORMS`), the organisation words, the forms of LAST_WORD_FORMS and the forms of the keys
 * (`isLegalForm`: `co`, `pty`, ...), in any case, with their dots or without. A possessive after
 * any other word is the name's own (`Casey Sample's Example Ltd`, `Alden Brook's`): no cut.
 */
function splitAtPossessives(text: string): string[] {
  const spans = bracketSpansOf(text);
  const parts: string[] = [];
  let from = 0;
  for (const found of text.matchAll(POSSESSIVE)) {
    const at = found.index ?? 0;
    if (isInside(spans, at)) continue;
    const words = lastWordsOf(text, from, at, 2);
    if (words.length === 0) continue;
    const closing = closesName(words.join(" ")) || isLegalForm(formOf(words[words.length - 1]));
    if (!closing) continue;
    parts.push(text.slice(from, at));
    from = at + found[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * The parts of a slot: the cuts at TITLE_SEPARATOR outside brackets, each cut again at its
 * possessives.
 */
const partsOfSlot = (slot: string): string[] =>
  splitOutsideBrackets(slot, TITLE_SEPARATOR).flatMap((part) => splitAtPossessives(part));

/**
 * The sides of a text that a bracket that is no alias or, failing that, a sole trader's marker
 * (TRADING_MARKER) divides, or null when it has neither. Brackets give the text outside them, with a
 * blank where each stood, and the words inside each; a marker gives the words before it and the
 * words after it (every marker of the text), except a side that is the words of a role alone
 * (`isRoleFragment`): a cell that opens with a longer linker (`acting on behalf of Casey Sample`) has
 * `acting` before the marker that is found in it (`on behalf of`), and that word is no side.
 * A side is never empty, and is shorter than the text.
 */
function sidesOf(text: string): string[] | null {
  const insides: string[] = [];
  const outside = text.replace(BRACKET_GROUP, (group: string, inside: string) => {
    const words = inside.trim();
    if (ALIAS_INSIDE.test(words)) return group;
    insides.push(words);
    return " ";
  });
  if (insides.length > 0) {
    const outer = outside
      .replace(/\s+/g, " ")
      .replace(/ ([,;])/g, "$1")
      .trim();
    return [outer, ...insides].filter((side) => side !== "");
  }
  if (TRADING_MARKER.test(text)) {
    return text.split(TRADING_MARKER).filter((side) => side !== "" && !isRoleFragment(side));
  }
  return null;
}

/**
 * Whether a text is a person's name, has a side (`sidesOf`) that holds one, or is a list that holds
 * one (`cellsOfSlot` splits it), at any depth.
 */
function holdsPerson(text: string): boolean {
  const party = partyOf(text);
  if (party !== null && isPersonShaped(party)) return true;
  const sides = sidesOf(text);
  if (sides !== null) return sides.some(holdsPerson);
  const cells = cellsOfSlot(text);
  return cells.length > 1 || cells[0] !== text;
}

/**
 * The cells of the slot of a title, or of a part of a description: the slot is ONE party, unless it
 * reads as a list that holds a person, and then each part is a cell
 * (split at TITLE_SEPARATOR, and again after a legal form or a word of an organisation that a
 * possessive follows, `Example Ltd's director Casey Sample`: `partsOfSlot`; an aside is left out,
 * `isAside`). It reads so when every part has the shape of a person's name, or when a part with
 * that shape comes after a part that ends a name with a legal form or a word of an organisation's
 * name (`Example Ltd & Casey Sample`). A slot that opens with the shape and ends with a legal form
 * (`Example Bread and Sons Ltd`) cannot be told from one company that holds the word and, and stays
 * one party; so does every slot with no part of that shape. A role at the end of the slot after a
 * comma that is made of legal forms alone (`Example Sample, corp`) is the company's: it stays with
 * the part before it, and the slot is read as if it had one part less. A sole trader and
 * a bracket divide a text into sides whatever the order (`sidesOf`): when a side is a person the
 * text is split into its sides, and each is read again. Every part and every side is shorter than
 * the slot, so the reading ends.
 */
function cellsOfSlot(slot: string): string[] {
  const parts = partsOfSlot(slot);
  // The tail that closes the slot after a comma and is made of legal forms alone is the company's, no
  // role: it stays with the part before it. A part in the middle of a list, and a part of a
  // description outside a bracket, is still left out as a role.
  const tail = parts[parts.length - 1];
  if (isRoleFragment(tail) && consistsOfLegalForms(tail) && slot.endsWith(`, ${tail}`)) {
    parts.splice(-2, 2, `${parts[parts.length - 2]}, ${tail}`);
  }
  if (parts.length >= 2) {
    let persons = 0;
    let named = 0;
    let closed = false;
    let personAfterName = false;
    for (const part of parts) {
      if (isAside(part)) continue;
      named += 1;
      const party = partyOf(part);
      if (party === null) {
        // A legal form on its own (`Example, Ltd and Casey Sample`) ends the name before it.
        if (isLegalFormsOnly(part)) closed = true;
        continue;
      }
      if (holdsPerson(part)) {
        persons += 1;
        if (closed) personAfterName = true;
      } else if (closesName(party)) {
        closed = true;
      }
    }
    if (named > 0 && (persons === named || personAfterName)) {
      return parts.filter((part) => !isAside(part)).flatMap((part) => cellsOfSlot(part));
    }
  }
  const sides = sidesOf(slot);
  if (sides !== null && sides.some(holdsPerson)) return sides.flatMap((side) => cellsOfSlot(side));
  return [slot];
}

/**
 * What the title and the description of a document of the type `notice` make of it. `none`: the
 * title is of no kind that names a party (a joint statement): no row, and no failure. `unreadable`:
 * the title opens as a penalty or a disclosure but no party can be read from it, or a party is not a
 * name (see `partyOf`), or the title is no text: it is counted. Otherwise the kind, the parties (each
 * once, in the order of the text, persons and names that no key could match left out) and how many
 * persons were left out. The description is read only for a disclosure whose title is a date; the
 * slot of any other title is one party unless it lists a person (`cellsOfSlot`). Pure, and bounded:
 * no pattern is tried on a title of more than 300 characters or a description of more than 1,000.
 */
export function ofsiReadingOf(title: unknown, description: unknown): OfsiReading {
  if (typeof title !== "string") return UNREADABLE;
  // The kind is told by the words that the title opens with, which a cut of a long one keeps.
  const opening = lineOf(title, TITLE_MAX);
  if (opening === "") return UNREADABLE;
  let kind: OfsiKind;
  if (PENALTY_PREFIX.test(opening)) kind = "monetary penalty";
  else if (DISCLOSURE_PREFIX.test(opening)) kind = "disclosure";
  else return NONE;
  // A title that does not fit cannot be read, and a cut of it is never read: `lineWithin`.
  const line = lineWithin(title, TITLE_MAX);
  if (line === null) return UNREADABLE;

  const slot = (kind === "disclosure" ? DISCLOSURE_TITLE : PENALTY_TITLE).exec(line)?.[1];
  if (slot === undefined) return UNREADABLE;

  let cells: string[];
  let charities = false;
  if (kind === "disclosure" && DATE_TITLE.test(slot)) {
    const described = describedCellsOf(description);
    if (described === null) return UNREADABLE;
    ({ cells, charities } = described);
  } else {
    cells = cellsOfSlot(slot);
  }
  if (cells.length > MAX_PARTIES_PER_NOTICE) return UNREADABLE;

  const parties: string[] = [];
  const keys = new Set<string>();
  let persons = 0;
  for (const cell of cells) {
    const party = partyOf(cell);
    if (party === null) return UNREADABLE;
    // The word `charities` names the parties organisations: the person rule does not apply.
    if (!charities && isPersonShaped(party)) {
      persons += 1;
      continue;
    }
    if (nameKeysOf([party]).length === 0) continue;
    const key = entityKeyOf(party);
    // A key that does not fit is no key, and a cut of it is never one (as uk_mhra refuses a
    // name): the party is refused like any name that is no name, and the notice is counted. A person
    // never gets here: it was counted above, whatever the length of its name.
    if (key.length > KEY_MAX) return UNREADABLE;
    if (keys.has(key)) continue;
    keys.add(key);
    parties.push(party);
  }
  return { shape: "notice", kind, parties, persons };
}

/** The link of a notice's page, or null when it is not under the publications, has no slug, is too long or is not clean. */
function linkOf(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith(PUBLICATION_PATH) ||
    value.length === PUBLICATION_PATH.length ||
    value.length > LINK_MAX ||
    UNSAFE_LINK.test(value)
  ) {
    return null;
  }
  return value;
}

/**
 * The newest notice first; a tie by the page (a notice with none comes first), then the party and
 * the kind. A notice names a party once and has one page, except a notice that names a person: it
 * has none, and its title is its kind, so the party and the kind tell two of one day apart, whatever
 * the order of the file; two that tie on all four are the same row.
 */
const newestFirst = (a: Mention, b: Mention): number =>
  compareText(b.date, a.date) ||
  compareText(a.link ?? "", b.link ?? "") ||
  compareText(a.party, b.party) ||
  compareText(a.kind, b.kind);

/** The party of a key, from its notices: independent of the order that the notices were read in. */
function rowOf(key: string, mentions: readonly Mention[]): OfsiRow {
  const sorted = [...mentions].sort(newestFirst);
  const [newest] = sorted;
  return {
    key,
    displayName: lineOf(newest.party, DISPLAY_MAX),
    spellings: distinct(
      sorted.map(({ party }) => party),
      SPELLINGS_MAX,
    ),
    count: sorted.length,
    items: sorted
      .slice(0, ITEMS_SHOWN)
      .map(({ link, title, kind, date }) => ({ link, title, kind, date })),
    newest: newest.date,
  };
}

/**
 * The parties of the notices of the search, or null when it is not the list: pages that are not
 * one search (`govukRowsOf`), fewer than MIN_PARTIES parties, or more than MAX_ENTITIES. A notice
 * that cannot be read is counted in `unreadable` and kept out; a notice that names nobody a vendor
 * could be matched to (a joint statement, a person) is not counted. Pure and bounded.
 */
function readNotices(fetched: Fetched): ReadResult<OfsiRow> | null {
  const found = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
  if (found === null) return null;

  const mentions = new Map<string, Mention[]>();
  let notices = 0;
  let unreadable = 0;
  for (const result of found.rows) {
    // The request gives every document of the organisation; only the notices are read.
    if (result.content_store_document_type !== NOTICE_TYPE) continue;
    notices += 1;
    const reading = ofsiReadingOf(result.title, result.description);
    if (reading.shape === "none") continue;
    if (reading.shape === "unreadable") {
      unreadable += 1;
      continue;
    }
    // Nobody to record: a person, or a name too short for a key. Nothing of it is kept or counted.
    if (reading.parties.length === 0) continue;

    const link = linkOf(result.link);
    const date = londonDayOf(result.public_timestamp);
    if (link === null || date === null) {
      unreadable += 1;
      continue;
    }
    // A notice that names a person next to a party shows its kind alone as its title and has no
    // page of its own: its title may be the person's name, and its address is made from it.
    const named = reading.persons > 0;
    const title = named ? KIND_TITLES[reading.kind] : lineOf(result.title, ITEM_TITLE_MAX);
    for (const party of reading.parties) {
      const key = entityKeyOf(party);
      let list = mentions.get(key);
      if (list === undefined) {
        // A list of more parties than any real one is no list of this kind.
        if (mentions.size >= MAX_ENTITIES) return null;
        list = [];
        mentions.set(key, list);
      }
      list.push({ party, link: named ? null : link, title, kind: reading.kind, date });
    }
  }
  // A parser that broke would give few parties, and the allowance of unreadable rows would hide it.
  if (mentions.size < MIN_PARTIES) return null;

  const rows = [...mentions].map(([key, list]) => rowOf(key, list));
  return {
    rows,
    // The reader counts in notices, and a notice that names several parties makes several rows.
    total: Math.max(notices, rows.length + unreadable),
    unreadable,
    // The pager proved that the pages hold as many distinct links as the search says it has.
    complete: found.rows.length === found.total,
  };
}

/** A record is a party and the newest of its notices: no text of a notice but its title, kind and day. */
function toRecord(row: OfsiRow): ParsedRecord {
  const [newest] = row.items;
  if (newest === undefined) throw new UnreadableEntry();
  const display = lineOf(row.displayName, DISPLAY_MAX);
  const shown = row.items
    .map((item) => `“${lineOf(item.title, ITEM_TITLE_MAX)}” (${item.kind}, ${item.date})`)
    .join("; ");
  return recordOf({
    id: `ofsi:${row.key}`,
    type: "sanctions_penalty_notice",
    title: `OFSI notice: ${display}`,
    summary: summaryWithClosing(
      [
        FIRST,
        WHAT_A_NOTICE_IS,
        sentence("Party as written", display),
        `Notices: ${row.count}; newest: ${shown}.`,
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    // The page of the newest notice (a notice that names several parties is the page of each), or the
    // collection page of the list when that notice names a person.
    url: newest.link === null ? COLLECTION_PAGE : `${GOVUK_SITE}${newest.link}`,
    identifiers: { party: display, notices: row.count, newest: row.newest },
    names: row.spellings,
    publishedAt: row.newest,
  });
}

/**
 * The connector of the list. It makes one request for each page of the search, so it is built by a
 * factory that takes the pause between two pages (400 ms, as the host asks) and has the real one by
 * default: a test hands it a pause that does not wait.
 */
export function createUkOfsiConnector({ sleep = realSleep }: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<OfsiRow>({
    id: "uk_ofsi",
    version: 1,
    root: "search.json",
    sortKey: (row) => row.key,
    pin: GOVUK_PIN,
    // The API sends no validator, so there is no 304: every sync downloads the list.
    fetchFiles: (fetch) =>
      govukSearchPages(fetch, (start) => `${SEARCH_URL}${start}`, {
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        maxBytes: MAX_BYTES,
        timeoutMs: TOTAL_TIMEOUT_MS,
        sleep,
      }),
    read: readNotices,
    toRecords: (rows) => rows.map(toRecord),
    sourceVersion: (rows) =>
      rows.reduce<string | null>(
        (newest, { newest: day }) => (newest === null || day > newest ? day : newest),
        null,
      ),
  });
}

export const ukOfsiConnector: Connector = createUkOfsiConnector();
