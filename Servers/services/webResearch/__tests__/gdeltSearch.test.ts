import http from "http";
import { Readable } from "stream";
import {
  BOT_USER_AGENT,
  FetchError,
  type GuardedFetchOptions,
  type GuardedResponse,
  type Transport,
  guardedFetch,
} from "../guardedFetch";
import {
  GDELT_COOL_DOWN_MS,
  GDELT_MAX_ASKS,
  GDELT_MIN_GAP_MS,
  buildGdeltUrl,
  createGdeltEngine,
  parseGdeltBody,
} from "../gdeltSearch";
import { MAX_SNIPPET_CHARS } from "../../vendorResearch/text";
import type { RobotsChecker } from "../robots";
import type { GdeltArticle } from "../webCache";
import { MAX_RESULTS, SearchEngineError, type SearchQueue } from "../webSearch";
import { memoryCache, settle } from "./helpers/memoryCache";

// The engine writes nothing to a log. The mock is here so that the test of that can listen.
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const JSON_TYPE = "application/json; charset=utf-8";
const FIXED_MESSAGE = "The search is not available right now";
const SECRET_QUERY = "Zorblax confidential acquisition";
const MEGABYTE = 1024 * 1024;

const passThrough: SearchQueue = (task) => task();
const allowAll: RobotsChecker = { isAllowed: async () => true };

/** An article as GDELT writes it (probed on 2026-10-31): the fields the engine does not read included. */
interface RawArticle {
  url: string;
  url_mobile: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

function raw(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    url: "https://news.example.com/acme-confirms-breach",
    url_mobile: "",
    title: "Acme confirms a breach of its support system",
    seendate: "20261025T100000Z",
    socialimage: "https://news.example.com/img/acme.jpg",
    domain: "news.example.com",
    language: "English",
    sourcecountry: "United States",
    ...overrides,
  };
}

/** The body as GDELT writes it: one object, spaces inside the brackets. */
const bodyOf = (articles: unknown[]): string =>
  `{"articles": [ ${articles.map((article) => JSON.stringify(article)).join(",")} ]}`;

/** One backslash, written once so that no test has to count them inside a string. */
const BACKSLASH = String.fromCharCode(92);

/**
 * An entry written by hand, the way a serialiser that escapes nothing would write it: the title is
 * put in as it is, so it can hold a raw control character or a backslash that begins no escape,
 * and JSON.parse refuses the body that holds it.
 */
const handWritten = (slug: string, title: string): string =>
  `{"url":"https://news.example.com/${slug}","url_mobile":"","title":"${title}","seendate":"20261025T100000Z","socialimage":"","domain":"news.example.com","language":"English","sourcecountry":"United States"}`;

/** Entries written by hand, in the shape GDELT writes: one object, spaces inside the brackets. */
const bodyOfHandWritten = (...entries: string[]): string =>
  `{"articles": [ ${entries.join(",")} ]}`;

/** What the engine keeps of the article `raw()` describes. */
const KEPT: GdeltArticle = {
  url: "https://news.example.com/acme-confirms-breach",
  title: "Acme confirms a breach of its support system",
  publishedAt: "2026-10-25T10:00:00.000Z",
  domain: "news.example.com",
  language: "English",
};

const response = (url: string, body: string, contentType = JSON_TYPE): GuardedResponse => ({
  url,
  status: 200,
  contentType,
  body: Buffer.from(body),
  truncated: false,
});

type Step = string | Error | GuardedResponse | (() => Promise<string>);

/**
 * A stand-in for guardedFetch that answers each request of the API in turn, and answers the
 * robots.txt of the host by itself (a missing file, as it is today). It runs `beforeRequest` as
 * guardedFetch does, before the request is counted, and records what it was asked.
 */
function fakeGdelt(steps: Step[], robots: { text: string } | Error = new FetchError("not_found")) {
  const script = [...steps];
  const calls: Array<{ url: string; options: GuardedFetchOptions | undefined }> = [];
  const robotsCalls: string[] = [];
  const order: string[] = [];
  const fetch = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
    if (new URL(url).pathname === "/robots.txt") {
      order.push("robots");
      robotsCalls.push(url);
      if (robots instanceof Error) throw robots;
      return response(url, robots.text, "text/plain");
    }
    await options?.beforeRequest?.(new URL(url));
    order.push("api");
    calls.push({ url, options });
    const step = script.shift();
    if (step === undefined) throw new Error("No scripted answer left");
    if (step instanceof Error) throw step;
    if (typeof step === "function") return response(url, await step());
    if (typeof step === "string") return response(url, step);
    return step;
  });
  return {
    fetch: fetch as unknown as typeof guardedFetch,
    mock: fetch,
    calls,
    robotsCalls,
    order,
  };
}

/** A failure by status, as guardedFetch gives it. */
const status = (code: number, retryAfterMs?: number): FetchError =>
  new FetchError(code === 429 || code === 403 ? "blocked_by_site" : "unreachable", undefined, {
    status: code,
    retryAfterMs,
  });

/** The real guardedFetch over a transport that answers each request by its URL. */
function overTransport(
  fetchImpl: typeof guardedFetch,
  answer: (url: URL) => { status: number; headers: http.IncomingHttpHeaders; body: string },
) {
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const transport: Transport = async ({ url, headers }) => {
    requests.push({ url: new URL(url.href), headers });
    const reply = answer(url);
    return {
      status: reply.status,
      headers: reply.headers,
      body: Readable.from([Buffer.from(reply.body)]),
    };
  };
  const fetch = ((url: string, options?: GuardedFetchOptions) =>
    fetchImpl(url, options, { transport })) as typeof guardedFetch;
  return { fetch, requests };
}

const NOT_FOUND = { status: 404, headers: { "content-type": "text/html" }, body: "Not Found" };
const JSON_OK = (body: string) => ({
  status: 200,
  headers: { "content-type": JSON_TYPE },
  body,
});
const RATE_LIMIT_TEXT =
  "Please limit requests to one every 5 seconds or contact the operator for larger queries.";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function failureOf(
  promise: Promise<unknown>,
  ErrorClass: typeof SearchEngineError = SearchEngineError,
): Promise<SearchEngineError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ErrorClass) return error;
    throw error;
  }
  throw new Error("Expected the search to fail");
}

/** The query of a request address, as GDELT reads it. */
const queryOf = (url: string): string | null => new URL(url).searchParams.get("query");

/** A copy of the module with a cool-down and a queue of its own, as another process would have. */
function freshProcess() {
  let gdelt!: typeof import("../gdeltSearch");
  let search!: typeof import("../webSearch");
  let guarded!: typeof import("../guardedFetch");
  jest.isolateModules(() => {
    gdelt = jest.requireActual("../gdeltSearch");
    search = jest.requireActual("../webSearch");
    guarded = jest.requireActual("../guardedFetch");
  });
  return {
    createGdeltEngine: gdelt.createGdeltEngine,
    SearchEngineError: search.SearchEngineError,
    createSearchQueue: search.createSearchQueue,
    guardedFetch: guarded.guardedFetch,
    FetchError: guarded.FetchError,
  };
}

describe("buildGdeltUrl", () => {
  it("asks for the articles that name the vendor and one of the topics, as a list of articles in JSON", () => {
    expect(buildGdeltUrl(["Okta"], ["breach"])).toBe(
      `${API}?query=%22Okta%22%20AND%20breach&mode=artlist&format=json&maxrecords=250`,
    );
  });

  it("quotes every name and puts the names, and the topics, in an OR block of their own", () => {
    const url = buildGdeltUrl(["Okta", "Okta Identity Cloud"], ["breach", "lawsuit", "fined"]);

    expect(queryOf(url as string)).toBe(
      '("Okta" OR "Okta Identity Cloud") AND (breach OR lawsuit OR fined)',
    );
  });

  it("uses parentheses only around more than one term", () => {
    expect(queryOf(buildGdeltUrl(["Okta"], ["breach", "lawsuit"]) as string)).toBe(
      '"Okta" AND (breach OR lawsuit)',
    );
    expect(queryOf(buildGdeltUrl(["Okta", "Auth0"], ["breach"]) as string)).toBe(
      '("Okta" OR "Auth0") AND breach',
    );
  });

  it("asks for the vendor alone when there are no topics", () => {
    expect(queryOf(buildGdeltUrl(["Okta"], []) as string)).toBe('"Okta"');
    expect(queryOf(buildGdeltUrl(["Okta", "Auth0"], []) as string)).toBe('("Okta" OR "Auth0")');
  });

  it("asks for nothing else: no time span, no sort, no language, in the order of the address", () => {
    const url = new URL(buildGdeltUrl(["Okta"], ["breach"]) as string);

    // timespan=3months made GDELT answer {} to queries that do have matches (probed 2026-10-31).
    expect([...url.searchParams.keys()]).toEqual(["query", "mode", "format", "maxrecords"]);
    expect(url.searchParams.get("mode")).toBe("artlist");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("maxrecords")).toBe("250");
    expect(url.origin + url.pathname).toBe(API);
  });

  it("percent-encodes the characters that would end or change the query, and keeps what is inside a name", () => {
    const url = buildGdeltUrl(["AT&T #1 für 50% off"], ["breach"]) as string;

    expect(url).toContain("AT%26T%20%231%20f%C3%BCr%2050%25%20off");
    expect(queryOf(url)).toBe('"AT&T #1 für 50% off" AND breach');
    expect(new URL(url).hash).toBe("");
  });

  it("removes the double quotes of a name, which would end the phrase early", () => {
    const url = buildGdeltUrl(['Acme "The Best" Analytics'], ["breach"]) as string;

    expect(queryOf(url)).toBe('"Acme The Best Analytics" AND breach');
  });

  it("writes a lone surrogate as the replacement character, and leaves out control characters", () => {
    const lone = String.fromCharCode(0xd800);
    const bell = String.fromCharCode(7);
    const nul = String.fromCharCode(0);

    const url = buildGdeltUrl([`Acme${lone}Corp`, `Zed${bell}${nul}ex`], ["breach"]) as string;

    expect(url).toContain("Acme%EF%BF%BDCorp");
    expect(queryOf(url)).toBe(`("Acme�Corp" OR "Zedex") AND breach`);
  });

  it("names the vendor as an article does: without the legal form, once", () => {
    expect(queryOf(buildGdeltUrl(["Acme Analytics, Inc.", "AcmeAI"], ["breach"]) as string)).toBe(
      '("Acme Analytics" OR "AcmeAI") AND breach',
    );
    // A name and its short form are one name.
    expect(queryOf(buildGdeltUrl(["Acme Corp", "ACME", "acme"], ["breach"]) as string)).toBe(
      '"Acme" AND breach',
    );
  });

  it("puts the words of a topic in quotes when there are several, and each topic once", () => {
    expect(
      queryOf(
        buildGdeltUrl(["Okta"], ["ICO fine", "settlement", "Settlement", "FTC", "ftc"]) as string,
      ),
    ).toBe('"Okta" AND ("ICO fine" OR settlement OR FTC)');
  });

  it("keeps only the words of a topic, so that a topic cannot be an operator of the query", () => {
    expect(
      queryOf(
        buildGdeltUrl(["Okta"], ["domain:evil.example", "-fraud", '"; OR (', "  "]) as string,
      ),
    ).toBe('"Okta" AND ("domain evil example" OR fraud)');
  });

  it("gives no address when no name is left to ask for", () => {
    expect(buildGdeltUrl([], ["breach"])).toBeNull();
    expect(buildGdeltUrl(["  ", '""', String.fromCharCode(7)], ["breach"])).toBeNull();
  });

  it("keeps the address within the length a URL may have, leaving out topics from the end first", () => {
    // 50 characters each: 40 of them (the most that are read) are longer than a URL may be.
    const topics = Array.from(
      { length: 60 },
      (_, i) => `${"w".repeat(48)}${String(i).padStart(2, "0")}`,
    );
    const all = buildGdeltUrl(["Okta", "Auth0"], topics.slice(0, 5)) as string;
    expect(all).toContain(`(${"w".repeat(48)}00%20OR%20`);

    const url = buildGdeltUrl(["Okta", "Auth0"], topics) as string;

    const href = new URL(url).href;
    expect(href.length).toBeLessThanOrEqual(2048);
    // Not one topic more than had to go: one more would have fitted.
    expect(href.length).toBeGreaterThan(2048 - 60);
    const query = queryOf(url) as string;
    expect(
      query.startsWith(`("Okta" OR "Auth0") AND (${"w".repeat(48)}00 OR ${"w".repeat(48)}01`),
    ).toBe(true);
    const kept = query.match(/w{48}\d\d/g) as string[];
    expect(kept.length).toBeGreaterThan(20);
    expect(kept.length).toBeLessThan(40);
    expect(kept[kept.length - 1]).toBe(
      `${"w".repeat(48)}${String(kept.length - 1).padStart(2, "0")}`,
    );
    expect(query).not.toContain(`${"w".repeat(48)}39`);
  });

  it("leaves out names from the end when even the names do not fit, and keeps the first one", () => {
    const names = Array.from({ length: 9 }, (_, i) => `${i}`.repeat(1) + "中".repeat(75));

    const url = buildGdeltUrl(names, ["breach"]) as string;

    expect(new URL(url).href.length).toBeLessThanOrEqual(2048);
    expect(queryOf(url)).toContain(names[0].slice(0, 20));
  });
});

describe("parseGdeltBody", () => {
  it("reads the fields of an article that the engine keeps, and nothing else", () => {
    expect(parseGdeltBody(bodyOf([raw()]))).toEqual([KEPT]);
    expect(Object.keys(parseGdeltBody(bodyOf([raw()]))[0]).sort()).toEqual([
      "domain",
      "language",
      "publishedAt",
      "title",
      "url",
    ]);
  });

  it("reads a body as GDELT writes it: spaces inside the brackets, titles in any script", () => {
    const articles = parseGdeltBody(
      bodyOf([
        raw({
          url: "https://news.pedaily.cn/202610/570897.shtml",
          title: "Manus ， 刚刚悄悄发布了",
          domain: "news.pedaily.cn",
          language: "Chinese",
        }),
      ]),
    );

    expect(articles[0]).toMatchObject({
      title: "Manus ， 刚刚悄悄发布了",
      language: "Chinese",
    });
  });

  it.each([
    ["20261025T100000Z", "2026-10-25T10:00:00.000Z"],
    ["20260101T000000Z", "2026-01-01T00:00:00.000Z"],
    ["20261231T235959Z", "2026-12-31T23:59:59.000Z"],
    ["20280229T120000Z", "2028-02-29T12:00:00.000Z"],
  ])("converts the seendate %j to %j", (seendate, expected) => {
    expect(parseGdeltBody(bodyOf([raw({ seendate })]))[0].publishedAt).toBe(expected);
  });

  it.each([
    ["a month that does not exist", "20261325T100000Z"],
    ["a day that the month lacks", "20260230T100000Z"],
    ["a 29 February in a year that has none", "20270229T100000Z"],
    ["an hour past 23", "20261025T250000Z"],
    ["a minute past 59", "20261025T106000Z"],
    ["a day 0", "20261000T100000Z"],
    ["ISO 8601 written with separators", "2026-10-25T10:00:00Z"],
    ["a day with no time", "20261025"],
    ["a time with no zone", "20261025T100000"],
    ["a word", "yesterday"],
    ["an empty text", ""],
  ])("gives no date for a seendate that is %s", (_name, seendate) => {
    expect(parseGdeltBody(bodyOf([raw({ seendate })]))[0].publishedAt).toBeNull();
  });

  it.each([
    ["a number", 20261025],
    ["null", null],
    ["a list", ["20261025T100000Z"]],
  ])("gives no date for a seendate that is %s", (_name, seendate) => {
    expect(parseGdeltBody(bodyOf([{ ...raw(), seendate }]))[0].publishedAt).toBeNull();
  });

  it("gives no date, and keeps the article, when the seendate is missing", () => {
    const { seendate: _seendate, ...withoutDate } = raw();
    expect(parseGdeltBody(bodyOf([withoutDate]))).toEqual([{ ...KEPT, publishedAt: null }]);
  });

  it("gives an empty domain and an empty language when GDELT gives none", () => {
    const { domain: _domain, language: _language, ...bare } = raw();
    expect(parseGdeltBody(bodyOf([bare]))).toEqual([{ ...KEPT, domain: "", language: "" }]);
  });

  it("is an empty index for an object with no articles, which is an answer", () => {
    expect(parseGdeltBody("{}")).toEqual([]);
    expect(parseGdeltBody('{"articles": []}')).toEqual([]);
    expect(parseGdeltBody('{"timeline": []}')).toEqual([]);
  });

  it("reads a body that starts with a byte order mark", () => {
    expect(parseGdeltBody(String.fromCharCode(0xfeff) + bodyOf([raw()]))).toEqual([KEPT]);
  });

  it.each([
    ["the refusal of a query, in plain text", "The specified phrase is too short."],
    ["the text of a rate limit", RATE_LIMIT_TEXT],
    ["an HTML page", "<html><body>Service unavailable</body></html>"],
    ["an empty body", ""],
    ["a body that was cut off", '{"articles": [ {"url": "https://example.com/a", "title": "x'],
    ["a list instead of an object", "[]"],
    ["null", "null"],
    ["a number", "7"],
    ["a text", '"hello"'],
    ["articles that are not a list", '{"articles": "none"}'],
    ["articles that are null", '{"articles": null}'],
    ["articles that are an object", '{"articles": {"0": {}}}'],
  ])("throws a SearchEngineError for %s, since it is no answer", (_name, body) => {
    expect(() => parseGdeltBody(body)).toThrow(SearchEngineError);
  });

  // GDELT is known to leave two flaws in a body that is otherwise an answer: a raw control
  // character in a title (JSON forbids it inside a string) and a backslash that begins no escape.
  // The clients of its API repair them, since one flaw in one of 250 titles would otherwise cost the
  // run all of its news.
  describe("a body that JSON refuses for a stray character", () => {
    const GOOD = handWritten("good", "Acme confirms a breach");
    const titlesOf = (text: string): string[] =>
      parseGdeltBody(text).map((article) => article.title);

    it("keeps every article of the index when one title holds a raw tab", () => {
      const articles = parseGdeltBody(
        bodyOfHandWritten(
          GOOD,
          handWritten("tab", "Acme\tfined"),
          handWritten("after", "Acme settles"),
        ),
      );

      expect(articles.map((article) => [article.url, article.title])).toEqual([
        ["https://news.example.com/good", "Acme confirms a breach"],
        ["https://news.example.com/tab", "Acme fined"],
        ["https://news.example.com/after", "Acme settles"],
      ]);
      // The article of the repaired title is read like any other.
      expect(articles[1]).toMatchObject({
        publishedAt: "2026-10-25T10:00:00.000Z",
        domain: "news.example.com",
        language: "English",
      });
    });

    it.each(Array.from({ length: 32 }, (_, code) => [code]))(
      "reads a body with the control character %i raw in a title, as a space",
      (code) => {
        const title = `Acme${String.fromCharCode(code)}fined`;

        expect(titlesOf(bodyOfHandWritten(GOOD, handWritten("control", title)))).toEqual([
          "Acme confirms a breach",
          "Acme fined",
        ]);
      },
    );

    it("reads a body with a control character between its tokens, where it is white space", () => {
      const body = bodyOfHandWritten(GOOD).replace(
        '"articles":',
        `"articles":${String.fromCharCode(12)}`,
      );

      expect(body).toContain(String.fromCharCode(12));
      expect(titlesOf(body)).toEqual(["Acme confirms a breach"]);
    });

    it("keeps every article when a title holds a backslash that begins no escape, and keeps the backslash", () => {
      const titles = titlesOf(
        bodyOfHandWritten(
          GOOD,
          handWritten("apostrophe", `Acme${BACKSLASH}'s outage`),
          handWritten("name", `Acme${BACKSLASH}Corp breach`),
          handWritten("short", `Acme${BACKSLASH}u12 fined`),
        ),
      );

      // The backslash is part of the title as it was written: nothing is guessed about it.
      expect(titles).toEqual([
        "Acme confirms a breach",
        "Acme\\'s outage",
        "Acme\\Corp breach",
        "Acme\\u12 fined",
      ]);
    });

    it("repairs a control character and a stray backslash in the same body", () => {
      const titles = titlesOf(
        bodyOfHandWritten(
          handWritten("tab", "Acme\tfined"),
          GOOD,
          handWritten("backslash", `Acme${BACKSLASH}'s outage`),
        ),
      );

      expect(titles).toEqual(["Acme fined", "Acme confirms a breach", "Acme\\'s outage"]);
    });

    it("leaves the valid escapes of the body as they are when it repairs the rest of it", () => {
      // A valid escape is taken as a pair: the second backslash of an escaped backslash is no
      // start of an escape, and the apostrophe after it is a plain character.
      const escapedQuote = `${BACKSLASH}"`;
      const body = bodyOfHandWritten(
        handWritten("quote", `He said ${escapedQuote}no${escapedQuote}`),
        handWritten("backslash", `C:${BACKSLASH}${BACKSLASH}'s`),
        handWritten("three", `${BACKSLASH}${BACKSLASH}${BACKSLASH}'`),
        handWritten("unicode", `Caf${BACKSLASH}u00e9 ${BACKSLASH}u4e2d`),
        handWritten("slash", `a${BACKSLASH}/b`),
        handWritten("newline", `one${BACKSLASH}ntwo`),
        handWritten("tab", "Acme\tfined"),
      );

      expect(titlesOf(body)).toEqual([
        'He said "no"',
        "C:\\'s",
        // An escaped backslash, then a backslash that begins no escape, then a plain apostrophe.
        "\\\\'",
        "Café 中",
        "a/b",
        // The escaped line break is white space once the title is one line.
        "one two",
        "Acme fined",
      ]);
    });

    it("reads the same index with or without the flaw, apart from the repaired title", () => {
      const clean = parseGdeltBody(bodyOf([raw({ title: "Acme fined" })]));
      const flawed = parseGdeltBody(
        bodyOfHandWritten(
          `{"url":"https://news.example.com/acme-confirms-breach","url_mobile":"","title":"Acme\tfined","seendate":"20261025T100000Z","socialimage":"https://news.example.com/img/acme.jpg","domain":"news.example.com","language":"English","sourcecountry":"United States"}`,
        ),
      );

      expect(flawed).toEqual(clean);
    });

    it("applies the rules of any other article to an article of a repaired body", () => {
      const articles = parseGdeltBody(
        bodyOfHandWritten(
          `{"url":"http://127.0.0.1/admin","title":"Acme${String.fromCharCode(9)}internal"}`,
          handWritten("kept", "Acme\tfined"),
          handWritten("kept", "Acme again\tfined"),
          `{"url":"https://news.example.com/blank","title":"${String.fromCharCode(9)}"}`,
        ),
      );

      // Not a public address; the second entry of one address; a title that is only white space.
      expect(articles.map((article) => [article.url, article.title])).toEqual([
        ["https://news.example.com/kept", "Acme fined"],
      ]);
    });

    it.each([
      ["a refusal in plain text that holds a tab", "The specified\tphrase is too short."],
      [
        "a body that was cut, with a stray tab and a stray backslash",
        `{"articles": [ {"url": "https://example.com/a", "title": "x\ty${BACKSLASH}'`,
      ],
      [
        "a stray tab and a missing closing bracket",
        bodyOfHandWritten(GOOD, handWritten("tab", "Acme\tfined")).slice(0, -2),
      ],
      ["a stray backslash outside any string", `{"articles": ${BACKSLASH} []}`],
      [
        // A backslash before the closing quote escapes it: that cannot be told from a valid escape.
        "a title that ends in a backslash, which escapes the quote that closes it",
        bodyOfHandWritten(GOOD, handWritten("end", `Acme fined${BACKSLASH}`)),
      ],
      [
        "a stray tab and a title with quotes that end it early",
        bodyOfHandWritten(
          GOOD,
          handWritten("tab", "Acme\tfined"),
          handWritten("quote", 'He said "no" and left'),
        ),
      ],
      [
        "a title with quotes that end it early, and no flaw that a repair could mend",
        bodyOfHandWritten(handWritten("quote", 'He said "no" and left')),
      ],
    ])("still throws a SearchEngineError for %s", (_name, text) => {
      expect(() => parseGdeltBody(text)).toThrow(SearchEngineError);
    });

    it("reads the body at most twice, once as it came and once repaired: there is no loop of repairs", () => {
      const reads = (text: string): number => {
        const parse = jest.spyOn(JSON, "parse");
        let failure: unknown;
        try {
          parseGdeltBody(text);
        } catch (error) {
          failure = error;
        }
        const calls = parse.mock.calls.length;
        parse.mockRestore();
        if (failure !== undefined) expect(failure).toBeInstanceOf(SearchEngineError);
        return calls;
      };
      // Many flaws in one body cost the one repair, not one repair for each.
      const manyFlaws = bodyOfHandWritten(
        ...Array.from({ length: 50 }, (_, i) =>
          handWritten(`story-${i}`, `Acme${i % 2 === 0 ? "\t" : `${BACKSLASH}'`}fined`),
        ),
      );

      expect(reads(bodyOf([raw()]))).toBe(1);
      expect(reads(manyFlaws)).toBe(2);
      expect(reads(`{"articles": ${BACKSLASH} []}`)).toBe(2);
      expect(reads("The specified phrase is too short.")).toBe(1);
      expect(reads(bodyOfHandWritten(handWritten("quote", 'He said "no" and left')))).toBe(1);
    });

    it("does not touch a body that JSON accepts: its escapes mean what they say", () => {
      const body = bodyOfHandWritten(
        handWritten("tab", `a${BACKSLASH}tb`),
        handWritten("quote", `${BACKSLASH}"x${BACKSLASH}"`),
        handWritten("backslash", `${BACKSLASH}${BACKSLASH}'`),
      );

      // \t is a tab (a space once the title is one line); \\ then ' is a backslash and a quote mark.
      expect(titlesOf(body)).toEqual(["a b", '"x"', "\\'"]);
    });
  });

  it.each([
    ["a local address", "http://localhost/admin"],
    ["an address with a port", "https://example.com:8443/a"],
    ["an address with credentials", "https://user:secret@example.com/a"],
    ["an address that is an IP number", "http://169.254.169.254/latest/meta-data/"],
    ["another scheme", "ftp://example.com/a"],
    ["not an address", "not a link"],
    ["an empty address", ""],
    ["an address of 2,100 characters", `https://example.com/${"a".repeat(2100)}`],
  ])("drops an article with %s", (_name, url) => {
    expect(parseGdeltBody(bodyOf([raw({ url })]))).toEqual([]);
  });

  it("drops an article with no address, a title that is empty or missing, and an entry that is no object", () => {
    const { url: _url, ...noUrl } = raw();
    const { title: _title, ...noTitle } = raw();

    const articles = parseGdeltBody(
      bodyOf([
        noUrl,
        noTitle,
        raw({ title: "   " }),
        raw({ title: String.fromCharCode(7) }),
        "a string",
        7,
        null,
        ["an", "array"],
        { url: 5, title: "x" },
        raw({ url: "https://news.example.com/kept" }),
      ]),
    );

    expect(articles.map((article) => article.url)).toEqual(["https://news.example.com/kept"]);
  });

  it("writes the address as the URL parser does, and keeps the first of two equal ones", () => {
    const articles = parseGdeltBody(
      bodyOf([
        raw({ title: "first", url: "https://NEWS.example.com/a#top" }),
        raw({ title: "second", url: "https://news.example.com/a" }),
        raw({ title: "third", url: "https://news.example.com/b" }),
      ]),
    );

    expect(articles.map((article) => [article.title, article.url])).toEqual([
      ["first", "https://news.example.com/a"],
      ["third", "https://news.example.com/b"],
    ]);
  });

  it("makes a title one line of plain text without control characters, cut to the length of a snippet", () => {
    const [clean, long, emoji] = parseGdeltBody(
      bodyOf([
        raw({ url: "https://news.example.com/1", title: "  A\n\ttitle with\u0000 gaps  " }),
        raw({ url: "https://news.example.com/2", title: "word ".repeat(2000) }),
        raw({ url: "https://news.example.com/3", title: "\u{1F600}".repeat(1000) }),
      ]),
    );

    expect(clean.title).toBe("A title with gaps");
    expect(long.title.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
    expect(long.title.length).toBeGreaterThan(MAX_SNIPPET_CHARS - 5);
    expect(emoji.title.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
    expect(emoji.title.length % 2).toBe(0);
    expect(emoji.title.charCodeAt(emoji.title.length - 1)).toBeGreaterThanOrEqual(0xdc00);
  });

  it("does not take markup out of a title: a title is plain text, and the page that shows it escapes it", () => {
    const [article] = parseGdeltBody(bodyOf([raw({ title: "5 < 6 & <b>bold</b> claims" })]));

    expect(article.title).toBe("5 < 6 & <b>bold</b> claims");
  });

  it("reads the first 250 entries, the number the request asks for, and no more", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      raw({ url: `https://news.example.com/story-${i}`, title: `Story ${i}` }),
    );

    const articles = parseGdeltBody(bodyOf(many));

    expect(articles).toHaveLength(250);
    expect(articles[249].url).toBe("https://news.example.com/story-249");
  });

  it("is the same for a body of numbers in a title or a domain: they are read as text, or not at all", () => {
    const [article] = parseGdeltBody(bodyOf([{ ...raw(), domain: 5, language: ["English"] }]));

    expect(article).toMatchObject({ domain: "", language: "" });
  });
});

describe("the engine", () => {
  it("declares who it is: the id gdelt, the news only, and a window of 3 months", () => {
    const engine = createGdeltEngine({ names: ["Acme"], topics: [] });

    expect(engine.id).toBe("gdelt");
    expect(engine.kinds).toEqual(["news"]);
    expect(engine.newsWindowMonths).toBe(3);
  });

  it("spaces its requests 5,000 ms apart, as GDELT asks", () => {
    expect(GDELT_MIN_GAP_MS).toBe(5_000);
    expect(GDELT_COOL_DOWN_MS).toBe(60_000);
  });

  describe("the request", () => {
    it("is one request of the address of buildGdeltUrl, with the limits of the search, inside the queue", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const gate = deferred();
      let tasks = 0;
      const queue: SearchQueue = (task) => {
        tasks += 1;
        return gate.promise.then(task);
      };
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach", "lawsuit"],
        fetch: feed.fetch,
        queue,
        robots: allowAll,
      });

      const search = engine.search("Acme breach", "news");
      await flush();
      expect(feed.mock).not.toHaveBeenCalled();
      gate.resolve();
      await search;

      expect(tasks).toBe(1);
      expect(feed.calls).toHaveLength(1);
      expect(feed.calls[0].url).toBe(buildGdeltUrl(["Acme"], ["breach", "lawsuit"]));
      expect(feed.mock.mock.calls[0]).toHaveLength(2);
      expect(feed.calls[0].options).toEqual({
        allowedContentTypes: ["application/json"],
        maxBytes: 1_048_576,
        headerTimeoutMs: 20_000,
        totalTimeoutMs: 20_000,
        beforeRequest: expect.any(Function),
      });
      // The bot names itself: no user agent of ours is passed, and no signal of a search.
      expect(feed.calls[0].options).not.toHaveProperty("userAgent");
      expect(feed.calls[0].options).not.toHaveProperty("signal");
    });

    it("is a single request for any number of searches that run at the same time", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      const answers = await Promise.all([
        engine.search("Acme breach", "news"),
        engine.search("Acme lawsuit", "news"),
        engine.search("Acme outage", "news"),
        engine.search("Acme", "news"),
        engine.search("Acme acquisition layoffs", "news"),
        engine.search("Acme data breach", "news"),
      ]);

      expect(feed.calls).toHaveLength(1);
      expect(answers[0]).toHaveLength(1);
      expect(answers[3]).toHaveLength(1);
    });

    it("answers the searches that follow from the same index, with no other request", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const queue: SearchQueue = jest.fn((task) => task());
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue,
        robots: allowAll,
      });

      await engine.search("Acme breach", "news");
      await engine.search("Acme lawsuit", "news");
      await engine.search("Acme", "news");

      expect(feed.calls).toHaveLength(1);
      expect(queue).toHaveBeenCalledTimes(1);
    });

    it("is made once for each engine: another run asks for itself", async () => {
      const feed = fakeGdelt([bodyOf([raw()]), bodyOf([raw()])]);
      const make = () =>
        createGdeltEngine({
          names: ["Acme"],
          topics: ["breach"],
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
        });

      await make().search("Acme breach", "news");
      await make().search("Acme breach", "news");

      expect(feed.calls).toHaveLength(2);
    });

    it("is not made, and nothing is asked, when no name is left to search for", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: [" ", '""'],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      await failureOf(engine.search("breach", "news"));

      expect(feed.mock).not.toHaveBeenCalled();
    });

    it("is not cut short by the abort of one of the searches that wait for it: the others still get the index", async () => {
      const release = deferred<string>();
      const feed = fakeGdelt([() => release.promise]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });
      const first = new AbortController();
      const second = new AbortController();

      const aborted = failureOf(engine.search("Acme breach", "news", first.signal));
      const kept = engine.search("Acme breach", "news", second.signal);
      const alsoKept = engine.search("Acme lawsuit", "news");
      await flush();
      first.abort();

      // The search that was aborted ends at once, while the request is still under way.
      expect((await aborted).message).toBe(FIXED_MESSAGE);
      release.resolve(bodyOf([raw()]));
      await expect(kept).resolves.toHaveLength(1);
      await expect(alsoKept).resolves.toEqual([]);
      expect(feed.calls).toHaveLength(1);
      expect(feed.calls[0].options?.signal).toBeUndefined();
    });

    it("is not made for a search whose signal has aborted already, and the next search makes it", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });
      const aborted = new AbortController();
      aborted.abort();

      await failureOf(engine.search("Acme breach", "news", aborted.signal));
      expect(feed.mock).not.toHaveBeenCalled();

      await expect(engine.search("Acme breach", "news")).resolves.toHaveLength(1);
      expect(feed.calls).toHaveLength(1);
    });

    it("is the answer of the run when it fails: the searches that follow fail at once, without asking again", async () => {
      const feed = fakeGdelt([status(503), status(503), bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      const concurrent = await Promise.all([
        failureOf(engine.search("Acme breach", "news")),
        failureOf(engine.search("Acme lawsuit", "news")),
      ]);
      await failureOf(engine.search("Acme outage", "news"));

      expect(concurrent.map((error) => error.message)).toEqual([FIXED_MESSAGE, FIXED_MESSAGE]);
      // The first request and its one retry; nothing more for the rest of the run.
      expect(feed.calls).toHaveLength(2);
    });
  });

  describe("robots.txt", () => {
    it("is asked before the request, from the host of the API", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      await engine.search("Acme breach", "news");

      expect(feed.order).toEqual(["robots", "api"]);
      expect(feed.robotsCalls).toEqual(["https://api.gdeltproject.org/robots.txt"]);
    });

    it("is asked once for a run, however many searches it makes", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      await Promise.all([engine.search("Acme breach", "news"), engine.search("Acme", "news")]);
      await engine.search("Acme lawsuit", "news");

      expect(feed.robotsCalls).toHaveLength(1);
    });

    it("is asked as the page reader asks it, with the request's own time limit: any type is read, in 20 seconds, at 64 KiB", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const robotsOptions: Array<GuardedFetchOptions | undefined> = [];
      const fetch = ((url: string, options?: GuardedFetchOptions) => {
        if (url.endsWith("/robots.txt")) robotsOptions.push(options);
        return (feed.fetch as (u: string, o?: GuardedFetchOptions) => Promise<GuardedResponse>)(
          url,
          options,
        );
      }) as typeof guardedFetch;
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch,
        queue: passThrough,
      });

      await engine.search("Acme breach", "news");

      expect(robotsOptions).toEqual([
        {
          allowedContentTypes: ["text/plain", "*/*"],
          maxBytes: 65_536,
          headerTimeoutMs: 20_000,
          totalTimeoutMs: 20_000,
        },
      ]);
    });

    it("lets the request go when the site has no robots.txt, or refuses to show it", async () => {
      for (const absent of [new FetchError("not_found", undefined, { status: 404 }), status(403)]) {
        const feed = fakeGdelt([bodyOf([raw()])], absent);
        const engine = createGdeltEngine({
          names: ["Acme"],
          topics: ["breach"],
          fetch: feed.fetch,
          queue: passThrough,
        });

        await expect(engine.search("Acme breach", "news")).resolves.toHaveLength(1);
      }
    });

    it("makes no request when robots.txt does not allow the path of the API", async () => {
      const feed = fakeGdelt([bodyOf([raw()])], { text: "User-agent: *\nDisallow: /api/\n" });
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      const error = await failureOf(engine.search("Acme breach", "news"));

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(feed.calls).toHaveLength(0);
      expect(feed.order).toEqual(["robots"]);
    });

    it("obeys the group of our bot over the rules for every agent", async () => {
      const text =
        "User-agent: *\nDisallow: /\n\nUser-agent: VerifyWiseResearchBot\nAllow: /api/\n";
      const feed = fakeGdelt([bodyOf([raw()])], { text });
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      await expect(engine.search("Acme breach", "news")).resolves.toHaveLength(1);
    });

    it("makes no request when robots.txt cannot be reached, which disallows everything", async () => {
      const feed = fakeGdelt([bodyOf([raw()])], new FetchError("unreachable"));
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      await failureOf(engine.search("Acme breach", "news"));

      expect(feed.calls).toHaveLength(0);
    });

    it("does not ask again after a robots.txt that disallows: that is the answer of the run", async () => {
      const feed = fakeGdelt([bodyOf([raw()])], { text: "User-agent: *\nDisallow: /api/\n" });
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
      });

      await failureOf(engine.search("Acme breach", "news"));
      await failureOf(engine.search("Acme lawsuit", "news"));

      expect(feed.order).toEqual(["robots"]);
    });

    it("asks the checker it is given about the address it is about to request", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const asked: string[] = [];
      const robots: RobotsChecker = {
        isAllowed: async (url) => {
          asked.push(url.href);
          return true;
        },
      };
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots,
      });

      await engine.search("Acme breach", "news");

      expect(asked).toEqual([buildGdeltUrl(["Acme"], ["breach"])]);
      expect(feed.robotsCalls).toEqual([]);
    });

    it("makes no request when the checker it is given does not allow it", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: { isAllowed: async () => false },
      });

      await failureOf(engine.search("Acme breach", "news"));

      expect(feed.calls).toHaveLength(0);
    });

    it("keeps the robots.txt in the cache for the runs that follow, as the page reader does", async () => {
      const { cache } = memoryCache();
      const feed = fakeGdelt([bodyOf([raw()]), bodyOf([raw()])]);
      const make = (name: string) =>
        createGdeltEngine({
          names: [name],
          topics: ["breach"],
          fetch: feed.fetch,
          queue: passThrough,
          cache,
        });

      await make("Acme").search("Acme breach", "news");
      await settle();
      await make("Globex").search("Globex breach", "news");

      // Two requests of the API for two vendors, and one request of robots.txt for both.
      expect(feed.calls).toHaveLength(2);
      expect(feed.robotsCalls).toHaveLength(1);
    });
  });

  describe("what the answer of the API is made into", () => {
    it("gives the articles that name the topic, as search results of the news, with no snippet", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      await expect(engine.search("Acme breach", "news")).resolves.toEqual([
        {
          title: "Acme confirms a breach of its support system",
          url: "https://news.example.com/acme-confirms-breach",
          snippet: "",
          publishedAt: "2026-10-25T10:00:00.000Z",
          source: "news.example.com",
        },
      ]);
    });

    it("gives the domain of the article as its source, and null when GDELT gave none", async () => {
      const feed = fakeGdelt([
        bodyOf([
          raw({ url: "https://a.example.com/1", domain: "a.example.com" }),
          raw({ url: "https://b.example.com/2", domain: "" }),
        ]),
      ]);
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: [],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      const results = await engine.search("Acme", "news");

      expect(results.map((result) => result.source)).toEqual(["a.example.com", null]);
    });

    it("gives an empty list for an index with no articles, which is an answer", async () => {
      const feed = fakeGdelt(["{}"]);
      const engine = createGdeltEngine({
        names: ["Nobody"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
      });

      await expect(engine.search("Nobody breach", "news")).resolves.toEqual([]);
      await expect(engine.search("Nobody", "news")).resolves.toEqual([]);
      expect(feed.calls).toHaveLength(1);
    });

    describe("an index with a stray character in one title", () => {
      const flawedBody = () =>
        bodyOfHandWritten(
          handWritten("first", "Acme confirms a breach"),
          handWritten("tab", "Acme fined over a breach\tof its systems"),
          handWritten("backslash", `Acme${BACKSLASH}'s breach is the third this year`),
          handWritten("other", "Acme opens a new office"),
        );

      const make = (feed: ReturnType<typeof fakeGdelt>) =>
        createGdeltEngine({
          names: ["Acme"],
          topics: ["breach", "office"],
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
        });

      it("is read all the same: the run keeps the news of every other article, from the one request", async () => {
        const feed = fakeGdelt([flawedBody()]);
        const engine = make(feed);

        const breach = await engine.search("Acme breach", "news");
        const office = await engine.search("Acme office", "news");

        expect(breach.map((result) => result.title)).toEqual([
          "Acme confirms a breach",
          "Acme fined over a breach of its systems",
          "Acme\\'s breach is the third this year",
        ]);
        expect(office.map((result) => result.title)).toEqual(["Acme opens a new office"]);
        // The repair is made in code on the body that came: no second request is made for it.
        expect(feed.calls).toHaveLength(1);
      });

      it("keeps the repaired index in the cache for the runs that follow, and never the flaw", async () => {
        const { cache, writes } = memoryCache();
        const feed = fakeGdelt([flawedBody()]);
        const earlier = createGdeltEngine({
          names: ["Acme"],
          topics: ["breach", "office"],
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
          cache,
        });
        await earlier.search("Acme breach", "news");
        await settle();

        const nothing = fakeGdelt([]);
        const later = createGdeltEngine({
          names: ["Acme"],
          topics: ["breach", "office"],
          fetch: nothing.fetch,
          queue: passThrough,
          robots: allowAll,
          cache,
        });
        const results = await later.search("Acme breach", "news");

        expect(writes).toHaveLength(1);
        expect(writes[0].kind).toBe("gdelt");
        expect(writes[0].value).not.toContain("\\t");
        expect(JSON.parse(writes[0].value).map((article: GdeltArticle) => article.title)).toEqual([
          "Acme confirms a breach",
          "Acme fined over a breach of its systems",
          "Acme\\'s breach is the third this year",
          "Acme opens a new office",
        ]);
        expect(results).toHaveLength(3);
        expect(nothing.calls).toHaveLength(0);
      });

      it("is still the answer of the run when the body stays unreadable after the repair: no second request", async () => {
        const feed = fakeGdelt([
          flawedBody().slice(0, -2),
          bodyOfHandWritten(handWritten("good", "Acme confirms a breach")),
        ]);
        const engine = make(feed);

        await failureOf(engine.search("Acme breach", "news"));
        await failureOf(engine.search("Acme office", "news"));

        expect(feed.calls).toHaveLength(1);
      });
    });

    describe("the articles that a search keeps", () => {
      const titled = (title: string, n: number, extra: Partial<RawArticle> = {}) =>
        raw({ url: `https://news.example.com/${n}`, title, ...extra });

      async function search(query: string, articles: RawArticle[], names = ["Acme"]) {
        const feed = fakeGdelt([bodyOf(articles)]);
        const engine = createGdeltEngine({
          names,
          topics: ["breach"],
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
        });
        return (await engine.search(query, "news")).map((result) => result.title);
      }

      it("are those whose title has a topic word at the start of one of its words, in any case", async () => {
        const titles = await search("Acme breach", [
          titled("Acme BREACH confirmed", 1),
          titled("Several breaches at Acme", 2),
          titled("Acme was breached again", 3),
          titled("Acme outage hits users", 4),
          titled("Data-breach at Acme", 5),
          titled("A defence of Acme", 6),
        ]);

        expect(titles).toEqual([
          "Acme BREACH confirmed",
          "Several breaches at Acme",
          "Acme was breached again",
          "Data-breach at Acme",
        ]);
      });

      it("do not have the topic word inside a word or at its end", async () => {
        const titles = await search("Acme lawsuit", [
          titled("Acme faces a lawsuit", 1),
          titled("Acme faces a countersuit lawsuits", 2),
          titled("Acme mylawsuit", 3),
          titled("Acme, no suit", 4),
        ]);

        expect(titles).toEqual(["Acme faces a lawsuit", "Acme faces a countersuit lawsuits"]);
      });

      it("are those with any one of the topic words of the query", async () => {
        const titles = await search("Acme lawsuit fined outage", [
          titled("Acme fined 5 million", 1),
          titled("Acme outage in Europe", 2),
          titled("Acme lawsuit settled", 3),
          titled("Acme opens a new office", 4),
        ]);

        expect(titles).toEqual([
          "Acme fined 5 million",
          "Acme outage in Europe",
          "Acme lawsuit settled",
        ]);
      });

      it("take the words of the vendor's names for no topic: not of the name, of a short form or of another name", async () => {
        const titles = await search(
          "Acme Analytics Inc AcmeAI breach",
          [
            titled("Acme Analytics opens an office", 1),
            titled("AcmeAI hires a new chief", 2),
            titled("Incorporated in Delaware: Acme", 3),
            titled("Acme data breach confirmed", 4),
          ],
          ["Acme Analytics, Inc.", "AcmeAI"],
        );

        expect(titles).toEqual(["Acme data breach confirmed"]);
      });

      it("are all of the newest when the query holds the name alone, whatever the title says", async () => {
        const titles = await search("Acme", [
          titled("An old story", 1, { seendate: "20260901T000000Z" }),
          titled("Unrelated headline", 2, { seendate: "20261020T000000Z" }),
        ]);

        expect(titles).toEqual(["Unrelated headline", "An old story"]);
      });

      it("are all of the newest too when every word of the query is a word of a name", async () => {
        const titles = await search(
          "Acme Analytics Inc",
          [titled("Anything", 1)],
          ["Acme Analytics, Inc."],
        );

        expect(titles).toEqual(["Anything"]);
      });

      it("include an article that is not in English, whatever the topic: GDELT matched it on its translation", async () => {
        const titles = await search("Acme breach", [
          titled("Acme opens a new office", 1),
          titled("Acme meldet einen neuen Standort", 2, { language: "German" }),
          titled("Été chaud pour Acme", 3, { language: "French" }),
        ]);

        expect(titles).toEqual(["Acme meldet einen neuen Standort", "Été chaud pour Acme"]);
      });

      it("keep the title of an English article to the test, and treat an article with no language as English", async () => {
        const titles = await search("Acme breach", [
          titled("Acme opens a new office", 1, { language: "english" }),
          titled("Acme opens a new office", 2, { language: "" }),
          titled("Acme breach", 3, { language: "" }),
        ]);

        expect(titles).toEqual(["Acme breach"]);
      });

      it("read the topic words in any script, and compare them without regard to case", async () => {
        const titles = await search("Acme Datenleck утечка", [
          titled("DATENLECKS bei Acme", 1),
          titled("УТЕЧКА данных Acme", 2),
          titled("Acme news", 3),
        ]);

        expect(titles).toEqual(["DATENLECKS bei Acme", "УТЕЧКА данных Acme"]);
      });

      it("come newest first, with the order of GDELT kept among those of one moment, and the undated last", async () => {
        const titles = await search("Acme breach", [
          titled("breach undated", 1, { seendate: "" }),
          titled("breach A same moment", 2, { seendate: "20261020T000000Z" }),
          titled("breach oldest", 3, { seendate: "20260801T000000Z" }),
          titled("breach newest", 4, { seendate: "20261024T120000Z" }),
          titled("breach B same moment", 5, { seendate: "20261020T000000Z" }),
        ]);

        expect(titles).toEqual([
          "breach newest",
          "breach A same moment",
          "breach B same moment",
          "breach oldest",
          "breach undated",
        ]);
      });

      it("are at most MAX_RESULTS, the newest", async () => {
        const articles = Array.from({ length: 40 }, (_, i) =>
          titled(`breach story ${i}`, i, {
            seendate: `202610${String(1 + (i % 28)).padStart(2, "0")}T000000Z`,
          }),
        );

        const titles = await search("Acme breach", articles);

        expect(MAX_RESULTS).toBe(10);
        expect(titles).toHaveLength(10);
        // 40 stories on 28 days: the ten newest are those of the last days of the month.
        expect(titles[0]).toBe("breach story 27");
      });

      it("are the same whatever the order of the words of the query", async () => {
        const articles = [titled("Acme fined", 1), titled("Acme breach", 2)];

        expect(await search("Acme fined breach", articles)).toEqual(
          await search("breach fined Acme", articles),
        );
      });
    });

    it("refuses a search of the web, and makes no request", async () => {
      const feed = fakeGdelt([bodyOf([raw()])]);
      const { cache, reads } = memoryCache();
      const engine = createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      const error = await failureOf(engine.search("Acme breach", "web"));

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(feed.mock).not.toHaveBeenCalled();
      expect(reads).toEqual([]);
    });
  });

  describe("a search that failed", () => {
    const make = (feed: ReturnType<typeof fakeGdelt>, extra = {}) =>
      createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        ...extra,
      });

    it("gives the same error whatever went wrong, with nothing of the query in it", async () => {
      const failures: Array<[string, Step]> = [
        ["a refusal in plain text", "The specified phrase is too short."],
        ["a FetchError", new FetchError("unsupported_type", `bad for ${SECRET_QUERY}`)],
        ["an error of our own", new TypeError(`broken by ${SECRET_QUERY}`)],
      ];
      for (const [, step] of failures) {
        const engine = make(fakeGdelt([step]));

        const error = await failureOf(engine.search(SECRET_QUERY, "news"));

        expect(error.message).toBe(FIXED_MESSAGE);
        expect(JSON.stringify(error)).not.toContain(SECRET_QUERY);
        expect(error.stack ?? "").not.toContain(SECRET_QUERY);
        expect(error).not.toHaveProperty("cause");
      }
    });

    it("is a SearchEngineError for a body that is not JSON, without a second request", async () => {
      const feed = fakeGdelt(["The specified phrase is too short.", bodyOf([raw()])]);

      await failureOf(make(feed).search("Acme breach", "news"));

      expect(feed.calls).toHaveLength(1);
    });

    it("is a SearchEngineError for a body that was cut at the limit", async () => {
      const cut: GuardedResponse = { ...response("x", bodyOf([raw()])), truncated: true };
      const feed = fakeGdelt([cut, bodyOf([raw()])]);

      await failureOf(make(feed).search("Acme breach", "news"));

      expect(feed.calls).toHaveLength(1);
    });

    it.each<[string, Error]>([
      ["a network error or a time-out", new FetchError("unreachable")],
      ["a 500", status(500)],
      ["a 502", status(502)],
      ["a 503", status(503)],
      ["a 504", status(504)],
    ])("is asked once more, through the queue, after %s", async (_name, failure) => {
      const feed = fakeGdelt([failure, bodyOf([raw()])]);
      const tasks: number[] = [];
      const queue: SearchQueue = (task) => {
        tasks.push(tasks.length + 1);
        return task();
      };

      const results = await make(feed, { queue }).search("Acme breach", "news");

      expect(results).toHaveLength(1);
      expect(feed.calls).toHaveLength(2);
      expect(feed.calls[1].url).toBe(feed.calls[0].url);
      // The second request waits for its place as the first did, so the gap holds for it too.
      expect(tasks).toEqual([1, 2]);
    });

    it("gives up after the second failure, with the fixed error and two requests", async () => {
      const feed = fakeGdelt([status(503), status(502), bodyOf([raw()])]);

      const error = await failureOf(make(feed).search(SECRET_QUERY, "news"));

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(feed.calls).toHaveLength(2);
    });

    it.each<[string, Error]>([
      ["a 400", status(400)],
      ["a 401", status(401)],
      ["a 403", status(403)],
      ["a 404", new FetchError("not_found", undefined, { status: 404 })],
      ["a type that is not allowed", new FetchError("unsupported_type")],
      ["an address the policy refused", new FetchError("not_allowed")],
      ["robots.txt", new FetchError("blocked_by_robots")],
      ["an error of our own", new TypeError("broken")],
    ])("is not asked again after %s", async (_name, failure) => {
      const feed = fakeGdelt([failure, bodyOf([raw()])]);

      await failureOf(make(feed).search("Acme breach", "news"));

      expect(feed.calls).toHaveLength(1);
    });

    it("waits out a short Retry-After of a 503 before it asks again", async () => {
      const feed = fakeGdelt([status(503, 3000), bodyOf([raw()])]);
      const waits: number[] = [];

      const results = await make(feed, {
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      }).search("Acme breach", "news");

      expect(waits).toEqual([3000]);
      expect(results).toHaveLength(1);
    });

    it("does not ask again after a 503 that asks for a long wait: a service that wants to be left alone is left alone", async () => {
      const feed = fakeGdelt([status(503, 120_000), bodyOf([raw()])]);
      const waits: number[] = [];

      await failureOf(
        make(feed, {
          sleep: async (ms: number) => {
            waits.push(ms);
          },
        }).search("Acme breach", "news"),
      );

      expect(feed.calls).toHaveLength(1);
      expect(waits).toEqual([]);
    });

    it("asks again after a 5xx without waiting for anything but the queue", async () => {
      const feed = fakeGdelt([status(502), bodyOf([raw()])]);
      const waits: number[] = [];

      await make(feed, {
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      }).search("Acme breach", "news");

      expect(waits).toEqual([]);
    });

    describe("the hook that is told of a second request", () => {
      it("is told once when the request is asked again after a failure that passes", async () => {
        const feed = fakeGdelt([status(503), bodyOf([raw()])]);
        const onRetry = jest.fn();

        const results = await make(feed, { onRetry }).search("Acme breach", "news");

        expect(results).toHaveLength(1);
        expect(onRetry).toHaveBeenCalledTimes(1);
        // Nothing goes with it: not the query, not the address, not the error.
        expect(onRetry).toHaveBeenCalledWith();
      });

      it("is told after the wait and before the second request is made", async () => {
        const feed = fakeGdelt([status(503, 2000), bodyOf([raw()])]);
        const events: string[] = [];
        const onRetry = jest.fn(() => {
          events.push(`told after ${feed.calls.length} request`);
        });

        await make(feed, {
          onRetry,
          sleep: async (ms: number) => {
            events.push(`waited ${ms}`);
          },
        }).search("Acme breach", "news");

        expect(events).toEqual(["waited 2000", "told after 1 request"]);
        expect(feed.calls).toHaveLength(2);
      });

      it("is told once for a retry that fails too, and not again for the searches that follow", async () => {
        const feed = fakeGdelt([status(503), status(502), bodyOf([raw()])]);
        const onRetry = jest.fn();
        const engine = make(feed, { onRetry });

        await failureOf(engine.search("Acme breach", "news"));
        await failureOf(engine.search("Acme lawsuit", "news"));

        expect(feed.calls).toHaveLength(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      it("is not told when the first request is answered", async () => {
        const feed = fakeGdelt([bodyOf([raw()])]);
        const onRetry = jest.fn();
        const engine = make(feed, { onRetry });

        await engine.search("Acme breach", "news");
        await engine.search("Acme lawsuit", "news");

        expect(onRetry).not.toHaveBeenCalled();
      });

      it.each<[string, Step]>([
        ["a 400", status(400)],
        ["a 403", status(403)],
        ["a type that is not allowed", new FetchError("unsupported_type")],
        ["robots.txt", new FetchError("blocked_by_robots")],
        ["a body that is not JSON", "The specified phrase is too short."],
        ["an error of our own", new TypeError("broken")],
        ["a 503 that asks for a long wait", status(503, 60_000)],
      ])("is not told of a request that is not asked again: %s", async (_name, failure) => {
        const feed = fakeGdelt([failure, bodyOf([raw()])]);
        const onRetry = jest.fn();

        await failureOf(make(feed, { onRetry }).search("Acme breach", "news"));

        expect(feed.calls).toHaveLength(1);
        expect(onRetry).not.toHaveBeenCalled();
      });

      it("is not told when the wait is cut short, since no second request is made", async () => {
        const feed = fakeGdelt([status(503, 2000), bodyOf([raw()])]);
        const onRetry = jest.fn();

        await failureOf(
          make(feed, {
            onRetry,
            sleep: async () => {
              throw new Error("cancelled");
            },
          }).search("Acme breach", "news"),
        );

        expect(feed.calls).toHaveLength(1);
        expect(onRetry).not.toHaveBeenCalled();
      });

      it("is not told when the index comes from the cache: no request is made", async () => {
        const { cache, seed } = memoryCache();
        seed("gdelt", buildGdeltUrl(["Acme"], ["breach"]) as string, JSON.stringify([KEPT]));
        const feed = fakeGdelt([status(503), bodyOf([raw()])]);
        const onRetry = jest.fn();

        const results = await make(feed, { onRetry, cache }).search("Acme breach", "news");

        expect(results).toHaveLength(1);
        expect(feed.calls).toHaveLength(0);
        expect(onRetry).not.toHaveBeenCalled();
      });

      it("never lets a hook that throws change the search", async () => {
        const feed = fakeGdelt([status(503), bodyOf([raw()])]);
        const onRetry = jest.fn(() => {
          throw new Error("a counter broke");
        });

        const results = await make(feed, { onRetry }).search("Acme breach", "news");

        expect(results).toHaveLength(1);
        expect(feed.calls).toHaveLength(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      it("is optional: the retry is made without it", async () => {
        const feed = fakeGdelt([status(503), bodyOf([raw()])]);

        await expect(make(feed).search("Acme breach", "news")).resolves.toHaveLength(1);
        expect(feed.calls).toHaveLength(2);
      });
    });
  });

  describe("through the real guardedFetch", () => {
    const make = (fetch: typeof guardedFetch, extra = {}) =>
      createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch,
        queue: passThrough,
        ...extra,
      });

    it("names the bot, asks for JSON, and reads a body that GDELT serves as application/json", async () => {
      const { fetch, requests } = overTransport(guardedFetch, (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()])),
      );

      await expect(make(fetch).search("Acme breach", "news")).resolves.toHaveLength(1);

      expect(requests.map((request) => request.url.pathname)).toEqual([
        "/robots.txt",
        "/api/v2/doc/doc",
      ]);
      expect(requests[1].headers["User-Agent"]).toBe(BOT_USER_AGENT);
      expect(requests[1].headers.Accept).toContain("application/json");
      expect(requests[1].headers).not.toHaveProperty("Cookie");
      expect(requests[1].headers).not.toHaveProperty("Authorization");
      expect(requests[1].url.href).toBe(buildGdeltUrl(["Acme"], ["breach"]));
    });

    it("reads an index with no articles: GDELT answers {}", async () => {
      const { fetch } = overTransport(guardedFetch, (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK("{}"),
      );

      await expect(make(fetch).search("Acme breach", "news")).resolves.toEqual([]);
    });

    it("fails a 200 that is not JSON, as the refusal of a query is: HTML or plain text", async () => {
      for (const type of ["text/html; charset=utf-8", "text/plain"]) {
        const { fetch, requests } = overTransport(guardedFetch, (url) =>
          url.pathname === "/robots.txt"
            ? NOT_FOUND
            : {
                status: 200,
                headers: { "content-type": type },
                body: "The specified phrase is too short.",
              },
        );

        await failureOf(make(fetch).search("Acme breach", "news"));

        // No second request for an answer that a second request would not change.
        expect(requests.filter((request) => request.url.pathname !== "/robots.txt")).toHaveLength(
          1,
        );
      }
    });

    it("fails a 200 whose type says JSON and whose body is plain text", async () => {
      const { fetch } = overTransport(guardedFetch, (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(RATE_LIMIT_TEXT),
      );

      await failureOf(make(fetch).search("Acme breach", "news"));
    });

    it("fails a 429 with a plain text body and no Retry-After, and does not ask again", async () => {
      const process = freshProcess();
      const { fetch, requests } = overTransport(process.guardedFetch, (url) =>
        url.pathname === "/robots.txt"
          ? NOT_FOUND
          : { status: 429, headers: { "content-type": "text/plain" }, body: RATE_LIMIT_TEXT },
      );
      const engine = process.createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch,
        queue: passThrough,
      });

      const error = await failureOf(
        engine.search("Acme breach", "news"),
        process.SearchEngineError,
      );

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(requests.filter((request) => request.url.pathname !== "/robots.txt")).toHaveLength(1);
    });

    it.each([500, 502, 503, 504])(
      "asks again after a %i, and reads the second answer",
      async (code) => {
        let apiRequests = 0;
        const { fetch } = overTransport(guardedFetch, (url) => {
          if (url.pathname === "/robots.txt") return NOT_FOUND;
          apiRequests += 1;
          return apiRequests === 1
            ? { status: code, headers: { "content-type": "text/plain" }, body: "oops" }
            : JSON_OK(bodyOf([raw()]));
        });

        await expect(make(fetch).search("Acme breach", "news")).resolves.toHaveLength(1);
        expect(apiRequests).toBe(2);
      },
    );

    it("does not read the API when robots.txt disallows the path, and says nothing more than the fixed error", async () => {
      const { fetch, requests } = overTransport(guardedFetch, (url) =>
        url.pathname === "/robots.txt"
          ? {
              status: 200,
              headers: { "content-type": "text/plain" },
              body: "User-agent: *\nDisallow: /api\n",
            }
          : JSON_OK(bodyOf([raw()])),
      );

      const error = await failureOf(make(fetch).search(SECRET_QUERY, "news"));

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(requests.map((request) => request.url.pathname)).toEqual(["/robots.txt"]);
    });
  });

  describe("the pause after a 429", () => {
    const rateLimited = (url: URL) =>
      url.pathname === "/robots.txt"
        ? NOT_FOUND
        : { status: 429, headers: { "content-type": "text/plain" }, body: RATE_LIMIT_TEXT };

    function setUp() {
      const process = freshProcess();
      const fails = (promise: Promise<unknown>) => failureOf(promise, process.SearchEngineError);
      let time = 1_000_000;
      const answers = { api: rateLimited as (url: URL) => ReturnType<typeof rateLimited> };
      const { fetch, requests } = overTransport(process.guardedFetch, (url) => answers.api(url));
      const apiRequests = () =>
        requests.filter((request) => request.url.pathname !== "/robots.txt").length;
      const engine = (
        name = "Acme",
        cache?: Parameters<typeof process.createGdeltEngine>[0]["cache"],
        onRetry?: () => void,
      ) =>
        process.createGdeltEngine({
          names: [name],
          topics: ["breach"],
          fetch,
          queue: passThrough,
          now: () => time,
          cache,
          onRetry,
        });
      return {
        process,
        fails,
        engine,
        answers,
        apiRequests,
        advance: (ms: number) => {
          time += ms;
        },
      };
    }

    it("stops every engine of the process from asking GDELT for 60 seconds, and answers their searches at once", async () => {
      const { process, fails, engine, apiRequests, advance } = setUp();

      await fails(engine("Acme").search("Acme breach", "news"));
      expect(apiRequests()).toBe(1);

      // Another run, another engine, another vendor: the process is the one that was told to wait.
      const other = engine("Globex");
      advance(GDELT_COOL_DOWN_MS - 1);
      const error = await other.search("Globex breach", "news").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(process.SearchEngineError);
      expect(apiRequests()).toBe(1);
    });

    it("lets the process ask again once the 60 seconds are over", async () => {
      const { fails, answers, engine, apiRequests, advance } = setUp();
      await fails(engine("Acme").search("Acme breach", "news"));

      advance(GDELT_COOL_DOWN_MS);
      answers.api = (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()]));

      await expect(engine("Globex").search("Globex breach", "news")).resolves.toHaveLength(1);
      expect(apiRequests()).toBe(2);
    });

    it("does not make the pause the answer of the run: the search that follows it asks again", async () => {
      const { fails, answers, engine, apiRequests, advance } = setUp();
      const run = engine("Acme");
      await fails(run.search("Acme breach", "news"));
      await fails(run.search("Acme lawsuit", "news"));
      expect(apiRequests()).toBe(1);

      advance(GDELT_COOL_DOWN_MS);
      answers.api = (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()]));

      await expect(run.search("Acme breach", "news")).resolves.toHaveLength(1);
      expect(apiRequests()).toBe(2);
    });

    it("fails a search of the same run at once during the cool-down, and makes no request", async () => {
      const { fails, engine, apiRequests, advance } = setUp();
      const run = engine("Acme");
      await fails(run.search("Acme breach", "news"));
      expect(apiRequests()).toBe(1);

      advance(GDELT_COOL_DOWN_MS - 1);
      await fails(run.search("Acme lawsuit", "news"));

      expect(apiRequests()).toBe(1);
    });

    it("asks the refused request again in the first search after the cool-down, and answers that search and the later ones from the one index", async () => {
      const { fails, answers, engine, apiRequests, advance } = setUp();
      const run = engine("Acme");
      await fails(run.search("Acme breach", "news"));
      advance(GDELT_COOL_DOWN_MS);
      answers.api = (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()]));

      await expect(run.search("Acme breach", "news")).resolves.toHaveLength(1);
      await expect(run.search("Acme support", "news")).resolves.toHaveLength(1);
      await expect(run.search("Acme system", "news")).resolves.toHaveLength(1);

      expect(apiRequests()).toBe(2);
    });

    it("asks at most GDELT_MAX_ASKS times in a run: after the third refusal no search asks again, even after another cool-down", async () => {
      const { fails, answers, engine, apiRequests, advance } = setUp();
      const run = engine("Acme");
      expect(GDELT_MAX_ASKS).toBe(3);

      await fails(run.search("Acme breach", "news"));
      advance(GDELT_COOL_DOWN_MS);
      await fails(run.search("Acme breach", "news"));
      advance(GDELT_COOL_DOWN_MS);
      await fails(run.search("Acme breach", "news"));
      expect(apiRequests()).toBe(3);

      advance(GDELT_COOL_DOWN_MS * 2);
      answers.api = (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()]));
      await fails(run.search("Acme breach", "news"));
      await fails(run.search("Acme lawsuit", "news"));

      expect(apiRequests()).toBe(3);
      // The limit is the run's: another run of the process still asks.
      await expect(engine("Globex").search("Globex breach", "news")).resolves.toHaveLength(1);
      expect(apiRequests()).toBe(4);
    });

    it("never keeps a refusal in the cache, and keeps the answer that follows it", async () => {
      const { fails, answers, engine, apiRequests, advance } = setUp();
      const { cache } = memoryCache();
      const run = engine("Acme", cache);
      await fails(run.search("Acme breach", "news"));
      await settle();
      advance(GDELT_COOL_DOWN_MS);
      answers.api = (url) =>
        url.pathname === "/robots.txt" ? NOT_FOUND : JSON_OK(bodyOf([raw()]));
      await expect(run.search("Acme breach", "news")).resolves.toHaveLength(1);
      await settle();

      await expect(engine("Acme", cache).search("Acme breach", "news")).resolves.toHaveLength(1);
      expect(apiRequests()).toBe(2);
    });

    it("does not ask again after a time-out, even once the cool-down would have passed: only a 429 is asked again", async () => {
      const { process, answers, engine, apiRequests, advance } = setUp();
      answers.api = (url) => {
        if (url.pathname === "/robots.txt") return NOT_FOUND;
        throw new process.FetchError("unreachable");
      };
      const run = engine("Acme");

      await failureOf(run.search("Acme breach", "news"), process.SearchEngineError);
      // The request and its one retry.
      expect(apiRequests()).toBe(2);

      advance(GDELT_COOL_DOWN_MS * 3);
      await failureOf(run.search("Acme lawsuit", "news"), process.SearchEngineError);

      expect(apiRequests()).toBe(2);
    });

    it("does not retry the request that was refused", async () => {
      const { fails, engine, apiRequests } = setUp();

      await fails(engine("Acme").search("Acme breach", "news"));

      expect(apiRequests()).toBe(1);
    });

    it("does not tell the hook of a second request for the request that was refused: none is made", async () => {
      const { fails, engine, apiRequests } = setUp();
      const onRetry = jest.fn();

      await fails(engine("Acme", undefined, onRetry).search("Acme breach", "news"));

      expect(apiRequests()).toBe(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("asks again for a 429 that comes after the pause: the pause starts over", async () => {
      const { fails, engine, apiRequests, advance } = setUp();
      await fails(engine("Acme").search("Acme breach", "news"));
      advance(GDELT_COOL_DOWN_MS);

      await fails(engine("Globex").search("Globex breach", "news"));
      expect(apiRequests()).toBe(2);

      advance(GDELT_COOL_DOWN_MS - 1);
      await fails(engine("Initech").search("Initech breach", "news"));
      expect(apiRequests()).toBe(2);
    });

    it("lets a search be answered from the cache during the pause: it costs no request", async () => {
      const { process, fails, engine, apiRequests, advance } = setUp();
      const { cache } = memoryCache();
      const earlier = process.createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: async (url: string) => response(url, bodyOf([raw()])),
        queue: passThrough,
        robots: allowAll,
        cache,
      });
      await earlier.search("Acme breach", "news");
      await settle();
      await fails(engine("Globex").search("Globex breach", "news"));
      advance(1_000);

      const again = process.createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: async () => {
          throw new Error("no request during the pause");
        },
        queue: passThrough,
        robots: allowAll,
        cache,
        now: () => 1_000_000 + 1_000,
      });

      await expect(again.search("Acme breach", "news")).resolves.toHaveLength(1);
      expect(apiRequests()).toBe(1);
    });

    it("stops a request that is waiting in the queue when the pause begins before its turn", async () => {
      const process = freshProcess();
      const shared = process.createSearchQueue({ minGapMs: 0 });
      let time = 1_000_000;
      const release = deferred<{
        status: number;
        headers: http.IncomingHttpHeaders;
        body: string;
      }>();
      let apiRequests = 0;
      const transport: Transport = async ({ url }) => {
        if (url.pathname === "/robots.txt") {
          return { status: 404, headers: {}, body: Readable.from([Buffer.from("")]) };
        }
        apiRequests += 1;
        const reply = await release.promise;
        return {
          status: reply.status,
          headers: reply.headers,
          body: Readable.from([Buffer.from(reply.body)]),
        };
      };
      const fetch = ((url: string, options?: GuardedFetchOptions) =>
        process.guardedFetch(url, options, { transport })) as typeof guardedFetch;
      const make = (name: string) =>
        process.createGdeltEngine({
          names: [name],
          topics: ["breach"],
          fetch,
          queue: shared,
          now: () => time,
        });

      const first = make("Acme")
        .search("Acme breach", "news")
        .catch((e: unknown) => e);
      const second = make("Globex")
        .search("Globex breach", "news")
        .catch((e: unknown) => e);
      await flush();
      await flush();
      expect(apiRequests).toBe(1);
      release.resolve({
        status: 429,
        headers: { "content-type": "text/plain" },
        body: RATE_LIMIT_TEXT,
      });

      expect(await first).toBeInstanceOf(process.SearchEngineError);
      expect(await second).toBeInstanceOf(process.SearchEngineError);
      time += 10;
      expect(apiRequests).toBe(1);
    });
  });

  describe("the queue", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("is one for the process: the requests of every engine are 5,000 ms apart", async () => {
      const process = freshProcess();
      const feed = fakeGdelt([bodyOf([raw()]), bodyOf([raw()]), bodyOf([raw()])]);
      const make = (name: string) =>
        process.createGdeltEngine({
          names: [name],
          topics: ["breach"],
          fetch: feed.fetch,
          robots: allowAll,
        });

      const searches = [
        make("Acme").search("Acme breach", "news"),
        make("Globex").search("Globex breach", "news"),
        make("Initech").search("Initech breach", "news"),
      ];
      await jest.advanceTimersByTimeAsync(0);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(feed.calls).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(feed.calls).toHaveLength(3);
      await Promise.all(searches);
    });

    it("spaces the retry of a failed request from the request that failed, as it does any other", async () => {
      const process = freshProcess();
      const feed = fakeGdelt([
        new process.FetchError("unreachable", undefined, { status: 503 }),
        bodyOf([raw()]),
      ]);
      const engine = process.createGdeltEngine({
        names: ["Acme"],
        topics: ["breach"],
        fetch: feed.fetch,
        robots: allowAll,
      });

      const search = engine.search("Acme breach", "news");
      await jest.advanceTimersByTimeAsync(0);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(feed.calls).toHaveLength(2);
      await expect(search).resolves.toHaveLength(1);
    });
  });

  describe("with a cache shared by runs", () => {
    const names = ["Acme"];
    const topics = ["breach", "lawsuit"];
    const requestUrl = buildGdeltUrl(names, topics) as string;

    it("keeps the index of a request for the runs that follow, under the address of the request", async () => {
      const { cache, writes } = memoryCache();
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      await engine.search("Acme breach", "news");
      await settle();

      expect(writes).toEqual([{ kind: "gdelt", key: requestUrl, value: JSON.stringify([KEPT]) }]);
    });

    it("answers a search of a later run from the index: no request, no place in the queue, no robots.txt", async () => {
      const { cache } = memoryCache();
      const feed = fakeGdelt([bodyOf([raw()])]);
      const earlier = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        cache,
      });
      const answered = await earlier.search("Acme breach", "news");
      await settle();
      feed.mock.mockClear();
      const queue: SearchQueue = jest.fn((task) => task());

      const later = createGdeltEngine({ names, topics, fetch: feed.fetch, queue, cache });
      const again = await later.search("acme  BREACH", "news");
      const other = await later.search("Acme lawsuit", "news");

      expect(again).toEqual(answered);
      expect(again).toHaveLength(1);
      expect(other).toEqual([]);
      expect(feed.mock).not.toHaveBeenCalled();
      expect(queue).not.toHaveBeenCalled();
    });

    it("does not serve the index of one request to another: the names and topics are in the address", async () => {
      const { cache } = memoryCache();
      const feed = fakeGdelt([bodyOf([raw()]), bodyOf([])]);
      const make = (theNames: string[]) =>
        createGdeltEngine({
          names: theNames,
          topics,
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
          cache,
        });

      await make(["Acme"]).search("Acme breach", "news");
      await settle();
      await make(["Globex"]).search("Globex breach", "news");

      expect(feed.calls).toHaveLength(2);
    });

    it("answers from the cache within the hour that the index is kept, and asks the cache for the kind gdelt", async () => {
      const { cache, reads } = memoryCache();
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      await engine.search("Acme breach", "news");

      expect(reads).toEqual([{ kind: "gdelt", key: requestUrl }]);
    });

    it("keeps an index with no articles too: nothing found is an answer", async () => {
      const { cache, writes } = memoryCache();
      const feed = fakeGdelt(["{}"]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      await engine.search("Acme breach", "news");
      await settle();

      expect(writes).toEqual([{ kind: "gdelt", key: requestUrl, value: "[]" }]);
    });

    it("keeps nothing of a search that failed", async () => {
      const { cache, writes } = memoryCache();
      const feed = fakeGdelt(["The specified phrase is too short."]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      await failureOf(engine.search("Acme breach", "news"));
      await settle();

      expect(writes).toEqual([]);
    });

    it("keeps 250 articles at most, the number the request asks for", async () => {
      const { cache, writes } = memoryCache();
      const many = Array.from({ length: 300 }, (_, i) =>
        raw({ url: `https://news.example.com/story-${i}`, title: `Story ${i}` }),
      );
      const feed = fakeGdelt([bodyOf(many)]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      await engine.search("Acme", "news");
      await settle();

      expect(JSON.parse(writes[0].value)).toHaveLength(250);
      // And what was kept is accepted when it is read back.
      const later = createGdeltEngine({
        names,
        topics,
        fetch: fakeGdelt([]).fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });
      await expect(later.search("Acme", "news")).resolves.toHaveLength(MAX_RESULTS);
    });

    it("asks again for an entry that is not an index, and replaces it with the answer", async () => {
      const { cache, seed, store } = memoryCache();
      seed("gdelt", requestUrl, JSON.stringify([{ title: 1 }]));
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache,
      });

      const results = await engine.search("Acme breach", "news");
      await settle();

      expect(results).toHaveLength(1);
      expect(feed.calls).toHaveLength(1);
      expect(JSON.parse(store.get(`gdelt\n${requestUrl}`) as string)).toEqual([KEPT]);
    });

    it("is not broken by a cache that rejects, and does not wait for a write", async () => {
      const broken = {
        get: async (): Promise<string | null> => {
          throw new Error("broken");
        },
        set: () => new Promise<void>(() => {}),
      };
      const feed = fakeGdelt([bodyOf([raw()])]);
      const engine = createGdeltEngine({
        names,
        topics,
        fetch: feed.fetch,
        queue: passThrough,
        robots: allowAll,
        cache: broken,
      });

      await expect(engine.search("Acme breach", "news")).resolves.toHaveLength(1);
    });

    it("is the same engine without a cache: every run is a request", async () => {
      const feed = fakeGdelt([bodyOf([raw()]), bodyOf([raw()])]);
      const make = () =>
        createGdeltEngine({
          names,
          topics,
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
        });

      await make().search("Acme breach", "news");
      await make().search("Acme breach", "news");

      expect(feed.calls).toHaveLength(2);
    });
  });

  describe("a body that someone hostile wrote", () => {
    const body = (inner: string) => `{"articles": [${inner}]}`;
    const cases: Array<[string, string]> = [
      [
        "one title of a megabyte",
        body(
          `{"url":"https://news.example.com/a","title":"${"x".repeat(MEGABYTE - 100)}","seendate":"20261025T100000Z","domain":"d","language":"English"}`,
        ),
      ],
      [
        "one title of a megabyte of white space and words",
        body(`{"url":"https://news.example.com/a","title":"${" a \\t\\n".repeat(MEGABYTE / 8)}"}`),
      ],
      [
        "one title of lone surrogates",
        body(
          `{"url":"https://news.example.com/a","title":"${"\\ud800".repeat(MEGABYTE / 6 - 50)}"}`,
        ),
      ],
      ["a megabyte of empty entries", body("{},".repeat(MEGABYTE / 3) + "{}")],
      ["a megabyte of entries that are lists", body("[],".repeat(MEGABYTE / 3) + "[]")],
      [
        "a megabyte of nested lists",
        body("[".repeat(MEGABYTE / 2 - 20) + "]".repeat(MEGABYTE / 2 - 20)),
      ],
      [
        "a megabyte of addresses that are not public",
        body('{"url":"http://127.0.0.1/x","title":"t"},'.repeat(Math.floor(MEGABYTE / 40)) + "{}"),
      ],
      [
        "entries with an address of 2,000 characters",
        body(
          `{"url":"https://news.example.com/${"a".repeat(2000)}","title":"breach"},`.repeat(
            Math.floor(MEGABYTE / 2060),
          ) + "{}",
        ),
      ],
      [
        "entries whose dates are almost dates",
        body(
          '{"url":"https://news.example.com/a","title":"breach","seendate":"20261025T1000000000000000Z"},'.repeat(
            Math.floor(MEGABYTE / 95),
          ) + "{}",
        ),
      ],
      ["a megabyte of text that is not JSON", "{".repeat(MEGABYTE)],
      // The cases below send the body through the repair: JSON.parse refuses each of them first.
      [
        "one title of a megabyte of raw tabs",
        body(`{"url":"https://news.example.com/a","title":"${"\t".repeat(MEGABYTE - 100)}"}`),
      ],
      [
        "one title of a megabyte of backslashes that begin no escape",
        body(
          `{"url":"https://news.example.com/a","title":"${`${BACKSLASH}'`.repeat(MEGABYTE / 2 - 100)}"}`,
        ),
      ],
      [
        "one title of a megabyte of unicode escapes that stop short",
        body(
          `{"url":"https://news.example.com/a","title":"${`${BACKSLASH}u12`.repeat(MEGABYTE / 4 - 50)}"}`,
        ),
      ],
      [
        "a megabyte of backslashes in a row, an odd number of them",
        body(`{"url":"https://news.example.com/a","title":"${BACKSLASH.repeat(MEGABYTE - 101)}"}`),
      ],
      [
        "a megabyte of control characters outside any string",
        body(String.fromCharCode(1).repeat(MEGABYTE)),
      ],
      [
        "a megabyte of entries with a raw tab each",
        body(
          `{"url":"https://news.example.com/a","title":"a\tb"},`.repeat(Math.floor(MEGABYTE / 52)) +
            "{}",
        ),
      ],
    ];

    it.each(cases)("is parsed in under 2,000 ms: %s", (_name, text) => {
      expect(text.length).toBeGreaterThanOrEqual(MEGABYTE / 2);
      const started = performance.now();
      let outcome: unknown;
      try {
        outcome = parseGdeltBody(text);
      } catch (error) {
        outcome = error;
      }
      expect(performance.now() - started).toBeLessThan(2000);
      // Whatever it is, it is a list or the fixed error: nothing else comes out.
      expect(Array.isArray(outcome) || outcome instanceof SearchEngineError).toBe(true);
    });

    it.each(cases)(
      "is answered in under 2,000 ms, from the request to the results: %s",
      async (_name, text) => {
        const feed = fakeGdelt([text]);
        const engine = createGdeltEngine({
          names: ["Acme"],
          topics: ["breach"],
          fetch: feed.fetch,
          queue: passThrough,
          robots: allowAll,
        });
        const started = performance.now();

        const outcome = await engine
          .search("Acme breach lawsuit fined", "news")
          .catch((e: unknown) => e);

        expect(performance.now() - started).toBeLessThan(2000);
        expect(Array.isArray(outcome) || outcome instanceof SearchEngineError).toBe(true);
      },
    );
  });

  describe("the log", () => {
    it("never hears the query, or anything else, whatever goes wrong", async () => {
      const methods = ["log", "info", "warn", "error", "debug"] as const;
      const spies = methods.map((method) =>
        jest.spyOn(console, method).mockImplementation(() => {}),
      );
      const logger = (
        jest.requireMock("../../../utils/logger/fileLogger") as {
          default: Record<string, jest.Mock>;
        }
      ).default;
      try {
        const failures: Step[] = [
          "The specified phrase is too short.",
          status(503),
          new FetchError("unsupported_type"),
          new TypeError(SECRET_QUERY),
        ];
        for (const failure of failures) {
          const feed = fakeGdelt([failure, failure]);
          const engine = createGdeltEngine({
            names: [SECRET_QUERY],
            topics: ["breach"],
            fetch: feed.fetch,
            queue: passThrough,
            robots: allowAll,
          });
          await failureOf(engine.search(SECRET_QUERY, "news"));
        }
        const web = createGdeltEngine({ names: [SECRET_QUERY], topics: [], robots: allowAll });
        await failureOf(web.search(SECRET_QUERY, "web"));

        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        for (const method of Object.values(logger)) expect(method).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });
});
