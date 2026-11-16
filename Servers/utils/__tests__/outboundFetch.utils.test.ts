jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn() },
}));

import logger from "../logger/fileLogger";
import {
  RemoteStatusError,
  describeConnectionTestError,
  describeFetchError,
  errorReplyForLog,
  logErrorReply,
} from "../outboundFetch.utils";
import { UnsafeOutboundUrlError } from "../safeOutboundUrl";

const networkError = (code: string) =>
  Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("describeFetchError", () => {
  it("names the limits on a timeout", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    expect(describeFetchError(err, 30)).toBe(
      "request timed out (limit 30s per request, 110s per sync)",
    );
  });

  it("gives every connect, DNS and TLS failure the same reason and logs the cause", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "SELF_SIGNED_CERT_IN_CHAIN"]) {
      expect(describeFetchError(networkError(code), 30)).toBe("connection failed");
      expect(logger.warn).toHaveBeenLastCalledWith(expect.stringContaining(code));
    }
  });

  it("keeps the message of a refused address or redirect", () => {
    const err = new UnsafeOutboundUrlError(
      "The URL resolves to a loopback address, which is not allowed",
      "blocked-address",
    );
    expect(describeFetchError(err, 30)).toBe(
      "The URL resolves to a loopback address, which is not allowed",
    );
  });

  it("does not quote a body that is not JSON", () => {
    let err: unknown;
    try {
      JSON.parse("<html>internal page</html>");
    } catch (e) {
      err = e;
    }
    expect(describeFetchError(err, 30)).toBe("the answer was not valid JSON");
  });

  it("keeps the message of a RemoteStatusError the caller threw", () => {
    expect(describeFetchError(new RemoteStatusError("Failed to fetch runs: HTTP 403"), 30)).toBe(
      "Failed to fetch runs: HTTP 403",
    );
  });

  it("counts undici's fetch failure as a network failure even without a code", () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: new Error("bad port") });
    expect(describeFetchError(err, 30)).toBe("connection failed");
  });

  it("counts a body cut off mid-read as a network failure", () => {
    const err = Object.assign(new TypeError("terminated"), {
      cause: { code: "UND_ERR_SOCKET", message: "other side closed" },
    });
    expect(describeFetchError(err, 30)).toBe("connection failed");
  });

  it("counts a network code on the error itself as a network failure", () => {
    const err = Object.assign(new Error("getaddrinfo EAI_AGAIN example.com"), {
      code: "EAI_AGAIN",
    });
    expect(describeFetchError(err, 30)).toBe("connection failed");
  });

  it("does not count a TypeError from the caller's own code as a network failure", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'map')");
    expect(describeFetchError(err, 30)).toBe("unexpected error (details in the server log)");
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.stringContaining("Cannot read properties of undefined"),
    );
  });

  it("does not count a database error with a cause as a network failure", () => {
    const err = Object.assign(new Error('relation "mlflow_model_records" does not exist'), {
      name: "SequelizeDatabaseError",
      cause: { code: "42P01", message: "relation does not exist" },
    });
    expect(describeFetchError(err, 30)).toBe("unexpected error (details in the server log)");
    expect(logger.error).toHaveBeenLastCalledWith(expect.stringContaining("mlflow_model_records"));
  });
});

describe("describeConnectionTestError", () => {
  it("says the server could not be reached for any network failure", () => {
    expect(describeConnectionTestError(networkError("ECONNREFUSED"), 30)).toBe(
      "Could not reach the server",
    );
    expect(describeConnectionTestError(networkError("EHOSTUNREACH"), 30)).toBe(
      "Could not reach the server",
    );
  });

  it("shows a refused address or redirect as is", () => {
    const err = new UnsafeOutboundUrlError(
      "The server answered with a redirect (HTTP 302), which is not followed",
      "redirect",
    );
    expect(describeConnectionTestError(err, 30)).toBe(
      "The server answered with a redirect (HTTP 302), which is not followed",
    );
  });

  it("prefixes an unexpected error with 'Connection failed' without its message", () => {
    expect(describeConnectionTestError(new TypeError("x is not a function"), 30)).toBe(
      "Connection failed: unexpected error (details in the server log)",
    );
  });

  it("prefixes other reasons with 'Connection failed'", () => {
    const err = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    expect(describeConnectionTestError(err, 5)).toBe(
      "Connection failed: request timed out (limit 5s per request, 110s per sync)",
    );
  });
});

describe("logErrorReply", () => {
  beforeEach(() => (logger.warn as jest.Mock).mockClear());

  it("logs the status, the path without its query and the start of the reply", async () => {
    await logErrorReply(
      "Jira",
      "/rest/api/3/myself?x=1",
      new Response("token expired", { status: 401 }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Jira returned HTTP 401 for /rest/api/3/myself: token expired",
    );
  });

  it("logs at most 500 characters of the reply", async () => {
    await logErrorReply("Jira", "/p", new Response("x".repeat(100_000), { status: 500 }));
    expect(logger.warn).toHaveBeenCalledWith(`Jira returned HTTP 500 for /p: ${"x".repeat(500)}`);
  });

  it("says no details for an empty reply, and cancels a body it cannot read", async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    await logErrorReply("Jira", "/p", { status: 502, body: { cancel } } as unknown as Response);
    expect(cancel).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Jira returned HTTP 502 for /p: no details");
  });
});

describe("errorReplyForLog", () => {
  it("turns newlines and control characters into spaces, so no line can be forged", () => {
    expect(errorReplyForLog("x\n2026-11-15 INFO admin logged in\r\n\u001b[2J")).toBe(
      "x 2026-11-15 INFO admin logged in [2J",
    );
  });

  it("hides Authorization values and the given secrets", () => {
    expect(
      errorReplyForLog("echo Authorization: Basic YTpi== and Bearer abc.def", ["s3cr3t"]),
    ).toBe("echo Authorization: Basic [redacted] and Bearer [redacted]");
    expect(errorReplyForLog("token s3cr3t here", ["s3cr3t"])).toBe("token [redacted] here");
  });

  it("keeps the text of an HTML error page, not its head", () => {
    expect(
      errorReplyForLog(
        "<!DOCTYPE html><html><head><title>t</title><style>p{}</style></head><body><h1>502 Bad Gateway</h1><script>x()</script></body></html>",
      ),
    ).toBe("502 Bad Gateway");
  });
});

describe("logErrorReply with a stalled body", () => {
  beforeEach(() => (logger.warn as jest.Mock).mockClear());

  it("stops waiting after the read limit and still logs the status", async () => {
    jest.useFakeTimers();
    const cancel = jest.fn().mockResolvedValue(undefined);
    const reader = { read: () => new Promise(() => undefined), cancel };
    const response = { status: 502, body: { getReader: () => reader } } as unknown as Response;
    const done = logErrorReply("Jira", "/p", response);
    await jest.advanceTimersByTimeAsync(2_000);
    await done;
    jest.useRealTimers();
    expect(cancel).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Jira returned HTTP 502 for /p: no details");
  });
});
