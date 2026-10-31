import http from "http";
import { Readable } from "stream";
import {
  ANY_CONTENT_TYPE,
  DEFAULT_CONTENT_TYPES,
  DnsLookup,
  FetchError,
  FetchFailureReason,
  GuardedFetchOptions,
  GuardedResponse,
  Transport,
  guardedFetch,
} from "../guardedFetch";
import { MAX_PDF_BYTES, PdfDocument, PdfError } from "../pdfText";
import { PageReadError, createPageReader, decodeBody } from "../readPage";
import { memoryCache, settle } from "./helpers/memoryCache";

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
        canonicalUrl: null,
      });
    });

    it("keeps the markup of a sitemap, so that the addresses in it are not run together", async () => {
      const sitemap =
        '<?xml version="1.0"?><urlset><url><loc>https://acme.com/security</loc>' +
        "<lastmod>2026-01-01</lastmod></url><url><loc>https://acme.com/privacy</loc></url></urlset>";
      const { fetch } = fakeFetch({
        "https://acme.com/sitemap.xml": { contentType: "application/xml", body: sitemap },
      });

      const page = await createPageReader({ fetch })("https://acme.com/sitemap.xml");

      expect(page.text).toBe(sitemap);
      expect(page.links).toEqual([]);
    });

    it("turns another XML answer into text as before", async () => {
      const feed =
        "<rss><channel><title>News</title><item><title>Hello</title></item></channel></rss>";
      const { fetch } = fakeFetch({
        "https://acme.com/feed.xml": { contentType: "application/xml", body: feed },
      });

      const page = await createPageReader({ fetch })("https://acme.com/feed.xml");

      expect(page.text).not.toContain("<item>");
    });

    it("gives the address the page claims for itself, resolved against the URL that answered", async () => {
      const { fetch } = fakeFetch({
        [PAGE_URL]: {
          url: "https://m.acme.com/trust/amp",
          body: '<html><head><title>Trust</title><link rel="canonical" href="/trust"></head><body><p>Hello</p></body></html>',
        },
      });
      expect((await createPageReader({ fetch })(PAGE_URL)).canonicalUrl).toBe(
        "https://m.acme.com/trust",
      );
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
        canonicalUrl: null,
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

    describe("what the page says about itself", () => {
      const embedded = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
      const IDENTIFIED = `<html><head><title>Acme</title><meta property="og:site_name" content="Acme"><script type="application/ld+json">${embedded(
        {
          "@graph": [
            { "@type": "Organization", name: "Acme Analytics", legalName: "Acme Analytics Ltd" },
            { "@type": "SoftwareApplication", name: "Acme Vault" },
          ],
        },
      )}</script></head><body><h1>Welcome</h1><p>${"We build software for teams. ".repeat(5)}</p></body></html>`;

      it("is carried by an HTML page: the names it gives itself and its products", async () => {
        const { fetch } = fakeFetch({ [PAGE_URL]: { body: IDENTIFIED } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.identity).toEqual({
          names: ["Acme", "Acme Analytics", "Acme Analytics Ltd"],
          products: ["Acme Vault"],
        });
      });

      it("is carried by a page that lists a product and gives no name", async () => {
        const body = `<html><head><title>Vault</title><script type="application/ld+json">${embedded(
          { "@type": "SoftwareApplication", name: "Acme Vault" },
        )}</script></head><body><h1>Welcome</h1><p>${"We build software for teams. ".repeat(5)}</p></body></html>`;
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.identity).toEqual({ names: [], products: ["Acme Vault"] });
      });

      it("is not carried by a page that says nothing about itself", async () => {
        const { fetch } = fakeFetch({ [PAGE_URL]: { body: HTML } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page).not.toHaveProperty("identity");
      });

      it("is not carried by a page that is not HTML", async () => {
        const { fetch } = fakeFetch({
          "https://acme.com/humans.txt": {
            contentType: "text/plain",
            body: `<meta property="og:site_name" content="Acme">`,
          },
        });

        const page = await createPageReader({ fetch })("https://acme.com/humans.txt");

        expect(page).not.toHaveProperty("identity");
      });

      it("is carried by a page whose text is in its data", async () => {
        const sentence = "Acme keeps the records of its customers safe and secure at all times.";
        const body = `<html><head><title>Security</title><meta property="og:site_name" content="Acme"><script>${"var a=1;".repeat(3000)}</script></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${embedded(
          { props: { pageProps: { text: sentence.repeat(8) } } },
        )}</script></body></html>`;
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.text).toContain("Acme keeps the records");
        expect(page.identity).toEqual({ names: ["Acme"], products: [] });
      });

      it("is the identity of the page as the browser built it", async () => {
        const shell = `<html><head><title>Security</title><script>${"var a=1;".repeat(3000)}</script></head><body><div id="root"></div></body></html>`;
        const built = `<html><head><title>Security</title><meta property="og:site_name" content="Built Name"></head><body><p>${"Acme keeps the records of its customers safe. ".repeat(20)}</p></body></html>`;
        const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell } });
        const render = jest.fn(async () => ({ url: PAGE_URL, html: built }));

        const page = await createPageReader({ fetch, render })(PAGE_URL);

        expect(page.identity).toEqual({ names: ["Built Name"], products: [] });
      });
    });

    describe("a page that a script builds", () => {
      const PROSE = Array.from(
        { length: 8 },
        (_, n) =>
          `Section ${n + 1} of the security statement says that Acme encrypts customer data and never uses it to train models.`,
      );
      const embedded = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
      /** A shell: more than 20,000 characters of script and a little visible text. */
      const shell = (data: string, visible = "") =>
        `<html><head><title>Security | Acme</title><script>${"var a=1;".repeat(3000)}</script></head><body>${visible}<div id="__next"></div>${data}</body></html>`;
      const nextData = (pageProps: unknown) =>
        `<script id="__NEXT_DATA__" type="application/json">${embedded({ props: { pageProps } })}</script>`;

      it("is read from the data that the page carries", async () => {
        const body = shell(nextData({ sections: PROSE }));
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.title).toBe("Security | Acme");
        expect(page.text).toBe(PROSE.join("\n\n"));
      });

      it("keeps the text that the page shows, before the text of the data", async () => {
        const body = shell(nextData({ sections: PROSE }), "<h1>Security at Acme</h1>");
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.text).toBe(`Security at Acme\n\n${PROSE.join("\n\n")}`);
      });

      it("is still a page that needs JavaScript when the data holds too little text", async () => {
        const body = shell(nextData({ sections: PROSE.slice(0, 2) }));
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const error = await failureOf(createPageReader({ fetch })(PAGE_URL));

        expect(error.reason).toBe("needs_javascript");
      });

      it("is still a page that needs JavaScript when there is no data", async () => {
        const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell("") } });

        const error = await failureOf(createPageReader({ fetch })(PAGE_URL));

        expect(error.reason).toBe("needs_javascript");
      });

      describe("with a browser", () => {
        const RENDERED_TEXT = PROSE.join("</p><p>");
        const renderedPage = `<html><head><title>Security | Acme (rendered)</title></head><body><h1>Security</h1><p>${RENDERED_TEXT}</p><nav><a href="/privacy">Privacy</a></nav></body></html>`;
        const renderer = (
          result: { url: string; html: string } | null = {
            url: PAGE_URL,
            html: renderedPage,
          },
        ) => jest.fn(async () => result);

        it("is read from the page as the browser built it, when the page carries no text of its own", async () => {
          const body = shell("");
          const { fetch } = fakeFetch({ [PAGE_URL]: { body } });
          const render = renderer();

          const page = await createPageReader({ fetch, render })(PAGE_URL);

          expect(page.title).toBe("Security | Acme (rendered)");
          expect(page.text).toBe(`Security\n\n${PROSE.join("\n\n")}`);
          expect(page.links).toEqual([{ text: "Privacy", url: "https://acme.com/privacy" }]);
          expect(page.url).toBe(PAGE_URL);
        });

        it("is given the document as it was read, the gate of robots.txt and the signal", async () => {
          const body = shell("");
          const { fetch } = fakeFetch({
            [PAGE_URL]: {
              body,
              contentType: "text/html; charset=utf-8",
              url: "https://acme.com/trust",
            },
          });
          const render = renderer({ url: "https://acme.com/trust", html: renderedPage });
          const controller = new AbortController();

          const page = await createPageReader({ fetch, render })(PAGE_URL, controller.signal);

          expect(render).toHaveBeenCalledTimes(1);
          expect(render).toHaveBeenCalledWith({
            url: "https://acme.com/trust",
            body: Buffer.from(body),
            contentType: "text/html; charset=utf-8",
            beforeRequest: expect.any(Function),
            signal: controller.signal,
          });
          expect(page.url).toBe("https://acme.com/trust");
        });

        it("is the page at the address the browser ended on", async () => {
          const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell("") } });
          const render = renderer({ url: "https://acme.com/en/security", html: renderedPage });

          const page = await createPageReader({ fetch, render })(PAGE_URL);

          expect(page.url).toBe("https://acme.com/en/security");
        });

        it("has the address and the date that the built page states for itself", async () => {
          const html = `<html><head><title>Security | Acme</title><link rel="canonical" href="https://acme.com/en/security"><meta property="article:published_time" content="2025-03-04T10:00:00Z"></head><body><p>${RENDERED_TEXT}</p></body></html>`;
          const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell("") } });
          const render = renderer({ url: PAGE_URL, html });

          const page = await createPageReader({ fetch, render })(PAGE_URL);

          expect(page.canonicalUrl).toBe("https://acme.com/en/security");
          expect(page.publishedAt).toBe("2025-03-04T10:00:00.000Z");
        });

        // The data is enough from 500 characters, which is also how much text a page must show.
        it.each([
          [499, true],
          [500, false],
        ])("is asked about a page whose data holds %i characters: %p", async (length, asked) => {
          const text =
            `${"Acme keeps every record of its customers safe. ".repeat(11)}`.slice(0, length - 1) +
            "x";
          const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell(nextData({ text })) } });
          const render = renderer();

          await createPageReader({ fetch, render })(PAGE_URL);

          expect(text).toHaveLength(length);
          expect(render).toHaveBeenCalledTimes(asked ? 1 : 0);
        });

        it("is tried when the data holds too little text", async () => {
          const body = shell(nextData({ sections: PROSE.slice(0, 2) }));
          const { fetch } = fakeFetch({ [PAGE_URL]: { body } });
          const render = renderer();

          const page = await createPageReader({ fetch, render })(PAGE_URL);

          expect(render).toHaveBeenCalledTimes(1);
          expect(page.title).toBe("Security | Acme (rendered)");
        });

        it("is not asked when the data holds the text", async () => {
          const body = shell(nextData({ sections: PROSE }));
          const { fetch } = fakeFetch({ [PAGE_URL]: { body } });
          const render = renderer();

          const page = await createPageReader({ fetch, render })(PAGE_URL);

          expect(render).not.toHaveBeenCalled();
          expect(page.text).toBe(PROSE.join("\n\n"));
        });

        it("is not asked about a page that shows enough text itself", async () => {
          const body = `<html><body><p>${"Word ".repeat(400)}</p><script>${"a".repeat(30_000)}</script></body></html>`;
          const { fetch } = fakeFetch({ [PAGE_URL]: { body } });
          const render = renderer();

          await createPageReader({ fetch, render })(PAGE_URL);

          expect(render).not.toHaveBeenCalled();
        });

        it.each([
          ["the browser cannot render it", null],
          ["the page is still a shell in the browser", { url: PAGE_URL, html: shell("") }],
          [
            "the page holds too little text in the browser",
            { url: PAGE_URL, html: "<html><body><p>Hello.</p></body></html>" },
          ],
        ])("is still a page that needs JavaScript when %s", async (_name, result) => {
          const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell("") } });
          const render = renderer(result);

          const error = await failureOf(createPageReader({ fetch, render })(PAGE_URL));

          expect(error.reason).toBe("needs_javascript");
        });

        it("is still a page that needs JavaScript when the browser fails in a way of its own", async () => {
          const { fetch } = fakeFetch({ [PAGE_URL]: { body: shell("") } });
          const render = jest.fn(async () => {
            throw new TypeError("boom");
          });

          const error = await failureOf(createPageReader({ fetch, render })(PAGE_URL));

          expect(error.reason).toBe("needs_javascript");
        });
      });

      it("is not touched when the page shows enough text itself", async () => {
        const visible = `<p>${"Word ".repeat(400)}</p>`;
        const body = shell(nextData({ sections: PROSE }), visible);
        const { fetch } = fakeFetch({ [PAGE_URL]: { body } });

        const page = await createPageReader({ fetch })(PAGE_URL);

        expect(page.text).not.toContain("Section 1 of the security statement");
        expect(page.text.length).toBeGreaterThan(1000);
      });
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

    it("keeps the error that was not a FetchError as the cause, out of the message", async () => {
      const boom = new TypeError("boom");
      const { fetch } = fakeFetch({ [PAGE_URL]: boom });
      const error = await failureOf(createPageReader({ fetch })(PAGE_URL));
      expect(error.reason).toBe("unreachable");
      expect(error.cause).toBe(boom);
      expect(error.message).toBe(new FetchError("unreachable").message);
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
        allowedContentTypes: [...DEFAULT_CONTENT_TYPES, "application/pdf", "application/x-pdf"],
        maxBytesByType: {
          "application/pdf": MAX_PDF_BYTES,
          "application/x-pdf": MAX_PDF_BYTES,
          "application/octet-stream": MAX_PDF_BYTES,
          "binary/octet-stream": MAX_PDF_BYTES,
        },
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
      for (const reason of ["unreachable", "unsupported_type"] as const) {
        const { fetch, requested } = fakeFetch({
          [ROBOTS]: new FetchError(reason),
          [PAGE_URL]: { body: HTML },
        });
        const error = await failureOf(createPageReader({ fetch })(PAGE_URL));
        expect(error.reason).toBe("blocked_by_robots");
        expect(requested).toEqual([ROBOTS]);
      }
    });

    it("refuses every page of an origin whose robots.txt the address policy refused as not_allowed", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: new FetchError("not_allowed"),
        [PAGE_URL]: { body: HTML },
        "https://acme.com/other": { body: HTML },
        "https://www.acme.com/robots.txt": robotsAnswer("User-agent: *\nAllow: /"),
        "https://www.acme.com/page": { body: HTML },
      });
      const read = createPageReader({ fetch });

      expect((await failureOf(read(PAGE_URL))).reason).toBe("not_allowed");
      expect((await failureOf(read("https://acme.com/other"))).reason).toBe("not_allowed");
      // Another origin is not affected.
      expect((await read("https://www.acme.com/page")).title).toBe("Trust center | Acme");
      expect(requested).toEqual([
        ROBOTS,
        "https://www.acme.com/robots.txt",
        "https://www.acme.com/page",
      ]);
    });

    it("refuses a redirect hop into such an origin as not_allowed", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        "https://intranet.acme.com/robots.txt": new FetchError("not_allowed"),
      });
      // The real fetch calls beforeRequest for each redirect hop; this one calls it twice.
      const hops = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
        await options?.beforeRequest?.(new URL(url));
        await options?.beforeRequest?.(new URL("https://intranet.acme.com/next"));
        return fetch(url, options);
      });
      const error = await failureOf(
        createPageReader({ fetch: hops as unknown as typeof guardedFetch })(PAGE_URL),
      );
      expect(error.reason).toBe("not_allowed");
      expect(requested).toEqual([ROBOTS, "https://intranet.acme.com/robots.txt"]);
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
        allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE],
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

    describe("under the real fetch guard", () => {
      type Reply = { status?: number; headers?: http.IncomingHttpHeaders; body?: string };
      const HTML_REPLY: Reply = {
        headers: { "content-type": "text/html; charset=utf-8" },
        body: HTML,
      };
      const PRIVATE_URL = "https://acme.com/private/page";
      const PUBLIC_URL = "https://acme.com/public";

      /** guardedFetch itself, so its content type check runs, over a scripted site. */
      function readerOver(site: Record<string, Reply>) {
        const requested: string[] = [];
        const transport: Transport = async ({ url }) => {
          requested.push(url.href);
          const reply = site[url.href] ?? { status: 404 };
          return {
            status: reply.status ?? 200,
            headers: reply.headers ?? {},
            body: Readable.from([Buffer.from(reply.body ?? "")]),
          };
        };
        const read = createPageReader({
          fetch: (url, options) => guardedFetch(url, options, { transport }),
        });
        return { read, requested };
      }

      it.each([
        ["application/octet-stream", { "content-type": "application/octet-stream" }],
        ["no Content-Type", {}],
      ])("parses a robots.txt that is served with %s", async (_label, headers) => {
        const { read, requested } = readerOver({
          [ROBOTS]: { headers, body: "User-agent: *\nDisallow: /private" },
          [PRIVATE_URL]: HTML_REPLY,
          [PUBLIC_URL]: HTML_REPLY,
        });
        const error = await failureOf(read(PRIVATE_URL));
        expect(error.reason).toBe("blocked_by_robots");
        expect((await read(PUBLIC_URL)).title).toBe("Trust center | Acme");
        expect(requested).toEqual([ROBOTS, PUBLIC_URL]);
      });

      it.each([404, 403])("allows the page when robots.txt answers %i", async (status) => {
        const { read, requested } = readerOver({
          [ROBOTS]: { status },
          [PUBLIC_URL]: HTML_REPLY,
        });
        expect((await read(PUBLIC_URL)).title).toBe("Trust center | Acme");
        expect(requested).toEqual([ROBOTS, PUBLIC_URL]);
      });

      it.each([500, 503])("disallows the page when robots.txt answers %i", async (status) => {
        const { read, requested } = readerOver({
          [ROBOTS]: { status },
          [PUBLIC_URL]: HTML_REPLY,
        });
        const error = await failureOf(read(PUBLIC_URL));
        expect(error.reason).toBe("blocked_by_robots");
        expect(requested).toEqual([ROBOTS]);
      });

      it("refuses the pages of a host that resolves to an address that is not public as not_allowed, as the guard refuses the page itself", async () => {
        const requested: string[] = [];
        // Like a socket, the transport resolves the host through the lookup of the guard first.
        const transport: Transport = ({ url, lookup }) =>
          new Promise((resolve, reject) => {
            requested.push(url.href);
            lookup(url.hostname, { all: true }, (error) => {
              if (error) reject(error);
              else resolve({ status: 200, headers: {}, body: Readable.from([]) });
            });
          });
        // One public address and one that is not: the guard refuses the host.
        const dnsLookup = ((
          _hostname: string,
          _options: unknown,
          callback: (error: null, addresses: Array<{ address: string; family: number }>) => void,
        ) =>
          callback(null, [
            { address: "93.184.216.34", family: 4 },
            { address: "10.0.0.5", family: 4 },
          ])) as unknown as DnsLookup;
        const fetch: typeof guardedFetch = (url, options) =>
          guardedFetch(url, options, { transport, dnsLookup });

        await expect(fetch(PUBLIC_URL)).rejects.toMatchObject({ reason: "not_allowed" });
        requested.length = 0;
        const read = createPageReader({ fetch });
        expect((await failureOf(read(PUBLIC_URL))).reason).toBe("not_allowed");
        expect((await failureOf(read(PRIVATE_URL))).reason).toBe("not_allowed");
        expect(requested).toEqual([ROBOTS]);
      });
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
  describe("a PDF", () => {
    const PDF_URL = "https://acme.com/legal/dpa.pdf";
    const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "latin1");
    const DOCUMENT: PdfDocument = {
      title: "Acme DPA",
      publishedAt: "2024-03-01T09:15:00.000Z",
      text: "We never use customer content to train models.",
      pages: 2,
    };
    const allowRobots: Answer = { contentType: "text/plain", body: "User-agent: *\nAllow: /" };

    /** A reader of PDFs that answers with `result` (or fails with it) and remembers what it got. */
    const pdfReader = (result: PdfDocument | Error = DOCUMENT) =>
      jest.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
      });

    it("becomes the text, title and date of the document, with no links", async () => {
      const { fetch } = fakeFetch({
        [ROBOTS]: allowRobots,
        [PDF_URL]: { contentType: "application/pdf", body: PDF_BYTES },
      });

      const page = await createPageReader({ fetch, readPdf: pdfReader() })(PDF_URL);

      expect(page).toEqual({
        url: PDF_URL,
        title: "Acme DPA",
        publishedAt: "2024-03-01T09:15:00.000Z",
        text: "We never use customer content to train models.",
        links: [],
        canonicalUrl: null,
      });
    });

    it("is read from the bytes, with the address that answered and the signal of the read", async () => {
      const { fetch } = fakeFetch({
        [ROBOTS]: allowRobots,
        [PDF_URL]: {
          contentType: "application/pdf; charset=binary",
          body: PDF_BYTES,
          url: "https://cdn.acme.com/files/dpa-2024.pdf",
        },
      });
      const readPdf = pdfReader();
      const controller = new AbortController();

      const page = await createPageReader({ fetch, readPdf })(PDF_URL, controller.signal);

      expect(readPdf).toHaveBeenCalledTimes(1);
      expect(readPdf).toHaveBeenCalledWith(PDF_BYTES, {
        url: "https://cdn.acme.com/files/dpa-2024.pdf",
        signal: controller.signal,
      });
      expect(page.url).toBe("https://cdn.acme.com/files/dpa-2024.pdf");
    });

    it("is not read as text: the bytes of a PDF are not decoded", async () => {
      const { fetch } = fakeFetch({
        [ROBOTS]: allowRobots,
        [PDF_URL]: { contentType: "application/x-pdf", body: PDF_BYTES },
      });
      const readPdf = pdfReader({ ...DOCUMENT, text: "From the reader." });

      const page = await createPageReader({ fetch, readPdf })(PDF_URL);

      expect(page.text).toBe("From the reader.");
    });

    describe("the types an answer may have", () => {
      const typesAskedFor = async (url: string) => {
        const { fetch, calls } = fakeFetch({
          [ROBOTS]: allowRobots,
          [url]: { contentType: "application/pdf", body: PDF_BYTES },
        });
        await createPageReader({ fetch, readPdf: pdfReader() })(url);
        return calls.find((call) => call.url === url)?.options?.allowedContentTypes;
      };

      it("are the pages and the PDFs for any address", async () => {
        expect(await typesAskedFor(PAGE_URL)).toEqual([
          ...DEFAULT_CONTENT_TYPES,
          "application/pdf",
          "application/x-pdf",
        ]);
      });

      it("include a file of unknown type for an address that ends in .pdf", async () => {
        expect(await typesAskedFor(PDF_URL)).toEqual([
          ...DEFAULT_CONTENT_TYPES,
          "application/pdf",
          "application/x-pdf",
          "application/octet-stream",
          "binary/octet-stream",
        ]);
      });

      it("look at the path of the address, in any case, and not at the query", async () => {
        expect(await typesAskedFor("https://acme.com/files/DPA.PDF?download=1")).toContain(
          "application/octet-stream",
        );
        expect(await typesAskedFor("https://acme.com/download?file=dpa.pdf")).not.toContain(
          "application/octet-stream",
        );
      });
    });

    describe("a file of unknown type", () => {
      it("is a PDF when it begins like one", async () => {
        const { fetch } = fakeFetch({
          [ROBOTS]: allowRobots,
          [PDF_URL]: { contentType: "application/octet-stream", body: PDF_BYTES },
        });
        const readPdf = pdfReader();

        const page = await createPageReader({ fetch, readPdf })(PDF_URL);

        expect(readPdf).toHaveBeenCalledTimes(1);
        expect(page.title).toBe("Acme DPA");
      });

      it("is not a page when it does not, and the reader of PDFs is not asked", async () => {
        const { fetch } = fakeFetch({
          [ROBOTS]: allowRobots,
          [PDF_URL]: { contentType: "application/octet-stream", body: "MZ\u0090\u0000 an exe" },
        });
        const readPdf = pdfReader();

        const error = await failureOf(createPageReader({ fetch, readPdf })(PDF_URL));

        expect(error.reason).toBe("unsupported_type");
        expect(readPdf).not.toHaveBeenCalled();
      });
    });

    describe("a PDF that cannot be read", () => {
      it.each(["not_a_pdf", "no_text", "too_slow", "too_big", "unreadable"] as const)(
        "is a format that cannot be read when the reason is %s",
        async (reason) => {
          const { fetch } = fakeFetch({
            [ROBOTS]: allowRobots,
            [PDF_URL]: { contentType: "application/pdf", body: PDF_BYTES },
          });

          const error = await failureOf(
            createPageReader({ fetch, readPdf: pdfReader(new PdfError(reason)) })(PDF_URL),
          );

          expect(error.reason).toBe("unsupported_type");
          expect(error.message).toBe(new FetchError("unsupported_type").message);
        },
      );

      it("is unreachable when the read was cancelled", async () => {
        const { fetch } = fakeFetch({
          [ROBOTS]: allowRobots,
          [PDF_URL]: { contentType: "application/pdf", body: PDF_BYTES },
        });

        const error = await failureOf(
          createPageReader({ fetch, readPdf: pdfReader(new PdfError("aborted")) })(PDF_URL),
        );

        expect(error.reason).toBe("unreachable");
      });

      it("is unreachable when the reader fails in a way of its own", async () => {
        const { fetch } = fakeFetch({
          [ROBOTS]: allowRobots,
          [PDF_URL]: { contentType: "application/pdf", body: PDF_BYTES },
        });

        const error = await failureOf(
          createPageReader({ fetch, readPdf: pdfReader(new TypeError("boom")) })(PDF_URL),
        );

        expect(error.reason).toBe("unreachable");
      });
    });

    it("is kept for other runs like any page, and read once", async () => {
      const { cache } = memoryCache();
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: allowRobots,
        [PDF_URL]: { contentType: "application/pdf", body: PDF_BYTES },
      });
      const readPdf = pdfReader();

      await createPageReader({ fetch, cache, readPdf })(PDF_URL);
      await settle();
      const second = await createPageReader({ fetch, cache, readPdf })(PDF_URL);

      expect(second.text).toBe(DOCUMENT.text);
      expect(requested.filter((url) => url === PDF_URL)).toHaveLength(1);
      expect(readPdf).toHaveBeenCalledTimes(1);
    });

    it("leaves a page of HTML as it was, and the reader of PDFs out of it", async () => {
      const { fetch } = fakeFetch({ [ROBOTS]: allowRobots, [PAGE_URL]: { body: HTML } });
      const readPdf = pdfReader();

      const page = await createPageReader({ fetch, readPdf })(PAGE_URL);

      expect(page.title).toBe("Trust center | Acme");
      expect(readPdf).not.toHaveBeenCalled();
    });
  });

  describe("with a cache shared by runs", () => {
    const robotsAnswer = (body: string): Answer => ({ contentType: "text/plain", body });

    it("asks a site's robots.txt once for all the readers that share the cache", async () => {
      const { cache } = memoryCache();
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nDisallow: /private"),
        [PAGE_URL]: { body: HTML },
        "https://acme.com/other": { body: HTML },
      });

      await createPageReader({ fetch, cache })(PAGE_URL);
      await settle();
      await createPageReader({ fetch, cache })("https://acme.com/other");

      expect(requested.filter((url) => url === ROBOTS)).toHaveLength(1);
    });

    it("applies the rules from the cache as it would the rules it fetched", async () => {
      const { cache } = memoryCache();
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nDisallow: /private"),
        [PAGE_URL]: { body: HTML },
        "https://acme.com/private/page": { body: HTML },
      });
      await createPageReader({ fetch, cache })(PAGE_URL);
      await settle();

      const error = await failureOf(
        createPageReader({ fetch, cache })("https://acme.com/private/page"),
      );

      expect(error.reason).toBe("blocked_by_robots");
      expect(requested).not.toContain("https://acme.com/private/page");
    });

    it("keeps the text of robots.txt for 24 hours, under the origin", async () => {
      const { cache, writes } = memoryCache();
      const { fetch } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
      });

      await createPageReader({ fetch, cache })(PAGE_URL);
      await settle();

      expect(writes.filter((write) => write.kind === "robots")).toEqual([
        {
          kind: "robots",
          key: "https://acme.com",
          value: JSON.stringify({ status: 200, text: "User-agent: *\nAllow: /" }),
        },
      ]);
    });

    it("keeps that a site has no robots.txt, but not that it refused to show it", async () => {
      const missing = memoryCache();
      const refused = memoryCache();
      const answers = (reason: "not_found" | "blocked_by_site") =>
        fakeFetch({ [ROBOTS]: new FetchError(reason), [PAGE_URL]: { body: HTML } });

      await createPageReader({ fetch: answers("not_found").fetch, cache: missing.cache })(PAGE_URL);
      await createPageReader({ fetch: answers("blocked_by_site").fetch, cache: refused.cache })(
        PAGE_URL,
      );
      await settle();

      expect(missing.writes.filter((write) => write.kind === "robots")).toEqual([
        {
          kind: "robots",
          key: "https://acme.com",
          value: JSON.stringify({ status: 404, text: "" }),
        },
      ]);
      expect(refused.writes.filter((write) => write.kind === "robots")).toEqual([]);
    });

    it("keeps nothing of a robots.txt that could not be fetched, so that the next run asks again", async () => {
      const { cache, writes } = memoryCache();
      const { fetch } = fakeFetch({
        [ROBOTS]: new FetchError("unreachable"),
        [PAGE_URL]: { body: HTML },
      });

      await failureOf(createPageReader({ fetch, cache })(PAGE_URL));
      await settle();

      expect(writes).toEqual([]);
    });

    it("does not keep an origin that the address policy refused", async () => {
      const { cache, writes } = memoryCache();
      const { fetch } = fakeFetch({ [ROBOTS]: new FetchError("not_allowed") });

      await failureOf(createPageReader({ fetch, cache })(PAGE_URL));
      await settle();

      expect(writes).toEqual([]);
    });

    it("reads a page once for all the readers that share the cache, and answers it whole", async () => {
      const { cache } = memoryCache();
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
      });

      const first = await createPageReader({ fetch, cache })(PAGE_URL);
      await settle();
      requested.length = 0;
      const second = await createPageReader({ fetch, cache })(PAGE_URL);

      expect(second).toEqual(first);
      expect(second.title).toBe("Trust center | Acme");
      expect(second.links.length).toBeGreaterThan(0);
      expect(requested).toEqual([]);
    });

    it("does not keep a page that could not be read", async () => {
      const { cache, writes } = memoryCache();
      const { fetch } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: new FetchError("unreachable"),
      });

      await failureOf(createPageReader({ fetch, cache })(PAGE_URL));
      await settle();

      expect(writes.filter((write) => write.kind === "page")).toEqual([]);
    });

    it("is the same reader without a cache: nothing is asked of one and nothing is kept", async () => {
      const { fetch, requested } = fakeFetch({
        [ROBOTS]: robotsAnswer("User-agent: *\nAllow: /"),
        [PAGE_URL]: { body: HTML },
      });

      await createPageReader({ fetch })(PAGE_URL);
      await createPageReader({ fetch })(PAGE_URL);

      expect(requested).toEqual([ROBOTS, PAGE_URL, ROBOTS, PAGE_URL]);
    });
  });
});
