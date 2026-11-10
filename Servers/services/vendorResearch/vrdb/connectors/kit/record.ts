/**
 * The record builder of the list kit: the one place where a record of a mirrored list is made, so
 * that no connector can store what the database's columns cannot hold, nor a text that a prompt
 * should not carry. A connector gives it a draft, cleaned cells and fixed sentences, and gets a
 * `ParsedRecord`, or an `UnreadableEntry` when the entry cannot be one: the list's own id is not
 * usable, the title or the text is empty, the address is not an https address, a day is none. The
 * connector factory (fileConnector.ts) counts such an entry and leaves it out, as the CVE records
 * do (connectors/cve.ts); too many are a new format and fail the sync.
 *
 * What it cuts, it never throws for: a title and a summary longer than their limits are cut, and
 * the cut says so (` [shortened]`). What it cannot cut, it refuses: an id is the entry's identity,
 * so a long one is no id.
 *
 * The keys of a record (keys.ts) come from the names, hosts and numbers the draft gives, and from
 * nothing else: no new prefix, no new way of matching. A name, an LEI and a number are folded as a
 * cell is (NFKC, the characters nobody sees out) before they become keys, so that a name written
 * in NFD, as many exports are, and its NFC form are one key, and a full-width name is the ASCII
 * key. A host where many have pages is no key (sharedHosts.ts), nor is an address of the Internet
 * protocol; a name of fewer than four letters and digits is no key, and no key is longer than a
 * vendor's name or number can be: an index entry of the keys' GIN index may not be larger than a
 * third of a page, and one key that is would fail the write of the whole list. The kinds come in
 * the order of their strength (names, LEIs, numbers, hosts), and the hosts are capped on their
 * own, so that a record of many hosts keeps its LEIs and numbers when the keys are cut.
 */
import { isSharedHost } from "../../../sharedHosts";
import { domainKey, identifierKeysOf, isLei, leiKey, nameKeysOf } from "../../keys";
import type { ParsedRecord } from "../../types";
import {
  dayText,
  flatText,
  instantText,
  isObject,
  lineOf,
  shorten,
  stringOf,
  withoutAngles,
} from "./clean";

/** The longest id: the column `source_record_id` is VARCHAR(200). */
export const RECORD_ID_MAX = 200;
/** The longest type: the column `record_type` is VARCHAR(30). */
export const RECORD_TYPE_MAX = 30;
export const RECORD_TITLE_MAX = 200;
/**
 * The longest summary. The evidence pack cuts a snippet at 1,500 characters, and the lookup appends
 * "As of YYYY-MM-DD.", so a longer summary would lose its end, and with it the sentence that says
 * what the record is not.
 */
export const RECORD_SUMMARY_MAX = 1300;
export const RECORD_URL_MAX = 2048;
/** The most keys that the names of a record give. */
export const NAME_KEYS_MAX = 50;
/** The most keys that the hosts of a record give. */
export const DOMAIN_KEYS_MAX = 50;
/** The most characters of the identifiers of a record, as JSON. */
export const IDENTIFIERS_MAX_CHARS = 2000;
/** The most keys of a record, whatever they are made of; the last kinds are cut first. */
export const MATCH_KEYS_MAX = 200;
/**
 * The longest key, its prefix included: a host is at most 253 characters, and no name or number
 * of a vendor comes near it.
 */
export const MATCH_KEY_MAX_CHARS = 300;

/** The longest name or number that a key is made of: a longer text is no name, and is not read. */
const KEY_SOURCE_MAX_CHARS = 1000;
/** The longest host of a website. */
const HOST_MAX_CHARS = 253;
const DOMAIN_PREFIX = "domain:";

/** What a record is made of, as a connector has it: cells cleaned and sentences composed. */
export interface RecordDraft {
  /** The list's own id of the entry, stable: never changed, and refused when it is not usable. */
  id: string;
  type: ParsedRecord["recordType"];
  /** A cell: cleaned as a line (`lineOf`) and cut at RECORD_TITLE_MAX. */
  title: string;
  /** The sentences of the record, composed: cleaned of controls and cut at RECORD_SUMMARY_MAX. */
  summary: string;
  /**
   * A public page that shows the record: https, with no blank, control or hidden character in it,
   * and none of the characters < > " ` \ ^ { | } (their percent escapes are fine). It is stored as
   * `new URL(url).href`, the form that the evidence pack compares addresses by.
   */
  url: string;
  /** The list's identifiers of the record: JSON, at most IDENTIFIERS_MAX_CHARS as text. */
  identifiers: Record<string, unknown>;
  /** The names that a vendor may match the record by: the keys of keys.ts, each as written and without its legal form. */
  names: readonly string[];
  /** The hosts of the entry's websites, bare (`example.com`), as `hostsOf` gives them. */
  domains?: readonly string[];
  /** The LEIs of the entry; one that fails its check is no key. */
  leis?: readonly string[];
  /** The registration numbers of the entry (`identifierKeysOf`). */
  regnos?: readonly string[];
  /** The day the record was published or added to the list, YYYY-MM-DD, or null when the list says none. */
  publishedAt: string | null;
  /** When the list last changed the record, ISO 8601 with a zone, when it says. */
  sourceUpdatedAt?: string | null;
}

/** An entry of a list that cannot be a record. It holds no data: not the entry, and not the address. */
export class UnreadableEntry extends Error {
  constructor() {
    super("The entry cannot be read.");
    this.name = "UnreadableEntry";
  }
}

/**
 * What an id may not hold: a control character (a tab and a line break too), a format character
 * (zero-width, bidirectional, soft hyphen, byte order mark, tags: two ids would look alike), or a
 * lone surrogate, which Postgres does not store.
 */
const UNSAFE_ID = /[\p{Cc}\p{Cf}\u{D800}-\u{DFFF}]/u;

/**
 * An https address, written as such: a host, no user name or password, no blank or control
 * character in it. What `new URL` makes of it is checked as well (a port out of range, a host with a
 * character that no host has).
 */
const RECORD_URL = /^https:\/\/[^\s/?#\\@]+(?:[/?#]\S*)?$/;
/**
 * What an address may not hold, because the model would read it as markup or a quotation, or would
 * not see it: `<`, `>`, `"`, a backtick, a backslash, `^`, `{`, `|`, `}`, white space, a control
 * character and a format character (a bidirectional override, a zero-width space). `new URL` would
 * write most of these as percent escapes, and a backslash as a slash, so what is stored would not
 * be what the list wrote; an address that holds one is not one that a list publishes.
 */
const UNSAFE_URL = /[<>"`\\^{|}\s\p{Cc}\p{Cf}]/u;

/** The label of a host: letters, digits, hyphens and underscores, up to 63, none at either end. */
const HOST_LABEL = "[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?";
/** A host of a website: two labels or more. */
const HOST = new RegExp(`^(?:${HOST_LABEL}\\.)+${HOST_LABEL}$`);
/** A label of digits only: the last label of an address of the Internet protocol, and of no name. */
const NUMERIC_LABEL = /^[0-9]+$/;

/**
 * The address as `new URL` writes it (`href`: the host in lower case, no default port, no dot
 * segments, a slash for an empty path, a host in ASCII, percent escapes for the rest), which is
 * what the evidence pack compares addresses by. The text given is read to RECORD_URL_MAX units at
 * most, and the limit applies to the form stored as well, which can be longer.
 */
function urlOf(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > RECORD_URL_MAX ||
    !RECORD_URL.test(value) ||
    UNSAFE_URL.test(value)
  ) {
    throw new UnreadableEntry();
  }
  let href: string;
  try {
    const url = new URL(value);
    if (url.hostname === "") throw new UnreadableEntry();
    href = url.href;
  } catch {
    throw new UnreadableEntry();
  }
  if (href.length > RECORD_URL_MAX) throw new UnreadableEntry();
  return href;
}

/**
 * The phrase that the analysis prompt reads, in the text of a record, as the way the vendor was
 * matched to it (prompts.ts: a text with "Lookup note" matched by name only). The lookup appends
 * its own note to a record that matched by name; a cell that holds the phrase must not make a
 * strong match read as a weak one, so it is written with a hyphen, whatever its case and white space.
 */
const LOOKUP_NOTE = /lookup\s+note/gi;

/** The identifiers as JSON makes them: a copy, with no undefined, no date and no function. */
function identifiersOf(value: unknown): Record<string, unknown> {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new UnreadableEntry();
  }
  if (json === undefined || json.length > IDENTIFIERS_MAX_CHARS) throw new UnreadableEntry();
  const copy: unknown = JSON.parse(json);
  if (!isObject(copy)) throw new UnreadableEntry();
  return copy;
}

/** A key that an index entry can hold, and a vendor's name or number can be. */
const fits = (key: string): boolean => key.length <= MATCH_KEY_MAX_CHARS;

/**
 * The texts that a key may be made of, each folded as a cell is (`lineOf`: NFKC, the characters
 * nobody sees out, one blank for white space), so that the same name in two forms of Unicode, or
 * in full-width letters, is one key. A text longer than KEY_SOURCE_MAX_CHARS as it is given is no
 * name or number and is not read, which keeps a huge cell from costing a pass over it; one that
 * the fold makes longer than that is none either (the line is asked one unit more than it may
 * have, so that a cut line is seen as too long and never used). Nothing is left of a text that was
 * all hidden characters.
 */
function foldedTexts(texts: readonly string[]): string[] {
  const folded: string[] = [];
  for (const text of texts) {
    if (typeof text !== "string" || text.length > KEY_SOURCE_MAX_CHARS) continue;
    const line = lineOf(text, KEY_SOURCE_MAX_CHARS + 1);
    if (line !== "" && line.length <= KEY_SOURCE_MAX_CHARS) folded.push(line);
  }
  return folded;
}

/**
 * The keys of the hosts of websites: no host where many have pages, no address of the Internet
 * protocol (a host whose last label is all digits: no top-level domain is), and no text that is
 * no host. Each once, in order, at most DOMAIN_KEYS_MAX.
 */
function domainKeysOf(hosts: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const host of hosts) {
    if (keys.size >= DOMAIN_KEYS_MAX) break;
    const key = domainKey(host);
    const name = key.slice(DOMAIN_PREFIX.length);
    if (name.length > HOST_MAX_CHARS || !HOST.test(name) || isSharedHost(name)) continue;
    if (NUMERIC_LABEL.test(name.slice(name.lastIndexOf(".") + 1))) continue;
    keys.add(key);
  }
  return [...keys];
}

/**
 * The keys of a draft: names, LEIs, numbers and hosts, each once, in that order (the strongest
 * kinds last to be cut), capped.
 */
function matchKeysOf(draft: RecordDraft): string[] {
  const names = nameKeysOf(foldedTexts(draft.names)).filter(fits).slice(0, NAME_KEYS_MAX);
  const leis = foldedTexts(draft.leis ?? [])
    .filter(isLei)
    .map(leiKey);
  const numbers = identifierKeysOf(foldedTexts(draft.regnos ?? [])).filter(fits);
  const domains = domainKeysOf(draft.domains ?? []);
  return [...new Set([...names, ...leis, ...numbers, ...domains])].slice(0, MATCH_KEYS_MAX);
}

/**
 * The record of a draft. It throws `UnreadableEntry` when the id is empty, only blanks, longer than
 * RECORD_ID_MAX or holds a control character, a format character or a lone surrogate; when the
 * type is empty or longer than RECORD_TYPE_MAX; when the title or the summary is empty once
 * cleaned; when the address is not an https address, holds a blank, a control or format character
 * or one of < > " ` \ ^ { | }, does not parse as an address, or is longer than RECORD_URL_MAX as
 * given or as stored; when `publishedAt` is neither null nor a day that exists; when
 * `sourceUpdatedAt` is neither null nor an ISO 8601 time that falls in the years 1 to 9999; and
 * when the identifiers are not an object, not JSON, or longer than IDENTIFIERS_MAX_CHARS as JSON.
 *
 * The title is a line (`lineOf`), the summary the caller's sentences as one line without the
 * controls, the characters nobody sees and the extra blanks (`flatText`: nothing is folded or
 * changed in them, and a cut is at the end only), and neither holds `<` or `>`: they are written as
 * the angle quotation marks (`withoutAngles`), which no markup is made of. The phrase "lookup
 * note", in any case and with any white space in it, is written "lookup-note" in the summary: the
 * analysis prompt reads it as the way the vendor was matched, and only the lookup says that.
 * The address is stored as `new URL` writes it.
 */
export function recordOf(draft: RecordDraft): ParsedRecord {
  const { id } = draft;
  // The union of types is closed in the registry; the guards below see it as the text that the
  // column holds, so that a type added there later still has to fit it.
  const type: string = draft.type;
  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    id.length > RECORD_ID_MAX ||
    UNSAFE_ID.test(id)
  ) {
    throw new UnreadableEntry();
  }
  if (typeof type !== "string" || type === "" || type.length > RECORD_TYPE_MAX) {
    throw new UnreadableEntry();
  }

  const title = withoutAngles(lineOf(draft.title, RECORD_TITLE_MAX));
  // The cut comes before the rewrite of the phrase, which is as long as the phrase it replaces.
  const summary = withoutAngles(
    shorten(flatText(stringOf(draft.summary)), RECORD_SUMMARY_MAX).replace(
      LOOKUP_NOTE,
      "lookup-note",
    ),
  );
  if (title === "" || summary === "") throw new UnreadableEntry();

  const url = urlOf(draft.url);

  const { publishedAt } = draft;
  if (
    publishedAt !== null &&
    (typeof publishedAt !== "string" || dayText(publishedAt) !== publishedAt)
  ) {
    throw new UnreadableEntry();
  }
  const sourceUpdatedAt = draft.sourceUpdatedAt ?? null;
  if (sourceUpdatedAt !== null && instantText(sourceUpdatedAt) === null) {
    throw new UnreadableEntry();
  }

  return {
    sourceRecordId: id,
    recordType: draft.type,
    title,
    summary,
    url,
    identifiers: identifiersOf(draft.identifiers),
    matchKeys: matchKeysOf(draft),
    publishedAt,
    sourceUpdatedAt,
  };
}
