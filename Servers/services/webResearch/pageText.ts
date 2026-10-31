/**
 * Turns the HTML of a public page into what the research agent reads: its text, title,
 * publication date, links and a focused excerpt.
 *
 * Whoever owns the site wrote the HTML, so nothing here trusts its shape or its size, and every
 * step runs in time proportional to the input:
 *
 * - Text comes from `sanitize-html`, which reads malformed pages safely. Its parser (htmlparser2)
 *   takes time proportional to the square of how deeply tags stay open: 2 MB of `<span>` that
 *   never close keeps the event loop busy for about a minute. Block tags are therefore replaced by
 *   line breaks before the parser sees them, and the parser's own open and close events count how
 *   deep the page really goes. The parser also searches its whole stack of open tags for every end
 *   tag and every `<form`, and fires no event when it finds nothing, so its work is the depth of
 *   the page times the number of its `<`. A page may nest only as deep as MAX_STACK_STEPS divided
 *   by that number (see nestingLimit); one that goes deeper is given up on while the parser is
 *   still cheap.
 * - The title, date and links are read from the raw HTML with patterns in which a tag cannot reach
 *   past the next `<`. A pattern that scans on to a `>` from every unclosed start would be
 *   quadratic: an unclosed `<a href="` repeated for 2 MB would cost every start the rest of the
 *   page.
 * - At most the first 2 MB of the HTML is read.
 */
import sanitizeHtml from "sanitize-html";
import { cleanText, cutAtCodePoint } from "../vendorResearch/text";
import { MAX_URL_CHARS, isOnDomain } from "./publicUrl";

export const MAX_EXCERPT_CHARS = 8000;
/** Stands for the text an excerpt leaves out. The model is told that a quote cannot span it. */
export const EXCERPT_GAP = "\n[…]\n";
/** The most parts a page is cut into (about 320,000 characters); a longer page is not offered further. */
export const MAX_PAGE_PARTS = 40;
/**
 * The parts of a page, besides its first excerpt, that its source can hold. The model is shown
 * only what the evidence keeps, so that a quote it takes from a part is a quote the validation can
 * find.
 */
export const MAX_EXTRA_PARTS = 2;
/** The most text a page source holds: the first excerpt and the extra parts, each behind a gap marker. */
export const MAX_PAGE_CONTENT_CHARS =
  MAX_EXCERPT_CHARS * (1 + MAX_EXTRA_PARTS) + EXCERPT_GAP.length * MAX_EXTRA_PARTS;

export interface PageLink {
  text: string;
  url: string;
}

export interface PageText {
  title: string;
  text: string;
  /** An ISO 8601 date (UTC) that the page itself states, or null. */
  publishedAt: string | null;
  links: PageLink[];
  /**
   * The address the page claims for itself (`<link rel="canonical">`, else `og:url`), resolved
   * against the base URL, or null. It is the page's own word: whether to take it is for the caller.
   */
  canonicalUrl: string | null;
}

/** The same size as the fetch limit; a page that is longer is read as far as this. */
const MAX_HTML_CHARS = 2_097_152;
/**
 * How many entries of its stack of open tags the parser may search, counted once for every `<` of
 * the page. A `<` can make it search the whole stack twice (an end tag with an svg name inside a
 * foreignObject), so all the searches of a page add up to at most twice this: about 0.2 s. A page
 * that nests deeper than this divided by its number of `<` gives no text; no real page comes near.
 */
const MAX_STACK_STEPS = 50_000_000;
const MAX_ANCHORS = 500;
const MAX_LINK_TEXT_CHARS = 80;
const MAX_TITLE_CHARS = 300;
/** How far after a start tag the text of a title, a heading or a link is looked for. */
const INNER_TEXT_WINDOW = 1000;
/** The attributes of a tag that is longer than this are not read. */
const MAX_ATTRIBUTE_CHARS = 4096;
const MAX_META_TAGS = 200;
const MAX_LINK_TAGS = 50;
const MAX_TIME_TAGS = 20;
const MAX_HEADINGS = 3;
const MAX_JSON_LD_DATES = 5;
const DEFAULT_MAX_LINKS = 25;
/** The excerpt of a long page starts with this much of its beginning. */
const EXCERPT_HEAD_CHARS = 1000;
const MAX_FOCUS_CHARS = 200;
const MAX_FOCUS_WORDS = 8;
const MIN_FOCUS_WORD_CHARS = 3;
/** A page of at least this many characters of HTML ... */
const SHELL_MIN_HTML_CHARS = 20_000;
/** ... with fewer than this many characters of text is an empty shell for a script. */
export const SHELL_MAX_TEXT_CHARS = 500;

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["mdash", "—"],
  ["hellip", "…"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["laquo", "«"],
  ["raquo", "»"],
  ["bull", "•"],
  ["middot", "·"],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"],
  ["deg", "°"],
  ["euro", "€"],
  ["pound", "£"],
]);

const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi;

/** A code point that is a character: not NUL, not beyond Unicode and not half of a surrogate pair. */
const isCharacter = (codePoint: number): boolean =>
  codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);

/**
 * Decodes the character references of HTML text in one pass: the common named ones and every
 * numeric one, so `&amp;lt;` becomes `&lt;` and no more. A name that is not in the table and a
 * number that is not a character stay as they were written.
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES.get(body) ?? entity;
    const hexadecimal = body[1] === "x" || body[1] === "X";
    const codePoint = hexadecimal ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return isCharacter(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

/**
 * Cleans text for reading: control characters out, every run of white space other than a line
 * break (a non-breaking space too) one space, no space beside a line break, no more than one
 * blank line in a row, and no white space at either end.
 */
export function tidyText(text: string): string {
  return cleanText(text)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Its content is not text of the page: `sanitize-html` drops these tags with what is inside. */
const NON_TEXT_TAGS = [
  "script",
  "style",
  "textarea",
  "option",
  "noscript",
  "svg",
  "iframe",
  "template",
  "head",
  "nav",
  "footer",
  "header",
  "aside",
];

/**
 * What can stand between the name of a tag and its `>`. A quoted value may hold a `>` (Vue and
 * Alpine write `x-show="a > b"`), but no quote reaches past a `<`, and neither does anything else
 * here, so a tag that is never closed costs only the stretch up to the next `<`. An odd quote
 * (`title=Bob's`) makes the first form fail; the second then ends the tag at the first `>`.
 */
const TAG_REST = `(?:(?:[^<>"']|"[^"<]*"|'[^'<]*')*|[^<>]*)`;

/** A block tag, opening or closing, as a whole. `(?=[\s/>])` keeps `pre` from matching `preview`. */
const BLOCK_TAG = new RegExp(
  `<\\/?(?:p|div|br|li|tr|td|th|h[1-6]|section|article|main|ul|ol|table|blockquote|pre|form|dl|dt|dd|details|summary|figure|figcaption|address|fieldset|legend|caption|dialog|hr|hgroup|menu)(?=[\\s/>])${TAG_REST}>`,
  "gi",
);

/** Thrown from a parser callback to stop the parser of a page that nests too deep. */
class NestingTooDeep extends Error {}

/**
 * How many tags the parser may keep open at once for this markup. Every search of its stack starts
 * at a `<` (an end tag, or a `<form` that it checks against the forms that are open), and a search
 * that finds nothing fires no event that could be counted: the number of `<` bounds the work, not
 * the number of events. Keeping the depth within MAX_STACK_STEPS divided by that number bounds the
 * searches, and the cost of pushing to and popping from a deep stack as well.
 */
function nestingLimit(markup: string): number {
  let angles = 1;
  for (let at = markup.indexOf("<"); at !== -1; at = markup.indexOf("<", at + 1)) angles += 1;
  return Math.floor(MAX_STACK_STEPS / angles);
}

/**
 * The text of the page, or "" for a page that keeps more tags open at once than nestingLimit
 * allows it.
 *
 * Open tags are counted from the events of the parser itself (`onOpenTag` and `onCloseTag`, which
 * include the tags that the parser closes by itself), so the count is the depth the parser
 * really has, whatever the markup is: an end tag in a comment, in an attribute value or in a
 * script is not one to the parser, and not to this count either.
 */
export function htmlToText(html: string): string {
  const markup = html.replace(BLOCK_TAG, "\n");
  const limit = nestingLimit(markup);
  let open = 0;
  let stripped: string;
  try {
    stripped = sanitizeHtml(markup, {
      allowedTags: [],
      allowedAttributes: {},
      nonTextTags: NON_TEXT_TAGS,
      onOpenTag: () => {
        open += 1;
        if (open > limit) throw new NestingTooDeep();
      },
      onCloseTag: () => {
        open -= 1;
      },
    });
  } catch (error) {
    if (error instanceof NestingTooDeep) return "";
    throw error;
  }
  // sanitize-html has decoded the references of the page and written text back with & < > escaped,
  // which is the one decoding that is left to do.
  return tidyText(decodeEntities(stripped));
}

/** A tag with its attributes (the third group), and none that reaches past the next `<`. */
const TAG = new RegExp(`<(\\/?)([a-z][a-z0-9:-]*)(?=[\\s/>])(${TAG_REST})>`, "gi");
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;
/** Any tag, or the start of one that is not closed, in a short stretch of text. */
const TAG_IN_TEXT = /<[^<>]*>?/g;

export function parseAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  if (raw.length > MAX_ATTRIBUTE_CHARS) return attributes;
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The text that follows `from`, up to `stop` or at most INNER_TEXT_WINDOW characters: tags
 * stripped, references decoded, white space collapsed.
 */
function textAfter(html: string, from: number, stop: RegExp): string {
  const nearby = html.slice(from, from + INNER_TEXT_WINDOW);
  const end = nearby.search(stop);
  const inner = end < 0 ? nearby : nearby.slice(0, end);
  return collapseWhitespace(cleanText(decodeEntities(inner.replace(TAG_IN_TEXT, " "))));
}

/** In the order in which they are trusted. */
const DATE_META_NAMES = [
  "article:published_time",
  "og:article:published_time",
  "datepublished",
  "dc.date.issued",
  "dcterms.issued",
  "dc.date",
  "dcterms.date",
  "pubdate",
  "publishdate",
  "date",
];

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d{1,9})?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

/**
 * An ISO 8601 date or date and time as an ISO string in UTC, else null. A time with no offset is
 * taken as UTC, so the answer does not depend on the time zone of the server. A date that does not
 * exist (30 February) is refused. Other forms ("March 4, 2026") are not read: what a parser makes
 * of them depends on its locale.
 */
export function toIsoDate(value: string): string | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day)) {
    return null;
  }
  const time = hour === undefined ? "" : `T${hour}:${minute}:${second ?? "00"}${offset ?? "Z"}`;
  const date = new Date(`${year}-${month}-${day}${time}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const JSON_LD_DATE = /"datePublished"\s{0,20}:\s{0,20}"([^"<>]{1,64})"/g;

interface Markup {
  title: string;
  heading: string;
  publishedAt: string | null;
  links: PageLink[];
  canonicalUrl: string | null;
}

/** The address a `href` leads to, resolved against the page and without a fragment; null if it is not http or https. */
function resolveHref(href: string | undefined, baseUrl: string): string | null {
  if (href === undefined) return null;
  try {
    const url = new URL(decodeEntities(href).trim(), baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/** The title, the first heading, the date and the links, read in one pass over the tags. */
function readMarkup(html: string, baseUrl: string): Markup {
  let title: string | null = null;
  let heading = "";
  let headings = 0;
  let metas = 0;
  let linkTags = 0;
  let times = 0;
  let anchors = 0;
  let timeDate: string | null = null;
  let canonicalLink: string | null = null;
  let ogUrl: string | null = null;
  const metaDates = new Map<string, string>();
  const links: PageLink[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(TAG)) {
    if (match[1] === "/") continue;
    const name = match[2].toLowerCase();
    const end = (match.index ?? 0) + match[0].length;
    if (name === "title") {
      if (title === null) {
        const nearby = html.slice(end, end + INNER_TEXT_WINDOW);
        const stop = nearby.indexOf("<");
        title = collapseWhitespace(
          cleanText(decodeEntities(stop < 0 ? nearby : nearby.slice(0, stop))),
        );
      }
    } else if (name === "h1") {
      if (heading === "" && headings < MAX_HEADINGS) {
        headings += 1;
        heading = textAfter(html, end, /<\/h1\s*>/i);
      }
    } else if (name === "meta") {
      if (metas < MAX_META_TAGS) {
        metas += 1;
        const attributes = parseAttributes(match[3]);
        const content = attributes.get("content");
        if (ogUrl === null && attributes.get("property")?.trim().toLowerCase() === "og:url") {
          ogUrl = content?.trim() ? resolveHref(content, baseUrl) : null;
        }
        const date = toIsoDate(decodeEntities(content ?? ""));
        if (date !== null) {
          for (const field of ["property", "name", "itemprop"]) {
            const key = attributes.get(field)?.trim().toLowerCase();
            if (key !== undefined && DATE_META_NAMES.includes(key) && !metaDates.has(key)) {
              metaDates.set(key, date);
            }
          }
        }
      }
    } else if (name === "link") {
      if (linkTags < MAX_LINK_TAGS) {
        linkTags += 1;
        if (canonicalLink === null) {
          const attributes = parseAttributes(match[3]);
          const href = attributes.get("href");
          const relations = attributes.get("rel")?.toLowerCase().split(/\s+/);
          if (relations?.includes("canonical") && href?.trim()) {
            canonicalLink = resolveHref(href, baseUrl);
          }
        }
      }
    } else if (name === "time") {
      if (timeDate === null && times < MAX_TIME_TAGS) {
        times += 1;
        timeDate = toIsoDate(decodeEntities(parseAttributes(match[3]).get("datetime") ?? ""));
      }
    } else if (name === "a") {
      if (anchors < MAX_ANCHORS) {
        anchors += 1;
        const url = resolveHref(parseAttributes(match[3]).get("href"), baseUrl);
        if (url !== null && !seen.has(url)) {
          seen.add(url);
          const text = textAfter(html, end, /<\/a\s*>|<a[\s>]/i);
          links.push({ text: cutAtCodePoint(text, MAX_LINK_TEXT_CHARS).trimEnd(), url });
        }
      }
    }
  }

  let publishedAt: string | null = null;
  for (const key of DATE_META_NAMES) publishedAt ??= metaDates.get(key) ?? null;
  if (publishedAt === null) {
    let found = 0;
    for (const match of html.matchAll(JSON_LD_DATE)) {
      publishedAt = toIsoDate(decodeEntities(match[1]));
      found += 1;
      if (publishedAt !== null || found >= MAX_JSON_LD_DATES) break;
    }
  }
  return {
    title: cutAtCodePoint(title ?? "", MAX_TITLE_CHARS),
    heading: cutAtCodePoint(heading, MAX_TITLE_CHARS),
    publishedAt: publishedAt ?? timeDate,
    links,
    canonicalUrl: canonicalLink ?? ogUrl,
  };
}

/**
 * The text of a page (see the module comment), its title (the `<title>`, else the first `<h1>`,
 * else an empty string), the date it states for itself (a meta tag, else JSON-LD, else a `<time>`
 * element, else null; a source with a value that cannot be read is passed over) and its links.
 * The links come from the whole page, the navigation and footer included, resolved against
 * `baseUrl`; they have no fragment, appear once, and are http or https only. The address the page
 * claims for itself is read from the first `<link rel="canonical">` among the first 50 link tags,
 * else from `og:url`.
 */
export function extractPageText(html: string, baseUrl: string): PageText {
  const source = cutAtCodePoint(html, MAX_HTML_CHARS);
  const { title, heading, publishedAt, links, canonicalUrl } = readMarkup(source, baseUrl);
  return { title: title || heading, text: htmlToText(source), publishedAt, links, canonicalUrl };
}

const TOPIC =
  /security|trust|privacy|legal|terms|sub-?processor|compliance|certif|gdpr|status|incident|vulnerab|disclosure|cookie|(?:^|[^a-z])(?:ai|dpa|soc|iso)(?![a-z])/i;

function withoutFragment(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The links that lead from a page of the vendor to the pages worth reading: on `domain` or one
 * of its subdomains, not the page itself, and with security, trust, privacy, legal, compliance or
 * a similar word in the text or the path. "AI", "SOC", "ISO" and "DPA" count as words only, not
 * as parts of "email", "social" or "advisory". In the order of the page, at most `max`.
 *
 * A link whose URL is longer than MAX_URL_CHARS is left out and not counted: the model could not
 * read it, and percent-encoding can make the URLs of one page hundreds of kilobytes of prompt.
 */
export function relevantLinks(
  links: PageLink[],
  domain: string,
  selfUrl: string,
  max: number = DEFAULT_MAX_LINKS,
): PageLink[] {
  const self = withoutFragment(selfUrl);
  const kept: PageLink[] = [];
  for (const link of links) {
    if (kept.length >= max) break;
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (!isOnDomain(url.hostname, domain)) continue;
    url.hash = "";
    if (url.href.length > MAX_URL_CHARS || url.href === self) continue;
    if (TOPIC.test(`${link.text} ${url.pathname}`)) kept.push(link);
  }
  return kept;
}

/** A page is an empty shell for a script when it is large and holds hardly any text. */
export function looksLikeJavaScriptShell(html: string, text: string): boolean {
  return html.length >= SHELL_MIN_HTML_CHARS && text.length < SHELL_MAX_TEXT_CHARS;
}

function focusWords(focus: string | undefined): string[] {
  if (!focus) return [];
  const words = focus
    .slice(0, MAX_FOCUS_CHARS)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_FOCUS_WORD_CHARS);
  return [...new Set(words)].slice(0, MAX_FOCUS_WORDS);
}

interface Paragraph {
  start: number;
  end: number;
  hits: number;
}

/** The paragraphs that start at or after `from` and hold at least one of the words, in page order. */
function paragraphsWith(text: string, from: number, words: string[]): Paragraph[] {
  const found: Paragraph[] = [];
  const consider = (start: number, end: number) => {
    if (start < from || end <= start) return;
    const paragraph = text.slice(start, end).toLowerCase();
    const hits = words.reduce((count, word) => count + (paragraph.includes(word) ? 1 : 0), 0);
    if (hits > 0) found.push({ start, end, hits });
  };
  let start = 0;
  for (const separator of text.matchAll(/\n{2,}/g)) {
    consider(start, separator.index ?? 0);
    start = (separator.index ?? 0) + separator[0].length;
  }
  consider(start, text.length);
  return found;
}

/**
 * At most `maxChars` (default MAX_EXCERPT_CHARS) of `text`; `truncated` says whether something
 * was left out. A text within the limit is returned whole.
 *
 * Without `focus` the excerpt is the start of the text. With `focus`, a few keywords, it is the
 * first 1,000 characters followed by the paragraphs that hold the most of the keywords, as many as
 * fit, in the order of the page. A gap marker (EXCERPT_GAP) stands where text was left out, so a
 * quote must not span it; two paragraphs that are next to each other on the page are joined by a
 * blank line instead. A paragraph that does not fit is cut to the room that is left. When no
 * paragraph beyond the first 1,000 characters holds a keyword, the excerpt is the start of the
 * text, as without `focus`.
 */
export function selectExcerpt(
  text: string,
  options: { maxChars?: number; focus?: string } = {},
): { excerpt: string; truncated: boolean } {
  const maxChars = options.maxChars ?? MAX_EXCERPT_CHARS;
  if (text.length <= maxChars) return { excerpt: text, truncated: false };
  const fromStart = { excerpt: cutAtCodePoint(text, maxChars), truncated: true };

  const words = focusWords(options.focus);
  if (words.length === 0 || maxChars <= EXCERPT_HEAD_CHARS) return fromStart;
  const head = cutAtCodePoint(text, EXCERPT_HEAD_CHARS);
  const candidates = paragraphsWith(text, head.length, words);
  if (candidates.length === 0) return fromStart;

  // The best paragraphs first; the sort is stable, so equal ones stay in the order of the page.
  candidates.sort((a, b) => b.hits - a.hits);
  const chosen: Array<{ start: number; end: number | null; text: string }> = [];
  let room = maxChars - head.length;
  for (const candidate of candidates) {
    const available = room - EXCERPT_GAP.length;
    if (available <= 0) break;
    const whole = text.slice(candidate.start, candidate.end);
    const piece = cutAtCodePoint(whole, available);
    chosen.push({
      start: candidate.start,
      end: piece === whole ? candidate.end : null,
      text: piece,
    });
    room -= EXCERPT_GAP.length + piece.length;
    if (piece !== whole) break;
  }

  chosen.sort((a, b) => a.start - b.start);
  let excerpt = head;
  let previousEnd: number | null = head.length;
  for (const piece of chosen) {
    const adjacent = previousEnd !== null && /^\s*$/.test(text.slice(previousEnd, piece.start));
    excerpt += (adjacent ? "\n\n" : EXCERPT_GAP) + piece.text;
    previousEnd = piece.end;
  }
  return { excerpt, truncated: true };
}

/**
 * Where a window of text is cut: before its last blank line, else its last line break, else its
 * last space, whichever is first in that order and lies past the middle of the window; else at the
 * end of the window.
 */
function cutPoint(window: string): number {
  const middle = window.length / 2;
  for (const separator of ["\n\n", "\n", " "]) {
    const at = window.lastIndexOf(separator);
    if (at > middle) return at;
  }
  return window.length;
}

/**
 * The text of a long page cut into parts of at most `maxChars` (default MAX_EXCERPT_CHARS), in the
 * order of the page, so that a model can ask for the next one. The cuts fall at a paragraph, a
 * line or a word (see `cutPoint`), never inside a surrogate pair, and the whitespace at a cut is
 * dropped. A text that fits is one part, as it is. At most MAX_PAGE_PARTS parts are made; the rest
 * of a longer page is left out.
 */
export function pageParts(text: string, maxChars: number = MAX_EXCERPT_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0 && parts.length < MAX_PAGE_PARTS) {
    if (rest.length <= maxChars) {
      parts.push(rest);
      break;
    }
    const window = cutAtCodePoint(rest, maxChars);
    const end = cutPoint(window);
    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  return parts;
}
