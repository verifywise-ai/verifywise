/**
 * The page reader of the web research toolkit: the robots.txt check, the guarded fetch and the
 * turning of the answer into text, in one function that a web session can be given.
 *
 * Every failure comes out as a PageReadError with a fixed message. It repeats nothing of the URL
 * or of the page, because both are written by third parties.
 */
import { BOT_TOKEN, FetchError, FetchFailureReason, guardedFetch } from "./guardedFetch";
import { PageLink, extractPageText, looksLikeJavaScriptShell, tidyText } from "./pageText";
import { createRobotsChecker } from "./robots";

/** What can go wrong when a page is read: a fetch failure, or a page that holds no text for us. */
export type ReadFailureReason = FetchFailureReason | "needs_javascript";

const NEEDS_JAVASCRIPT_MESSAGE =
  "The page is built by a script and holds almost no text without running it.";

export class PageReadError extends Error {
  constructor(readonly reason: ReadFailureReason) {
    super(
      reason === "needs_javascript" ? NEEDS_JAVASCRIPT_MESSAGE : new FetchError(reason).message,
    );
    this.name = "PageReadError";
  }
}

export interface FetchedPage {
  /** The URL that answered, after redirects. */
  url: string;
  title: string;
  publishedAt: string | null;
  text: string;
  links: PageLink[];
}

export type PageReader = (url: string, signal?: AbortSignal) => Promise<FetchedPage>;

/** How much of the start of a body is searched for a `<meta charset>`. */
const SNIFF_BYTES = 2048;
const CHARSET_IN_HEADER = /charset\s*=\s*"?([^";\s]+)/i;
const CHARSET_IN_META = /<meta\s[^<>]*?charset\s*=\s*["']?\s*([^"'\s/>;]+)/i;

/** The decoder for a charset label, or null for a missing label and for one that is not known. */
function decoderFor(label: string | undefined): TextDecoder | null {
  if (!label) return null;
  try {
    return new TextDecoder(label.trim());
  } catch {
    return null;
  }
}

/**
 * The body as text. The charset is taken from the Content-Type header, else from a
 * `<meta charset>` in the first 2 KB of the body, else it is UTF-8; a label that is not known is
 * passed over. A byte that is not valid in the charset becomes U+FFFD, and a byte order mark is
 * dropped.
 */
export function decodeBody(body: Buffer, contentType: string): string {
  const decoder =
    decoderFor(CHARSET_IN_HEADER.exec(contentType)?.[1]) ??
    decoderFor(CHARSET_IN_META.exec(body.subarray(0, SNIFF_BYTES).toString("latin1"))?.[1]) ??
    new TextDecoder("utf-8");
  return decoder.decode(body);
}

/** "text/html; charset=utf-8" gives "text/html". */
const mediaTypeOf = (contentType: string): string => contentType.split(";")[0].trim().toLowerCase();

function toReadError(error: unknown): PageReadError {
  if (error instanceof PageReadError) return error;
  return new PageReadError(error instanceof FetchError ? error.reason : "unreachable");
}

/**
 * A reader for the pages of one research run.
 *
 * It asks the site's robots.txt first (once per origin for the life of the reader) and fetches
 * the page only if robots.txt allows the URL: the check runs for the first URL and for every
 * redirect hop, as `beforeRequest` of the fetch. HTML, and any type other than plain text, goes
 * through `extractPageText`; plain text is cleaned and has no title, date or links. A large page
 * with almost no text fails with `needs_javascript`. A `FetchError` becomes a `PageReadError` with
 * the same reason, and so does anything else that goes wrong (as `unreachable`).
 *
 * @param deps.fetch Replaces `guardedFetch`, for tests.
 */
export function createPageReader(deps: { fetch?: typeof guardedFetch } = {}): PageReader {
  const fetch = deps.fetch ?? guardedFetch;

  // robots.txt is fetched with no `beforeRequest`, which would ask the checker about robots.txt
  // while the checker waits for it, and with no caller signal: the checker keeps the answer for
  // every later read, and one read that was cancelled must not leave "disallowed" behind.
  const robots = createRobotsChecker(async (robotsUrl) => {
    try {
      const answer = await fetch(robotsUrl, {
        maxBytes: 65_536,
        headerTimeoutMs: 5_000,
        totalTimeoutMs: 5_000,
      });
      return { status: 200, text: decodeBody(answer.body, answer.contentType) };
    } catch (error) {
      // A missing file, and a site that refuses to show it, are a 4xx: nothing is disallowed.
      // Any other failure is rethrown, and the checker then disallows everything.
      if (
        error instanceof FetchError &&
        (error.reason === "not_found" || error.reason === "blocked_by_site")
      ) {
        return { status: 404, text: "" };
      }
      throw error;
    }
  }, BOT_TOKEN);

  const beforeRequest = async (url: URL): Promise<void> => {
    if (!(await robots.isAllowed(url))) throw new FetchError("blocked_by_robots");
  };

  return async (url, signal) => {
    try {
      const response = await fetch(url, { signal, beforeRequest });
      const body = decodeBody(response.body, response.contentType);
      if (mediaTypeOf(response.contentType) === "text/plain") {
        return { url: response.url, title: "", publishedAt: null, text: tidyText(body), links: [] };
      }
      const page = extractPageText(body, response.url);
      if (looksLikeJavaScriptShell(body, page.text)) throw new PageReadError("needs_javascript");
      return {
        url: response.url,
        title: page.title,
        publishedAt: page.publishedAt,
        text: page.text,
        links: page.links,
      };
    } catch (error) {
      throw toReadError(error);
    }
  };
}
