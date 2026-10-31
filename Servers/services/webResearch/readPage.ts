/**
 * The page reader of the web research toolkit: the robots.txt check, the guarded fetch and the
 * turning of the answer into text, in one function that a web session can be given.
 *
 * Every failure comes out as a PageReadError with a fixed message. It repeats nothing of the URL
 * or of the page, because both are written by third parties.
 */
import {
  ANY_CONTENT_TYPE,
  BOT_TOKEN,
  DEFAULT_CONTENT_TYPES,
  FetchError,
  FetchFailureReason,
  GuardedResponse,
  guardedFetch,
  mediaTypeOf,
} from "./guardedFetch";
import {
  PageLink,
  SHELL_MAX_TEXT_CHARS,
  extractPageText,
  looksLikeJavaScriptShell,
  tidyText,
} from "./pageText";
import {
  MAX_PDF_BYTES,
  OCTET_STREAM_TYPES,
  PDF_MEDIA_TYPES,
  PdfError,
  looksLikePdf,
  readPdf as readPdfDocument,
} from "./pdfText";
import type { PageRenderer } from "./renderPage";
import { createRobotsChecker } from "./robots";
import { extractScriptedText } from "./scriptedText";
import { type PageIdentity, extractPageIdentity } from "./siteIdentity";
import { WebCache, cacheRobots, readCachedRobots, withPageCache } from "./webCache";

/** What can go wrong when a page is read: a fetch failure, or a page that holds no text for us. */
export type ReadFailureReason = FetchFailureReason | "needs_javascript";

const NEEDS_JAVASCRIPT_MESSAGE =
  "The page is built by a script and holds almost no text without running it.";

export class PageReadError extends Error {
  /**
   * The error that was not a FetchError and became `unreachable`, kept to find out what went wrong.
   * It can repeat the URL or the page, so it is never shown to a model or put in a log.
   */
  readonly cause?: unknown;

  constructor(
    readonly reason: ReadFailureReason,
    cause?: unknown,
  ) {
    super(
      reason === "needs_javascript" ? NEEDS_JAVASCRIPT_MESSAGE : new FetchError(reason).message,
    );
    this.name = "PageReadError";
    this.cause = cause;
  }
}

export interface FetchedPage {
  /** The URL that answered, after redirects. */
  url: string;
  title: string;
  publishedAt: string | null;
  text: string;
  links: PageLink[];
  /**
   * The address the page claims for itself (`<link rel="canonical">`, else `og:url`), resolved
   * against `url`. The page's own word: the session decides whether to take it (see urlCanon.ts).
   */
  canonicalUrl?: string | null;
  /**
   * What an HTML page says about its site in its data: the names the site gives itself and the
   * products it lists (see siteIdentity.ts). Only there when the page says something; the page's
   * own word, which the caller must weigh.
   */
  identity?: PageIdentity;
}

export type PageReader = (url: string, signal?: AbortSignal) => Promise<FetchedPage>;

/** The path of a sitemap: `/sitemap.xml`, `/sitemap-pages.xml`. */
const SITEMAP_PATH = /\/sitemap[^/]*\.xml$/i;

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

/** The `identity` of a page, only when the HTML says something about its site. */
function identityOf(html: string): { identity?: PageIdentity } {
  const identity = extractPageIdentity(html);
  return identity.names.length + identity.products.length > 0 ? { identity } : {};
}

/** The larger body that a PDF may have, for every type a PDF can come as. */
const PDF_BYTE_LIMITS: Readonly<Record<string, number>> = Object.fromEntries(
  [...PDF_MEDIA_TYPES, ...OCTET_STREAM_TYPES].map((type) => [type, MAX_PDF_BYTES]),
);

/**
 * The media types an answer for `url` may have: pages, and PDFs. A server sometimes sends a PDF as
 * an unknown file, so an address that names a PDF may be answered with one too; the file is read as
 * a PDF only if it begins like one. Any other address gets no such allowance, so that a download
 * of anything is refused before its body is read.
 */
function allowedTypesFor(url: string): string[] {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    // The fetch refuses an address that is not one.
  }
  const namesPdf = /\.pdf$/i.test(pathname);
  return [...DEFAULT_CONTENT_TYPES, ...PDF_MEDIA_TYPES, ...(namesPdf ? OCTET_STREAM_TYPES : [])];
}

function toReadError(error: unknown): PageReadError {
  if (error instanceof PageReadError) return error;
  if (error instanceof FetchError) return new PageReadError(error.reason);
  // A PDF that cannot be read is a format that cannot be read; one that was cancelled was not
  // reached. The message of a PdfError is fixed, so it is safe to keep as the cause.
  if (error instanceof PdfError) {
    return new PageReadError(
      error.reason === "aborted" ? "unreachable" : "unsupported_type",
      error,
    );
  }
  return new PageReadError("unreachable", error);
}

/**
 * A reader for the pages of one research run.
 *
 * It asks the site's robots.txt first (once per origin for the life of the reader) and fetches
 * the page only if robots.txt allows the URL: the check runs for the first URL and for every
 * redirect hop, as `beforeRequest` of the fetch. An origin whose robots.txt the URL or address
 * policy refused (most often a host that resolves to an address that is not public) is refused as
 * `not_allowed`, as the fetch would refuse its pages, and not as `blocked_by_robots`. HTML, and
 * any type other than plain text, goes through `extractPageText`; plain text is cleaned and has no
 * title, date or links; a sitemap (`sitemap*.xml` as XML) is kept as it is, markup included. A PDF
 * (see pdfText.ts) is read in a worker thread into text, title and date, and has no links; one that
 * cannot be read is `unsupported_type`. A large page with almost no text is read from the data it
 * carries (see scriptedText.ts) when that holds enough text, then as a browser builds it when there
 * is one (`deps.render`), and fails with `needs_javascript` when neither gives enough text. A `FetchError` becomes a `PageReadError` with the same reason, and so does
 * anything else that goes wrong (as `unreachable`).
 *
 * With a cache, the reader shares what it learns with the readers of other runs: the robots.txt of
 * an origin (24 hours, and only a text that was read or a file that is not there, never a refusal
 * to show it or a failure) and the pages that were read (15 minutes, see webCache.ts). A hit costs
 * no request. Without one, each reader asks for itself, as before.
 *
 * @param deps.fetch Replaces `guardedFetch`, for tests.
 * @param deps.cache The cache shared by runs; none by default.
 * @param deps.readPdf Replaces the reader of PDFs, for tests.
 * @param deps.render Renders a page that a script builds and that carries no text, in a browser
 *   (see renderPage.ts); none by default, and then such a page is `needs_javascript`.
 */
export function createPageReader(
  deps: {
    fetch?: typeof guardedFetch;
    cache?: WebCache;
    readPdf?: typeof readPdfDocument;
    render?: PageRenderer;
  } = {},
): PageReader {
  const fetch = deps.fetch ?? guardedFetch;
  const cache = deps.cache;
  const readPdf = deps.readPdf ?? readPdfDocument;
  const render = deps.render;
  /** The origins whose robots.txt the URL or address policy refused. */
  const refusedOrigins = new Set<string>();

  // robots.txt is fetched with no `beforeRequest`, which would ask the checker about robots.txt
  // while the checker waits for it, and with no caller signal: the checker keeps the answer for
  // every later read, and one read that was cancelled must not leave "disallowed" behind. Any
  // Content-Type is parsed: RFC 9309 makes no condition on it, and a refused file would count as
  // unreachable and block the whole origin (static hosting serves it as application/octet-stream).
  const robots = createRobotsChecker(async (robotsUrl) => {
    const origin = new URL(robotsUrl).origin;
    const known = cache === undefined ? null : await readCachedRobots(cache, origin);
    if (known !== null) return known;
    try {
      const answer = await fetch(robotsUrl, {
        allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE],
        maxBytes: 65_536,
        headerTimeoutMs: 5_000,
        totalTimeoutMs: 5_000,
      });
      const text = { status: 200 as const, text: decodeBody(answer.body, answer.contentType) };
      if (cache !== undefined) cacheRobots(cache, origin, text);
      return text;
    } catch (error) {
      // A missing file, and a site that refuses to show it, are a 4xx: nothing is disallowed. Only
      // the missing file is kept for other runs: a refusal may be the firewall of the moment.
      // Any other failure is rethrown, and the checker then disallows everything.
      if (error instanceof FetchError && error.reason === "not_found") {
        const none = { status: 404 as const, text: "" };
        if (cache !== undefined) cacheRobots(cache, origin, none);
        return none;
      }
      if (error instanceof FetchError && error.reason === "blocked_by_site") {
        return { status: 404, text: "" };
      }
      // A refusal of the policy also marks the origin, so that its pages are refused as such.
      if (error instanceof FetchError && error.reason === "not_allowed") {
        refusedOrigins.add(new URL(robotsUrl).origin);
      }
      throw error;
    }
  }, BOT_TOKEN);

  // A refused origin is not asked about again. The set is looked at once more after the robots
  // check, because the first check of an origin is the request that finds out.
  const beforeRequest = async (url: URL): Promise<void> => {
    if (!refusedOrigins.has(url.origin) && (await robots.isAllowed(url))) return;
    throw new FetchError(refusedOrigins.has(url.origin) ? "not_allowed" : "blocked_by_robots");
  };

  const readPdfPage = async (response: GuardedResponse, signal?: AbortSignal) => {
    const pdf = await readPdf(response.body, { url: response.url, signal });
    return {
      url: response.url,
      title: pdf.title,
      publishedAt: pdf.publishedAt,
      text: pdf.text,
      links: [],
      canonicalUrl: null,
    };
  };

  /**
   * The page as a browser builds it, or null when there is no browser, it cannot render the page,
   * or the page holds too little text there as well. The browser is given the document that was
   * read, and the gate of robots.txt for every request the page makes.
   */
  const renderShell = async (
    response: GuardedResponse,
    signal?: AbortSignal,
  ): Promise<FetchedPage | null> => {
    if (render === undefined) return null;
    try {
      const rendered = await render({
        url: response.url,
        body: response.body,
        contentType: response.contentType,
        beforeRequest,
        signal,
      });
      if (rendered === null) return null;
      const built = extractPageText(rendered.html, rendered.url);
      if (built.text.length < SHELL_MAX_TEXT_CHARS) return null;
      return {
        url: rendered.url,
        title: built.title,
        publishedAt: built.publishedAt,
        text: built.text,
        links: built.links,
        canonicalUrl: built.canonicalUrl,
        ...identityOf(rendered.html),
      };
    } catch {
      // A browser that fails changes nothing: the page is one that needs JavaScript, as before.
      return null;
    }
  };

  const read: PageReader = async (url, signal) => {
    try {
      const response = await fetch(url, {
        signal,
        beforeRequest,
        allowedContentTypes: allowedTypesFor(url),
        maxBytesByType: PDF_BYTE_LIMITS,
      });
      const mediaType = mediaTypeOf(response.contentType);
      // The bytes of a PDF are not text: they go to the PDF reader and never through the decoder.
      if (PDF_MEDIA_TYPES.includes(mediaType)) return await readPdfPage(response, signal);
      if (OCTET_STREAM_TYPES.includes(mediaType)) {
        if (!looksLikePdf(response.body)) throw new PageReadError("unsupported_type");
        return await readPdfPage(response, signal);
      }
      const body = decodeBody(response.body, response.contentType);
      // A sitemap is read for the addresses in it, which turning markup into text runs together
      // (`<loc>` and `<lastmod>` become one word), so it keeps its markup.
      if (
        (mediaType === "text/xml" || mediaType === "application/xml") &&
        SITEMAP_PATH.test(new URL(response.url).pathname)
      ) {
        return {
          url: response.url,
          title: "",
          publishedAt: null,
          text: body,
          links: [],
          canonicalUrl: null,
        };
      }
      if (mediaType === "text/plain") {
        return {
          url: response.url,
          title: "",
          publishedAt: null,
          text: tidyText(body),
          links: [],
          canonicalUrl: null,
        };
      }
      const page = extractPageText(body, response.url);
      let text = page.text;
      if (looksLikeJavaScriptShell(body, page.text)) {
        // The text of the page is built by a script, but it is often in the page as data (see
        // scriptedText.ts). Without enough of it a browser may build it (see renderPage.ts), and
        // without a browser there is nothing to read.
        const scripted = extractScriptedText(body);
        if (scripted.length >= SHELL_MAX_TEXT_CHARS) {
          text = page.text === "" ? scripted : `${page.text}\n\n${scripted}`;
        } else {
          const rendered = await renderShell(response, signal);
          if (rendered === null) throw new PageReadError("needs_javascript");
          return rendered;
        }
      }
      return {
        url: response.url,
        title: page.title,
        publishedAt: page.publishedAt,
        text,
        links: page.links,
        canonicalUrl: page.canonicalUrl,
        ...identityOf(body),
      };
    } catch (error) {
      throw toReadError(error);
    }
  };
  return cache === undefined ? read : withPageCache(read, cache);
}
