/**
 * Search of the news through the DOC 2.0 API of the GDELT Project: the engine of the research keys
 * that have no web search of their own (OpenRouter, Custom, a local model), and the engine that a
 * provider search falls back to when it is refused. It needs no account and no key.
 *
 * What GDELT allows and what it gives shape everything here (probed on 2026-10-31):
 *
 * - Its terms allow any use, commercial too, without a fee, as long as the GDELT Project is cited:
 *   the run summary says "News searched with the GDELT Project" and links to it.
 * - api.gdeltproject.org/robots.txt is a 404, so nothing is disallowed; it is asked all the same,
 *   as the page reader asks the site of a page, and the answer is kept like any other. It is asked
 *   with the time limit of the request itself (20 seconds), not a shorter one: on 2026-11-01 the
 *   TLS handshake with the API host took 6 to 10 seconds from the golden machine, and a robots.txt
 *   that cannot be fetched in time disallows everything (RFC 9309, 2.3.1), which cost every run
 *   all of its news.
 * - It asks for one request every 5 seconds. A faster client gets a 429 with a plain-text body and
 *   no Retry-After, and kept getting it 25 and 50 seconds after a burst. So all the engines of the
 *   process share one queue that spaces requests 5 seconds apart, and after a 429 the process leaves
 *   GDELT alone for 60 seconds: a search that would need a request in that time fails at once. The
 *   refused request is not given up for the rest of the run, though: the first search of the run
 *   that needs it after the cool-down asks it again, until GDELT has refused the run's asks
 *   GDELT_MAX_ASKS (3) times, after which its searches fail at once. Only a 429 is asked again
 *   this way, and only a 429 counts towards that cap. On 2026-11-01 GDELT refused 11 of 12
 *   requests from the golden machine, at intervals of minutes, and in one probe refused a request
 *   and answered the next one 6 seconds later, so the refusals do not come from our own rate, and
 *   a single 429 must not cost a run all of its news. A refusal is never cached; an answer is.
 * - It reaches back 3 months, gives titles and no snippets, and has no way to ask for the news of
 *   one topic cheaply. A run makes 18 to 28 searches, so the engine does not make one request for
 *   each. It makes ONE request for the run, the first search's: the articles that name the vendor
 *   and any of the topics, at most 250, and answers every search of the run from that index in code
 *   (see `answer`). Searches that run at the same time share the one request.
 * - `timespan` is never sent: timespan=3months made GDELT answer {} to queries that do have matches.
 *   The window of the API without it is the last 3 months, which is what the engine reports.
 * - It matches its machine translation of the article, in 65 languages, and gives the title in the
 *   original language. So an article that is not in English matches every topic: its title cannot
 *   be tested for an English word.
 * - A query it refuses (too short, badly formed) is answered with plain text and a 200, a rate limit
 *   with plain text and a 429. Neither is JSON, and neither is read as an answer: the search fails
 *   with the fixed SearchEngineError. `{}` is an answer: nothing was found.
 *
 * The index of a request is kept in the cache that runs share for an hour, under the address of the
 * request, so that a second run of the same vendor makes no request. It is public data that the
 * GDELT terms let anyone redistribute. This engine is not wrapped in `withSearchCache`: it caches
 * what it asked, not what it was asked.
 *
 * Everything is third-party text. The body is read with JSON.parse. The clients of GDELT's API are
 * known to meet two flaws in a body that is otherwise an answer, a raw control character and a
 * backslash that begins no escape, both in a title. JSON.parse refuses the whole body for either,
 * which would cost the run all of its news, so a body that JSON.parse refuses is repaired once, by
 * two passes of fixed-width patterns, and read once more, again with JSON.parse (see `readJson`).
 * No other pattern is run over the body. Every address must pass the same policy as an address
 * the model chooses, a title is one line of plain text cut to the length of a snippet, and no more
 * than 250 entries are read, so a body of any shape costs time in proportion to its size. Whatever
 * goes wrong comes out as a SearchEngineError, and nothing is logged here: the query is never
 * written anywhere.
 *
 * The one thing this module knows of the vendors is `shortName`: the names it is given are quoted as
 * the press writes them, without the legal form ("Acme Analytics", not "Acme Analytics, Inc.").
 */
import { shortName } from "../vendorResearch/identity";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "../vendorResearch/text";
import { ANY_CONTENT_TYPE, FetchError, type GuardedResponse, guardedFetch } from "./guardedFetch";
import { MAX_URL_CHARS, parsePublicUrl } from "./publicUrl";
import { type RobotsChecker, createRobotsChecker } from "./robots";
import {
  type GdeltArticle,
  type WebCache,
  cacheGdeltIndex,
  cacheRobots,
  readCachedGdeltIndex,
  readCachedRobots,
} from "./webCache";
import {
  MAX_RESULTS,
  type SearchEngine,
  SearchEngineError,
  type SearchQueue,
  type SearchResult,
  createSearchQueue,
  sleepUnlessAborted,
} from "./webSearch";

/** The gap between two requests of the process, as GDELT asks: one every 5 seconds. */
export const GDELT_MIN_GAP_MS = 5_000;
/** How long the process leaves GDELT alone after a 429. */
export const GDELT_COOL_DOWN_MS = 60_000;
/** How many 429 refusals a run takes: the last one is the answer of the run, and no search asks again. */
export const GDELT_MAX_ASKS = 3;
/** The news of GDELT reaches back 3 months: the window of the API when no timespan is sent. */
export const GDELT_NEWS_WINDOW_MONTHS = 3;

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
/** The articles the request asks for, and the most that are read. */
const MAX_RECORDS = 250;
const MAX_BODY_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 20_000;
const ROBOTS_MAX_BYTES = 65_536;
/** The longest `Retry-After` of a 5xx that is waited for: a longer one is a service that wants to be left alone. */
const MAX_RETRY_AFTER_MS = 5_000;

/** A vendor and the names it is known by, at most: the name, then eight other names. */
const MAX_NAMES = 9;
const MAX_NAME_CHARS = 80;
const MAX_TOPICS = 40;
const MAX_TOPIC_CHARS = 60;
const MAX_DOMAIN_CHARS = 255;
const MAX_LANGUAGE_CHARS = 40;
/** The part of a query that is read: the session shortens a query long before this. */
const MAX_QUERY_CHARS = 500;

/** The words of a text, in any script: letters and digits. */
const WORD = /[\p{L}\p{N}]+/gu;
const wordsOf = (text: string): string[] => text.toLowerCase().match(WORD) ?? [];

/** The words of the query language of GDELT that cannot stand alone as a term. */
const OPERATOR_WORDS: ReadonlySet<string> = new Set(["or", "and", "not"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A text as one line of plain text: control characters and lone surrogates taken out, white space
 * collapsed, cut to `max` units without splitting a pair. Anything that is not a text is empty. A
 * text far longer than it may be is cut first, so the work does not grow with a hostile body.
 */
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const bounded = cutAtCodePoint(value, max * 4);
  return cutAtCodePoint(cleanText(bounded).replace(/\s+/g, " ").trim(), max).trimEnd();
}

/**
 * The names to search for, as the press writes them and each once: without the legal form, without
 * the double quote that would end the phrase early, one line each.
 */
function nameTermsOf(names: readonly string[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (terms.length >= MAX_NAMES) break;
    const unquoted = oneLine(name, MAX_NAME_CHARS * 2).replace(/"/g, " ");
    const term = oneLine(shortName(oneLine(unquoted, MAX_NAME_CHARS * 2)), MAX_NAME_CHARS);
    const key = term.toLowerCase();
    if (term === "" || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/**
 * The topics as terms of an OR block, each once: only the words of a topic are kept, so that a
 * topic cannot be an operator of the query (`domain:`, a minus, a bracket), a topic of several
 * words is one quoted phrase, and a topic that is no more than "or", "and" or "not" is left out.
 */
function topicTermsOf(topics: readonly string[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    if (terms.length >= MAX_TOPICS) break;
    const words = cutAtCodePoint(topic, MAX_TOPIC_CHARS * 4).match(WORD);
    if (words === null) continue;
    const text = cutAtCodePoint(words.join(" "), MAX_TOPIC_CHARS).trimEnd();
    const key = text.toLowerCase();
    if (text === "" || seen.has(key) || OPERATOR_WORDS.has(key)) continue;
    seen.add(key);
    terms.push(text.includes(" ") ? `"${text}"` : text);
  }
  return terms;
}

/** One term, or the terms in an OR block: parentheses only around more than one. */
const groupOf = (terms: readonly string[]): string =>
  terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;

function addressOf(names: readonly string[], topics: readonly string[]): string {
  const vendor = groupOf(names.map((name) => `"${name}"`));
  const query = topics.length === 0 ? vendor : `${vendor} AND ${groupOf(topics)}`;
  // cleanText first: encodeURIComponent throws on a lone surrogate.
  return `${GDELT_DOC_URL}?query=${encodeURIComponent(cleanText(query))}&mode=artlist&format=json&maxrecords=${MAX_RECORDS}`;
}

/**
 * The address of the request for a vendor: the articles that name the vendor (any of its names,
 * quoted) and any of the topics, as a list of articles in JSON, 250 at most, with no time span.
 * Null when no name is left to search for. The address is kept within the length a URL may have by
 * leaving out topics from the end, and then names from the end, but the first one.
 */
export function buildGdeltUrl(names: readonly string[], topics: readonly string[]): string | null {
  let usedNames = nameTermsOf(names);
  if (usedNames.length === 0) return null;
  let usedTopics = topicTermsOf(topics);
  for (;;) {
    const url = addressOf(usedNames, usedTopics);
    if (new URL(url).href.length <= MAX_URL_CHARS) return url;
    if (usedTopics.length > 0) usedTopics = usedTopics.slice(0, -1);
    else if (usedNames.length > 1) usedNames = usedNames.slice(0, -1);
    else return url;
  }
}

/** The day and time GDELT saw an article: 20261025T100000Z. */
const SEEN_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/** ISO 8601 for a seendate, or null for anything else, a day the month lacks included. */
function isoDateOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = SEEN_DATE.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC rolls over 30 February and an hour past 23: what comes back must be what was written.
  const same =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return same ? date.toISOString() : null;
}

/** The article an entry of the body stands for, or null for one that is no article. */
function articleOf(entry: unknown): GdeltArticle | null {
  if (!isRecord(entry) || typeof entry.url !== "string") return null;
  let url: string;
  try {
    url = parsePublicUrl(entry.url).href;
  } catch {
    return null;
  }
  const title = oneLine(entry.title, MAX_SNIPPET_CHARS);
  if (title === "") return null;
  return {
    url,
    title,
    publishedAt: isoDateOf(entry.seendate),
    domain: oneLine(entry.domain, MAX_DOMAIN_CHARS),
    language: oneLine(entry.language, MAX_LANGUAGE_CHARS),
  };
}

/**
 * A control character. JSON allows none raw inside a string, and outside one only tab, line feed
 * and carriage return, as white space.
 */
const CONTROL_CHARACTER = /[\x00-\x1f]/g;
/**
 * A valid escape, taken as a pair, or else a lone backslash. The pair comes first on purpose: the
 * second backslash of an escaped backslash is no start of an escape, and the character after it is
 * a plain one. What is left over is a backslash that begins no escape.
 */
const BACKSLASH = /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|\\/g;

/**
 * The body with the two flaws repaired that the clients of this API are known to meet in a title:
 * a raw control character becomes a space (which is also white space between tokens), and a
 * backslash that begins no escape is escaped, so that it stays in the title as it was written.
 * Two passes of fixed-width patterns, so the time is in proportion to the size of the body.
 */
function repaired(text: string): string {
  return text
    .replace(CONTROL_CHARACTER, " ")
    .replace(BACKSLASH, (found) => (found.length === 1 ? "\\\\" : found));
}

/**
 * The JSON in the body, read with JSON.parse: as it came or, when JSON.parse refuses it and there
 * is something to repair, once more after the repair. The repair is made once and what it makes is
 * read like any body, so one flaw in one of 250 titles no longer costs the run all of its news.
 * Whatever is still refused is no answer.
 */
function readJson(text: string): unknown {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(body);
  } catch {
    // Goes on to the repair.
  }
  const mended = repaired(body);
  // Nothing to mend: the second reading would fail as the first did.
  if (mended === body) throw new SearchEngineError();
  try {
    return JSON.parse(mended);
  } catch {
    throw new SearchEngineError();
  }
}

/**
 * The index in the body of an answer: the first 250 entries that are articles, each address once.
 * An object with no articles is an empty index, which is an answer. A raw control character or a
 * stray backslash in a title is repaired (see `readJson`). Throws a SearchEngineError for a body
 * that is not JSON even then (the refusal of a query, the text of a rate limit), for JSON that is
 * not an object, and for articles that are not a list: none of them is an answer.
 */
export function parseGdeltBody(text: string): GdeltArticle[] {
  const parsed = readJson(text);
  if (!isRecord(parsed)) throw new SearchEngineError();
  const entries = parsed.articles;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) throw new SearchEngineError();
  const articles: GdeltArticle[] = [];
  const seen = new Set<string>();
  for (const entry of entries.slice(0, MAX_RECORDS)) {
    const article = articleOf(entry);
    if (article === null || seen.has(article.url)) continue;
    seen.add(article.url);
    articles.push(article);
  }
  return articles;
}

/** An article of the index, ready to be tested against a query. */
interface Indexed {
  article: GdeltArticle;
  /** The words of the title, lower case. */
  words: readonly string[];
  /** GDELT matched an English article on its title as it is; any other on its translation. */
  english: boolean;
  /** When GDELT saw it, in ms; negative infinity for an article with no date. */
  time: number;
}

/** The index sorted newest first, the order of GDELT kept among articles of one moment. */
function prepare(articles: readonly GdeltArticle[]): Indexed[] {
  const indexed = articles.map((article): Indexed => {
    const time = article.publishedAt === null ? Number.NaN : Date.parse(article.publishedAt);
    const language = article.language.trim().toLowerCase();
    return {
      article,
      words: wordsOf(article.title),
      english: language === "" || language === "english",
      time: Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time,
    };
  });
  // Array.prototype.sort is stable. The comparison avoids -Infinity minus -Infinity.
  return indexed.sort((a, b) => (a.time === b.time ? 0 : a.time < b.time ? 1 : -1));
}

function toResult({ article }: Indexed): SearchResult {
  return {
    title: article.title,
    url: article.url,
    snippet: "",
    publishedAt: article.publishedAt,
    source: article.domain === "" ? null : article.domain,
  };
}

/** Whether an article answers a query: it names a topic word at the start of a word of its title. */
function matches(entry: Indexed, topicWords: readonly string[]): boolean {
  if (topicWords.length === 0 || !entry.english) return true;
  return topicWords.some((topic) => entry.words.some((word) => word.startsWith(topic)));
}

/**
 * The one queue of the process, shared by every GDELT engine: GDELT counts requests by address, and
 * a worker runs several researches at once.
 */
const gdeltQueue = createSearchQueue({ minGapMs: GDELT_MIN_GAP_MS });

/** Until when the process leaves GDELT alone, on the clock of the engines. Shared like the queue. */
let pausedUntil = Number.NEGATIVE_INFINITY;

/**
 * GDELT is to be left alone for a while: the request was refused with a 429, or the process is
 * waiting out an earlier one. It is not the answer of the run: the run may ask again when the
 * pause is over.
 */
class Paused extends Error {
  constructor() {
    super("GDELT is paused");
    this.name = "Paused";
  }
}

/** Rejects with a SearchEngineError as soon as `signal` aborts, whatever the work does after that. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new SearchEngineError());
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * How long to wait before a request that failed is asked once more, or null when it is not asked
 * again. Only a failure that is the service having a bad moment is: a network error, a time-out or
 * a 5xx, and a 5xx that asks to wait asks for a short wait. A 429 is the pause above; a refusal of
 * the URL policy or of robots.txt, a 4xx, a type that is not JSON and a body that is not an index
 * would only fail again.
 */
function retryWaitOf(error: unknown): number | null {
  if (!(error instanceof FetchError) || error.reason !== "unreachable") return null;
  if (error.status !== undefined && error.status < 500) return null;
  const asked = error.retryAfterMs;
  if (asked !== undefined && asked > MAX_RETRY_AFTER_MS) return null;
  return asked ?? 0;
}

/**
 * The robots.txt checker of the API's host: robots.txt is asked once for the engine, read at any
 * type, and kept in the cache for the next run when there is one, as the page reader does. A file
 * that is missing, and a site that refuses to show it, disallow nothing; one that cannot be reached
 * disallows everything (RFC 9309, 2.3.1).
 */
function robotsOf(fetch: typeof guardedFetch, cache: WebCache | undefined): RobotsChecker {
  return createRobotsChecker(async (robotsUrl) => {
    const origin = new URL(robotsUrl).origin;
    const known = cache === undefined ? null : await readCachedRobots(cache, origin);
    if (known !== null) return known;
    try {
      const answer = await fetch(robotsUrl, {
        // Any type is parsed: RFC 9309 makes no condition on it.
        allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE],
        maxBytes: ROBOTS_MAX_BYTES,
        headerTimeoutMs: REQUEST_TIMEOUT_MS,
        totalTimeoutMs: REQUEST_TIMEOUT_MS,
      });
      const text = { status: 200 as const, text: answer.body.toString("utf8") };
      if (cache !== undefined) cacheRobots(cache, origin, text);
      return text;
    } catch (error) {
      // Only the missing file is kept for other runs: a refusal may be the firewall of the moment.
      if (error instanceof FetchError && error.reason === "not_found") {
        const none = { status: 404 as const, text: "" };
        if (cache !== undefined) cacheRobots(cache, origin, none);
        return none;
      }
      if (error instanceof FetchError && error.reason === "blocked_by_site") {
        return { status: 404, text: "" };
      }
      throw error;
    }
  });
}

export interface GdeltEngineDeps {
  /**
   * The names of the vendor, its own first: the articles must name one of them. They are quoted as
   * an article writes them, without the legal form, and the words of every name are no topic words
   * of a query.
   */
  names: readonly string[];
  /**
   * What the articles must be about, any one of it: single words, or a few words for a phrase. The
   * English topic words of the news categories (NEWS_TOPIC_WORDS in queries.ts) and the authorities
   * of the vendor's jurisdiction (`regulatorTopicsOf` in market.ts). None asks for every article
   * that names the vendor.
   */
  topics: readonly string[];
  /** Replaces `guardedFetch`, for tests. */
  fetch?: typeof guardedFetch;
  /** Replaces the queue that every GDELT engine of the process shares, for tests. */
  queue?: SearchQueue;
  /**
   * The cache shared by runs (see webCache.ts). The index of a request that an earlier run made
   * within the hour is answered from it with no request, no place in the queue and no robots.txt;
   * the robots.txt of the host is kept in it too. None by default.
   */
  cache?: WebCache;
  /** Replaces the robots.txt checker of the API's host, for tests. */
  robots?: RobotsChecker;
  /** Replaces the wait before a request that follows a 5xx with a short Retry-After, for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Replaces the clock of the pause after a 429 (ms, like `Date.now`), for tests. */
  now?: () => number;
  /**
   * Told each time the request is asked a second time, after a failure that passes (see
   * `retryWaitOf`), right before it goes back into the queue. It is told nothing: not the query,
   * not the address, not the error. It serves a counter, so one that throws changes nothing.
   */
  onRetry?: () => void;
}

/**
 * The search engine on the news of the GDELT Project, for one run: the vendor's names and topics
 * are the engine's, and the engine makes at most one successful request, the first search's, whose
 * index answers every search of the run (see the module comment).
 *
 * The request does not belong to the search that made it: it is shared by all the searches of the
 * run, which may carry the signals of different loops, so one signal's abort ends that search at
 * once and cancels nothing for the others. The request is bounded by its own time-outs.
 *
 * A failure of the request is the answer of every search of the run, with two exceptions that leave
 * the run free to ask again: the process is leaving GDELT alone, or GDELT has just refused with a
 * 429 (until GDELT_MAX_ASKS refusals: the last one is the answer of the run). A request
 * that failed for a reason that passes (a network error, a time-out, a 5xx) is asked once more
 * through the queue, so that the gap holds for it too.
 */
export function createGdeltEngine(deps: GdeltEngineDeps): SearchEngine {
  const fetch = deps.fetch ?? guardedFetch;
  const queue = deps.queue ?? gdeltQueue;
  const sleep = deps.sleep ?? sleepUnlessAborted;
  const now = deps.now ?? Date.now;
  const { cache } = deps;
  const robots = deps.robots ?? robotsOf(fetch, cache);
  const requestUrl = buildGdeltUrl(deps.names, deps.topics);
  /** The words of every name the vendor has, each as written and without the legal form. */
  const nameWords = new Set(
    deps.names
      .slice(0, MAX_NAMES)
      .flatMap((name) => [...wordsOf(cleanText(name)), ...wordsOf(cleanText(shortName(name)))]),
  );

  const beforeRequest = async (hop: URL): Promise<void> => {
    if (!(await robots.isAllowed(hop))) throw new FetchError("blocked_by_robots");
  };

  /** How many asks of this run GDELT has refused with a 429. */
  let refusals = 0;

  /**
   * One request, once the queue has a place for it. A 429 starts the pause of the process; the
   * third refusal of the run is the answer of the run, not a pause, so no search asks again.
   */
  const request = async (url: string): Promise<GdeltArticle[]> => {
    if (now() < pausedUntil) throw new Paused();
    let answer: GuardedResponse;
    try {
      answer = await fetch(url, {
        allowedContentTypes: ["application/json"],
        maxBytes: MAX_BODY_BYTES,
        headerTimeoutMs: REQUEST_TIMEOUT_MS,
        totalTimeoutMs: REQUEST_TIMEOUT_MS,
        beforeRequest,
      });
    } catch (error) {
      if (error instanceof FetchError && error.status === 429) {
        pausedUntil = now() + GDELT_COOL_DOWN_MS;
        refusals += 1;
        if (refusals >= GDELT_MAX_ASKS) throw new SearchEngineError();
        throw new Paused();
      }
      throw error;
    }
    // A body that was cut cannot be read to its end.
    if (answer.truncated) throw new SearchEngineError();
    return parseGdeltBody(answer.body.toString("utf8"));
  };

  /** The request, and the one more that a failure which passes earns. Both wait for the queue. */
  const fetchIndex = async (url: string): Promise<GdeltArticle[]> => {
    try {
      return await queue(() => request(url));
    } catch (error) {
      const wait = retryWaitOf(error);
      if (wait === null) throw error;
      if (wait > 0) await sleep(wait);
      try {
        deps.onRetry?.();
      } catch {
        // A counter is not part of the search.
      }
      return await queue(() => request(url));
    }
  };

  const loadIndex = async (url: string): Promise<Indexed[]> => {
    const kept = cache === undefined ? null : await readCachedGdeltIndex(cache, url);
    if (kept !== null) return prepare(kept);
    if (now() < pausedUntil) throw new Paused();
    const articles = await fetchIndex(url);
    if (cache !== undefined) cacheGdeltIndex(cache, url, articles);
    return prepare(articles);
  };

  /** The index of the run: loaded by the first search that needs it, shared by the rest. */
  let loaded: Promise<Indexed[]> | undefined;
  const indexOnce = (url: string): Promise<Indexed[]> => {
    if (loaded === undefined) {
      const loading = loadIndex(url);
      loaded = loading;
      // A pause is not the answer of the run, so the next search asks again. This also handles the
      // rejection, so that a load nobody waits for any more is no unhandled one.
      loading.catch((error: unknown) => {
        if (error instanceof Paused && loaded === loading) loaded = undefined;
      });
    }
    return loaded;
  };

  /** The words of a query that are not words of the vendor's names. */
  const topicWordsOf = (query: string): string[] => [
    ...new Set(
      wordsOf(cutAtCodePoint(cleanText(query), MAX_QUERY_CHARS)).filter(
        (word) => !nameWords.has(word),
      ),
    ),
  ];

  return {
    id: "gdelt",
    kinds: ["news"],
    newsWindowMonths: GDELT_NEWS_WINDOW_MONTHS,
    async search(query, kind, signal) {
      try {
        // A search of the web, a vendor with no name to search for and a search that was cancelled
        // before it began cost no request.
        if (kind !== "news" || requestUrl === null || signal?.aborted) {
          throw new SearchEngineError();
        }
        const index = await untilAborted(indexOnce(requestUrl), signal);
        const topicWords = topicWordsOf(query);
        const results: SearchResult[] = [];
        for (const entry of index) {
          if (results.length >= MAX_RESULTS) break;
          if (matches(entry, topicWords)) results.push(toResult(entry));
        }
        return results;
      } catch {
        throw new SearchEngineError();
      }
    },
  };
}
