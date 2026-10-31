/**
 * The status page of a vendor: the incidents it published about its own service, as sources for
 * the category availability. A status page is the vendor's own account of an outage or a lasting
 * degradation, with the day and the words of its updates.
 *
 * What is read is the Atom feed of the incident history (`/history.atom`), which Atlassian
 * Statuspage and incident.io serve to the people who subscribe to a status page. Their JSON API is
 * not used: the robots.txt of those pages disallows `/api/` to every robot, and the feed is the
 * machine-readable form that the page offers. The feed has no impact level, so what it gives is
 * the facts: how many incidents the window holds, and the words of the newest ones.
 *
 * Which host holds the status page is guessed from the domain of the vendor (see statusHostsOf), so
 * a host that has no feed is the usual answer and no failure; and a feed that a guess outside the
 * vendor's own domain found is the vendor's only when it names the vendor.
 */
import { decodeEntities, htmlToText } from "../../webResearch/pageText";
import { brandOf } from "../identity";
import { cutAtCodePoint } from "../text";
import { compactName } from "./match";
import { joinSentences, sentence } from "./sentence";
import { MAX_RECORDS, type SourceRecord } from "./types";

/** The feeds are 100 KB for a vendor with an incident a day. */
export const STATUS_FEED_MAX_BYTES = 2 * 1024 * 1024;

const MAX_ENTRIES = 200;
const MAX_TEXT_CHARS = 1500;
const MAX_TITLE_CHARS = 200;
const MAX_NAME_CHARS = 100;
/** The summary is one of the records; the others are incidents. */
const MAX_INCIDENT_RECORDS = MAX_RECORDS.statuspage - 1;

export const statusFeedUrl = (host: string): string => `https://${host}/history.atom`;
export const statusHistoryUrl = (host: string): string => `https://${host}/history`;

export interface StatusHost {
  host: string;
  /** Under the vendor's own domain, so that it is the vendor's whatever the feed is called. */
  own: boolean;
}

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The hosts that may hold the status page of the vendor, the surest first: under its own domain
 * (`status.acme.com`), the tenant that Atlassian Statuspage gives a company by its brand
 * (`acme.statuspage.io`, which sends to the address of the company when it has one) and the site
 * that companies name after themselves (`acmestatus.com`). The last two could be another
 * company's, so a feed from them is the vendor's only when it names the vendor (see
 * statusFeedNamesVendor). The home page of the vendor is not asked for its links: the page keeps
 * only the links to its trust and privacy pages (see relevantLinks).
 */
export function statusHostsOf(domain: string): StatusHost[] {
  const hosts: StatusHost[] = [{ host: `status.${domain}`, own: true }];
  const brand = brandOf(domain);
  if (DNS_LABEL.test(brand)) {
    hosts.push(
      { host: `${brand}.statuspage.io`, own: false },
      { host: `${brand.replace(/-/g, "")}status.com`, own: false },
    );
  }
  return hosts;
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

export interface StatusEntry {
  /** The id of the incident in its address, or null when the address has none. */
  id: string | null;
  title: string;
  /** YYYY-MM-DD, UTC. */
  day: string;
  /** The updates of the incident, as plain text. */
  text: string;
  /** A planned maintenance, which is no incident. */
  maintenance: boolean;
}

export interface StatusFeed {
  /** The name of the status page, without "Incident History"; empty when the feed names none. */
  name: string;
  entries: StatusEntry[];
}

const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

/** Whether the character after the name of a tag ends the name: `<title>` and `<title lang>`, not `<titles>`. */
const endsTagName = (character: string): boolean => /^[\s>/]$/.test(character);

/** What may stand before the root of a document: a processing instruction (the XML declaration, a style sheet) and a comment. */
const PROLOG = [
  { open: "<?", close: "?>" },
  { open: "<!--", close: "-->" },
];

/** The index of the first character at or after `from` that is not white space (to `\s`, a byte order mark is white space). */
function skipSpace(xml: string, from: number): number {
  let position = from;
  while (position < xml.length && /\s/.test(xml.charAt(position))) position += 1;
  return position;
}

/**
 * Whether the root of the document is `<feed`. The prolog is read by hand and not with a pattern:
 * comments in a row make a pattern that takes exponential time to fail.
 */
function isAtomFeed(xml: string): boolean {
  let position = skipSpace(xml, 0);
  for (;;) {
    const skipped = PROLOG.find(({ open }) => xml.startsWith(open, position));
    if (skipped === undefined) break;
    const end = xml.indexOf(skipped.close, position + skipped.open.length);
    if (end === -1) return false;
    position = skipSpace(xml, end + skipped.close.length);
  }
  return xml.startsWith("<feed", position) && endsTagName(xml.charAt(position + "<feed".length));
}

/** The index of the next `close` at or after `from`, which is never inside a CDATA section; -1 for none. */
function indexOfClose(xml: string, close: string, from: number): number {
  let position = from;
  for (;;) {
    const next = xml.indexOf("<", position);
    if (next === -1) return -1;
    if (xml.startsWith(CDATA_OPEN, next)) {
      const end = xml.indexOf(CDATA_CLOSE, next + CDATA_OPEN.length);
      if (end === -1) return -1;
      position = end + CDATA_CLOSE.length;
    } else if (xml.startsWith(close, next)) {
      return next;
    } else {
      position = next + 1;
    }
  }
}

/**
 * The first element named `tag` at or after `from`: the index of its opening and of the end of
 * its closing tag, and what is between its tags (empty for `<tag/>`). Null when there is none.
 */
function elementAt(
  xml: string,
  tag: string,
  from: number,
): { start: number; end: number; inner: string } | null {
  let position = from;
  for (;;) {
    const start = xml.indexOf(`<${tag}`, position);
    if (start === -1) return null;
    if (!endsTagName(xml.charAt(start + tag.length + 1))) {
      position = start + 1;
      continue;
    }
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd === -1) return null;
    if (xml.charAt(tagEnd - 1) === "/") return { start, end: tagEnd + 1, inner: "" };
    const close = `</${tag}>`;
    const closeAt = indexOfClose(xml, close, tagEnd + 1);
    if (closeAt === -1) return null;
    return { start, end: closeAt + close.length, inner: xml.slice(tagEnd + 1, closeAt) };
  }
}

const elementOf = (xml: string, tag: string): string | null =>
  elementAt(xml, tag, 0)?.inner ?? null;

/** The text of an element: its escapes decoded once, and what a CDATA section holds as it is. */
function xmlText(inner: string): string {
  let text = "";
  let position = 0;
  for (const section of inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    text += decodeEntities(inner.slice(position, section.index)) + section[1];
    position = section.index + section[0].length;
  }
  return text + decodeEntities(inner.slice(position));
}

/**
 * The words of a piece of HTML as plain text, on one line: the text of the page reader (a break or
 * the end of a block separates words, any other tag goes without a space, a script or a style goes
 * with what it holds, the references are decoded once), with every run of white space one space.
 * The page reader does the work because it takes time in proportion to the size of what it is
 * given, whatever that is; the patterns this module had for it did not.
 */
const textOfMarkup = (markup: string): string => htmlToText(markup).replace(/\s+/g, " ");

/** A text of a feed cut to a limit, without the space that the cut may leave at its end. */
const cut = (text: string, max: number): string => cutAtCodePoint(text, max).trim();

const RFC_3339 =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/** The UTC day of a date of a feed, or null for anything that is no date. */
function dayOf(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (!RFC_3339.test(text)) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

const INCIDENT_PATH = /\/incidents\/([A-Za-z0-9]{1,40})\/?$/;

/** The id of an incident in the address of its page; null for any other address. */
function incidentIdOf(href: string | null): string | null {
  if (href === null) return null;
  try {
    return INCIDENT_PATH.exec(new URL(href).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function attributeOf(attributes: string, name: string): string | null {
  const found = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(
    attributes,
  );
  return found === null ? null : (found[1] ?? found[2] ?? "");
}

/**
 * The address a link of the entry gives for its page: `alternate`, or a link with no `rel`; a link
 * with no address is passed over. A tag reaches to the next `<` at most, so that one which is
 * never closed costs the stretch up to the next, and not the rest of the entry.
 */
function pageLinkOf(shell: string): string | null {
  for (const link of shell.matchAll(/<link\b([^<>]*)>/gi)) {
    const rel = attributeOf(link[1], "rel");
    if (rel !== null && rel.toLowerCase() !== "alternate") continue;
    const href = attributeOf(link[1], "href")?.trim() ?? "";
    if (href !== "") return decodeEntities(href);
  }
  return null;
}

const MAINTENANCE_LABELS: ReadonlySet<string> = new Set([
  "scheduled",
  "in progress",
  "verifying",
  "completed",
]);
const INCIDENT_LABELS: ReadonlySet<string> = new Set([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "postmortem",
]);

/**
 * A maintenance is told by the labels of its updates (Statuspage writes the status of each update
 * in bold): it has one of a maintenance and none of an incident. An entry with no label is an
 * incident. The white space around a label is bounded: a run of it without end would cost time in
 * proportion to its square.
 */
function isMaintenance(markup: string): boolean {
  const labels = [...markup.matchAll(/<strong>\s{0,20}([^<]{1,40}?)\s{0,20}<\/strong>/gi)].map(
    (label) => label[1].toLowerCase(),
  );
  return (
    labels.some((label) => MAINTENANCE_LABELS.has(label)) &&
    !labels.some((label) => INCIDENT_LABELS.has(label))
  );
}

/** The update of an entry as markup and as words: its content, else its summary when the content has no words. */
function updateOf(body: string): { markup: string; text: string } {
  for (const tag of ["content", "summary"]) {
    const markup = xmlText(elementOf(body, tag) ?? "");
    const text = textOfMarkup(markup);
    if (text !== "") return { markup, text };
  }
  return { markup: "", text: "" };
}

function entryOf(body: string): StatusEntry | null {
  // The tags of the entry itself, without what a CDATA section holds: a link inside the text is no link of the entry.
  const shell = body.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const day = dayOf(elementOf(shell, "published")) ?? dayOf(elementOf(shell, "updated"));
  if (day === null) return null;
  const update = updateOf(body);
  return {
    id: incidentIdOf(pageLinkOf(shell)),
    title: cut(textOfMarkup(xmlText(elementOf(body, "title") ?? "")), MAX_TITLE_CHARS),
    day,
    text: cut(update.text, MAX_TEXT_CHARS),
    maintenance: isMaintenance(update.markup),
  };
}

/** The entries of the feed: the text between `<entry>` and `</entry>`, the first MAX_ENTRIES. */
function entryBodies(xml: string): { head: string; bodies: string[] } {
  const bodies: string[] = [];
  let head: string | null = null;
  let position = 0;
  while (bodies.length < MAX_ENTRIES) {
    const entry = elementAt(xml, "entry", position);
    if (entry === null) break;
    head ??= xml.slice(0, entry.start);
    bodies.push(entry.inner);
    position = entry.end;
  }
  return { head: head ?? xml, bodies };
}

/**
 * The incident history of an Atom feed (Atlassian Statuspage, incident.io); null for anything else.
 * An entry with no date is left out: it cannot be placed in a window.
 */
export function parseStatusFeed(xml: string): StatusFeed | null {
  if (!isAtomFeed(xml)) return null;
  const { head, bodies } = entryBodies(xml);
  // The white space of the name was made single spaces, so that this pattern cannot backtrack.
  const name = textOfMarkup(xmlText(elementOf(head, "title") ?? "")).replace(
    /\s*[-–—:|]?\s*incident history\s*$/i,
    "",
  );
  return {
    name: cut(name, MAX_NAME_CHARS),
    entries: bodies.flatMap((body) => entryOf(body) ?? []),
  };
}

const MIN_NAME_CHARS = 3;

/**
 * Whether the name of the feed holds a name of the vendor (compact, see match.ts): the status
 * page of another company that has the same brand would give its incidents to the wrong vendor. A
 * name of one or two letters is in too many words to tell.
 */
export function statusFeedNamesVendor(feed: StatusFeed, keys: readonly string[]): boolean {
  const name = compactName(feed.name);
  return keys.some((key) => key.length >= MIN_NAME_CHARS && name.includes(key));
}

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

const count = (number: number, one: string, many: string): string =>
  `${number} ${number === 1 ? one : many}`;

/**
 * The records of a status page: a summary (how many entries the feed holds, how many incidents the
 * window has) and the newest incidents of the window, three at most. A planned maintenance is
 * counted and never given as a record, and an entry dated after today is not read. A page whose
 * window holds no incident gives none.
 *
 * @param input.host The host that was asked: the addresses of the records are on it, whatever the
 *   feed says.
 * @param input.cutoff The earliest day an incident may have (YYYY-MM-DD).
 */
export function statusRecords(
  feed: StatusFeed,
  input: { host: string; cutoff?: string; now: Date },
): { records: SourceRecord[]; omitted: { old?: number; more?: number } } {
  const { host, cutoff } = input;
  const today = input.now.toISOString().slice(0, 10);
  const entries = feed.entries.filter((entry) => entry.day <= today);
  const inWindow = entries.filter((entry) => cutoff === undefined || entry.day >= cutoff);
  const incidents = inWindow.filter((entry) => !entry.maintenance);
  const old = entries.filter((entry) => !entry.maintenance).length - incidents.length;
  if (incidents.length === 0) return { records: [], omitted: old > 0 ? { old } : {} };

  const newest = [...incidents].sort((a, b) => b.day.localeCompare(a.day));
  const days = entries.map((entry) => entry.day).sort();
  const listed = new Map<string, StatusEntry>();
  for (const incident of newest) {
    if (incident.id !== null && !listed.has(incident.id)) listed.set(incident.id, incident);
  }
  const shown = [...listed.entries()].slice(0, MAX_INCIDENT_RECORDS);
  const more = listed.size - shown.length;

  const page = feed.name === "" ? host : `${feed.name} (${host})`;
  const maintenance = inWindow.length - incidents.length;
  // A feed whose oldest entry is inside the window may have lost the incidents before it.
  const mayMissEarlier = cutoff !== undefined && days[0] >= cutoff;
  const summary: SourceRecord = {
    url: statusHistoryUrl(host),
    title: `${feed.name === "" ? host : feed.name}: incident history`,
    text: joinSentences([
      `Status page of ${page}.`,
      sentence(
        "Incident history feed",
        `${count(entries.length, "entry", "entries")}, from ${days[0]} to ${days[days.length - 1]}`,
      ),
      sentence(
        cutoff === undefined ? "Incidents in the feed" : `Incidents since ${cutoff}`,
        String(incidents.length),
      ),
      maintenance > 0 ? sentence("Scheduled maintenance", String(maintenance)) : "",
      mayMissEarlier
        ? "The feed lists only the latest entries, so earlier incidents are not counted."
        : "",
    ]),
    publishedAt: newest[0].day,
  };

  const records = shown.map(([id, incident]): SourceRecord => ({
    url: `https://${host}/incidents/${id}`,
    title: incident.title === "" ? `Incident of ${incident.day}` : incident.title,
    text: joinSentences([
      `Status page of ${page}.`,
      sentence("Incident", incident.title),
      sentence("Date", incident.day),
      sentence("Updates", incident.text),
    ]),
    publishedAt: incident.day,
  }));
  return {
    records: [summary, ...records],
    omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
  };
}
