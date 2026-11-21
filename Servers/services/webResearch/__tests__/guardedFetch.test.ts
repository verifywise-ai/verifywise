import dns from "dns";
import { getEventListeners } from "events";
import http from "http";
import { AddressInfo, LookupFunction } from "net";
import { Readable } from "stream";
import zlib from "zlib";
import {
  ANY_CONTENT_TYPE,
  BOT_USER_AGENT,
  DnsLookup,
  FetchError,
  FetchFailureReason,
  MAX_BODY_BYTES,
  RawResponse,
  Transport,
  TransportRequest,
  createValidatingLookup,
  guardedConditionalFetch,
  guardedFetch,
  nodeTransport,
} from "../guardedFetch";

type Step = RawResponse | ((request: TransportRequest) => Promise<RawResponse>);

/** A transport that answers each request with the next step and records what it was asked. */
function scriptedTransport(steps: Step[]): { transport: Transport; requests: TransportRequest[] } {
  const requests: TransportRequest[] = [];
  const transport: Transport = async (request) => {
    requests.push(request);
    const step = steps[requests.length - 1];
    if (step === undefined) throw new Error("No scripted answer left");
    return typeof step === "function" ? step(request) : step;
  };
  return { transport, requests };
}

function answer(
  status: number,
  headers: http.IncomingHttpHeaders = {},
  body: Buffer | string | Readable = "",
): RawResponse {
  return {
    status,
    headers,
    body: body instanceof Readable ? body : Readable.from([Buffer.from(body)]),
  };
}

const page = (
  body: Buffer | string | Readable = "<p>Hello</p>",
  headers: http.IncomingHttpHeaders = {},
) => answer(200, { "content-type": "text/html; charset=utf-8", ...headers }, body);

const redirect = (status: number, location: string) => answer(status, { location });

async function failureOf(promise: Promise<unknown>): Promise<FetchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FetchError) return error;
    throw error;
  }
  throw new Error("Expected the fetch to fail");
}

/** A dns.lookup stand-in that answers every name with `result` and records the options it got. */
function fakeDns(result: dns.LookupAddress[] | NodeJS.ErrnoException): {
  dnsLookup: DnsLookup;
  options: dns.LookupOptions[];
} {
  const options: dns.LookupOptions[] = [];
  const fake = (
    _hostname: string,
    lookupOptions: dns.LookupOptions,
    callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
  ) => {
    options.push(lookupOptions);
    if (result instanceof Error) callback(result, []);
    else callback(null, result);
  };
  return { dnsLookup: fake as unknown as DnsLookup, options };
}

/** The arguments a lookup function calls back with. */
function lookUp(lookup: LookupFunction, options: dns.LookupOptions): Promise<unknown[]> {
  return new Promise((resolve) => lookup("example.com", options, (...args) => resolve(args)));
}

const PUBLIC_ANSWER = { address: "93.184.216.34", family: 4 };

describe("guardedFetch", () => {
  it("sends only the bot headers", async () => {
    const { transport, requests } = scriptedTransport([page()]);

    await guardedFetch("https://example.com/", {}, { transport });

    const { headers } = requests[0];
    expect(Object.keys(headers).sort()).toEqual([
      "Accept",
      "Accept-Encoding",
      "Accept-Language",
      "User-Agent",
    ]);
    expect(headers["User-Agent"]).toBe(BOT_USER_AGENT);
    // Not deflate: servers disagree on its form, and a raw stream would not be read.
    expect(headers["Accept-Encoding"]).toBe("gzip, br");
    expect(headers["Accept-Language"]).toBe("en");
    expect(headers).not.toHaveProperty("Cookie");
    expect(headers).not.toHaveProperty("Referer");
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("a caller's User-Agent replaces the bot's", async () => {
    const { transport, requests } = scriptedTransport([redirect(302, "/b"), page(), page()]);
    const userAgent = "VerifyWise sec@company.example";

    await guardedFetch("https://example.com/a", { userAgent }, { transport });
    await guardedConditionalFetch(
      "https://example.com/list.json",
      {},
      { userAgent },
      { transport },
    );

    expect(requests.map((request) => request.headers["User-Agent"])).toEqual([
      userAgent,
      userAgent,
      userAgent,
    ]);
  });

  it("returns the body, the final URL and the content type of a 200 answer", async () => {
    const { transport, requests } = scriptedTransport([
      page("<p>Hello</p>", { "content-type": "text/html; charset=iso-8859-1" }),
    ]);

    const result = await guardedFetch("https://Example.com/a?b=1#top", {}, { transport });

    expect(result).toEqual({
      url: "https://example.com/a?b=1",
      status: 200,
      contentType: "text/html; charset=iso-8859-1",
      body: Buffer.from("<p>Hello</p>"),
      truncated: false,
    });
    expect(requests[0].url.href).toBe("https://example.com/a?b=1");
  });

  it.each([
    "file:///etc/passwd",
    "http://127.0.0.1/",
    "http://user:pw@example.com/",
    "https://example.com:8080/",
  ])("refuses a URL the policy refuses without calling the transport: %s", async (url) => {
    const { transport, requests } = scriptedTransport([page()]);

    const failure = await failureOf(guardedFetch(url, {}, { transport }));

    expect(failure.reason).toBe("not_allowed");
    expect(failure.message).not.toContain(url);
    expect(requests).toHaveLength(0);
  });

  describe("redirects", () => {
    it("follows a relative redirect and reports the final URL", async () => {
      const moved = redirect(301, "/b");
      const { transport, requests } = scriptedTransport([moved, page()]);

      const result = await guardedFetch("https://example.com/a", {}, { transport });

      expect(result.url).toBe("https://example.com/b");
      expect(requests.map((request) => request.url.href)).toEqual([
        "https://example.com/a",
        "https://example.com/b",
      ]);
      expect(requests[1].headers).not.toHaveProperty("Referer");
      expect(moved.body.destroyed).toBe(true);
    });

    it("stops after four redirects with reason unreachable", async () => {
      const { transport, requests } = scriptedTransport([
        redirect(301, "/1"),
        redirect(302, "/2"),
        redirect(303, "/3"),
        redirect(307, "/4"),
        redirect(308, "/5"),
        page(),
      ]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("unreachable");
      expect(requests).toHaveLength(5);
    });

    it("refuses a redirect to http://127.0.0.1/ as not_allowed", async () => {
      const { transport, requests } = scriptedTransport([
        redirect(302, "http://127.0.0.1/"),
        page(),
      ]);

      const failure = await failureOf(guardedFetch("http://example.com/", {}, { transport }));

      expect(failure.reason).toBe("not_allowed");
      expect(requests).toHaveLength(1);
    });

    it("refuses a redirect from https to http as not_allowed", async () => {
      const { transport, requests } = scriptedTransport([
        redirect(301, "http://example.com/"),
        page(),
      ]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("not_allowed");
      expect(requests).toHaveLength(1);
    });

    it("refuses a redirect to a non-http scheme as not_allowed", async () => {
      const { transport, requests } = scriptedTransport([
        redirect(302, "ftp://example.com/file"),
        page(),
      ]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("not_allowed");
      expect(requests).toHaveLength(1);
    });

    it("treats a redirect without a Location header as unreachable", async () => {
      const { transport } = scriptedTransport([answer(302), page()]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("unreachable");
    });
  });

  describe("beforeRequest", () => {
    it("calls beforeRequest for every hop, in order", async () => {
      const seen: string[] = [];
      const { transport } = scriptedTransport([
        redirect(301, "/b"),
        redirect(302, "https://other.example/c"),
        page(),
      ]);

      await guardedFetch(
        "https://example.com/a",
        { beforeRequest: async (url) => void seen.push(url.href) },
        { transport },
      );

      expect(seen).toEqual([
        "https://example.com/a",
        "https://example.com/b",
        "https://other.example/c",
      ]);
    });

    it("hands beforeRequest a copy of the URL, so a hook cannot change where a hop goes", async () => {
      const { transport, requests } = scriptedTransport([redirect(301, "/b"), page()]);

      await guardedFetch(
        "https://example.com/a",
        {
          beforeRequest: async (url) => {
            url.hostname = "127.0.0.1";
            url.pathname = "/hijacked";
          },
        },
        { transport },
      );

      expect(requests.map((request) => request.url.href)).toEqual([
        "https://example.com/a",
        "https://example.com/b",
      ]);
    });

    it("propagates the FetchError that beforeRequest throws (blocked_by_robots) without requesting the URL", async () => {
      const blocked = new FetchError("blocked_by_robots");
      const { transport, requests } = scriptedTransport([page()]);

      const failure = await failureOf(
        guardedFetch(
          "https://example.com/private",
          {
            beforeRequest: async () => {
              throw blocked;
            },
          },
          { transport },
        ),
      );

      expect(failure).toBe(blocked);
      expect(requests).toHaveLength(0);
    });
  });

  it.each<[number, FetchFailureReason]>([
    [401, "blocked_by_site"],
    [403, "blocked_by_site"],
    [429, "blocked_by_site"],
    [404, "not_found"],
    [410, "not_found"],
    [500, "unreachable"],
    [502, "unreachable"],
    [503, "unreachable"],
    [204, "unreachable"],
  ])("maps status %d to %s", async (status, reason) => {
    const refused = answer(status, { "content-type": "text/html" }, "<p>No</p>");
    const { transport } = scriptedTransport([refused]);

    const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

    expect(failure.reason).toBe(reason);
    expect(refused.body.destroyed).toBe(true);
  });

  describe("what a failure by status tells the caller", () => {
    const failWith = async (status: number, headers: http.IncomingHttpHeaders = {}) => {
      const { transport } = scriptedTransport([answer(status, headers, "No")]);
      return failureOf(guardedFetch("https://example.com/", {}, { transport }));
    };

    it.each([401, 403, 404, 410, 429, 500, 503, 204])("carries the status %d", async (status) => {
      expect((await failWith(status)).status).toBe(status);
    });

    it("carries no status for a failure that is not an answer", async () => {
      const failure = await failureOf(
        guardedFetch(
          "https://example.com/",
          {},
          {
            transport: async () => {
              throw new Error("connection reset");
            },
          },
        ),
      );

      expect(failure.reason).toBe("unreachable");
      expect(failure.status).toBeUndefined();
    });

    it.each([
      ["2", 2000],
      ["0", 0],
      ["  7 ", 7000],
    ])("reads Retry-After %j as seconds", async (header, ms) => {
      expect((await failWith(429, { "retry-after": header })).retryAfterMs).toBe(ms);
    });

    it("reads a Retry-After date as the time from now to it", async () => {
      const inFiveSeconds = new Date(Date.now() + 5000).toUTCString();

      const { retryAfterMs } = await failWith(503, { "retry-after": inFiveSeconds });

      expect(retryAfterMs).toBeGreaterThan(3000);
      expect(retryAfterMs).toBeLessThanOrEqual(5000);
    });

    it("reads a Retry-After date that has passed as no wait", async () => {
      const { retryAfterMs } = await failWith(503, {
        "retry-after": new Date(Date.now() - 60_000).toUTCString(),
      });

      expect(retryAfterMs).toBe(0);
    });

    it.each(["soon", "-3", "1.5", "", "99999999999999999999"])(
      "ignores a Retry-After of %j",
      async (header) => {
        expect((await failWith(429, { "retry-after": header })).retryAfterMs).toBeUndefined();
      },
    );

    it("carries no Retry-After when the answer has none, or when the answer is not a failure by status", async () => {
      expect((await failWith(429)).retryAfterMs).toBeUndefined();
      const refused = answer(
        200,
        { "content-type": "application/pdf", "retry-after": "3" },
        "%PDF",
      );
      const { transport } = scriptedTransport([refused]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("unsupported_type");
      expect(failure.retryAfterMs).toBeUndefined();
    });
  });

  describe("content types", () => {
    it.each(["text/html; charset=iso-8859-1", "TEXT/HTML"])("accepts %s", async (contentType) => {
      const { transport } = scriptedTransport([page("<p>Hi</p>", { "content-type": contentType })]);

      const result = await guardedFetch("https://example.com/", {}, { transport });

      expect(result.contentType).toBe(contentType);
      expect(result.body.toString("utf8")).toBe("<p>Hi</p>");
    });

    it.each([["application/pdf"], [undefined]])(
      "refuses content type %s as unsupported_type",
      async (contentType) => {
        const refused = answer(200, { "content-type": contentType }, "%PDF-1.7");
        const { transport } = scriptedTransport([refused]);

        const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

        expect(failure.reason).toBe("unsupported_type");
        expect(refused.body.destroyed).toBe(true);
      },
    );

    it("accepts the types the caller allows, and asks for them", async () => {
      const { transport, requests } = scriptedTransport([
        answer(200, { "content-type": "application/rss+xml" }, "<rss></rss>"),
        page(),
      ]);
      const options = { allowedContentTypes: ["application/rss+xml"] };

      const result = await guardedFetch("https://example.com/feed", options, { transport });
      const failure = await failureOf(guardedFetch("https://example.com/", options, { transport }));

      expect(result.body.toString("utf8")).toBe("<rss></rss>");
      expect(failure.reason).toBe("unsupported_type");
      expect(requests[0].headers.Accept.split(", ")[0]).toBe("application/rss+xml");
    });

    it("reads any media type, and a missing one, when the caller allows */*", async () => {
      const { transport, requests } = scriptedTransport([
        answer(200, { "content-type": "application/octet-stream" }, "binary-ish"),
        answer(200, {}, "no type"),
        answer(200, { "content-type": "text/plain" }, "plain"),
      ]);
      const options = { allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE] };

      const octetStream = await guardedFetch("https://example.com/a", options, { transport });
      const untyped = await guardedFetch("https://example.com/b", options, { transport });
      const plain = await guardedFetch("https://example.com/c", options, { transport });

      expect(octetStream.body.toString("utf8")).toBe("binary-ish");
      expect(untyped.body.toString("utf8")).toBe("no type");
      expect(untyped.contentType).toBe("");
      expect(plain.body.toString("utf8")).toBe("plain");
      expect(requests[0].headers.Accept).toBe("text/plain, */*");
    });
  });

  describe("body size and encoding", () => {
    it("cuts a 3 MB body at the default limit and says it was truncated", async () => {
      const chunk = Buffer.alloc(64 * 1024, "a");
      const { transport } = scriptedTransport([page(Readable.from(Array(48).fill(chunk)))]);

      const result = await guardedFetch("https://example.com/", {}, { transport });

      expect(result.body.length).toBe(2_097_152);
      expect(result.body.length).toBe(MAX_BODY_BYTES);
      expect(result.truncated).toBe(true);
    });

    it("does not call a body of exactly maxBytes truncated", async () => {
      const { transport } = scriptedTransport([page("0123456789")]);

      const result = await guardedFetch("https://example.com/", { maxBytes: 10 }, { transport });

      expect(result.body.toString("utf8")).toBe("0123456789");
      expect(result.truncated).toBe(false);
    });

    // A PDF is bigger than a page of HTML, and what a fetch may read of it is a decision of the
    // caller: the limit follows the type of the answer, which is known before the body is read.
    describe("a limit of its own for a media type", () => {
      const options = {
        allowedContentTypes: ["text/html", "application/pdf"],
        maxBytes: 10,
        maxBytesByType: { "application/pdf": 100 },
      };
      const pdf = (body: Buffer, contentType = "application/pdf") =>
        answer(200, { "content-type": contentType }, body);

      it("reads a body of that type up to its own limit", async () => {
        const { transport } = scriptedTransport([pdf(Buffer.alloc(100, "a"))]);

        const result = await guardedFetch("https://example.com/a.pdf", options, { transport });

        expect(result.body.length).toBe(100);
        expect(result.truncated).toBe(false);
      });

      it("cuts a body of that type at its own limit and says it was truncated", async () => {
        const { transport } = scriptedTransport([pdf(Buffer.alloc(150, "a"))]);

        const result = await guardedFetch("https://example.com/a.pdf", options, { transport });

        expect(result.body.length).toBe(100);
        expect(result.truncated).toBe(true);
      });

      it("keeps maxBytes for every other type", async () => {
        const { transport } = scriptedTransport([page(Buffer.alloc(50, "a"))]);

        const result = await guardedFetch("https://example.com/", options, { transport });

        expect(result.body.length).toBe(10);
        expect(result.truncated).toBe(true);
      });

      it("keeps maxBytes for a type that is a property every object has", async () => {
        for (const type of ["constructor", "__proto__"]) {
          const { transport } = scriptedTransport([pdf(Buffer.alloc(50, "a"), type)]);

          const result = await guardedFetch(
            "https://example.com/",
            { ...options, allowedContentTypes: [ANY_CONTENT_TYPE] },
            { transport },
          );

          expect(result.body.length).toBe(10);
          expect(result.truncated).toBe(true);
        }
      });

      it("finds the type in the header however it is written", async () => {
        const { transport } = scriptedTransport([
          pdf(Buffer.alloc(50, "a"), "Application/PDF; charset=binary"),
        ]);

        const result = await guardedFetch("https://example.com/a.pdf", options, { transport });

        expect(result.body.length).toBe(50);
      });

      it("counts the bytes after decompression, so that a compressed PDF cannot be a bomb", async () => {
        const bomb = zlib.gzipSync(Buffer.alloc(10 * 1024 * 1024));
        const { transport } = scriptedTransport([
          answer(200, { "content-type": "application/pdf", "content-encoding": "gzip" }, bomb),
        ]);

        const result = await guardedFetch("https://example.com/a.pdf", options, { transport });

        expect(result.body.length).toBe(100);
        expect(result.truncated).toBe(true);
      });
    });

    it("stops reading a gzip bomb at maxBytes", async () => {
      const bomb = zlib.gzipSync(Buffer.alloc(10 * 1024 * 1024));
      const { transport } = scriptedTransport([page(bomb, { "content-encoding": "gzip" })]);

      const result = await guardedFetch("https://example.com/", {}, { transport });

      expect(result.body.length).toBe(MAX_BODY_BYTES);
      expect(result.truncated).toBe(true);
    });

    it.each([
      ["gzip", zlib.gzipSync],
      ["deflate", zlib.deflateSync],
      ["br", zlib.brotliCompressSync],
    ] as const)("decodes a %s body", async (encoding, compress) => {
      const { transport } = scriptedTransport([
        page(compress(Buffer.from("<p>Hello, world</p>")), { "content-encoding": encoding }),
      ]);

      const result = await guardedFetch("https://example.com/", {}, { transport });

      expect(result.body.toString("utf8")).toBe("<p>Hello, world</p>");
      expect(result.truncated).toBe(false);
    });

    it("treats an unknown content-encoding as unreachable", async () => {
      const { transport } = scriptedTransport([
        page("<p>Hi</p>", { "content-encoding": "compress" }),
      ]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("unreachable");
    });

    it("treats a body that cannot be decoded as unreachable", async () => {
      const { transport } = scriptedTransport([
        page("<p>not gzip</p>", { "content-encoding": "gzip" }),
      ]);

      const failure = await failureOf(guardedFetch("https://example.com/", {}, { transport }));

      expect(failure.reason).toBe("unreachable");
    });
  });

  describe("time limits", () => {
    it("gives up with unreachable when the response headers do not arrive in time", async () => {
      const { transport, requests } = scriptedTransport([
        () => new Promise<RawResponse>(() => undefined),
      ]);
      const started = Date.now();

      const failure = await failureOf(
        guardedFetch("https://example.com/", { headerTimeoutMs: 50 }, { transport }),
      );

      expect(failure.reason).toBe("unreachable");
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(requests[0].signal.aborted).toBe(true);
    });

    it("gives up with unreachable when the body stalls after the headers", async () => {
      const stalled = new Readable({ read() {} });
      stalled.push("<p>Start of a page that never ends");
      const { transport } = scriptedTransport([page(stalled)]);
      const started = Date.now();

      const failure = await failureOf(
        guardedFetch("https://example.com/", { totalTimeoutMs: 100 }, { transport }),
      );

      const elapsed = Date.now() - started;
      expect(failure.reason).toBe("unreachable");
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(1_000);
      expect(stalled.destroyed).toBe(true);
    });

    it("rejects at once when the caller's signal is already aborted", async () => {
      const { transport, requests } = scriptedTransport([page()]);
      const controller = new AbortController();
      controller.abort();

      const failure = await failureOf(
        guardedFetch("https://example.com/", { signal: controller.signal }, { transport }),
      );

      expect(failure.reason).toBe("unreachable");
      expect(requests).toHaveLength(0);
    });

    it("gives up when the caller aborts while it waits for the answer", async () => {
      const controller = new AbortController();
      const { transport, requests } = scriptedTransport([
        () => {
          setTimeout(() => controller.abort(), 10);
          return new Promise<RawResponse>(() => undefined);
        },
      ]);

      const failure = await failureOf(
        guardedFetch("https://example.com/", { signal: controller.signal }, { transport }),
      );

      expect(failure.reason).toBe("unreachable");
      expect(requests[0].signal.aborted).toBe(true);
    });

    it("leaves no listener on the caller's signal, whether the fetch succeeds or fails", async () => {
      const { signal } = new AbortController();
      const { transport } = scriptedTransport([page(), answer(404)]);

      await guardedFetch("https://example.com/", { signal }, { transport });
      await failureOf(guardedFetch("https://example.com/", { signal }, { transport }));

      expect(getEventListeners(signal, "abort")).toHaveLength(0);
    });
  });

  it("a host that resolves to a private address is refused", async () => {
    const { dnsLookup } = fakeDns([{ address: "10.0.0.1", family: 4 }]);
    const transport: Transport = (request) =>
      new Promise((_resolve, reject) => {
        request.lookup("example.com", { all: true }, (error) =>
          reject(error ?? new Error("The lookup let the address through")),
        );
      });

    const failure = await failureOf(
      guardedFetch("https://example.com/", {}, { transport, dnsLookup }),
    );

    expect(failure.reason).toBe("not_allowed");
  });
});

describe("createValidatingLookup", () => {
  it("answers with every address when options.all is true", async () => {
    const { dnsLookup } = fakeDns([PUBLIC_ANSWER]);

    expect(await lookUp(createValidatingLookup(dnsLookup), { all: true })).toEqual([
      null,
      [PUBLIC_ANSWER],
    ]);
  });

  it("answers with one address and its family when options.all is not set", async () => {
    const { dnsLookup, options } = fakeDns([PUBLIC_ANSWER]);

    expect(await lookUp(createValidatingLookup(dnsLookup), {})).toEqual([null, "93.184.216.34", 4]);
    expect(options).toEqual([{ all: true, verbatim: true }]);
  });

  it("refuses the whole answer when one address is not public", async () => {
    const { dnsLookup } = fakeDns([PUBLIC_ANSWER, { address: "10.0.0.1", family: 4 }]);

    const [error] = await lookUp(createValidatingLookup(dnsLookup), { all: true });

    expect(error).toMatchObject({ code: "EVW_NON_PUBLIC_ADDRESS" });
    expect((error as Error).message).not.toContain("10.0.0.1");
    expect((error as Error).message).not.toContain("example.com");
  });

  it("refuses an empty answer", async () => {
    const { dnsLookup } = fakeDns([]);

    const [error] = await lookUp(createValidatingLookup(dnsLookup), { all: true });

    expect(error).toMatchObject({ code: "EVW_NON_PUBLIC_ADDRESS" });
  });

  it("passes a DNS error on", async () => {
    const notFound: NodeJS.ErrnoException = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    const { dnsLookup } = fakeDns(notFound);

    const [error] = await lookUp(createValidatingLookup(dnsLookup), { all: true });

    expect(error).toBe(notFound);
  });
});

describe("nodeTransport", () => {
  let server: http.Server;
  let port: number;
  const received: http.IncomingHttpHeaders[] = [];
  let hangingRequestArrived: () => void = () => undefined;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      received.push(request.headers);
      if (request.url === "/hang") {
        hangingRequestArrived();
        return;
      }
      response.writeHead(200, { "content-type": "text/plain", "x-served-by": "test" });
      response.end(`${request.method} ${request.url}`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function textOf(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }

  /** A lookup that sends every name to 127.0.0.1, in the shape `options.all` asks for. */
  function loopbackLookup(names: string[]): LookupFunction {
    return (hostname, options, callback) => {
      names.push(hostname);
      process.nextTick(() =>
        options.all
          ? callback(null, [{ address: "127.0.0.1", family: 4 }])
          : callback(null, "127.0.0.1", 4),
      );
    };
  }

  it("returns the status, the headers and the body of a GET", async () => {
    const response = await nodeTransport({
      url: new URL(`http://127.0.0.1:${port}/hello`),
      headers: { "User-Agent": BOT_USER_AGENT },
      lookup: loopbackLookup([]),
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers["x-served-by"]).toBe("test");
    expect(await textOf(response.body)).toBe("GET /hello");
    expect(received[received.length - 1]["user-agent"]).toBe(BOT_USER_AGENT);
  });

  it("connects through the lookup it is given", async () => {
    const names: string[] = [];

    const response = await nodeTransport({
      url: new URL(`http://localhost:${port}/named`),
      headers: {},
      lookup: loopbackLookup(names),
      signal: new AbortController().signal,
    });

    expect(await textOf(response.body)).toBe("GET /named");
    expect(names).toContain("localhost");
  });

  it("rejects when the lookup fails", async () => {
    const refused: NodeJS.ErrnoException = Object.assign(new Error("refused"), {
      code: "EVW_NON_PUBLIC_ADDRESS",
    });
    const failingLookup: LookupFunction = (_hostname, _options, callback) =>
      process.nextTick(() => callback(refused, ""));

    await expect(
      nodeTransport({
        url: new URL(`http://localhost:${port}/never`),
        headers: {},
        lookup: failingLookup,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "EVW_NON_PUBLIC_ADDRESS" });
  });

  it("rejects when the signal is aborted", async () => {
    const controller = new AbortController();
    const arrived = new Promise<void>((resolve) => {
      hangingRequestArrived = resolve;
    });

    const pending = nodeTransport({
      url: new URL(`http://127.0.0.1:${port}/hang`),
      headers: {},
      lookup: loopbackLookup([]),
      signal: controller.signal,
    });
    await arrived;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("guardedConditionalFetch", () => {
  const LIST = "https://example.com/list.json";
  const VALIDATORS = { etag: '"abc"', lastModified: "Wed, 29 Oct 2026 10:00:00 GMT" };

  it("sends If-None-Match and If-Modified-Since when given", async () => {
    const { transport, requests } = scriptedTransport([page(), page()]);

    await guardedConditionalFetch(LIST, VALIDATORS, {}, { transport });
    await guardedConditionalFetch(LIST, {}, {}, { transport });

    expect(requests[0].headers["If-None-Match"]).toBe('"abc"');
    expect(requests[0].headers["If-Modified-Since"]).toBe("Wed, 29 Oct 2026 10:00:00 GMT");
    expect(requests[1].headers).not.toHaveProperty("If-None-Match");
    expect(requests[1].headers).not.toHaveProperty("If-Modified-Since");
  });

  it("a 304 answer resolves notModified", async () => {
    const { transport } = scriptedTransport([answer(304)]);

    await expect(guardedConditionalFetch(LIST, VALIDATORS, {}, { transport })).resolves.toEqual({
      notModified: true,
      url: LIST,
    });
  });

  it("a 304 after a redirect resolves notModified", async () => {
    const { transport, requests } = scriptedTransport([
      redirect(302, "/v2/list.json"),
      answer(304),
    ]);

    await expect(guardedConditionalFetch(LIST, VALIDATORS, {}, { transport })).resolves.toEqual({
      notModified: true,
      url: "https://example.com/v2/list.json",
    });
    expect(requests[1].headers["If-None-Match"]).toBe('"abc"');
  });

  it("a 200 answer carries the ETag and Last-Modified headers", async () => {
    const { transport } = scriptedTransport([
      page("<p>list</p>", { etag: '"v2"', "last-modified": "Thu, 30 Oct 2026 10:00:00 GMT" }),
      page(),
    ]);

    const changed = await guardedConditionalFetch(LIST, VALIDATORS, {}, { transport });
    const bare = await guardedConditionalFetch(LIST, {}, {}, { transport });

    expect(changed).toMatchObject({
      notModified: false,
      url: LIST,
      status: 200,
      etag: '"v2"',
      lastModified: "Thu, 30 Oct 2026 10:00:00 GMT",
    });
    expect(changed.notModified === false && changed.body.toString()).toBe("<p>list</p>");
    expect(bare).toMatchObject({ notModified: false, etag: null, lastModified: null });
  });

  it("a validator with a line break or over 512 characters is not sent", async () => {
    const { transport, requests } = scriptedTransport([page(), page()]);

    await guardedConditionalFetch(
      LIST,
      { etag: '"a"\r\nX-Injected: 1', lastModified: "x".repeat(513) },
      {},
      { transport },
    );
    await guardedConditionalFetch(LIST, { etag: `"${"y".repeat(510)}"` }, {}, { transport });

    expect(requests[0].headers).not.toHaveProperty("If-None-Match");
    expect(requests[0].headers).not.toHaveProperty("If-Modified-Since");
    expect(requests[1].headers["If-None-Match"]).toHaveLength(512);
  });

  it("guardedFetch still refuses a 304", async () => {
    const { transport } = scriptedTransport([answer(304)]);

    const error = await failureOf(guardedFetch(LIST, {}, { transport }));

    expect(error.reason).toBe("unreachable");
    expect(error.status).toBe(304);
  });

  it("keeps every guard of guardedFetch: the URL policy refuses an internal address", async () => {
    const { transport, requests } = scriptedTransport([answer(304)]);

    const error = await failureOf(
      guardedConditionalFetch("http://127.0.0.1/list.json", VALIDATORS, {}, { transport }),
    );

    expect(error.reason).toBe("not_allowed");
    expect(requests).toHaveLength(0);
  });
});
