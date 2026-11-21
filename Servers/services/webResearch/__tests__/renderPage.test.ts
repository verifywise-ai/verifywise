import { getEventListeners } from "node:events";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { BOT_USER_AGENT, FetchError, GuardedFetchOptions, GuardedResponse } from "../guardedFetch";
import {
  CHROMIUM_ARGS,
  RENDER_BROWSER_IDLE_MS,
  RENDER_CONCURRENCY,
  RENDER_LAUNCH_RETRY_MS,
  RENDER_MAX_BYTES,
  RENDER_MAX_REQUESTS,
  RENDER_MAX_RESOURCE_BYTES,
  READ_PAGE_FUNCTION,
  RENDER_INIT_SCRIPT,
  RenderBrowser,
  RenderContext,
  RenderPage,
  RenderRoute,
  createChromiumRenderer,
} from "../renderPage";
import { MAX_HTML_CHARS } from "../pageText";

const DOCUMENT_URL = "https://acme.com/security";
const DOCUMENT = {
  url: DOCUMENT_URL,
  body: Buffer.from(
    "<html><body><div id='root'></div><script src='/app.js'></script></body></html>",
  ),
  contentType: "text/html; charset=utf-8",
};
const RENDERED = "<html><body><h1>Security</h1><p>Acme encrypts customer data.</p></body></html>";

interface FakeRequest {
  url: string;
  method?: string;
  type?: string;
  navigation?: boolean;
  /** Whether the request is made by the main frame of the page. */
  main?: boolean;
  headers?: Record<string, string>;
}

/** What a route did with a request. */
interface Handled {
  request: FakeRequest;
  outcome: "fulfilled" | "aborted";
  fulfillment?: {
    status?: number;
    contentType?: string;
    body?: Buffer;
    headers?: Record<string, string>;
  };
}

interface PageScript {
  /** The requests the page makes, in order, when it is told to load the document. */
  requests: FakeRequest[];
  /** What the page gives when it is read, once it has loaded. */
  html?: unknown;
  /** Replaces the whole answer of the DevTools protocol to the reading of the page. */
  readAnswer?: unknown;
  /** The address the page ends on. */
  finalUrl?: string;
  /** Replaces `goto`. */
  goto?: () => Promise<void>;
  waitForLoadState?: () => Promise<void>;
  waitForFunction?: () => Promise<void>;
  /** Holds back the making of the context until the promise settles. */
  contextReady?: Promise<void>;
  /** Replaces what closing the context does before it is marked closed. */
  closeContext?: () => Promise<void>;
}

/** A browser that does what a script says, and remembers what it was asked. */
function fakeBrowser(script: PageScript = { requests: [] }) {
  const handled: Handled[] = [];
  const crashListeners: Array<() => unknown> = [];
  const log = {
    contexts: [] as Array<{ options: Record<string, unknown>; closed: boolean }>,
    webSocketHandlers: 0,
    waits: [] as string[],
    gotoOptions: [] as Array<Record<string, unknown>>,
    dialogsDismissed: 0,
    popupsClosed: 0,
    closed: false,
    /** The scripts the context runs in every document before the page's own. */
    initScripts: [] as string[],
    /** What was asked of the context and its page, in order. */
    steps: [] as string[],
    evaluated: [] as Array<{ method: string; params?: Record<string, unknown> }>,
  };

  const browser: RenderBrowser = {
    isConnected: () => !log.closed,
    close: async () => {
      log.closed = true;
    },
    newContext: async (options) => {
      if (script.contextReady) await script.contextReady;
      const record = { options: options as Record<string, unknown>, closed: false };
      log.contexts.push(record);
      let routeHandler: ((route: RenderRoute) => Promise<void>) | undefined;
      const mainFrame = {};
      const page: RenderPage = {
        mainFrame: () => mainFrame,
        url: () => script.finalUrl ?? DOCUMENT_URL,
        on: (event: string, listener: (value: never) => unknown) => {
          if (event === "dialog") {
            void (async () => {
              await (listener as (dialog: { dismiss: () => Promise<void> }) => unknown)({
                dismiss: async () => {
                  log.dialogsDismissed += 1;
                },
              });
            })();
          }
          if (event === "crash") {
            log.steps.push("on:crash");
            crashListeners.push(listener as () => unknown);
          }
          if (event === "popup") {
            void (listener as (popup: { close: () => Promise<void> }) => unknown)({
              close: async () => {
                log.popupsClosed += 1;
              },
            });
          }
        },
        goto: async (_url, gotoOptions) => {
          log.steps.push("goto");
          log.gotoOptions.push(gotoOptions as Record<string, unknown>);
          if (script.goto) await script.goto();
          for (const fake of script.requests) {
            if (routeHandler === undefined) throw new Error("No route was registered");
            const routed: Handled = { request: fake, outcome: "aborted" };
            const route: RenderRoute = {
              request: () => ({
                url: () => fake.url,
                method: () => fake.method ?? "GET",
                resourceType: () => fake.type ?? (fake.navigation ? "document" : "script"),
                isNavigationRequest: () => fake.navigation ?? false,
                frame: () => (fake.main === false ? {} : mainFrame),
                headers: () => fake.headers ?? {},
              }),
              fulfill: async (fulfillment) => {
                routed.outcome = "fulfilled";
                routed.fulfillment = fulfillment;
              },
              abort: async () => {
                routed.outcome = "aborted";
              },
            };
            await routeHandler(route);
            handled.push(routed);
          }
        },
        waitForLoadState: async (state) => {
          log.waits.push(`load:${state}`);
          if (script.waitForLoadState) await script.waitForLoadState();
        },
        waitForFunction: async () => {
          log.waits.push("function");
          if (script.waitForFunction) await script.waitForFunction();
        },
      };
      const context: RenderContext = {
        route: async (_pattern, handler) => {
          routeHandler = handler;
        },
        routeWebSocket: async () => {
          log.webSocketHandlers += 1;
        },
        addInitScript: async (source: string) => {
          log.steps.push("addInitScript");
          log.initScripts.push(source);
        },
        newPage: async () => {
          log.steps.push("newPage");
          return page;
        },
        newCDPSession: async (of) => {
          if (of !== page) throw new Error("A session for another page");
          return {
            send: async (method, params) => {
              log.steps.push(method);
              log.evaluated.push({ method, params });
              if (script.readAnswer !== undefined) return script.readAnswer;
              const html = script.html ?? RENDERED;
              return { result: { type: typeof html, value: html } };
            },
          };
        },
        close: async () => {
          if (script.closeContext) await script.closeContext();
          record.closed = true;
        },
      };
      return context;
    },
  };
  /** The renderer process of every page made so far dies, as Chromium reports it. */
  const crash = () => {
    for (const listener of crashListeners) listener();
  };
  return { browser, handled, log, crash };
}

const answer = (body: string, contentType = "application/javascript"): GuardedResponse => ({
  url: "https://acme.com/app.js",
  status: 200,
  contentType,
  body: Buffer.from(body),
  truncated: false,
});

/** A guarded fetch that answers each address from a table and remembers what it was asked. */
function fakeFetch(answers: Record<string, GuardedResponse | Error> = {}) {
  const calls: Array<{ url: string; options: GuardedFetchOptions | undefined }> = [];
  const fetch = jest.fn(async (url: string, options?: GuardedFetchOptions) => {
    calls.push({ url, options });
    const found = answers[url] ?? answer("console.log(1)");
    if (found instanceof Error) throw found;
    return found;
  });
  return { fetch: fetch as never, calls, mock: fetch };
}

const renderer = (
  browser: ReturnType<typeof fakeBrowser>,
  fetchDeps: ReturnType<typeof fakeFetch> = fakeFetch(),
  extra: Partial<Parameters<typeof createChromiumRenderer>[0]> = {},
) => {
  const launch = jest.fn(async () => browser.browser);
  const render = createChromiumRenderer({
    launch,
    fetch: fetchDeps.fetch,
    timeoutMs: 2000,
    settleMs: 50,
    ...extra,
  });
  return { render, launch, fetchDeps };
};

describe("createChromiumRenderer", () => {
  describe("what it returns", () => {
    it("is the page as the browser built it, and the address it ended on", async () => {
      const browser = fakeBrowser({ requests: [], html: RENDERED, finalUrl: DOCUMENT_URL });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
    });

    it("is filed under the address that was read, even when the page renames itself with the History API", async () => {
      // history.replaceState moves the address the browser shows without a request any route sees.
      const browser = fakeBrowser({
        requests: [],
        html: RENDERED,
        finalUrl: "https://acme.com/someone-else/security",
      });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
    });

    it("waits for the network to go quiet and for the page to hold some text, and goes on if either takes too long", async () => {
      const browser = fakeBrowser({
        requests: [],
        waitForLoadState: async () => {
          throw new Error("Timeout 50ms exceeded");
        },
        waitForFunction: async () => {
          throw new Error("Timeout 50ms exceeded");
        },
      });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      expect(browser.log.waits).toEqual(["load:networkidle", "function"]);
    });

    it("loads the document without waiting for the whole page", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(browser.log.gotoOptions[0]).toMatchObject({ waitUntil: "domcontentloaded" });
      expect(browser.log.gotoOptions[0].timeout).toEqual(expect.any(Number));
    });
  });

  describe("how the browser is set up", () => {
    it("is a context of its own, with our identity, no downloads and no service workers", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(browser.log.contexts).toHaveLength(1);
      expect(browser.log.contexts[0].options).toMatchObject({
        userAgent: BOT_USER_AGENT,
        javaScriptEnabled: true,
        acceptDownloads: false,
        serviceWorkers: "block",
        permissions: [],
        locale: "en",
      });
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it("closes every web socket", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(browser.log.webSocketHandlers).toBe(1);
    });

    it("dismisses a dialog and closes a window the page opens", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(browser.log.dialogsDismissed).toBe(1);
      expect(browser.log.popupsClosed).toBe(1);
    });

    it("starts the browser with no way to resolve a name, and the other flags that keep it to itself", () => {
      expect(CHROMIUM_ARGS).toEqual(
        expect.arrayContaining([
          "--host-resolver-rules=MAP * ~NOTFOUND",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--disable-background-networking",
        ]),
      );
    });

    it("starts the browser with the switch for WebRTC that Chromium honours, and a cap on the heap of a page", () => {
      // The switch with "force-" alone left WebRTC sending UDP in Chrome 157; this one stopped it.
      expect(CHROMIUM_ARGS).toEqual(
        expect.arrayContaining([
          "--webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--js-flags=--max-old-space-size=256",
        ]),
      );
    });

    // Chromium puts a frame with sandbox="allow-scripts" (and no allow-same-origin) in a process of
    // its own, where the script of every document never ran and RTCPeerConnection was back (Chrome
    // 157). This switch keeps such frames with the page, so the script reaches them. It is not
    // `--disable-features=IsolateSandboxedIframes`: a second --disable-features replaces the list
    // Playwright passes (Chromium keeps the last one), and that list keeps request interception
    // working on redirects.
    it("starts the browser so that a sandboxed frame of the page gets the script too, without a second list of features", () => {
      expect(CHROMIUM_ARGS).toContain("--disable-site-isolation-trials");
      expect(CHROMIUM_ARGS.filter((arg) => arg.startsWith("--disable-features"))).toEqual([]);
      expect(CHROMIUM_ARGS.filter((arg) => arg.startsWith("--enable-features"))).toEqual([]);
    });

    it("gives every document of the context its script before the page exists, and so before the page's own scripts", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(typeof RENDER_INIT_SCRIPT).toBe("string");
      expect(browser.log.initScripts).toHaveLength(1);
      expect(browser.log.initScripts[0]).toBe(RENDER_INIT_SCRIPT);
      expect(browser.log.steps.indexOf("addInitScript")).toBeLessThan(
        browser.log.steps.indexOf("newPage"),
      );
      expect(browser.log.steps.indexOf("newPage")).toBeLessThan(browser.log.steps.indexOf("goto"));
    });
  });

  describe("the script that runs in every document", () => {
    /**
     * Runs the script in a document of jsdom, with WebRTC in it as Chromium has, and then `page`
     * there as the page's own script: what `page` gives back is the answer. jsdom runs in a node of
     * its own, as jest cannot load it (and the jest config maps its name to a stub).
     */
    const inDocument = (html: string, page: string): unknown => {
      const runner = `
        const { JSDOM } = require("jsdom");
        const { html, init, page } = JSON.parse(require("fs").readFileSync(0, "utf8"));
        const dom = new JSDOM(html, { runScripts: "outside-only" });
        for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCSessionDescription", "RTCIceCandidate"])
          Object.defineProperty(dom.window, name, { value: function WebRtc() {}, writable: true, configurable: true });
        dom.window.eval(init);
        process.stdout.write(JSON.stringify(dom.window.eval("(() => {" + page + "})()")));
      `;
      const done = spawnSync(process.execPath, ["-e", runner], {
        cwd: path.join(__dirname, "../../.."),
        input: JSON.stringify({ html, init: RENDER_INIT_SCRIPT, page }),
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (done.status !== 0) throw new Error(done.stderr);
      return JSON.parse(done.stdout);
    };
    /** Each test starts a node of its own, which a loaded machine makes slow. */
    const SPAWN_TIMEOUT_MS = 30_000;
    const READ = (limit: number) => `${READ_PAGE_FUNCTION}(${limit})`;

    it(
      "takes WebRTC away, so that a page can neither use it nor put it back",
      () => {
        expect(
          inDocument(
            "<p>x</p>",
            `
          const names = ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCSessionDescription", "RTCIceCandidate"];
          const before = names.map((name) => typeof window[name]);
          try { RTCPeerConnection = function () {}; } catch (e) {}
          let redefined = "refused";
          try { Object.defineProperty(window, "RTCPeerConnection", { value: 1 }); redefined = "redefined"; } catch (e) {}
          return { before, afterAssign: typeof RTCPeerConnection, redefined, deleted: delete window.RTCDataChannel, rest: typeof document.createElement };
          `,
          ),
        ).toEqual({
          before: ["undefined", "undefined", "undefined", "undefined", "undefined"],
          afterAssign: "undefined",
          redefined: "refused",
          deleted: false,
          rest: "function",
        });
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "reads a small page whole, as the browser serialises it",
      () => {
        const html =
          "<html><head><title>Security</title></head><body><p>Acme &amp; co.</p></body></html>";

        expect(inDocument(html, `return ${READ(MAX_HTML_CHARS)};`)).toBe(html);
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "cuts a page that is longer than the limit inside the browser, so the whole of it never crosses over",
      () => {
        const answer = inDocument(
          "<html><body><p>Start</p></body></html>",
          `
        document.body.appendChild(document.createTextNode("a".repeat(500000)));
        for (let i = 0; i < 2000; i += 1) {
          const p = document.createElement("p");
          p.textContent = "paragraph " + i;
          document.body.appendChild(p);
        }
        const html = ${READ(1000)};
        return { html, left: document.documentElement.outerHTML.length, paragraphs: document.querySelectorAll("p").length };
        `,
        ) as { html: string; left: number; paragraphs: number };

        expect(answer.html.length).toBeLessThanOrEqual(1000);
        expect(answer.html.startsWith("<html><head></head><body><p>Start</p>aaa")).toBe(true);
        // The page itself was cut to about the limit, not only the string that was given back.
        expect(answer.left).toBeLessThan(1100);
        expect(answer.paragraphs).toBe(1);
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "cuts at many small nodes, a large attribute and a large template too",
      () => {
        expect(
          inDocument(
            "<html><body></body></html>",
            `
          for (let i = 0; i < 5000; i += 1) document.body.appendChild(document.createComment(""));
          return [${READ(2000)}.length <= 2000, document.documentElement.outerHTML.length < 2100];
          `,
          ),
        ).toEqual([true, true]);
        expect(
          inDocument(
            "<html><body><p>Start</p></body></html>",
            `
          const big = document.createElement("div");
          big.setAttribute("data-x", "b".repeat(200000));
          document.body.appendChild(big);
          return ${READ(2000)};
          `,
          ),
        ).toBe("<html><head></head><body><p>Start</p></body></html>");
        expect(
          inDocument(
            "<html><body><p>Start</p><template></template></body></html>",
            `
          document.querySelector("template").content.appendChild(document.createTextNode("c".repeat(200000)));
          return ${READ(2000)};
          `,
          ),
        ).toBe("<html><head></head><body><p>Start</p><template></template></body></html>");
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "does not cut a page of many templates that is under the limit, nor charge the content of a template for its own tags",
      () => {
        const answer = inDocument(
          `<html><head></head><body>${"<template></template>".repeat(200)}<p>Tail text</p></body></html>`,
          `
          const whole = document.documentElement.outerHTML;
          const read = ${READ_PAGE_FUNCTION}(whole.length + 50);
          return { same: read === whole, tail: read.includes("Tail text"), templates: document.querySelectorAll("template").length };
          `,
        );
        expect(answer).toEqual({ same: true, tail: true, templates: 200 });

        // Templates that hold text, and a limit of exactly the length of the page: nothing is cut.
        const exact = inDocument(
          `<html><head></head><body>${"<template><p>in</p>x</template>".repeat(50)}<p>Tail text</p></body></html>`,
          `
          const whole = document.documentElement.outerHTML;
          const read = ${READ_PAGE_FUNCTION}(whole.length);
          return { same: read === whole, left: document.documentElement.outerHTML === whole };
          `,
        );
        expect(exact).toEqual({ same: true, left: true });

        // One character less than the page, and the cut still keeps to the limit.
        const short = inDocument(
          `<html><head></head><body>${"<template><p>in</p>x</template>".repeat(50)}<p>Tail text</p></body></html>`,
          `
          const whole = document.documentElement.outerHTML;
          const read = ${READ_PAGE_FUNCTION}(whole.length - 1);
          return { fits: read.length <= whole.length - 1, tail: read.includes("Tail text") };
          `,
        );
        expect(short).toEqual({ fits: true, tail: false });
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "cuts the page even when the page has replaced what it is read and cut with",
      () => {
        const html = inDocument(
          "<html><body><p>Start</p></body></html>",
          `
        document.body.appendChild(document.createTextNode("d".repeat(300000)));
        String.prototype.slice = function () { return String(this); };
        String.prototype.substring = function () { return String(this); };
        Object.defineProperty(Element.prototype, "outerHTML", { get() { return "e".repeat(400000); } });
        Object.defineProperty(Document.prototype, "documentElement", { get() { return null; } });
        document.createTreeWalker = function () { throw new Error("no"); };
        Reflect.apply = function () { return "f".repeat(400000); };
        return ${READ(1000)};
        `,
        ) as string;

        expect(html.length).toBe(1000);
        expect(html.startsWith("<html><head></head><body><p>Start</p>ddd")).toBe(true);
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "lets a strict script that fills in a missing WebRTC name run on, and still keeps WebRTC away",
      () => {
        expect(
          inDocument(
            "<p>x</p>",
            `
          "use strict";
          let threw = "no";
          try { window.RTCPeerConnection = window.RTCPeerConnection || function () {}; } catch (e) { threw = e.name; }
          try { RTCSessionDescription = function () {}; } catch (e) { threw = e.name; }
          let redefined = "refused";
          try { Object.defineProperty(window, "RTCPeerConnection", { get() { return function () {}; } }); redefined = "redefined"; } catch (e) {}
          try { Object.defineProperty(window, "RTCDataChannel", { value: function () {}, writable: true }); redefined = "redefined"; } catch (e) {}
          let deleted = "kept";
          try { if (delete window.RTCIceCandidate) deleted = "deleted"; } catch (e) {}
          return {
            threw,
            after: [typeof window.RTCPeerConnection, typeof RTCSessionDescription, typeof RTCDataChannel, typeof RTCIceCandidate],
            redefined,
            deleted,
            configurable: Object.getOwnPropertyDescriptor(window, "RTCPeerConnection").configurable,
          };
          `,
          ),
        ).toEqual({
          threw: "no",
          after: ["undefined", "undefined", "undefined", "undefined"],
          redefined: "refused",
          deleted: "kept",
          configurable: false,
        });
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "does not cut a page under the limit that is made of many short texts",
      () => {
        const answer = inDocument(
          "<html><body><p>Start</p></body></html>",
          `
        const div = document.createElement("div");
        for (let i = 0; i < 3000; i += 1) div.appendChild(document.createTextNode("x"));
        document.body.appendChild(div);
        const end = document.createElement("p");
        end.textContent = "End of the page";
        document.body.appendChild(end);
        const whole = document.documentElement.outerHTML;
        return { whole, html: ${READ(5000)} };
        `,
        ) as { whole: string; html: string };

        // About 0.6 of the limit: it comes back whole, end and all.
        expect(answer.whole.length).toBeGreaterThan(0.55 * 5000);
        expect(answer.whole.length).toBeLessThan(5000);
        expect(answer.html).toBe(answer.whole);
        expect(answer.html).toContain("End of the page");
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "does not cut a page under the limit that is made of many empty elements, and still cuts one over it",
      () => {
        const page = (count: number, limit: number) => `
        for (let i = 0; i < ${count}; i += 1) document.body.appendChild(document.createElement("br"));
        const end = document.createElement("p");
        end.textContent = "End of the page";
        document.body.appendChild(end);
        const whole = document.documentElement.outerHTML;
        const html = ${READ(limit)};
        return { whole, html, left: document.documentElement.outerHTML.length };
        `;
        const under = inDocument("<html><body></body></html>", page(800, 4000)) as {
          whole: string;
          html: string;
        };
        expect(under.whole.length).toBeGreaterThan(0.75 * 4000);
        expect(under.html).toBe(under.whole);

        const over = inDocument("<html><body></body></html>", page(5000, 4000)) as {
          html: string;
          left: number;
        };
        expect(over.html.length).toBeLessThanOrEqual(4000);
        expect(over.html).not.toContain("End of the page");
        expect(over.left).toBeLessThan(4100);
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "never leaves half of a character where it cuts a text",
      () => {
        const face = String.fromCodePoint(0x1f600);
        const answer = inDocument(
          `<html><head><meta charset="utf-8"></head><body>${face.repeat(200)}</body></html>`,
          `
        const lone = (s) => {
          for (let i = 0; i < s.length; i += 1) {
            const c = s.charCodeAt(i);
            if (c >= 0xd800 && c <= 0xdbff) {
              const n = s.charCodeAt(i + 1);
              if (n >= 0xdc00 && n <= 0xdfff) i += 1; else return i;
            } else if (c >= 0xdc00 && c <= 0xdfff) return i;
          }
          return -1;
        };
        const html = document.documentElement.outerHTML;
        return [121, 122, 123, 124, 301].map((limit) => {
          document.documentElement.innerHTML = '<head><meta charset="utf-8"></head><body></body>';
          document.body.textContent = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
          const read = ${READ_PAGE_FUNCTION}(limit);
          return { limit, lone: lone(read), fits: read.length <= limit, faces: read.split(String.fromCodePoint(0x1f600)).length - 1 };
        });
        `,
        );

        // Around the faces, the page takes 61 characters; each face takes two. The cut keeps every
        // whole face that fits (an odd room loses its last unit, not half a face).
        const room = (limit: number) => Math.floor((limit - 61) / 2);
        expect(answer).toEqual(
          [121, 122, 123, 124, 301].map((limit) => ({
            limit,
            lone: -1,
            fits: true,
            faces: room(limit),
          })),
        );
      },
      SPAWN_TIMEOUT_MS,
    );
  });
  describe("how the page is read", () => {
    it("reads it inside the page, cut to the limit, and not as the whole document", async () => {
      const browser = fakeBrowser({ requests: [], html: RENDERED });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      // Through the DevTools protocol, not page.evaluate: that runs the text through the page's
      // own eval, which a page can replace with one that answers a string of any size.
      expect(browser.log.evaluated).toEqual([
        {
          method: "Runtime.evaluate",
          params: { expression: `${READ_PAGE_FUNCTION}(${MAX_HTML_CHARS})`, returnByValue: true },
        },
      ]);
    });

    it.each([
      ["an exception", { exceptionDetails: { text: "Uncaught" }, result: { type: "object" } }],
      ["a value that is not a string", { result: { type: "number", value: 3 } }],
      ["no answer", null],
    ])("gives nothing when reading the page ends in %s", async (_label, readAnswer) => {
      const browser = fakeBrowser({ requests: [], readAnswer });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it.each([
      ["a string longer than the limit", "x".repeat(MAX_HTML_CHARS + 1)],
      ["something that is not a string", { html: RENDERED }],
    ])("gives nothing when the page answers with %s", async (_label, html) => {
      const browser = fakeBrowser({ requests: [], html });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });
  });

  describe("the requests of the page", () => {
    const requestsOf = (...requests: FakeRequest[]) => fakeBrowser({ requests });

    it("serves the document itself from the bytes that were read, with no second request", async () => {
      const browser = requestsOf({ url: DOCUMENT_URL, navigation: true, type: "document" });
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).not.toHaveBeenCalled();
      expect(browser.handled[0].outcome).toBe("fulfilled");
      expect(browser.handled[0].fulfillment).toMatchObject({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: DOCUMENT.body,
      });
    });

    it("fetches a script through the guarded fetch, with the gate of robots.txt and the signal", async () => {
      const browser = requestsOf({ url: "https://acme.com/app.js", type: "script" });
      const fetchDeps = fakeFetch({ "https://acme.com/app.js": answer("window.x = 1;") });
      const beforeRequest = jest.fn(async () => undefined);
      const controller = new AbortController();
      const { render } = renderer(browser, fetchDeps);

      await render({ ...DOCUMENT, beforeRequest, signal: controller.signal });

      expect(fetchDeps.calls).toHaveLength(1);
      expect(fetchDeps.calls[0].options).toMatchObject({
        beforeRequest,
        allowedContentTypes: ["*/*"],
        maxBytes: RENDER_MAX_RESOURCE_BYTES,
      });
      expect(fetchDeps.calls[0].options?.signal).toEqual(expect.any(AbortSignal));
      expect(browser.handled[0].outcome).toBe("fulfilled");
      expect(browser.handled[0].fulfillment).toMatchObject({
        status: 200,
        contentType: "application/javascript",
        body: Buffer.from("window.x = 1;"),
      });
    });

    it.each(["xhr", "fetch"])("fetches a request of the page for data (%s)", async (type) => {
      const browser = requestsOf({ url: "https://acme.com/api/content", type });
      const fetchDeps = fakeFetch({
        "https://acme.com/api/content": answer('{"text":"hello"}', "application/json"),
      });
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(browser.handled[0].outcome).toBe("fulfilled");
    });

    // The page is served to a browser that is on our side of the wall; a page from another site
    // must be able to read what its own scripts ask for.
    it("lets the page read what it asked for, whatever site that was", async () => {
      const browser = requestsOf({ url: "https://api.acme.com/content", type: "fetch" });
      const { render } = renderer(browser);

      await render(DOCUMENT);

      expect(browser.handled[0].fulfillment?.headers).toMatchObject({
        "access-control-allow-origin": "*",
      });
    });

    it("answers the check that comes before a request from another site", async () => {
      const browser = requestsOf({
        url: "https://api.acme.com/content",
        type: "fetch",
        method: "OPTIONS",
        headers: { "access-control-request-method": "GET" },
      });
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).not.toHaveBeenCalled();
      expect(browser.handled[0].outcome).toBe("fulfilled");
      expect(browser.handled[0].fulfillment).toMatchObject({
        status: 204,
        headers: expect.objectContaining({
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET",
        }),
      });
    });

    it("does not answer the check that comes before a request that is not a GET", async () => {
      const browser = requestsOf({
        url: "https://api.acme.com/track",
        type: "fetch",
        method: "OPTIONS",
        headers: { "access-control-request-method": "POST" },
      });
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).not.toHaveBeenCalled();
      expect(browser.handled[0].outcome).toBe("aborted");
    });

    it.each(["image", "media", "font", "stylesheet", "websocket", "eventsource", "ping", "other"])(
      "does not fetch a %s",
      async (type) => {
        const browser = requestsOf({ url: "https://acme.com/file", type });
        const fetchDeps = fakeFetch();
        const { render } = renderer(browser, fetchDeps);

        await render(DOCUMENT);

        expect(fetchDeps.mock).not.toHaveBeenCalled();
        expect(browser.handled[0].outcome).toBe("aborted");
      },
    );

    it.each(["POST", "PUT", "DELETE", "PATCH"])("does not make a %s request", async (method) => {
      const browser = requestsOf({ url: "https://acme.com/api/track", type: "fetch", method });
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).not.toHaveBeenCalled();
      expect(browser.handled[0].outcome).toBe("aborted");
    });

    it("does not open a frame inside the page", async () => {
      const browser = requestsOf({
        url: "https://ads.example.com/frame",
        navigation: true,
        type: "document",
        main: false,
      });
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).not.toHaveBeenCalled();
      expect(browser.handled[0].outcome).toBe("aborted");
    });

    // Refusing the request would put the browser on an error page and the text would be lost: a
    // reply of "no content" leaves it where it is.
    it("keeps the page where it is when it tries to move on, and fetches nothing for it", async () => {
      const browser = requestsOf(
        { url: DOCUMENT_URL, navigation: true, type: "document" },
        { url: "https://elsewhere.example.com/", navigation: true, type: "document" },
      );
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(browser.handled.map((entry) => entry.outcome)).toEqual(["fulfilled", "fulfilled"]);
      expect(browser.handled[0].fulfillment).toMatchObject({ status: 200 });
      expect(browser.handled[1].fulfillment).toEqual({ status: 204 });
      expect(fetchDeps.mock).not.toHaveBeenCalled();
    });

    it("lets a request fail when the guarded fetch refuses it, and goes on", async () => {
      const browser = requestsOf(
        { url: "http://127.0.0.1:3000/secret", type: "fetch" },
        { url: "https://acme.com/app.js", type: "script" },
      );
      const fetchDeps = fakeFetch({
        "http://127.0.0.1:3000/secret": new FetchError("not_allowed"),
      });
      const { render } = renderer(browser, fetchDeps);

      const rendered = await render(DOCUMENT);

      expect(browser.handled.map((entry) => entry.outcome)).toEqual(["aborted", "fulfilled"]);
      expect(rendered).not.toBeNull();
    });

    it("stops answering after the most requests a page may make", async () => {
      const requests = Array.from({ length: RENDER_MAX_REQUESTS + 5 }, (_, n) => ({
        url: `https://acme.com/chunk-${n}.js`,
        type: "script",
      }));
      const browser = requestsOf(...requests);
      const fetchDeps = fakeFetch();
      const { render } = renderer(browser, fetchDeps);

      await render(DOCUMENT);

      expect(fetchDeps.mock).toHaveBeenCalledTimes(RENDER_MAX_REQUESTS);
      expect(browser.handled.filter((entry) => entry.outcome === "aborted")).toHaveLength(5);
    });

    it("stops answering after the most bytes a page may load", async () => {
      const big = answer("x".repeat(1024 * 1024));
      const requests = Array.from({ length: 20 }, (_, n) => ({
        url: `https://acme.com/big-${n}.js`,
        type: "script",
      }));
      const browser = requestsOf(...requests);
      const { render } = renderer(
        browser,
        fakeFetch(Object.fromEntries(requests.map((request) => [request.url, big]))),
      );

      await render(DOCUMENT);

      const fulfilled = browser.handled.filter((entry) => entry.outcome === "fulfilled").length;
      expect(fulfilled).toBe(Math.floor(RENDER_MAX_BYTES / (1024 * 1024)));
    });
  });

  describe("when it cannot render", () => {
    it("gives nothing when the page cannot be loaded, and still closes the context", async () => {
      const browser = fakeBrowser({
        requests: [],
        goto: async () => {
          throw new Error("net::ERR_FAILED");
        },
      });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it("gives nothing when the browser ends on its own error page", async () => {
      const browser = fakeBrowser({ requests: [], finalUrl: "chrome-error://chromewebdata/" });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it("gives nothing when the render takes longer than its time, and closes the context", async () => {
      const browser = fakeBrowser({
        requests: [],
        goto: () => new Promise<void>(() => undefined),
      });
      const { render } = renderer(browser, fakeFetch(), { timeoutMs: 100 });

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it("gives nothing at once when the page crashes, closes its context and keeps the browser", async () => {
      let gotos = 0;
      const browser = fakeBrowser({
        requests: [],
        goto: () => {
          gotos += 1;
          // The first page crashes while it loads and is never heard from again; the next loads.
          if (gotos > 1) return Promise.resolve();
          browser.crash();
          return new Promise<void>(() => undefined);
        },
      });
      const { render, launch } = renderer(browser, fakeFetch(), { timeoutMs: 3000 });

      const started = Date.now();
      await expect(render(DOCUMENT)).resolves.toBeNull();
      // Well before the time of the render (3 s).
      expect(Date.now() - started).toBeLessThan(1000);
      expect(browser.log.steps.indexOf("on:crash")).toBeGreaterThanOrEqual(0);
      expect(browser.log.steps.indexOf("on:crash")).toBeLessThan(browser.log.steps.indexOf("goto"));
      expect(browser.log.contexts[0].closed).toBe(true);
      expect(browser.log.closed).toBe(false);

      // The next page is rendered in the same browser.
      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      expect(launch).toHaveBeenCalledTimes(1);
      expect(browser.log.contexts[1].closed).toBe(true);
    });

    it("keeps the page it has read when the page crashes after the read", async () => {
      const browser = fakeBrowser({ requests: [], html: RENDERED });
      const { render } = renderer(browser);

      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      browser.crash();
      expect(browser.log.contexts[0].closed).toBe(true);
      expect(browser.log.closed).toBe(false);
      await expect(render(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
    });

    it("gives nothing when the caller gives up, and closes the context", async () => {
      const controller = new AbortController();
      const browser = fakeBrowser({
        requests: [],
        goto: () => new Promise<void>(() => undefined),
      });
      const { render } = renderer(browser);
      const result = render({ ...DOCUMENT, signal: controller.signal });
      setTimeout(() => controller.abort(), 50);

      await expect(result).resolves.toBeNull();
      expect(browser.log.contexts[0].closed).toBe(true);
    });

    it("gives nothing at once when the caller gives up while the browser is starting, and sets nothing up", async () => {
      const browser = fakeBrowser({ requests: [], goto: () => new Promise<void>(() => undefined) });
      let started: () => void = () => undefined;
      const launch = jest.fn(async () => {
        await new Promise<void>((resolve) => {
          started = resolve;
        });
        return browser.browser;
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        timeoutMs: 3000,
        settleMs: 50,
        idleMs: 50,
      });
      const controller = new AbortController();

      const result = render({ ...DOCUMENT, signal: controller.signal });
      await new Promise((resolve) => setImmediate(resolve));
      expect(launch).toHaveBeenCalledTimes(1);
      const abortedAt = Date.now();
      controller.abort();

      // Back long before the time of the render (3 s), while the browser is still starting.
      await expect(result).resolves.toBeNull();
      expect(Date.now() - abortedAt).toBeLessThan(500);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

      // The browser that comes up afterwards gets no page, and is closed when nobody uses it.
      started();
      await new Promise((resolve) => setImmediate(resolve));
      expect(browser.log.contexts).toHaveLength(0);
      expect(browser.log.closed).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(browser.log.closed).toBe(true);
    });

    it("still renders for the other page that waits on the same start when one caller gives up", async () => {
      const browser = fakeBrowser();
      let started: () => void = () => undefined;
      const launch = jest.fn(async () => {
        await new Promise<void>((resolve) => {
          started = resolve;
        });
        return browser.browser;
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        timeoutMs: 3000,
        settleMs: 50,
        idleMs: 50,
      });
      const controller = new AbortController();

      const leaving = render({ ...DOCUMENT, signal: controller.signal });
      const staying = render(DOCUMENT);
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort();
      await expect(leaving).resolves.toBeNull();
      started();

      await expect(staying).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      expect(launch).toHaveBeenCalledTimes(1);
      expect(browser.log.contexts).toHaveLength(1);
      expect(browser.log.closed).toBe(false);

      // A page that comes after a start nobody waited for is rendered in that browser, even when
      // it takes longer than the wait before an idle browser is closed.
      const slow = fakeBrowser();
      let slowStarted: () => void = () => undefined;
      const slowLaunch = jest.fn(async () => {
        await new Promise<void>((resolve) => {
          slowStarted = resolve;
        });
        return slow.browser;
      });
      const later = createChromiumRenderer({
        launch: slowLaunch,
        fetch: fakeFetch().fetch,
        timeoutMs: 3000,
        settleMs: 50,
        idleMs: 50,
      });
      const gone = new AbortController();
      const abandoned = later({ ...DOCUMENT, signal: gone.signal });
      await new Promise((resolve) => setImmediate(resolve));
      gone.abort();
      await expect(abandoned).resolves.toBeNull();
      slowStarted();
      await new Promise((resolve) => setImmediate(resolve));
      const slowPage = fakeBrowser({
        requests: [],
        goto: () => new Promise<void>((resolve) => setTimeout(resolve, 120)),
      });
      // The page of the next render loads slowly; the idle close set up after the start is off.
      slow.browser.newContext = slowPage.browser.newContext;
      await expect(later(DOCUMENT)).resolves.toEqual({ url: DOCUMENT_URL, html: RENDERED });
      expect(slowLaunch).toHaveBeenCalledTimes(1);
      expect(slow.log.closed).toBe(false);
    });

    it("gives nothing, and opens no page, when the caller gives up as the browser starts", async () => {
      const browser = fakeBrowser();
      const controller = new AbortController();
      // The abort lands inside the start, before the browser is handed over.
      const launch = jest.fn(async () => {
        controller.abort();
        return browser.browser;
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        timeoutMs: 3000,
        settleMs: 50,
      });

      const started = Date.now();
      await expect(render({ ...DOCUMENT, signal: controller.signal })).resolves.toBeNull();
      expect(Date.now() - started).toBeLessThan(500);
      expect(browser.log.contexts).toHaveLength(0);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("gives nothing at once when the caller gives up after the page has loaded, and closes the context", async () => {
      const controller = new AbortController();
      const browser = fakeBrowser({
        requests: [],
        // The page loads; the caller gives up while the renderer waits for it to settle.
        waitForLoadState: () => {
          controller.abort();
          return new Promise<void>(() => undefined);
        },
      });
      const { render } = renderer(browser, fakeFetch(), { timeoutMs: 3000 });

      const started = Date.now();
      await expect(render({ ...DOCUMENT, signal: controller.signal })).resolves.toBeNull();
      expect(Date.now() - started).toBeLessThan(500);
      expect(browser.log.steps).toContain("goto");
      expect(browser.log.contexts[0].closed).toBe(true);
      expect(browser.log.closed).toBe(false);
    });

    it("cancels the requests that are still on their way when it gives up", async () => {
      const browser = fakeBrowser({
        requests: [{ url: "https://acme.com/app.js", type: "script" }],
      });
      const signals: AbortSignal[] = [];
      const hanging = jest.fn(
        (_url: string, options?: GuardedFetchOptions) =>
          new Promise<GuardedResponse>((_resolve, reject) => {
            signals.push(options?.signal as AbortSignal);
            options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")));
          }),
      );
      const { render } = renderer(
        browser,
        { fetch: hanging as never, calls: [], mock: hanging },
        {
          timeoutMs: 100,
        },
      );

      await expect(render(DOCUMENT)).resolves.toBeNull();

      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(true);
    });

    it("leaves no listener on the signal of the caller, whichever way the render ends", async () => {
      const controller = new AbortController();
      const browser = fakeBrowser();
      const { render } = renderer(browser);

      await render({ ...DOCUMENT, signal: controller.signal });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

      const failing = fakeBrowser({
        requests: [],
        goto: async () => {
          throw new Error("net::ERR_FAILED");
        },
      });
      await renderer(failing).render({ ...DOCUMENT, signal: controller.signal });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("lets a caller that waits for a place leave when it gives up", async () => {
      const browser = fakeBrowser({
        requests: [],
        goto: () => new Promise<void>(() => undefined),
      });
      const { render } = renderer(browser, fakeFetch(), { timeoutMs: 300 });
      const controller = new AbortController();

      const busy = Array.from({ length: RENDER_CONCURRENCY }, () => render(DOCUMENT));
      await new Promise((resolve) => setImmediate(resolve));
      const waiting = render({ ...DOCUMENT, signal: controller.signal });
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort();

      // It is back long before the two pages that hold the places are given up on (300 ms).
      const started = Date.now();
      await expect(waiting).resolves.toBeNull();
      expect(Date.now() - started).toBeLessThan(200);
      expect(browser.log.contexts).toHaveLength(RENDER_CONCURRENCY);
      await Promise.all(busy);
    });

    it("closes the whole browser when a context will not close", async () => {
      const browser = fakeBrowser({
        requests: [],
        closeContext: () => new Promise(() => undefined),
      });
      const { render } = renderer(browser, fakeFetch(), { closeMs: 50 });

      await expect(render(DOCUMENT)).resolves.not.toBeNull();

      expect(browser.log.contexts[0].closed).toBe(false);
      expect(browser.log.closed).toBe(true);
    });

    it("leaves the browser alone when the context closes", async () => {
      const browser = fakeBrowser();
      const { render } = renderer(browser, fakeFetch(), { closeMs: 50 });

      await render(DOCUMENT);

      expect(browser.log.contexts[0].closed).toBe(true);
      expect(browser.log.closed).toBe(false);
    });

    it("closes a context that was still being made when it gave up, and sets nothing up in it", async () => {
      let ready: () => void = () => undefined;
      const browser = fakeBrowser({
        requests: [],
        contextReady: new Promise<void>((resolve) => {
          ready = resolve;
        }),
      });
      const { render } = renderer(browser, fakeFetch(), { timeoutMs: 50 });

      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(browser.log.contexts).toHaveLength(0);
      ready();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(browser.log.contexts).toHaveLength(1);
      expect(browser.log.contexts[0].closed).toBe(true);
      expect(browser.log.webSocketHandlers).toBe(0);
      expect(browser.log.gotoOptions).toHaveLength(0);
    });

    it("gives nothing, and starts nothing, when the caller has given up already", async () => {
      const controller = new AbortController();
      controller.abort();
      const browser = fakeBrowser();
      const { render, launch } = renderer(browser);

      await expect(render({ ...DOCUMENT, signal: controller.signal })).resolves.toBeNull();
      expect(launch).not.toHaveBeenCalled();
    });

    it("gives nothing when the browser cannot be started, and does not try again for a while", async () => {
      let now = 1_000_000;
      const launch = jest.fn(async () => {
        throw new Error("Executable doesn't exist at /usr/bin/chromium");
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        now: () => now,
        timeoutMs: 1000,
        settleMs: 10,
      });

      await expect(render(DOCUMENT)).resolves.toBeNull();
      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(launch).toHaveBeenCalledTimes(1);

      now += RENDER_LAUNCH_RETRY_MS + 1;
      await expect(render(DOCUMENT)).resolves.toBeNull();
      expect(launch).toHaveBeenCalledTimes(2);
    });

    it("says why the browser could not be started, once, and without the page", async () => {
      const messages: string[] = [];
      let now = 1_000_000;
      const launch = jest.fn(async () => {
        throw new Error("No usable sandbox");
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        now: () => now,
        log: (message) => messages.push(message),
        timeoutMs: 1000,
        settleMs: 10,
      });

      await render(DOCUMENT);
      await render(DOCUMENT);
      // The second try, after the wait, fails as well, and nobody is told again.
      now += RENDER_LAUNCH_RETRY_MS + 1;
      await render(DOCUMENT);

      expect(launch).toHaveBeenCalledTimes(2);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("No usable sandbox");
      expect(messages[0]).not.toContain("acme.com");
    });
  });

  describe("the browser it keeps", () => {
    it("is started once for all the pages", async () => {
      const browser = fakeBrowser();
      const { render, launch } = renderer(browser);

      await render(DOCUMENT);
      await render(DOCUMENT);

      expect(launch).toHaveBeenCalledTimes(1);
      expect(browser.log.contexts).toHaveLength(2);
    });

    it("is started once for pages that ask for it at the same time", async () => {
      const browser = fakeBrowser();
      const launch = jest.fn(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return browser.browser;
      });
      const render = createChromiumRenderer({
        launch,
        fetch: fakeFetch().fetch,
        timeoutMs: 2000,
        settleMs: 50,
      });

      await Promise.all([render(DOCUMENT), render(DOCUMENT)]);

      expect(launch).toHaveBeenCalledTimes(1);
      expect(browser.log.contexts).toHaveLength(2);
    });

    it("is started again when it has gone away", async () => {
      const browser = fakeBrowser();
      const { render, launch } = renderer(browser);

      await render(DOCUMENT);
      browser.log.closed = true;
      await render(DOCUMENT);

      expect(launch).toHaveBeenCalledTimes(2);
    });

    it("is closed when nobody has used it for a while", async () => {
      jest.useFakeTimers();
      try {
        const browser = fakeBrowser();
        const { render } = renderer(browser);

        const rendering = render(DOCUMENT);
        await jest.advanceTimersByTimeAsync(10);
        await rendering;
        expect(browser.log.closed).toBe(false);

        await jest.advanceTimersByTimeAsync(RENDER_BROWSER_IDLE_MS + 10);

        expect(browser.log.closed).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("how many pages at once", () => {
    it("is at most two, and the others wait their turn", async () => {
      const open: Array<() => void> = [];
      let running = 0;
      let most = 0;
      const browser = fakeBrowser({
        requests: [],
        goto: async () => {
          running += 1;
          most = Math.max(most, running);
          await new Promise<void>((resolve) => open.push(resolve));
          running -= 1;
        },
      });
      const { render } = renderer(browser, fakeFetch(), { timeoutMs: 10_000 });

      const renders = Array.from({ length: 5 }, () => render(DOCUMENT));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(RENDER_CONCURRENCY).toBe(2);
      expect(running).toBe(2);
      for (let finished = 0; finished < 5; finished += 1) {
        open.shift()?.();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all(renders);

      expect(most).toBe(2);
    });
  });
});
