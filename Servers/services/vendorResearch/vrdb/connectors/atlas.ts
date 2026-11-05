/**
 * The MITRE ATLAS case studies (spec D2.15, Q32): the real-world incidents and the exercises
 * (demonstrations by researchers and red teams) against AI systems that MITRE curates in the
 * atlas-data repository, each with references. The data is Apache 2.0; the row of the source
 * carries MITRE's copyright line (sources.ts).
 *
 * The repository publishes a manifest of its releases, newest first, and one YAML file per release
 * and format. A sync reads the manifest, takes the first release that has a file of format 6, and
 * reads that file with the stored validators; the release name travels to `parse` as a second body
 * and becomes the source version. Both answers must come from the repository's own path on
 * raw.githubusercontent.com, after redirects too, and nothing the connector hands back holds an
 * address. A case study is one record, whether it is an incident or an exercise: 50 of the 77 are
 * exercises, and the text says which. The match keys are the names in the free-text `target`
 * (`atlasKeysOf`); the entities are not used, because `attributed-to` names the researchers who ran
 * an exercise as well as the attackers.
 *
 * The YAML is read with the `yaml` package, whose defaults are not enough for a file that someone
 * else publishes (`readYaml`): an alias, a tag, a repeated key or a second document refuses the
 * file, and so does a file with more than a million lexemes. The size limit alone does not bound
 * the parse: the package's own check for repeated keys is quadratic (one map of 50,000 keys took
 * 9 s and one of 100,000 took 45 s, from under a megabyte), and a flat list that fills the limit
 * takes 1.7 GB. The check for repeated keys is therefore made here, in linear time.
 *
 * THE TEXT. The descriptions of the case studies are written by people, and some of them quote the
 * prompt injection that the case study is about: AML.CS0046 holds, between `<atlas-example>` tags,
 * an order to run a command that pipes a base64 string into /bin/bash. A model reads a record's
 * text, so `cleanCaseStudyText` takes the payload out before the text is stored: the examples go
 * whole, the other markup goes, and what is left is the first paragraph, on one line, cut at a
 * word boundary. It reads the text as it finally reads (the entities decoded, also when they are
 * written twice, and the compatibility forms folded), so that a tag written as entities is a tag.
 * It repeats its steps until the text no longer changes, because taking out a block can join the
 * halves of another one, and it gives up on a text that never settles. The records still go to the
 * model as escaped, untrusted evidence; this is the layer before that one.
 */
import {
  type Document,
  type DocumentOptions,
  Lexer,
  type ParseOptions,
  type SchemaOptions,
  isMap,
  isNode,
  isScalar,
  parseDocument,
  visit,
} from "yaml";
import { FetchError } from "../../../webResearch/guardedFetch";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, cutAtCodePoint } from "../../text";
import { nameKeysOf } from "../keys";
import type { ParsedRecord } from "../types";
import { decodeEntities } from "../xmlScan";
import { type Connector, NotTheListError, type ParseResult, bodyText, dayOf } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const ATLAS_RECORD_MARK = "MITRE ATLAS";

const REPOSITORY_HOST = "raw.githubusercontent.com";
const REPOSITORY_PATH = "/mitre-atlas/atlas-data/";
/** The directory of the manifest and of the files it names. */
export const ATLAS_DIST_URL = `https://${REPOSITORY_HOST}${REPOSITORY_PATH}main/dist/`;
export const ATLAS_MANIFEST_URL = `${ATLAS_DIST_URL}manifest.yaml`;

/** GitHub serves a YAML file as text/plain; the others are what a mirror or a proxy may say. */
const YAML_TYPES = [
  "text/plain",
  "application/yaml",
  "application/x-yaml",
  "application/octet-stream",
];
/** The manifest is 6 KB and gains about 100 bytes a release. */
const MANIFEST_LIMITS = {
  maxBytes: 256 * 1024,
  allowedContentTypes: YAML_TYPES,
  totalTimeoutMs: 30_000,
};
/** The file of 2026.10 is 1.15 MB; it has grown by a few percent a release. */
export const ATLAS_MAX_BYTES = 8 * 1024 * 1024;
const DATA_LIMITS = {
  maxBytes: ATLAS_MAX_BYTES,
  allowedContentTypes: YAML_TYPES,
  totalTimeoutMs: 120_000,
};

const ROOT = "case-studies";
/** The file has 77 case studies today; a file past this is not the list. */
const MAX_CASE_STUDIES = 5_000;
/**
 * The most lexemes of a YAML text that are read: the file of 2026.10 has 136,121, and this is
 * seven times that, as the size limit is seven times its size.
 */
const MAX_YAML_LEXEMES = 1_000_000;

const FORMAT_V6 = /^6\.\d+\.\d+$/;
/** A file of format 6 in the manifest: the month of its release, and a patch number when it has one. */
const V6_PATH = /^v6\/ATLAS-(\d{4}\.\d{2}(?:\.\d{1,2})?)\.yaml$/;
const RELEASE_NAME = /^\d{4}\.\d{2}(?:\.\d{1,2})?$/;
const CASE_STUDY_ID = /^AML\.CS\d{4}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CASE_STUDY_PAGE = "https://atlas.mitre.org/studies/";

const MAX_NAME_CHARS = 200;
const MAX_TARGET_CHARS = 300;
const MAX_ACTOR_CHARS = 300;
/** The longest summary a record keeps (R10.1). */
export const ATLAS_SUMMARY_CHARS = 600;

const TYPE_TEXT = {
  Incident: "Incident, an attack reported in the wild",
  Exercise: "Exercise, a demonstration by researchers or a red team, not an attack in the wild",
} as const;
type CaseStudyType = keyof typeof TYPE_TEXT;

/** The entries of the file that do not parse and may be left out whatever its size (as Q7 for CVE). */
export const ATLAS_MAX_UNREADABLE = 10;

/**
 * How many case studies may be left out because they do not parse: ten, or a hundredth of the
 * entries when that is more. More than that is a change of the format, and the sync refuses the
 * file (`parse_errors`).
 */
export const atlasUnreadableAllowed = (entries: number): number =>
  Math.max(ATLAS_MAX_UNREADABLE, Math.floor(entries / 100));

/** What a body that is not the list parses to (connectors/types.ts `ParseResult`). */
const notTheList = (): ParseResult => ({
  records: [],
  errors: 1,
  sourceVersion: null,
  root: null,
});

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

// ---------------------------------------------------------------------------------------------
// The YAML
// ---------------------------------------------------------------------------------------------

/**
 * The core schema, no custom tags, and no check for repeated keys here: `readYaml` makes it in
 * linear time (see the module comment). An alias is refused when the document is turned into
 * values (`maxAliasCount: 0`).
 */
const YAML_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  schema: "core",
  customTags: [],
  uniqueKeys: false,
  prettyErrors: false,
};

/** True when the text has no more lexemes than MAX_YAML_LEXEMES; the lexer reads no further. */
function withinLexemeBudget(text: string): boolean {
  const lexemes = new Lexer().lex(text);
  for (let count = 0; count <= MAX_YAML_LEXEMES; count += 1) {
    if (lexemes.next().done === true) return true;
  }
  return false;
}

/**
 * True when a node of the document carries an explicit tag, or a map has a key that is not a
 * scalar or a key that another key of the map repeats (compared as the property it becomes, so
 * that `1` and `"1"` are one). Every node is visited once: the time is linear.
 */
function hasUnsafeNode(document: Document): boolean {
  let unsafe = false;
  visit(document, (_key, node) => {
    // A pair has no tag of its own; its key and its value are visited as nodes.
    if (!isNode(node)) return undefined;
    if (node.tag !== undefined) {
      unsafe = true;
      return visit.BREAK;
    }
    if (!isMap(node)) return undefined;
    const names = new Set<string>();
    for (const pair of node.items) {
      const name = isScalar(pair.key) ? String(pair.key.value) : null;
      if (name === null || names.has(name)) {
        unsafe = true;
        return visit.BREAK;
      }
      names.add(name);
    }
    return undefined;
  });
  return unsafe;
}

/**
 * The values of a YAML text, or undefined when it is not one the connector reads: it has an error
 * or a warning (an unknown tag is a warning), more than one document, an alias, an explicit tag, a
 * repeated key, or too many lexemes. Nothing it throws leaves it.
 */
function readYaml(text: string): unknown {
  try {
    if (!withinLexemeBudget(text)) return undefined;
    const document = parseDocument(text, YAML_OPTIONS);
    if (document.errors.length > 0 || document.warnings.length > 0) return undefined;
    if (hasUnsafeNode(document)) return undefined;
    return document.toJS({ maxAliasCount: 0 });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// The download
// ---------------------------------------------------------------------------------------------

/** Whether an address is a file of the repository: https, its host and port, its path. */
function isRepositoryAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === REPOSITORY_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith(REPOSITORY_PATH)
    );
  } catch {
    return false;
  }
}

/**
 * The file of the newest release that has one of format 6, from the text of the manifest (a list of
 * releases, newest first, each with its versions): its path and the name of its release (`2026.10`,
 * from the path, which the release is named in). A version counts only when its format is 6 and its
 * path is a file of the `v6` directory with the name of a release, which leaves out `..`, another
 * directory and anything with a query. Null when the text is no manifest or no release has one.
 */
export function newestV6Release(manifest: string): { path: string; release: string } | null {
  const releases = readYaml(manifest);
  if (!Array.isArray(releases)) return null;
  for (const release of releases) {
    const versions = isFields(release) ? release.versions : undefined;
    if (!Array.isArray(versions)) continue;
    for (const version of versions) {
      if (!isFields(version)) continue;
      const format = version["format-version"];
      const path = version.path;
      if (typeof format !== "string" || typeof path !== "string" || !FORMAT_V6.test(format)) {
        continue;
      }
      const name = V6_PATH.exec(path)?.[1];
      if (name !== undefined) return { path, release: name };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The text of a case study (R10.1)
// ---------------------------------------------------------------------------------------------

/** The longest text the cleaner reads; the longest description of the real file has 3,475. */
const MAX_INPUT_CHARS = 20_000;
/** The passes the cleaner makes at most; a text that still changes after them is not prose. */
const MAX_CLEAN_PASSES = 8;
/** The times the text is shaped and then cleaned again; shaping it a second time changes nothing. */
const MAX_SHAPING_ROUNDS = 4;
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const SLASH = 0x2f;
const BANG = 0x21;
const QUESTION = 0x3f;

/** What ends a line, other than a line feed. */
const OTHER_LINE_ENDINGS = /\r\n?|[\p{Zl}\p{Zp}]/gu;
/**
 * Characters a reader does not see (zero-width, the right-to-left overrides, the tag characters
 * that spell ASCII invisibly, the variation selectors) and the control characters. A line feed and
 * a tab are kept for the paragraphs.
 */
const UNSEEN = /[\p{Cc}\p{Cf}\p{Variation_Selector}]/gu;
/**
 * `[text](address)`, also as an image. The text may hold one level of `[brackets]` and the address
 * one level of `(parentheses)`. Each repetition starts with a different character than the other
 * way of continuing, so the pattern does not backtrack, and the time is linear.
 */
const MARKDOWN_LINK =
  /!?\[((?:[^[\]]|\[[^[\]]{0,100}\]){0,400})\]\((?:[^()]|\([^()]{0,300}\)){0,1000}\)/g;
const REFERENCE = /\[\[[^[\]]{0,100}\]\]/g;
/** The tags that end a line in the text they stand in: removing them must not join two words. */
const LINE_BREAKING_TAG = /^\/?(?:br|hr|p|div|li|ul|ol|table|tr|td|th|h[1-6])(?![A-Za-z0-9])/i;
/** A blank line: a line feed, any white space but a line feed, a line feed. */
const BLANK_LINE = /\n[^\S\n]*\n/;

/**
 * The text in the form every later step expects: compatibility forms folded (a full-width `<` is a
 * `<`), one kind of line ending, and nothing a reader cannot see. Without this, a character that a
 * later step removes could join two halves of a tag.
 */
function normalise(text: string): string {
  return cleanText(text.normalize("NFKC"))
    .replace(OTHER_LINE_ENDINGS, "\n")
    .replace(UNSEEN, (character) => (character === "\n" || character === "\t" ? character : ""));
}

/** The index after the end of a tag that starts at `from` (after its name): `>` ends it, `<` does not. */
function endOfTag(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === GREATER_THAN) return index + 1;
    if (code === LESS_THAN) return index;
  }
  return text.length;
}

/**
 * Removes every `<atlas-example>...</atlas-example>` block whole, with whatever is inside. Blocks
 * nest: the one that closes is the one at depth zero, so that the text of an inner block cannot
 * be left outside. A block that is never closed runs to the end of the text, and so does a
 * self-closing tag, which an HTML reader takes for an opening one. A closing tag with no block is
 * left for the tag step. The time is linear: the pattern has a fixed start, and a tag is looked
 * for to its `>` only as far as the next `<`.
 */
function removeExampleBlocks(text: string): string {
  const tags = /<(\/?)atlas-example(?![\w:.-])/gi;
  let kept = "";
  let copied = 0;
  let depth = 0;
  let start = 0;
  for (let tag = tags.exec(text); tag !== null; tag = tags.exec(text)) {
    if (tag[1] !== "/") {
      if (depth === 0) start = tag.index;
      depth += 1;
      continue;
    }
    if (depth === 0) continue;
    depth -= 1;
    if (depth > 0) continue;
    const end = endOfTag(text, tag.index + tag[0].length);
    kept += text.slice(copied, start);
    copied = end;
    tags.lastIndex = end;
  }
  return depth > 0 ? kept + text.slice(copied, start) : kept + text.slice(copied);
}

/** Whether a character after a `<` makes it the start of a tag, a closing tag, a comment or a declaration. */
function startsMarkup(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === SLASH ||
    code === BANG ||
    code === QUESTION
  );
}

/**
 * Removes every tag, closing tag, comment and declaration (`<` and a letter, `/`, `!` or `?`, up to
 * the first `>`), keeping the text between them; a tag that ends a line (`<br>`) leaves a space,
 * so that two words are not joined, and no blank line is made. A `<` that is never closed before
 * the next `<` loses only itself, and a `<` that starts no markup (`p<0.05`) and a `>` stay. The
 * time is linear: a tag is looked for to its `>` only as far as the next `<`.
 */
function stripTags(text: string): string {
  let kept = "";
  let position = 0;
  for (let open = text.indexOf("<"); open !== -1; open = text.indexOf("<", position)) {
    if (!startsMarkup(text.charCodeAt(open + 1))) {
      kept += text.slice(position, open + 1);
      position = open + 1;
      continue;
    }
    kept += text.slice(position, open);
    const end = endOfTag(text, open + 1);
    // endOfTag stops after a `>` (a whole tag, dropped), or at the next `<` or the end (a `<` that
    // was never closed: only the `<` goes).
    const closed = end > open + 1 && text.charCodeAt(end - 1) === GREATER_THAN;
    if (closed && LINE_BREAKING_TAG.test(text.slice(open + 1, open + 12))) kept += " ";
    position = closed ? end : open + 1;
  }
  return kept + text.slice(position);
}

/**
 * The text as it finally reads: normalised, the entities decoded one level, and again until nothing
 * changes (`&amp;lt;` is a `<` after two steps, and `&#xFF1C;` a full-width `<` that the folding
 * makes a `<`). The blocks and the tags are looked for in this form only. In a text that is half
 * decoded, a closing tag written `</atlas-example&amp;gt;` has no `>` yet and runs on to the next
 * one, which can be the end of the opening tag of a block further on: that opening tag goes with
 * it and the text of the block is left outside any block. Null when the text is still changing
 * after the last step (entities written eight deep): that is not prose.
 */
function settle(text: string): string | null {
  let current = text;
  for (let step = 0; step < MAX_CLEAN_PASSES; step += 1) {
    const next = decodeEntities(normalise(current));
    if (next === current) return current;
    current = next;
  }
  return null;
}

/**
 * One pass of the cleaner, on the settled text: the examples whole, then the other tags (with their
 * text kept), links reduced to their text and references away. R10.1 decodes the entities last and
 * strips what the decoding made; this reads the decoded text from the start, so that a tag written
 * as entities is a tag from the first step, and a block written as entities is removed whole, not
 * just stripped of its tags. When removing the blocks changed the text the pass ends there: a
 * removal can join the halves of another block (`<atl<atlas-example>..</atlas-example>as-example>`),
 * and the tag step must not strip that block's tags, which would leave its text behind. The next
 * pass looks for blocks again first. Null when the text does not settle.
 */
function cleaningPass(text: string): string | null {
  const settled = settle(text);
  if (settled === null) return null;
  const withoutBlocks = removeExampleBlocks(settled);
  if (withoutBlocks !== settled) return withoutBlocks;
  return stripTags(settled).replace(MARKDOWN_LINK, "$1").replace(REFERENCE, "");
}

/** The text cut to `max` characters at the end of a word; inside the first word when it has no end. */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const kept = cutAtCodePoint(text, max);
  if (text.charAt(kept.length) === " ") return kept.trimEnd();
  const space = kept.lastIndexOf(" ");
  return (space > 0 ? kept.slice(0, space) : kept).trimEnd();
}

/** The text run through the passes until one changes nothing; null when it still changes after the last. */
function settledByPasses(text: string): string | null {
  let current = text;
  for (let pass = 0; pass < MAX_CLEAN_PASSES; pass += 1) {
    const next = cleaningPass(current);
    if (next === null) return null;
    if (next === current) return current;
    current = next;
  }
  return null;
}

/** The first paragraph (up to the first blank line) on one line, cut to `max` at a word boundary. */
function shapeOf(text: string, max: number): string {
  const paragraph = text.trim().split(BLANK_LINE, 1)[0] ?? "";
  return cutAtWord(paragraph.replace(/\s+/g, " ").trim(), max);
}

/**
 * The text of a case study as a record may keep it (R10.1): the first paragraph, on one line, of
 * at most `max` characters, cut at a word boundary, with no markup. In order, and repeated until
 * nothing changes:
 *
 * - invisible and control characters out, compatibility forms folded, entities decoded (also when
 *   they are written doubly), so that the steps below read the text as it finally reads;
 * - each `<atlas-example>` block removed whole, an unclosed one to the end of the text;
 * - every other tag removed, its text kept;
 * - `[text](url)` reduced to its text, `[[reference]]` dropped.
 *
 * Then the first paragraph (up to the first blank line) is cut, its white space made single
 * spaces and the length cut; shaping the text can bring the two ends of a reference closer than
 * the pattern allows, so the shaped text goes through the steps again until shaping changes
 * nothing. The result has no tag, no link, no reference and no entity that decodes to something
 * else, and cleaning it again changes nothing. A text that still changes after the last pass
 * (blocks that keep forming blocks, entities written many levels deep) gives an empty string.
 */
export function cleanCaseStudyText(raw: string, max: number = ATLAS_SUMMARY_CHARS): string {
  let text = cutAtCodePoint(raw, MAX_INPUT_CHARS);
  for (let round = 0; round < MAX_SHAPING_ROUNDS; round += 1) {
    const settled = settledByPasses(text);
    if (settled === null) return "";
    const shaped = shapeOf(settled, max);
    if (shaped === settled) return shaped;
    text = shaped;
  }
  return "";
}

/** A short field of a case study (name, target, actor) as a record keeps it; empty for any other type. */
const fieldOf = (value: unknown, max: number): string =>
  typeof value === "string" ? cleanCaseStudyText(value, max) : "";

// ---------------------------------------------------------------------------------------------
// The match keys (R5)
// ---------------------------------------------------------------------------------------------

/** Words that start a part of a target without being its name, in lower case. */
const LEADING_WORDS: ReadonlyArray<readonly string[]> = [
  ["the"],
  ["users", "of"],
  ["including"],
  ["new"],
  ["internal"],
  ["commercial"],
  ["enterprise"],
  ["exposed"],
  ["publicly"],
  ["private"],
  ["models", "from"],
];

/** Compact names that name a kind of thing and no one: a vendor with one of them gets no match. */
const STOP_NAMES: ReadonlySet<string> = new Set([
  "users",
  "user",
  "models",
  "model",
  "services",
  "service",
  "systems",
  "system",
  "agents",
  "agent",
  "applications",
  "frameworks",
  "servers",
  "server",
  "cloud",
  "cloudbased",
  "mobile",
  "llm",
  "llms",
  "ml",
  "ai",
  "government",
  "organizations",
  "entities",
  "datasets",
  "maintainers",
  "machines",
  "registries",
  "apps",
  "tools",
  "integration",
]);

const URL_IN_TEXT = /(?:https?:\/\/|www\.)\S*/gi;
/** The marks that separate the things a target names: commas, semicolons, slashes, brackets, and, or. */
const TARGET_SEPARATORS = /[,;/()]| (?:and|or) /gi;
/** A word's possessive: an apostrophe or a closing quote, then `s`. */
const POSSESSIVE = /['\p{Pf}]s$/iu;
const MAX_PREFIX_WORDS = 3;

/** The words of a part of a target, without the leading words that are no name. */
function nameWordsOf(part: string): string[] {
  const words = part
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => word.replace(POSSESSIVE, ""));
  let from = 0;
  for (let again = true; again;) {
    again = false;
    for (const phrase of LEADING_WORDS) {
      if (phrase.every((word, offset) => words[from + offset]?.toLowerCase() === word)) {
        from += phrase.length;
        again = true;
        break;
      }
    }
  }
  return words.slice(from);
}

/**
 * The `name:` keys of the free-text `target` of a case study ("Cursor, GitHub Copilot", R5): the
 * target without its URLs is split at commas, semicolons, slashes, brackets, " and " and " or ";
 * in each part the possessives and the leading words that are no name are dropped, and the first
 * one, two and three words are names. Each name is a key as written and without its legal form
 * (`nameKeysOf`), of four characters or more, except a name that is only a stop word ("users",
 * "cloud", "ai"). No other field gives a key.
 */
export function atlasKeysOf(target: string): string[] {
  const names: string[] = [];
  const text = target.replace(URL_IN_TEXT, " ").replace(/\s+/g, " ");
  for (const part of text.split(TARGET_SEPARATORS)) {
    const words = nameWordsOf(part);
    for (let count = 1; count <= Math.min(MAX_PREFIX_WORDS, words.length); count += 1) {
      names.push(words.slice(0, count).join(" "));
    }
  }
  return nameKeysOf(names).filter((key) => !STOP_NAMES.has(key.slice("name:".length)));
}

// ---------------------------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------------------------

function typeOf(value: unknown): CaseStudyType | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "incident") return "Incident";
  return text === "exercise" ? "Exercise" : null;
}

/** The day of a `start-date`: YYYY-MM-DD and a day that exists; null for anything else. */
function startDayOf(value: unknown): string | null {
  return typeof value === "string" && ISO_DAY.test(value) ? dayOf(value) : null;
}

/**
 * The date as ATLAS knows it: a case study dated only to its year or its month (32 of the 77) is
 * stored with the first day of it, which the text must not show as a day.
 */
function shownDayOf(day: string, granularity: unknown): string {
  const precision = typeof granularity === "string" ? granularity.trim().toLowerCase() : "";
  if (precision === "year") return day.slice(0, 4);
  return precision === "month" ? day.slice(0, 7) : day;
}

/** The record of one case study; null when it cannot be read (a skipped entry). */
function recordOf(key: string, entry: unknown): ParsedRecord | null {
  if (!isFields(entry)) return null;
  const id = entry.id;
  const type = typeOf(entry.type);
  const day = startDayOf(entry["start-date"]);
  const name = fieldOf(entry.name, MAX_NAME_CHARS);
  if (typeof id !== "string" || id !== key || !CASE_STUDY_ID.test(id)) return null;
  if (type === null || day === null || name === "") return null;

  const target = fieldOf(entry.target, MAX_TARGET_CHARS);
  const actor = fieldOf(entry.actor, MAX_ACTOR_CHARS);
  const references = Array.isArray(entry.references) ? entry.references.length : null;
  const summary = joinSentences([
    `${ATLAS_RECORD_MARK} case study (atlas.mitre.org).`,
    sentence("Case study", id),
    sentence("Name", name),
    sentence("Type", TYPE_TEXT[type]),
    sentence("Target, as ATLAS records it", target),
    // ATLAS fills the actor for 27 of the 77, and writes "Unknown" for some of them.
    sentence("Actor, as ATLAS records it", actor.toLowerCase() === "unknown" ? "" : actor),
    sentence("Start date", shownDayOf(day, entry["start-date-granularity"])),
    sentence("Summary", fieldOf(entry.description, ATLAS_SUMMARY_CHARS)),
    references === null ? "" : sentence("References listed", String(references)),
  ]);
  return {
    sourceRecordId: id,
    recordType: "ai_case_study",
    title: `${id}: ${name}`,
    summary,
    url: `${CASE_STUDY_PAGE}${id}`,
    identifiers: { caseStudyId: id, type, ...(target === "" ? {} : { target }) },
    matchKeys: atlasKeysOf(target),
    publishedAt: day,
    sourceUpdatedAt: null,
  };
}

/** The version of the file's own format, as text: a string, or a number a writer left unquoted. */
const formatOf = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

export const atlasConnector: Connector = {
  id: "atlas",
  version: 1,
  async download(fetch, validators) {
    const manifest = await fetch(ATLAS_MANIFEST_URL, {}, MANIFEST_LIMITS);
    // Nothing was sent to make a 304 an answer; one is not the manifest.
    if (manifest.notModified) throw new FetchError("unreachable");
    // A redirect may lead anywhere public: only the repository's own path is the list.
    if (!isRepositoryAddress(manifest.url)) throw new NotTheListError();
    const newest = newestV6Release(bodyText(manifest));
    if (newest === null) throw new NotTheListError();

    const response = await fetch(`${ATLAS_DIST_URL}${newest.path}`, validators, DATA_LIMITS);
    if (!isRepositoryAddress(response.url)) throw new NotTheListError();
    if (response.notModified) return "unchanged";
    return {
      // The release name is the second body, for `parse` to read as the source version.
      bodies: [bodyText(response), newest.release],
      etag: response.etag,
      lastModified: response.lastModified,
      bytes: response.body.length,
    };
  },
  parse(snapshot) {
    const file = readYaml(snapshot.bodies[0] ?? "");
    if (!isFields(file) || !/^6\./.test(formatOf(file["format-version"]))) return notTheList();
    const studies = file[ROOT];
    if (!isFields(studies)) return notTheList();
    const keys = Object.keys(studies);
    if (keys.length > MAX_CASE_STUDIES) return notTheList();

    const records: ParsedRecord[] = [];
    let unreadable = 0;
    for (const key of keys) {
      const record = recordOf(key, studies[key]);
      if (record === null) unreadable += 1;
      else records.push(record);
    }
    // A few entries that do not parse are left out and counted; more than the file tolerates is a
    // new format, and the sync refuses it.
    const refused = unreadable > atlasUnreadableAllowed(keys.length);
    const release = snapshot.bodies[1]?.trim() ?? "";
    return {
      records,
      errors: refused ? unreadable : 0,
      skipped: refused ? 0 : unreadable,
      sourceVersion: RELEASE_NAME.test(release) ? release : null,
      root: ROOT,
    };
  },
};
