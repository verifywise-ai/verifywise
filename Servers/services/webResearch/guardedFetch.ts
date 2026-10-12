/**
 * The only code in the web research toolkit that requests a URL a model chose.
 *
 * Every hop of a request, the first one and each redirect, passes the URL policy
 * (`parsePublicUrl`) and the caller's `beforeRequest` hook (robots.txt) before it is sent, and
 * the connection only goes to addresses that pass `isPublicAddress`: the check runs inside the
 * socket's own `lookup`, so the address that was checked is the address that is connected to.
 * The request names the bot and carries nothing else: no cookie, no credentials, no Referer.
 *
 * Whatever goes wrong comes out as a FetchError with a fixed message, except what the caller's own
 * `beforeRequest` throws, which comes out as it is. No message repeats the URL, because the URL
 * can carry whatever a page put in it.
 */
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import { Readable, Transform, pipeline } from "stream";
import zlib from "zlib";
import { UnsafeUrlError, isPublicAddress, parsePublicUrl } from "./publicUrl";

export const BOT_TOKEN = "VerifyWiseResearchBot";
export const BOT_USER_AGENT = "VerifyWiseResearchBot/1.0 (+https://verifywise.ai)";
export const MAX_BODY_BYTES = 2_097_152;
/** In `allowedContentTypes`: any media type, and an answer with no Content-Type at all. */
export const ANY_CONTENT_TYPE = "*/*";
export const DEFAULT_CONTENT_TYPES: readonly string[] = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/xml",
  "application/xml",
  "application/rss+xml",
];

const HEADER_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The error code a validating lookup gives when a host name resolves to a non-public address. */
const NON_PUBLIC_ADDRESS = "EVW_NON_PUBLIC_ADDRESS";

export type FetchFailureReason =
  | "not_allowed"
  | "blocked_by_robots"
  | "blocked_by_site"
  | "not_found"
  | "unsupported_type"
  | "unreachable";

const MESSAGES: Record<FetchFailureReason, string> = {
  not_allowed: "The address is not a public web address that can be read.",
  blocked_by_robots: "The site's robots.txt does not allow this page to be read.",
  blocked_by_site: "The site refused the request.",
  not_found: "The page does not exist.",
  unsupported_type: "The page is not in a format that can be read.",
  unreachable: "The page could not be reached.",
};

/** Thrown for every fetch that does not end in a readable 200 answer. */
export class FetchError extends Error {
  constructor(
    readonly reason: FetchFailureReason,
    message?: string,
  ) {
    super(message ?? MESSAGES[reason]);
    this.name = "FetchError";
  }
}

export interface GuardedFetchOptions {
  signal?: AbortSignal;
  /**
   * Media types, without parameters, that the answer may have; ANY_CONTENT_TYPE lets any answer
   * through, one with no Content-Type included. Default DEFAULT_CONTENT_TYPES.
   */
  allowedContentTypes?: readonly string[];
  /** The most bytes of the body, after decompression, that are read. Default MAX_BODY_BYTES. */
  maxBytes?: number;
  /** Time to the response headers of one hop. Default 12,000 ms. */
  headerTimeoutMs?: number;
  /** Time for the whole fetch: every hop, every `beforeRequest` and the body. Default 20,000 ms. */
  totalTimeoutMs?: number;
  /** Default 4. */
  maxRedirects?: number;
  /**
   * Called with every URL before it is requested; may throw a FetchError (robots.txt). It is given
   * a copy: whatever it does to that URL, the hop goes where the URL policy sent it.
   */
  beforeRequest?: (url: URL) => Promise<void>;
}

export interface GuardedResponse {
  /** The URL that answered, after redirects. */
  url: string;
  status: 200;
  /** The Content-Type header as the server sent it, parameters such as the charset included. */
  contentType: string;
  body: Buffer;
  /** True when the body was longer than the limit and was cut. */
  truncated: boolean;
}

export interface TransportRequest {
  url: URL;
  headers: Record<string, string>;
  lookup: net.LookupFunction;
  signal: AbortSignal;
}

export interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Readable;
}

/** Sends one GET and resolves when the response headers arrive. Tests replace it. */
export type Transport = (request: TransportRequest) => Promise<RawResponse>;
export type DnsLookup = typeof dns.lookup;

export interface GuardedFetchDeps {
  transport?: Transport;
  dnsLookup?: DnsLookup;
}

/**
 * One GET with Node's own client. `agent: false` gives every request a fresh socket, so nothing
 * is shared between requests, and the socket resolves its host through `lookup`. TLS
 * certificates are verified, as Node does by default.
 */
export const nodeTransport: Transport = ({ url, headers, lookup, signal }) =>
  new Promise((resolve, reject) => {
    const options: http.RequestOptions = { method: "GET", headers, lookup, signal, agent: false };
    const onResponse = (response: http.IncomingMessage) =>
      resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response });
    const request =
      url.protocol === "https:"
        ? https.request(url, options, onResponse)
        : http.request(url, options, onResponse);
    request.on("error", reject);
    request.end();
  });

function nonPublicAddressError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    "The host name does not resolve to public addresses only.",
  );
  error.code = NON_PUBLIC_ADDRESS;
  return error;
}

/**
 * A `lookup` for a socket that only lets it connect to public addresses.
 *
 * It always asks DNS for every address of the host, whatever `options` say, and refuses the whole
 * answer when it is empty or when any address in it is not public: a host with one internal
 * address is not a public website, and the socket could otherwise try that address next. Then it
 * calls back in the shape `options.all` asks for (Node's happy-eyeballs connect asks for all).
 */
export function createValidatingLookup(dnsLookup: DnsLookup = dns.lookup): net.LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        callback(error, "");
      } else if (
        addresses.length === 0 ||
        !addresses.every((entry) => isPublicAddress(entry.address))
      ) {
        callback(nonPublicAddressError(), "");
      } else if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

function isNonPublicAddressError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === NON_PUBLIC_ADDRESS
  );
}

/**
 * `promise`, or a FetchError("unreachable") as soon as `signal` aborts, whichever comes first.
 * A transport, a stream or a hook does not have to listen to the signal, and one that never
 * settles would otherwise hold the fetch past its time limits.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new FetchError("unreachable"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new FetchError("unreachable");
}

/** The URL, or a FetchError("not_allowed") when the policy refuses it. */
function toPublicUrl(raw: string, base?: URL): URL {
  try {
    return parsePublicUrl(base === undefined ? raw : new URL(raw, base).href);
  } catch (error) {
    throw new FetchError(
      "not_allowed",
      error instanceof UnsafeUrlError ? error.message : undefined,
    );
  }
}

/** One hop: the transport's answer, with the header timer running until it arrives. */
async function send(
  transport: Transport,
  request: TransportRequest,
  headerTimeoutMs: number,
  abort: () => void,
): Promise<RawResponse> {
  throwIfAborted(request.signal);
  const headerTimer = setTimeout(abort, headerTimeoutMs);
  let pending: Promise<RawResponse> | undefined;
  try {
    pending = transport(request);
    return await untilAborted(pending, request.signal);
  } catch (error) {
    // A transport that answers after the abort still holds a connection; let it go.
    pending?.then(
      (late) => late.body.destroy(),
      () => undefined,
    );
    if (error instanceof FetchError) throw error;
    throw new FetchError(isNonPublicAddressError(error) ? "not_allowed" : "unreachable");
  } finally {
    clearTimeout(headerTimer);
  }
}

function failureForStatus(status: number): FetchFailureReason {
  if (status === 401 || status === 403 || status === 429) return "blocked_by_site";
  if (status === 404 || status === 410) return "not_found";
  return "unreachable";
}

/** "text/html; charset=utf-8" gives "text/html". */
export function mediaTypeOf(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/** The decoder for a Content-Encoding, null for none; an encoding we did not ask for fails. */
function decoderFor(contentEncoding: string | undefined): Transform | null {
  switch ((contentEncoding ?? "").trim().toLowerCase()) {
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      throw new FetchError("unreachable");
  }
}

/**
 * The stream read up to `maxBytes`. Leaving the loop early destroys the stream, so a body that is
 * too long (or a compressed body that inflates without end) is not read any further.
 */
async function collect(
  stream: Readable,
  maxBytes: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const room = maxBytes - size;
    if (buffer.length > room) {
      chunks.push(buffer.subarray(0, room));
      return { body: Buffer.concat(chunks, maxBytes), truncated: true };
    }
    chunks.push(buffer);
    size += buffer.length;
  }
  return { body: Buffer.concat(chunks, size), truncated: false };
}

async function readBody(
  response: RawResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ body: Buffer; truncated: boolean }> {
  const decoder = decoderFor(response.headers["content-encoding"]);
  // A decoding error reaches the loop in `collect`; pipeline only needs the callback to exist.
  const decoded =
    decoder === null ? response.body : pipeline(response.body, decoder, () => undefined);
  try {
    return await untilAborted(collect(decoded, maxBytes), signal);
  } catch (error) {
    if (error instanceof FetchError) throw error;
    throw new FetchError("unreachable");
  } finally {
    decoded.destroy();
  }
}

async function readAnswer(
  url: URL,
  response: RawResponse,
  allowedTypes: readonly string[],
  maxBytes: number,
  signal: AbortSignal,
): Promise<GuardedResponse> {
  if (response.status !== 200) throw new FetchError(failureForStatus(response.status));
  const contentType = response.headers["content-type"] ?? "";
  if (
    !allowedTypes.includes(ANY_CONTENT_TYPE) &&
    !allowedTypes.includes(mediaTypeOf(contentType))
  ) {
    throw new FetchError("unsupported_type");
  }
  const { body, truncated } = await readBody(response, maxBytes, signal);
  return { url: url.href, status: 200, contentType, body, truncated };
}

/**
 * A GET of a public web page, guarded as the module comment says.
 *
 * Redirects are followed by hand, at most `maxRedirects` of them, and each one is a new hop; a
 * redirect from https to http is refused. Only a 200 answer whose media type is allowed is read.
 * Failures: the URL policy or a non-public address gives `not_allowed`; 401, 403 and 429 give
 * `blocked_by_site`; 404 and 410 give `not_found`; a media type that is not allowed gives
 * `unsupported_type`; a FetchError from `beforeRequest` comes out as it is; everything else (any
 * other status, a network error, too many redirects, a time limit, the caller's abort) gives
 * `unreachable`.
 */
export async function guardedFetch(
  rawUrl: string,
  options: GuardedFetchOptions = {},
  deps: GuardedFetchDeps = {},
): Promise<GuardedResponse> {
  const transport = deps.transport ?? nodeTransport;
  const lookup = createValidatingLookup(deps.dnsLookup);
  const allowedTypes = (options.allowedContentTypes ?? DEFAULT_CONTENT_TYPES).map((type) =>
    type.toLowerCase(),
  );
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const headerTimeoutMs = options.headerTimeoutMs ?? HEADER_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  // The low-priority wildcard keeps a strict server from answering 406 to a PDF link: the answer
  // comes back and is refused as unsupported_type, which tells the model why. A caller that
  // allows any type has the wildcard already.
  const accepted = allowedTypes.includes(ANY_CONTENT_TYPE)
    ? allowedTypes
    : [...allowedTypes, "*/*;q=0.1"];
  const headers = {
    "User-Agent": BOT_USER_AGENT,
    Accept: accepted.join(", "),
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en",
  };

  const controller = new AbortController();
  const { signal } = controller;
  const abort = () => controller.abort();
  const totalTimer = setTimeout(abort, options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });

  try {
    let url = toPublicUrl(rawUrl);
    for (let redirects = 0; ; redirects += 1) {
      throwIfAborted(signal);
      if (options.beforeRequest) {
        await untilAborted(options.beforeRequest(new URL(url.href)), signal);
      }

      const response = await send(
        transport,
        { url, headers, lookup, signal },
        headerTimeoutMs,
        abort,
      );
      try {
        const location = response.headers.location;
        if (!REDIRECT_STATUSES.has(response.status) || !location) {
          return await readAnswer(url, response, allowedTypes, maxBytes, signal);
        }
        if (redirects >= maxRedirects) throw new FetchError("unreachable");
        const next = toPublicUrl(location, url);
        if (url.protocol === "https:" && next.protocol === "http:") {
          throw new FetchError("not_allowed", "A redirect from https to http is not followed.");
        }
        url = next;
      } finally {
        response.body.destroy();
      }
    }
  } finally {
    clearTimeout(totalTimer);
    options.signal?.removeEventListener("abort", abort);
  }
}
