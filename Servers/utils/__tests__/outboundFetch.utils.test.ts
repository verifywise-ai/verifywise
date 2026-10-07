import { describeFetchError } from "../outboundFetch.utils";

describe("describeFetchError", () => {
  it("names the limits on a timeout", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    expect(describeFetchError(err, 30)).toBe(
      "request timed out (limit 30s per request, 110s per sync)",
    );
  });

  it("appends the cause code that Node's fetch hides behind 'fetch failed'", () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "SELF_SIGNED_CERT_IN_CHAIN" },
    });
    expect(describeFetchError(err, 30)).toBe("fetch failed (SELF_SIGNED_CERT_IN_CHAIN)");
  });

  it("returns the message unchanged when there is no extra cause", () => {
    expect(describeFetchError(new Error("Failed to fetch runs: HTTP 403"), 30)).toBe(
      "Failed to fetch runs: HTTP 403",
    );
  });
});
