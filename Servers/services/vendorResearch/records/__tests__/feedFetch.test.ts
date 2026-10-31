import {
  FetchError,
  type GuardedFetchOptions,
  type GuardedResponse,
  guardedFetch,
} from "../../../webResearch/guardedFetch";
import { fetchFeed } from "../feedFetch";

jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch: jest.fn(),
}));

const guarded = guardedFetch as jest.MockedFunction<typeof guardedFetch>;
const signal = new AbortController().signal;
const FEED = "https://status.acme.com/history.atom";
const ROBOTS = "https://status.acme.com/robots.txt";

const response = (body: string, over: Partial<GuardedResponse> = {}): GuardedResponse => ({
  url: FEED,
  status: 200,
  contentType: "application/atom+xml; charset=utf-8",
  body: Buffer.from(body),
  truncated: false,
  ...over,
});

/**
 * A fetch that answers from a table by address, and, like the real one, asks `beforeRequest` about
 * the address before it answers: a table entry that is an Error is thrown.
 */
function website(table: Record<string, GuardedResponse | Error>) {
  const requested: string[] = [];
  guarded.mockImplementation(async (url: string, options?: GuardedFetchOptions) => {
    // A request is sent when the address has passed `beforeRequest`.
    if (options?.beforeRequest !== undefined) await options.beforeRequest(new URL(url));
    requested.push(url);
    const answer = table[url];
    if (answer === undefined) throw new FetchError("not_found");
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return requested;
}

beforeEach(() => guarded.mockReset());

describe("fetchFeed", () => {
  it("asks for robots.txt first, then for the feed, and gives the text of the feed", async () => {
    const requested = website({
      [ROBOTS]: response("User-agent: *\nDisallow: /api/\n", { contentType: "text/plain" }),
      [FEED]: response("<feed>é</feed>"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).resolves.toBe("<feed>é</feed>");

    expect(requested).toEqual([ROBOTS, FEED]);
  });

  it("asks for an Atom feed or another XML within the size it is given, with the signal it is given", async () => {
    website({ [ROBOTS]: response("", { contentType: "text/plain" }), [FEED]: response("<feed/>") });

    await fetchFeed(FEED, { maxBytes: 12_345, signal });

    const options = guarded.mock.calls.find(([url]) => url === FEED)?.[1];
    expect(options).toMatchObject({ maxBytes: 12_345, signal });
    expect(options?.allowedContentTypes).toEqual([
      "application/atom+xml",
      "application/xml",
      "text/xml",
    ]);
    expect(options?.beforeRequest).toEqual(expect.any(Function));
  });

  it("reads robots.txt with a small size and a short time, whatever its type, and with the signal", async () => {
    website({ [ROBOTS]: response("", { contentType: "text/plain" }), [FEED]: response("<feed/>") });

    await fetchFeed(FEED, { maxBytes: 99, signal });

    expect(guarded.mock.calls.find(([url]) => url === ROBOTS)?.[1]).toEqual({
      allowedContentTypes: ["text/plain", "*/*"],
      maxBytes: 65_536,
      headerTimeoutMs: 5_000,
      totalTimeoutMs: 5_000,
      signal,
    });
  });

  it("does not ask for a feed that robots.txt disallows to our robot, and says why", async () => {
    const requested = website({
      [ROBOTS]: response("User-agent: VerifyWiseResearchBot\nDisallow: /history\n", {
        contentType: "text/plain",
      }),
      [FEED]: response("<feed/>"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).rejects.toMatchObject({
      reason: "blocked_by_robots",
    });

    expect(requested).toEqual([ROBOTS]);
  });

  it("is not stopped by the rule that keeps robots from the API of Statuspage", async () => {
    website({
      [ROBOTS]: response("User-agent: *\nDisallow: /api/\nDisallow: /embed/\n", {
        contentType: "text/plain",
      }),
      [FEED]: response("<feed/>"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).resolves.toBe("<feed/>");
  });

  it("allows the feed of a site that has no robots.txt, or refuses to show it", async () => {
    website({ [FEED]: response("<feed/>") });
    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).resolves.toBe("<feed/>");

    website({ [ROBOTS]: new FetchError("blocked_by_site"), [FEED]: response("<feed/>") });
    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).resolves.toBe("<feed/>");
  });

  it("allows nothing when robots.txt cannot be reached", async () => {
    const requested = website({
      [ROBOTS]: new FetchError("unreachable"),
      [FEED]: response("<feed/>"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).rejects.toMatchObject({
      reason: "blocked_by_robots",
    });

    expect(requested).toEqual([ROBOTS]);
  });

  it("takes for a missing robots.txt only the answer of the fetch, and not an error that looks like it", async () => {
    const requested = website({
      [ROBOTS]: Object.assign(new Error("not an answer of the fetch"), { reason: "not_found" }),
      [FEED]: response("<feed/>"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).rejects.toMatchObject({
      reason: "blocked_by_robots",
    });

    expect(requested).toEqual([ROBOTS]);
  });

  it("asks robots.txt of the origin that a redirect leads to, and once for each origin", async () => {
    const hop = "https://acme.statuspage.io/history.atom";
    const requested: string[] = [];
    guarded.mockImplementation(async (url: string, options?: GuardedFetchOptions) => {
      if (url.endsWith("/robots.txt")) {
        requested.push(url);
        return response(
          url.startsWith("https://acme.statuspage.io") ? "User-agent: *\nDisallow: /history\n" : "",
          { contentType: "text/plain" },
        );
      }
      // The first address answers with a redirect: the fetch asks about the next address.
      await options?.beforeRequest?.(new URL(url));
      requested.push(url);
      await options?.beforeRequest?.(new URL(hop));
      requested.push(hop);
      return response("<feed/>");
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).rejects.toMatchObject({
      reason: "blocked_by_robots",
    });

    expect(requested).toEqual([ROBOTS, FEED, "https://acme.statuspage.io/robots.txt"]);
  });

  it("asks robots.txt once for an origin however many addresses it is asked about", async () => {
    const requested: string[] = [];
    guarded.mockImplementation(async (url: string, options?: GuardedFetchOptions) => {
      if (url.endsWith("/robots.txt")) {
        requested.push(url);
        return response("", { contentType: "text/plain" });
      }
      await options?.beforeRequest?.(new URL(url));
      await options?.beforeRequest?.(new URL("https://status.acme.com/other"));
      requested.push(url);
      return response("<feed/>");
    });

    await fetchFeed(FEED, { maxBytes: 99, signal });

    expect(requested.filter((url) => url.endsWith("/robots.txt"))).toEqual([ROBOTS]);
  });

  it("asks robots.txt again on the next call: nothing is kept between calls", async () => {
    const requested = website({
      [ROBOTS]: response("", { contentType: "text/plain" }),
      [FEED]: response("<feed/>"),
    });

    await fetchFeed(FEED, { maxBytes: 99, signal });
    await fetchFeed(FEED, { maxBytes: 99, signal });

    expect(requested).toEqual([ROBOTS, FEED, ROBOTS, FEED]);
  });

  it("does not read a feed that was cut, even when what is left parses", async () => {
    website({
      [ROBOTS]: response("", { contentType: "text/plain" }),
      [FEED]: response("<feed></feed>", { truncated: true }),
    });

    await expect(fetchFeed(FEED, { maxBytes: 5, signal })).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });

  it("decodes the feed in the charset of its header", async () => {
    website({
      [ROBOTS]: response("", { contentType: "text/plain" }),
      [FEED]: response("", {
        contentType: "text/xml; charset=iso-8859-1",
        body: Buffer.from([0x3c, 0x66, 0x3e, 0xe9, 0x3c, 0x2f, 0x66, 0x3e]),
      }),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).resolves.toBe("<f>é</f>");
  });

  it("passes on the failure of the fetch of the feed", async () => {
    website({
      [ROBOTS]: response("", { contentType: "text/plain" }),
      [FEED]: new FetchError("not_found"),
    });

    await expect(fetchFeed(FEED, { maxBytes: 99, signal })).rejects.toMatchObject({
      reason: "not_found",
    });
  });

  it("reads robots.txt of the origin only, whatever the path of the feed", async () => {
    const requested = website({
      [ROBOTS]: response("", { contentType: "text/plain" }),
      "https://status.acme.com/a/b/history.atom?x=1": response("<feed/>"),
    });

    await fetchFeed("https://status.acme.com/a/b/history.atom?x=1", { maxBytes: 99, signal });

    expect(requested).toEqual([ROBOTS, "https://status.acme.com/a/b/history.atom?x=1"]);
  });

  it("checks the query of the address against the rules, as the page reader does", async () => {
    website({
      [ROBOTS]: response("User-agent: *\nDisallow: /history.atom?x=1\n", {
        contentType: "text/plain",
      }),
      "https://status.acme.com/history.atom?x=1": response("<feed/>"),
    });

    await expect(
      fetchFeed("https://status.acme.com/history.atom?x=1", { maxBytes: 99, signal }),
    ).rejects.toMatchObject({ reason: "blocked_by_robots" });
  });
});
