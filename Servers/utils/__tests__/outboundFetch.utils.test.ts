jest.mock("../logger/fileLogger", () => ({ __esModule: true, default: { warn: jest.fn() } }));

import logger from "../logger/fileLogger";
import { describeConnectionTestError, describeFetchError } from "../outboundFetch.utils";
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

  it("returns the message unchanged for an error the caller threw", () => {
    expect(describeFetchError(new Error("Failed to fetch runs: HTTP 403"), 30)).toBe(
      "Failed to fetch runs: HTTP 403",
    );
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
    );
    expect(describeConnectionTestError(err, 30)).toBe(
      "The server answered with a redirect (HTTP 302), which is not followed",
    );
  });

  it("prefixes other reasons with 'Connection failed'", () => {
    const err = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    expect(describeConnectionTestError(err, 5)).toBe(
      "Connection failed: request timed out (limit 5s per request, 110s per sync)",
    );
  });
});
