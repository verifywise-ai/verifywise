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
 *   (`--host-resolver-rules`), so what interception cannot see (a preconnect) goes nowhere, and
 *   without WebRTC's direct UDP. Web sockets are closed.
 * - **Only what a page needs to build its text is fetched**: scripts and the requests of its
 *   scripts for data (`xhr`, `fetch`), by GET. Images, fonts, styles, media and everything else are
 *   refused, and so is any request that is not a GET: a page of a vendor must not be able to make
 *   our server post anywhere. The one check that precedes a request from another site (CORS) is
 *   answered.
 * - **The page cannot go anywhere**: a frame inside it is not opened, a second navigation of the
 *   page is refused, a window it opens is closed, a dialog is dismissed, downloads are off, service
 *   workers are blocked, and there are no permissions.
 * - **It is bounded**: at most RENDER_MAX_REQUESTS requests, RENDER_MAX_BYTES bytes of answers, and
 *   RENDER_TIMEOUT_MS for the whole render, after which the context is closed. At most
 *   RENDER_CONCURRENCY pages are rendered at once in the process. The browser is started when it
 *   is first needed, kept, and closed after RENDER_BROWSER_IDLE_MS without use.
 * - **Chromium keeps its own sandbox** unless the process runs as root, where it refuses to start
 *   with one (as in a container that runs as root); then it is started without it, as the PDF
 *   reports are (see services/reporting/pdfGenerator.ts). Run the backend unprivileged to keep it.
 *
 * Any failure (no Chromium, a page that does not load, the time, the caller giving up) is an
 * answer of null: the page reader then reports the page as one that needs JavaScript, as it did
 * before this existed.
 */
import { ANY_CONTENT_TYPE, BOT_USER_AGENT, guardedFetch } from "./guardedFetch";
import { createLimiter } from "./limiter";
import { SHELL_MAX_TEXT_CHARS } from "./pageText";

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
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-extensions",
  "--disable-component-update",
  "--no-first-run",
  "--mute-audio",
];

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
  content(): Promise<string>;
}

export interface RenderContext {
  route(pattern: string, handler: (route: RenderRoute) => Promise<void>): Promise<void>;
  routeWebSocket(
    pattern: RegExp,
    handler: (socket: { close(): unknown }) => unknown,
  ): Promise<void>;
  newPage(): Promise<RenderPage>;
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
  /** The address the page ended on; the same as the one asked for, as the page cannot move on. */
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

/** Chromium through Playwright, which is a dependency already (the PDF reports use it). */
async function launchChromium(): Promise<RenderBrowser> {
  const { chromium } = await import("playwright");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const browser = await chromium.launch({
    headless: true,
    args: asRoot
      ? ["--no-sandbox", "--disable-setuid-sandbox", ...CHROMIUM_ARGS]
      : [...CHROMIUM_ARGS],
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
  const launch = deps.launch ?? launchChromium;
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
    const started = await getBrowser();
    if (started === null) return null;

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });
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
      await context.routeWebSocket(/.*/, (socket) => void socket.close());
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
      page.on("popup", (popup) => void popup.close().catch(() => undefined));

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
      return { url: page.url(), html: await page.content() };
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
