import {
  FetchError,
  FetchFailureReason,
  GuardedFetchOptions,
  GuardedResponse,
  guardedFetch,
} from "../guardedFetch";
import { PageReadError, createPageReader, decodeBody } from "../readPage";

type Answer = { contentType?: string; body?: string | Buffer; url?: string } | Error;

/**
 * A stand-in for guardedFetch. Like the real one it calls `beforeRequest` for the URL before it
 * "sends" anything, so `requested` lists what would have gone out on the network. A URL with no
 * answer is a 404. It records the options exactly as it was called with them.
 */
function fakeFetch(answers: Record<string, Answer>) {
  const calls: Array<{ url: string; options: GuardedFetchOptions | undefined }> = [];
  const requested: string[] = [];
  const fetch = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
    calls.push({ url, options });
    if (options?.beforeRequest) await options.beforeRequest(new URL(url));
    requested.push(url);
    const answer = answers[url] ?? new FetchError("not_found");
    if (answer instanceof Error) throw answer;
    const body = answer.body ?? "";
    const response: GuardedResponse = {
      url: answer.url ?? url,
      status: 200,
      contentType: answer.contentType ?? "text/html; charset=utf-8",
      body: Buffer.isBuffer(body) ? body : Buffer.from(body),
      truncated: false,
    };
    return response;
  });
  return { fetch: fetch as unknown as typeof guardedFetch, calls, requested, mock: fetch };
}

const ROBOTS = "https://acme.com/robots.txt";
const PAGE_URL = "https://acme.com/trust";
const HTML =
  "<html><head><title>Trust center | Acme</title>" +
  '<meta property="article:published_time" content="2026-03-04T10:00:00Z"></head>' +
  '<body><nav><a href="/pricing">Pricing</a></nav><h1>Trust</h1><p>We are SOC 2 certified.</p>' +
  '<footer><a href="/privacy#top">Privacy</a> <a href="mailto:x@acme.com">Mail</a></footer></body></html>';

async function failureOf(promise: Promise<unknown>): Promise<PageReadError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PageReadError) return error;
    throw error;
  }
  throw new Error("Expected the read to fail");
}

describe("decodeBody", () => {
  it("decodes UTF-8 by default", () => {
    expect(decodeBody(Buffer.from("café — \u{1F600}", "utf8"), "text/html")).toBe(
      "café — \u{1F600}",
    );
    expect(decodeBody(Buffer.from("café", "utf8"), "")).toBe("café");
  });

  it("drops a byte order mark", () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("ok")]);
    expect(decodeBody(body, "text/html")).toBe("ok");
  });

  it("uses the charset of the header, in any case and with quotes", () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    expect(decodeBody(latin1, "text/html; charset=iso-8859-1")).toBe("café");
    expect(decodeBody(latin1, "text/html; Charset=ISO-8859-1")).toBe("café");
    expect(decodeBody(latin1, 'text/html; charset="windows-1252"; format=flowed')).toBe("café");
  });

  it("honours a meta charset in the first 2 KB when the header has no charset", () => {
    const body = Buffer.concat([
      Buffer.from('<html><head><meta charset="windows-1252"></head><body>caf', "latin1"),
      Buffer.from([0xe9]),
    ]);
    expect(decodeBody(body, "text/html")).toContain("café");
    const httpEquiv = Buffer.concat([
      Buffer.from(
        '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">caf',
        "latin1",
      ),
      Buffer.from([0xe9]),
    ]);
    expect(decodeBody(httpEquiv, "")).toContain("café");
  });

  it("lets the header win over the meta tag", () => {
    const body = Buffer.concat([
      Buffer.from('<meta charset="windows-1252">caf', "latin1"),
      Buffer.from([0xc3, 0xa9]),
    ]);
    expect(decodeBody(body, "text/html; charset=utf-8")).toBe('<meta charset="windows-1252">café');
  });

  it("does not look for a meta charset past the first 2 KB", () => {
    const body = Buffer.concat([
      Buffer.from(" ".repeat(2100) + '<meta charset="windows-1252">', "latin1"),
      Buffer.from([0xc3, 0xa9]),
    ]);
    expect(decodeBody(body, "text/html")).toContain("é");
  });

  it("falls back to UTF-8 for a charset label it does not know", () => {
    expect(decodeBody(Buffer.from("café", "utf8"), "text/html; charset=no-such-charset")).toBe(
      "café",
    );
    expect(decodeBody(Buffer.from("café", "utf8"), "text/html; charset=")).toBe("café");
    const meta = Buffer.from('<meta charset="no-such-charset">café', "utf8");
    expect(decodeBody(meta, "text/html")).toBe('<meta charset="no-such-charset">café');
  });

  it("replaces bytes that are not valid in the charset instead of failing", () => {
    expect(decodeBody(Buffer.from([0x61, 0xff, 0x62]), "text/html")).toBe("a�b");
  });
});

describe("createPageReader", () => {
  describe("what a page becomes", () => {
    it("turns an HTML answer into a page with its title, date, text, links and final URL", async () => {
      const { fetch } = fakeFetch({
        [ROBOTS]: { contentType: "text/plain", body: "User-agent: *\nAllow: /" },
        [PAGE_URL]: { url: "https://www.acme.com/trust/", body: HTML },
      });
      const page = await createPageReader({ fetch })(PAGE_URL);
      expect(page).toEqual({
        url: "https://www.acme.com/trust/",
        title: "Trust center | Acme",
        publishedAt: "2026-03-04T10:00:00.000Z",
        text: "Trust\n\nWe are SOC 2 certified.",
        links: [
          { text: "Pricing", url: "https://www.acme.com/pricing" },
          { text: "Privacy", url: "https://www.acme.com/privacy" },
        ],
      });
    });

    it("decodes the page with the charset of the header", async () => {
      const body = Buffer.concat([
        Buffer.from("<p>Caf", "latin1"),
        Buffer.from([0xe9]),
        Buffer.from("</p>", "latin1"),
      ]);
      const { fetch } = fakeFetch({
        [PAGE_URL]: { contentType: "text/html; charset=iso-8859-1", body },
      });
      expect((await createPageReader({ fetch })(PAGE_URL)).text).toBe("Café");
    });

    it("reads plain text as text, with no title, no date and no links", async () => {
      const { fetch } = fakeFetch({
        [PAGE_URL]: {
          contentType: "text/plain; charset=utf-8",
          body: "Security policy <b>\r\n\r\n\r\n\r\nWe   keep  <a href='/x'>data</a> safe.  \r\n",
        },
      });
      expect(await createPageReader({ fetch })(PAGE_URL)).toEqual({
        url: PAGE_URL,
        title: "",
        publishedAt: null,
        text: "Security policy <b>\n\nWe keep <a href='/x'>data</a> safe.",
        links: [],
      });
    });

    it("sends every media type other than text/plain through the HTML reader", async () => {
      const { fetch } = fakeFetch({
        [PAGE_URL]: {
          contentType: "application/xhtml+xml",
          body: "<html><head><title>X</title></head><body><p>Hi</p></body></html>",
        },
        "https://acme.com/feed": {
          contentType: "application/rss+xml",
          body: "<rss><channel><title>Feed</title><item><description>One</description></item></channel></rss>",
        },
      });
      const read = createPageReader({ fetch });
      expect(await read(PAGE_URL)).toMatchObject({ title: "X", text: "Hi" });
      expect(await read("https://acme.com/feed")).toMatchObject({ title: "Feed" });
    });

    it("returns a small page with no text as it is", async () => {
      const { fetch } = fakeFetch({ [PAGE_URL]: { body: "<html><body></body></html>" } });
      expect(await createPageReader({ fetch })(PAGE_URL)).toMatchObject({ text: "", links: [] });
    });

    it("refuses a large page with almost no text as one that needs JavaScript", async () => {
      const shell = `<html><head><script>${"var a=1;".repeat(5000)}</script></head><body><div id="root"></div></body></html>`;
      const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell } });
      const error = await failureOf(createPageReader({ fetch })(PAGE_URL));
      expect(error.reason).toBe("needs_javascript");
      expect(error.name).toBe("PageReadError");
    });

    it("does not treat a large page with a fair amount of text as a shell", async () => {
      const body = `<html><body><p>${"Word ".repeat(400)}</p><script>${"a".repeat(30_000)}</script></body></html>`;
      const { fetch } = fakeFetch({ [PAGE_URL]: { body } });
      expect((await createPageReader({ fetch })(PAGE_URL)).text.length).toBeGreaterThan(1000);
    });
  });

  describe("failures", () => {
    const REASONS: FetchFailureReason[] = [
      "not_allowed",
      "blocked_by_robots",
      "blocked_by_site",
      "not_found",
      "unsupported_type",
      "unreachable",
    ];

    it.each(REASONS)("passes the fetch failure %s on as the same reason", async (reason) => {
      const { fetch } = fakeFetch({ [PAGE_URL]: new FetchError(reason) });
      const error = await failureOf(createPageReader({ fetch })(PAGE_URL));
      expect(error).toBeInstanceOf(Error);
      expect(error.reason).toBe(reason);
      expect(error.message).toBe(new FetchError(reason).message);
      expect(error.message).not.toContain("acme.com");
    });

    it("reports a failure that is not a FetchError as unreachable", async () => {
      const { fetch } = fakeFetch({ [PAGE_URL]: new TypeError("boom") });
      expect((await failureOf(createPageReader({ fetch })(PAGE_URL))).reason).toBe("unreachable");
    });

    it("hands the abort signal on to the fetch", async () => {
      const { fetch, calls } = fakeFetch({ [PAGE_URL]: { body: "<p>Hi there</p>" } });
      const controller = new AbortController();
      await createPageReader({ fetch })(PAGE_URL, controller.signal);
      const page = calls.find((call) => call.url === PAGE_URL);
      expect(page?.options?.signal).toBe(controller.signal);
      expect(page?.options).toEqual({
        signal: controller.signal,
        beforeRequest: expect.any(Function),
      });
    });
  });

  describe("robots.txt", () => {
    const robotsAnswer = (body: string): Answer => ({ contentType: "text/plain", body });

    it("refuses a path that robots.txt disallows and never requests the page", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nDisallow: /private"),
        "https://acme.com/private/page": { body: HTML },
      });
      const error = await failureOf(createPageReader({ fetch })("https://acme.com/private/page"));
      expect(error.reason).toBe("blocked_by_robots");
      expect(requested).toEqual([ROBOTS]);
    });

    it("reads the group for our bot, and a path that robots.txt allows", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer(
          "User-agent: *\nDisallow: /\n\nUser-agent: VerifyWiseResearchBot\nDisallow: /private\n",
        ),
        [PAGE_URL]: { body: HTML },
      });
      expect((await createPageReader({ fetch })(PAGE_URL)).title).toBe("Trust center | Acme");
      expect(requested).toEqual([ROBOTS, PAGE_URL]);
    });

    it("allows the page when robots.txt does not exist or the site refuses to show it", async () => {
      for (const reason of ["not_found", "blocked_by_site"] as const) {
        const { fetch, requested } = fakeFetch({
          [ROBOTS]: new FetchError(reason),
          [PAGE_URL]: { body: HTML },
        });
        expect((await createPageReader({ fetch })(PAGE_URL)).title).toBe("Trust center | Acme");
        expect(requested).toEqual([ROBOTS, PAGE_URL]);
      }
    });

    it("disallows the page when robots.txt cannot be fetched for any other reason", async () => {
      for (const reason of ["unreachable", "not_allowed", "unsupported_type"] as const) {
        const { fetch, requested } = fakeFetch({
          [ROBOTS]: new FetchError(reason),
          [PAGE_URL]: { body: HTML },
        });
        const error = await failureOf(createPageReader({ fetch })(PAGE_URL));
        expect(error.reason).toBe("blocked_by_robots");
        expect(requested).toEqual([ROBOTS]);
      }
    });

    it("fetches robots.txt once per origin for one reader, also for concurrent reads", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
        "https://acme.com/other": { body: HTML },
        "https://www.acme.com/robots.txt": robotsAnswer("User-agent: *\nAllow: /"),
        "https://www.acme.com/page": { body: HTML },
      });
      const read = createPageReader({ fetch });
      await Promise.all([read(PAGE_URL), read("https://acme.com/other")]);
      await read(PAGE_URL);
      await read("https://www.acme.com/page");
      expect(requested.filter((url) => url.endsWith("/robots.txt"))).toEqual([
        ROBOTS,
        "https://www.acme.com/robots.txt",
      ]);
    });

    it("keeps one robots cache per reader", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
      });
      await createPageReader({ fetch })(PAGE_URL);
      await createPageReader({ fetch })(PAGE_URL);
      expect(requested.filter((url) => url === ROBOTS)).toHaveLength(2);
    });

    it("fetches robots.txt with its own limits, with no signal and no robots check of its own", async () => {
      const { fetch, calls } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
      });
      await createPageReader({ fetch })(PAGE_URL, new AbortController().signal);
      const robots = calls.find((call) => call.url === ROBOTS);
      expect(robots?.options).toEqual({
        maxBytes: 65_536,
        headerTimeoutMs: 5_000,
        totalTimeoutMs: 5_000,
      });
      expect(robots?.options).not.toHaveProperty("signal");
      expect(robots?.options).not.toHaveProperty("beforeRequest");
    });

    it("checks every hop through the same robots rules", async () => {
      // The real fetch calls beforeRequest for each redirect hop; this one calls it twice.
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nDisallow: /blocked"),
      });
      const hops = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
        await options?.beforeRequest?.(new URL(url));
        await options?.beforeRequest?.(new URL("https://acme.com/blocked/next"));
        return fetch(url, options);
      });
      const error = await failureOf(
        createPageReader({ fetch: hops as unknown as typeof guardedFetch })(PAGE_URL),
      );
      expect(error.reason).toBe("blocked_by_robots");
      expect(requested).toEqual([ROBOTS]);
    });

    it("decodes robots.txt with its charset", async () => {
      const { fetch } = fakeFetch({
        [ROBOTS]: {
          contentType: "text/plain; charset=iso-8859-1",
          body: Buffer.concat([
            Buffer.from("User-agent: *\nDisallow: /caf", "latin1"),
            Buffer.from([0xe9]),
          ]),
        },
      });
      const error = await failureOf(createPageReader({ fetch })("https://acme.com/café"));
      expect(error.reason).toBe("blocked_by_robots");
    });
  });
});
