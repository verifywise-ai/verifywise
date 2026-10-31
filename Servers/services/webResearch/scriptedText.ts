/**
 * The text of a page that a script builds, read from the data the page carries with it. No script
 * runs: the page is read as text, like every other.
 *
 * A page that is large and holds almost no text is a shell for a script (see
 * `looksLikeJavaScriptShell`), and the text a person sees is built in the browser. But the page
 * often carries that text with it, for the search engines and for its own first render:
 *
 * - `<script id="__NEXT_DATA__" type="application/json">`: the props a Next.js page was rendered
 *   from. Only `props.pageProps` is read; the rest of it is the build, the routes and the flags.
 * - `<script type="application/ld+json">`: structured data for crawlers (a FAQ, an article, an
 *   organization).
 * - `<noscript>`: the page for a browser that runs no script. Mostly a notice to enable scripts or
 *   a tracking pixel, both of which are passed over.
 *
 * What is taken out of the data is prose: a string of at least five words that reads as a
 * sentence, and not an address, an identifier, a list of class names or code. A string with markup
 * in it (a content system writes rich text so) is turned into text like a page. Keys that carry
 * addresses, styles and images are not read at all.
 *
 * Everything is bounded, because the page is written by a third party: at most MAX_DATA_SCRIPTS
 * scripts are read and none of more than MAX_SCRIPT_CHARS characters; the data is walked to a depth
 * of MAX_JSON_DEPTH, through at most MAX_JSON_NODES values, taking at most MAX_STRINGS strings,
 * without recursion; and the text is cut between sentences at MAX_SCRIPTED_CHARS. The search for the end of a script never starts again
 * after it found none, so a page of unclosed scripts costs one scan and not one for each.
 */
import { htmlToText, parseAttributes, tidyText } from "./pageText";

/** The most text that is returned. */
export const MAX_SCRIPTED_CHARS = 100_000;
/** The data scripts and the `<noscript>` blocks that are read, each. */
const MAX_DATA_SCRIPTS = 50;
const MAX_NOSCRIPTS = 50;
/** A script of more characters than this is not data of a page. */
const MAX_SCRIPT_CHARS = 1_500_000;
const MAX_JSON_DEPTH = 40;
const MAX_JSON_NODES = 50_000;
const MAX_STRINGS = 5000;

const MIN_PROSE_CHARS = 25;
const MIN_PROSE_WORDS = 5;
/** The share of a string that must be letters: a row of numbers and signs is not a sentence. */
const MIN_LETTER_SHARE = 0.6;
/** The share of words with a hyphen, underscore or colon in them from which a string is a list of class names. */
const CLASS_LIST_SHARE = 0.5;

/** The keys whose values are addresses, styles, images and the machinery of a page. */
const NOISE_KEYS: ReadonlySet<string> = new Set([
  "@context",
  "@id",
  "@type",
  "alt",
  "aspath",
  "assetprefix",
  "buildid",
  "canonical",
  "class",
  "classname",
  "color",
  "contenttype",
  "href",
  "icon",
  "id",
  "image",
  "images",
  "lang",
  "locale",
  "locales",
  "logo",
  "path",
  "pathname",
  "query",
  "sameas",
  "slug",
  "src",
  "srcset",
  "style",
  "url",
]);

/** The notices that a page shows to a browser without scripts. */
const NOTICE =
  /enable javascript|javascript (?:is|has been) (?:disabled|turned off|required|needed)|requires? javascript|javascript to (?:run|work|view)|your browser (?:does not|doesn.t) support/i;
const CODE = /[{}]|=>|\bfunction\s*\(|\b(?:var|let|const)\s+\w+\s*=/;
const LETTER = /\p{L}/gu;

/**
 * The prose in a string, or null. A string with markup is turned into text first. It must read as
 * a sentence: enough words and characters, mostly letters, and neither a list of class names, code
 * nor the notice of a page that needs scripts. (An address or an identifier is one word.)
 */
function proseOf(raw: string): string | null {
  const text = raw.includes("<") ? htmlToText(raw) : tidyText(raw);
  if (text.length < MIN_PROSE_CHARS || CODE.test(text)) return null;
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length < MIN_PROSE_WORDS) return null;
  const letters = text.match(LETTER)?.length ?? 0;
  if (letters / text.length < MIN_LETTER_SHARE) return null;
  const classLike = words.filter((word) => /[-_:]/.test(word) && !/[.,;!?]$/.test(word)).length;
  if (classLike / words.length >= CLASS_LIST_SHARE || NOTICE.test(text)) return null;
  return text;
}

/**
 * The strings of a value, in the order of the document, to a bounded depth and number of values.
 * The walk keeps its own stack: the data is a third party's, and a deep value must not be able to
 * end the walk with a stack overflow.
 */
function stringsOf(root: unknown): string[] {
  const found: string[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_JSON_NODES && found.length < MAX_STRINGS) {
    const { value, depth } = stack.pop() as { value: unknown; depth: number };
    visited += 1;
    if (typeof value === "string") {
      found.push(value);
    } else if (typeof value === "object" && value !== null && depth < MAX_JSON_DEPTH) {
      const children = Array.isArray(value)
        ? value
        : Object.entries(value)
            .filter(([key]) => !NOISE_KEYS.has(key.toLowerCase()))
            .map(([, child]) => child);
      // Pushed last first, so that the first child is the next to come off the stack.
      for (let index = Math.min(children.length, MAX_JSON_NODES) - 1; index >= 0; index -= 1) {
        stack.push({ value: children[index], depth: depth + 1 });
      }
    }
  }
  return found;
}

/** The data of a script, or undefined when it is not JSON. */
function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return undefined;
  }
}

const isNextData = (attributes: Map<string, string>): boolean =>
  attributes.get("id")?.trim() === "__NEXT_DATA__";
const isJsonLd = (attributes: Map<string, string>): boolean =>
  attributes.get("type")?.trim().toLowerCase() === "application/ld+json";

/** What a script holds that is text: the props of a Next.js page, or the whole of a JSON-LD block. */
function scriptStrings(attributes: Map<string, string>, source: string): string[] {
  if (isNextData(attributes)) {
    const data = parseJson(source) as { props?: { pageProps?: unknown } } | undefined;
    const props = data?.props?.pageProps;
    return typeof props === "object" && props !== null ? stringsOf(props) : [];
  }
  if (isJsonLd(attributes)) {
    const data = parseJson(source);
    return data === undefined ? [] : stringsOf(data);
  }
  return [];
}

const SCRIPT_OPEN = /<script\b([^<>]{0,1000})>/gi;
const SCRIPT_CLOSE = /<\/script\s*>/gi;
const NOSCRIPT_OPEN = /<noscript\b[^<>]{0,1000}>/gi;
const NOSCRIPT_CLOSE = /<\/noscript\s*>/gi;

/** A script that holds data: the attributes of its tag, what is in it, and where it stands in the page. */
interface DataScript {
  attributes: Map<string, string>;
  source: string;
  at: number;
}

/**
 * The data scripts of a page (`__NEXT_DATA__` and JSON-LD), in the order of the page: at most
 * MAX_DATA_SCRIPTS of them, none of more than MAX_SCRIPT_CHARS characters. The search for the end of
 * a script never starts again after it found none, so a page of unclosed scripts costs one scan.
 */
function dataScripts(html: string): DataScript[] {
  const found: DataScript[] = [];
  let scripts = 0;
  for (const open of html.matchAll(SCRIPT_OPEN)) {
    const attributes = parseAttributes(open[1]);
    if (!isNextData(attributes) && !isJsonLd(attributes)) continue;
    if (scripts >= MAX_DATA_SCRIPTS) break;
    scripts += 1;
    const start = (open.index ?? 0) + open[0].length;
    SCRIPT_CLOSE.lastIndex = start;
    const close = SCRIPT_CLOSE.exec(html);
    // No end tag after this one means none after the next, so the search is over.
    if (close === null) break;
    if (close.index - start > MAX_SCRIPT_CHARS) continue;
    found.push({ attributes, source: html.slice(start, close.index), at: open.index ?? 0 });
  }
  return found;
}

/** The JSON-LD blocks of a page, parsed, in the order of the page; one that is not JSON is passed over. */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const { attributes, source } of dataScripts(html)) {
    if (!isJsonLd(attributes)) continue;
    const data = parseJson(source);
    if (data !== undefined) blocks.push(data);
  }
  return blocks;
}

/** The text of a page that its scripts build, taken from the data in the page, in the order of the page. */
export function extractScriptedText(html: string): string {
  // Each source gives its strings at the place where it stands in the page.
  const sources: Array<{ at: number; strings: string[] }> = [];

  for (const { attributes, source, at } of dataScripts(html)) {
    sources.push({ at, strings: scriptStrings(attributes, source) });
  }

  let noscripts = 0;
  for (const open of html.matchAll(NOSCRIPT_OPEN)) {
    if (noscripts >= MAX_NOSCRIPTS) break;
    noscripts += 1;
    const start = (open.index ?? 0) + open[0].length;
    NOSCRIPT_CLOSE.lastIndex = start;
    const close = NOSCRIPT_CLOSE.exec(html);
    if (close === null) break;
    if (close.index - start > MAX_SCRIPT_CHARS) continue;
    // The block is markup: it is read as a string with markup in it, whole.
    sources.push({ at: open.index ?? 0, strings: [html.slice(start, close.index)] });
  }
  sources.sort((a, b) => a.at - b.at);

  const seen = new Set<string>();
  const kept: string[] = [];
  let length = 0;
  for (const { strings } of sources) {
    for (const raw of strings) {
      const text = proseOf(raw);
      if (text === null || seen.has(text)) continue;
      seen.add(text);
      // A sentence that does not fit ends the text: it is cut between sentences, not inside one.
      const needed = text.length + (kept.length > 0 ? 2 : 0);
      if (length + needed > MAX_SCRIPTED_CHARS) return kept.join("\n\n");
      kept.push(text);
      length += needed;
    }
  }
  return kept.join("\n\n");
}
