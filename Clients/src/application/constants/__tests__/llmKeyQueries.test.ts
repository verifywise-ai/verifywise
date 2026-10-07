import { describe, it, expect } from "vitest";
import { retryLLMKeyQuery } from "../llmKeyQueries";
import { queryClient } from "../../config/queryClient";

describe("retryLLMKeyQuery", () => {
  it("retries a server or network failure once", () => {
    expect(retryLLMKeyQuery(0, { status: 500 })).toBe(true);
    expect(retryLLMKeyQuery(0, new Error("Network Error"))).toBe(true);
    expect(retryLLMKeyQuery(1, { status: 500 })).toBe(false);
  });

  it("retries a request timeout once", () => {
    expect(retryLLMKeyQuery(0, { status: 408 })).toBe(true);
    expect(retryLLMKeyQuery(1, { status: 408 })).toBe(false);
  });

  it("is the retry policy of the app's key queries", () => {
    // The hooks' tests use their own clients, so check the wiring here.
    expect(queryClient.getQueryDefaults(["llmKeys", 1]).retry).toBe(retryLLMKeyQuery);
    expect(queryClient.getQueryDefaults(["llmKeyStatus", 1]).retry).toBe(retryLLMKeyQuery);
  });

  it("does not retry a 4xx, which fails the same way again", () => {
    expect(retryLLMKeyQuery(0, { status: 401 })).toBe(false);
    expect(retryLLMKeyQuery(0, { status: 403 })).toBe(false);
    expect(retryLLMKeyQuery(0, { status: 404 })).toBe(false);
    expect(retryLLMKeyQuery(0, { status: 429 })).toBe(false);
  });
});
