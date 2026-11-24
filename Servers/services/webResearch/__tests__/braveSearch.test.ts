import {
  BRAVE_API_BASE,
  BRAVE_MAX_BODY_BYTES,
  BRAVE_MAX_RATE_LIMIT_WAIT_MS,
  BRAVE_MIN_GAP_MS,
  braveQueryOf,
  braveQueueFor,
  createBraveEngine,
  plainTextOf,
  rateLimitWaitMsOf,
} from "../braveSearch";
import { SearchUnavailableError } from "../providerSearch";
import { MAX_SNIPPET_CHARS } from "../../vendorResearch/text";
import { MAX_RESULTS, SearchEngineError, type SearchQueue } from "../webSearch";
import logger from "../../../utils/logger/fileLogger";

// The engine writes nothing to a log. The mock is here so that the test of that can listen.
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const FIXED_MESSAGE = "The search is not available right now";
const SECRET_KEY = "BSAsecretKey0123456789";
const SECRET_QUERY = "Zorblax confidential acquisition";

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const passThrough: SearchQueue = (task) => task();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function answering(...responses: Array<Response | (() => Response)>): jest.Mock {
  const fetch = jest.fn<Promise<Response>, Parameters<FetchImpl>>();
  for (const response of responses) {
    fetch.mockImplementationOnce(async () =>
      typeof response === "function" ? response() : response,
    );
  }
  return fetch;
}

function engineWith(fetch: FetchImpl, extra: { sleep?: jest.Mock; timeoutMs?: number } = {}) {
  const sleep = extra.sleep ?? jest.fn(async () => undefined);
  const engine = createBraveEngine({
    apiKey: SECRET_KEY,
    fetchImpl: fetch,
    queue: passThrough,
    sleep,
    timeoutMs: extra.timeoutMs,
  });
  return { engine, sleep };
}

const urlOf = (fetch: jest.Mock, call = 0): URL => new URL(fetch.mock.calls[call][0] as string);

/** An LLM Context answer as the API reference shows it. */
function contextBody(
  entries: Array<{ url: string; title?: string; snippets?: unknown }>,
  sources: Record<string, unknown> = {},
) {
  return {
    grounding: {
      generic: entries.map((entry) => ({
        url: entry.url,
        title: entry.title ?? "A page",
        snippets: entry.snippets ?? ["First passage."],
      })),
    },
    sources,
  };
}

/** A news answer as the API reference shows it. */
function newsBody(entries: Array<Record<string, unknown>>) {
  return { type: "news", results: entries };
}

async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("The search did not fail");
}

describe("createBraveEngine", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is the brave engine of the web and the news, with no news window", () => {
    const { engine } = engineWith(answering());
    expect(engine.id).toBe("brave");
    expect(engine.kinds).toEqual(["web", "news"]);
    expect(engine.newsWindowMonths).toBeNull();
  });

  describe("web (LLM Context)", () => {
    it("asks the LLM Context endpoint with the key in a header and the fixed parameters", async () => {
      const fetch = answering(json(contextBody([])));
      const { engine } = engineWith(fetch);
      await engine.search("acme breach", "web");
      const url = urlOf(fetch);
      expect(`${url.origin}${url.pathname}`).toBe(`${BRAVE_API_BASE}/llm/context`);
      expect(url.searchParams.get("q")).toBe("acme breach");
      expect(url.searchParams.get("count")).toBe("10");
      expect(url.searchParams.get("maximum_number_of_urls")).toBe("10");
      expect(url.searchParams.get("maximum_number_of_tokens")).toBe("4096");
      expect(url.searchParams.get("safesearch")).toBe("moderate");
      expect(url.href).not.toContain(SECRET_KEY);
      const init = fetch.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("GET");
      expect(init.headers).toEqual({
        Accept: "application/json",
        "X-Subscription-Token": SECRET_KEY,
      });
    });

    it("maps each grounding entry to a result", async () => {
      const page = "https://news.example.com/acme-breach";
      const fetch = answering(
        json(
          contextBody(
            [
              { url: page, title: "Acme confirms a breach", snippets: ["One.", "Two."] },
              { url: "https://other.example.org/x", title: "Other", snippets: [] },
            ],
            {
              [page]: {
                title: "Acme confirms a breach",
                hostname: "news.example.com",
                age: ["Friday, November 20, 2026", "2026-11-20", "3 days ago"],
              },
            },
          ),
        ),
      );
      const { engine } = engineWith(fetch);
      const results = await engine.search("acme breach", "web");
      expect(results).toEqual([
        {
          title: "Acme confirms a breach",
          url: page,
          snippet: "One. … Two.",
          publishedAt: "2026-11-20",
          source: "news.example.com",
          transient: true,
        },
        {
          title: "Other",
          url: "https://other.example.org/x",
          snippet: "",
          publishedAt: null,
          source: "other.example.org",
          transient: true,
        },
      ]);
    });

    it("cuts a long snippet and reads only a calendar day as the date", async () => {
      const page = "https://news.example.com/long";
      const fetch = answering(
        json(
          contextBody([{ url: page, snippets: ["a".repeat(1000), "b".repeat(1000)] }], {
            [page]: { hostname: "news.example.com", age: ["x", "2026-02-30", "y"] },
          }),
        ),
      );
      const { engine } = engineWith(fetch);
      const [result] = await engine.search("acme", "web");
      expect(result.snippet.length).toBe(MAX_SNIPPET_CHARS);
      expect(result.snippet.startsWith("a".repeat(1000) + " … b")).toBe(true);
      expect(result.publishedAt).toBeNull();
    });

    it("reads an answer with no grounding entries as no results", async () => {
      const { engine } = engineWith(answering(json({ grounding: {}, sources: {} })));
      await expect(engine.search("acme", "web")).resolves.toEqual([]);
    });
  });

  describe("news", () => {
    it("asks the news endpoint without text decorations", async () => {
      const fetch = answering(json(newsBody([])));
      const { engine } = engineWith(fetch);
      await engine.search("acme fine", "news");
      const url = urlOf(fetch);
      expect(`${url.origin}${url.pathname}`).toBe(`${BRAVE_API_BASE}/news/search`);
      expect(url.searchParams.get("q")).toBe("acme fine");
      expect(url.searchParams.get("count")).toBe("10");
      expect(url.searchParams.get("text_decorations")).toBe("false");
      expect(url.searchParams.get("safesearch")).toBe("moderate");
      expect(url.searchParams.has("maximum_number_of_tokens")).toBe(false);
    });

    it("maps each result, the date part of page_age as the date", async () => {
      const fetch = answering(
        json(
          newsBody([
            {
              title: "Regulator fines Acme",
              url: "https://press.example.com/fine",
              description: "The regulator fined Acme on Monday.",
              page_age: "2026-11-16T09:30:00",
              age: "1 week ago",
              meta_url: { hostname: "press.example.com" },
            },
            {
              title: "Acme results",
              url: "https://wire.example.net/results",
              description: "Quarterly results.",
              page_age: "yesterday",
            },
          ]),
        ),
      );
      const { engine } = engineWith(fetch);
      await expect(engine.search("acme fine", "news")).resolves.toEqual([
        {
          title: "Regulator fines Acme",
          url: "https://press.example.com/fine",
          snippet: "The regulator fined Acme on Monday.",
          publishedAt: "2026-11-16",
          source: "press.example.com",
          transient: true,
        },
        {
          title: "Acme results",
          url: "https://wire.example.net/results",
          snippet: "Quarterly results.",
          publishedAt: null,
          source: "wire.example.net",
          transient: true,
        },
      ]);
    });

    it("takes out tags and reads entities in the text", async () => {
      const fetch = answering(
        json(
          newsBody([
            {
              title: "<strong>Acme</strong> &amp; Co &#39;fined&#x27;",
              url: "https://press.example.com/fine",
              description: "Fine of 5 &lt; 10 <b>million</b>, a < b",
              meta_url: { hostname: "press.example.com" },
            },
          ]),
        ),
      );
      const { engine } = engineWith(fetch);
      const [result] = await engine.search("acme", "news");
      expect(result.title).toBe("Acme & Co 'fined'");
      expect(result.snippet).toBe("Fine of 5 < 10 million , a < b");
    });

    it("names a result with no title after its source", async () => {
      const fetch = answering(
        json(newsBody([{ url: "https://press.example.com/a", meta_url: { hostname: "Press" } }])),
      );
      const { engine } = engineWith(fetch);
      const [result] = await engine.search("acme", "news");
      expect(result.title).toBe("Press");
    });
  });

  describe("results", () => {
    it("drops addresses that are not public, each address once, at most MAX_RESULTS", async () => {
      const entries: Array<Record<string, unknown>> = [
        { title: "local", url: "http://127.0.0.1/admin" },
        { title: "internal", url: "http://localhost:3000/" },
        { title: "script", url: "javascript:alert(1)" },
        { title: "none" },
        "not an entry" as unknown as Record<string, unknown>,
        { title: "first", url: "https://a.example.com/1" },
        { title: "again", url: "https://a.example.com/1" },
      ];
      for (let i = 2; i <= 15; i += 1) {
        entries.push({ title: `n${i}`, url: `https://a.example.com/${i}` });
      }
      const { engine } = engineWith(answering(json(newsBody(entries))));
      const results = await engine.search("acme", "news");
      expect(results).toHaveLength(MAX_RESULTS);
      expect(results[0]).toMatchObject({ title: "first", url: "https://a.example.com/1" });
      expect(new Set(results.map((r) => r.url)).size).toBe(MAX_RESULTS);
      expect(results.map((r) => r.title)).not.toContain("again");
    });
  });

  describe("errors", () => {
    it.each([
      ["a 422 with SUBSCRIPTION_TOKEN_INVALID", 422],
      ["a 401", 401],
      ["a 403", 403],
    ])("takes %s as a key that cannot search", async (_name, status) => {
      const body =
        status === 422
          ? {
              type: "ErrorResponse",
              error: { status: 422, code: "SUBSCRIPTION_TOKEN_INVALID", detail: "bad" },
            }
          : { type: "ErrorResponse", error: { status, code: "OTHER" } };
      const { engine } = engineWith(answering(json(body, status)));
      const error = await failureOf(engine.search(SECRET_QUERY, "web"));
      expect(error).toBeInstanceOf(SearchUnavailableError);
      expect(error.message).toBe(FIXED_MESSAGE);
    });

    it("waits out a 429 for the first X-RateLimit-Reset entry and asks once more", async () => {
      const fetch = answering(
        json({ error: { code: "RATE_LIMITED" } }, 429, { "X-RateLimit-Reset": "1, 2419200" }),
        json(newsBody([{ title: "t", url: "https://a.example.com/1" }])),
      );
      const { engine, sleep } = engineWith(fetch);
      const results = await engine.search("acme", "news");
      expect(results).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep.mock.calls[0][0]).toBe(1000);
    });

    it("fails after a second 429, with one wait only", async () => {
      const limited = () => json({}, 429, { "X-RateLimit-Reset": "30, 100" });
      const fetch = answering(limited, limited, limited);
      const { engine, sleep } = engineWith(fetch);
      const error = await failureOf(engine.search("acme", "news"));
      expect(error).toBeInstanceOf(SearchEngineError);
      expect(error).not.toBeInstanceOf(SearchUnavailableError);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep.mock.calls[0][0]).toBe(BRAVE_MAX_RATE_LIMIT_WAIT_MS);
    });

    it("waits at most 2 seconds, and 2 seconds without a usable header", () => {
      expect(rateLimitWaitMsOf("0, 100")).toBe(0);
      expect(rateLimitWaitMsOf("1.5")).toBe(1500);
      expect(rateLimitWaitMsOf("30")).toBe(BRAVE_MAX_RATE_LIMIT_WAIT_MS);
      expect(rateLimitWaitMsOf(null)).toBe(BRAVE_MAX_RATE_LIMIT_WAIT_MS);
      expect(rateLimitWaitMsOf("soon")).toBe(BRAVE_MAX_RATE_LIMIT_WAIT_MS);
      expect(rateLimitWaitMsOf("-1")).toBe(BRAVE_MAX_RATE_LIMIT_WAIT_MS);
    });

    it.each<[string, () => Response]>([
      ["a 500", () => json({ error: { code: "SERVER" } }, 500)],
      ["a 422 for another reason", () => json({ error: { code: "VALIDATION" } }, 422)],
      ["a body that is not JSON", () => new Response("<html>oops</html>", { status: 200 })],
      ["JSON that is no object", () => json([1, 2])],
      ["a web answer with no grounding", () => json({ sources: {} })],
      ["grounding entries that are no list", () => json({ grounding: { generic: {} } })],
      [
        "a body over 2 MB by its length",
        () => new Response("{}", { status: 200, headers: { "content-length": "99999999" } }),
      ],
      [
        "a body over 2 MB as it is read",
        () => new Response(`"${"x".repeat(BRAVE_MAX_BODY_BYTES)}"`, { status: 200 }),
      ],
    ])("fails with the fixed error for %s", async (_name, response) => {
      const { engine } = engineWith(answering(response));
      const error = await failureOf(engine.search(SECRET_QUERY, "web"));
      expect(error).toBeInstanceOf(SearchEngineError);
      expect(error).not.toBeInstanceOf(SearchUnavailableError);
      expect(error.message).toBe(FIXED_MESSAGE);
    });

    it("fails a news answer whose results are no list", async () => {
      const { engine } = engineWith(answering(json({ results: "none" })));
      await expect(engine.search("acme", "news")).rejects.toBeInstanceOf(SearchEngineError);
    });

    it("fails a network error without its message", async () => {
      const fetch = jest.fn(async () => {
        throw new TypeError(`fetch failed for ${SECRET_KEY} ${SECRET_QUERY}`);
      });
      const { engine } = engineWith(fetch);
      const error = await failureOf(engine.search(SECRET_QUERY, "news"));
      expect(error).toBeInstanceOf(SearchEngineError);
      expect(error.message).toBe(FIXED_MESSAGE);
      expect(String(error.stack)).not.toContain(SECRET_KEY);
      expect(String(error.stack)).not.toContain(SECRET_QUERY);
    });

    it("fails a request that takes longer than its time limit", async () => {
      const fetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const { engine } = engineWith(fetch, { timeoutMs: 20 });
      await expect(engine.search("acme", "web")).rejects.toBeInstanceOf(SearchEngineError);
    });

    it("fails at once when the caller aborts, and makes no request when aborted before", async () => {
      const fetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const { engine } = engineWith(fetch);
      const controller = new AbortController();
      const pending = engine.search("acme", "web", controller.signal);
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(SearchEngineError);

      const before = new AbortController();
      before.abort();
      await expect(engine.search("acme", "web", before.signal)).rejects.toBeInstanceOf(
        SearchEngineError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("fails an abort during the wait after a 429 without asking again", async () => {
      const fetch = answering(json({}, 429, { "X-RateLimit-Reset": "1" }));
      const controller = new AbortController();
      const sleep = jest.fn(async () => {
        controller.abort();
        throw Object.assign(new Error("cancelled"), { name: "AbortError" });
      });
      const { engine } = engineWith(fetch, { sleep });
      await expect(engine.search("acme", "news", controller.signal)).rejects.toBeInstanceOf(
        SearchEngineError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("makes no request for an empty query or a kind it does not answer", async () => {
      const fetch = answering();
      const { engine } = engineWith(fetch);
      await expect(engine.search(" \n\t ", "web")).rejects.toBeInstanceOf(SearchEngineError);
      await expect(engine.search("acme", "images" as unknown as "web")).rejects.toBeInstanceOf(
        SearchEngineError,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("never puts the key, the query or the answer in an error or a log line", async () => {
      const answers: Array<() => Response> = [
        () => json({ error: { code: "SUBSCRIPTION_TOKEN_INVALID", detail: SECRET_KEY } }, 422),
        () => json({ error: { detail: SECRET_QUERY } }, 500),
        () => new Response(`not json ${SECRET_QUERY} ${SECRET_KEY}`, { status: 200 }),
        () => json({ detail: SECRET_QUERY }, 429),
      ];
      for (const answer of answers) {
        const fetch = jest.fn(async () => answer());
        const { engine } = engineWith(fetch);
        const error = await failureOf(engine.search(SECRET_QUERY, "web"));
        expect(error.message).toBe(FIXED_MESSAGE);
        for (const text of [error.message, String(error.stack), JSON.stringify(error)]) {
          expect(text).not.toContain(SECRET_KEY);
          expect(text).not.toContain(SECRET_QUERY);
        }
      }
      for (const level of ["info", "warn", "error", "debug"] as const) {
        expect(logger[level]).not.toHaveBeenCalled();
      }
    });
  });

  describe("the queue of a key", () => {
    /** Two engines and the times their requests started, by the key each is built with. */
    function twoEngines(firstKey: string, secondKey: string) {
      const started: number[] = [];
      const fetch = jest.fn(async () => {
        started.push(Date.now());
        return json(newsBody([]));
      });
      const first = createBraveEngine({ apiKey: firstKey, fetchImpl: fetch });
      const second = createBraveEngine({ apiKey: secondKey, fetchImpl: fetch });
      return { first, second, started, fetch };
    }

    it("is one queue for every engine of the same key, and another for another key", () => {
      expect(braveQueueFor("BSAsameKeyForQueue01")).toBe(braveQueueFor("BSAsameKeyForQueue01"));
      expect(braveQueueFor("BSAsameKeyForQueue01")).not.toBe(braveQueueFor("BSAotherKeyQueue02"));
    });

    it("spaces the requests of two engines built with the same key", async () => {
      const { first, second, started, fetch } = twoEngines(
        "BSAsharedKey00000003",
        "BSAsharedKey00000003",
      );
      await Promise.all([first.search("a", "news"), second.search("b", "news")]);
      expect(fetch).toHaveBeenCalledTimes(2);
      // Timers may fire a little early; the gap is BRAVE_MIN_GAP_MS.
      expect(Math.abs(started[1] - started[0])).toBeGreaterThanOrEqual(BRAVE_MIN_GAP_MS - 50);
    });

    it("does not space the requests of two engines built with different keys", async () => {
      const { first, second, started, fetch } = twoEngines(
        "BSAfirstKey000000004",
        "BSAsecondKey00000005",
      );
      await Promise.all([first.search("a", "news"), second.search("b", "news")]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(Math.abs(started[1] - started[0])).toBeLessThan(BRAVE_MIN_GAP_MS / 2);
    });
  });

  it("spaces the requests of one engine by the queue of its key", async () => {
    const started: number[] = [];
    const fetch = jest.fn(async () => {
      started.push(Date.now());
      return json(newsBody([]));
    });
    const engine = createBraveEngine({ apiKey: SECRET_KEY, fetchImpl: fetch });
    await Promise.all([engine.search("a", "news"), engine.search("b", "news")]);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Timers may fire a little early; the gap is BRAVE_MIN_GAP_MS.
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(BRAVE_MIN_GAP_MS - 50);
  });
});

describe("braveQueryOf", () => {
  const words = (count: number) => Array.from({ length: count }, (_value, i) => `w${i}`).join(" ");

  it("keeps the first 75 words for the web and 50 for the news", () => {
    expect(braveQueryOf(words(80), "web").split(" ")).toHaveLength(75);
    expect(braveQueryOf(words(80), "news").split(" ")).toHaveLength(50);
    expect(braveQueryOf(words(80), "news")).toBe(words(50));
  });

  it("then cuts to 600 characters for the web and 400 for the news", () => {
    expect(braveQueryOf("a".repeat(700), "web")).toHaveLength(600);
    expect(braveQueryOf("a".repeat(700), "news")).toHaveLength(400);
  });

  it("collapses white space and never splits a surrogate pair", () => {
    expect(braveQueryOf("  acme \n\t breach  ", "web")).toBe("acme breach");
    const cut = braveQueryOf(`${"a".repeat(399)}😀`, "news");
    expect(cut).toBe("a".repeat(399));
  });

  it("takes out control characters and lone surrogates", () => {
    expect(braveQueryOf("acme\u0000 breach \uD800", "web")).toBe("acme breach �");
  });
});

describe("plainTextOf", () => {
  it("keeps text that is no tag and entities it does not know", () => {
    expect(plainTextOf("a < b and c<5 &unknown; &#xZZ; & done")).toBe(
      "a < b and c<5 &unknown; &#xZZ; & done",
    );
  });

  it("leaves an unclosed tag as it is", () => {
    expect(plainTextOf("before <b never closed")).toBe("before <b never closed");
  });

  it("runs in time in proportion to a hostile text", () => {
    const hostile = "<a".repeat(200_000) + "&#".repeat(200_000);
    const started = Date.now();
    plainTextOf(hostile);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
