import {
  EXCERPT_GAP,
  MAX_EXCERPT_CHARS,
  MAX_EXTRA_PARTS,
  PageLink,
  pageParts,
  relevantLinks,
  selectExcerpt,
} from "../pageText";
import { FetchedPage, PageReadError } from "../readPage";
import { SearchEngine, SearchEngineError, SearchKind, SearchResult } from "../webSearch";
import {
  KIND_REFUSALS,
  LedgerEntry,
  SESSION_LIMITS,
  SessionLimits,
  WebSessionOptions,
  createWebSession,
} from "../webSession";

type Category = "security_incidents" | "certifications" | "legal_regulatory" | "ai_specific";

/** The earliest date a security source may have in the tests that set a lookback. */
const CUTOFF = "2029-04-20";

/** A search result whose title and snippet name its URL, so that entries are easy to tell apart. */
function result(url: string, publishedAt: string | null = null): SearchResult {
  return { title: `Title of ${url}`, url, snippet: `Snippet of ${url}`, publishedAt, source: null };
}

/** The ledger entry that a kept result becomes; off the vendor's site unless `onVendorSite`. */
function resultEntry(
  category: Category,
  kept: SearchResult,
  onVendorSite = false,
): LedgerEntry<Category> {
  return {
    category,
    kind: "result",
    onVendorSite,
    url: kept.url,
    title: kept.title,
    content: kept.snippet,
    publishedAt: kept.publishedAt,
  };
}

/** A page as the reader gives it back; `url` is the URL that answered. */
function page(url: string, fields: Partial<FetchedPage> = {}): FetchedPage {
  return {
    url,
    title: `Page at ${url}`,
    publishedAt: null,
    text: `Text of ${url}`,
    links: [],
    ...fields,
  };
}

interface Setup {
  /** What the engine answers, one item per search in turn (an Error rejects); then no results. */
  answers?: Array<SearchResult[] | Error>;
  domain?: string | null;
  cutoffs?: Partial<Record<Category, string>>;
  limits?: Partial<SessionLimits>;
  isRelevant?: WebSessionOptions<Category>["isRelevant"];
  normalizeQuery?: WebSessionOptions<Category>["normalizeQuery"];
  closedHosts?: WebSessionOptions<Category>["closedHosts"];
  aliasDomains?: WebSessionOptions<Category>["aliasDomains"];
  /** The kinds the fake engine answers; both by default. */
  kinds?: SearchKind[];
}

/**
 * A session on the domain acme.com, with a fake engine and a reader that answers every URL. The
 * engine declares what a real one does. Its kinds are read from `engineState` whenever the session
 * asks, so a test can change them the way a fallback does.
 */
function setup(options: Setup = {}) {
  const answers = [...(options.answers ?? [])];
  const search = jest.fn<Promise<SearchResult[]>, [string, SearchKind, AbortSignal?]>(async () => {
    const answer = answers.shift() ?? [];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const readPage = jest.fn<Promise<FetchedPage>, [string, AbortSignal?]>(async (url) => page(url));
  const engineState = { kinds: options.kinds ?? (["web", "news"] as SearchKind[]) };
  const engine: SearchEngine = {
    id: "replay",
    get kinds() {
      return engineState.kinds;
    },
    newsWindowMonths: null,
    search,
  };
  const sessionOptions: WebSessionOptions<Category> = {
    engine,
    readPage,
    domain: options.domain === undefined ? "acme.com" : options.domain,
    cutoffs: options.cutoffs ?? {},
    limits: options.limits,
    isRelevant: options.isRelevant,
    normalizeQuery: options.normalizeQuery,
    closedHosts: options.closedHosts,
    aliasDomains: options.aliasDomains,
  };
  return { session: createWebSession(sessionOptions), search, readPage, engineState };
}

describe("createWebSession", () => {
  describe("search", () => {
    it("puts the kept results in the ledger in arrival order, tagged with the category of the call, and returns them", async () => {
      const first = [
        result("https://news.example/a", "2031-01-02T00:00:00.000Z"),
        result("https://news.example/b"),
      ];
      const second = [result("https://law.example/c")];
      const { session, search } = setup({ answers: [first, second] });
      const signal = new AbortController().signal;

      expect(await session.search("Acme breach", "news", "security_incidents", signal)).toEqual({
        ok: true,
        results: first,
        omitted: {},
      });
      expect(await session.search("Acme lawsuit", "web", "legal_regulatory")).toEqual({
        ok: true,
        results: second,
        omitted: {},
      });

      expect(search).toHaveBeenNthCalledWith(1, "Acme breach", "news", signal);
      expect(search).toHaveBeenNthCalledWith(2, "Acme lawsuit", "web", undefined);
      expect(session.snapshot().ledger).toEqual([
        resultEntry("security_incidents", first[0]),
        resultEntry("security_incidents", first[1]),
        resultEntry("legal_regulatory", second[0]),
      ]);
    });

    it("uses one search whether the engine answers or fails", async () => {
      const { session, search } = setup({
        answers: [[result("https://news.example/a")], new SearchEngineError()],
      });

      await session.search("Acme breach", "news", "security_incidents");
      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 1);
      await session.search("Acme lawsuit", "news", "security_incidents");
      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 2);

      expect(search).toHaveBeenCalledTimes(2);
      expect(session.snapshot().searchesUsed).toBe(2);
    });

    it("drops a result whose URL is already in the ledger, whatever its fragment", async () => {
      const a = result("https://news.example/a");
      const { session } = setup({
        answers: [
          [a],
          [
            result("https://news.example/a"),
            result("https://news.example/b#comments"),
            result("https://news.example/b"),
          ],
        ],
      });

      await session.search("Acme breach", "news", "security_incidents");
      const outcome = await session.search("Acme lawsuit", "news", "legal_regulatory");

      const b = { ...result("https://news.example/b#comments"), url: "https://news.example/b" };
      expect(outcome).toEqual({ ok: true, results: [b], omitted: {} });
      expect(session.snapshot().ledger).toEqual([
        resultEntry("security_incidents", a),
        resultEntry("legal_regulatory", b),
      ]);
    });

    it("drops and counts a result older than the cutoff of its category and keeps one without a date", async () => {
      const old = result("https://news.example/old", "2029-04-19T23:59:59.000Z");
      const onTheDay = result("https://news.example/on-the-day", "2029-04-20T00:00:00.000Z");
      const undated = result("https://news.example/undated");
      const { session } = setup({
        answers: [[old, onTheDay, undated]],
        cutoffs: { security_incidents: CUTOFF },
      });

      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: true,
        results: [onTheDay, undated],
        omitted: { old: 1 },
      });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
        onTheDay.url,
        undated.url,
      ]);
    });

    it("holds a result only to the cutoff of the category of its call", async () => {
      const old = result("https://news.example/old", "2020-01-01T00:00:00.000Z");
      const { session } = setup({ answers: [[old]], cutoffs: { security_incidents: CUTOFF } });

      expect(await session.search("Acme lawsuit", "news", "legal_regulatory")).toEqual({
        ok: true,
        results: [old],
        omitted: {},
      });
    });

    it("never drops a result on the vendor's own domain for its date", async () => {
      const own = result("https://acme.com/2019-report", "2019-01-01T00:00:00.000Z");
      const subdomain = result("https://trust.acme.com/old", "2019-01-01T00:00:00.000Z");
      const lookalike = result("https://notacme.com/old", "2019-01-01T00:00:00.000Z");
      const { session } = setup({
        answers: [[own, subdomain, lookalike]],
        cutoffs: { security_incidents: CUTOFF },
      });

      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: true,
        results: [own, subdomain],
        omitted: { old: 1 },
      });
    });

    describe("the date of a result of the web feed", () => {
      it("is not kept: the feed gives the day it crawled the page, not the day it was published", async () => {
        const crawled = result("https://web.example/story", "2031-02-03T00:00:00.000Z");
        const { session } = setup({ answers: [[crawled]] });

        const outcome = await session.search("Acme breach", "web", "security_incidents");

        expect(outcome).toEqual({
          ok: true,
          results: [{ ...crawled, publishedAt: null }],
          omitted: {},
        });
        expect(session.snapshot().ledger[0].publishedAt).toBeNull();
      });

      it("is kept for a result of the news feed, which dates its articles", async () => {
        const article = result("https://news.example/story", "2031-02-03T00:00:00.000Z");
        const { session } = setup({ answers: [[article]] });

        await session.search("Acme breach", "news", "security_incidents");

        expect(session.snapshot().ledger[0].publishedAt).toBe("2031-02-03T00:00:00.000Z");
      });

      it("still leaves a result out when the crawl is older than the window: a page is not newer than its crawl", async () => {
        const old = result("https://web.example/old", "2020-01-01T00:00:00.000Z");
        const recent = result("https://web.example/recent", "2031-01-01T00:00:00.000Z");
        const { session } = setup({
          answers: [[old, recent]],
          cutoffs: { security_incidents: CUTOFF },
        });

        const outcome = await session.search("Acme breach", "web", "security_incidents");

        expect(outcome).toEqual({
          ok: true,
          results: [{ ...recent, publishedAt: null }],
          omitted: { old: 1 },
        });
      });

      it("leaves the date of the page to the read: the page's own date decides whether it is too old", async () => {
        const crawled = result("https://web.example/story", "2031-02-03T00:00:00.000Z");
        const { session, readPage } = setup({
          answers: [[crawled]],
          cutoffs: { security_incidents: CUTOFF },
        });
        readPage.mockResolvedValueOnce(
          page(crawled.url, { publishedAt: "2019-05-06T00:00:00.000Z" }),
        );
        await session.search("Acme breach", "web", "security_incidents");

        const outcome = await session.read(crawled.url, "security_incidents");

        expect(outcome).toMatchObject({ ok: false, reason: "too_old" });
        expect(session.snapshot().ledger).toEqual([]);
      });
    });

    it("keeps at most maxResultsPerSearch results", async () => {
      const many = Array.from({ length: 12 }, (_, n) => result(`https://news.example/${n}`));

      const byDefault = setup({ answers: [many] });
      const outcome = await byDefault.session.search("Acme", "web", "security_incidents");
      expect(outcome).toEqual({ ok: true, results: many.slice(0, 10), omitted: {} });
      expect(byDefault.session.snapshot().ledger).toHaveLength(10);

      const limited = setup({ answers: [many], limits: { maxResultsPerSearch: 3 } });
      expect(await limited.session.search("Acme", "web", "security_incidents")).toEqual({
        ok: true,
        results: many.slice(0, 3),
        omitted: {},
      });
    });

    it("answers search_unavailable when the engine fails and records the call as not answered", async () => {
      const { session } = setup({ answers: [new SearchEngineError()] });

      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "search_unavailable",
      });
      expect(session.snapshot().calls).toEqual([
        {
          category: "security_incidents",
          tool: "search",
          answered: false,
          failure: "search_unavailable",
        },
      ]);
      expect(session.snapshot().ledger).toEqual([]);
    });

    it("records a search that fails while its signal is live as not answered", async () => {
      const { session } = setup({ answers: [new SearchEngineError()] });
      const controller = new AbortController();

      expect(
        await session.search("Acme breach", "news", "security_incidents", controller.signal),
      ).toEqual({ ok: false, reason: "search_unavailable" });
      expect(session.snapshot().calls).toEqual([
        {
          category: "security_incidents",
          tool: "search",
          answered: false,
          failure: "search_unavailable",
        },
      ]);
    });

    it("does not record a search that failed because its signal aborted: the time ran out, not the web", async () => {
      const { session, search } = setup();
      // Like the engine, which fails a search whose signal aborts.
      search.mockImplementationOnce(
        (_query, _kind, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(new SearchEngineError()), {
              once: true,
            });
          }),
      );
      const controller = new AbortController();

      const pending = session.search(
        "Acme breach",
        "news",
        "security_incidents",
        controller.signal,
      );
      controller.abort();

      expect(await pending).toEqual({ ok: false, reason: "search_unavailable" });
      expect(session.snapshot().calls).toEqual([]);
      expect(session.snapshot().searchesUsed).toBe(1);
      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 1);
    });

    it("lets an error of the engine that is not a SearchEngineError through and records no call", async () => {
      const bug = new TypeError("Cannot read properties of undefined");
      const { session } = setup({ answers: [bug] });

      await expect(session.search("Acme breach", "news", "security_incidents")).rejects.toBe(bug);
      expect(session.snapshot().calls).toEqual([]);
    });

    it("takes an empty answer as an answer", async () => {
      const { session } = setup({ answers: [[]] });

      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: true,
        results: [],
        omitted: {},
      });
      expect(session.snapshot().calls).toEqual([
        { category: "security_incidents", tool: "search", answered: true, failure: null },
      ]);
    });

    it("refuses the ninth search without calling the engine and does not record it", async () => {
      const { session, search } = setup();
      for (let n = 0; n < 8; n += 1) {
        expect((await session.search(`Acme ${n}`, "web", "security_incidents")).ok).toBe(true);
      }

      expect(await session.search("Acme 9", "web", "security_incidents")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
      expect(search).toHaveBeenCalledTimes(8);
      expect(session.snapshot().calls).toHaveLength(8);
      expect(session.snapshot().searchesUsed).toBe(8);
      expect(session.budget().searchesLeft).toBe(0);
    });

    it("takes the search budget before it waits for the engine", async () => {
      const { session, search } = setup({ limits: { maxSearches: 1 } });

      const outcomes = await Promise.all([
        session.search("Acme one", "web", "security_incidents"),
        session.search("Acme two", "web", "security_incidents"),
      ]);

      expect(outcomes).toEqual([
        { ok: true, results: [], omitted: {} },
        { ok: false, reason: "budget_exhausted" },
      ]);
      expect(search).toHaveBeenCalledTimes(1);
    });
  });

  describe("search: a kind that the engine does not answer", () => {
    const NEWS_ONLY: SearchKind[] = ["news"];
    const WEB_ONLY: SearchKind[] = ["web"];
    const askWeb = (query = "Acme data breach", category: Category = "security_incidents") => ({
      query,
      kind: "web" as const,
      category,
    });
    const askNews = (query = "Acme data breach", category: Category = "security_incidents") => ({
      query,
      kind: "news" as const,
      category,
    });

    it("refuses a search of the web on an engine of the news only, naming the kind, without asking the engine", async () => {
      const { session, search } = setup({ kinds: NEWS_ONLY });

      expect(await session.search("Acme data breach", "web", "security_incidents")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "web",
      });
      expect(search).not.toHaveBeenCalled();
    });

    it("refuses a search of the news on an engine of the web only", async () => {
      const { session, search } = setup({ kinds: WEB_ONLY });

      expect(await session.search("Acme data breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "news",
      });
      expect(search).not.toHaveBeenCalled();
    });

    it("lets the kind that the engine answers through, whichever kind that is", async () => {
      const news = setup({ kinds: NEWS_ONLY, answers: [[result("https://news.example/a")]] });
      expect((await news.session.search("Acme data breach", "news", "security_incidents")).ok).toBe(
        true,
      );
      expect(news.search).toHaveBeenCalledTimes(1);

      const web = setup({ kinds: WEB_ONLY, answers: [[result("https://web.example/a")]] });
      expect((await web.session.search("Acme data breach", "web", "security_incidents")).ok).toBe(
        true,
      );
      expect(web.search).toHaveBeenCalledTimes(1);
    });

    it("is not work on a category: no unit of the budget, no record of a call, nothing in the ledger", async () => {
      const { session } = setup({ kinds: NEWS_ONLY });

      await session.search("Acme data breach", "web", "security_incidents");

      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches);
      // The summary of a run reads these calls, so a category that was only refused is not worked.
      expect(session.snapshot()).toEqual({ ledger: [], calls: [], searchesUsed: 0, pagesRead: 0 });
    });

    it("never runs the budget out: any number of refusals leaves every search to the kind that is answered", async () => {
      const { session, search } = setup({ kinds: NEWS_ONLY });

      for (let n = 0; n < SESSION_LIMITS.maxSearches + 3; n += 1) {
        expect(await session.search(`Acme ${n}`, "web", "security_incidents")).toMatchObject({
          reason: "kind_unavailable",
        });
      }

      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches);
      expect((await session.search("Acme data breach", "news", "security_incidents")).ok).toBe(
        true,
      );
      expect(search).toHaveBeenCalledTimes(1);
    });

    it("does not remember the words of a refused search: they are not a repeat when asked as the kind the engine answers", async () => {
      const { session, search } = setup({ kinds: NEWS_ONLY });
      await session.search("Acme data breach", "web", "security_incidents");

      const outcome = await session.search("Acme data breach", "news", "security_incidents");

      expect(outcome.ok).toBe(true);
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith("Acme data breach", "news", undefined);
    });

    it("does not take a refused search for an answered query: asked again as the same kind, it is answered once the engine answers it", async () => {
      const { session, search, engineState } = setup({ kinds: NEWS_ONLY });
      await session.search("Acme data breach", "web", "security_incidents");
      engineState.kinds = ["web", "news"];

      const outcome = await session.search("Acme data breach", "web", "security_incidents");

      expect(outcome.ok).toBe(true);
      expect(search).toHaveBeenCalledTimes(1);
    });

    it("reads the kinds of the engine at the time of each search, since a fallback changes them", async () => {
      const { session, search, engineState } = setup();
      expect((await session.search("Acme data breach", "web", "security_incidents")).ok).toBe(true);

      // The engine fell back to one of the news only.
      engineState.kinds = ["news"];
      expect(await session.search("Acme lawsuit", "web", "legal_regulatory")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "web",
      });
      expect((await session.search("Acme lawsuit", "news", "legal_regulatory")).ok).toBe(true);

      // Nothing is kept from the earlier reads.
      engineState.kinds = ["web", "news"];
      expect((await session.search("Acme fine", "web", "legal_regulatory")).ok).toBe(true);
      expect(search).toHaveBeenCalledTimes(3);
    });

    it("judges the kind before a repeat: the words of an earlier web search, asked again once the engine has lost the web", async () => {
      const { session, engineState } = setup();
      await session.search("Acme data breach", "web", "security_incidents");
      engineState.kinds = ["news"];

      expect(await session.search("Acme data breach", "web", "security_incidents")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "web",
      });
    });

    it("gives way to the budget: with no search left the answer is budget_exhausted", async () => {
      const { session } = setup({ kinds: NEWS_ONLY, limits: { maxSearches: 1 } });
      await session.search("Acme data breach", "news", "security_incidents");

      expect(await session.search("Acme lawsuit", "web", "legal_regulatory")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
    });

    it("refuses an engine that answers no kind every search, and a list in a different order is the same list", async () => {
      const none = setup({ kinds: [] });
      expect(await none.session.search("Acme data breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "news",
      });
      expect(await none.session.search("Acme data breach", "web", "security_incidents")).toEqual({
        ok: false,
        reason: "kind_unavailable",
        kind: "web",
      });

      const reversed = setup({ kinds: ["news", "web"] });
      expect(
        (await reversed.session.search("Acme data breach", "web", "security_incidents")).ok,
      ).toBe(true);
    });

    it("takes an engine that declares no kinds to answer every kind, as every engine did before the field existed", async () => {
      const search = jest.fn(async () => [] as SearchResult[]);
      const session = createWebSession<Category>({
        engine: { search } as unknown as SearchEngine,
        readPage: jest.fn(),
        domain: "acme.com",
        cutoffs: {},
      });

      expect((await session.search("Acme data breach", "web", "security_incidents")).ok).toBe(true);
      expect((await session.search("Acme data breach", "news", "security_incidents")).ok).toBe(
        true,
      );
      expect(session.defaultKind()).toBe("web");
    });

    describe("in searchMany", () => {
      it("refuses the search in its place and goes on with the others, in the order of the requests", async () => {
        const a = result("https://news.example/a");
        const b = result("https://law.example/b");
        const { session, search } = setup({ kinds: NEWS_ONLY, answers: [[a], [b]] });

        const responses = await session.searchMany([
          askNews("Acme data breach"),
          askWeb("Acme data breach"),
          askNews("Acme lawsuit", "legal_regulatory"),
        ]);

        expect(responses.map((response) => response.outcome)).toEqual([
          { ok: true, results: [a], omitted: {} },
          { ok: false, reason: "kind_unavailable", kind: "web" },
          { ok: true, results: [b], omitted: {} },
        ]);
        // A search that was turned away did not wait for anything.
        expect(responses[1].ms).toBe(0);
        expect(search).toHaveBeenCalledTimes(2);
        expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 2);
        expect(session.snapshot().calls).toHaveLength(2);
      });

      it("does not take the budget of the one search left from a refused search that came first", async () => {
        const { session } = setup({ kinds: NEWS_ONLY, limits: { maxSearches: 1 } });

        const responses = await session.searchMany([askWeb(), askNews()]);

        expect(responses[0].outcome).toEqual({
          ok: false,
          reason: "kind_unavailable",
          kind: "web",
        });
        expect(responses[1].outcome.ok).toBe(true);
      });
    });

    describe("for a pool and for the code", () => {
      it("is refused as it is for the model, and takes nothing of the budget of the pool", async () => {
        const { session, search } = setup({ kinds: NEWS_ONLY });
        const pool = session.pool({ searches: 2, reads: 0 });

        expect(await pool.search("Acme data breach", "web", "security_incidents")).toEqual({
          ok: false,
          reason: "kind_unavailable",
          kind: "web",
        });
        expect(
          (await pool.searchMany([askWeb("Acme lawsuit", "legal_regulatory")]))[0].outcome,
        ).toEqual({ ok: false, reason: "kind_unavailable", kind: "web" });

        expect(pool.budget().searchesLeft).toBe(2);
        expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches);
        expect(search).not.toHaveBeenCalled();
      });

      it("is refused for the code as well, and the unit that was set aside for it stays", async () => {
        const { session, search } = setup({ kinds: NEWS_ONLY });
        session.setCodeBudget({ searches: 1 });
        const byCode = (request: ReturnType<typeof askWeb> | ReturnType<typeof askNews>) => ({
          ...request,
          by: "code" as const,
        });

        const [refused] = await session.searchMany([byCode(askWeb())]);
        expect(refused.outcome).toEqual({ ok: false, reason: "kind_unavailable", kind: "web" });

        // The one unit of the code is still there for a search the engine can answer.
        const [first] = await session.searchMany([byCode(askNews())]);
        expect(first.outcome.ok).toBe(true);
        const [second] = await session.searchMany([byCode(askNews("Acme lawsuit"))]);
        expect(second.outcome).toEqual({ ok: false, reason: "budget_exhausted" });
        expect(search).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("what the model is told of a kind that the engine does not answer", () => {
    it("is a fixed phrase for the web, which points to the news and to the vendor's pages", () => {
      expect(KIND_REFUSALS.web).toBe(
        "Web search is not available in this run; search the news or read the vendor's pages",
      );
    });

    it("is a matching phrase for the news, which points to the web and to the vendor's pages", () => {
      expect(KIND_REFUSALS.news).toBe(
        "News search is not available in this run; search the web or read the vendor's pages",
      );
    });

    // A phrase takes only the kind, never the query, so it is the same for every query. It also
    // holds none of the characters that a prompt escapes, so the loop shows it as it is written.
    it("has one phrase for each kind, and none needs escaping in a prompt", () => {
      expect(Object.keys(KIND_REFUSALS).sort()).toEqual(["news", "web"]);
      for (const phrase of Object.values(KIND_REFUSALS)) {
        expect(phrase).not.toMatch(/[<>&]/);
      }
    });
  });

  describe("defaultKind: the kind of a search whose asker named none", () => {
    it("is the web, as it always was, for an engine that answers it", () => {
      expect(setup({ kinds: ["web", "news"] }).session.defaultKind()).toBe("web");
      expect(setup({ kinds: ["news", "web"] }).session.defaultKind()).toBe("web");
      expect(setup({ kinds: ["web"] }).session.defaultKind()).toBe("web");
    });

    it("is the news when the engine does not answer the web", () => {
      expect(setup({ kinds: ["news"] }).session.defaultKind()).toBe("news");
      expect(setup({ kinds: [] }).session.defaultKind()).toBe("news");
    });

    it("is read when it is asked, since a fallback changes the kinds of the engine", () => {
      const { session, engineState } = setup();
      expect(session.defaultKind()).toBe("web");

      engineState.kinds = ["news"];
      expect(session.defaultKind()).toBe("news");

      engineState.kinds = ["web", "news"];
      expect(session.defaultKind()).toBe("web");
    });

    it("is the same for a pool, which shares the engine", () => {
      const { session, engineState } = setup();
      const pool = session.pool({ searches: 1, reads: 0 });
      expect(pool.defaultKind()).toBe("web");

      engineState.kinds = ["news"];
      expect(pool.defaultKind()).toBe("news");
    });

    it("is a kind that the engine answers, so a search made with it is never refused for its kind", async () => {
      for (const kinds of [["web", "news"], ["web"], ["news"]] as SearchKind[][]) {
        const { session } = setup({ kinds });
        const outcome = await session.search(
          "Acme data breach",
          session.defaultKind(),
          "security_incidents",
        );
        expect(outcome.ok).toBe(true);
      }
    });
  });

  describe("read: provenance", () => {
    it("refuses a URL that no search returned and that is not on the vendor's domain", async () => {
      const { session, readPage } = setup();

      expect(await session.read("https://news.example/story", "security_incidents")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
      expect(readPage).not.toHaveBeenCalled();
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
      expect(session.snapshot().calls).toEqual([]);
    });

    it.each(["https://docs.acme.com/x", "https://acme.com/y"])(
      "reads %s, on the vendor's domain, without a search",
      async (url) => {
        const { session, readPage } = setup();

        expect((await session.read(url, "certifications")).ok).toBe(true);
        expect(readPage).toHaveBeenCalledWith(url, undefined);
      },
    );

    it.each(["https://acme.com.evil.example/", "https://notacme.com/"])(
      "does not take %s for the vendor's domain",
      async (url) => {
        const { session, readPage } = setup();

        expect(await session.read(url, "certifications")).toEqual({
          ok: false,
          reason: "not_from_search",
        });
        expect(readPage).not.toHaveBeenCalled();
      },
    );

    it("reads only URLs a search returned when the vendor has no domain", async () => {
      const { session, readPage } = setup({
        domain: null,
        answers: [[result("https://news.example/a")]],
      });

      expect(await session.read("https://acme.com/y", "security_incidents")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
      await session.search("Acme breach", "news", "security_incidents");
      expect((await session.read("https://news.example/a", "security_incidents")).ok).toBe(true);
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("reads a URL a search returned", async () => {
      const { session, readPage } = setup({ answers: [[result("https://news.example/a")]] });
      await session.search("Acme breach", "news", "security_incidents");

      expect((await session.read("https://news.example/a#top", "security_incidents")).ok).toBe(
        true,
      );
      expect(readPage).toHaveBeenCalledWith("https://news.example/a", undefined);
    });

    it("does not count a result dropped for its date as returned", async () => {
      const { session, readPage } = setup({
        answers: [[result("https://news.example/old", "2020-01-01T00:00:00.000Z")]],
        cutoffs: { security_incidents: CUTOFF },
      });
      await session.search("Acme breach", "news", "security_incidents");

      expect(await session.read("https://news.example/old", "legal_regulatory")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
      expect(readPage).not.toHaveBeenCalled();
    });

    it("does not count a result past maxResultsPerSearch as returned", async () => {
      const many = Array.from({ length: 11 }, (_, n) => result(`https://news.example/${n}`));
      const { session } = setup({ answers: [many] });
      await session.search("Acme", "web", "security_incidents");

      expect(await session.read("https://news.example/10", "security_incidents")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
    });
  });

  describe("read: URL policy", () => {
    it.each([
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "https://acme.com:8080/",
    ])("refuses %s as not_allowed, even when the engine returned it", async (url) => {
      const { session, readPage } = setup({ answers: [[result(url)]] });

      expect(await session.read(url, "security_incidents")).toEqual({
        ok: false,
        reason: "not_allowed",
      });
      expect(await session.search("Acme", "web", "security_incidents")).toEqual({
        ok: true,
        results: [],
        omitted: {},
      });
      expect(await session.read(url, "security_incidents")).toEqual({
        ok: false,
        reason: "not_allowed",
      });

      expect(readPage).not.toHaveBeenCalled();
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
      expect(session.snapshot().calls).toEqual([
        { category: "security_incidents", tool: "search", answered: true, failure: null },
      ]);
      expect(session.snapshot().ledger).toEqual([]);
    });

    it("refuses a URL on the vendor's domain that percent-encoding takes past 2,048 characters, using no read", async () => {
      const { session, readPage } = setup();

      expect(await session.read("https://acme.com/" + "中".repeat(240), "certifications")).toEqual({
        ok: false,
        reason: "not_allowed",
      });
      expect(readPage).not.toHaveBeenCalled();
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
      expect(session.snapshot().calls).toEqual([]);
    });
  });

  describe("read: a page that was read", () => {
    // About 31,000 characters; the one paragraph about the focus sits far beyond the first 8,000.
    const filler = (n: number) => `Paragraph ${n} talks about nothing in particular. `.repeat(20);
    const LONG_TEXT = [
      ...Array.from({ length: 30 }, (_, n) => filler(n)),
      "Acme uses customer data for model training.",
      filler(31),
    ].join("\n\n");

    it("replaces the snippet with the excerpt in place, keeping the result's title and taking the page's date", async () => {
      const a = result("https://news.example/a", "2031-01-02T00:00:00.000Z");
      const b = result("https://news.example/b");
      const { session, readPage } = setup({ answers: [[a, b]] });
      readPage.mockResolvedValueOnce(
        page(a.url, {
          title: "The page's own title",
          publishedAt: "2031-03-04T00:00:00.000Z",
          text: LONG_TEXT,
          links: [{ text: "Security", url: "https://acme.com/security" }],
        }),
      );
      await session.search("Acme breach", "news", "security_incidents");
      const signal = new AbortController().signal;

      const outcome = await session.read(a.url, "ai_specific", "customer data training", signal);

      const expected = selectExcerpt(LONG_TEXT, { focus: "customer data training" });
      expect(expected.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
      expect(expected.excerpt).toContain("Acme uses customer data for model training.");
      expect(readPage).toHaveBeenCalledWith(a.url, signal);
      expect(outcome).toEqual({
        ok: true,
        page: {
          url: a.url,
          title: "The page's own title",
          publishedAt: "2031-03-04T00:00:00.000Z",
          excerpt: expected.excerpt,
          truncated: true,
          links: [],
          parts: pageParts(LONG_TEXT).length,
        },
      });
      expect(session.snapshot().ledger).toEqual([
        {
          category: "ai_specific",
          kind: "page",
          onVendorSite: false,
          url: a.url,
          title: a.title,
          content: expected.excerpt,
          publishedAt: "2031-03-04T00:00:00.000Z",
        },
        resultEntry("security_incidents", b),
      ]);
    });

    it("cuts the excerpt of a long page at MAX_EXCERPT_CHARS when there is no focus", async () => {
      const { session, readPage } = setup();
      readPage.mockResolvedValueOnce(page("https://acme.com/long", { text: LONG_TEXT }));

      const outcome = await session.read("https://acme.com/long", "certifications");

      expect(outcome.ok && outcome.page.excerpt).toBe(LONG_TEXT.slice(0, MAX_EXCERPT_CHARS));
      expect(outcome.ok && outcome.page.truncated).toBe(true);
      expect(session.snapshot().ledger[0].content).toBe(LONG_TEXT.slice(0, MAX_EXCERPT_CHARS));
    });

    it("appends a page of the vendor's domain that no search returned", async () => {
      const a = result("https://news.example/a");
      const { session, readPage } = setup({ answers: [[a]] });
      readPage.mockResolvedValueOnce(
        page("https://acme.com/trust", {
          title: "Trust center",
          publishedAt: "2031-02-03T00:00:00.000Z",
          text: "We hold SOC 2 Type II.",
        }),
      );
      await session.search("Acme breach", "news", "security_incidents");

      const outcome = await session.read("https://acme.com/trust", "certifications");

      expect(outcome.ok && outcome.page.truncated).toBe(false);
      expect(session.snapshot().ledger).toEqual([
        resultEntry("security_incidents", a),
        {
          category: "certifications",
          kind: "page",
          onVendorSite: true,
          url: "https://acme.com/trust",
          title: "Trust center",
          content: "We hold SOC 2 Type II.",
          publishedAt: "2031-02-03T00:00:00.000Z",
        },
      ]);
    });

    it("gives the links of a page on the vendor's domain as relevantLinks filters them, at most 25", async () => {
      const links: PageLink[] = [
        { text: "Pricing", url: "https://acme.com/pricing" },
        { text: "Security", url: "https://other.example/security" },
        ...Array.from({ length: 30 }, (_, n) => ({
          text: `Security notice ${n}`,
          url: `https://acme.com/security/${n}`,
        })),
      ];
      const { session, readPage } = setup();
      readPage.mockResolvedValueOnce(page("https://acme.com/", { links }));

      const outcome = await session.read("https://acme.com/", "certifications");

      if (!outcome.ok) throw new Error("Expected the read to succeed");
      expect(outcome.page.links).toEqual(relevantLinks(links, "acme.com", "https://acme.com/"));
      expect(outcome.page.links).toHaveLength(25);
      expect(outcome.page.links[0]).toEqual({
        text: "Security notice 0",
        url: "https://acme.com/security/0",
      });
    });

    it("gives no links for a page off the vendor's domain", async () => {
      const { session, readPage } = setup({ answers: [[result("https://news.example/a")]] });
      readPage.mockResolvedValueOnce(
        page("https://news.example/a", {
          links: [{ text: "Acme security", url: "https://acme.com/security" }],
        }),
      );
      await session.search("Acme breach", "news", "security_incidents");

      const outcome = await session.read("https://news.example/a", "security_incidents");

      expect(outcome.ok && outcome.page.links).toEqual([]);
    });

    it("does not take a page that redirected to another host for the vendor's page", async () => {
      const redirected = page("https://blog-host.example/post", {
        publishedAt: "2020-01-01T00:00:00.000Z",
        links: [{ text: "Acme security", url: "https://acme.com/security" }],
      });

      const withoutLookback = setup();
      withoutLookback.readPage.mockResolvedValueOnce(redirected);
      const read = await withoutLookback.session.read("https://acme.com/blog", "certifications");
      expect(read.ok && read.page.links).toEqual([]);

      const withLookback = setup({ cutoffs: { security_incidents: CUTOFF } });
      withLookback.readPage.mockResolvedValueOnce(redirected);
      expect(
        await withLookback.session.read("https://acme.com/blog", "security_incidents"),
      ).toEqual({ ok: false, reason: "too_old", publishedAt: "2020-01-01T00:00:00.000Z" });
    });

    it("gives the links of a page that redirected within the vendor's domain", async () => {
      const links = [{ text: "Security", url: "https://www.acme.com/security" }];
      const { session, readPage } = setup();
      readPage.mockResolvedValueOnce(page("https://www.acme.com/", { links }));

      const outcome = await session.read("https://acme.com/", "certifications");

      expect(outcome.ok && outcome.page.links).toEqual(links);
    });

    it("never leaves out a page on the vendor's domain for its date", async () => {
      const { session, readPage } = setup({ cutoffs: { security_incidents: CUTOFF } });
      readPage.mockResolvedValueOnce(
        page("https://acme.com/history", { publishedAt: "2010-01-01T00:00:00.000Z" }),
      );

      expect((await session.read("https://acme.com/history", "security_incidents")).ok).toBe(true);
      expect(session.snapshot().ledger).toHaveLength(1);
    });

    it("answers a second read of the same URL with already_read, using no budget and changing nothing", async () => {
      const { session, readPage } = setup();
      await session.read("https://acme.com/trust", "certifications");
      const before = session.snapshot();
      const budget = session.budget();

      expect(await session.read("https://acme.com/trust#soc2", "ai_specific")).toEqual({
        ok: false,
        reason: "already_read",
      });
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget()).toEqual(budget);
      expect(session.snapshot()).toEqual(before);
    });
  });

  describe("read: a part of a long page", () => {
    const URL_OF_POLICY = "https://acme.com/policy";
    /** About 40,000 characters in 30 paragraphs: five parts of a window each. */
    const LONG = Array.from({ length: 30 }, (_, n) =>
      `Paragraph ${n + 1} ${"clause ".repeat(190)}`.trim(),
    ).join("\n\n");
    const PARTS = pageParts(LONG);

    /** A session whose reader answers the policy with the long text. */
    function withLongPolicy(options: Setup = {}) {
      const made = setup(options);
      made.readPage.mockImplementation(async (url) =>
        page(url, { text: url === URL_OF_POLICY ? LONG : `Text of ${url}`, title: "Policy" }),
      );
      return made;
    }

    const ask = (session: ReturnType<typeof setup>["session"], part: number, url = URL_OF_POLICY) =>
      session.readMany([{ url, category: "certifications", part }]).then(([read]) => read.outcome);

    it("says how many parts a long page has, and nothing of the kind for a page that fits", async () => {
      const { session } = withLongPolicy();

      const long = await session.read(URL_OF_POLICY, "certifications");
      const short = await session.read("https://acme.com/short", "certifications");

      expect(PARTS.length).toBeGreaterThan(3);
      expect(long).toMatchObject({ ok: true, page: { truncated: true, parts: PARTS.length } });
      expect(long.ok && "part" in long.page).toBe(false);
      expect(short.ok && "parts" in short.page).toBe(false);
    });

    it("shows the part that is asked for, from the page it already has: no new request, no read of the budget, no call", async () => {
      const { session, readPage } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");
      const budget = session.budget();
      const callsBefore = session.snapshot().calls.length;

      const outcome = await ask(session, 2);

      expect(outcome).toEqual({
        ok: true,
        page: {
          url: URL_OF_POLICY,
          title: "Policy",
          publishedAt: null,
          excerpt: PARTS[1],
          truncated: true,
          links: [],
          part: 2,
          parts: PARTS.length,
        },
      });
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget()).toEqual(budget);
      expect(session.snapshot().calls).toHaveLength(callsBefore);
      expect(session.snapshot().pagesRead).toBe(1);
    });

    it("says that the last part is the last", async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");

      const outcome = await ask(session, PARTS.length);

      expect(outcome).toMatchObject({
        ok: true,
        page: { excerpt: PARTS[PARTS.length - 1], part: PARTS.length, truncated: false },
      });
    });

    it("keeps the part in the source of the page, behind the gap marker, in the order it was read", async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");
      const first = session.snapshot().ledger.find((entry) => entry.url === URL_OF_POLICY);

      await ask(session, 4);
      await ask(session, 2);

      const entry = session.snapshot().ledger.find((kept) => kept.url === URL_OF_POLICY);
      expect(entry).toEqual({
        ...first,
        content: [first?.content, PARTS[3], PARTS[1]].join(EXCERPT_GAP),
      });
    });

    it(`keeps at most ${MAX_EXTRA_PARTS} parts besides the first excerpt: the next is refused and added to nothing`, async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");
      await ask(session, 2);
      await ask(session, 3);
      const kept = session.snapshot().ledger.find((entry) => entry.url === URL_OF_POLICY);

      expect(await ask(session, 4)).toEqual({ ok: false, reason: "parts_limit" });

      expect(session.snapshot().ledger.find((entry) => entry.url === URL_OF_POLICY)).toEqual(kept);
    });

    it("refuses a part beyond the last, and says how many there are", async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");

      expect(await ask(session, PARTS.length + 1)).toEqual({
        ok: false,
        reason: "no_such_part",
        parts: PARTS.length,
      });
      // A refusal keeps no part: the places for parts are still free.
      expect(await ask(session, 2)).toMatchObject({ ok: true });
      expect(await ask(session, 3)).toMatchObject({ ok: true });
    });

    it("does not show a part a second time", async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");
      await ask(session, 2);

      expect(await ask(session, 2)).toEqual({ ok: false, reason: "already_read" });
    });

    it("reads a page that is not read yet as usual, whatever part is asked for, and then has the parts", async () => {
      const { session, readPage } = withLongPolicy();

      const first = await ask(session, 3);

      expect(first).toMatchObject({ ok: true, page: { truncated: true, parts: PARTS.length } });
      expect(first.ok && "part" in first.page).toBe(false);
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(await ask(session, 3)).toMatchObject({ ok: true, page: { part: 3 } });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("refuses a part of a page that fits in one, as the page that was already read", async () => {
      const { session } = withLongPolicy();
      await session.read("https://acme.com/short", "certifications");

      expect(await ask(session, 1, "https://acme.com/short")).toEqual({
        ok: false,
        reason: "already_read",
      });
    });

    it("does not read a page twice in one call to ask for its parts: the page is not there yet", async () => {
      const { session, readPage } = withLongPolicy();

      const results = await session.readMany([
        { url: URL_OF_POLICY, category: "certifications" },
        { url: URL_OF_POLICY, category: "certifications", part: 2 },
      ]);

      expect(results.map((result) => result.outcome.ok)).toEqual([true, false]);
      expect(results[1].outcome).toEqual({ ok: false, reason: "already_read" });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("answers the parts asked for in one call in order, and applies the limit in that order", async () => {
      const { session } = withLongPolicy();
      await session.read(URL_OF_POLICY, "certifications");

      const results = await session.readMany(
        [2, 3, 4].map((part) => ({ url: URL_OF_POLICY, category: "certifications", part })),
      );

      expect(results.map((result) => result.outcome)).toEqual([
        expect.objectContaining({ ok: true, page: expect.objectContaining({ part: 2 }) }),
        expect.objectContaining({ ok: true, page: expect.objectContaining({ part: 3 }) }),
        { ok: false, reason: "parts_limit" },
      ]);
    });

    it("finds the page under the address it was asked for and under the address it claims for itself", async () => {
      const { session, readPage } = setup();
      // The asked address has a slash at the end; the page claims the one without it.
      readPage.mockImplementation(async (url) =>
        page(url, { text: LONG, canonicalUrl: "https://acme.com/policy" }),
      );
      await session.read("https://acme.com/policy/", "certifications");

      expect(await ask(session, 2, "https://acme.com/policy/")).toMatchObject({ ok: true });
      expect(await ask(session, 3, "https://acme.com/policy")).toMatchObject({ ok: true });
    });

    it("works through a pool, and takes nothing from the pool's budget", async () => {
      const { session } = withLongPolicy();
      const pool = session.pool({ searches: 1, reads: 1 });
      await pool.read(URL_OF_POLICY, "certifications");
      expect(pool.budget().readsLeft).toBe(0);

      const [read] = await pool.readMany([
        { url: URL_OF_POLICY, category: "certifications", part: 2 },
      ]);

      expect(read.outcome).toMatchObject({ ok: true, page: { part: 2 } });
      expect(pool.budget().readsLeft).toBe(0);
    });

    it("lets a pool of another loop ask for the parts of a page that the first loop read", async () => {
      const { session } = withLongPolicy();
      const other = session.pool({ searches: 1, reads: 1 });
      await session.read(URL_OF_POLICY, "certifications");

      const [read] = await other.readMany([
        { url: URL_OF_POLICY, category: "certifications", part: 2 },
      ]);

      expect(read.outcome).toMatchObject({ ok: true, page: { part: 2 } });
    });
  });

  describe("read: failures", () => {
    it.each([
      "blocked_by_robots",
      "blocked_by_site",
      "not_found",
      "unsupported_type",
      "needs_javascript",
      "unreachable",
    ] as const)("returns %s and records the call as not answered", async (reason) => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError(reason));

      expect(await session.read("https://acme.com/trust", "certifications")).toEqual({
        ok: false,
        reason,
      });
      expect(session.snapshot().calls).toEqual([
        { category: "certifications", tool: "read", answered: false, failure: reason },
      ]);
      expect(session.snapshot().ledger).toEqual([]);
      expect(session.snapshot().pagesRead).toBe(0);
      // A read that failed gave its unit back: it added nothing to the evidence.
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("records a read that fails while its signal is live as not answered", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("unreachable"));
      const controller = new AbortController();

      expect(
        await session.read(
          "https://acme.com/trust",
          "certifications",
          undefined,
          controller.signal,
        ),
      ).toEqual({ ok: false, reason: "unreachable" });
      expect(session.snapshot().calls).toEqual([
        { category: "certifications", tool: "read", answered: false, failure: "unreachable" },
      ]);
    });

    it("does not record a read that failed because its signal aborted: the time ran out, not the web", async () => {
      const { session, readPage } = setup();
      // Like the reader, which fails a read whose signal aborts as unreachable.
      readPage.mockImplementationOnce(
        (_url, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(new PageReadError("unreachable")), {
              once: true,
            });
          }),
      );
      const controller = new AbortController();

      const pending = session.read(
        "https://acme.com/trust",
        "certifications",
        undefined,
        controller.signal,
      );
      controller.abort();

      expect(await pending).toEqual({ ok: false, reason: "unreachable" });
      expect(session.snapshot().calls).toEqual([]);
      expect(session.snapshot().pagesRead).toBe(0);
      expect(session.snapshot().ledger).toEqual([]);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
    });

    it("may read a page again after a read of it failed", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("unreachable"));
      await session.read("https://acme.com/trust", "certifications");

      expect((await session.read("https://acme.com/trust", "certifications")).ok).toBe(true);
      expect(readPage).toHaveBeenCalledTimes(2);
    });

    it("lets an error of the reader that is not a PageReadError through and records no call", async () => {
      const bug = new TypeError("Cannot read properties of undefined");
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(bug);

      await expect(session.read("https://acme.com/trust", "certifications")).rejects.toBe(bug);
      expect(session.snapshot().calls).toEqual([]);
      expect(session.snapshot().ledger).toEqual([]);
    });

    it("returns a redirect to an address that is not public as not_allowed and does not record it", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("not_allowed"));

      expect(await session.read("https://acme.com/go", "certifications")).toEqual({
        ok: false,
        reason: "not_allowed",
      });
      expect(session.snapshot().calls).toEqual([]);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("leaves out a page older than the cutoff and removes the snippet of its URL", async () => {
      const undated = result("https://news.example/undated");
      const other = result("https://news.example/other");
      const { session, readPage } = setup({
        answers: [[undated, other]],
        cutoffs: { security_incidents: CUTOFF },
      });
      readPage.mockResolvedValueOnce(
        page(undated.url, { publishedAt: "2029-01-02T00:00:00.000Z" }),
      );
      await session.search("Acme breach", "news", "security_incidents");

      expect(await session.read(undated.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2029-01-02T00:00:00.000Z",
      });
      const snapshot = session.snapshot();
      expect(snapshot.calls[1]).toEqual({
        category: "security_incidents",
        tool: "read",
        answered: true,
        failure: null,
      });
      expect(snapshot.ledger).toEqual([resultEntry("security_incidents", other)]);
      expect(snapshot.pagesRead).toBe(1);

      expect(await session.read(undated.url, "legal_regulatory")).toEqual({
        ok: false,
        reason: "already_read",
      });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("holds a later search result of a page that was too old to the page's own date", async () => {
      const undated = result("https://news.example/undated");
      const { session, readPage } = setup({
        answers: [[undated], [undated], [undated]],
        cutoffs: { security_incidents: CUTOFF, legal_regulatory: "2028-04-20" },
      });
      readPage.mockResolvedValueOnce(
        page(undated.url, { publishedAt: "2029-01-02T00:00:00.000Z" }),
      );
      await session.search("Acme breach", "news", "security_incidents");
      await session.read(undated.url, "security_incidents");

      expect(await session.search("Acme incident report", "news", "security_incidents")).toEqual({
        ok: true,
        results: [],
        omitted: { old: 1 },
      });
      expect(session.snapshot().ledger).toEqual([]);
      // Within the 36 months of legal_regulatory, the same source may be used there.
      expect(await session.search("Acme lawsuit", "news", "legal_regulatory")).toEqual({
        ok: true,
        results: [undated],
        omitted: {},
      });
    });

    it("holds a page of the vendor's domain that redirected away and was too old to its date in later searches", async () => {
      const { session, readPage } = setup({
        answers: [[result("https://acme.com/blog")]],
        cutoffs: { security_incidents: CUTOFF },
      });
      readPage.mockResolvedValueOnce(
        page("https://blog-host.example/post", { publishedAt: "2020-01-01T00:00:00.000Z" }),
      );
      await session.read("https://acme.com/blog", "security_incidents");

      expect(await session.search("Acme breach", "web", "security_incidents")).toEqual({
        ok: true,
        results: [],
        omitted: { old: 1 },
      });
    });
  });

  describe("read: a read that failed", () => {
    const NOT_TRANSIENT = [
      "blocked_by_robots",
      "blocked_by_site",
      "not_found",
      "unsupported_type",
      "needs_javascript",
    ] as const;

    it("gives its unit back, so a site that refuses us does not use up the reads", async () => {
      const { session, readPage } = setup();
      for (let n = 0; n < 4; n += 1) {
        readPage.mockRejectedValueOnce(new PageReadError("blocked_by_site"));
        await session.read(`https://acme.com/page-${n}`, "certifications");
      }
      await session.read("https://acme.com/fine", "certifications");

      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
      expect(session.snapshot().calls.filter((call) => !call.answered)).toHaveLength(4);
    });

    it("gives back at most six units in a run, and keeps the unit of the failures after them", async () => {
      const { session, readPage } = setup();
      for (let n = 0; n < 9; n += 1) {
        readPage.mockRejectedValueOnce(new PageReadError("not_found"));
        await session.read(`https://acme.com/page-${n}`, "certifications");
      }

      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 3);
    });

    it("keeps the unit of a read that the run's own clock cut off", async () => {
      const { session, readPage } = setup();
      const controller = new AbortController();
      readPage.mockImplementationOnce(async () => {
        controller.abort();
        throw new PageReadError("unreachable");
      });

      await session.read("https://acme.com/trust", "certifications", undefined, controller.signal);

      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
    });

    it.each(NOT_TRANSIENT)("does not try a page again that failed with %s", async (reason) => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError(reason));
      await session.read("https://acme.com/trust", "certifications");
      const left = session.budget().readsLeft;

      expect(await session.read("https://acme.com/trust", "certifications")).toEqual({
        ok: false,
        reason: "already_failed",
      });

      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget().readsLeft).toBe(left);
      expect(session.snapshot().calls).toHaveLength(1);
    });

    it("does not try a page again that the address policy refused", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("not_allowed"));
      await session.read("https://acme.com/go", "certifications");

      expect(await session.read("https://acme.com/go", "certifications")).toEqual({
        ok: false,
        reason: "already_failed",
      });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("tries a page again that did not answer, since a site that is down can come back", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("unreachable"));
      await session.read("https://acme.com/trust", "certifications");

      expect((await session.read("https://acme.com/trust", "certifications")).ok).toBe(true);
      expect(readPage).toHaveBeenCalledTimes(2);
    });

    it("remembers a failure under the canonical address, whatever the spelling asked for", async () => {
      const { session, readPage } = setup();
      readPage.mockRejectedValueOnce(new PageReadError("not_found"));
      await session.read("https://acme.com/trust?utm_source=mail", "certifications");

      expect(await session.read("https://acme.com/trust", "certifications")).toEqual({
        ok: false,
        reason: "already_failed",
      });
    });

    it("does not remember a failure that the run's own clock caused", async () => {
      const { session, readPage } = setup();
      const controller = new AbortController();
      readPage.mockImplementationOnce(async () => {
        controller.abort();
        throw new PageReadError("not_found");
      });
      await session.read("https://acme.com/trust", "certifications", undefined, controller.signal);

      expect((await session.read("https://acme.com/trust", "certifications")).ok).toBe(true);
    });
  });

  describe("read: a source searched under one category and read under another", () => {
    // For a run on 2031-04-20: 24 months for security_incidents, 36 for legal_regulatory.
    const cutoffs = { security_incidents: CUTOFF, legal_regulatory: "2028-04-20" };

    it("holds the date of the search result to the cutoff of the read's category when the page has none", async () => {
      const x = result("https://news.example/x", "2028-06-01T00:00:00.000Z");
      const { session, readPage } = setup({ answers: [[x]], cutoffs });
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      expect(await session.read(x.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2028-06-01T00:00:00.000Z",
      });
      const snapshot = session.snapshot();
      expect(snapshot.calls[1]).toEqual({
        category: "security_incidents",
        tool: "read",
        answered: true,
        failure: null,
      });
      // Within the window of legal_regulatory, the result stays there as it was.
      expect(snapshot.ledger).toEqual([resultEntry("legal_regulatory", x)]);
      expect(await session.read(x.url, "legal_regulatory")).toEqual({
        ok: false,
        reason: "already_read",
      });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("reads a page whose own date is inside the window of the read's category, whatever the older date of the search result", async () => {
      const x = result("https://news.example/x", "2028-06-01T00:00:00.000Z");
      const { session, readPage } = setup({ answers: [[x]], cutoffs });
      readPage.mockResolvedValueOnce(page(x.url, { publishedAt: "2030-01-01T00:00:00.000Z" }));
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      const outcome = await session.read(x.url, "security_incidents");

      expect(outcome.ok).toBe(true);
      // The entry takes the page's date: the analysis holds the source to the window of its
      // category by this date, and the result's older date would put a source that the read
      // admitted outside that window.
      expect(session.snapshot().ledger).toEqual([
        {
          ...resultEntry("legal_regulatory", x),
          category: "security_incidents",
          kind: "page",
          content: `Text of ${x.url}`,
          publishedAt: "2030-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("gives the entry the page's date when the search result had none", async () => {
      const x = result("https://news.example/x");
      const { session, readPage } = setup({ answers: [[x]], cutoffs });
      readPage.mockResolvedValueOnce(page(x.url, { publishedAt: "2030-01-01T00:00:00.000Z" }));
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      expect((await session.read(x.url, "security_incidents")).ok).toBe(true);

      expect(session.snapshot().ledger).toEqual([
        {
          ...resultEntry("legal_regulatory", x),
          category: "security_incidents",
          kind: "page",
          content: `Text of ${x.url}`,
          publishedAt: "2030-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("leaves out a page by its own old date, not the newer date of the search result, and removes the snippet", async () => {
      const x = result("https://news.example/x", "2030-06-01T00:00:00.000Z");
      const { session, readPage } = setup({ answers: [[x]], cutoffs });
      readPage.mockResolvedValueOnce(page(x.url, { publishedAt: "2027-01-02T00:00:00.000Z" }));
      await session.search("Acme breach", "news", "security_incidents");

      expect(await session.read(x.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2027-01-02T00:00:00.000Z",
      });
      expect(session.snapshot().ledger).toEqual([]);
    });

    it("reads a page without a date when the date of the search result is inside the window of the read's category", async () => {
      const x = result("https://news.example/x", "2030-06-01T00:00:00.000Z");
      const { session } = setup({ answers: [[x]], cutoffs });
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      expect((await session.read(x.url, "security_incidents")).ok).toBe(true);

      expect(session.snapshot().ledger).toEqual([
        {
          ...resultEntry("legal_regulatory", x),
          category: "security_incidents",
          kind: "page",
          content: `Text of ${x.url}`,
        },
      ]);
    });

    it("removes the snippet only when the page is outside the window of the category it was kept under", async () => {
      const recent = result("https://news.example/recent");
      const ancient = result("https://news.example/ancient");
      const { session, readPage } = setup({ answers: [[recent, ancient]], cutoffs });
      // 30 months old: too old for security_incidents, within legal_regulatory. Then too old for both.
      readPage.mockResolvedValueOnce(page(recent.url, { publishedAt: "2028-10-20T00:00:00.000Z" }));
      readPage.mockResolvedValueOnce(
        page(ancient.url, { publishedAt: "2027-01-02T00:00:00.000Z" }),
      );
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      expect(await session.read(recent.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2028-10-20T00:00:00.000Z",
      });
      expect(await session.read(ancient.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2027-01-02T00:00:00.000Z",
      });
      expect(session.snapshot().ledger).toEqual([resultEntry("legal_regulatory", recent)]);
    });
  });

  describe("onVendorSite: whether a source is the vendor's own", () => {
    it.each([
      ["the domain itself", "https://acme.com/trust", true],
      ["a subdomain", "https://docs.acme.com/", true],
      ["a host in capitals", "https://TRUST.ACME.COM/", true],
      ["a host that only starts with the domain", "https://acme.com.evil.example/", false],
      ["a host that only ends with its letters", "https://notacme.com/", false],
      ["another site", "https://news.example/acme", false],
    ])("marks a search result on %s by its URL: %p", async (_label, url, own) => {
      const { session } = setup({ answers: [[result(url)]] });

      await session.search("Acme", "web", "certifications");

      expect(session.snapshot().ledger.map((entry) => entry.onVendorSite)).toEqual([own]);
    });

    it.each([
      ["answered on the vendor's domain", "https://acme.com/trust", "https://acme.com/trust", true],
      ["redirected within the vendor's domain", "https://acme.com/", "https://www.acme.com/", true],
      [
        "redirected off the vendor's domain",
        "https://acme.com/blog",
        "https://blog-host.example/post",
        false,
      ],
      [
        "sent off the vendor's domain by an open redirect",
        "https://acme.com/go?to=https://other.example/post",
        "https://other.example/post",
        false,
      ],
    ])("marks a page %s by the URL that answered: %p", async (_label, asked, answered, own) => {
      const { session, readPage } = setup();
      readPage.mockResolvedValueOnce(page(answered));

      expect((await session.read(asked, "certifications")).ok).toBe(true);

      expect(session.snapshot().ledger.map((entry) => entry.onVendorSite)).toEqual([own]);
    });

    it("takes the mark off a result on the vendor's domain when its page redirected off it", async () => {
      const blog = result("https://acme.com/blog");
      const { session, readPage } = setup({ answers: [[blog]] });
      readPage.mockResolvedValueOnce(page("https://blog-host.example/post"));
      await session.search("Acme blog", "web", "certifications");
      expect(session.snapshot().ledger).toEqual([resultEntry("certifications", blog, true)]);

      expect((await session.read(blog.url, "certifications")).ok).toBe(true);

      expect(session.snapshot().ledger).toEqual([
        {
          category: "certifications",
          kind: "page",
          onVendorSite: false,
          url: blog.url,
          title: blog.title,
          content: "Text of https://blog-host.example/post",
          publishedAt: null,
          // The page answered from there: the source is classified by it.
          answeredUrl: "https://blog-host.example/post",
        },
      ]);
    });

    describe("a URL on the vendor's domain whose page redirected off it and was too old", () => {
      // For a run on 2031-04-20: 24 months for security_incidents, 36 for legal_regulatory.
      const cutoffs = { security_incidents: CUTOFF, legal_regulatory: "2028-04-20" };
      /** Too old for security_incidents, within legal_regulatory. */
      const redirected = page("https://blog-host.example/post", {
        publishedAt: "2029-01-02T00:00:00.000Z",
      });

      it("takes the mark off the result that stays under another category", async () => {
        const blog = result("https://acme.com/blog");
        const { session, readPage } = setup({ answers: [[blog]], cutoffs });
        readPage.mockResolvedValueOnce(redirected);
        await session.search("Acme lawsuit", "web", "legal_regulatory");

        expect((await session.read(blog.url, "security_incidents")).ok).toBe(false);

        expect(session.snapshot().ledger).toEqual([resultEntry("legal_regulatory", blog, false)]);
      });

      it("does not mark a later search result of that URL", async () => {
        const blog = result("https://acme.com/blog");
        const { session, readPage } = setup({ answers: [[blog]], cutoffs });
        readPage.mockResolvedValueOnce(redirected);
        expect((await session.read(blog.url, "security_incidents")).ok).toBe(false);

        await session.search("Acme lawsuit", "web", "legal_regulatory");

        expect(session.snapshot().ledger).toEqual([resultEntry("legal_regulatory", blog, false)]);
      });
    });

    it("marks nothing as the vendor's own when the vendor has no domain", async () => {
      const trust = result("https://acme.com/trust");
      const { session } = setup({
        domain: null,
        answers: [[trust, result("https://docs.acme.com/")]],
      });
      await session.search("Acme", "web", "security_incidents");

      expect((await session.read(trust.url, "security_incidents")).ok).toBe(true);

      expect(session.snapshot().ledger.map((entry) => entry.onVendorSite)).toEqual([false, false]);
    });
  });

  describe("limits given as undefined", () => {
    it("keep their defaults field by field: 8 searches, 12 reads, 10 results", async () => {
      const { session } = setup({
        limits: { maxSearches: undefined, maxReads: undefined, maxResultsPerSearch: undefined },
        answers: [Array.from({ length: 12 }, (_, n) => result(`https://news.example/many-${n}`))],
      });

      expect(session.budget()).toEqual({ searchesLeft: 8, readsLeft: 12 });
      const first = await session.search("Acme breach", "news", "security_incidents");
      expect(first.ok && first.results).toHaveLength(10);
      for (let n = 1; n < 8; n += 1)
        await session.search(`Acme topic${n}`, "news", "security_incidents");
      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
      for (let n = 0; n < 12; n += 1) {
        expect((await session.read(`https://acme.com/page-${n}`, "certifications")).ok).toBe(true);
      }
      expect(await session.read("https://acme.com/page-12", "certifications")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
      expect(session.budget()).toEqual({ searchesLeft: 0, readsLeft: 0 });
    });

    it("leave the other limits as they were given", () => {
      const { session } = setup({ limits: { maxSearches: 3, maxReads: undefined } });

      expect(session.budget()).toEqual({ searchesLeft: 3, readsLeft: 12 });
    });
  });

  describe("read: budget", () => {
    it("refuses the thirteenth read", async () => {
      const { session, readPage } = setup();
      for (let n = 0; n < 12; n += 1) {
        expect((await session.read(`https://acme.com/page-${n}`, "certifications")).ok).toBe(true);
      }

      expect(await session.read("https://acme.com/page-12", "certifications")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
      expect(readPage).toHaveBeenCalledTimes(12);
      expect(session.budget().readsLeft).toBe(0);
    });

    it("lets exactly one of two reads at once run when one read is left", async () => {
      const { session, readPage } = setup({ limits: { maxReads: 1 } });

      const outcomes = await Promise.all([
        session.read("https://acme.com/one", "certifications"),
        session.read("https://acme.com/two", "certifications"),
      ]);

      expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false]);
      expect(outcomes[1]).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(readPage).toHaveBeenCalledTimes(1);
    });
  });

  describe("readMany: several reads in one call", () => {
    /** A promise that the test settles by hand. */
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }
    /** Lets everything that can run, run. */
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

    /** A reader that answers a URL only when the test says so; the test finds the URL's answer in `waiting`. */
    function manualReader(readPage: jest.Mock<Promise<FetchedPage>, [string, AbortSignal?]>) {
      const waiting = new Map<string, ReturnType<typeof deferred<FetchedPage>>>();
      readPage.mockImplementation((url) => {
        const entry = deferred<FetchedPage>();
        waiting.set(url, entry);
        return entry.promise;
      });
      return waiting;
    }

    const certify = (url: string) => ({ url, category: "certifications" as const });

    it("gives one outcome for each request, in the order of the requests, with the time it took", async () => {
      const { session } = setup();

      const results = await session.readMany([
        certify("https://acme.com/one"),
        certify("https://acme.com/two"),
      ]);

      expect(results.map((read) => read.outcome.ok && read.outcome.page.url)).toEqual([
        "https://acme.com/one",
        "https://acme.com/two",
      ]);
      for (const read of results) expect(read.ms).toBeGreaterThanOrEqual(0);
    });

    it("gives no outcome for no request, and reads nothing", async () => {
      const { session, readPage } = setup();

      expect(await session.readMany([])).toEqual([]);
      expect(readPage).not.toHaveBeenCalled();
    });

    it("starts every read before any of them answers", async () => {
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);

      const running = session.readMany([
        certify("https://acme.com/one"),
        certify("https://trust.acme.com/two"),
        { url: "https://status.acme.com/three", category: "ai_specific" },
      ]);
      await flush();

      expect(readPage).toHaveBeenCalledTimes(3);
      for (const [url, entry] of waiting) entry.resolve(page(url));
      expect((await running).every((read) => read.outcome.ok)).toBe(true);
    });

    it("runs at most two reads at once on one host, and starts the next as one is done", async () => {
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);
      const urls = ["a", "b", "c", "d"].map((name) => `https://acme.com/${name}`);

      const running = session.readMany(urls.map(certify));
      await flush();
      expect(readPage).toHaveBeenCalledTimes(2);

      waiting.get(urls[0])?.resolve(page(urls[0]));
      await flush();
      expect(readPage).toHaveBeenCalledTimes(3);

      waiting.get(urls[1])?.resolve(page(urls[1]));
      await flush();
      expect(readPage).toHaveBeenCalledTimes(4);

      waiting.get(urls[2])?.resolve(page(urls[2]));
      waiting.get(urls[3])?.resolve(page(urls[3]));
      const results = await running;
      expect(results.map((read) => read.outcome.ok && read.outcome.page.url)).toEqual(urls);
    });

    it("does not make a read on one host wait for the reads of another", async () => {
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);

      const running = session.readMany([
        certify("https://acme.com/a"),
        certify("https://acme.com/b"),
        certify("https://acme.com/c"),
        certify("https://trust.acme.com/d"),
      ]);
      await flush();

      // Two on acme.com, and the one on trust.acme.com, which is another host.
      expect(readPage.mock.calls.map(([url]) => url)).toEqual([
        "https://acme.com/a",
        "https://acme.com/b",
        "https://trust.acme.com/d",
      ]);
      for (const [url, entry] of waiting) entry.resolve(page(url));
      await flush();
      waiting.get("https://acme.com/c")?.resolve(page("https://acme.com/c"));
      await running;
    });

    it("puts the pages in the ledger in the order of the requests, whatever the order of the answers", async () => {
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);
      const urls = [
        "https://acme.com/one",
        "https://trust.acme.com/two",
        "https://status.acme.com/three",
      ];

      const running = session.readMany(urls.map(certify));
      await flush();
      for (const url of [...urls].reverse()) waiting.get(url)?.resolve(page(url));
      await running;

      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual(urls);
      expect(session.snapshot().calls.map((call) => call.tool)).toEqual(["read", "read", "read"]);
    });

    it("takes the budget in the order of the requests", async () => {
      const { session, readPage } = setup({ limits: { maxReads: 2 } });

      const results = await session.readMany([
        certify("https://acme.com/one"),
        certify("https://acme.com/two"),
        certify("https://acme.com/three"),
      ]);

      expect(results.map((read) => read.outcome.ok)).toEqual([true, true, false]);
      expect(results[2].outcome).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(readPage).toHaveBeenCalledTimes(2);
      expect(session.budget().readsLeft).toBe(0);
    });

    it("reads an address once in a call, whatever its spelling", async () => {
      const { session, readPage } = setup();

      const results = await session.readMany([
        certify("https://acme.com/trust"),
        certify("https://acme.com/trust?utm_source=mail"),
      ]);

      expect(results[0].outcome.ok).toBe(true);
      expect(results[1].outcome).toEqual({ ok: false, reason: "already_read" });
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
    });

    it("does not let two calls made at once read the same page", async () => {
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);
      const url = "https://acme.com/trust";

      const first = session.readMany([certify(url)]);
      const second = session.readMany([certify(url)]);
      await flush();
      waiting.get(url)?.resolve(page(url));

      expect((await first)[0].outcome.ok).toBe(true);
      expect((await second)[0].outcome).toEqual({ ok: false, reason: "already_read" });
      expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("refuses what the rules refuse before the web, in its place among the others", async () => {
      const { session, readPage } = setup();

      const results = await session.readMany([
        certify("https://acme.com/one"),
        certify("https://other.example/not-from-a-search"),
        certify("https://acme.com/two"),
      ]);

      expect(results.map((read) => read.outcome.ok)).toEqual([true, false, true]);
      expect(results[1].outcome).toEqual({ ok: false, reason: "not_from_search" });
      expect(results[1].ms).toBe(0);
      expect(readPage).toHaveBeenCalledTimes(2);
    });

    it("lets a read that fails settle as it does alone, and the others go on", async () => {
      const { session, readPage } = setup();
      readPage.mockImplementation(async (url) => {
        if (url.endsWith("/missing")) throw new PageReadError("not_found");
        return page(url);
      });

      const results = await session.readMany([
        certify("https://acme.com/one"),
        certify("https://acme.com/missing"),
        certify("https://acme.com/two"),
      ]);

      expect(results.map((read) => read.outcome.ok)).toEqual([true, false, true]);
      expect(results[1].outcome).toEqual({ ok: false, reason: "not_found" });
      // The failure gave its unit back, and the page is not tried again.
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 2);
      expect(session.snapshot().calls.map((call) => [call.answered, call.failure])).toEqual([
        [true, null],
        [false, "not_found"],
        [true, null],
      ]);
      expect(await session.read("https://acme.com/missing", "certifications")).toEqual({
        ok: false,
        reason: "already_failed",
      });
    });

    it("keeps the page of the first request when two pages have the same text, whichever answers first", async () => {
      const text =
        "Quanta Billing was sued in Delaware over plans that customers never ordered, and the court has not ruled yet.";
      const { session, readPage } = setup();
      const waiting = manualReader(readPage);
      const first = "https://acme.com/news-one";
      const second = "https://trust.acme.com/news-two";

      const running = session.readMany([certify(first), certify(second)]);
      await flush();
      waiting.get(second)?.resolve(page(second, { text }));
      waiting.get(first)?.resolve(page(first, { text }));
      const results = await running;

      expect(results[0].outcome.ok).toBe(true);
      expect(results[1].outcome).toEqual({ ok: false, reason: "same_text", sameAs: first });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([first]);
    });

    it("counts a failure that comes after the signal aborted as the clock's: the unit is kept, nothing is recorded or remembered", async () => {
      const { session, readPage } = setup();
      const controller = new AbortController();
      let slowCalls = 0;
      readPage.mockImplementation(async (url) => {
        slowCalls += url.endsWith("/slow") ? 1 : 0;
        // Only the first try is cut off: the page is not remembered as failed, so a second works.
        if (!url.endsWith("/slow") || slowCalls > 1) return page(url);
        controller.abort();
        throw new PageReadError("unreachable");
      });

      const results = await session.readMany(
        [certify("https://acme.com/slow"), certify("https://trust.acme.com/fine")],
        controller.signal,
      );

      expect(results.map((read) => read.outcome.ok)).toEqual([false, true]);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 2);
      expect(session.snapshot().calls).toEqual([
        { category: "certifications", tool: "read", answered: true, failure: null },
      ]);
      expect((await session.read("https://acme.com/slow", "certifications")).ok).toBe(true);
    });

    it("rejects with the error of a reader that fails for another reason than a page, once the other reads are done", async () => {
      const { session, readPage } = setup();
      readPage.mockImplementation(async (url) => {
        if (url.endsWith("/bug")) throw new Error("a bug in the reader");
        return page(url);
      });

      await expect(
        session.readMany([
          certify("https://acme.com/one"),
          certify("https://acme.com/bug"),
          certify("https://trust.acme.com/two"),
        ]),
      ).rejects.toThrow("a bug in the reader");
      expect(readPage).toHaveBeenCalledTimes(3);
    });
  });

  describe("the code's own budget", () => {
    it("keeps the calls of the code apart from the model's budget, and counts them in the totals", async () => {
      const { session } = setup();

      session.setCodeBudget({ searches: 2, reads: 3 });
      await session.searchMany(
        [
          { query: "Acme breach", kind: "news", category: "security_incidents", by: "code" },
          { query: "Acme lawsuit", kind: "news", category: "legal_regulatory", by: "code" },
        ],
        undefined,
      );
      await session.readMany(
        ["a", "b", "c"].map((name) => ({
          url: `https://acme.com/${name}`,
          category: "certifications" as const,
          by: "code" as const,
        })),
      );

      expect(session.budget()).toEqual({
        searchesLeft: SESSION_LIMITS.maxSearches,
        readsLeft: SESSION_LIMITS.maxReads,
      });
      expect(session.snapshot().searchesUsed).toBe(2);
      expect(session.snapshot().pagesRead).toBe(3);
    });

    it("refuses a call of the code once the budget set aside for it is spent, and the model's budget is not used instead", async () => {
      const { session, readPage } = setup();
      session.setCodeBudget({ reads: 1 });

      const results = await session.readMany([
        { url: "https://acme.com/a", category: "certifications", by: "code" },
        { url: "https://acme.com/b", category: "certifications", by: "code" },
      ]);

      expect(results.map((read) => read.outcome.ok)).toEqual([true, false]);
      expect(results[1].outcome).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("refuses a call of the code when nothing was set aside", async () => {
      const { session } = setup();

      expect(
        (
          await session.readMany([
            { url: "https://acme.com/a", category: "certifications", by: "code" },
          ])
        )[0].outcome,
      ).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(
        (
          await session.searchMany([
            { query: "Acme breach", kind: "news", category: "security_incidents", by: "code" },
          ])
        )[0].outcome,
      ).toEqual({ ok: false, reason: "budget_exhausted" });
    });

    it("gives nothing back for a read of the code that failed, so that the refunds stay the model's", async () => {
      const { session, readPage } = setup();
      session.setCodeBudget({ reads: 8 });
      readPage.mockRejectedValue(new PageReadError("not_found"));

      for (let n = 0; n < 8; n += 1) {
        await session.readMany([
          { url: `https://acme.com/missing-${n}`, category: "certifications", by: "code" },
        ]);
      }
      readPage.mockImplementation(async (url) => page(url));
      await session.read("https://acme.com/model-1", "certifications");
      readPage.mockRejectedValueOnce(new PageReadError("not_found"));
      await session.read("https://acme.com/model-2", "certifications");

      // The model's failed read still found its refund: the code's failures did not use them up.
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
    });

    it("adds up what is set aside, and ignores a grant that is not a count of at least one", async () => {
      const { session } = setup();

      session.setCodeBudget({ reads: 1 });
      session.setCodeBudget({ reads: 1, searches: -3 });
      session.setCodeBudget({ reads: 0.9 });
      session.setCodeBudget({ reads: Number.NaN });
      session.setCodeBudget({});
      const results = await session.readMany(
        ["a", "b", "c"].map((name) => ({
          url: `https://acme.com/${name}`,
          category: "certifications" as const,
          by: "code" as const,
        })),
      );

      expect(results.map((read) => read.outcome.ok)).toEqual([true, true, false]);
    });
  });

  describe("pool: a budget of its own for one of several loops that run at once", () => {
    it("has the budget it was given, and no other: the model's and the other pools' are untouched", async () => {
      const { session } = setup();
      const security = session.pool({ searches: 1, reads: 1 });
      const legal = session.pool({ searches: 2, reads: 2 });

      const first = await security.search("Acme breach", "news", "security_incidents");
      const second = await security.search("Acme incident", "news", "security_incidents");
      const third = await legal.search("Acme lawsuit", "news", "legal_regulatory");

      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(third.ok).toBe(true);
      expect(security.budget()).toEqual({ searchesLeft: 0, readsLeft: 1 });
      expect(legal.budget()).toEqual({ searchesLeft: 1, readsLeft: 2 });
      expect(session.budget()).toEqual({
        searchesLeft: SESSION_LIMITS.maxSearches,
        readsLeft: SESSION_LIMITS.maxReads,
      });
    });

    it("pays a read from its own reads, and refuses one when they are spent", async () => {
      const { session, readPage } = setup();
      const pool = session.pool({ searches: 0, reads: 1 });

      const results = await Promise.all([
        pool.read("https://acme.com/a", "certifications"),
        pool.read("https://acme.com/b", "certifications"),
      ]);

      expect(results.map((read) => read.ok)).toEqual([true, false]);
      expect(results[1]).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(readPage).toHaveBeenCalledTimes(1);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("shares the ledger, the provenance and the records with the session and the other pools", async () => {
      const { session } = setup({ answers: [[result("https://news.example/a")]] });
      const security = session.pool({ searches: 1, reads: 0 });
      const legal = session.pool({ searches: 0, reads: 1 });

      await security.search("Acme breach", "news", "security_incidents");
      // A page that a search of another pool returned may be read: it is a result of the run.
      const read = await legal.read("https://news.example/a", "legal_regulatory");

      expect(read.ok).toBe(true);
      expect(session.snapshot().ledger.map((entry) => [entry.kind, entry.url])).toEqual([
        ["page", "https://news.example/a"],
      ]);
      expect(session.snapshot().calls.map((call) => [call.category, call.tool])).toEqual([
        ["security_incidents", "search"],
        ["legal_regulatory", "read"],
      ]);
    });

    it("counts the searches of every pool in the totals, and the pages", async () => {
      const { session } = setup();
      const one = session.pool({ searches: 2, reads: 1 });
      const two = session.pool({ searches: 1, reads: 1 });

      await one.searchMany([
        { query: "Acme breach", kind: "news", category: "security_incidents" },
        { query: "Acme ransomware", kind: "news", category: "security_incidents" },
      ]);
      await two.search("Acme lawsuit", "news", "legal_regulatory");
      await one.read("https://acme.com/a", "certifications");
      await two.read("https://acme.com/b", "ai_specific");

      expect(session.snapshot().searchesUsed).toBe(3);
      expect(session.snapshot().pagesRead).toBe(2);
    });

    it("does not let two pools that ask at once take each other's units, nor the same page twice", async () => {
      const { session, readPage } = setup();
      const one = session.pool({ searches: 0, reads: 1 });
      const two = session.pool({ searches: 0, reads: 1 });

      const [first, second, third] = await Promise.all([
        one.read("https://acme.com/same", "certifications"),
        two.read("https://acme.com/same", "ai_specific"),
        two.read("https://acme.com/other", "ai_specific"),
      ]);

      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, reason: "already_read" });
      expect(third.ok).toBe(true);
      expect(readPage).toHaveBeenCalledTimes(2);
    });

    it("refuses a query that another pool is asking or asked, without using its budget", async () => {
      const { session } = setup();
      const one = session.pool({ searches: 1, reads: 0 });
      const two = session.pool({ searches: 1, reads: 0 });

      const [first, second] = await Promise.all([
        one.search("Acme data breach", "news", "security_incidents"),
        two.search("Acme data breach", "news", "legal_regulatory"),
      ]);

      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, reason: "repeated_query" });
      expect(two.budget().searchesLeft).toBe(1);
    });

    it("gives a failed read back to its pool, a limited number of times, and not to the model", async () => {
      const { session, readPage } = setup();
      const pool = session.pool({ searches: 0, reads: 4 });
      readPage.mockRejectedValue(new PageReadError("unreachable"));

      for (let n = 0; n < 4; n += 1) await pool.read(`https://acme.com/down-${n}`, "ai_specific");

      // Half of the reads of a pool, two of four, come back; the others were spent.
      expect(pool.budget().readsLeft).toBe(2);
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("gives a read of a page with a text the category already had back, once for a pool of up to four reads", async () => {
      const { session, readPage } = setup();
      const pool = session.pool({ searches: 0, reads: 4 });
      readPage.mockImplementation(async (url) =>
        page(url, { text: "The same long text. ".repeat(10) }),
      );

      await pool.read("https://acme.com/one", "certifications");
      const again = await pool.read("https://acme.com/two", "certifications");
      const third = await pool.read("https://acme.com/three", "certifications");

      expect(again).toMatchObject({ ok: false, reason: "same_text" });
      expect(third).toMatchObject({ ok: false, reason: "same_text" });
      // Two copies were read; only the first was given back.
      expect(pool.budget().readsLeft).toBe(4 - 1 - 1);
    });

    it("sets aside the code's budget of the session when the code asks through a pool", async () => {
      const { session } = setup();
      const pool = session.pool({ searches: 0, reads: 0 });

      pool.setCodeBudget({ reads: 1 });
      const results = await session.readMany([
        { url: "https://acme.com/x", category: "certifications", by: "code" },
        { url: "https://acme.com/y", category: "certifications", by: "code" },
      ]);

      expect(results.map((read) => read.outcome.ok)).toEqual([true, false]);
      expect(pool.budget()).toEqual({ searchesLeft: 0, readsLeft: 0 });
    });
  });

  describe("searchMany: several searches in one call", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    const news = (query: string, category: Category = "security_incidents") => ({
      query,
      kind: "news" as const,
      category,
    });

    it("gives one outcome for each request, in the order of the requests, with the time it took", async () => {
      const first = [result("https://news.example/a")];
      const second = [result("https://law.example/b")];
      const { session } = setup({ answers: [first, second] });

      const results = await session.searchMany([
        news("Acme data breach"),
        news("Acme lawsuit", "legal_regulatory"),
      ]);

      expect(results.map((entry) => entry.outcome)).toEqual([
        { ok: true, results: first, omitted: {} },
        { ok: true, results: second, omitted: {} },
      ]);
      for (const entry of results) expect(entry.ms).toBeGreaterThanOrEqual(0);
    });

    it("starts the searches together, and puts the results in the ledger in the order of the requests", async () => {
      const { session, search } = setup();
      const waiting: Array<ReturnType<typeof deferred<SearchResult[]>>> = [];
      search.mockImplementation(() => {
        const entry = deferred<SearchResult[]>();
        waiting.push(entry);
        return entry.promise;
      });
      const a = result("https://news.example/a");
      const b = result("https://law.example/b");

      const running = session.searchMany([
        news("Acme data breach"),
        news("Acme lawsuit", "legal_regulatory"),
      ]);
      await flush();
      expect(search).toHaveBeenCalledTimes(2);
      // The second search answers first.
      waiting[1].resolve([b]);
      waiting[0].resolve([a]);
      await running;

      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([a.url, b.url]);
      expect(session.snapshot().calls.map((call) => call.category)).toEqual([
        "security_incidents",
        "legal_regulatory",
      ]);
    });

    it("takes the budget in the order of the requests", async () => {
      const { session, search } = setup({ limits: { maxSearches: 1 } });

      const results = await session.searchMany([news("Acme data breach"), news("Acme lawsuit")]);

      expect(results[0].outcome.ok).toBe(true);
      expect(results[1].outcome).toEqual({ ok: false, reason: "budget_exhausted" });
      expect(search).toHaveBeenCalledTimes(1);
    });

    it("answers a query that repeats an earlier request of the same call as a repeat, without budget", async () => {
      const { session, search } = setup();

      const results = await session.searchMany([
        news("Acme data breach"),
        news("data breach Acme"),
      ]);

      expect(results[1].outcome).toEqual({ ok: false, reason: "repeated_query" });
      expect(results[1].ms).toBe(0);
      expect(search).toHaveBeenCalledTimes(1);
      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 1);
    });

    it("does not let two calls made at once ask the same question", async () => {
      const { session, search } = setup();
      const waiting = deferred<SearchResult[]>();
      search.mockImplementation(() => waiting.promise);

      const first = session.searchMany([news("Acme data breach")]);
      const second = session.searchMany([news("Acme data breach")]);
      await flush();
      waiting.resolve([]);

      expect((await first)[0].outcome.ok).toBe(true);
      expect((await second)[0].outcome).toEqual({ ok: false, reason: "repeated_query" });
      expect(search).toHaveBeenCalledTimes(1);
    });

    it("lets a search that fails settle as it does alone, and the others go on", async () => {
      const ok = [result("https://news.example/a")];
      const { session } = setup({ answers: [new SearchEngineError(), ok] });

      const results = await session.searchMany([
        news("Acme data breach"),
        news("Acme lawsuit", "legal_regulatory"),
      ]);

      expect(results[0].outcome).toEqual({ ok: false, reason: "search_unavailable" });
      expect(results[1].outcome.ok).toBe(true);
      expect(session.snapshot().calls).toEqual([
        {
          category: "security_incidents",
          tool: "search",
          answered: false,
          failure: "search_unavailable",
        },
        { category: "legal_regulatory", tool: "search", answered: true, failure: null },
      ]);
      // A failed search is not an answer, so the same words can be asked again.
      expect(session.budget().searchesLeft).toBe(SESSION_LIMITS.maxSearches - 2);
    });

    it("rejects with the error of an engine that fails for another reason than a failed search, once the other searches are done", async () => {
      const { session, search } = setup();
      search.mockImplementation(async (query) => {
        if (query.includes("bug")) throw new Error("a bug in the engine");
        return [];
      });

      await expect(
        session.searchMany([news("Acme data breach"), news("Acme bug"), news("Acme lawsuit")]),
      ).rejects.toThrow("a bug in the engine");
      expect(search).toHaveBeenCalledTimes(3);
    });
  });

  describe("one entry for one page", () => {
    const LONG_TEXT =
      "Quanta Billing was sued in Delaware over plans that customers never ordered, and the court has not ruled yet.";

    it("keeps one entry for the addresses that differ only in tracking parameters, and shows the model the clean one", async () => {
      const { session } = setup({
        answers: [
          [
            result("https://news.example/story"),
            result("https://news.example/story?utm_source=newsletter&fbclid=abc"),
          ],
        ],
      });

      const outcome = await session.search("Acme breach", "news", "security_incidents");

      expect(outcome).toEqual({
        ok: true,
        results: [result("https://news.example/story")],
        omitted: {},
      });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
        "https://news.example/story",
      ]);
    });

    it("shows the clean address even when the tracked one comes first", async () => {
      const { session } = setup({
        answers: [[result("https://news.example/story?utm_medium=email")]],
      });

      const outcome = await session.search("Acme breach", "news", "security_incidents");

      expect(outcome.ok && outcome.results.map((found) => found.url)).toEqual([
        "https://news.example/story",
      ]);
    });

    it("lets a read name any spelling of an address that a search returned, and reads the clean one", async () => {
      const { session, readPage } = setup({ answers: [[result("https://news.example/story")]] });
      await session.search("Acme breach", "news", "security_incidents");

      const outcome = await session.read(
        "https://news.example/story?utm_source=x#top",
        "security_incidents",
      );

      expect(outcome.ok).toBe(true);
      expect(readPage).toHaveBeenCalledWith("https://news.example/story", undefined);
    });

    it("leaves out a result whose address ends in a quotation mark, and counts it", async () => {
      const { session } = setup({
        answers: [
          [result("https://platform.acme.example/%E2%80%9D"), result("https://news.example/story")],
        ],
      });

      const outcome = await session.search("Acme breach", "news", "security_incidents");

      expect(outcome).toEqual({
        ok: true,
        results: [result("https://news.example/story")],
        omitted: { bad_address: 1 },
      });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
        "https://news.example/story",
      ]);
    });

    it("answers a read of an address that ends in a quotation mark with bad_address, using no read and no request", async () => {
      const { session, readPage } = setup();

      const outcome = await session.read("https://platform.acme.com/%E2%80%9D", "ai_specific");

      expect(outcome).toEqual({ ok: false, reason: "bad_address" });
      expect(readPage).not.toHaveBeenCalled();
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
      expect(session.snapshot().calls).toEqual([]);
    });

    describe("the address a page claims for itself", () => {
      const claim = (canonicalUrl: string | null) => (url: string) =>
        Promise.resolve(page(url, { canonicalUrl, text: LONG_TEXT }));

      it("moves the entry to the claimed address when it is the same document, and shows that address", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/story/amp")]],
        });
        readPage.mockImplementation(claim("https://news.example/story"));
        await session.search("Acme breach", "news", "security_incidents");

        const outcome = await session.read("https://news.example/story/amp", "security_incidents");

        expect(outcome).toMatchObject({ ok: true, page: { url: "https://news.example/story" } });
        expect(session.snapshot().ledger).toEqual([
          {
            category: "security_incidents",
            kind: "page",
            onVendorSite: false,
            url: "https://news.example/story",
            title: "Title of https://news.example/story/amp",
            content: LONG_TEXT,
            publishedAt: null,
          },
        ]);
      });

      it("answers a later read of either address as already read", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/story/amp")]],
        });
        readPage.mockImplementation(claim("https://news.example/story"));
        await session.search("Acme breach", "news", "security_incidents");
        await session.read("https://news.example/story/amp", "security_incidents");

        for (const url of ["https://news.example/story", "https://news.example/story/amp"]) {
          expect(await session.read(url, "security_incidents")).toEqual({
            ok: false,
            reason: "already_read",
          });
        }
        expect(readPage).toHaveBeenCalledTimes(1);
      });

      it("merges into the entry of the claimed address when a search returned that one too", async () => {
        const { session, readPage } = setup({
          answers: [
            [result("https://news.example/story"), result("https://news.example/story/amp")],
          ],
        });
        readPage.mockImplementation(claim("https://news.example/story"));
        await session.search("Acme breach", "news", "security_incidents");

        await session.read("https://news.example/story/amp", "security_incidents");

        const ledger = session.snapshot().ledger;
        expect(ledger.map((entry) => [entry.url, entry.kind])).toEqual([
          ["https://news.example/story", "page"],
        ]);
      });

      it("keeps the asked address when the claim is on another site", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/story")]],
        });
        readPage.mockImplementation(claim("https://www.bbc.example/news/story"));
        await session.search("Acme breach", "news", "security_incidents");

        const outcome = await session.read("https://news.example/story", "security_incidents");

        expect(outcome).toMatchObject({ ok: true, page: { url: "https://news.example/story" } });
        expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
          "https://news.example/story",
        ]);
      });

      it("keeps the address of another site that a page claims as its canonical address, and the page under the asked address", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/story")]],
        });
        readPage.mockImplementation(claim("https://www.bbc.example/news/story?utm_source=news"));
        await session.search("Acme breach", "news", "security_incidents");

        await session.read("https://news.example/story", "security_incidents");

        const ledger = session.snapshot().ledger;
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({
          kind: "page",
          url: "https://news.example/story",
          canonicalUrl: "https://www.bbc.example/news/story",
        });
      });

      it("keeps the address a page answered from when it is not the one asked: a redirect", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/story"), result("https://news.example/kept")]],
        });
        readPage.mockImplementation(async (url) =>
          url === "https://news.example/story"
            ? page("https://elsewhere.example/moved?utm_source=feed", { text: LONG_TEXT })
            : page(url, { text: `${LONG_TEXT} Another page.` }),
        );
        await session.search("Acme breach", "news", "security_incidents");

        await session.read("https://news.example/story", "security_incidents");
        await session.read("https://news.example/kept", "security_incidents");

        const [redirected, own] = session.snapshot().ledger;
        expect(redirected).toMatchObject({
          kind: "page",
          url: "https://news.example/story",
          answeredUrl: "https://elsewhere.example/moved",
        });
        expect(own).toMatchObject({ kind: "page", url: "https://news.example/kept" });
        expect(own).not.toHaveProperty("answeredUrl");
      });

      it("adds no canonical address for a claim on the same site", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/pricing")]],
        });
        readPage.mockImplementation(claim("https://news.example/"));
        await session.search("Acme breach", "news", "security_incidents");

        await session.read("https://news.example/pricing", "security_incidents");

        const [entry] = session.snapshot().ledger;
        expect(entry).toMatchObject({ kind: "page", url: "https://news.example/pricing" });
        expect(entry).not.toHaveProperty("canonicalUrl");
      });

      it("keeps the asked address when the claim is the home page, as a broken template makes it", async () => {
        const { session, readPage } = setup({
          answers: [[result("https://news.example/pricing")]],
        });
        readPage.mockImplementation(claim("https://news.example/"));
        await session.search("Acme breach", "news", "security_incidents");

        const outcome = await session.read("https://news.example/pricing", "security_incidents");

        expect(outcome).toMatchObject({ ok: true, page: { url: "https://news.example/pricing" } });
      });

      it("ignores a claim that is not an address it may read", async () => {
        const { session, readPage } = setup({ answers: [[result("https://news.example/story")]] });
        readPage.mockImplementation(claim("https://127.0.0.1/story"));
        await session.search("Acme breach", "news", "security_incidents");

        const outcome = await session.read("https://news.example/story", "security_incidents");

        expect(outcome).toMatchObject({ ok: true, page: { url: "https://news.example/story" } });
      });

      it("drops the entry of both addresses when the page proves too old", async () => {
        const { session, readPage } = setup({
          answers: [
            [result("https://news.example/story/amp")],
            [result("https://news.example/story")],
          ],
          cutoffs: { security_incidents: CUTOFF },
        });
        readPage.mockImplementation(async (url) =>
          page(url, {
            canonicalUrl: "https://news.example/story",
            text: LONG_TEXT,
            publishedAt: "2020-01-01T00:00:00.000Z",
          }),
        );
        await session.search("Acme breach", "news", "security_incidents");

        const outcome = await session.read("https://news.example/story/amp", "security_incidents");

        expect(outcome).toMatchObject({ ok: false, reason: "too_old" });
        expect(session.snapshot().ledger).toEqual([]);
        // A later search result for the claimed address is held to the date of the page.
        const later = await session.search("Acme incident report", "news", "security_incidents");
        expect(later).toEqual({ ok: true, results: [], omitted: { old: 1 } });
      });
    });

    describe("a page whose text is the text of one already read", () => {
      const twoArticles = () =>
        setup({
          answers: [[result("https://a.example/one"), result("https://b.example/two")]],
        });

      it("is not a second entry, and the read is given back", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) => page(url, { text: LONG_TEXT }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        expect((await session.read("https://a.example/one", "legal_regulatory")).ok).toBe(true);
        const readsLeft = session.budget().readsLeft;

        const second = await session.read("https://b.example/two", "legal_regulatory");

        expect(second).toEqual({
          ok: false,
          reason: "same_text",
          sameAs: "https://a.example/one",
        });
        expect(session.budget().readsLeft).toBe(readsLeft);
        expect(session.snapshot().ledger.map((entry) => [entry.url, entry.kind])).toEqual([
          ["https://a.example/one", "page"],
        ]);
      });

      it("still counts the call as an answer of the web, so the category was worked on", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) => page(url, { text: LONG_TEXT }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        await session.read("https://a.example/one", "legal_regulatory");
        await session.read("https://b.example/two", "legal_regulatory");

        const calls = session.snapshot().calls.filter((call) => call.tool === "read");
        expect(calls).toEqual([
          { category: "legal_regulatory", tool: "read", answered: true, failure: null },
          { category: "legal_regulatory", tool: "read", answered: true, failure: null },
        ]);
      });

      it("is read again no more: the address is answered as already read", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) => page(url, { text: LONG_TEXT }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        await session.read("https://a.example/one", "legal_regulatory");
        await session.read("https://b.example/two", "legal_regulatory");

        expect(await session.read("https://b.example/two", "legal_regulatory")).toEqual({
          ok: false,
          reason: "already_read",
        });
      });

      it("gives back at most three reads in a run", async () => {
        const urls = [1, 2, 3, 4, 5].map((n) => `https://site${n}.example/story`);
        const { session, readPage } = setup({ answers: [urls.map((url) => result(url))] });
        readPage.mockImplementation(async (url) => page(url, { text: LONG_TEXT }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        await session.read(urls[0], "legal_regulatory");
        const afterFirst = session.budget().readsLeft;

        for (const url of urls.slice(1)) await session.read(url, "legal_regulatory");

        // Four duplicates, three of them given back.
        expect(session.budget().readsLeft).toBe(afterFirst - 1);
      });

      it("is not a duplicate when it is read for another category", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) => page(url, { text: LONG_TEXT }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        await session.read("https://a.example/one", "legal_regulatory");

        const second = await session.read("https://b.example/two", "security_incidents");

        expect(second.ok).toBe(true);
        expect(session.snapshot().ledger).toHaveLength(2);
      });

      it("is compared without regard to case and spacing", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) =>
          page(url, {
            text: url.includes("one")
              ? LONG_TEXT
              : `  ${LONG_TEXT.toUpperCase().replace(/ /g, "  ")}\n`,
          }),
        );
        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        await session.read("https://a.example/one", "legal_regulatory");

        const second = await session.read("https://b.example/two", "legal_regulatory");

        expect(second).toMatchObject({ ok: false, reason: "same_text" });
      });

      it("is not compared when the text is short: two error pages are two answers", async () => {
        const { session, readPage } = twoArticles();
        readPage.mockImplementation(async (url) => page(url, { text: "Page not found." }));
        await session.search("Quanta lawsuit", "news", "legal_regulatory");

        expect((await session.read("https://a.example/one", "legal_regulatory")).ok).toBe(true);
        expect((await session.read("https://b.example/two", "legal_regulatory")).ok).toBe(true);
      });
    });

    describe("a result that repeats one the run has", () => {
      const SNIPPET =
        "A class action filed in Delaware says Quanta Billing charged small businesses for a premium plan they never ordered.";
      const syndicated = (url: string, title = "Quanta Billing sued over unordered upgrades") => ({
        title,
        url,
        snippet: SNIPPET,
        publishedAt: null,
        source: null,
      });

      it("is left out when its title and snippet are those of an earlier result of the same category, and is counted", async () => {
        const { session } = setup({
          answers: [[syndicated("https://a.example/story"), syndicated("https://b.example/copy")]],
        });

        const outcome = await session.search("Quanta lawsuit", "news", "legal_regulatory");

        expect(outcome).toEqual({
          ok: true,
          results: [syndicated("https://a.example/story")],
          omitted: { duplicate: 1 },
        });
        expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
          "https://a.example/story",
        ]);
      });

      it("is found out across searches of one category", async () => {
        const { session } = setup({
          answers: [
            [syndicated("https://a.example/story")],
            [syndicated("https://b.example/copy")],
          ],
        });

        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        const outcome = await session.search("Quanta class action", "news", "legal_regulatory");

        expect(outcome).toEqual({ ok: true, results: [], omitted: { duplicate: 1 } });
      });

      it("stays when only the snippet is the same: a site-wide description is not one page", async () => {
        const { session } = setup({
          answers: [
            [
              syndicated("https://a.example/story"),
              syndicated("https://a.example/other", "A different page of the same site"),
            ],
          ],
        });

        const outcome = await session.search("Quanta lawsuit", "news", "legal_regulatory");

        expect(outcome.ok && outcome.results).toHaveLength(2);
      });

      it("stays when it was found for another category", async () => {
        const { session } = setup({
          answers: [
            [syndicated("https://a.example/story")],
            [syndicated("https://b.example/copy")],
          ],
        });

        await session.search("Quanta lawsuit", "news", "legal_regulatory");
        const outcome = await session.search("Quanta breach", "news", "security_incidents");

        expect(outcome.ok && outcome.results).toHaveLength(1);
      });

      it("stays when the snippet is short", async () => {
        const short = (url: string) => ({ ...syndicated(url), snippet: "Sued." });
        const { session } = setup({
          answers: [[short("https://a.example/story"), short("https://b.example/copy")]],
        });

        const outcome = await session.search("Quanta lawsuit", "news", "legal_regulatory");

        expect(outcome.ok && outcome.results).toHaveLength(2);
      });
    });
  });

  describe("results that are not about the vendor", () => {
    const aboutAcme = ({ title, snippet }: { title: string; snippet: string }) =>
      /acme/i.test(`${title} ${snippet}`);
    const found = (url: string, about: boolean) => ({
      title: about ? "Acme confirms a breach" : "A recipe for lemon cake",
      url,
      snippet: about ? "Acme said on Monday that..." : "Mix the flour and the sugar...",
      publishedAt: null,
      source: null,
    });

    it("never enter the ledger, are not shown, and are counted", async () => {
      const { session } = setup({
        answers: [[found("https://a.example/1", false), found("https://b.example/2", true)]],
        isRelevant: aboutAcme,
      });

      const outcome = await session.search("Acme breach", "web", "security_incidents");

      expect(outcome).toEqual({
        ok: true,
        results: [found("https://b.example/2", true)],
        omitted: { off_topic: 1 },
      });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual(["https://b.example/2"]);
    });

    it("cannot be read, since no search returned them", async () => {
      const { session, readPage } = setup({
        answers: [[found("https://a.example/1", false)]],
        isRelevant: aboutAcme,
      });
      await session.search("Acme breach", "web", "security_incidents");

      const outcome = await session.read("https://a.example/1", "security_incidents");

      expect(outcome).toEqual({ ok: false, reason: "not_from_search" });
      expect(readPage).not.toHaveBeenCalled();
    });

    it("are not asked about when they are on the vendor's own site", async () => {
      const isRelevant = jest.fn(() => false);
      const { session } = setup({
        answers: [
          [found("https://acme.com/trust", false), found("https://trust.acme.com/x", false)],
        ],
        isRelevant,
      });

      const outcome = await session.search("Acme trust", "web", "certifications");

      expect(outcome.ok && outcome.results).toHaveLength(2);
      expect(isRelevant).not.toHaveBeenCalled();
    });

    it("are judged on the title, the snippet and the clean address", async () => {
      const isRelevant = jest.fn(() => true);
      const { session } = setup({
        answers: [[found("https://news.example/story?utm_source=x", true)]],
        isRelevant,
      });

      await session.search("Acme breach", "web", "security_incidents");

      expect(isRelevant).toHaveBeenCalledWith({
        title: "Acme confirms a breach",
        snippet: "Acme said on Monday that...",
        url: "https://news.example/story",
      });
    });

    it("leave everything in when the session has no judge", async () => {
      const { session } = setup({
        answers: [[found("https://a.example/1", false), found("https://b.example/2", true)]],
      });

      const outcome = await session.search("Acme breach", "web", "security_incidents");

      expect(outcome.ok && outcome.results).toHaveLength(2);
    });

    it("count as off topic before they are checked against the lookback", async () => {
      const old = {
        ...found("https://a.example/1", false),
        publishedAt: "2020-01-01T00:00:00.000Z",
      };
      const { session } = setup({
        answers: [[old]],
        cutoffs: { security_incidents: CUTOFF },
        isRelevant: aboutAcme,
      });

      const outcome = await session.search("Acme breach", "news", "security_incidents");

      expect(outcome).toEqual({ ok: true, results: [], omitted: { off_topic: 1 } });
    });
  });

  describe("the query the engine is given", () => {
    const keepNameAndTwoWords = (query: string) => query.split(/\s+/).slice(0, 3).join(" ");

    it("is the normalized one, and the outcome says what it was when it differs from the asked one", async () => {
      const { session, search } = setup({
        answers: [[result("https://news.example/a")]],
        normalizeQuery: keepNameAndTwoWords,
      });

      const outcome = await session.search(
        "Acme data breach OR incident site:x.com",
        "news",
        "security_incidents",
      );

      expect(search).toHaveBeenCalledWith("Acme data breach", "news", undefined);
      expect(outcome).toMatchObject({ ok: true, query: "Acme data breach" });
    });

    it("is the asked one, and the outcome carries no query, when normalizing changes nothing", async () => {
      const { session, search } = setup({
        answers: [[result("https://news.example/a")]],
        normalizeQuery: keepNameAndTwoWords,
      });

      const outcome = await session.search("Acme data breach", "news", "security_incidents");

      expect(search).toHaveBeenCalledWith("Acme data breach", "news", undefined);
      expect(outcome).toEqual({
        ok: true,
        results: [result("https://news.example/a")],
        omitted: {},
      });
    });

    it("is what repeats are judged on: two askings that normalize to one query are one query", async () => {
      const { session, search } = setup({ normalizeQuery: keepNameAndTwoWords });
      await session.search("Acme data breach", "news", "security_incidents");

      const outcome = await session.search(
        "Acme data breach incident ransomware",
        "news",
        "security_incidents",
      );

      expect(outcome).toEqual({ ok: false, reason: "repeated_query" });
      expect(search).toHaveBeenCalledTimes(1);
    });

    it("is the asked one when the session has no normalizer", async () => {
      const { session, search } = setup();

      await session.search("site:x.com Acme", "news", "security_incidents");

      expect(search).toHaveBeenCalledWith("site:x.com Acme", "news", undefined);
    });
  });

  describe("a query that repeats an earlier one", () => {
    it("is refused as repeated_query, without a request, without a unit of the budget, and without a record", async () => {
      const { session, search } = setup({ answers: [[result("https://news.example/a")]] });
      await session.search("Acme data breach", "news", "security_incidents");
      const before = session.budget().searchesLeft;

      const outcome = await session.search("breach DATA, Acme!", "news", "security_incidents");

      expect(outcome).toEqual({ ok: false, reason: "repeated_query" });
      expect(search).toHaveBeenCalledTimes(1);
      expect(session.budget().searchesLeft).toBe(before);
      expect(session.snapshot().searchesUsed).toBe(1);
      expect(session.snapshot().calls).toHaveLength(1);
    });

    it("is refused for another category too: the feed gives the same answer", async () => {
      const { session } = setup({ answers: [[result("https://news.example/a")]] });
      await session.search("Acme data breach", "news", "security_incidents");

      expect(await session.search("Acme data breach", "news", "legal_regulatory")).toEqual({
        ok: false,
        reason: "repeated_query",
      });
    });

    it("is not a repeat in the other feed: the web and the news answer differently", async () => {
      const { session, search } = setup();
      await session.search("Acme data breach", "news", "security_incidents");

      const outcome = await session.search("Acme data breach", "web", "security_incidents");

      expect(outcome.ok).toBe(true);
      expect(search).toHaveBeenCalledTimes(2);
    });

    it("takes a plural for the singular, and an added word to a long query for the same query", async () => {
      const { session } = setup();
      await session.search("Acme data breach incident report", "news", "security_incidents");

      expect(
        await session.search("Acme data breaches incident reports", "news", "security_incidents"),
      ).toEqual({ ok: false, reason: "repeated_query" });
      expect(
        await session.search("Acme data breach incident report 2026", "news", "security_incidents"),
      ).toEqual({ ok: false, reason: "repeated_query" });
    });

    it("lets a query through that changes the topic", async () => {
      const { session } = setup();
      await session.search("Acme data breach", "news", "security_incidents");

      expect((await session.search("Acme lawsuit", "news", "legal_regulatory")).ok).toBe(true);
      expect((await session.search("Acme data fine", "news", "legal_regulatory")).ok).toBe(true);
    });

    it("may be asked again when the first search failed: the engine said nothing", async () => {
      const { session, search } = setup({
        answers: [new SearchEngineError(), [result("https://news.example/a")]],
      });
      await session.search("Acme data breach", "news", "security_incidents");

      const outcome = await session.search("Acme data breach", "news", "security_incidents");

      expect(outcome.ok).toBe(true);
      expect(search).toHaveBeenCalledTimes(2);
    });

    it("is refused after a search that found nothing: an empty feed is an answer", async () => {
      const { session } = setup({ answers: [[]] });
      await session.search("Acme data breach", "news", "security_incidents");

      expect(await session.search("Acme data breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "repeated_query",
      });
    });

    it("gives way to the budget: with none left the answer is budget_exhausted", async () => {
      const { session } = setup({ limits: { maxSearches: 1 } });
      await session.search("Acme data breach", "news", "security_incidents");

      expect(await session.search("Acme data breach", "news", "security_incidents")).toEqual({
        ok: false,
        reason: "budget_exhausted",
      });
    });

    it("does not compare queries that have no words", async () => {
      const { session } = setup();
      await session.search("???", "news", "security_incidents");

      expect((await session.search("...", "news", "security_incidents")).ok).toBe(true);
    });
  });

  describe("a domain that is the vendor's website too", () => {
    const aliasDomains = ["acme.net"];

    it("lets a page on it be read without a search result, as a page of the domain is", async () => {
      const { session, readPage } = setup({ aliasDomains });

      const outcome = await session.read("https://acme.net/security", "certifications");

      expect(outcome.ok).toBe(true);
      expect(readPage).toHaveBeenCalledWith("https://acme.net/security", undefined);
    });

    it("lets a page on a subdomain of it be read too, and not a domain that only ends like it", async () => {
      const { session } = setup({ aliasDomains });

      expect((await session.read("https://trust.acme.net/", "certifications")).ok).toBe(true);
      expect(await session.read("https://notacme.net/", "certifications")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
      expect(await session.read("https://acme.net.evil.example/", "certifications")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
    });

    it("marks what is read there as the vendor's own", async () => {
      const { session } = setup({ aliasDomains });
      await session.read("https://acme.net/security", "certifications");

      expect(session.snapshot().ledger).toMatchObject([
        { url: "https://acme.net/security", kind: "page", onVendorSite: true },
      ]);
    });

    it("exempts what is read there from the lookback window", async () => {
      const { session, readPage } = setup({
        aliasDomains,
        cutoffs: { certifications: CUTOFF },
      });
      readPage.mockResolvedValueOnce(
        page("https://acme.net/old", { publishedAt: "2020-01-01T00:00:00.000Z" }),
      );

      expect((await session.read("https://acme.net/old", "certifications")).ok).toBe(true);
    });

    it("does not ask whether a search result there is about the vendor", async () => {
      const found = result("https://acme.net/about");
      const { session } = setup({
        aliasDomains,
        answers: [[found]],
        isRelevant: () => false,
      });

      const outcome = await session.search("Acme", "web", "certifications");

      expect(outcome).toMatchObject({ ok: true, results: [{ url: found.url }] });
    });

    it("offers the links of a page there that lead to its own pages", async () => {
      const links: PageLink[] = [
        { text: "Security", url: "https://acme.net/security" },
        { text: "Security of the old site", url: "https://acme.com/security" },
        { text: "Security of a partner", url: "https://partner.example/security" },
      ];
      const { session, readPage } = setup({ aliasDomains });
      readPage.mockResolvedValueOnce(page("https://acme.net/", { links }));

      const outcome = await session.read("https://acme.net/", "certifications");

      expect(outcome.ok && outcome.page.links).toEqual([
        { text: "Security", url: "https://acme.net/security" },
      ]);
    });

    it("keeps the links of a page on the primary domain as they were", async () => {
      const links: PageLink[] = [
        { text: "Security", url: "https://acme.com/security" },
        { text: "Security of the new site", url: "https://acme.net/security" },
      ];
      const { session, readPage } = setup({ aliasDomains });
      readPage.mockResolvedValueOnce(page("https://acme.com/", { links }));

      const outcome = await session.read("https://acme.com/", "certifications");

      expect(outcome.ok && outcome.page.links).toEqual([
        { text: "Security", url: "https://acme.com/security" },
      ]);
    });

    it("is not there without the option", async () => {
      const { session } = setup();

      expect(await session.read("https://acme.net/security", "certifications")).toEqual({
        ok: false,
        reason: "not_from_search",
      });
    });

    it("still works for a vendor with no domain of its own", async () => {
      const { session } = setup({ domain: null, aliasDomains });

      expect((await session.read("https://acme.net/security", "certifications")).ok).toBe(true);
    });
  });

  describe("a host that the caller knows is closed", () => {
    const closedHosts = ["acme.com", "www.acme.com"];

    it("refuses the read of a page on it as site_closed, without a request", async () => {
      const { session, readPage } = setup({ closedHosts });

      expect(await session.read("https://acme.com/security", "certifications")).toEqual({
        ok: false,
        reason: "site_closed",
      });
      expect(await session.read("https://www.acme.com/trust", "certifications")).toEqual({
        ok: false,
        reason: "site_closed",
      });
      expect(readPage).not.toHaveBeenCalled();
    });

    it("uses no budget and records no call: the rules refused it before the web", async () => {
      const { session } = setup({ closedHosts });

      await session.read("https://acme.com/security", "certifications");

      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
      expect(session.snapshot().calls).toEqual([]);
      expect(session.snapshot().pagesRead).toBe(0);
    });

    it("does not close the subdomains of the host", async () => {
      const { session, readPage } = setup({ closedHosts });

      const outcome = await session.read("https://trust.acme.com/", "certifications");

      expect(outcome.ok).toBe(true);
      expect(readPage).toHaveBeenCalledWith("https://trust.acme.com/", undefined);
    });

    it("matches the host whatever its case", async () => {
      const { session, readPage } = setup({ closedHosts });

      expect(await session.read("https://ACME.com/security", "certifications")).toMatchObject({
        reason: "site_closed",
      });
      expect(readPage).not.toHaveBeenCalled();
    });

    it("refuses a page that a search returned from the host as well, and keeps its snippet", async () => {
      const found = result("https://acme.com/security");
      const { session, readPage } = setup({ closedHosts, answers: [[found]] });
      await session.search("Acme security", "web", "certifications");

      expect(await session.read("https://acme.com/security", "certifications")).toMatchObject({
        reason: "site_closed",
      });

      expect(readPage).not.toHaveBeenCalled();
      expect(session.snapshot().ledger).toEqual([resultEntry("certifications", found, true)]);
    });

    it("says site_closed and not not_from_search for a page of the host that no search returned", async () => {
      const { session } = setup({ closedHosts, domain: null });

      expect(await session.read("https://acme.com/security", "certifications")).toEqual({
        ok: false,
        reason: "site_closed",
      });
    });

    it("still says bad_address first for an address that cannot be opened", async () => {
      const { session } = setup({ closedHosts });

      expect(await session.read("https://acme.com/security%E2%80%9D", "certifications")).toEqual({
        ok: false,
        reason: "bad_address",
      });
    });

    it("reads the pages of other hosts as before", async () => {
      const found = result("https://news.example/story");
      const { session } = setup({ closedHosts, answers: [[found]] });
      await session.search("Acme breach", "news", "security_incidents");

      expect((await session.read("https://news.example/story", "security_incidents")).ok).toBe(
        true,
      );
    });

    it("closes nothing without the option", async () => {
      const { session } = setup();

      expect((await session.read("https://acme.com/security", "certifications")).ok).toBe(true);
    });
  });

  describe("snapshot", () => {
    it("returns copies that the caller can change without changing the session", async () => {
      const { session } = setup({ answers: [[result("https://news.example/a")]] });
      await session.search("Acme breach", "news", "security_incidents");
      await session.read("https://acme.com/trust", "certifications");
      // A deep clone: a snapshot that shared its entries would share them with `before` as well.
      const before = structuredClone(session.snapshot());

      const copy = session.snapshot();
      copy.ledger[0].content = "changed";
      copy.ledger.push({ ...copy.ledger[0], url: "https://evil.example/" });
      copy.calls[0].answered = false;
      copy.calls.length = 0;

      expect(session.snapshot()).toEqual(before);
    });

    it("counts the searches that were allowed and the reads that were answered", async () => {
      const { session, readPage } = setup({
        answers: [[], new SearchEngineError()],
        cutoffs: { security_incidents: CUTOFF },
        limits: { maxSearches: 2 },
      });
      await session.search("Acme one", "web", "security_incidents");
      await session.search("Acme two", "web", "security_incidents");
      await session.search("Acme three", "web", "security_incidents");

      readPage.mockResolvedValueOnce(page("https://acme.com/ok"));
      readPage.mockResolvedValueOnce(
        page("https://elsewhere.example/old", { publishedAt: "2020-01-01T00:00:00.000Z" }),
      );
      readPage.mockRejectedValueOnce(new PageReadError("blocked_by_robots"));
      await session.read("https://acme.com/ok", "certifications");
      await session.read("https://acme.com/moved", "security_incidents");
      await session.read("https://acme.com/blocked", "certifications");
      await session.read("https://news.example/never-returned", "security_incidents");

      expect(session.snapshot().searchesUsed).toBe(2);
      expect(session.snapshot().pagesRead).toBe(2);
    });
  });

  describe("addRecords: the records of a public database", () => {
    const record = (url: string, publishedAt = "2031-01-02") => ({
      url,
      title: `Record ${url}`,
      text: `Text of the record ${url}`,
      publishedAt,
    });

    it("puts them in the ledger as sources that were read, in the order they were given, under the category", () => {
      const { session } = setup();
      const first = record("https://db.example/a");
      const second = record("https://db.example/b", "2031-01-03");

      expect(session.addRecords([first, second], "security_incidents")).toEqual({
        added: 2,
        omitted: {},
      });

      expect(session.snapshot().ledger).toEqual([
        {
          category: "security_incidents",
          kind: "page",
          onVendorSite: false,
          url: "https://db.example/a",
          title: "Record https://db.example/a",
          content: "Text of the record https://db.example/a",
          publishedAt: "2031-01-02",
        },
        {
          category: "security_incidents",
          kind: "page",
          onVendorSite: false,
          url: "https://db.example/b",
          title: "Record https://db.example/b",
          content: "Text of the record https://db.example/b",
          publishedAt: "2031-01-03",
        },
      ]);
    });

    it("costs no search, no read and nothing of any budget", () => {
      const { session, search, readPage } = setup();
      const before = session.budget();

      session.addRecords([record("https://db.example/a")], "security_incidents");

      expect(session.budget()).toEqual(before);
      expect(session.snapshot().searchesUsed).toBe(0);
      expect(session.snapshot().pagesRead).toBe(0);
      expect(session.snapshot().calls).toEqual([]);
      expect(search).not.toHaveBeenCalled();
      expect(readPage).not.toHaveBeenCalled();
    });

    it("refuses a read of the address of a record: it was read", async () => {
      const { session, readPage } = setup();
      session.addRecords([record("https://db.example/a")], "security_incidents");

      expect(await session.read("https://db.example/a", "security_incidents")).toEqual({
        ok: false,
        reason: "already_read",
      });
      expect(readPage).not.toHaveBeenCalled();
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads);
    });

    it("does not ask whether a record is about the vendor: the caller matched it", () => {
      const { session } = setup({ isRelevant: () => false });

      expect(session.addRecords([record("https://db.example/a")], "security_incidents").added).toBe(
        1,
      );
    });

    it("leaves out a record older than the lookback of its category and counts it, and keeps one from the day", () => {
      const { session } = setup({ cutoffs: { security_incidents: CUTOFF } });

      const outcome = session.addRecords(
        [record("https://db.example/old", "2029-04-19"), record("https://db.example/day", CUTOFF)],
        "security_incidents",
      );

      expect(outcome).toEqual({ added: 1, omitted: { old: 1 } });
      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual([
        "https://db.example/day",
      ]);
    });

    it("holds the lookback of the category it is added under, not of another", () => {
      const { session } = setup({ cutoffs: { security_incidents: CUTOFF } });

      const outcome = session.addRecords(
        [record("https://db.example/old", "2029-04-19")],
        "legal_regulatory",
      );

      expect(outcome.added).toBe(1);
    });

    it("keeps one source for an address: a record at an address the ledger has, or has twice, is left out", async () => {
      const { session } = setup({ answers: [[result("https://db.example/seen")]] });
      await session.search("Acme breach", "news", "security_incidents");

      const outcome = session.addRecords(
        [
          record("https://db.example/seen"),
          record("https://db.example/new"),
          record("https://db.example/new"),
        ],
        "security_incidents",
      );

      expect(outcome).toEqual({ added: 1, omitted: { duplicate: 2 } });
      expect(session.snapshot().ledger.map((entry) => entry.kind)).toEqual(["result", "page"]);
    });

    it("turns away an address that cannot be used, and counts it", () => {
      const { session } = setup();

      const outcome = session.addRecords(
        [
          record("http://localhost/x"),
          record("javascript:alert(1)"),
          record("https://db.example/a"),
        ],
        "security_incidents",
      );

      expect(outcome).toEqual({ added: 1, omitted: { bad_address: 2 } });
    });

    it("writes the address as the session keeps it: no fragment", () => {
      const { session } = setup();

      session.addRecords([record("https://db.example/list#Brise")], "security_incidents");

      expect(session.snapshot().ledger[0].url).toBe("https://db.example/list");
    });

    it("puts the database of a record on its entry", () => {
      const { session } = setup();

      session.addRecords([record("https://db.example/a")], "security_incidents", "kev");
      session.addRecords([record("https://db.example/b")], "security_incidents");

      const [withDatabase, without] = session.snapshot().ledger;
      expect(withDatabase).toMatchObject({ url: "https://db.example/a", record: "kev" });
      expect(without).toMatchObject({ url: "https://db.example/b" });
      expect(without).not.toHaveProperty("record");
    });

    it("puts what the vendor risk database knows of a record on its entry", () => {
      const { session } = setup();
      const vrdb = {
        recordId: 42,
        sourceId: "kev",
        sourceRecordId: "CVE-2031-0001",
        strength: "strong",
        method: "kev_vendor",
        matchedKey: "kev:acme",
        status: "active",
        asOf: "2031-01-02",
        stale: false,
      } as const;

      session.addRecords(
        [{ ...record("https://db.example/a"), vrdb }, record("https://db.example/b")],
        "security_incidents",
        "kev",
      );

      const [offered, other] = session.snapshot().ledger;
      expect(offered).toMatchObject({ url: "https://db.example/a", record: "kev", vrdb });
      expect(other).not.toHaveProperty("vrdb");
    });

    it("passes the database through a pool's view", () => {
      const { session } = setup();

      session
        .pool({ searches: 1, reads: 1 })
        .addRecords([record("https://db.example/a")], "security_incidents", "kev");

      expect(session.snapshot().ledger[0]).toMatchObject({
        url: "https://db.example/a",
        record: "kev",
      });
    });

    it("works through the view of a pool, on the same ledger", () => {
      const { session } = setup();
      const view = session.pool({ searches: 1, reads: 1 });

      view.addRecords([record("https://db.example/a")], "security_incidents");

      expect(session.snapshot().ledger.map((entry) => entry.url)).toEqual(["https://db.example/a"]);
      expect(view.budget()).toEqual({ searchesLeft: 1, readsLeft: 1 });
    });
  });
});
