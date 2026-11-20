import { describe, it, expect } from "vitest";
import { isFinalClientError, retryUpTo } from "../queryRetry";

describe("isFinalClientError", () => {
  it("is true for a 4xx other than 408, from status or response.status", () => {
    expect(isFinalClientError({ status: 429 })).toBe(true);
    expect(isFinalClientError({ response: { status: 429 } })).toBe(true);
    expect(isFinalClientError({ status: 403 })).toBe(true);
    expect(isFinalClientError({ status: 404 })).toBe(true);
  });

  it("is false for a timeout, a server error, a network error or no error", () => {
    expect(isFinalClientError({ status: 408 })).toBe(false);
    expect(isFinalClientError({ status: 500 })).toBe(false);
    expect(isFinalClientError(new Error("Network Error"))).toBe(false);
    expect(isFinalClientError(null)).toBe(false);
  });
});

describe("retryUpTo", () => {
  it("retries a retryable failure up to the limit", () => {
    const retry = retryUpTo(1);
    expect(retry(0, { status: 503 })).toBe(true);
    expect(retry(1, { status: 503 })).toBe(false);
  });

  it("never retries a rate-limited request", () => {
    expect(retryUpTo(3)(0, { status: 429 })).toBe(false);
  });
});
