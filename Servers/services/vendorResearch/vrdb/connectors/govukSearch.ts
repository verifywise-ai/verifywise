/**
 * The pager of the GOV.UK Search API (`https://www.gov.uk/api/search.json`), which the four lists
 * that GOV.UK publishes through it share (uk_atrs, uk_cma, uk_mhra, uk_ofsi). A search is asked in
 * pages of `pageSize` results: page k begins at `start` = k * pageSize, and the first answer says,
 * in `total`, how many results the whole search holds.
 *
 * The API is not a snapshot. A case published between two requests moves every later result down by
 * one (one result is then seen twice and another never), and the order inside a tie of
 * `public_timestamp` is not guaranteed between two requests. A list taken in part, or shifted,
 * would mark every record that it lacks as gone, so the pages are one search only when they agree:
 *
 * - `govukSearchPages` is the `fetchFiles` of a list of the kit's factory (kit/fileConnector.ts). It
 *   asks the pages in order through `pinnedFetch`, so that every answer, a 304 included, must come
 *   from `www.gov.uk` under `/api/` after the redirects and a page that was cut at its limit fails
 *   as too large; it pauses between two pages as the host asks (kit/pause.ts, 400 ms: at most three
 *   requests a second); it sends no validator (the API sends none) and never more than `maxPages`
 *   requests; and a failure of any page fails the whole download, so that no partial list is ever
 *   given. It reads the first page only, for its `total`, and hands the bytes of every page on.
 * - `govukRowsOf` reads those bytes. It gives the rows only when every page states the same
 *   `total`, begins where it was asked, and the links of the results are, once each, as many as the
 *   `total`; any other set of pages is no search and gives null, which the reader of a list turns
 *   into "not the list".
 *
 * Both are bounded and none of them throws for what an answer holds. The text of a page is read
 * with `textOf` and parsed with `jsonOf` (kit/text.ts, kit/json.ts): a byte order mark, a charset,
 * a text that is not JSON and nesting past the kit's cap are all handled there. No error holds an
 * address or a word of an answer, and nothing is logged.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import type { Pin } from "./kit/address";
import { isObject } from "./kit/clean";
import type { Fetched } from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { fetchAllPages, pinnedFetch } from "./kit/paging";
import { type Sleep, pauseFor } from "./kit/pause";
import { textOf } from "./kit/text";
import { type ConnectorFetch, NotTheListError } from "./types";

/**
 * Where an answer of the Search API may come from: the API of www.gov.uk, after the redirects. A
 * directory prefix ends with a slash (the kit refuses one that does not). Frozen, so that no
 * connector can widen the pin of the others.
 */
export const GOVUK_PIN: Required<Pin> = Object.freeze({
  hosts: Object.freeze(["www.gov.uk"]),
  pathPrefixes: Object.freeze(["/api/"]),
});

/** The site that the `link` of a result is a path of (`GOVUK_SITE` + `link` is the page's address). */
export const GOVUK_SITE = "https://www.gov.uk";

/** The only type a page of the API has. */
const JSON_TYPE = "application/json";

/** The host whose pause the pager keeps between two pages. */
const PAUSED_HOST = "www.gov.uk";

export interface GovukPagesOptions {
  /** The results of a page (the `count` of the address): page k asks `start` = k * pageSize. */
  pageSize: number;
  /** The most pages that a search may have, and so the most requests the pager sends. */
  maxPages: number;
  /** The most bytes of one page, after decompression; a page that was cut there fails as too large. */
  maxBytes: number;
  /** The time for the whole download of one page. */
  timeoutMs: number;
  /** The pause between two pages: injectable, so that a test does not wait. The real one by default. */
  sleep?: Sleep;
}

export interface GovukRows {
  /** The results that the search holds: what `total` said on every page, and as many distinct links. */
  total: number;
  /** The results themselves as they were parsed (plain objects), the first of each link, in page order. */
  rows: Array<Record<string, unknown>>;
}

/** What one request gave. */
interface PageAnswer {
  body: Buffer;
  contentType: string;
}

/** A whole number above zero: what a size, a count or a time limit of the pager must be. */
const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** A count: a whole number, zero included. */
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * How many pages a search has, from its first answer: null when the answer is not a page of a
 * search (an object with a count `total` and a list `results`). It is decoded as `govukRowsOf` decodes
 * every page (`textOf`, `jsonOf`), so that the two read the first page in the same way.
 */
function pageCountOf(first: PageAnswer, pageSize: number): number | null {
  const alone: Fetched = {
    buffers: [first.body],
    contentTypes: [first.contentType],
    etag: null,
    lastModified: null,
    bytes: first.body.length,
  };
  const page = jsonOf(textOf(alone, 0));
  if (!isObject(page) || !isCount(page.total) || !Array.isArray(page.results)) return null;
  // A search that holds nothing is one page, and says so.
  return Math.max(1, Math.ceil(page.total / pageSize));
}

/**
 * The pages of one search, fetched in order: page 0, then `start` = k * pageSize for each page
 * that its `total` says there is, with the pause of the host (400 ms, through `sleep`) before every
 * page after the first. The download has one buffer for each page (the bytes as they came), the
 * Content-Type of each as the server sent it, no validators (the API sends none), and `bytes`, their
 * sum. Read the rows with `govukRowsOf`.
 *
 * Each answer is checked with `pinnedFetch(fetch, GOVUK_PIN)`: an answer from outside the pin (a 304
 * included) fails as `FetchError("not_allowed")` and a page cut at `maxBytes` as `BodyTooLargeError`.
 * A first page that is not a page of a search (not JSON, no count `total`, no list `results`), or
 * that says the search needs more than `maxPages` pages, fails as `NotTheListError`, with no other
 * request sent. A 304 that comes from the pin is `FetchError("unreachable")`: nothing was sent that
 * it could answer. Any failure of any page, the pause's included, is the failure of the call and
 * passes on as it is: the pages that were fetched are dropped, and a partial list is never given.
 * The options are those of the caller's code, not of an answer: one that is not a whole number
 * above zero is a bug and fails the call with a plain `Error` before any request.
 */
export async function govukSearchPages(
  fetch: ConnectorFetch,
  urlOf: (start: number) => string,
  options: GovukPagesOptions,
): Promise<Fetched> {
  const { pageSize, maxPages, maxBytes, timeoutMs, sleep } = options;
  if (![pageSize, maxPages, maxBytes, timeoutMs].every(isWhole)) {
    throw new Error("The options of a search of GOV.UK must be whole numbers above zero.");
  }
  const ask = pinnedFetch(fetch, GOVUK_PIN);
  const limits = { maxBytes, allowedContentTypes: [JSON_TYPE], totalTimeoutMs: timeoutMs };

  // Known when the first page has been read; the pages that follow are asked while there are any.
  let pages = 1;
  const answers = await fetchAllPages<PageAnswer>(async (page) => {
    if (page > 0) await pauseFor(PAUSED_HOST, sleep);
    const response = await ask(urlOf(page * pageSize), {}, limits);
    // No validator was sent, so a 304 is no answer to this request, and there is no page to keep.
    if (response.notModified) throw new FetchError("unreachable");

    const answer: PageAnswer = { body: response.body, contentType: response.contentType };
    if (page === 0) {
      const needed = pageCountOf(answer, pageSize);
      // A search that needs more pages than the connector allows is not the list it was built for.
      if (needed === null || needed > maxPages) throw new NotTheListError();
      pages = needed;
    }
    return { items: [answer], next: page + 1 < pages ? page + 1 : null };
  }, maxPages);

  const buffers = answers.map((answer) => answer.body);
  return {
    buffers,
    contentTypes: answers.map((answer) => answer.contentType),
    etag: null,
    lastModified: null,
    bytes: buffers.reduce((sum, buffer) => sum + buffer.length, 0),
  };
}

/**
 * The rows of the pages that `govukSearchPages` fetched, or null when they are not one consistent
 * search: every page an object with the same integer `total` and a list `results`, and a `start`
 * (when the answer carries one) equal to the one it was asked with, page k at k * pageSize; every
 * result an object with a string `link` that begins with a slash; the distinct links as many as
 * `total`, and `total` no more than the pages can hold (`pageSize` * the pages). A link that comes
 * twice is one result, the first of them (a repeat that loses no link is no loss); more distinct
 * links than `total`, or fewer, is a search that moved between two requests. The rows come back in
 * the order of the pages, as the plain objects that `JSON.parse` made: none is copied onto another
 * object, so that a `__proto__` key of a result stays a key of its own. A `pageSize` that is not a
 * whole number above zero, and no page at all, give null.
 *
 * Pure, and linear in the text of the pages: it stops at the first fault, and at the first result
 * that no `total` has room for, so that a page of a million results is not walked to its end.
 */
export function govukRowsOf(fetched: Fetched, options: { pageSize: number }): GovukRows | null {
  const { pageSize } = options;
  const pages = fetched.buffers.length;
  if (!isWhole(pageSize) || pages === 0) return null;

  let total = 0;
  const links = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < pages; index += 1) {
    const page = jsonOf(textOf(fetched, index));
    if (!isObject(page)) return null;
    const { total: stated, start, results } = page;
    if (!isCount(stated) || !Array.isArray(results)) return null;
    if (index === 0) {
      total = stated;
      // The pages that were fetched cannot hold the search that the first page describes.
      if (total > pageSize * pages) return null;
    } else if (stated !== total) {
      return null;
    }
    // An answer that says where it begins must begin where it was asked, or it is another page.
    if (start !== undefined && start !== index * pageSize) return null;

    for (const row of results) {
      if (!isObject(row)) return null;
      const { link } = row;
      if (typeof link !== "string" || !link.startsWith("/")) return null;
      if (links.has(link)) continue;
      // One more distinct link than the search holds: it moved, and a count that is wrong is no list.
      if (links.size >= total) return null;
      links.add(link);
      rows.push(row);
    }
  }
  // `total + 0` writes a total of minus zero as zero.
  return links.size === total ? { total: total + 0, rows } : null;
}
