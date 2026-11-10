/**
 * The pager that the four GOV.UK lists share (connectors/govukSearch.ts): the pages of one search of
 * the GOV.UK Search API are fetched in order, each answer checked against the API's pin, with a
 * pause of the host between two pages, and the rows of the pages are read only when the pages are
 * one consistent search. The Search API is not a snapshot (a case published between two requests
 * shifts the rows by one), so a partial or shifted list must never reach a copy.
 *
 * The answers are synthetic: they copy the shape of the API's (an envelope of `results`, `total`,
 * `start` and the empty `aggregates`, `suggested_queries`, `suggested_autocomplete` and
 * `es_cluster`; a result with `title`, `link`, `public_timestamp` and the envelope fields `_id`,
 * `index`, `es_score`, `document_type`), with every title and link invented. No test uses the
 * network (`fakeFetch` and hand-written fetches) and none waits (the pause is a mock, except the
 * one test that runs the real pause on fake timers).
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import {
  GOVUK_PIN,
  GOVUK_SITE,
  type GovukPagesOptions,
  govukRowsOf,
  govukSearchPages,
} from "../govukSearch";
import { isPinned } from "../kit/address";
import { type Fetched, createFileConnector } from "../kit/fileConnector";
import { JSON_MAX_DEPTH } from "../kit/json";
import type { Sleep } from "../kit/pause";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError } from "../types";
import { type FakeFetch, type FakeFile, fakeFetch } from "./helpers/kitContract";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const JSON_TYPE = "application/json";
const PAGE_SIZE = 3;
/**
 * The wall-clock limit of the tests that guard against a blow-up of the time (a pager or a reader
 * that goes quadratic or worse): the work of each takes 11 to 42 ms (measured on three runs), so
 * ten seconds is a margin of two hundred times, and a starved runner does not fail a test with no
 * change of code. The jest timeout of the asynchronous one is set above the limit (30 s).
 */
const SLOW_MS = 10_000;
/** No test of this file waits for a clock, but a starved runner can take more than jest's default five seconds. */
jest.setTimeout(30_000);

type Row = Record<string, unknown>;

/** The address of the page that begins at `start`: the pager asks exactly this, never another. */
const urlOf = (start: number): string =>
  `https://www.gov.uk/api/search.json?filter_format=example_case&start=${start}`;

/** The nth made-up result, with the fields the API gives (every value invented). */
const rowOf = (n: number): Row => ({
  title: `Example case ${n}`,
  link: `/government/example-case-${n}`,
  public_timestamp: "2026-01-02T03:04:05Z",
  _id: `/government/example-case-${n}`,
  index: "govuk",
  es_score: null,
  document_type: "example_case",
});

const rowsBetween = (from: number, to: number): Row[] => {
  const rows: Row[] = [];
  for (let n = from; n < to; n += 1) rows.push(rowOf(n));
  return rows;
};

/** The text of one answer of the API: the envelope of a page (no `start` when it is undefined). */
const pageText = (results: readonly unknown[], total: number, start: number | undefined): string =>
  JSON.stringify({
    results,
    total,
    ...(start === undefined ? {} : { start }),
    aggregates: {},
    suggested_queries: [],
    suggested_autocomplete: [],
    es_cluster: "A",
  });

/** The texts of the pages of a consistent search of `total` made-up cases, `pageSize` to a page. */
function pagesOf(total: number, pageSize = PAGE_SIZE): string[] {
  const texts: string[] = [];
  for (let start = 0; start < Math.max(total, 1); start += pageSize) {
    texts.push(pageText(rowsBetween(start, Math.min(start + pageSize, total)), total, start));
  }
  return texts;
}

/** The files `fakeFetch` serves for a consistent search: one per page, by the address of its `start`. */
function searchFiles(
  total: number,
  pageSize = PAGE_SIZE,
  addressOf: (start: number) => string = urlOf,
): Record<string, FakeFile> {
  const files: Record<string, FakeFile> = {};
  pagesOf(total, pageSize).forEach((body, page) => {
    files[addressOf(page * pageSize)] = { body, contentType: JSON_TYPE };
  });
  return files;
}

/**
 * The pages of a consistent search of 7 cases, with the first result of page `page` replaced by
 * `replacement`: the total and the count of the results are as they were.
 */
function pagesReplacing(page: number, replacement: unknown): string[] {
  const pages = pagesOf(7);
  const start = page * PAGE_SIZE;
  const results: unknown[] = rowsBetween(start, Math.min(start + PAGE_SIZE, 7));
  results[0] = replacement;
  pages[page] = pageText(results, 7, start);
  return pages;
}

/** A download as the pager gives it, from the texts of the pages. */
const fetchedOf = (texts: readonly string[], contentType = JSON_TYPE): Fetched => {
  const buffers = texts.map((text) => Buffer.from(text, "utf8"));
  return {
    buffers,
    contentTypes: texts.map(() => contentType),
    etag: null,
    lastModified: null,
    bytes: buffers.reduce((sum, buffer) => sum + buffer.length, 0),
  };
};

const rowsOf = (texts: readonly string[], pageSize = PAGE_SIZE) =>
  govukRowsOf(fetchedOf(texts), { pageSize });

/** A pause that does not wait and keeps its calls. */
const sleeping = () => jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);

const optionsOf = (over: Partial<GovukPagesOptions> = {}): GovukPagesOptions => ({
  pageSize: PAGE_SIZE,
  maxPages: 5,
  maxBytes: 100_000,
  timeoutMs: 60_000,
  sleep: sleeping(),
  ...over,
});

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The result of a promise as a value, so that a test can tell a rejection from a value. */
const outcomeOf = <T>(promise: Promise<T>): Promise<{ value: T } | { error: unknown }> =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

/** Lets the promises that are ready, and the macrotask after them, run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * A page of one result whose JSON nests `levels` levels in all, the page's own braces counted as the
 * first (the kit's `JSON_MAX_DEPTH` counts so): the page, its list of results, the result, and the
 * rest in a field of the result.
 */
const pageNestedTo = (levels: number): string => {
  const inner = levels - 3;
  const deep = `${"[".repeat(inner)}${"]".repeat(inner)}`;
  return `{"results":[{"link":"/government/deep","deep":${deep}}],"total":1,"start":0}`;
};

/** The one page that says it holds `total` results, as a file for `fakeFetch`. */
const firstPageOnly = (text: string, contentType = JSON_TYPE): Record<string, FakeFile> => ({
  [urlOf(0)]: { body: text, contentType },
});

describe("GOVUK_PIN and GOVUK_SITE", () => {
  it("pin the API of www.gov.uk: that host exactly, under /api/, as directories end with a slash", () => {
    expect(GOVUK_PIN).toEqual({ hosts: ["www.gov.uk"], pathPrefixes: ["/api/"] });
  });

  it("are frozen: no connector can widen the pin of the others", () => {
    expect(Object.isFrozen(GOVUK_PIN)).toBe(true);
    expect(Object.isFrozen(GOVUK_PIN.hosts)).toBe(true);
    expect(Object.isFrozen(GOVUK_PIN.pathPrefixes)).toBe(true);
  });

  it.each([
    [
      "the search API",
      "https://www.gov.uk/api/search.json?filter_format=example_case&start=0",
      true,
    ],
    ["the content API", "https://www.gov.uk/api/content/example-cases/example-case-1", true],
    ["a page of the site outside /api/", "https://www.gov.uk/government/example-case-1", false],
    ["a directory that only begins like /api/", "https://www.gov.uk/apix/search.json", false],
    ["the bare domain", "https://gov.uk/api/search.json", false],
    ["a host that only begins like it", "https://www.gov.uk.example.net/api/search.json", false],
    ["plain http", "http://www.gov.uk/api/search.json", false],
    ["another port", "https://www.gov.uk:8443/api/search.json", false],
  ])("take %s as the kit's isPinned reads it", (_name, address, pinned) => {
    expect(isPinned(address, GOVUK_PIN)).toBe(pinned);
  });

  it("is a pin that the kit's factory accepts, and the site is the origin that the links are paths of", () => {
    expect(() =>
      createFileConnector<Row>({
        id: "uk_cma",
        version: 1,
        root: "search.json",
        sortKey: () => "",
        pin: GOVUK_PIN,
        fetchFiles: async () => "unchanged",
        read: () => null,
        toRecords: () => [],
      }),
    ).not.toThrow();
    expect(GOVUK_SITE).toBe("https://www.gov.uk");
    const address = new URL(`${GOVUK_SITE}/government/example-case-1`);
    expect(address.hostname).toBe("www.gov.uk");
    expect(address.protocol).toBe("https:");
  });
});

describe("govukSearchPages", () => {
  describe("the pages of a search", () => {
    it("asks one page for a search that fits in one, with no pause, and gives what it was answered", async () => {
      const fetch = fakeFetch(searchFiles(2));
      const sleep = sleeping();

      const fetched = await govukSearchPages(fetch, urlOf, optionsOf({ sleep }));

      expect(fetch.calls.map((call) => call.url)).toEqual([urlOf(0)]);
      expect(sleep).not.toHaveBeenCalled();
      expect(fetched.buffers).toHaveLength(1);
      expect(fetched.buffers[0].toString("utf8")).toBe(pagesOf(2)[0]);
      expect(fetched.contentTypes).toEqual([JSON_TYPE]);
      expect(fetched.etag).toBeNull();
      expect(fetched.lastModified).toBeNull();
      expect(fetched.bytes).toBe(fetched.buffers[0].length);
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toEqual({
        total: 2,
        rows: [rowOf(0), rowOf(1)],
      });
    });

    it("asks a search of three pages page by page, and pauses 400 ms before each page after the first", async () => {
      const events: string[] = [];
      const inner = fakeFetch(searchFiles(7));
      const fetch: ConnectorFetch = async (url, validators, limits) => {
        events.push(`fetch ${url}`);
        return inner(url, validators, limits);
      };
      const sleep = jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async (ms) => {
        events.push(`sleep ${ms}`);
      });

      const fetched = await govukSearchPages(fetch, urlOf, optionsOf({ sleep }));

      expect(events).toEqual([
        `fetch ${urlOf(0)}`,
        "sleep 400",
        `fetch ${urlOf(3)}`,
        "sleep 400",
        `fetch ${urlOf(6)}`,
      ]);
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(fetched.buffers.map((buffer) => buffer.toString("utf8"))).toEqual(pagesOf(7));
      expect(fetched.contentTypes).toEqual([JSON_TYPE, JSON_TYPE, JSON_TYPE]);
      expect(fetched.bytes).toBe(fetched.buffers.reduce((sum, buffer) => sum + buffer.length, 0));
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toEqual({
        total: 7,
        rows: rowsBetween(0, 7),
      });
    });

    it("pages a search of 2,593 cases by a thousand: starts 0, 1000 and 2000, the pause called twice with 400", async () => {
      const fetch = fakeFetch(searchFiles(2_593, 1_000));
      const sleep = sleeping();

      const fetched = await govukSearchPages(
        fetch,
        urlOf,
        optionsOf({ pageSize: 1_000, maxBytes: 1_000_000, sleep }),
      );

      expect(fetch.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(1000), urlOf(2000)]);
      expect(sleep.mock.calls).toEqual([[400], [400]]);
      const found = govukRowsOf(fetched, { pageSize: 1_000 });
      expect(found?.total).toBe(2_593);
      expect(found?.rows).toHaveLength(2_593);
      expect(found?.rows[0]).toEqual(rowOf(0));
      expect(found?.rows[1_000]).toEqual(rowOf(1_000));
      expect(found?.rows[2_592]).toEqual(rowOf(2_592));
    });

    it("asks one page for a search of no results, and the rows are none", async () => {
      const fetch = fakeFetch(searchFiles(0));
      const sleep = sleeping();
      const fetched = await govukSearchPages(fetch, urlOf, optionsOf({ sleep }));
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toEqual({ total: 0, rows: [] });
    });

    it("asks a search of exactly as many results as a page holds for one page, and one more for two", async () => {
      const exact = fakeFetch(searchFiles(3));
      await govukSearchPages(exact, urlOf, optionsOf());
      expect(exact.calls).toHaveLength(1);

      const over = fakeFetch(searchFiles(4));
      await govukSearchPages(over, urlOf, optionsOf());
      expect(over.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(3)]);
    });

    it("asks the pages one after the other, never two together", async () => {
      const inner = fakeFetch(searchFiles(9));
      let inFlight = 0;
      let most = 0;
      const slow: ConnectorFetch = async (url, validators, limits) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        try {
          await settle();
          return await inner(url, validators, limits);
        } finally {
          inFlight -= 1;
        }
      };
      await govukSearchPages(slow, urlOf, optionsOf());
      expect(inner.calls).toHaveLength(3);
      expect(most).toBe(1);
    });

    it("keeps nothing between two calls: two searches that run together give each its own pages", async () => {
      const [long, short] = await Promise.all([
        govukSearchPages(fakeFetch(searchFiles(7)), urlOf, optionsOf()),
        govukSearchPages(fakeFetch(searchFiles(4)), urlOf, optionsOf()),
      ]);
      expect(long.buffers.map((buffer) => buffer.toString("utf8"))).toEqual(pagesOf(7));
      expect(short.buffers.map((buffer) => buffer.toString("utf8"))).toEqual(pagesOf(4));
    });

    it("asks exactly the addresses that urlOf gives for the starts 0, k * pageSize, in that order", async () => {
      const starts: number[] = [];
      const fetch = fakeFetch(searchFiles(7));
      await govukSearchPages(
        fetch,
        (start) => {
          starts.push(start);
          return urlOf(start);
        },
        optionsOf(),
      );
      expect(starts).toEqual([0, 3, 6]);
      expect(fetch.calls.map((call) => call.url)).toEqual([0, 3, 6].map(urlOf));
    });

    it("asks with no validators and the limits of the call: the API sends none, and a page is one file", async () => {
      const fetch = fakeFetch(searchFiles(7));
      await govukSearchPages(fetch, urlOf, optionsOf({ maxBytes: 77_000, timeoutMs: 12_345 }));
      const limits = { maxBytes: 77_000, allowedContentTypes: [JSON_TYPE], totalTimeoutMs: 12_345 };
      expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}, {}]);
      expect(fetch.calls.map((call) => call.limits)).toEqual([limits, limits, limits]);
    });

    it("takes a page whose Content-Type has a charset, and gives it as the server sent it", async () => {
      const files = searchFiles(2);
      files[urlOf(0)] = { ...files[urlOf(0)], contentType: "application/json; charset=utf-8" };
      const fetched = await govukSearchPages(fakeFetch(files), urlOf, optionsOf());
      expect(fetched.contentTypes).toEqual(["application/json; charset=utf-8"]);
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })?.rows).toHaveLength(2);
    });

    it("takes a page that begins with a byte order mark: the page is read as the rows are", async () => {
      const files = searchFiles(2);
      files[urlOf(0)] = { ...files[urlOf(0)], body: `${cp(0xfeff)}${pagesOf(2)[0]}` };
      const fetched = await govukSearchPages(fakeFetch(files), urlOf, optionsOf());
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toEqual({
        total: 2,
        rows: rowsBetween(0, 2),
      });
    });

    it("refuses a page that is not JSON by its type, as the fetch refuses it: the page is never read", async () => {
      const files = firstPageOnly(
        "<html><body>Unprocessable</body></html>",
        "text/html; charset=utf-8",
      );
      const failure = await failureOf(govukSearchPages(fakeFetch(files), urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unsupported_type");
    });
  });

  describe("the pause", () => {
    it("is the sleep that the call is given: none before the first page, one before each of the others", async () => {
      const sleep = sleeping();
      await govukSearchPages(fakeFetch(searchFiles(10)), urlOf, optionsOf({ sleep }));
      expect(sleep).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[400], [400], [400]]);
    });

    it("is waited for: the next page is not asked before the sleep has finished", async () => {
      const fetch = fakeFetch(searchFiles(7));
      let release: () => void = () => undefined;
      const sleep: Sleep = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        });

      const running = govukSearchPages(fetch, urlOf, optionsOf({ sleep }));
      for (let asked = 1; asked <= 3; asked += 1) {
        await settle();
        expect(fetch.calls).toHaveLength(asked);
        release();
      }
      await running;
      expect(fetch.calls).toHaveLength(3);
    });

    it("fails the whole call when the sleep fails, and asks no page after it", async () => {
      const fetch = fakeFetch(searchFiles(7));
      const broken = new Error("the sleep broke");
      const failure = await failureOf(
        govukSearchPages(
          fetch,
          urlOf,
          optionsOf({
            sleep: async () => {
              throw broken;
            },
          }),
        ),
      );
      expect(failure).toBe(broken);
      expect(fetch.calls).toHaveLength(1);
    });

    describe("when no sleep is given", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it("is the real pause of the host, 400 ms: the second page is asked after it and not before", async () => {
        const fetch = fakeFetch(searchFiles(4));
        const running = govukSearchPages(fetch, urlOf, optionsOf({ sleep: undefined }));

        await jest.advanceTimersByTimeAsync(0);
        expect(fetch.calls).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(399);
        expect(fetch.calls).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(1);
        expect(fetch.calls).toHaveLength(2);

        expect((await running).buffers).toHaveLength(2);
      });
    });
  });

  describe("the limit of pages", () => {
    it("takes a search of exactly maxPages pages", async () => {
      const fetch = fakeFetch(searchFiles(7));
      const fetched = await govukSearchPages(fetch, urlOf, optionsOf({ maxPages: 3 }));
      expect(fetched.buffers).toHaveLength(3);
      expect(fetch.calls).toHaveLength(3);
    });

    it("fails a search of one page more as not the list, after the first request and no pause", async () => {
      const fetch = fakeFetch(searchFiles(10));
      const sleep = sleeping();
      const failure = await failureOf(
        govukSearchPages(fetch, urlOf, optionsOf({ maxPages: 3, sleep })),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("sends one request at most for a first page that says it holds more than the limit allows, however much", async () => {
      for (const total of [
        "1000000000000000",
        "9007199254740991",
        "9007199254740993",
        "1e21",
        "1e300",
      ]) {
        const fetch = fakeFetch(firstPageOnly(`{"results":[],"total":${total},"start":0}`));
        const sleep = sleeping();
        const failure = await failureOf(
          govukSearchPages(fetch, urlOf, optionsOf({ maxPages: 5, sleep })),
        );
        expect(failure).toBeInstanceOf(NotTheListError);
        expect(fetch.calls).toHaveLength(1);
        expect(sleep).not.toHaveBeenCalled();
      }
    });

    it("never sends more requests than maxPages, whatever a later page says", async () => {
      // The later pages claim totals of their own: only the first page fixes the number of pages.
      const pages = [
        pageText(rowsBetween(0, 3), 7, 0),
        pageText(rowsBetween(3, 6), 700, 3),
        pageText(rowsBetween(6, 7), 7_000, 6),
      ];
      const files: Record<string, FakeFile> = {};
      pages.forEach((body, page) => {
        files[urlOf(page * 3)] = { body, contentType: JSON_TYPE };
      });
      const fetch = fakeFetch(files);
      const fetched = await govukSearchPages(fetch, urlOf, optionsOf({ maxPages: 3 }));
      expect(fetch.calls).toHaveLength(3);
      expect(fetched.buffers).toHaveLength(3);
      expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toBeNull();
    });
  });

  describe("a first page that is not the list", () => {
    it.each([
      ["text that is not JSON", "not json at all"],
      ["an HTML error page", "<html><body>Service unavailable</body></html>"],
      ["an empty answer", ""],
      ["a page that was cut", '{"results":[{"link":"/government/a"'],
      ["the text null", "null"],
      ["an array", "[]"],
      ["a number", "7"],
      ["a text", '"results"'],
      ["JSON and then more", '{"results":[],"total":0,"start":0} {"a":1}'],
      ["no total", '{"results":[],"start":0}'],
      ["a total that is null", '{"results":[],"total":null,"start":0}'],
      ["a total that is a text", '{"results":[],"total":"3","start":0}'],
      ["a total that is a fraction", '{"results":[],"total":2.5,"start":0}'],
      ["a total that is negative", '{"results":[],"total":-1,"start":0}'],
      ["a total that overflows to infinity", '{"results":[],"total":1e999,"start":0}'],
      ["a total that is an object", '{"results":[],"total":{"value":3},"start":0}'],
      ["no results", '{"total":0,"start":0}'],
      ["results that are null", '{"results":null,"total":0,"start":0}'],
      ["results that are an object", '{"results":{},"total":0,"start":0}'],
      ["results that are a text", '{"results":"none","total":0,"start":0}'],
    ])("fails as not the list for %s, and asks nothing more", async (_name, text) => {
      const fetch = fakeFetch(firstPageOnly(text));
      const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
      expect(fetch.calls).toHaveLength(1);
    });

    it("fails as not the list for a first page nested so deep that no parser reads it, or reads it: never another failure", async () => {
      const depth = 1_000_000;
      const deep = `${"[".repeat(depth)}${"]".repeat(depth)}`;
      const text = `{"results":[{"link":"/government/deep","deep":${deep}}],"total":1,"start":0}`;
      const fetch = fakeFetch(firstPageOnly(text));
      const outcome = await outcomeOf(
        govukSearchPages(fetch, urlOf, optionsOf({ maxBytes: 4_000_000 })),
      );
      if ("error" in outcome) {
        expect(outcome.error).toBeInstanceOf(NotTheListError);
      } else {
        expect(outcome.value.buffers).toHaveLength(1);
      }
      expect(fetch.calls).toHaveLength(1);
    });

    it("reads a first page nested to the kit's cap, and refuses one nested a level more: it is parsed with the kit's jsonOf", async () => {
      const at = await govukSearchPages(
        fakeFetch(firstPageOnly(pageNestedTo(JSON_MAX_DEPTH))),
        urlOf,
        optionsOf(),
      );
      expect(at.buffers).toHaveLength(1);

      const fetch = fakeFetch(firstPageOnly(pageNestedTo(JSON_MAX_DEPTH + 1)));
      const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
    });

    it("takes a total of minus zero for zero", async () => {
      const text = '{"results":[],"total":-0,"start":0}';
      const fetched = await govukSearchPages(fakeFetch(firstPageOnly(text)), urlOf, optionsOf());
      const found = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
      expect(found).not.toBeNull();
      expect(Object.is(found?.total, 0)).toBe(true);
      expect(found?.rows).toEqual([]);
    });
  });

  describe("where the answers come from", () => {
    const OFF_THE_PIN: Array<[string, string]> = [
      ["another host", "https://www.example.org/api/search.json"],
      ["the bare domain", "https://gov.uk/api/search.json"],
      ["a host that only begins like it", "https://www.gov.uk.example.net/api/search.json"],
      ["plain http", "http://www.gov.uk/api/search.json"],
      ["another port", "https://www.gov.uk:8443/api/search.json"],
      ["a user name", "https://user:secret@www.gov.uk/api/search.json"],
      ["the right host, outside /api/", "https://www.gov.uk/government/search.json"],
      ["a climb out of /api/", "https://www.gov.uk/api/../search.json"],
    ];

    it.each(OFF_THE_PIN)(
      "fails the first page as not allowed when the answer came from %s, and asks nothing more",
      async (_name, from) => {
        const files = searchFiles(7);
        files[urlOf(0)] = { ...files[urlOf(0)], url: from };
        const fetch = fakeFetch(files);
        const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf()));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        for (const part of ["example", "secret", "gov.uk", "search", "https"]) {
          expect((failure as FetchError).message).not.toContain(part);
        }
        expect(fetch.calls).toHaveLength(1);
      },
    );

    it.each(OFF_THE_PIN)(
      "fails the whole call as not allowed when the answer to the third page came from %s, and gives no result",
      async (_name, from) => {
        const files = searchFiles(7);
        files[urlOf(6)] = { ...files[urlOf(6)], url: from };
        const fetch = fakeFetch(files);
        const outcome = await outcomeOf(govukSearchPages(fetch, urlOf, optionsOf()));
        expect(outcome).not.toHaveProperty("value");
        const { error } = outcome as { error: FetchError };
        expect(error).toBeInstanceOf(FetchError);
        expect(error.reason).toBe("not_allowed");
        expect(fetch.calls).toHaveLength(3);
      },
    );

    it("takes an answer that was redirected within the pin", async () => {
      const files = searchFiles(7);
      files[urlOf(3)] = {
        ...files[urlOf(3)],
        url: "https://www.gov.uk/api/search.json?filter_format=example_case&start=3&moved=1",
      };
      const fetched = await govukSearchPages(fakeFetch(files), urlOf, optionsOf());
      expect(fetched.buffers).toHaveLength(3);
    });

    it("fails an answer of unchanged from another address as not allowed", async () => {
      const unchanged: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://www.example.org/api/search.json",
      });
      const failure = await failureOf(govukSearchPages(unchanged, urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("fails an answer of unchanged from the pin as unreachable: no validator was sent, so none can be current", async () => {
      const unchanged: ConnectorFetch = async (url) => ({ notModified: true, url });
      const failure = await failureOf(govukSearchPages(unchanged, urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails a later page that is answered as unchanged, and gives no result", async () => {
      const inner = fakeFetch(searchFiles(7));
      const fetch: ConnectorFetch = async (url, validators, limits) =>
        url === urlOf(3) ? { notModified: true, url } : inner(url, validators, limits);
      const outcome = await outcomeOf(govukSearchPages(fetch, urlOf, optionsOf()));
      expect(outcome).not.toHaveProperty("value");
      expect((outcome as { error: FetchError }).error.reason).toBe("unreachable");
      expect(inner.calls).toHaveLength(1);
    });

    it("fails an answer from outside the pin before it looks at whether the body was cut", async () => {
      const files = searchFiles(7);
      files[urlOf(0)] = {
        ...files[urlOf(0)],
        truncated: true,
        url: "https://www.example.org/api/search.json",
      };
      const failure = await failureOf(govukSearchPages(fakeFetch(files), urlOf, optionsOf()));
      expect((failure as FetchError).reason).toBe("not_allowed");
    });
  });

  describe("a page that was cut at its limit", () => {
    it("fails the first page as too large, and asks nothing more", async () => {
      const files = searchFiles(7);
      files[urlOf(0)] = { ...files[urlOf(0)], truncated: true };
      const fetch = fakeFetch(files);
      const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf()));
      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect(fetch.calls).toHaveLength(1);
    });

    it("fails the whole call as too large when the third page was cut, and gives no result", async () => {
      const files = searchFiles(7);
      files[urlOf(6)] = { ...files[urlOf(6)], truncated: true };
      const outcome = await outcomeOf(govukSearchPages(fakeFetch(files), urlOf, optionsOf()));
      expect(outcome).not.toHaveProperty("value");
      expect((outcome as { error: unknown }).error).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails a page that is longer than the limit of the call: the fetch cuts it at the limit", async () => {
      const failure = await failureOf(
        govukSearchPages(fakeFetch(searchFiles(7)), urlOf, optionsOf({ maxBytes: 100 })),
      );
      expect(failure).toBeInstanceOf(BodyTooLargeError);
    });

    it("takes a page of exactly the limit", async () => {
      const text = pagesOf(2)[0];
      const fetched = await govukSearchPages(
        fakeFetch(firstPageOnly(text)),
        urlOf,
        optionsOf({ maxBytes: Buffer.byteLength(text) }),
      );
      expect(fetched.bytes).toBe(Buffer.byteLength(text));
    });
  });

  describe("a page that fails", () => {
    const THROTTLED = () =>
      new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 5_000 });

    it("fails the whole call with the very error, when the third page fails, and gives no result", async () => {
      const error = THROTTLED();
      const inner = fakeFetch(searchFiles(7));
      const fetch: ConnectorFetch = async (url, validators, limits) => {
        if (url === urlOf(6)) throw error;
        return inner(url, validators, limits);
      };
      const sleep = sleeping();

      const outcome = await outcomeOf(govukSearchPages(fetch, urlOf, optionsOf({ sleep })));

      expect(outcome).not.toHaveProperty("value");
      expect((outcome as { error: unknown }).error).toBe(error);
      expect(error).toMatchObject({ reason: "blocked_by_site", status: 429, retryAfterMs: 5_000 });
      expect(inner.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(3)]);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it("stops at once when the second page fails: no page after it is asked", async () => {
      const files = searchFiles(10);
      delete files[urlOf(3)];
      const fetch = fakeFetch(files);
      const sleep = sleeping();
      const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf({ sleep })));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
      expect(fetch.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(3)]);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it("fails with the failure of the first page as it is", async () => {
      const error = THROTTLED();
      const failing: ConnectorFetch = async () => {
        throw error;
      };
      expect(await failureOf(govukSearchPages(failing, urlOf, optionsOf()))).toBe(error);
    });

    it("passes on a failure that is no FetchError as it is", async () => {
      const bug = new TypeError("a bug of the fetch");
      const failing: ConnectorFetch = async () => {
        throw bug;
      };
      expect(await failureOf(govukSearchPages(failing, urlOf, optionsOf()))).toBe(bug);
    });
  });

  describe("the options", () => {
    it.each<[string, Partial<GovukPagesOptions>]>([
      ["a page size of zero", { pageSize: 0 }],
      ["a negative page size", { pageSize: -1_000 }],
      ["a page size that is not a number", { pageSize: Number.NaN }],
      ["a page size that is a fraction", { pageSize: 1.5 }],
      ["a page size that is infinite", { pageSize: Number.POSITIVE_INFINITY }],
      ["no pages allowed", { maxPages: 0 }],
      ["a number of pages that is a fraction", { maxPages: 2.5 }],
      ["no end to the pages", { maxPages: Number.POSITIVE_INFINITY }],
      ["a limit of bytes of zero", { maxBytes: 0 }],
      ["a limit of bytes that is a fraction", { maxBytes: 99.5 }],
      ["a time limit that is not a number", { timeoutMs: Number.NaN }],
      ["a negative time limit", { timeoutMs: -1 }],
    ])("refuse %s before any page is asked", async (_name, over) => {
      const fetch = fakeFetch(searchFiles(2));
      const failure = await failureOf(govukSearchPages(fetch, urlOf, optionsOf(over)));
      expect(failure).toBeInstanceOf(Error);
      expect(fetch.calls).toHaveLength(0);
    });
  });

  describe("what it says and does not say", () => {
    const SECRET_URL = (start: number): string =>
      `https://www.gov.uk/api/search.json?key=ZZ-URL-SECRET&start=${start}`;
    const SECRET_BODY = "ZZ-BODY-SECRET";
    const MUST_NOT_SAY = ["ZZ-URL-SECRET", SECRET_BODY, "www.gov.uk", "search.json", "example.net"];

    const expectSilent = (failure: unknown): void => {
      expect(failure).toBeInstanceOf(Error);
      const said = `${String(failure)} ${(failure as Error).message}`;
      for (const word of MUST_NOT_SAY) expect(said).not.toContain(word);
    };

    const failures = async (): Promise<unknown[]> => {
      const seen: unknown[] = [];
      const ask = async (files: Record<string, FakeFile>, over: Partial<GovukPagesOptions> = {}) =>
        seen.push(await failureOf(govukSearchPages(fakeFetch(files), SECRET_URL, optionsOf(over))));
      const consistent = searchFiles(7, PAGE_SIZE, SECRET_URL);

      // Not the list: a first page that holds the secret as its total.
      await ask({
        [SECRET_URL(0)]: {
          body: `{"results":[],"total":"${SECRET_BODY}","start":0}`,
          contentType: JSON_TYPE,
        },
      });
      // Not the list: more pages than the limit.
      await ask(consistent, { maxPages: 2 });
      // Too large: a cut page.
      await ask({
        ...consistent,
        [SECRET_URL(3)]: { ...consistent[SECRET_URL(3)], truncated: true },
      });
      // Not allowed: an answer from another host.
      await ask({
        ...consistent,
        [SECRET_URL(0)]: {
          ...consistent[SECRET_URL(0)],
          url: `https://evil.example.net/${SECRET_BODY}`,
        },
      });
      // Unreachable: a page the fetch does not know.
      await ask({ [SECRET_URL(0)]: consistent[SECRET_URL(0)] });
      // The options.
      await ask(consistent, { pageSize: 0 });
      return seen;
    };

    it("puts no address and no word of an answer in any error", async () => {
      const seen = await failures();
      expect(seen).toHaveLength(6);
      for (const failure of seen) expectSilent(failure);
    });

    it("fails with the three errors of a download only, apart from the options: the sync knows each of them", async () => {
      const seen = await failures();
      const kinds = seen.slice(0, 5).map((failure) => (failure as Error).constructor.name);
      expect(kinds).toEqual([
        "NotTheListError",
        "NotTheListError",
        "BodyTooLargeError",
        "FetchError",
        "FetchError",
      ]);
    });

    it("writes nothing to the console, whatever happens", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await govukSearchPages(fakeFetch(searchFiles(7)), urlOf, optionsOf());
        await failures();
        govukRowsOf(fetchedOf(pagesOf(7)), { pageSize: PAGE_SIZE });
        govukRowsOf(fetchedOf(["not json"]), { pageSize: PAGE_SIZE });
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe("a page of 5 MB", () => {
    it("is read in no time, by the pager and by the reader of the rows", async () => {
      // 1,000 results of about 5 KB each: the size of a page of the real lists that carry prose.
      const description = "x".repeat(4_900);
      const results = rowsBetween(0, 1_000).map((row) => ({ ...row, description }));
      const text = pageText(results, 1_000, 0);
      expect(text.length).toBeGreaterThan(5_000_000);
      const fetch = fakeFetch(firstPageOnly(text));

      const pagerStarted = performance.now();
      const fetched = await govukSearchPages(
        fetch,
        urlOf,
        optionsOf({ pageSize: 1_000, maxBytes: 8_388_608 }),
      );
      const pagerMs = performance.now() - pagerStarted;

      const readerStarted = performance.now();
      const found = govukRowsOf(fetched, { pageSize: 1_000 });
      const readerMs = performance.now() - readerStarted;

      expect(found?.rows).toHaveLength(1_000);
      expect(pagerMs).toBeLessThan(SLOW_MS);
      expect(readerMs).toBeLessThan(SLOW_MS);
    }, 30_000);
  });
});

describe("govukRowsOf", () => {
  describe("the rows of a consistent search", () => {
    it("are the results of the pages in the order of the pages, and the total that the search stated", () => {
      const found = rowsOf(pagesOf(7));
      expect(found).toEqual({ total: 7, rows: rowsBetween(0, 7) });
      expect(found?.rows.map((row) => row.link)).toEqual(
        [0, 1, 2, 3, 4, 5, 6].map((n) => `/government/example-case-${n}`),
      );
    });

    it("are the objects that were parsed, plain objects: every field of a result is kept as it is", () => {
      const found = rowsOf([
        pageText(
          [{ ...rowOf(0), market_sector: ["a", "b"], opened_date: null, deep: { a: [1] } }],
          1,
          0,
        ),
      ]);
      expect(found?.rows[0]).toEqual({
        ...rowOf(0),
        market_sector: ["a", "b"],
        opened_date: null,
        deep: { a: [1] },
      });
      expect(Object.getPrototypeOf(found?.rows[0])).toBe(Object.prototype);
    });

    it("are those of a search of one page, and of a search of no results", () => {
      expect(rowsOf(pagesOf(2))).toEqual({ total: 2, rows: rowsBetween(0, 2) });
      expect(rowsOf(pagesOf(0))).toEqual({ total: 0, rows: [] });
    });

    it("are those of a search that fills its last page", () => {
      expect(rowsOf(pagesOf(6))).toEqual({ total: 6, rows: rowsBetween(0, 6) });
    });

    it("are read when the answers carry no start: it is only checked when it is there", () => {
      const pages = [
        pageText(rowsBetween(0, 3), 5, undefined),
        pageText(rowsBetween(3, 5), 5, undefined),
      ];
      expect(rowsOf(pages)).toEqual({ total: 5, rows: rowsBetween(0, 5) });
    });

    it("are the same whenever the same pages are read: the reader keeps nothing and changes nothing", () => {
      const fetched = fetchedOf(pagesOf(7));
      const before = fetched.buffers.map((buffer) => Buffer.from(buffer));
      const first = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
      const second = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
      const third = govukRowsOf(fetchedOf(pagesOf(7)), { pageSize: PAGE_SIZE });
      expect(second).toEqual(first);
      expect(third).toEqual(first);
      expect(first?.rows).toHaveLength(7);
      expect(fetched.buffers).toEqual(before);
    });

    it("are the same for the pages that the pager gave, however often the search is run", async () => {
      const run = async () =>
        govukRowsOf(await govukSearchPages(fakeFetch(searchFiles(7)), urlOf, optionsOf()), {
          pageSize: PAGE_SIZE,
        });
      const first = await run();
      expect(await run()).toEqual(first);
      expect(first?.rows).toHaveLength(7);
    });

    it("are read from a page with a byte order mark and a charset on its Content-Type", () => {
      const texts = pagesOf(5).map((text) => `${cp(0xfeff)}${text}`);
      const found = govukRowsOf(fetchedOf(texts, "application/json; charset=utf-8"), {
        pageSize: PAGE_SIZE,
      });
      expect(found).toEqual({ total: 5, rows: rowsBetween(0, 5) });
    });

    it("are read from a page that begins with two marks: the kit takes off every one that it finds in front", () => {
      const texts = pagesOf(5).map((text) => `${cp(0xfeff)}${cp(0xfeff)}${text}`);
      expect(rowsOf(texts)).toEqual({ total: 5, rows: rowsBetween(0, 5) });
    });

    it("keep a result with text of any language, as the page decoded it", () => {
      const row = { ...rowOf(0), title: `Caf${cp(0xe9)} ${cp(0x4e16, 0x754c)} ${cp(0x1f600)}` };
      expect(rowsOf([pageText([row], 1, 0)])?.rows[0]).toEqual(row);
    });
  });

  describe("pages that are not one search", () => {
    it("are no rows when the total of a page is not the total of the first", () => {
      for (const [page, total] of [
        [1, 8],
        [1, 6],
        [2, 8],
        [2, 0],
        [2, 70_000],
      ]) {
        const pages = pagesOf(7);
        pages[page] = pageText(page === 1 ? rowsBetween(3, 6) : rowsBetween(6, 7), total, page * 3);
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it("are no rows when the total of a later page is no count", () => {
      for (const total of ['"7"', "7.5", "-7", "null", "[7]", "{}"]) {
        const pages = pagesOf(7);
        pages[1] = `{"results":[],"total":${total},"start":3}`;
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it("are no rows when the total of the first page is no count", () => {
      for (const total of ['"7"', "7.5", "-7", "null", "[7]", "{}", "1e999"]) {
        const pages = pagesOf(7);
        pages[0] = `{"results":[],"total":${total},"start":0}`;
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it("are no rows when a page has no results, or results that are no array", () => {
      for (const results of [
        "",
        ',"results":null',
        ',"results":{}',
        ',"results":"x"',
        ',"results":7',
      ]) {
        for (const page of [0, 1, 2]) {
          const pages = pagesOf(7);
          pages[page] = `{"total":7,"start":${page * 3}${results}}`;
          expect(rowsOf(pages)).toBeNull();
        }
      }
    });

    it("are no rows when a page says it begins elsewhere than where it was asked: the server did not page as asked", () => {
      for (const start of ["0", "1", "2", "4", "6", "30", '"3"', "null", "[3]", "3.5", "-3"]) {
        const pages = pagesOf(7);
        pages[1] = pages[1].replace('"start":3', `"start":${start}`);
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it("are no rows when the first page says it begins elsewhere than at 0", () => {
      for (const start of ["3", "1", '"0"', "null", "-0.5"]) {
        const pages = pagesOf(7);
        pages[0] = pages[0].replace('"start":0', `"start":${start}`);
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it("are no rows when every page answers with the first page's rows: a server that ignores start", () => {
      const first = pageText(rowsBetween(0, 3), 7, 0);
      expect(rowsOf([first, first, first])).toBeNull();
      const again = pageText(rowsBetween(0, 3), 7, undefined);
      expect(rowsOf([again, again, again])).toBeNull();
    });

    it("are no rows when a page is missing at the end: the search says more than the pages hold", () => {
      expect(rowsOf(pagesOf(7).slice(0, 2))).toBeNull();
      expect(rowsOf(pagesOf(7).slice(0, 1))).toBeNull();
    });

    it("are no rows when a page is missing in the middle", () => {
      const pages = pagesOf(7);
      expect(rowsOf([pages[0], pages[2]])).toBeNull();
    });

    it("are no rows when there is no page at all", () => {
      expect(rowsOf([])).toBeNull();
    });

    it("are no rows when a page is not JSON, is cut, or is not an object", () => {
      for (const text of [
        "",
        "   ",
        "not json",
        "<html><body>Error</body></html>",
        '{"results":[{"link":"/government/a"',
        "null",
        "[]",
        "7",
        '"text"',
        "true",
        `${pageText(rowsBetween(3, 6), 7, 3)} extra`,
      ]) {
        for (const page of [0, 1, 2]) {
          const pages = pagesOf(7);
          pages[page] = text;
          expect(rowsOf(pages)).toBeNull();
        }
      }
    });

    it("are no rows when a page holds bytes that are no text at all", () => {
      const pages = fetchedOf(pagesOf(7));
      pages.buffers[1] = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0xa0, 0xa1]);
      expect(govukRowsOf(pages, { pageSize: PAGE_SIZE })).toBeNull();
    });

    it("are no rows when the shifted pages show one case twice and miss another, the total unchanged", () => {
      // A case published between two requests moves every later row down by one.
      const pages = [pageText(rowsBetween(0, 3), 6, 0), pageText(rowsBetween(2, 5), 6, 3)];
      expect(rowsOf(pages)).toBeNull();
    });

    it("are no rows when one case never appears across the edge of two pages, though every page is as it should be", () => {
      // Three pages of a search of 7: the case 3 is on no page, and the case 6 comes twice. Every
      // total, every start and every page size is right, so only the count of the distinct links
      // (6 of 7) can refuse the search.
      const pages = [
        pageText(rowsBetween(0, 3), 7, 0),
        pageText(rowsBetween(4, 7), 7, 3),
        pageText(rowsBetween(6, 7), 7, 6),
      ];
      expect(rowsOf(pages)).toBeNull();
      // The search that has all its cases is read: that is the whole difference.
      expect(rowsOf(pagesOf(7))).toEqual({ total: 7, rows: rowsBetween(0, 7) });
    });

    it("are no rows when a page holds more results than the search says it holds in all", () => {
      expect(rowsOf([pageText(rowsBetween(0, 3), 2, 0)])).toBeNull();
      expect(rowsOf([pageText(rowsBetween(0, 1), 0, 0)])).toBeNull();
    });

    it("are no rows when the total is more than the pages could hold, though its links are all there", () => {
      // Seven distinct links in two pages of three: the second page is longer than a page.
      const pages = [pageText(rowsBetween(0, 3), 7, 0), pageText(rowsBetween(3, 7), 7, 3)];
      expect(rowsOf(pages)).toBeNull();
      // The same seven links in three pages are the search.
      expect(rowsOf(pagesOf(7))).not.toBeNull();
    });
  });

  describe("results that are not rows", () => {
    it.each([
      ["a text", '"/government/a"'],
      ["a number", "7"],
      ["null", "null"],
      ["true", "true"],
      ["an empty array", "[]"],
      ["an array that holds a result", '[{"link":"/government/a"}]'],
    ])("make the result null when a result is %s", (_name, row) => {
      for (const page of [0, 1, 2]) {
        const pages = pagesOf(7);
        pages[page] = pages[page].replace(/"results":\[/, `"results":[${row},`);
        expect(rowsOf(pages)).toBeNull();
      }
    });

    it.each([
      ["no link", { title: "Example", public_timestamp: "2026-01-02T03:04:05Z" }],
      ["an empty object", {}],
      ["a link that is null", { link: null }],
      ["a link that is a number", { link: 7 }],
      ["a link that is a list", { link: ["/government/a"] }],
      ["a link that is an object", { link: { path: "/government/a" } }],
      ["an empty link", { link: "" }],
      ["a link that is not a path", { link: "government/a" }],
      ["a link that is a whole address", { link: "https://www.gov.uk/government/a" }],
      ["a link that begins with a blank", { link: " /government/a" }],
      ["the link under another name", { Link: "/government/a", url: "/government/a" }],
    ])("make the result null when a result has %s", (_name, bad) => {
      for (const page of [0, 1, 2]) {
        // Added to the results of a page: the search then holds one result more than it says.
        const added = pagesOf(7);
        added[page] = added[page].replace(/"results":\[/, `"results":[${JSON.stringify(bad)},`);
        expect(rowsOf(added)).toBeNull();

        // Put in the place of a result: the count is right, so only the link can refuse the page.
        expect(rowsOf(pagesReplacing(page, bad))).toBeNull();
      }
    });

    it("take a link that begins with a slash, whatever follows", () => {
      const rows = [{ link: "/" }, { link: "/a b" }, { link: "//host/path" }, { link: "/g?x=1#y" }];
      const found = rowsOf([pageText(rows, 4, 0)], 10);
      expect(found?.rows).toEqual(rows);
    });
  });

  describe("results that are repeated", () => {
    it("are no rows when a link comes twice and the total counts both: the distinct links are fewer than the total", () => {
      const pages = [
        pageText([rowOf(0), rowOf(1), rowOf(2)], 6, 0),
        pageText([rowOf(3), rowOf(4), rowOf(3)], 6, 3),
      ];
      expect(rowsOf(pages)).toBeNull();
    });

    it("are no rows when a link comes twice in one page and the total counts both", () => {
      expect(rowsOf([pageText([rowOf(0), rowOf(1), rowOf(0)], 3, 0)])).toBeNull();
    });

    it("are the first of each link, in the order of the pages, when the total counts each link once", () => {
      const later = { ...rowOf(2), title: "A later copy of the same case" };
      const pages = [
        pageText([rowOf(0), rowOf(1), rowOf(2)], 4, 0),
        pageText([later, rowOf(3)], 4, 3),
      ];
      const found = rowsOf(pages);
      expect(found?.total).toBe(4);
      expect(found?.rows).toEqual(rowsBetween(0, 4));
      expect(found?.rows[2].title).toBe("Example case 2");
    });

    it("are those of the first page when two pages hold the same link", () => {
      const first = { ...rowOf(5), title: "The first" };
      const second = { ...rowOf(5), title: "The second" };
      const found = rowsOf([pageText([rowOf(0), first], 3, 0), pageText([second, rowOf(6)], 3, 3)]);
      expect(found?.rows.map((row) => row.title)).toEqual([
        "Example case 0",
        "The first",
        "Example case 6",
      ]);
    });

    it("tell links apart by every character of the path", () => {
      const rows = [{ link: "/a" }, { link: "/A" }, { link: "/a/" }, { link: "/a?x" }];
      expect(rowsOf([pageText(rows, 4, 0)], 10)?.rows).toEqual(rows);
    });
  });

  describe("the page size", () => {
    it.each([
      ["zero", 0],
      ["negative", -3],
      ["not a number", Number.NaN],
      ["a fraction", 1.5],
      ["infinite", Number.POSITIVE_INFINITY],
    ])("is no page size when it is %s: no rows, and no failure", (_name, pageSize) => {
      expect(rowsOf(pagesOf(7), pageSize)).toBeNull();
      // The same when the answers carry no start to check it against.
      const noStart = [
        pageText(rowsBetween(0, 3), 5, undefined),
        pageText(rowsBetween(3, 5), 5, undefined),
      ];
      expect(rowsOf(noStart, pageSize)).toBeNull();
    });

    it("decides where the pages begin: pages of three are no pages of two", () => {
      expect(rowsOf(pagesOf(7), 2)).toBeNull();
      expect(rowsOf(pagesOf(7), 4)).toBeNull();
      expect(rowsOf(pagesOf(7), PAGE_SIZE)).not.toBeNull();
    });

    it("is a page size that the pages need no more than: a total that fits the pages is taken", () => {
      // Two pages of a size of 10 hold up to 20 results; the 7 of them are one search of one page.
      expect(rowsOf(pagesOf(7, 10), 10)).toEqual({ total: 7, rows: rowsBetween(0, 7) });
    });
  });

  describe("rows that are hostile", () => {
    it("keep a __proto__ key as a key of their own and copy nothing: no prototype is set and nothing is polluted", () => {
      const text =
        '{"results":[{"link":"/government/a","__proto__":{"polluted":"yes"},' +
        '"constructor":{"prototype":{"polluted":"yes"}}}],"total":1,"start":0}';
      const found = rowsOf([text]);
      const row = found?.rows[0] as Record<string, unknown>;
      expect(row.link).toBe("/government/a");
      expect(Object.prototype.hasOwnProperty.call(row, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      expect((row as { polluted?: string }).polluted).toBeUndefined();
      expect(({} as { polluted?: string }).polluted).toBeUndefined();
    });

    it("hold nothing from the prototype of a page: a page that names __proto__ gives no total or results", () => {
      const text = '{"__proto__":{"total":1,"results":[{"link":"/government/a"}]}}';
      expect(rowsOf([text])).toBeNull();
    });

    it("are read from a page nested to the kit's cap, and are none from a page nested a level more", () => {
      const at = rowsOf([pageNestedTo(JSON_MAX_DEPTH)]);
      expect(at?.total).toBe(1);
      expect(at?.rows).toHaveLength(1);
      expect(rowsOf([pageNestedTo(JSON_MAX_DEPTH + 1)])).toBeNull();
      // The same for the second page of a search: a page nested past the cap is no page.
      const pages = pagesOf(4);
      pages[1] = pageNestedTo(JSON_MAX_DEPTH + 1)
        .replace('"total":1', '"total":4')
        .replace('"start":0', '"start":3');
      expect(rowsOf(pages)).toBeNull();
    });

    it("are rows of a search whose results are nested absurdly deep, or no rows: never another failure", () => {
      const depth = 1_000_000;
      const deep = `${"[".repeat(depth)}${"]".repeat(depth)}`;
      const asRow = `{"results":[{"link":"/government/deep","deep":${deep}}],"total":1,"start":0}`;
      const asResult = `{"results":[${deep}],"total":1,"start":0}`;
      const asPage = deep;

      let inRow: ReturnType<typeof rowsOf> | undefined;
      expect(() => {
        inRow = rowsOf([asRow]);
      }).not.toThrow();
      // Either the parser read the row (and it is the one row of the search) or it gave up (null).
      expect(inRow === null || (inRow?.total === 1 && inRow.rows.length === 1)).toBe(true);

      let inResult: ReturnType<typeof rowsOf> | undefined;
      expect(() => {
        inResult = rowsOf([asResult]);
      }).not.toThrow();
      // A result that is a list is no row, whether it was read or not.
      expect(inResult).toBeNull();

      expect(() => rowsOf([asPage])).not.toThrow();
      expect(rowsOf([asPage])).toBeNull();
    });

    it("are read in time that does not depend on how the rows are shaped: many small rows and few large ones", () => {
      const many = Array.from({ length: 20_000 }, (_, n) => ({ link: `/government/${n}` }));
      const started = performance.now();
      const found = rowsOf([pageText(many, 20_000, 0)], 20_000);
      expect(found?.rows).toHaveLength(20_000);
      expect(performance.now() - started).toBeLessThan(SLOW_MS);
    });

    it("are none for a page that holds far more distinct links than its total says, and quickly", () => {
      const many = Array.from({ length: 200_000 }, (_, n) => ({ link: `/government/${n}` }));
      const started = performance.now();
      expect(rowsOf([pageText(many, 5, 0)], 1_000_000)).toBeNull();
      expect(performance.now() - started).toBeLessThan(SLOW_MS);
    });

    it("never throw, whatever the pages are", () => {
      const hostile: Array<string | Buffer> = [
        "",
        "\u0000",
        "{",
        "}",
        "[[[[",
        '{"total":1,"start":0,"results":[{"link":"/a"}]',
        Buffer.alloc(1_000, 0xff),
        Buffer.from([0xef, 0xbb, 0xbf]),
        `${cp(0xfeff)}${cp(0xfeff)}[${pageText([rowOf(0)], 1, 0)}]`,
        pageText([rowOf(0)], 1, 0).repeat(2),
      ];
      for (const body of hostile) {
        const fetched: Fetched = {
          buffers: [Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8")],
          contentTypes: [JSON_TYPE],
          etag: null,
          lastModified: null,
          bytes: 0,
        };
        expect(() => govukRowsOf(fetched, { pageSize: PAGE_SIZE })).not.toThrow();
        expect(govukRowsOf(fetched, { pageSize: PAGE_SIZE })).toBeNull();
      }
    });
  });
});

describe("the pager as the fetchFiles of a list of the kit's factory", () => {
  interface Case {
    link: string;
    title: string;
  }

  /** A list of the made-up cases, read as a connector of the four lists reads its search. */
  const listWith = (fetchOptions: Partial<GovukPagesOptions> = {}) =>
    createFileConnector<Case>({
      id: "uk_cma",
      version: 1,
      root: "search.json",
      sortKey: (row) => row.link,
      pin: GOVUK_PIN,
      fetchFiles: (fetch) => govukSearchPages(fetch, urlOf, optionsOf(fetchOptions)),
      read: (fetched) => {
        const found = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
        if (found === null) return null;
        const rows = found.rows.map((row) => ({
          link: String(row.link),
          title: String(row.title),
        }));
        return { rows, total: found.total, unreadable: 0, complete: rows.length === found.total };
      },
      toRecords: () => [],
    });

  it("downloads the whole search as one body, with the bytes of all the pages and no validators of its own", async () => {
    const fetch = fakeFetch(searchFiles(7));
    const sleep = sleeping();

    const snapshot = await listWith({ sleep }).download(fetch, {});

    expect(snapshot).not.toBe("unchanged");
    if (snapshot === "unchanged") return;
    expect(snapshot.bodies).toHaveLength(1);
    const body = JSON.parse(snapshot.bodies[0]) as { rows: Case[]; total: number };
    expect(body.total).toBe(7);
    expect(body.rows.map((row) => row.title)).toEqual(
      rowsBetween(0, 7).map((row) => row.title as string),
    );
    expect(snapshot.etag).toBe("k1:");
    expect(snapshot.lastModified).toBeNull();
    expect(snapshot.bytes).toBe(pagesOf(7).reduce((sum, text) => sum + Buffer.byteLength(text), 0));
    expect(fetch.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("downloads again, and in full, whatever the stored validators say: the API sends none, so nothing is unchanged", async () => {
    const fetch = fakeFetch(searchFiles(7));
    const snapshot = await listWith().download(fetch, { etag: "k1:", lastModified: null });
    expect(snapshot).not.toBe("unchanged");
    expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}, {}]);
  });

  it("fails the download, and gives no body, when the third page fails", async () => {
    const error = new FetchError("blocked_by_site", undefined, { status: 429 });
    const inner = fakeFetch(searchFiles(7));
    const fetch: FakeFetch = Object.assign(
      (async (url, validators, limits) => {
        if (url === urlOf(6)) throw error;
        return inner(url, validators, limits);
      }) as ConnectorFetch,
      { calls: inner.calls },
    );
    const outcome = await outcomeOf(listWith().download(fetch, {}));
    expect(outcome).not.toHaveProperty("value");
    expect((outcome as { error: unknown }).error).toBe(error);
  });

  it("fails the download as not the list when the pages are not one search", async () => {
    const files = searchFiles(7);
    files[urlOf(3)] = { body: pageText(rowsBetween(3, 6), 7, 0), contentType: JSON_TYPE };
    const failure = await failureOf(listWith().download(fakeFetch(files), {}));
    expect(failure).toBeInstanceOf(NotTheListError);
  });

  it("fails the download as not allowed when a page was answered from another address", async () => {
    const files = searchFiles(7);
    files[urlOf(3)] = { ...files[urlOf(3)], url: "https://www.example.org/api/search.json" };
    const failure = await failureOf(listWith().download(fakeFetch(files), {}));
    expect((failure as FetchError).reason).toBe("not_allowed");
  });

  it("fails the download as too large when a page was cut", async () => {
    const cut = searchFiles(7);
    cut[urlOf(6)] = { ...cut[urlOf(6)], truncated: true };
    expect(await failureOf(listWith().download(fakeFetch(cut), {}))).toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  it("fails the download as not the list when the search needs more pages than the list allows", async () => {
    const fetch = fakeFetch(searchFiles(7));
    const failure = await failureOf(listWith({ maxPages: 2 }).download(fetch, {}));
    expect(failure).toBeInstanceOf(NotTheListError);
    expect(fetch.calls).toHaveLength(1);
  });
});
