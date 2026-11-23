/**
 * A browser for the pages that a script builds and that carry no text with them (see
 * scriptedText.ts for the pages that do). Off unless VENDOR_RESEARCH_HEADLESS is `true`.
 *
 * The page is third-party code, so the browser runs it on our terms:
 *
 * - **The browser never opens a socket for the page.** Every request the page makes is intercepted
 *   and answered by `guardedFetch` (URL policy, address policy, robots.txt, redirects, size and
 *   time limits), or refused. The document itself is served from the bytes that were read, so it
 *   is not fetched twice. Chromium is also started without a way to resolve a name
 *   (`--host-resolver-rules`), so what interception cannot see (a preconnect) goes nowhere. Web
 *   sockets are closed.
 * - **There is no WebRTC.** Interception never sees its traffic, and a name rule does not stop an
 *   address written as numbers, so a page could otherwise send UDP (STUN, TURN) to any address and
 *   port. Three things stand in the way, each tried in Chrome 157 with the others taken out:
 *   - Chromium is started with `--webrtc-ip-handling-policy=disable_non_proxied_udp`, which
 *     stopped the UDP (the switch with "force-" in front, kept for older builds, did not).
 *   - The name rule above is what stopped TURN over TCP: that switch is about UDP only, and the
 *     TCP connection to a TURN server went out once the rule was taken away.
 *   - A script that runs in every document before the page's own (RENDER_INIT_SCRIPT) takes
 *     RTCPeerConnection and the other RTC* names away so that the page cannot put them back. It
 *     reaches a frame the page makes with `sandbox="allow-scripts"` only because Chromium is
 *     started with `--disable-site-isolation-trials`: otherwise such a frame runs in a process of
 *     its own, which gets neither the script nor the interception of requests. (That switch, not
 *     `--disable-features=IsolateSandboxedIframes`: a second `--disable-features` replaces the
 *     list Playwright passes, which keeps interception working on redirects.) The switch has a
 *     cost: in Chrome 157 a page can crash its own renderer with it (a popup that a sandboxed
 *     frame opens and that posts a message to the page), which it did not do without it. Only
 *     that render is lost: it ends at once with null, as any crash does.
 * - **Only what a page needs to build its text is fetched**: scripts and the requests of its
 *   scripts for data (`xhr`, `fetch`), by GET. Images, fonts, styles, media and everything else are
 *   refused, and so is any request that is not a GET: a page of a vendor must not be able to make
 *   our server post anywhere. The one check that precedes a request from another site (CORS) is
 *   answered.
 * - **The page cannot go anywhere**: a frame inside it that needs a request is not opened (one
 *   the page writes itself, from `srcdoc`, `data:` or `blob:`, loads, with the script above), a
 *   second navigation of the page is refused, a window it opens is closed, a dialog is dismissed,
 *   downloads are off, service workers are blocked, and there are no permissions.
 * - **It is bounded**: at most RENDER_MAX_REQUESTS requests, RENDER_MAX_BYTES bytes of answers, and
 *   RENDER_TIMEOUT_MS for the whole render, after which the context is closed (at once when the
 *   page crashes). The page is read inside the browser, cut to MAX_HTML_CHARS characters there
 *   (by functions the script of every
 *   document keeps before the page can replace them), so a page that a script makes huge never
 *   reaches this process whole. The heap of the JavaScript of a page is capped
 *   (`--js-flags=--max-old-space-size`); past it the page crashes and the answer is null. What the
 *   browser itself holds is not bounded beyond that and the time: the nodes and text of the page,
 *   and the memory of typed arrays, live outside that heap. At most
 *   RENDER_CONCURRENCY pages are rendered at once in the process. The browser is started when it
 *   is first needed, kept, and closed after RENDER_BROWSER_IDLE_MS without use.
 * - **Chromium always keeps its own sandbox.** As root it cannot (as in a container that runs as
 *   root), so a process that runs as root does not start it at all (`RootRenderRefused`): pages of
 *   the open web are not run without a sandbox, unlike the PDF reports, which render the app's own
 *   HTML. Run the backend and the worker unprivileged to read pages that need JavaScript.
 *
 * Any failure (no Chromium, a page that does not load, the time, the caller giving up) is an
 * answer of null: the page reader then reports the page as one that needs JavaScript, as it did
 * before this existed.
 */
import { ANY_CONTENT_TYPE, BOT_USER_AGENT, guardedFetch } from "./guardedFetch";
import { createLimiter } from "./limiter";
import { MAX_HTML_CHARS, SHELL_MAX_TEXT_CHARS } from "./pageText";

/** Pages that are rendered at the same time in the process. */
export const RENDER_CONCURRENCY = 2;
/** The whole render of one page. */
export const RENDER_TIMEOUT_MS = 20_000;
/** The wait for the network to go quiet after the document has loaded. */
export const RENDER_SETTLE_MS = 6000;
/** The wait for the page to hold some text after that. */
const RENDER_TEXT_WAIT_MS = 1500;
/** The requests of one page that are answered; the rest are refused. */
export const RENDER_MAX_REQUESTS = 60;
/** The bytes of answers one page may load, all together. */
export const RENDER_MAX_BYTES = 12 * 1024 * 1024;
/** The bytes of one answer. */
export const RENDER_MAX_RESOURCE_BYTES = 3 * 1024 * 1024;
/** How long the browser stays when nobody uses it. */
export const RENDER_BROWSER_IDLE_MS = 60_000;
/** After the browser could not be started, how long it is not tried again. */
export const RENDER_LAUNCH_RETRY_MS = 5 * 60_000;
/** How long closing a context may take before the whole browser is given up on. */
const CLOSE_TIMEOUT_MS = 3000;

/** The kinds of request that a page makes to build its text. */
const NEEDED_TYPES: ReadonlySet<string> = new Set(["script", "xhr", "fetch"]);

/** The page may read what it asked for, whatever site it came from: nothing here is private to it. */
const OPEN_TO_ANY_SITE = { "access-control-allow-origin": "*" };
const ANSWER_TO_CHECK = {
  ...OPEN_TO_ANY_SITE,
  "access-control-allow-methods": "GET",
  "access-control-allow-headers": "*",
};

/** What Chromium is started with, besides the sandbox. */
export const CHROMIUM_ARGS: readonly string[] = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--host-resolver-rules=MAP * ~NOTFOUND",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-site-isolation-trials",
  "--js-flags=--max-old-space-size=256",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-extensions",
  "--disable-component-update",
  "--no-first-run",
  "--mute-audio",
];

/** The function that the script of every document leaves, which reads the page cut to a limit. */
export const READ_PAGE_FUNCTION = "__verifywiseReadPage";

/**
 * The script that runs in every document of the context before the document's own scripts (as a
 * text, for the reason given at `holdsText`). It does two things:
 *
 * - It takes WebRTC away: every global whose name starts with RTC or webkitRTC is removed and
 *   replaced by a property that cannot be deleted or defined again, whose value is undefined and
 *   that ignores what is written to it. (Ignored rather than refused, so that a strict script that
 *   fills in a missing name runs on. A script that declares such a name at its top level with
 *   const, let, class or function still fails: the name cannot be given up.)
 * - It leaves READ_PAGE_FUNCTION, which gives the page as `outerHTML` gives it, at most `limit`
 *   characters long. First it cuts the page itself to about the limit (the text where the limit
 *   falls is shortened, and every node after it is removed; a page whose root alone is over the
 *   limit is read as nothing), so that the browser does not build
 *   the whole of a huge page as one string either; that walk uses the page's own objects and is
 *   only a best effort. The reading and the final cut use functions taken before the page could
 *   replace them, so whatever the page does, no more than `limit` characters come back.
 */
export const RENDER_INIT_SCRIPT = `(() => {
  "use strict";
  const g = globalThis;
  const define = Object.defineProperty;
  for (const name of Object.getOwnPropertyNames(g)) {
    if (!/^(webkit)?RTC/.test(name)) continue;
    try { delete g[name]; } catch (e) {}
    try { define(g, name, { get() { return undefined; }, set(value) {}, enumerable: false, configurable: false }); } catch (e) {}
  }
  if (typeof Element === "undefined" || typeof Document === "undefined" || typeof document === "undefined") return;
  const apply = Reflect.apply;
  const getter = (proto, key) => Object.getOwnPropertyDescriptor(proto, key).get;
  const outerHTML = getter(Element.prototype, "outerHTML");
  const documentElement = getter(Document.prototype, "documentElement");
  const slice = String.prototype.slice;
  const charCodeAt = String.prototype.charCodeAt;
  const doc = document;
  const cut = (root, limit) => {
    let used = 0;
    const over = (cost) => (used += cost) > limit;
    let emptiedTemplate = false;
    const VOID = /^(AREA|BASE|BR|COL|EMBED|HR|IMG|INPUT|LINK|META|SOURCE|TRACK|WBR|BASEFONT|BGSOUND|FRAME|KEYGEN|PARAM)$/;
    const walk = (start) => {
      const walker = doc.createTreeWalker(start, 0xffffffff);
      for (let node = walker.currentNode; node !== null; node = walker.nextNode()) {
        if (node.nodeType === 1) {
          const tag = node.tagName;
          let cost = VOID.test(tag) ? tag.length + 2 : 2 * tag.length + 5;
          const attributes = node.attributes;
          for (let i = 0; i < attributes.length; i += 1)
            cost += attributes[i].name.length + attributes[i].value.length + 4;
          if (over(cost)) return node;
          const content = node.content;
          if (content && content.nodeType === 11 && walk(content) !== null) {
            content.replaceChildren();
            emptiedTemplate = true;
            return node;
          }
        } else {
          const length = node.length | 0;
          const type = node.nodeType;
          let cost = length + 7;
          if (type === 3) cost = length > 1 ? length : 1;
          else if (type === 4) cost = length + 12;
          else if (type === 7) cost = length + String(node.target).length + 4;
          // The content of a template, where its walk starts: its tags are the template's own.
          else if (type === 11) cost = 0;
          if (over(cost)) return node;
        }
      }
      return null;
    };
    const last = walk(root);
    if (last === null) return true;
    if (last === root) return false;
    for (let node = last; node !== root; node = node.parentNode)
      while (node.nextSibling !== null) node.parentNode.removeChild(node.nextSibling);
    if (last.nodeType === 1) {
      if (!emptiedTemplate) last.parentNode.removeChild(last);
    } else if (typeof last.deleteData === "function") {
      let keep = last.length - (used - limit);
      if (keep < 0) keep = 0;
      if (keep > 0) {
        const unit = apply(charCodeAt, String(last.data), [keep - 1]);
        if (unit >= 0xd800 && unit <= 0xdbff) keep -= 1;
      }
      last.deleteData(keep, last.length);
    }
    return true;
  };
  const read = (limit) => {
    const root = apply(documentElement, doc, []);
    if (root === null) return "";
    try { if (cut(root, limit) === false) return ""; } catch (e) {}
    const html = apply(outerHTML, root, []);
    if (typeof html !== "string") return "";
    if (html.length <= limit) return html;
    let end = limit;
    const unit = apply(charCodeAt, html, [end - 1]);
    if (unit >= 0xd800 && unit <= 0xdbff) end -= 1;
    return apply(slice, html, [0, end]);
  };
  define(g, ${JSON.stringify(READ_PAGE_FUNCTION)}, { value: Object.freeze(read), writable: false, enumerable: false, configurable: false });
})();`;

// The parts of a browser that the renderer uses, as plain interfaces: Playwright's own objects
// satisfy them, and a test supplies a script in their place.

export interface RenderRequestInfo {
  url(): string;
  method(): string;
  resourceType(): string;
  isNavigationRequest(): boolean;
  frame(): unknown;
  headers(): Record<string, string>;
}

export interface RenderRoute {
  request(): RenderRequestInfo;
  fulfill(options: {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
    body?: Buffer;
  }): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

export interface RenderPage {
  mainFrame(): unknown;
  url(): string;
  on(event: "dialog", listener: (dialog: { dismiss(): Promise<void> }) => unknown): unknown;
  on(event: "popup", listener: (popup: { close(): Promise<void> }) => unknown): unknown;
  on(event: "crash", listener: () => unknown): unknown;
  goto(
    url: string,
    options?: { waitUntil?: "domcontentloaded"; timeout?: number },
  ): Promise<unknown>;
  waitForLoadState(state: "networkidle", options?: { timeout?: number }): Promise<unknown>;
  waitForFunction(
    expression: string,
    argument?: unknown,
    options?: { timeout?: number },
  ): Promise<unknown>;
}

/** A session of the DevTools protocol on a page, through which the page is read. */
export interface RenderSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface RenderContext {
  route(pattern: string, handler: (route: RenderRoute) => Promise<void>): Promise<void>;
  routeWebSocket(
    pattern: RegExp,
    handler: (socket: { close(): unknown }) => unknown,
  ): Promise<void>;
  addInitScript(script: string): Promise<void>;
  newPage(): Promise<RenderPage>;
  newCDPSession(page: RenderPage): Promise<RenderSession>;
  close(): Promise<void>;
}

export interface RenderBrowser {
  newContext(options: Record<string, unknown>): Promise<RenderContext>;
  close(): Promise<void>;
  isConnected(): boolean;
}

export interface RenderRequest {
  /** The address that answered, after redirects: the page the browser is asked to load. */
  url: string;
  /** The document as it was read, which the browser is given instead of fetching it again. */
  body: Buffer;
  contentType: string;
  /** The gate that every request passes, robots.txt (see readPage.ts). */
  beforeRequest?: (url: URL) => Promise<void>;
  signal?: AbortSignal;
}

export interface RenderedPage {
  /**
   * The address that was read (`RenderRequest.url`, after the redirects of the guarded fetch). It
   * is not the address the browser shows, which a page can change with the History API.
   */
  url: string;
  /** The page as the browser built it. */
  html: string;
}

/** Renders a page, or gives null when it cannot. */
export type PageRenderer = (request: RenderRequest) => Promise<RenderedPage | null>;

export interface RendererDeps {
  /** Starts the browser; Chromium through Playwright by default. */
  launch?: () => Promise<RenderBrowser>;
  /** Replaces `guardedFetch`, for tests. */
  fetch?: typeof guardedFetch;
  now?: () => number;
  /** Where a failure to start the browser is reported. */
  log?: (message: string) => void;
  timeoutMs?: number;
  settleMs?: number;
  idleMs?: number;
  /** How long closing a context may take before the whole browser is given up on. */
  closeMs?: number;
}

/**
 * Thrown instead of starting Chromium in a process that runs as root. As root Chromium cannot keep
 * its own sandbox, and a page of the open web would then run its scripts with no sandbox in the
 * process that holds the database credentials and every organization's LLM keys. The renderer
 * reports it once, and pages that need JavaScript are reported as such, as with headless off.
 */
export class RootRenderRefused extends Error {
  constructor() {
    super(
      "the process runs as root, and Chromium is not started without its sandbox; run the backend and the worker as an unprivileged user to read pages that need JavaScript",
    );
    this.name = "RootRenderRefused";
  }
}

/** Whether this process runs as root; `getuid` is absent on Windows. */
export const runsAsRoot = (): boolean =>
  typeof process.getuid === "function" && process.getuid() === 0;

/** Chromium through Playwright, which is a dependency already (the PDF reports use it). */
export async function launchChromium(asRoot: () => boolean = runsAsRoot): Promise<RenderBrowser> {
  if (asRoot()) throw new RootRenderRefused();
  const { chromium } = await import("playwright");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    args: [...CHROMIUM_ARGS],
    ...(executablePath ? { executablePath } : {}),
  });
  return browser as unknown as RenderBrowser;
}

/** The first line of a message, short: it goes to a log, and a launch error can be long. */
const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 300);

/** A promise that gives `fallback` if it has not settled in `ms`, or if it fails. */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * An expression for the page: whether it holds at least `minimum` characters of text. It is text
 * and not a function, because a function is sent to the page as its source, and anything a build
 * puts into it (a counter of coverage, a helper of the compiler) would not exist there.
 */
const holdsText = (minimum: number): string =>
  `(document.body ? document.body.innerText.length : 0) >= ${minimum}`;

export function createChromiumRenderer(deps: RendererDeps = {}): PageRenderer {
  const launch = deps.launch ?? (() => launchChromium());
  const fetchResource = deps.fetch ?? guardedFetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => undefined);
  const timeoutMs = deps.timeoutMs ?? RENDER_TIMEOUT_MS;
  const settleMs = deps.settleMs ?? RENDER_SETTLE_MS;
  const idleMs = deps.idleMs ?? RENDER_BROWSER_IDLE_MS;
  const closeMs = deps.closeMs ?? CLOSE_TIMEOUT_MS;
  const places = createLimiter(RENDER_CONCURRENCY);

  let browser: RenderBrowser | null = null;
  let launching: Promise<RenderBrowser | null> | null = null;
  let failedAt: number | null = null;
  let reported = false;
  let rendering = 0;
  let idleTimer: NodeJS.Timeout | null = null;

  const closeBrowser = async () => {
    const closing = browser;
    browser = null;
    if (closing !== null) await within(closing.close(), closeMs, undefined);
  };

  const stopIdleTimer = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const startIdleTimer = () => {
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (rendering === 0) void closeBrowser();
    }, idleMs);
    idleTimer.unref?.();
  };

  const getBrowser = (): Promise<RenderBrowser | null> => {
    if (browser !== null && browser.isConnected()) return Promise.resolve(browser);
    if (launching !== null) return launching;
    if (failedAt !== null && now() - failedAt < RENDER_LAUNCH_RETRY_MS)
      return Promise.resolve(null);
    launching = (async () => {
      try {
        const started = await launch();
        browser = started;
        failedAt = null;
        // Every page that asked for it gave up while it started: it is closed if nobody comes.
        if (rendering === 0) startIdleTimer();
        return started;
      } catch (error) {
        failedAt = now();
        // Said once: a server without Chromium would say it for every page otherwise.
        if (!reported) {
          reported = true;
          log(
            `Chromium could not be started to read pages that need JavaScript: ${firstLine(error)}`,
          );
        }
        return null;
      } finally {
        launching = null;
      }
    })();
    return launching;
  };

  /** The browser, a context of its own, the page, and everything the page asks for. */
  const renderOnce = async (request: RenderRequest): Promise<RenderedPage | null> => {
    // The caller is heard from the start: a signal does not tell a listener added after it gave up.
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) controller.abort();
    // A caller that gives up while the browser is starting is let go at once. The start goes on
    // for the next page; a browser that nobody is waiting for is closed when it has been idle.
    const started = await new Promise<RenderBrowser | null>((resolve) => {
      if (controller.signal.aborted) return resolve(null);
      controller.signal.addEventListener("abort", () => resolve(null), { once: true });
      getBrowser().then(resolve, () => resolve(null));
    });
    if (started === null || controller.signal.aborted) {
      request.signal?.removeEventListener("abort", onAbort);
      return null;
    }

    let context: RenderContext | undefined;
    let abandoned = false;

    const work = (async (): Promise<RenderedPage> => {
      context = await started.newContext({
        userAgent: BOT_USER_AGENT,
        javaScriptEnabled: true,
        acceptDownloads: false,
        serviceWorkers: "block",
        permissions: [],
        locale: "en",
        viewport: { width: 1280, height: 800 },
      });
      // The context could not be closed in time while it was still being made.
      if (abandoned) throw new Error("The render was given up on.");
      await context.addInitScript(RENDER_INIT_SCRIPT);
      await context.routeWebSocket(/.*/, (socket) => void socket.close());
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
      page.on("popup", (popup) => void popup.close().catch(() => undefined));
      // A page whose renderer has died never answers again: the render ends now, as when the
      // caller gives up, instead of waiting out its time.
      page.on("crash", () => controller.abort());

      const mainFrame = page.mainFrame();
      let navigations = 0;
      let requests = 0;
      let bytes = 0;
      const refuse = (route: RenderRoute) => route.abort("failed").catch(() => undefined);

      await context.route("**/*", async (route) => {
        const asked = route.request();
        if (asked.isNavigationRequest()) {
          // A frame inside the page is not opened.
          if (asked.frame() !== mainFrame) return refuse(route);
          navigations += 1;
          // The first navigation of the page is the document, which was read already. A page that
          // moves on (a redirect by script) gets "no content", which leaves the browser on the
          // page it has: refusing the request would replace the page with an error page.
          if (navigations > 1) {
            return route.fulfill({ status: 204 }).catch(() => undefined);
          }
          return route
            .fulfill({ status: 200, contentType: request.contentType, body: request.body })
            .catch(() => undefined);
        }
        // The check that a browser makes before a request to another site.
        if (
          asked.method() === "OPTIONS" &&
          asked.headers()["access-control-request-method"]?.toUpperCase() === "GET"
        ) {
          return route.fulfill({ status: 204, headers: ANSWER_TO_CHECK }).catch(() => undefined);
        }
        if (asked.method() !== "GET" || !NEEDED_TYPES.has(asked.resourceType())) {
          return refuse(route);
        }
        requests += 1;
        if (requests > RENDER_MAX_REQUESTS) return refuse(route);
        try {
          const answer = await fetchResource(asked.url(), {
            signal: controller.signal,
            beforeRequest: request.beforeRequest,
            allowedContentTypes: [ANY_CONTENT_TYPE],
            maxBytes: RENDER_MAX_RESOURCE_BYTES,
          });
          if (bytes + answer.body.length > RENDER_MAX_BYTES) return refuse(route);
          bytes += answer.body.length;
          return route
            .fulfill({
              status: 200,
              contentType: answer.contentType || undefined,
              headers: OPEN_TO_ANY_SITE,
              body: answer.body,
            })
            .catch(() => undefined);
        } catch {
          return refuse(route);
        }
      });

      await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      // Neither wait is an error when it runs out: the page is read as it stands.
      await page.waitForLoadState("networkidle", { timeout: settleMs }).catch(() => undefined);
      await page
        .waitForFunction(holdsText(SHELL_MAX_TEXT_CHARS), undefined, {
          timeout: RENDER_TEXT_WAIT_MS,
        })
        .catch(() => undefined);
      // The page of the browser's own errors is not the page that was asked for.
      if (page.url().startsWith("chrome-error:"))
        throw new Error("The browser ended on an error page.");
      // Read and cut inside the page: a page that a script makes huge does not come here whole. It
      // is asked through the DevTools protocol and not with `page.evaluate`, which runs a text
      // through the page's own `eval`, which the page can replace with one that answers anything.
      const session = await context.newCDPSession(page);
      const answer = (await session.send("Runtime.evaluate", {
        expression: `${READ_PAGE_FUNCTION}(${MAX_HTML_CHARS})`,
        returnByValue: true,
      })) as { result?: { type?: unknown; value?: unknown }; exceptionDetails?: unknown } | null;
      const html = answer?.result?.value;
      if (
        answer?.exceptionDetails !== undefined ||
        answer?.result?.type !== "string" ||
        typeof html !== "string" ||
        html.length > MAX_HTML_CHARS
      )
        throw new Error("The page could not be read.");
      return { url: request.url, html };
    })();

    let timer: NodeJS.Timeout | undefined;
    const ended = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
      controller.signal.addEventListener("abort", () => resolve(null), { once: true });
    });
    try {
      const result = await Promise.race([work.catch(() => null), ended]);
      if (result === null) {
        abandoned = true;
        controller.abort();
      }
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      // A context that is not closed in time means a page that is stuck: the browser goes too.
      const closed =
        context === undefined
          ? true
          : await within(
              context.close().then(() => true),
              closeMs,
              false,
            );
      if (!closed) void closeBrowser();
      // A render that was given up on may still finish making its context; it closes it then.
      void work
        .catch(() => undefined)
        .finally(() => {
          if (abandoned && context !== undefined) void context.close().catch(() => undefined);
        });
    }
  };

  return async (request) => {
    if (request.signal?.aborted) return null;
    let release: () => void;
    try {
      release = await places.take(request.signal);
    } catch {
      return null;
    }
    rendering += 1;
    stopIdleTimer();
    try {
      return await renderOnce(request);
    } catch {
      return null;
    } finally {
      rendering -= 1;
      release();
      if (rendering === 0 && browser !== null) startIdleTimer();
    }
  };
}
