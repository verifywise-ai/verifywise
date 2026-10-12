import { MAX_EXCERPT_CHARS, PageLink, relevantLinks, selectExcerpt } from "../pageText";
import { FetchedPage, PageReadError } from "../readPage";
import { SearchEngineError, SearchKind, SearchResult } from "../webSearch";
import {
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

/** The ledger entry that a kept result becomes. */
function resultEntry(category: Category, kept: SearchResult): LedgerEntry<Category> {
  return {
    category,
    kind: "result",
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
}

/** A session on the domain acme.com, with a fake engine and a reader that answers every URL. */
function setup(options: Setup = {}) {
  const answers = [...(options.answers ?? [])];
  const search = jest.fn<Promise<SearchResult[]>, [string, SearchKind, AbortSignal?]>(async () => {
    const answer = answers.shift() ?? [];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const readPage = jest.fn<Promise<FetchedPage>, [string, AbortSignal?]>(async (url) => page(url));
  const sessionOptions: WebSessionOptions<Category> = {
    engine: { search },
    readPage,
    domain: options.domain === undefined ? "acme.com" : options.domain,
    cutoffs: options.cutoffs ?? {},
    limits: options.limits,
  };
  return { session: createWebSession(sessionOptions), search, readPage };
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
        omittedOld: 0,
      });
      expect(await session.search("Acme lawsuit", "web", "legal_regulatory")).toEqual({
        ok: true,
        results: second,
        omittedOld: 0,
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
      await session.search("Acme breach", "news", "security_incidents");
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
      expect(outcome).toEqual({ ok: true, results: [b], omittedOld: 0 });
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
        omittedOld: 1,
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
        omittedOld: 0,
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

      expect(await session.search("Acme breach", "web", "security_incidents")).toEqual({
        ok: true,
        results: [own, subdomain],
        omittedOld: 1,
      });
    });

    it("keeps at most maxResultsPerSearch results", async () => {
      const many = Array.from({ length: 12 }, (_, n) => result(`https://news.example/${n}`));

      const byDefault = setup({ answers: [many] });
      const outcome = await byDefault.session.search("Acme", "web", "security_incidents");
      expect(outcome).toEqual({ ok: true, results: many.slice(0, 10), omittedOld: 0 });
      expect(byDefault.session.snapshot().ledger).toHaveLength(10);

      const limited = setup({ answers: [many], limits: { maxResultsPerSearch: 3 } });
      expect(await limited.session.search("Acme", "web", "security_incidents")).toEqual({
        ok: true,
        results: many.slice(0, 3),
        omittedOld: 0,
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
        omittedOld: 0,
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
        { ok: true, results: [], omittedOld: 0 },
        { ok: false, reason: "budget_exhausted" },
      ]);
      expect(search).toHaveBeenCalledTimes(1);
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
        omittedOld: 0,
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
  });

  describe("read: a page that was read", () => {
    // About 31,000 characters; the one paragraph about the focus sits far beyond the first 8,000.
    const filler = (n: number) => `Paragraph ${n} talks about nothing in particular. `.repeat(20);
    const LONG_TEXT = [
      ...Array.from({ length: 30 }, (_, n) => filler(n)),
      "Acme uses customer data for model training.",
      filler(31),
    ].join("\n\n");

    it("replaces the snippet with the excerpt in place, keeping the result's title and date", async () => {
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
        },
      });
      expect(session.snapshot().ledger).toEqual([
        {
          category: "ai_specific",
          kind: "page",
          url: a.url,
          title: a.title,
          content: expected.excerpt,
          publishedAt: a.publishedAt,
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
      expect(session.budget().readsLeft).toBe(SESSION_LIMITS.maxReads - 1);
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

      expect(await session.search("Acme breach", "news", "security_incidents")).toEqual({
        ok: true,
        results: [],
        omittedOld: 1,
      });
      expect(session.snapshot().ledger).toEqual([]);
      // Within the 36 months of legal_regulatory, the same source may be used there.
      expect(await session.search("Acme lawsuit", "news", "legal_regulatory")).toEqual({
        ok: true,
        results: [undated],
        omittedOld: 0,
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
        omittedOld: 1,
      });
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

    it("holds the date of the search result to the cutoff of the read's category when the page is recent", async () => {
      const x = result("https://news.example/x", "2028-06-01T00:00:00.000Z");
      const { session, readPage } = setup({ answers: [[x]], cutoffs });
      readPage.mockResolvedValueOnce(page(x.url, { publishedAt: "2030-01-01T00:00:00.000Z" }));
      await session.search("Acme lawsuit", "news", "legal_regulatory");

      expect(await session.read(x.url, "security_incidents")).toEqual({
        ok: false,
        reason: "too_old",
        publishedAt: "2028-06-01T00:00:00.000Z",
      });
      expect(session.snapshot().ledger).toEqual([resultEntry("legal_regulatory", x)]);
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
});
