import { getEventListeners } from "node:events";
import { BOT_USER_AGENT, FetchError, GuardedFetchOptions, GuardedResponse } from "../guardedFetch";
import {
  CHROMIUM_ARGS,
  RENDER_BROWSER_IDLE_MS,
  RENDER_CONCURRENCY,
  RENDER_LAUNCH_RETRY_MS,
  RENDER_MAX_BYTES,
  RENDER_MAX_REQUESTS,
  RENDER_MAX_RESOURCE_BYTES,
  RenderBrowser,
  RenderContext,
  RenderPage,
  RenderRoute,
  createChromiumRenderer,
} from "../renderPage";

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
  /** What `content()` answers once the page has loaded. */
  html?: string;
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
  const log = {
    contexts: [] as Array<{ options: Record<string, unknown>; closed: boolean }>,
    webSocketHandlers: 0,
    waits: [] as string[],
    gotoOptions: [] as Array<Record<string, unknown>>,
    dialogsDismissed: 0,
    popupsClosed: 0,
    closed: false,
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
          if (event === "popup") {
            void (listener as (popup: { close: () => Promise<void> }) => unknown)({
              close: async () => {
                log.popupsClosed += 1;
              },
            });
          }
        },
        goto: async (_url, gotoOptions) => {
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
        content: async () => script.html ?? RENDERED,
      };
      const context: RenderContext = {
        route: async (_pattern, handler) => {
          routeHandler = handler;
        },
        routeWebSocket: async () => {
          log.webSocketHandlers += 1;
        },
        newPage: async () => page,
        close: async () => {
          if (script.closeContext) await script.closeContext();
          record.closed = true;
        },
      };
      return context;
    },
  };
  return { browser, handled, log };
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
