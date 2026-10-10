import { getVendorResearchConfig, isSearchConfigured } from "../config";
import { createSearchProvider, SearchProviderError } from "../searchProvider";
import { createTavilyProvider } from "../tavilyProvider";

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

// Long and distinctive so that "the message does not contain the key" can actually fail.
const API_KEY = "tvly-SECRET-123";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A jest mock typed like the (url, init) call the provider makes. */
function mockFetch(
  implementation: (url: string, init: RequestInit) => Promise<Response>,
): FetchMock {
  return jest.fn(implementation);
}

/** A fetch that answers every call with a fresh response (a body can be read only once). */
function fetchAnswering(respond: () => Response): FetchMock {
  return mockFetch(async () => respond());
}

/** A fetch that never answers; it fails with `failWith(signal)` once the timeout fires. */
function fetchHangingUntilAborted(
  failWith: (signal: AbortSignal) => unknown = (signal) => signal.reason,
): FetchMock {
  return mockFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        if (signal.aborted) {
          reject(failWith(signal));
          return;
        }
        signal.addEventListener("abort", () => reject(failWith(signal)), { once: true });
      }),
  );
}

const asFetch = (mock: FetchMock) => mock as unknown as typeof fetch;

function sentBody(mock: FetchMock): Record<string, unknown> {
  return JSON.parse(mock.mock.calls[0][1].body as string);
}

/** Everything an error exposes when it is serialised, logged or inspected. */
function exposedText(error: unknown): string {
  return `${String(error)} ${JSON.stringify(error, Object.getOwnPropertyNames(error as object))}`;
}

async function searchWith(results: unknown[]) {
  const fetchImpl = fetchAnswering(() => jsonResponse({ results }));
  return createTavilyProvider(API_KEY, asFetch(fetchImpl)).search("q", { maxResults: 5 });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("createTavilyProvider", () => {
  it("is named tavily", () => {
    expect(createTavilyProvider(API_KEY, asFetch(fetchAnswering(() => jsonResponse({}))))).toEqual(
      expect.objectContaining({ name: "tavily" }),
    );
  });

  describe("request", () => {
    it("posts to the Tavily search endpoint with the key as a bearer token", async () => {
      const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
      await createTavilyProvider("k", asFetch(fetchImpl)).search("q", { maxResults: 5 });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("https://api.tavily.com/search");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        Authorization: "Bearer k",
        "Content-Type": "application/json",
      });
    });

    it("sends every option that is set", async () => {
      const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
      await createTavilyProvider("k", asFetch(fetchImpl)).search("Acme security incidents", {
        maxResults: 5,
        topic: "news",
        startDate: "2024-10-10",
        includeDomains: ["acme.com"],
        domainsMode: "prefer",
        timeoutMs: 5000,
      });

      // The whole body, so a stray key (the timeout is not a Tavily field) fails the test.
      expect(sentBody(fetchImpl)).toEqual({
        query: "Acme security incidents",
        search_depth: "basic",
        max_results: 5,
        include_raw_content: false,
        include_published_date: true,
        topic: "news",
        start_date: "2024-10-10",
        include_domains: ["acme.com"],
        include_domains_mode: "prefer",
      });
    });

    it("leaves out the keys of options that are not set", async () => {
      const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
      await createTavilyProvider("k", asFetch(fetchImpl)).search("Acme", { maxResults: 3 });

      expect(sentBody(fetchImpl)).toEqual({
        query: "Acme",
        search_depth: "basic",
        max_results: 3,
        include_raw_content: false,
        include_published_date: true,
      });
    });

    // Tavily answers 400 to a domain mode that comes without a domain list.
    it.each([
      ["an empty domain list", { includeDomains: [], domainsMode: "prefer" as const }, {}],
      ["a mode without domains", { domainsMode: "prefer" as const }, {}],
      [
        "domains without a mode",
        { includeDomains: ["acme.com"] },
        { include_domains: ["acme.com"] },
      ],
    ])("handles %s", async (_label, options, expectedExtra) => {
      const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
      await createTavilyProvider("k", asFetch(fetchImpl)).search("Acme", {
        maxResults: 5,
        ...options,
      });

      expect(sentBody(fetchImpl)).toEqual({
        query: "Acme",
        search_depth: "basic",
        max_results: 5,
        include_raw_content: false,
        include_published_date: true,
        ...expectedExtra,
      });
    });

    it("gives fetch a signal and waits 15 seconds unless told otherwise", async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, "timeout");
      const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
      const provider = createTavilyProvider("k", asFetch(fetchImpl));

      await provider.search("Acme", { maxResults: 5 });
      await provider.search("Acme", { maxResults: 5, timeoutMs: 250 });

      expect(timeoutSpy.mock.calls).toEqual([[15000], [250]]);
      for (const [, init] of fetchImpl.mock.calls) {
        expect(init.signal).toBeInstanceOf(AbortSignal);
      }
    });
  });

  describe("results", () => {
    it("maps each result to a hit and renames published_date to publishedAt", async () => {
      const hits = await searchWith([
        {
          url: "https://acme.com/security",
          title: "Security at Acme",
          content: "Acme completed its SOC 2 audit.",
          published_date: "2025-01-15",
          score: 0.9,
          raw_content: null,
        },
        {
          url: "https://news.example.com/acme-breach",
          title: "Acme breach",
          content: "Acme disclosed a breach.",
        },
        {
          url: "https://news.example.com/acme-other",
          title: "Acme other",
          content: "Something else.",
          published_date: null,
        },
        {
          url: "https://news.example.com/acme-blank",
          title: "Acme blank",
          content: "Blank date.",
          published_date: "",
        },
      ]);

      expect(hits).toEqual([
        {
          url: "https://acme.com/security",
          title: "Security at Acme",
          content: "Acme completed its SOC 2 audit.",
          publishedAt: "2025-01-15",
        },
        {
          url: "https://news.example.com/acme-breach",
          title: "Acme breach",
          content: "Acme disclosed a breach.",
          publishedAt: null,
        },
        {
          url: "https://news.example.com/acme-other",
          title: "Acme other",
          content: "Something else.",
          publishedAt: null,
        },
        {
          url: "https://news.example.com/acme-blank",
          title: "Acme blank",
          content: "Blank date.",
          publishedAt: null,
        },
      ]);
    });

    it("returns an empty list when Tavily finds nothing", async () => {
      expect(await searchWith([])).toEqual([]);
    });

    it("cuts content to 1500 characters", async () => {
      const hits = await searchWith([
        { url: "https://a.example/1", title: "long", content: "x".repeat(2000) },
        { url: "https://a.example/2", title: "just over", content: "y".repeat(1501) },
        { url: "https://a.example/3", title: "exact", content: "z".repeat(1500) },
        { url: "https://a.example/4", title: "short", content: "short text" },
      ]);

      expect(hits.map((hit) => hit.content)).toEqual([
        "x".repeat(1500),
        "y".repeat(1500),
        "z".repeat(1500),
        "short text",
      ]);
    });

    it("does not leave half an emoji at the end of a cut snippet", async () => {
      // The leading "a" puts the first half of an emoji at index 1499, right where the cut falls.
      const hits = await searchWith([
        { url: "https://a.example/1", title: "emoji", content: `a${"😀".repeat(1000)}` },
      ]);

      expect(hits[0].content).toBe(`a${"😀".repeat(749)}`);
      // A lone surrogate throws here, and Postgres would refuse it in the stored evidence.
      expect(() => encodeURIComponent(hits[0].content)).not.toThrow();
    });

    it("drops results whose URL is not http or https and keeps the others as sent", async () => {
      const kept = ["http://acme.com", "https://acme.com", "HTTPS://Acme.com/Path?q=1#top"];
      const dropped = [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        " javascript:alert(1)",
        "java\nscript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://acme.com/file",
        "file:///etc/passwd",
        "//acme.com/protocol-relative",
        "/relative/path",
        "not a url",
        "https://",
        "",
      ];

      const hits = await searchWith(
        [...dropped, ...kept].map((url) => ({ url, title: "t", content: "c" })),
      );

      expect(hits.map((hit) => hit.url)).toEqual(kept);
    });

    it("skips entries that cannot be hits and fills in a missing title or snippet", async () => {
      const hits = await searchWith([
        null,
        "https://text.example",
        42,
        ["https://array.example"],
        { title: "no url", content: "c" },
        { url: 42, title: "numeric url", content: "c" },
        { url: "https://bare.example" },
        {
          url: "https://odd-types.example",
          title: 7,
          content: { text: "c" },
          published_date: 20250115,
        },
      ]);

      expect(hits).toEqual([
        { url: "https://bare.example", title: "", content: "", publishedAt: null },
        { url: "https://odd-types.example", title: "", content: "", publishedAt: null },
      ]);
    });
  });

  describe("failures", () => {
    it.each([401, 429, 500])("rejects with the status when Tavily answers %i", async (status) => {
      const fetchImpl = fetchAnswering(() => new Response("error", { status }));

      const failure = await createTavilyProvider(API_KEY, asFetch(fetchImpl))
        .search("q", { maxResults: 5 })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SearchProviderError);
      expect((failure as SearchProviderError).message).toBe(
        `Tavily search failed with status ${status}`,
      );
    });

    it("does not put the key or the response body in the error", async () => {
      const fetchImpl = fetchAnswering(
        () => new Response(`Invalid API key ${API_KEY} (secret detail)`, { status: 401 }),
      );

      const failure = await createTavilyProvider(API_KEY, asFetch(fetchImpl))
        .search("q", { maxResults: 5 })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SearchProviderError);
      expect((failure as SearchProviderError).message).toContain("401");
      expect(exposedText(failure)).not.toContain(API_KEY);
      expect(exposedText(failure)).not.toContain("secret detail");
    });

    it("rejects with 'search timed out' when the timeout aborts fetch", async () => {
      const fetchImpl = fetchHangingUntilAborted();
      const search = createTavilyProvider(API_KEY, asFetch(fetchImpl)).search("q", {
        maxResults: 5,
        timeoutMs: 20,
      });

      await expect(search).rejects.toBeInstanceOf(SearchProviderError);
      await expect(search).rejects.toHaveProperty("message", "search timed out");
    });

    it("reports a timeout even when the aborted fetch fails with some other error", async () => {
      // undici reports an abort during the response as a plain TypeError("terminated").
      const fetchImpl = fetchHangingUntilAborted(() => new TypeError("terminated"));
      const search = createTavilyProvider(API_KEY, asFetch(fetchImpl)).search("q", {
        maxResults: 5,
        timeoutMs: 20,
      });

      await expect(search).rejects.toHaveProperty("message", "search timed out");
      await expect(search).rejects.toBeInstanceOf(SearchProviderError);
    });

    it("reports a timeout when the signal fires while the body is being read", async () => {
      const fetchImpl = mockFetch(async (_url, init) => {
        const signal = init.signal as AbortSignal;
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(new TypeError("terminated")), {
                once: true,
              });
            }),
        } as unknown as Response;
      });

      const search = createTavilyProvider(API_KEY, asFetch(fetchImpl)).search("q", {
        maxResults: 5,
        timeoutMs: 20,
      });

      await expect(search).rejects.toBeInstanceOf(SearchProviderError);
      await expect(search).rejects.toHaveProperty("message", "search timed out");
    });

    it.each(["TimeoutError", "AbortError"])(
      "reports a timeout for an error named %s",
      async (name) => {
        const fetchImpl = mockFetch(async () => {
          throw Object.assign(new Error("aborted"), { name });
        });

        await expect(
          createTavilyProvider(API_KEY, asFetch(fetchImpl)).search("q", { maxResults: 5 }),
        ).rejects.toHaveProperty("message", "search timed out");
      },
    );

    it.each([[null], [undefined], ["boom"], [42]])(
      "rejects with SearchProviderError('search request failed') when fetch rejects with %p",
      async (reason) => {
        const fetchImpl = mockFetch(() => Promise.reject(reason));

        const failure = await createTavilyProvider(API_KEY, asFetch(fetchImpl))
          .search("q", { maxResults: 5 })
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(SearchProviderError);
        expect((failure as SearchProviderError).message).toBe("search request failed");
      },
    );

    it("hides the cause of a network failure behind 'search request failed'", async () => {
      const fetchImpl = mockFetch(async () => {
        throw Object.assign(new TypeError(`fetch failed for Bearer ${API_KEY}`), {
          cause: new Error(`connect ECONNREFUSED ${API_KEY}`),
        });
      });

      const failure = await createTavilyProvider(API_KEY, asFetch(fetchImpl))
        .search("q", { maxResults: 5 })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SearchProviderError);
      expect((failure as SearchProviderError).message).toBe("search request failed");
      expect(exposedText(failure)).not.toContain(API_KEY);
    });

    it.each([
      ["a body that is not JSON", () => new Response("<html>secret page</html>", { status: 200 })],
      ["JSON without a results list", () => jsonResponse({ detail: "secret detail" })],
      ["a results value that is not a list", () => jsonResponse({ results: "secret detail" })],
      ["a JSON null", () => jsonResponse(null)],
      ["a JSON list", () => jsonResponse([{ url: "https://acme.com" }])],
    ])("rejects with SearchProviderError on %s without echoing it", async (_label, respond) => {
      const failure = await createTavilyProvider(API_KEY, asFetch(fetchAnswering(respond)))
        .search("q", { maxResults: 5 })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SearchProviderError);
      expect((failure as SearchProviderError).message).toBe("search response could not be read");
      expect(exposedText(failure)).not.toContain("secret");
    });
  });
});

describe("SearchProviderError", () => {
  it("is an Error named SearchProviderError that carries its message", () => {
    const error = new SearchProviderError("search timed out");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SearchProviderError");
    expect(error.message).toBe("search timed out");
  });
});

describe("createSearchProvider", () => {
  const unconfigured: Array<[string, NodeJS.ProcessEnv]> = [
    ["nothing is set", {}],
    ["the provider has no key", { VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily" }],
    ["the key is blank", { VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "  " }],
    ["there is a key but no provider", { TAVILY_API_KEY: "k" }],
    [
      "the provider is not supported",
      { VENDOR_RESEARCH_SEARCH_PROVIDER: "bing", TAVILY_API_KEY: "k" },
    ],
  ];
  const tavilyEnv: NodeJS.ProcessEnv = {
    VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
    TAVILY_API_KEY: API_KEY,
  };

  it.each(unconfigured)("returns null when %s", (_label, env) => {
    expect(createSearchProvider(getVendorResearchConfig(env))).toBeNull();
  });

  it("returns a provider named tavily when Tavily is configured", () => {
    const provider = createSearchProvider(getVendorResearchConfig(tavilyEnv));

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("tavily");
  });

  it("builds the provider with the configured key and the fetch it was given", async () => {
    const fetchImpl = fetchAnswering(() => jsonResponse({ results: [] }));
    const provider = createSearchProvider(getVendorResearchConfig(tavilyEnv), asFetch(fetchImpl));

    await provider?.search("Acme", { maxResults: 5 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    });
  });

  it("returns a provider exactly when isSearchConfigured says search is configured", () => {
    for (const env of [tavilyEnv, ...unconfigured.map(([, unconfiguredEnv]) => unconfiguredEnv)]) {
      const config = getVendorResearchConfig(env);

      expect(createSearchProvider(config) !== null).toBe(isSearchConfigured(config));
    }
  });

  describe("with no config argument", () => {
    const realEnv = process.env;

    // The tests replace process.env and must never write to the real one.
    afterEach(() => {
      jest.restoreAllMocks();
      // A boolean, so that a failure cannot print the real environment.
      expect(process.env === realEnv).toBe(true);
    });

    it("returns null when process.env sets nothing", () => {
      jest.replaceProperty(process, "env", {});

      expect(createSearchProvider()).toBeNull();
    });

    it("returns a provider named tavily when process.env configures Tavily", () => {
      jest.replaceProperty(process, "env", tavilyEnv);

      expect(createSearchProvider()?.name).toBe("tavily");
    });
  });
});
