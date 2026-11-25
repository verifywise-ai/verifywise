/**
 * The JSON readers of the list kit. A list that is JSON is third-party text of any size and shape,
 * so a reader gives what it can read within the limits its caller fixes, and what it cannot is null
 * or counted as unreadable: none of them throws for a text that is not JSON, for nesting that the
 * parser gives up on, or for a value that is no text at all. What they build is what `JSON.parse`
 * builds: plain objects and arrays, in which a `__proto__` key is a key of its own and sets no
 * prototype, and no helper here copies a key of one object onto another. A text with a byte order
 * mark is not JSON: take the text of a file with `textOf` (kit/text.ts), which takes it off.
 *
 * Nesting is capped. A text of nothing but brackets costs the parser a level for each one (30 MB of
 * them made it hold 2.3 GB), and no list of ours is nested so. `jsonOf` and `readJsonArray` give
 * null for a text that nests arrays and objects deeper than `JSON_MAX_DEPTH`, the outer brackets
 * counted as a level, and they find it out in one pass that stops at the first level past the cap,
 * before the parser is asked: the cost of a text of nothing but brackets is the cap's worth of them.
 * `readJsonLines` does not apply the cap: a line is bounded by the `maxLineChars` of its caller.
 *
 * - `jsonOf` reads one value.
 * - `readJsonArray` reads the items of a top-level array. It finds where the first `maxItems`
 *   items end without building any of them (one pass over the characters, texts skipped as JSON
 *   writes them), and parses those alone, in one call, so that an array of millions of items costs
 *   the items that were asked for. What lies past the last item that is taken is not read: it may
 *   be anything.
 * - `readJsonLines` reads a file of one value a line (JSON Lines, NDJSON): a line that is longer
 *   than the limit is not parsed, and a line that is not JSON is counted, and the others are read.
 *
 * The items are not validated: they are what the file holds, and the reader of the list checks
 * each one (and cleans each cell) as it builds a row.
 *
 * `readJsonArray` and `readJsonLines` say whether they gave the whole list: `complete` is `!more`.
 * A line that could not be read does not make a list incomplete (it is counted in `unreadable`,
 * which the factory measures); the items that were never read do. A connector passes it on as it
 * is: `complete: reading.complete` (kit/fileConnector.ts fails a download whose reader says false).
 */

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;

/** The white space of JSON: a blank, a tab, a line feed, a carriage return. */
function isJsonSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/** The place of the first character from `from` that is not JSON white space. */
function skipSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length && isJsonSpace(text.charCodeAt(at))) at += 1;
  return at;
}

/** The place just past the text that opens at `start` (a quote), or -1 when it is never closed. */
function endOfString(text: string, start: number): number {
  for (let at = start + 1; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    // Whatever follows a backslash is part of the text, a quote included.
    if (code === BACKSLASH) at += 1;
    else if (code === QUOTE) return at + 1;
  }
  return -1;
}

/**
 * The deepest nesting of arrays and objects that a text may have, the outer brackets counted as a
 * level: `jsonOf` and `readJsonArray` give null for a text that is nested deeper.
 */
export const JSON_MAX_DEPTH = 64;

/** A limit of items as a whole number: one that is not a number above zero is none. */
const limitOf = (value: number): number => (value >= 0 ? Math.floor(value) : 0);

/**
 * Whether a text nests arrays and objects deeper than `JSON_MAX_DEPTH`. One pass over the
 * characters, texts skipped as JSON writes them (a bracket in a text is no level), with no
 * recursion and no pattern; it stops at the first character that opens the level past the cap. A
 * text that is never closed ends the scan: the rest of the text is that text, which holds no level,
 * and whether the whole is JSON is the parser's to say.
 */
function nestsTooDeep(text: string): boolean {
  let depth = 0;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === QUOTE) {
      const end = endOfString(text, at);
      if (end === -1) return false;
      at = end - 1;
    } else if (code === OPEN_BRACKET || code === OPEN_BRACE) {
      depth += 1;
      if (depth > JSON_MAX_DEPTH) return true;
    } else if (code === CLOSE_BRACKET || code === CLOSE_BRACE) {
      // A closer that nothing opened is where the parser stops: no clamp is needed here.
      depth -= 1;
    }
  }
  return false;
}

/**
 * The value of a JSON text, or null when it is not one (the text of `null` is null too: a reader
 * asks for an object or an array, and null is no such value). A value that is no text is not JSON,
 * and neither is one nested deeper than `JSON_MAX_DEPTH`, which the parser is not asked to read.
 */
export function jsonOf(text: string): unknown | null {
  if (typeof text !== "string") return null;
  if (nestsTooDeep(text)) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A SyntaxError, or a RangeError for nesting that the parser cannot hold.
    return null;
  }
}

/**
 * The first `maxItems` items of the JSON array that a text is, and whether the array holds more
 * (the items past them are not read). Null when the text is not an array: not JSON, a value that is
 * no array, text after the array, an array that is cut or closed by a brace, or one of the items
 * that are taken that is not JSON. A `maxItems` that is not a number above zero takes no item: the
 * array is `more` when it holds any. Linear in the text that is read. Null too for an item that is
 * taken and nested so that the array is deeper than `JSON_MAX_DEPTH` (the scan stops at the level
 * past it); nesting past the last item that is taken is not read, like anything else there.
 */
export function readJsonArray(
  text: string,
  maxItems: number,
): { items: unknown[]; more: boolean; complete: boolean } | null {
  if (typeof text !== "string") return null;
  const start = skipSpace(text, 0);
  if (text.charCodeAt(start) !== OPEN_BRACKET) return null;
  const limit = limitOf(maxItems);

  if (limit === 0) {
    // Nothing is taken: an empty array is the whole of it, and any item is more.
    const first = skipSpace(text, start + 1);
    if (first >= text.length) return null;
    if (text.charCodeAt(first) !== CLOSE_BRACKET) {
      return { items: [], more: true, complete: false };
    }
    return skipSpace(text, first + 1) === text.length
      ? { items: [], more: false, complete: true }
      : null;
  }

  // One pass to the end of the item that the limit allows last, or to the end of the array.
  let depth = 0;
  let commas = 0;
  let cut = -1;
  let closed = false;
  for (let at = start; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === QUOTE) {
      const end = endOfString(text, at);
      if (end === -1) return null;
      at = end - 1;
    } else if (code === OPEN_BRACKET || code === OPEN_BRACE) {
      depth += 1;
      // Nested past the cap, the text is no list of ours: no more of it is read.
      if (depth > JSON_MAX_DEPTH) return null;
    } else if (code === CLOSE_BRACKET || code === CLOSE_BRACE) {
      depth -= 1;
      if (depth === 0) {
        closed = true;
        break;
      }
    } else if (code === COMMA && depth === 1) {
      commas += 1;
      // A comma of the array that follows the last item that is allowed: the next item is more.
      if (commas >= limit) {
        cut = at;
        break;
      }
    }
  }

  if (cut !== -1) {
    const items = jsonOf(`${text.slice(start, cut)}]`);
    return Array.isArray(items) ? { items, more: true, complete: false } : null;
  }
  if (!closed) return null;
  // The whole text is parsed, so that what follows the array makes it no array.
  const items = jsonOf(text);
  return Array.isArray(items) ? { items, more: false, complete: true } : null;
}

/** Whether the line of a text between two places holds nothing but blanks, tabs and carriage returns. */
function isBlank(text: string, from: number, to: number): boolean {
  for (let at = from; at < to; at += 1) {
    const code = text.charCodeAt(at);
    if (code !== 0x20 && code !== 0x09 && code !== 0x0d) return false;
  }
  return true;
}

/**
 * The values of a file of one JSON value a line. A line ends with a line feed (a carriage return
 * before it is white space to JSON). A blank line is no line. A line of more than `maxLineChars`
 * characters is not parsed, one nested deeper than `JSON_MAX_DEPTH` is not parsed either, and one
 * that is not JSON is not a value: all three are `unreadable`, and the reading goes on. At most
 * `maxItems` values are taken, and `more` is true when another line
 * that holds something follows them (it is not read). A `maxItems` or a `maxLineChars` that is not
 * a number above zero takes none. Linear in the text that is read.
 */
export function readJsonLines(
  text: string,
  maxItems: number,
  maxLineChars: number,
): { items: unknown[]; unreadable: number; more: boolean; complete: boolean } {
  const items: unknown[] = [];
  let unreadable = 0;
  if (typeof text !== "string") return { items, unreadable, more: false, complete: true };
  const limit = limitOf(maxItems);
  const longest = maxLineChars >= 0 ? maxLineChars : 0;

  let at = 0;
  while (at < text.length) {
    const found = text.indexOf("\n", at);
    const end = found === -1 ? text.length : found;
    const lineStart = at;
    at = end + 1;
    if (isBlank(text, lineStart, end)) continue;
    if (items.length >= limit) return { items, unreadable, more: true, complete: false };
    if (end - lineStart > longest) {
      unreadable += 1;
      continue;
    }
    const line = text.slice(lineStart, end);
    // A line nested past the cap is unreadable and is not given to the parser (review F1).
    if (nestsTooDeep(line)) {
      unreadable += 1;
      continue;
    }
    try {
      items.push(JSON.parse(line) as unknown);
    } catch {
      unreadable += 1;
    }
  }
  return { items, unreadable, more: false, complete: true };
}
