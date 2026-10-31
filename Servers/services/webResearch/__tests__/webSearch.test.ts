import fs from "fs";
import path from "path";
import { Readable } from "stream";
import http from "http";
import {
  FetchError,
  FetchFailureReason,
  GuardedFetchOptions,
  GuardedResponse,
  Transport,
  guardedFetch,
} from "../guardedFetch";
import { MAX_SNIPPET_CHARS } from "../../vendorResearch/text";
import {
  MAX_RESULTS,
  MIN_SEARCH_GAP_MS,
  SEARCH_FEED_MAX_BYTES,
  SearchEngineError,
  SearchQueue,
  buildBingUrl,
  createBingEngine,
  createSearchQueue,
  parseBingRss,
} from "../webSearch";
import { memoryCache, settle } from "./helpers/memoryCache";

const fixture = (name: string): string =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const rss = (items: string): string =>
  `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;

/** One feed item. A field that is not given is left out of the item. */
function item(fields: {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}): string {
  const tag = (name: string, value: string | undefined) =>
    value === undefined ? "" : `<${name}>${value}</${name}>`;
  return (
    "<item>" +
    tag("title", fields.title ?? "A title") +
    tag("link", fields.link) +
    tag("description", fields.description) +
    tag("pubDate", fields.pubDate) +
    "</item>"
  );
}

const BOM = "\uFEFF";

const CONSENT_PAGE =
  "<!DOCTYPE html><html><head><title>Before you continue</title></head><body>" +
  "<form action='https://consent.example.com/accept'><button>Accept all</button></form>" +
  "<a href='https://example.com/rss'>Our feed</a></body></html>";

describe("buildBingUrl", () => {
  it("builds the web search feed URL", () => {
    expect(buildBingUrl("Okta security breach", "web")).toBe(
      "https://www.bing.com/search?q=Okta%20security%20breach&format=rss&setlang=en-US",
    );
  });

  it("uses the news path for news", () => {
    expect(buildBingUrl("Okta security breach", "news")).toBe(
      "https://www.bing.com/news/search?q=Okta%20security%20breach&format=rss&setlang=en-US",
    );
  });

  it("percent-encodes the characters that would end or change the query", () => {
    const query = 'say "hi" & #1 für';
    const url = buildBingUrl(query, "web");
    expect(url).toBe(
      "https://www.bing.com/search?q=say%20%22hi%22%20%26%20%231%20f%C3%BCr&format=rss&setlang=en-US",
    );
    expect(new URL(url).searchParams.get("q")).toBe(query);
  });

  it("encodes a lone surrogate as the replacement character instead of throwing", () => {
    expect(buildBingUrl("a\uD800b", "web")).toBe(
      "https://www.bing.com/search?q=a%EF%BF%BDb&format=rss&setlang=en-US",
    );
  });

  it("leaves out control characters", () => {
    expect(buildBingUrl("a\u0000b\u0007c", "web")).toContain("q=abc&");
  });
});

describe("parseBingRss", () => {
  it("returns the usable items of a web feed, in order", () => {
    expect(parseBingRss(fixture("bing-web.xml"))).toEqual([
      {
        title: "Acme Corp discloses a data breach",
        url: "https://example.com/blog/acme-breach",
        snippet:
          "Acme Corp said on Tuesday that attackers copied a customer database &amp; support files. The company is notifying those affected.",
        publishedAt: "2026-10-06T19:36:00.000Z",
        source: null,
      },
      {
        title: "Acme earns a SOC 2 Type II report & ISO 27001 certificate",
        url: "https://www.example.com/trust/certifications",
        snippet:
          "Independent auditors tested the controls that protect customer data & availability.",
        publishedAt: "2025-09-15T06:00:00.000Z",
        source: null,
      },
      {
        title: "Acme privacy policy",
        url: "https://example.com/legal/privacy",
        snippet: 'Acme’s privacy policy explains "processing" of personal data.',
        publishedAt: null,
        source: null,
      },
      {
        title: "Acme status page",
        url: "https://status.example.com/history",
        snippet: "Incident history for Acme services.",
        publishedAt: null,
        source: null,
      },
    ]);
  });

  it("takes the publisher address, source and date of a news feed", () => {
    expect(parseBingRss(fixture("bing-news.xml"))).toEqual([
      {
        title: "Acme confirms a breach of its support system",
        url: "https://example.com/news/story",
        snippet:
          "The company said hackers used valid credentials to reach its support case system, ...",
        publishedAt: "2026-10-11T02:27:00.000Z",
        source: "Example Daily",
      },
      {
        title: "Customers question how Acme handled the incident",
        url: "https://news.example.com/2026/10/a-b?id=7&ref=x",
        snippet: "Two customers said the notice came late.",
        publishedAt: "2026-10-09T14:05:00.000Z",
        source: "Example & Sons Gazette",
      },
      {
        title: "Acme named in a regulator's review",
        url: "https://other.example.org/review",
        snippet: "A story with no source name.",
        publishedAt: "2025-10-03T09:30:00.000Z",
        source: null,
      },
    ]);
  });

  it("decodes character references once", () => {
    const [result] = parseBingRss(
      rss(
        item({
          link: "https://example.com/a",
          title: "Q&amp;A &#x2013; &#169;",
          description: "&amp;lt;b&amp;gt; stays text, &amp;amp; too",
        }),
      ),
    );
    expect(result.title).toBe("Q&A – ©");
    expect(result.snippet).toBe("&lt;b&gt; stays text, &amp; too");
  });

  it("removes markup whether it is written as tags or as character references", () => {
    const [result] = parseBingRss(
      rss(
        item({
          link: "https://example.com/a",
          description:
            "<strong>One</strong> &lt;b&gt;two&lt;/b&gt; <![CDATA[<i>three</i>]]> <br/>four <!-- five -->",
        }),
      ),
    );
    expect(result.snippet).toBe("One two three four");
  });

  it("keeps a less-than sign that does not start a tag", () => {
    const [result] = parseBingRss(
      rss(item({ link: "https://example.com/a", description: "5 &lt; 6 and 7 &gt; 3, 1 <2" })),
    );
    expect(result.snippet).toBe("5 < 6 and 7 > 3, 1 <2");
  });

  it("collapses white space and removes control characters", () => {
    const [result] = parseBingRss(
      rss(
        item({
          link: "https://example.com/a",
          title: "  A\n\ttitle\u00a0with\u0000 gaps  ",
          description: "line one\r\n\r\n   line two&nbsp;&nbsp;end",
        }),
      ),
    );
    expect(result.title).toBe("A title with gaps");
    expect(result.snippet).toBe("line one line two end");
  });

  it("cuts a long snippet to MAX_SNIPPET_CHARS without splitting a surrogate pair", () => {
    const [plain, emoji] = parseBingRss(
      rss(
        item({ link: "https://example.com/a", description: "word ".repeat(2000) }) +
          item({ link: "https://example.com/b", description: "\u{1F600}".repeat(1000) }),
      ),
    );
    expect(plain.snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
    expect(plain.snippet.length).toBeGreaterThan(MAX_SNIPPET_CHARS - 5);
    expect(emoji.snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
    expect(emoji.snippet.length % 2).toBe(0);
    expect(emoji.snippet.charCodeAt(emoji.snippet.length - 1)).toBeGreaterThanOrEqual(0xdc00);
  });

  it.each([
    ["Tue, 06 Oct 2026 19:36:00 GMT", "2026-10-06T19:36:00.000Z"],
    ["6 Oct 2026 19:36 GMT", "2026-10-06T19:36:00.000Z"],
    ["Tue, 06 Oct 2026 19:36:00 +0200", "2026-10-06T17:36:00.000Z"],
    ["Tue, 06 Oct 2026 19:36:00 EST", "2026-10-07T00:36:00.000Z"],
  ])("reads the RFC 822 date %j", (pubDate, expected) => {
    const [result] = parseBingRss(rss(item({ link: "https://example.com/a", pubDate })));
    expect(result.publishedAt).toBe(expected);
  });

  it.each([
    "",
    "sometime last week",
    "hello 2",
    "0",
    "12345",
    "2026-10-06",
    "Tue, 06 Foo 2026 19:36:00 XYZ",
  ])(
    "gives a null date for %j, which JavaScript alone would read or refuse as it pleases",
    (pubDate) => {
      const [result] = parseBingRss(rss(item({ link: "https://example.com/a", pubDate })));
      expect(result.publishedAt).toBeNull();
    },
  );

  it("normalises the URL and keeps the first of two equal ones", () => {
    const results = parseBingRss(
      rss(
        item({ title: "first", link: "https://EXAMPLE.com/a#top" }) +
          item({ title: "second", link: "https://example.com/a" }) +
          item({ title: "third", link: "https://example.com/b" }),
      ),
    );
    expect(results.map((r) => [r.title, r.url])).toEqual([
      ["first", "https://example.com/a"],
      ["third", "https://example.com/b"],
    ]);
  });

  it.each([
    ["a link on bing.com", "https://bing.com/search?q=x"],
    ["a link on a bing.com subdomain", "https://r.bing.com/ck/a?u=a1aHR0"],
    ["a link on bing.com with a trailing dot", "https://www.bing.com./x"],
    ["a link on localhost", "http://localhost/admin"],
    ["a link with a port", "https://example.com:8443/a"],
    ["a link with credentials", "https://user:secret@example.com/a"],
    ["a link that is not an address", "not a link"],
    ["a link with another scheme", "ftp://example.com/a"],
    ["a link that is empty", ""],
    ["a link on the metadata address", "http://169.254.169.254/latest/meta-data/"],
  ])("drops %s", (_name, link) => {
    expect(parseBingRss(rss(item({ link })))).toEqual([]);
  });

  it("drops a wrapper link whose url parameter is on bing.com, in any nesting", () => {
    const inner = "https://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fexample.com%2fa";
    const wrapper = `http://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(inner)}`;
    expect(parseBingRss(rss(item({ link: wrapper.replace(/&/g, "&amp;") })))).toEqual([]);
  });

  it("unwraps a wrapper link whose address is longer than a plain link may be", () => {
    // Each é is two bytes, six characters once escaped: the address fits in 2,048 characters as the
    // parser writes it, and the wrapper, which escapes its scheme and slashes as well, does not.
    const target = `https://example.com/${"\u00e9".repeat(330)}`;
    const wrapper = `http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=${encodeURIComponent(target)}`;
    expect(new URL(target).href.length).toBeLessThanOrEqual(2048);
    expect(wrapper.length).toBeGreaterThan(2048);
    expect(parseBingRss(rss(item({ link: wrapper }))).map((r) => r.url)).toEqual([
      new URL(target).href,
    ]);
  });

  it("reads a link written as CDATA", () => {
    const results = parseBingRss(rss(item({ link: "<![CDATA[https://example.com/a?x=1&y=2]]>" })));
    expect(results.map((r) => r.url)).toEqual(["https://example.com/a?x=1&y=2"]);
  });

  it("returns at most MAX_RESULTS usable items, counting after the drops", () => {
    const dropped = item({ link: "http://127.0.0.1/x" }).repeat(5);
    const usable = Array.from({ length: 25 }, (_, i) =>
      item({ title: `Title ${i}`, link: `https://example.com/p/${i}` }),
    ).join("");
    const results = parseBingRss(rss(dropped + usable));
    expect(MAX_RESULTS).toBe(10);
    expect(results).toHaveLength(10);
    expect(results.map((r) => r.url)).toEqual(
      Array.from({ length: 10 }, (_, i) => `https://example.com/p/${i}`),
    );
  });

  it("returns an empty list for a feed without items", () => {
    expect(parseBingRss(rss(""))).toEqual([]);
    expect(parseBingRss('<rss version="2.0"><channel></channel></rss>')).toEqual([]);
    expect(parseBingRss('<?xml version="1.0"?>\n<rss version="2.0"/>')).toEqual([]);
  });

  it("reads a feed that starts with a byte order mark", () => {
    const xml = BOM + rss(item({ link: "https://example.com/a" }));
    expect(parseBingRss(xml).map((r) => r.url)).toEqual(["https://example.com/a"]);
  });

  it("skips an item that has no end, and a feed that was cut off in the middle of an item", () => {
    const whole = item({ link: "https://example.com/a" });
    expect(
      parseBingRss(rss(whole + "<item><title>cut</title><link>https://example.com/b</link>")),
    ).toHaveLength(1);
  });

  it.each([
    ["an HTML consent page", CONSENT_PAGE],
    ["an empty body", ""],
    ["a JSON body", '{"items":[{"link":"https://example.com"}]}'],
    ["an Atom feed", '<feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>'],
    ["an element that only starts with rss", "<rssx><channel><item></item></channel></rssx>"],
    [
      "items without an rss element",
      `<channel>${item({ link: "https://example.com/a" })}</channel>`,
    ],
    [
      "text before the rss element",
      "Please wait... " + rss(item({ link: "https://example.com/a" })),
    ],
  ])("throws a SearchEngineError for %s", (_name, body) => {
    expect(() => parseBingRss(body)).toThrow(SearchEngineError);
  });

  describe("what a result's text cannot do", () => {
    it("does not let CDATA text make a field of the item", () => {
      const xml = rss(
        "<item><title>Real title</title><link>https://example.com/real</link>" +
          "<description><![CDATA[Text </description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>" +
          "<link>https://evil.example/</link><title>Fake</title>]]></description></item>",
      );
      const [result] = parseBingRss(xml);
      expect(result.url).toBe("https://example.com/real");
      expect(result.title).toBe("Real title");
      expect(result.publishedAt).toBeNull();
      expect(result.snippet).toContain("Text");
    });

    it("does not let CDATA text make an item", () => {
      const xml = rss(
        item({
          link: "https://example.com/real",
          description:
            "<![CDATA[<item><title>Fake</title><link>https://evil.example/</link></item>]]>",
        }),
      );
      expect(parseBingRss(xml).map((r) => r.url)).toEqual(["https://example.com/real"]);
    });

    it("reads only the item's own fields, not those of the channel", () => {
      const xml = rss(item({ link: "https://example.com/a", title: "Item title" }));
      const results = parseBingRss(
        xml.replace("<channel>", "<channel><link>https://example.com/channel</link>"),
      );
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe("https://example.com/a");
    });

    it("takes the first of two fields with the same name", () => {
      const [result] = parseBingRss(
        rss(
          "<item><title>One</title><title>Two</title><link>https://example.com/a</link>" +
            "<link>https://example.com/b</link></item>",
        ),
      );
      expect(result).toMatchObject({ title: "One", url: "https://example.com/a" });
    });

    it("reads a field with attributes and an empty field written as a single tag", () => {
      const [result] = parseBingRss(
        rss(
          '<item><title type="text">Named</title><link>https://example.com/a</link>' +
            '<description/><News:Source id="1">Daily</News:Source></item>',
        ),
      );
      expect(result).toMatchObject({ title: "Named", snippet: "", source: "Daily" });
    });

    it("drops an item whose link is written as a single tag", () => {
      expect(parseBingRss(rss("<item><title>t</title><link/></item>"))).toEqual([]);
    });
  });

  describe("time", () => {
    const MEGABYTE = 1024 * 1024;
    const LINK = "<link>https://example.com/a</link>";
    const cases: Array<[string, string]> = [
      ["items opened and never closed", "<item><title>".repeat(Math.ceil(MEGABYTE / 13))],
      ["items closed without a link", "<item><title></item>".repeat(Math.ceil(MEGABYTE / 20))],
      ["titles opened inside one item", `<item>${"<title>".repeat(MEGABYTE / 7)}</item>`],
      ["tag names opened inside one item", `<item>${"<title <link ".repeat(MEGABYTE / 13)}</item>`],
      [
        "less-than signs in a description",
        `<item>${LINK}<description>${"<".repeat(MEGABYTE)}</description></item>`,
      ],
      [
        "tags that never end in a description",
        `<item>${LINK}<description>${"<a ".repeat(MEGABYTE / 3)}</description></item>`,
      ],
      [
        "CDATA sections in a description",
        `<item>${LINK}<description>${"<![CDATA[x]]>".repeat(MEGABYTE / 13)}</description></item>`,
      ],
      [
        "CDATA that never ends",
        `<item>${LINK}<description><![CDATA[${"x<![CDATA[".repeat(MEGABYTE / 10)}</description></item>`,
      ],
      [
        "character references in a description",
        `<item>${LINK}<description>${"&amp;".repeat(MEGABYTE / 5)}</description></item>`,
      ],
      [
        "white space in a date",
        `<item>${LINK}<pubDate>Tue, 06 Oct 2026${" ".repeat(MEGABYTE)}x</pubDate></item>`,
      ],
      [
        "ampersands in a link",
        `<item><link>http://www.bing.com/a?${"&amp;url=".repeat(MEGABYTE / 9)}</link></item>`,
      ],
    ];

    it.each(cases)("parses %s in under 1,000 ms", (_name, body) => {
      const xml = `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`;
      expect(xml.length).toBeGreaterThanOrEqual(MEGABYTE - 1000);
      const started = performance.now();
      const results = parseBingRss(xml);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(Array.isArray(results)).toBe(true);
    });

    it("finds nothing in a megabyte of items that never close", () => {
      const xml = rss("<item><title>".repeat(Math.ceil(MEGABYTE / 13)));
      expect(parseBingRss(xml)).toEqual([]);
    });
  });
});

/** A clock that only moves when the queue sleeps or a task works. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
  };
}

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

describe("createSearchQueue", () => {
  it("runs one task at a time, each starting at least minGapMs after the previous one started", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    let running = 0;
    let mostRunning = 0;
    const task = (id: string) => async () => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      starts.push(clock.now());
      await Promise.resolve();
      clock.advance(300);
      running -= 1;
      return id;
    };

    const results = await Promise.all([queue(task("a")), queue(task("b")), queue(task("c"))]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(mostRunning).toBe(1);
    expect(starts).toEqual([0, 1000, 2000]);
    // The first task does not wait; the others wait for what is left of the gap after their turn.
    expect(clock.sleeps).toEqual([700, 700]);
  });

  it("measures the gap from the start of the previous task, so a long task is not followed by a wait", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    const task = async () => {
      starts.push(clock.now());
      clock.advance(1500);
    };

    await Promise.all([queue(task), queue(task), queue(task)]);

    expect(starts).toEqual([0, 1500, 3000]);
    expect(clock.sleeps).toEqual([]);
  });

  it("starts the first task at once", async () => {
    const clock = fakeClock();
    clock.advance(5);
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    await queue(async () => undefined);
    expect(clock.sleeps).toEqual([]);
  });

  it("uses one second as the default gap", () => {
    expect(MIN_SEARCH_GAP_MS).toBe(1000);
  });

  it("goes on to the next task when a task fails", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const first = queue(async () => {
      throw new Error("boom");
    });
    const second = queue(async () => "ok");
    const third = queue(() => {
      throw new Error("not even a promise");
    });
    const fourth = queue(async () => "again");

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
    await expect(third).rejects.toThrow("not even a promise");
    await expect(fourth).resolves.toBe("again");
  });

  it("rejects a task that is still waiting behind a running one when its signal aborts, and never runs it", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const first = deferred<string>();
    const firstRun = queue(() => first.promise);
    const controller = new AbortController();
    const second = jest.fn(async () => "second");
    const secondOutcome = queue(second, controller.signal).catch((error: Error) => error);

    controller.abort();

    // It settles while the first task is still running.
    const error = await secondOutcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");

    first.resolve("first");
    await expect(firstRun).resolves.toBe("first");
    // The aborted task neither ran nor used up a gap: the next one waits for the first's only.
    await expect(queue(async () => "third")).resolves.toBe("third");
    expect(second).not.toHaveBeenCalled();
    expect(clock.sleeps).toEqual([1000]);
  });

  it("rejects at once, and runs nothing, when the signal has aborted already", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const controller = new AbortController();
    controller.abort();
    const task = jest.fn(async () => "never");

    await expect(queue(task, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(queue(async () => "next")).resolves.toBe("next");

    expect(task).not.toHaveBeenCalled();
    expect(clock.sleeps).toEqual([]);
  });

  it("rejects a task that is waiting for the gap when its signal aborts, and does not run it later", async () => {
    const clock = fakeClock();
    const gap = deferred();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: () => gap.promise });
    await queue(async () => "first");
    const controller = new AbortController();
    const task = jest.fn(async () => "second");
    const outcome = queue(task, controller.signal).catch((error: Error) => error);
    await flush();

    controller.abort();
    expect(((await outcome) as Error).name).toBe("AbortError");
    gap.resolve();
    await flush();

    expect(task).not.toHaveBeenCalled();
  });

  it("does not interrupt a task that has started when its signal aborts", async () => {
    const queue = createSearchQueue({ minGapMs: 0 });
    const controller = new AbortController();
    const started = deferred();
    const finish = deferred<string>();
    const run = queue(() => {
      started.resolve();
      return finish.promise;
    }, controller.signal);
    await started.promise;

    controller.abort();
    finish.resolve("done");

    await expect(run).resolves.toBe("done");
  });

  describe("with the real clock and timers", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("waits out the gap with a timer", async () => {
      const queue = createSearchQueue({ minGapMs: 1000 });
      const started: string[] = [];
      const run = (id: string) => queue(async () => void started.push(id));
      const runs = [run("a"), run("b")];

      await jest.advanceTimersByTimeAsync(999);
      expect(started).toEqual(["a"]);
      await jest.advanceTimersByTimeAsync(1);
      expect(started).toEqual(["a", "b"]);
      await Promise.all(runs);
    });

    it("stops waiting, and clears its timer, when the signal aborts", async () => {
      const queue = createSearchQueue({ minGapMs: 1000 });
      await queue(async () => undefined);
      const controller = new AbortController();
      const task = jest.fn(async () => "never");
      const outcome = queue(task, controller.signal).catch((error: Error) => error);
      await jest.advanceTimersByTimeAsync(10);
      expect(jest.getTimerCount()).toBe(1);

      controller.abort();

      expect(((await outcome) as Error).name).toBe("AbortError");
      expect(jest.getTimerCount()).toBe(0);
      expect(task).not.toHaveBeenCalled();
    });
  });
});

const passThrough: SearchQueue = (task) => task();

/** A stand-in for guardedFetch that records how it was called. */
function fakeFeed(answer: { body?: string; contentType?: string } | Error) {
  const calls: Array<{ url: string; options: GuardedFetchOptions | undefined }> = [];
  const fetch = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
    calls.push({ url, options });
    if (answer instanceof Error) throw answer;
    const response: GuardedResponse = {
      url,
      status: 200,
      contentType: answer.contentType ?? "text/xml; charset=utf-8",
      body: Buffer.from(answer.body ?? ""),
      truncated: false,
    };
    return response;
  });
  return { fetch: fetch as unknown as typeof guardedFetch, calls, mock: fetch };
}

/** A stand-in for guardedFetch that answers each request in turn: a body, or an error to throw. */
function scriptedFeed(steps: Array<string | Error>) {
  const queue = [...steps];
  const calls: string[] = [];
  const fetch = jest.fn(async (url: string) => {
    calls.push(url);
    const step = queue.shift();
    if (step === undefined) throw new Error("No scripted answer left");
    if (step instanceof Error) throw step;
    const response: GuardedResponse = {
      url,
      status: 200,
      contentType: "text/xml; charset=utf-8",
      body: Buffer.from(step),
      truncated: false,
    };
    return response;
  });
  return { fetch: fetch as unknown as typeof guardedFetch, calls, mock: fetch };
}

/** The real guardedFetch over a transport that answers every request with one canned response. */
function guardedFeed(status: number, headers: http.IncomingHttpHeaders, body: string) {
  const transport: Transport = async () => ({
    status,
    headers,
    body: Readable.from([Buffer.from(body)]),
  });
  const fetch = ((url: string, options?: GuardedFetchOptions) =>
    guardedFetch(url, options, { transport })) as typeof guardedFetch;
  return fetch;
}

async function failureOf(promise: Promise<unknown>): Promise<SearchEngineError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchEngineError) return error;
    throw error;
  }
  throw new Error("Expected the search to fail");
}

const FIXED_MESSAGE = "The search is not available right now";
const SECRET_QUERY = "Zorblax confidential acquisition";

describe("SearchEngineError", () => {
  it("has a fixed message", () => {
    const error = new SearchEngineError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SearchEngineError");
    expect(error.message).toBe(FIXED_MESSAGE);
  });
});

describe("createBingEngine", () => {
  it("requests the feed with the limits of the search, inside the queue", async () => {
    const feed = fakeFeed({ body: fixture("bing-news.xml") });
    const gate = deferred();
    let queueSignal: AbortSignal | undefined;
    const queue: SearchQueue = (task, signal) => {
      queueSignal = signal;
      return gate.promise.then(task);
    };
    const controller = new AbortController();
    const engine = createBingEngine({ fetch: feed.fetch, queue });

    const search = engine.search("Okta security breach", "news", controller.signal);
    await flush();
    expect(feed.mock).not.toHaveBeenCalled();
    gate.resolve();
    await search;

    expect(feed.calls).toHaveLength(1);
    expect(feed.calls[0].url).toBe(buildBingUrl("Okta security breach", "news"));
    expect(feed.mock.mock.calls[0]).toHaveLength(2);
    expect(feed.calls[0].options).toEqual({
      allowedContentTypes: ["application/rss+xml", "text/xml", "application/xml"],
      maxBytes: SEARCH_FEED_MAX_BYTES,
      headerTimeoutMs: 12_000,
      totalTimeoutMs: 12_000,
      signal: controller.signal,
    });
    expect(feed.calls[0].options).not.toHaveProperty("beforeRequest");
    expect(queueSignal).toBe(controller.signal);
    expect(SEARCH_FEED_MAX_BYTES).toBe(1_048_576);
  });

  it("asks for the web feed for a web search", async () => {
    const feed = fakeFeed({ body: fixture("bing-web.xml") });
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    await engine.search("acme security", "web");
    expect(feed.calls[0].url).toBe(buildBingUrl("acme security", "web"));
    expect(feed.calls[0].options?.signal).toBeUndefined();
  });

  it("returns the parsed results", async () => {
    const feed = fakeFeed({ body: fixture("bing-web.xml") });
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    await expect(engine.search("acme security", "web")).resolves.toEqual(
      parseBingRss(fixture("bing-web.xml")),
    );
  });

  it("reads the body as UTF-8", async () => {
    const body = rss(item({ link: "https://example.com/a", title: "Café — \u{1F600}" }));
    const feed = fakeFeed({ body });
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    const [result] = await engine.search("cafe", "web");
    expect(result.title).toBe("Café — \u{1F600}");
  });

  it("gives an empty list, which is an answer, for a feed with no items", async () => {
    const feed = fakeFeed({ body: rss("") });
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    await expect(engine.search("nothing matches this", "web")).resolves.toEqual([]);
  });

  it.each<FetchFailureReason>([
    "not_allowed",
    "blocked_by_robots",
    "blocked_by_site",
    "not_found",
    "unsupported_type",
    "unreachable",
  ])("turns a FetchError(%s) into a SearchEngineError that says nothing else", async (reason) => {
    const feed = fakeFeed(new FetchError(reason, `${reason} for ${SECRET_QUERY}`));
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    const error = await failureOf(engine.search(SECRET_QUERY, "web"));
    expect(error.message).toBe(FIXED_MESSAGE);
    expect(error.message).not.toContain(SECRET_QUERY);
    expect(JSON.stringify(error)).not.toContain(SECRET_QUERY);
    expect(error.stack ?? "").not.toContain(SECRET_QUERY);
    expect(error).not.toHaveProperty("cause");
  });

  it("turns any other error into the same SearchEngineError", async () => {
    const feed = fakeFeed(new TypeError(`broken by ${SECRET_QUERY}`));
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    const error = await failureOf(engine.search(SECRET_QUERY, "web"));
    expect(error.message).toBe(FIXED_MESSAGE);
  });

  it("turns an abort while the search waits in the queue into a SearchEngineError, without a request", async () => {
    const feed = fakeFeed({ body: rss("") });
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const first = deferred<string>();
    const blocker = queue(() => first.promise);
    const controller = new AbortController();
    const engine = createBingEngine({ fetch: feed.fetch, queue });

    const search = failureOf(engine.search(SECRET_QUERY, "web", controller.signal));
    controller.abort();

    expect((await search).message).toBe(FIXED_MESSAGE);
    first.resolve("done");
    await blocker;
    expect(feed.mock).not.toHaveBeenCalled();
  });

  it("fails a body that is not a feed even when the answer was a 200 of an allowed type", async () => {
    const feed = fakeFeed({ body: CONSENT_PAGE, contentType: "text/xml; charset=utf-8" });
    const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });
    const error = await failureOf(engine.search(SECRET_QUERY, "web"));
    expect(error.message).toBe(FIXED_MESSAGE);
  });

  describe("a search that failed once", () => {
    const ANSWER = rss(item({ link: "https://example.com/a", title: "Answer" }));
    const status = (code: number, retryAfterMs?: number) =>
      new FetchError(code === 429 || code === 403 ? "blocked_by_site" : "unreachable", undefined, {
        status: code,
        retryAfterMs,
      });

    it.each<[string, Error]>([
      ["a network error or a time-out", new FetchError("unreachable")],
      ["a 500", status(500)],
      ["a 503", status(503)],
    ])("asks again after %s, and gives the second answer", async (_name, failure) => {
      const feed = scriptedFeed([failure, ANSWER]);
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      const results = await engine.search("acme breach", "news");

      expect(results.map((result) => result.title)).toEqual(["Answer"]);
      expect(feed.calls).toEqual([
        buildBingUrl("acme breach", "news"),
        buildBingUrl("acme breach", "news"),
      ]);
    });

    it.each<[string, Error]>([
      ["a 400", status(400)],
      ["a 403", status(403)],
      ["a 404", new FetchError("not_found", undefined, { status: 404 })],
      ["a 429 with no Retry-After", status(429)],
      ["a 429 that says to wait a minute", status(429, 60_000)],
      ["a type that is not allowed", new FetchError("unsupported_type")],
      ["an address the policy refused", new FetchError("not_allowed")],
      ["robots.txt", new FetchError("blocked_by_robots")],
      ["an error of our own", new TypeError("broken")],
    ])("does not ask again after %s", async (_name, failure) => {
      const feed = scriptedFeed([failure, ANSWER]);
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      await expect(failureOf(engine.search(SECRET_QUERY, "web"))).resolves.toBeInstanceOf(
        SearchEngineError,
      );

      expect(feed.mock).toHaveBeenCalledTimes(1);
    });

    it("does not ask again for a body that is not a feed", async () => {
      const feed = scriptedFeed([CONSENT_PAGE, ANSWER]);
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      await failureOf(engine.search(SECRET_QUERY, "web"));

      expect(feed.mock).toHaveBeenCalledTimes(1);
    });

    it("asks again after a 429 that says to wait a few seconds, once it has waited that long", async () => {
      const feed = scriptedFeed([status(429, 3000), ANSWER]);
      const waits: number[] = [];
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        sleep: async (ms) => {
          waits.push(ms);
        },
      });

      const results = await engine.search("acme breach", "web");

      expect(waits).toEqual([3000]);
      expect(results).toHaveLength(1);
    });

    it("asks again after a 5xx without waiting for anything but the queue", async () => {
      const feed = scriptedFeed([status(502), ANSWER]);
      const waits: number[] = [];
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        sleep: async (ms) => {
          waits.push(ms);
        },
      });

      await engine.search("acme breach", "web");

      expect(waits).toEqual([]);
    });

    it("gives up after the second failure, with the fixed error and two requests", async () => {
      const feed = scriptedFeed([status(503), status(503), ANSWER]);
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      const error = await failureOf(engine.search(SECRET_QUERY, "web"));

      expect(error.message).toBe(FIXED_MESSAGE);
      expect(feed.mock).toHaveBeenCalledTimes(2);
    });

    it("sends each request through the queue, so the gap between searches holds for the second too", async () => {
      const feed = scriptedFeed([status(503), ANSWER]);
      const tasks: number[] = [];
      const queue: SearchQueue = (task) => {
        tasks.push(tasks.length + 1);
        return task();
      };
      const engine = createBingEngine({ fetch: feed.fetch, queue });

      await engine.search("acme breach", "web");

      expect(tasks).toEqual([1, 2]);
    });

    it("does not ask again once the caller's signal has aborted", async () => {
      const controller = new AbortController();
      const feed = scriptedFeed([status(503), ANSWER]);
      feed.mock.mockImplementationOnce(async () => {
        controller.abort();
        throw new FetchError("unreachable");
      });
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      await failureOf(engine.search("acme breach", "web", controller.signal));

      expect(feed.mock).toHaveBeenCalledTimes(1);
    });

    it("stops waiting for a 429 when the caller's signal aborts", async () => {
      const controller = new AbortController();
      const feed = scriptedFeed([status(429, 3000), ANSWER]);
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        sleep: async () => {
          controller.abort();
          throw new Error("The search was cancelled");
        },
      });

      await failureOf(engine.search("acme breach", "web", controller.signal));

      expect(feed.mock).toHaveBeenCalledTimes(1);
    });

    it("tells onRetry the feed of the search, once for each retry", async () => {
      const retries: string[] = [];
      const feed = scriptedFeed([status(503), ANSWER, status(503), status(503)]);
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        onRetry: (kind) => retries.push(kind),
      });

      await engine.search("one", "news");
      await failureOf(engine.search("two", "web"));

      expect(retries).toEqual(["news", "web"]);
    });

    it("does not let a failing onRetry change the search", async () => {
      const feed = scriptedFeed([status(503), ANSWER]);
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        onRetry: () => {
          throw new Error("a counter broke");
        },
      });

      await expect(engine.search("acme breach", "web")).resolves.toHaveLength(1);
    });
  });

  describe("through the real guardedFetch", () => {
    it("reads a feed served as text/xml", async () => {
      const fetch = guardedFeed(
        200,
        { "content-type": "text/xml; charset=utf-8" },
        fixture("bing-web.xml"),
      );
      const engine = createBingEngine({ fetch, queue: passThrough });
      await expect(engine.search("acme security", "web")).resolves.toHaveLength(4);
    });

    it.each(["application/rss+xml", "application/xml"])(
      "reads a feed served as %s",
      async (type) => {
        const fetch = guardedFeed(200, { "content-type": type }, fixture("bing-news.xml"));
        const engine = createBingEngine({ fetch, queue: passThrough });
        await expect(engine.search("acme security", "news")).resolves.toHaveLength(3);
      },
    );

    it("fails a 200 HTML consent page (unsupported_type)", async () => {
      const fetch = guardedFeed(200, { "content-type": "text/html; charset=utf-8" }, CONSENT_PAGE);
      const engine = createBingEngine({ fetch, queue: passThrough });
      const error = await failureOf(engine.search(SECRET_QUERY, "web"));
      expect(error.message).toBe(FIXED_MESSAGE);
    });

    it("fails a 200 consent page that claims to be XML", async () => {
      const fetch = guardedFeed(200, { "content-type": "text/xml" }, CONSENT_PAGE);
      const engine = createBingEngine({ fetch, queue: passThrough });
      const error = await failureOf(engine.search(SECRET_QUERY, "web"));
      expect(error.message).toBe(FIXED_MESSAGE);
    });

    it.each([429, 403, 503])(
      "fails a %i answer (blocked_by_site or unreachable)",
      async (status) => {
        const fetch = guardedFeed(status, { "content-type": "text/xml" }, rss(""));
        const engine = createBingEngine({ fetch, queue: passThrough });
        const error = await failureOf(engine.search(SECRET_QUERY, "web"));
        expect(error.message).toBe(FIXED_MESSAGE);
      },
    );

    it("gives an empty list for an RSS answer with no items", async () => {
      const fetch = guardedFeed(200, { "content-type": "text/xml" }, rss(""));
      const engine = createBingEngine({ fetch, queue: passThrough });
      await expect(engine.search("nothing matches this", "web")).resolves.toEqual([]);
    });
  });

  describe("with a cache shared by runs", () => {
    it("answers a search that an earlier run asked from the cache: no request and no place in the queue", async () => {
      const { cache } = memoryCache();
      const feed = fakeFeed({ body: fixture("bing-news.xml") });
      const queue: SearchQueue = jest.fn((task) => task());
      const earlier = createBingEngine({ fetch: feed.fetch, queue, cache });
      const answered = await earlier.search("Okta security breach", "news");
      await settle();
      (queue as jest.Mock).mockClear();
      feed.mock.mockClear();

      const later = createBingEngine({ fetch: feed.fetch, queue, cache });
      const again = await later.search("okta  Security Breach", "news");

      expect(again).toEqual(answered);
      expect(again.length).toBeGreaterThan(0);
      expect(feed.mock).not.toHaveBeenCalled();
      expect(queue).not.toHaveBeenCalled();
    });

    it("keeps nothing of a search that failed", async () => {
      const { cache, writes } = memoryCache();
      const feed = fakeFeed(new FetchError("not_found"));
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough, cache });

      await expect(engine.search("Okta data breach", "news")).rejects.toBeInstanceOf(
        SearchEngineError,
      );
      await settle();

      expect(writes).toEqual([]);
    });

    it("counts a retry once and keeps the answer of the second request", async () => {
      const { cache, writes } = memoryCache();
      const feed = scriptedFeed([new FetchError("unreachable"), fixture("bing-news.xml")]);
      const onRetry = jest.fn();
      const engine = createBingEngine({
        fetch: feed.fetch,
        queue: passThrough,
        cache,
        onRetry,
      });

      const results = await engine.search("Okta data breach", "news");
      await settle();

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0].value)).toEqual(results);
    });

    it("is the same engine without a cache: every search is a request", async () => {
      const feed = fakeFeed({ body: fixture("bing-news.xml") });
      const engine = createBingEngine({ fetch: feed.fetch, queue: passThrough });

      await engine.search("Okta security breach", "news");
      await engine.search("Okta security breach", "news");

      expect(feed.calls).toHaveLength(2);
    });
  });

  describe("without a queue of its own", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("shares one queue per process: one search at a time, a second apart", async () => {
      let webSearch!: typeof import("../webSearch");
      jest.isolateModules(() => {
        webSearch = jest.requireActual("../webSearch");
      });
      const feed = fakeFeed({ body: rss("") });
      const one = webSearch.createBingEngine({ fetch: feed.fetch });
      const another = webSearch.createBingEngine({ fetch: feed.fetch });

      const searches = [one.search("first", "web"), another.search("second", "news")];
      await jest.advanceTimersByTimeAsync(0);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(999);
      expect(feed.calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(feed.calls).toHaveLength(2);
      await Promise.all(searches);
    });
  });
});
