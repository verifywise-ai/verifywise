/**
 * The fetch that checks where every answer came from, and the loop over the pages of a list that is
 * paged (kit/paging.ts): the pages are all there or the download fails, and a partial list is never
 * given.
 */
import { FetchError } from "../../../../../webResearch/guardedFetch";
import { fakeFetch } from "../../__tests__/helpers/kitContract";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError } from "../../types";
import type { Pin } from "../address";
import { fetchAllPages, pinnedFetch } from "../paging";

jest.setTimeout(30_000);

const PIN: Pin = { hosts: ["api.example.org"], pathPrefixes: ["/v1/"] };
const URL_A = "https://api.example.org/v1/items?page=0";
const LIMITS = { maxBytes: 1000, allowedContentTypes: ["application/json"], totalTimeoutMs: 1000 };

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

describe("pinnedFetch", () => {
  const FILE = { body: "[]", contentType: "application/json", etag: '"e1"' };

  it("gives the answer that came from the pin as it is", async () => {
    const fetch = pinnedFetch(fakeFetch({ [URL_A]: FILE }), PIN);
    const response = await fetch(URL_A, {}, LIMITS);
    expect(response).toEqual({
      notModified: false,
      url: URL_A,
      status: 200,
      contentType: "application/json",
      body: Buffer.from("[]"),
      truncated: false,
      etag: '"e1"',
      lastModified: null,
    });
  });

  it("gives the answer that nothing changed, when it came from the pin", async () => {
    const fetch = pinnedFetch(fakeFetch({ [URL_A]: FILE }), PIN);
    expect(await fetch(URL_A, { etag: '"e1"' }, LIMITS)).toEqual({ notModified: true, url: URL_A });
  });

  it("asks the fetch it wraps, with what it was given, and nothing else", async () => {
    const inner = fakeFetch({ [URL_A]: FILE });
    const validators = { etag: '"old"', lastModified: "Thu, 01 Jan 2026 00:00:00 GMT" };
    await pinnedFetch(inner, PIN)(URL_A, validators, LIMITS);
    expect(inner.calls).toEqual([{ url: URL_A, validators, limits: LIMITS }]);
  });

  it("can be used again: it keeps nothing of an answer", async () => {
    const fetch = pinnedFetch(fakeFetch({ [URL_A]: FILE }), PIN);
    expect((await fetch(URL_A, {}, LIMITS)).notModified).toBe(false);
    expect((await fetch(URL_A, {}, LIMITS)).notModified).toBe(false);
    expect((await fetch(URL_A, { etag: '"e1"' }, LIMITS)).notModified).toBe(true);
  });

  describe("an answer from outside the pin", () => {
    it.each([
      ["another host", "https://evil.example.net/v1/items"],
      ["a host that only starts like it", "https://api.example.org.attacker.net/v1/items"],
      ["plain http", "http://api.example.org/v1/items"],
      ["another port", "https://api.example.org:8443/v1/items"],
      ["a user name", "https://user:secret@api.example.org/v1/items"],
      ["another directory", "https://api.example.org/v2/items"],
      ["a climb out of the directory", "https://api.example.org/v1/../v2/items"],
    ])("fails as not allowed, for %s, naming no address", async (_name, from) => {
      const fetch = pinnedFetch(fakeFetch({ [URL_A]: { ...FILE, url: from } }), PIN);
      const failure = await failureOf(fetch(URL_A, {}, LIMITS));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      for (const part of ["evil", "attacker", "secret", "example", "https", "v1", "v2"]) {
        expect((failure as FetchError).message).not.toContain(part);
      }
    });

    it("fails an answer of unchanged as well: a 304 from another address says nothing of the pinned one", async () => {
      const fetch = pinnedFetch(
        fakeFetch({ [URL_A]: { ...FILE, url: "https://evil.example.net/v1/items" } }),
        PIN,
      );
      const failure = await failureOf(fetch(URL_A, { etag: '"e1"' }, LIMITS));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("fails an answer whose address is no address at all, for a 200 and for a 304", async () => {
      for (const notModified of [false, true]) {
        const inner: ConnectorFetch = async () =>
          notModified
            ? { notModified: true, url: "not an address" }
            : {
                notModified: false,
                url: "not an address",
                status: 200,
                contentType: "application/json",
                body: Buffer.from("[]"),
                truncated: false,
                etag: null,
                lastModified: null,
              };
        const failure = await failureOf(pinnedFetch(inner, PIN)(URL_A, {}, LIMITS));
        expect((failure as FetchError).reason).toBe("not_allowed");
        expect((failure as FetchError).message).not.toContain("not an address");
      }
    });

    it("fails an answer from outside the pin before it looks at whether the body was cut", async () => {
      const fetch = pinnedFetch(
        fakeFetch({
          [URL_A]: { ...FILE, truncated: true, url: "https://evil.example.net/v1/items" },
        }),
        PIN,
      );
      const failure = await failureOf(fetch(URL_A, {}, LIMITS));
      expect((failure as FetchError).reason).toBe("not_allowed");
    });
  });

  describe("a body that was cut at its limit", () => {
    it("fails as too large: a page that is cut is not the page", async () => {
      const fetch = pinnedFetch(fakeFetch({ [URL_A]: { ...FILE, truncated: true } }), PIN);
      const failure = await failureOf(fetch(URL_A, {}, LIMITS));
      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect((failure as Error).message).toBe("The file is larger than its limit.");
    });

    it("fails as too large when the body is longer than the limit of the call", async () => {
      const fetch = pinnedFetch(fakeFetch({ [URL_A]: { ...FILE, body: "x".repeat(2000) } }), PIN);
      expect(await failureOf(fetch(URL_A, {}, LIMITS))).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("a failure of the fetch it wraps", () => {
    it("goes through as it is, with its reason", async () => {
      const failing: ConnectorFetch = async () => {
        throw new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 5000 });
      };
      const failure = await failureOf(pinnedFetch(failing, PIN)(URL_A, {}, LIMITS));
      expect(failure).toMatchObject({ reason: "blocked_by_site", status: 429, retryAfterMs: 5000 });
    });

    it("goes through for an address that the fetch does not know", async () => {
      const failure = await failureOf(pinnedFetch(fakeFetch({}), PIN)(URL_A, {}, LIMITS));
      expect((failure as FetchError).reason).toBe("unreachable");
    });
  });

  it("takes a pin with no path prefixes for every path of its hosts", async () => {
    const fetch = pinnedFetch(
      fakeFetch({ [URL_A]: { ...FILE, url: "https://api.example.org/any/path" } }),
      { hosts: ["api.example.org"] },
    );
    expect((await fetch(URL_A, {}, LIMITS)).notModified).toBe(false);
  });
});

describe("fetchAllPages", () => {
  type Answer = { items: number[]; next: number | null; total?: number };

  /** An `ask` that answers from a list of pages by their number, and keeps the pages it was asked. */
  const asking = (pages: Record<number, Answer>) => {
    const asked: number[] = [];
    const ask = jest.fn(async (page: number): Promise<Answer> => {
      asked.push(page);
      const answer = pages[page];
      if (answer === undefined) throw new FetchError("unreachable");
      return answer;
    });
    return { ask, asked };
  };

  describe("the pages of a list", () => {
    it("is the items of the one page, when it has no next", async () => {
      const { ask, asked } = asking({ 0: { items: [1, 2, 3], next: null } });
      expect(await fetchAllPages(ask, 5)).toEqual([1, 2, 3]);
      expect(asked).toEqual([0]);
    });

    it("is the items of every page, in the order of the pages, from the first (page 0)", async () => {
      const { ask, asked } = asking({
        0: { items: [1, 2], next: 1 },
        1: { items: [3, 4], next: 2 },
        2: { items: [5], next: null },
      });
      expect(await fetchAllPages(ask, 10)).toEqual([1, 2, 3, 4, 5]);
      expect(asked).toEqual([0, 1, 2]);
    });

    it("follows the number that a page gives, whatever it is", async () => {
      const { ask, asked } = asking({
        0: { items: [1], next: 5 },
        5: { items: [2], next: 3 },
        3: { items: [3], next: null },
      });
      expect(await fetchAllPages(ask, 10)).toEqual([1, 2, 3]);
      expect(asked).toEqual([0, 5, 3]);
    });

    it("is an empty list for a page with no items and no next", async () => {
      const { ask } = asking({ 0: { items: [], next: null } });
      expect(await fetchAllPages(ask, 1)).toEqual([]);
    });

    it("takes pages with no items between pages that have some", async () => {
      const { ask } = asking({
        0: { items: [1], next: 1 },
        1: { items: [], next: 2 },
        2: { items: [2], next: null },
      });
      expect(await fetchAllPages(ask, 10)).toEqual([1, 2]);
    });

    it("asks the pages one after the other: the next page is not asked before the last one answered", async () => {
      const log: string[] = [];
      const ask = async (page: number): Promise<Answer> => {
        log.push(`start ${page}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`end ${page}`);
        return { items: [page], next: page < 2 ? page + 1 : null };
      };
      expect(await fetchAllPages(ask, 10)).toEqual([0, 1, 2]);
      expect(log).toEqual(["start 0", "end 0", "start 1", "end 1", "start 2", "end 2"]);
    });

    it("gives a new array, and not the array of a page", async () => {
      const page = [1, 2, 3];
      const { ask } = asking({ 0: { items: page, next: null } });
      const items = await fetchAllPages(ask, 1);
      expect(items).toEqual(page);
      expect(items).not.toBe(page);
    });

    it("takes a page of half a million items: it does not spread them into a call", async () => {
      const items = Array.from({ length: 500_000 }, (_, at) => at);
      const { ask } = asking({ 0: { items, next: 1 }, 1: { items: [-1], next: null } });
      const all = await fetchAllPages(ask, 5);
      expect(all).toHaveLength(500_001);
      expect(all[500_000]).toBe(-1);
    });

    it("keeps the items as they are: it does not look at them", async () => {
      const odd = [null, undefined, "x", { a: 1 }, [1]] as unknown as number[];
      const { ask } = asking({ 0: { items: odd, next: null } });
      expect(await fetchAllPages(ask, 1)).toEqual(odd);
    });
  });

  describe("the limit of pages", () => {
    it("fails as too large when the limit is reached while a page gives another", async () => {
      const ask = jest.fn(async (page: number): Promise<Answer> => ({
        items: [page],
        next: page + 1,
      }));
      const failure = await failureOf(fetchAllPages(ask, 3));
      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect(ask.mock.calls.map(([page]) => page)).toEqual([0, 1, 2]);
    });

    it("takes a list of just as many pages as the limit", async () => {
      const { ask, asked } = asking({
        0: { items: [1], next: 1 },
        1: { items: [2], next: 2 },
        2: { items: [3], next: null },
      });
      expect(await fetchAllPages(ask, 3)).toEqual([1, 2, 3]);
      expect(asked).toEqual([0, 1, 2]);
    });

    it("fails a list of one page more than the limit, and asks no page past it", async () => {
      const { ask, asked } = asking({
        0: { items: [1], next: 1 },
        1: { items: [2], next: 2 },
        2: { items: [3], next: null },
      });
      expect(await failureOf(fetchAllPages(ask, 2))).toBeInstanceOf(BodyTooLargeError);
      expect(asked).toEqual([0, 1]);
    });

    it("gives no part of the items when it fails: a partial list is never given", async () => {
      const { ask } = asking({
        0: { items: [1, 2], next: 1 },
        1: { items: [3, 4], next: 2 },
        2: { items: [5], next: null },
      });
      const result = await fetchAllPages(ask, 2).then(
        (items) => ({ items }),
        (error: unknown) => ({ error }),
      );
      expect(result).toHaveProperty("error");
      expect(result).not.toHaveProperty("items");
    });

    it.each([
      ["none", 0],
      ["not a number", Number.NaN],
      ["negative", -3],
    ])("lets no page be asked when the limit is %s", async (_name, limit) => {
      const { ask, asked } = asking({ 0: { items: [1], next: null } });
      expect(await failureOf(fetchAllPages(ask, limit))).toBeInstanceOf(BodyTooLargeError);
      expect(asked).toEqual([]);
    });

    it("takes the whole number below a limit that is a fraction", async () => {
      const ask = jest.fn(async (page: number): Promise<Answer> => ({
        items: [page],
        next: page + 1,
      }));
      await failureOf(fetchAllPages(ask, 2.9));
      expect(ask).toHaveBeenCalledTimes(2);
    });

    it("takes a thousand pages when the limit allows", async () => {
      const ask = async (page: number): Promise<Answer> => ({
        items: [page],
        next: page < 999 ? page + 1 : null,
      });
      expect(await fetchAllPages(ask, 1000)).toHaveLength(1000);
    });
  });

  describe("the total that a page says", () => {
    it("fails as unreachable when the items are fewer than the total at the end", async () => {
      const { ask } = asking({
        0: { items: [1, 2], next: 1, total: 5 },
        1: { items: [3, 4], next: null, total: 5 },
      });
      const failure = await failureOf(fetchAllPages(ask, 10));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("gives the items when they are as many as the total", async () => {
      const { ask } = asking({
        0: { items: [1, 2], next: 1, total: 4 },
        1: { items: [3, 4], next: null, total: 4 },
      });
      expect(await fetchAllPages(ask, 10)).toEqual([1, 2, 3, 4]);
    });

    it("gives the items when they are more than the total: only a list that lacks is refused", async () => {
      const { ask } = asking({ 0: { items: [1, 2, 3], next: null, total: 2 } });
      expect(await fetchAllPages(ask, 10)).toEqual([1, 2, 3]);
    });

    it("counts the total that any page gives: the last page only, or the first only", async () => {
      const first = asking({
        0: { items: [1], next: 1, total: 3 },
        1: { items: [2], next: null },
      });
      expect(await failureOf(fetchAllPages(first.ask, 10))).toBeInstanceOf(FetchError);
      const last = asking({
        0: { items: [1], next: 1 },
        1: { items: [2], next: null, total: 3 },
      });
      expect(await failureOf(fetchAllPages(last.ask, 10))).toBeInstanceOf(FetchError);
      const middle = asking({
        0: { items: [1], next: 1 },
        1: { items: [2], next: 2, total: 3 },
        2: { items: [3], next: null },
      });
      expect(await fetchAllPages(middle.ask, 10)).toEqual([1, 2, 3]);
    });

    it("holds the list to the largest total that a page gives", async () => {
      const { ask } = asking({
        0: { items: [1, 2], next: 1, total: 5 },
        1: { items: [3, 4], next: null, total: 3 },
      });
      expect(await failureOf(fetchAllPages(ask, 10))).toBeInstanceOf(FetchError);
    });

    it("takes a total of nothing for an empty list", async () => {
      const { ask } = asking({ 0: { items: [], next: null, total: 0 } });
      expect(await fetchAllPages(ask, 10)).toEqual([]);
    });

    it("takes a list that says no total, or null for it, as a list that has none to check", async () => {
      const { ask } = asking({ 0: { items: [1], next: null } });
      expect(await fetchAllPages(ask, 10)).toEqual([1]);
      const nulled = jest.fn(async () => ({ items: [1], next: null, total: null }));
      expect(
        await fetchAllPages(nulled as unknown as (page: number) => Promise<Answer>, 10),
      ).toEqual([1]);
    });

    it.each([
      ["not a number", Number.NaN],
      ["negative", -1],
      ["a fraction", 1.5],
      ["infinite", Number.POSITIVE_INFINITY],
      ["a text", "3"],
      ["an object", {}],
    ])("fails as not the list when a total is %s", async (_name, total) => {
      const ask = async () => ({ items: [1], next: null, total }) as unknown as Answer;
      expect(await failureOf(fetchAllPages(ask, 10))).toBeInstanceOf(NotTheListError);
    });
  });

  describe("a page that is not as it should be", () => {
    it.each([
      ["a next that is not a number", "1"],
      ["a next that is NaN", Number.NaN],
      ["a next that is negative", -1],
      ["a next that is a fraction", 0.5],
      ["a next that is infinite", Number.POSITIVE_INFINITY],
      ["a next that is missing", undefined],
      ["a next that is an object", {}],
      ["a next that is false", false],
    ])(
      "fails as not the list for %s: it says nothing of where the list goes on",
      async (_name, next) => {
        const ask = async () => ({ items: [1], next }) as unknown as Answer;
        expect(await failureOf(fetchAllPages(ask, 10))).toBeInstanceOf(NotTheListError);
      },
    );

    it("fails as not the list when a page gives a next that was asked: a list that goes round", async () => {
      const { ask, asked } = asking({
        0: { items: [1], next: 1 },
        1: { items: [2], next: 0 },
      });
      expect(await failureOf(fetchAllPages(ask, 100))).toBeInstanceOf(NotTheListError);
      expect(asked).toEqual([0, 1]);
    });

    it("fails as not the list when a page gives itself as the next", async () => {
      const { ask, asked } = asking({ 0: { items: [1], next: 0 } });
      expect(await failureOf(fetchAllPages(ask, 100))).toBeInstanceOf(NotTheListError);
      expect(asked).toEqual([0]);
    });

    it.each([
      ["no items", { next: null }],
      ["items that are a text", { items: "abc", next: null }],
      ["items that are an object", { items: {}, next: null }],
      ["items that are null", { items: null, next: null }],
      ["no answer", undefined],
      ["an answer that is null", null],
      ["an answer that is a text", "page"],
      ["an answer that is an array", []],
    ])("fails as not the list for %s", async (_name, answer) => {
      const ask = async () => answer as unknown as Answer;
      expect(await failureOf(fetchAllPages(ask, 10))).toBeInstanceOf(NotTheListError);
    });
  });

  describe("a failure of the asking", () => {
    it("goes through as it is, and no part of the items is given", async () => {
      const ask = jest.fn(async (page: number): Promise<Answer> => {
        if (page === 1) throw new FetchError("blocked_by_site", undefined, { status: 429 });
        return { items: [page], next: page + 1 };
      });
      const failure = await failureOf(fetchAllPages(ask, 10));
      expect(failure).toBeInstanceOf(FetchError);
      expect(failure).toMatchObject({ reason: "blocked_by_site", status: 429 });
      expect(ask).toHaveBeenCalledTimes(2);
    });

    it("goes through for a failure of any kind, an error of the asker's own included", async () => {
      const bug = new TypeError("a bug of the asker");
      const failure = await failureOf(
        fetchAllPages(async () => {
          throw bug;
        }, 10),
      );
      expect(failure).toBe(bug);
    });

    it("goes through for a body that was too large", async () => {
      const failure = await failureOf(
        fetchAllPages(async () => {
          throw new BodyTooLargeError();
        }, 10),
      );
      expect(failure).toBeInstanceOf(BodyTooLargeError);
    });
  });

  it("is asked for pages by number, so that it can be used with the fetch that checks the pin", async () => {
    const files: Record<string, { body: string; contentType: string }> = {
      "https://api.example.org/v1/items?page=0": {
        body: JSON.stringify({ items: [1, 2], next: 1 }),
        contentType: "application/json",
      },
      "https://api.example.org/v1/items?page=1": {
        body: JSON.stringify({ items: [3], next: null }),
        contentType: "application/json",
      },
    };
    const fetch = pinnedFetch(fakeFetch(files), PIN);
    const items = await fetchAllPages<number>(async (page) => {
      const response = await fetch(`https://api.example.org/v1/items?page=${page}`, {}, LIMITS);
      if (response.notModified) throw new FetchError("unreachable");
      return JSON.parse(response.body.toString("utf8")) as Answer;
    }, 10);
    expect(items).toEqual([1, 2, 3]);
  });
});
