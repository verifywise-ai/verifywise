/**
 * A scanner for the XML lists the vendor risk database mirrors (Ruling 9 of the M1 plan), with no
 * dependency. It reads the document once, from one `<` to the next, with `indexOf` and
 * `charCodeAt` and no regular expression, so a list of any size, or of any shape a server sends,
 * is read in time in proportion to its size. It yields each element of one name with its subtree
 * and keeps nothing else: a stack is kept only inside such an element.
 *
 * It reads what a list needs and no more. Names lose their namespace prefix and namespace
 * declarations are left out. Comments and processing instructions are skipped, CDATA is text, and
 * the five entities and numeric references are decoded once. A DOCTYPE with an internal subset is
 * refused, so an entity a document declares is never expanded. A malformed tag or an element that
 * is not closed is counted as an error, and the element of the name it was in is dropped.
 */

/** An element: its name without a prefix, its attributes, its children and its own text, decoded. */
export interface XmlElement {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: XmlElement[];
  text: string;
}

const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";
const PI_OPEN = "<?";
const PI_CLOSE = "?>";
const DOCTYPE_OPEN = "<!DOCTYPE";

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const EQUALS = 0x3d;
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;
const OPEN_BRACKET = 0x5b;
const SEMICOLON = 0x3b;
const AMPERSAND = 0x26;

/** The longest reference that is decoded, `&` and `;` left out: `#x0010FFFF` with a few zeros. */
const MAX_REFERENCE_CHARS = 16;

const isSpace = (code: number): boolean =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;

const isNameStart = (code: number): boolean =>
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x41 && code <= 0x5a) ||
  code === 0x5f ||
  code === 0x3a ||
  code >= 0x80;

const isNameChar = (code: number): boolean =>
  isNameStart(code) || (code >= 0x30 && code <= 0x39) || code === 0x2d || code === 0x2e;

/** A name without its namespace prefix: `ns:item` is `item`. */
const localName = (name: string): string => name.slice(name.lastIndexOf(":") + 1);

/** The index after the name at `from`; `from` itself when no name starts there. */
function nameEndAt(xml: string, from: number): number {
  if (from >= xml.length || !isNameStart(xml.charCodeAt(from))) return from;
  let index = from + 1;
  while (index < xml.length && isNameChar(xml.charCodeAt(index))) index += 1;
  return index;
}

function skipSpaces(xml: string, from: number): number {
  let index = from;
  while (index < xml.length && isSpace(xml.charCodeAt(index))) index += 1;
  return index;
}

/** A tag that was read, or where to go on after one that was not: -1 when the document ends first. */
type TagRead<T> = ({ ok: true; end: number } & T) | { ok: false; resume: number };

/** The start tag at `lt`: its name, its attributes (decoded), and whether it closes itself. */
function readStartTag(
  xml: string,
  lt: number,
): TagRead<{ name: string; attributes: Record<string, string>; selfClosing: boolean }> {
  const nameEnd = nameEndAt(xml, lt + 1);
  if (nameEnd === lt + 1) return { ok: false, resume: lt + 1 };
  const name = xml.slice(lt + 1, nameEnd);
  // No prototype: an attribute named `__proto__` or `constructor` is an attribute like any other.
  const attributes: Record<string, string> = Object.create(null);
  let index = nameEnd;
  for (;;) {
    const at = skipSpaces(xml, index);
    if (at >= xml.length) return { ok: false, resume: -1 };
    const code = xml.charCodeAt(at);
    if (code === GREATER_THAN)
      return { ok: true, end: at + 1, name, attributes, selfClosing: false };
    if (code === SLASH) {
      return xml.charCodeAt(at + 1) === GREATER_THAN
        ? { ok: true, end: at + 2, name, attributes, selfClosing: true }
        : { ok: false, resume: at + 1 };
    }
    const attributeEnd = nameEndAt(xml, at);
    if (at === index || attributeEnd === at) return { ok: false, resume: at };
    const equals = skipSpaces(xml, attributeEnd);
    if (equals >= xml.length) return { ok: false, resume: -1 };
    if (xml.charCodeAt(equals) !== EQUALS) return { ok: false, resume: equals };
    const open = skipSpaces(xml, equals + 1);
    if (open >= xml.length) return { ok: false, resume: -1 };
    const quote = xml.charCodeAt(open);
    if (quote !== DOUBLE_QUOTE && quote !== SINGLE_QUOTE) return { ok: false, resume: open };
    const close = xml.indexOf(quote === DOUBLE_QUOTE ? '"' : "'", open + 1);
    if (close === -1) return { ok: false, resume: -1 };
    const raw = xml.slice(open + 1, close);
    // A `<` cannot stand in a value: the tag is malformed, and the scan goes on after the value.
    if (raw.includes("<")) return { ok: false, resume: close + 1 };
    const attribute = xml.slice(at, attributeEnd);
    const key = localName(attribute);
    const isDeclaration = attribute === "xmlns" || attribute.startsWith("xmlns:");
    if (!isDeclaration && !(key in attributes)) attributes[key] = decodeEntities(raw);
    index = close + 1;
  }
}

/** The end tag at `lt`: its name. */
function readEndTag(xml: string, lt: number): TagRead<{ name: string }> {
  const nameEnd = nameEndAt(xml, lt + 2);
  if (nameEnd === lt + 2) return { ok: false, resume: lt + 2 };
  const at = skipSpaces(xml, nameEnd);
  if (at >= xml.length) return { ok: false, resume: -1 };
  if (xml.charCodeAt(at) !== GREATER_THAN) return { ok: false, resume: at };
  return { ok: true, end: at + 1, name: xml.slice(lt + 2, nameEnd) };
}

/** Whether the DOCTYPE at `lt` has an internal subset, and the index after it; -1 when it is not closed. */
function readDoctype(xml: string, lt: number): { subset: boolean; end: number } {
  for (let index = lt + DOCTYPE_OPEN.length; index < xml.length; index += 1) {
    const code = xml.charCodeAt(index);
    if (code === OPEN_BRACKET) return { subset: true, end: index };
    if (code === GREATER_THAN) return { subset: false, end: index + 1 };
  }
  return { subset: false, end: -1 };
}

/**
 * Calls `onElement` with every element named `name` (without a prefix) and its subtree, in the
 * order of the document; an element of that name inside another is its child, not an element of
 * its own. Gives the number of errors, and the name and the attributes of the root element (null
 * and none when there is no element). A DOCTYPE with an internal subset ends the scan with an
 * error and nothing more yielded, and a document that ends before its root closes (a download cut
 * short between two elements) is an error too.
 */
export function scanElements(
  xml: string,
  name: string,
  onElement: (element: XmlElement) => void,
): { errors: number; root: string | null; rootAttributes: Readonly<Record<string, string>> } {
  let errors = 0;
  let root: string | null = null;
  let rootAttributes: Readonly<Record<string, string>> = {};
  /** The open elements inside an element of the name, that element first; empty outside one. */
  let stack: XmlElement[] = [];
  /** How many elements are open outside an element of the name: the root is one until it closes. */
  let depth = 0;
  const appendText = (text: string) => {
    if (stack.length > 0 && text !== "") stack[stack.length - 1].text += decodeEntities(text);
  };
  /** An error: the element of the name the scan is in, if any, is dropped. */
  const fail = () => {
    errors += 1;
    stack = [];
  };

  let position = 0;
  while (position < xml.length) {
    const lt = xml.indexOf("<", position);
    if (lt === -1) {
      appendText(xml.slice(position));
      break;
    }
    if (lt > position) appendText(xml.slice(position, lt));

    if (xml.startsWith(COMMENT_OPEN, lt)) {
      const end = xml.indexOf(COMMENT_CLOSE, lt + COMMENT_OPEN.length);
      if (end === -1) {
        fail();
        break;
      }
      position = end + COMMENT_CLOSE.length;
      continue;
    }
    if (xml.startsWith(CDATA_OPEN, lt)) {
      const end = xml.indexOf(CDATA_CLOSE, lt + CDATA_OPEN.length);
      if (end === -1) {
        fail();
        break;
      }
      if (stack.length > 0) stack[stack.length - 1].text += xml.slice(lt + CDATA_OPEN.length, end);
      position = end + CDATA_CLOSE.length;
      continue;
    }
    if (xml.startsWith(PI_OPEN, lt)) {
      const end = xml.indexOf(PI_CLOSE, lt + PI_OPEN.length);
      if (end === -1) {
        fail();
        break;
      }
      position = end + PI_CLOSE.length;
      continue;
    }
    if (xml.startsWith(DOCTYPE_OPEN, lt)) {
      const doctype = readDoctype(xml, lt);
      if (doctype.subset || doctype.end === -1) {
        fail();
        break;
      }
      position = doctype.end;
      continue;
    }
    if (xml.charCodeAt(lt + 1) === 0x21) {
      // Any other declaration (`<!ELEMENT`, `<!ENTITY`) has no place in a document's body.
      const end = xml.indexOf(">", lt + 2);
      fail();
      if (end === -1) break;
      position = end + 1;
      continue;
    }
    if (xml.charCodeAt(lt + 1) === SLASH) {
      const tag = readEndTag(xml, lt);
      if (!tag.ok) {
        fail();
        if (tag.resume === -1) break;
        position = tag.resume;
        continue;
      }
      const closed = stack.pop();
      if (closed !== undefined) {
        if (closed.name !== localName(tag.name)) fail();
        else if (stack.length === 0) onElement(closed);
      } else if (depth > 0) {
        depth -= 1;
      }
      position = tag.end;
      continue;
    }

    const tag = readStartTag(xml, lt);
    if (!tag.ok) {
      fail();
      if (tag.resume === -1) break;
      position = tag.resume;
      continue;
    }
    const local = localName(tag.name);
    if (root === null) {
      root = local;
      rootAttributes = tag.attributes;
    }
    const element: XmlElement = { name: local, attributes: tag.attributes, children: [], text: "" };
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(element);
      if (!tag.selfClosing) stack.push(element);
    } else if (local === name) {
      if (tag.selfClosing) onElement(element);
      else stack = [element];
    } else if (!tag.selfClosing) {
      depth += 1;
    }
    position = tag.end;
  }
  // A document that ends inside an element was cut short. After another error the depth may be
  // off by the elements that error dropped, so it is then not read.
  if (stack.length > 0 || (depth > 0 && errors === 0)) errors += 1;
  return { errors, root, rootAttributes };
}

/** The elements at the end of a path of child names, in the order of the document. */
function elementsAt(element: XmlElement, path: readonly string[]): XmlElement[] {
  let level: XmlElement[] = [element];
  for (const step of path) {
    level = level.flatMap((parent) => parent.children.filter((child) => child.name === step));
  }
  return level;
}

/** The first text that is not empty, trimmed, at the end of the path; null for none. */
export function childText(element: XmlElement, path: readonly string[]): string | null {
  for (const found of elementsAt(element, path)) {
    const text = found.text.trim();
    if (text !== "") return text;
  }
  return null;
}

/** Every text that is not empty, trimmed, at the end of the path, in order. */
export function childTexts(element: XmlElement, path: readonly string[]): string[] {
  return elementsAt(element, path)
    .map((found) => found.text.trim())
    .filter((text) => text !== "");
}

/** Whether every character of the text from `from` is a digit of the base. */
function allDigits(text: string, from: number, hex: boolean): boolean {
  if (from >= text.length) return false;
  for (let index = from; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const digit = code >= 0x30 && code <= 0x39;
    const letter = (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
    if (!digit && !(hex && letter)) return false;
  }
  return true;
}

/** A character XML allows: tab, line feed, carriage return and the planes without surrogates. */
const isXmlChar = (code: number): boolean =>
  code === 0x09 ||
  code === 0x0a ||
  code === 0x0d ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff);

/** The character of a reference between `&` and `;`, or null for one that is not decoded. */
function referenceOf(body: string): string | null {
  switch (body) {
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "amp":
      return "&";
    case "quot":
      return '"';
    case "apos":
      return "'";
    default:
      break;
  }
  if (body.charCodeAt(0) !== 0x23) return null;
  const hex = body.charCodeAt(1) === 0x78 || body.charCodeAt(1) === 0x58;
  const from = hex ? 2 : 1;
  if (!allDigits(body, from, hex)) return null;
  const code = Number.parseInt(body.slice(from), hex ? 16 : 10);
  return isXmlChar(code) ? String.fromCodePoint(code) : null;
}

/**
 * The text with the five entities and the numeric references decoded, once: `&amp;lt;` is `&lt;`.
 * A reference that is not one of them, or that names no character XML allows, stays as written.
 */
export function decodeEntities(text: string): string {
  let amp = text.indexOf("&");
  if (amp === -1) return text;
  let decoded = "";
  let position = 0;
  while (amp !== -1) {
    let semicolon = -1;
    const limit = Math.min(text.length, amp + MAX_REFERENCE_CHARS + 2);
    for (let index = amp + 1; index < limit; index += 1) {
      const code = text.charCodeAt(index);
      if (code === SEMICOLON) semicolon = index;
      if (code === SEMICOLON || code === AMPERSAND || code === LESS_THAN) break;
    }
    const character = semicolon === -1 ? null : referenceOf(text.slice(amp + 1, semicolon));
    if (character === null) {
      amp = text.indexOf("&", amp + 1);
      continue;
    }
    decoded += text.slice(position, amp) + character;
    position = semicolon + 1;
    amp = text.indexOf("&", position);
  }
  return decoded + text.slice(position);
}
