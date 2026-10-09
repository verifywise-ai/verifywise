import { describe, expect, it } from "vitest";
import { getApiErrorReason, getClientErrorReason, isClientError } from "../apiErrorReason";
import CustomException from "../../../infrastructure/exceptions/customeException";

describe("getApiErrorReason", () => {
  it("reads the 5xx reason from `error`", () => {
    expect(
      getApiErrorReason({
        response: { message: "Bad Gateway", error: "Failed to fetch runs: HTTP 403" },
      }),
    ).toBe("Failed to fetch runs: HTTP 403");
  });

  it("reads the 4xx reason from `data`", () => {
    expect(
      getApiErrorReason({
        response: { message: "Bad Request", data: "MLflow is not configured." },
      }),
    ).toBe("MLflow is not configured.");
  });

  it("ignores the generic status text and non-string payloads", () => {
    expect(getApiErrorReason({ response: { message: "OK", data: { success: false } } })).toBeNull();
    expect(getApiErrorReason(new Error("network down"))).toBeNull();
    expect(getApiErrorReason(null)).toBeNull();
  });
});

/**
 * Builds the exception the way networkServices.handleError does: the message
 * is the reason it extracted from the envelope (or the HTTP status phrase, or
 * axios' own message when there is no body).
 */
const apiError = (message: string, status: number | undefined, body?: unknown) =>
  new CustomException(message, status, body);

describe("getClientErrorReason", () => {
  it("returns the reason handleError extracted for a 4xx", () => {
    // STATUS_CODE[400]("msg")
    expect(
      getClientErrorReason(
        apiError("LLM key not found", 400, { message: "Bad Request", data: "LLM key not found" }),
      ),
    ).toBe("LLM key not found");
    // STATUS_CODE[404]({ message })
    expect(
      getClientErrorReason(
        apiError("Intake form not found", 404, {
          message: "Not Found",
          data: { message: "Intake form not found" },
        }),
      ),
    ).toBe("Intake form not found");
    // legacy { error }
    expect(getClientErrorReason(apiError("Slug taken", 409, { error: "Slug taken" }))).toBe(
      "Slug taken",
    );
  });

  it.each([
    ["Bad Request", 400],
    ["Not Found", 404],
    ["Payload Too Large", 413],
    ["Too Many Requests", 429],
    ["Request failed with status code 422", 422],
    ["", 400],
    ["   ", 400],
  ])("is null when the message is only generic (%p)", (message, status) => {
    expect(getClientErrorReason(apiError(message, status, { message }))).toBeNull();
  });

  it("never returns the text of a 5xx", () => {
    expect(
      getClientErrorReason(
        apiError("relation does not exist", 500, {
          message: "Internal Server Error",
          error: "relation does not exist",
        }),
      ),
    ).toBeNull();
  });

  it("is null for a network error or anything that is not an API error", () => {
    expect(getClientErrorReason(apiError("Network Error", undefined))).toBeNull();
    expect(getClientErrorReason(new Error("boom"))).toBeNull();
    expect(getClientErrorReason({ status: 400, message: "not a CustomException" })).toBeNull();
    expect(getClientErrorReason(null)).toBeNull();
  });
});

describe("isClientError", () => {
  it("is true only for an API error with a 4xx status", () => {
    expect(isClientError(apiError("x", 400))).toBe(true);
    expect(isClientError(apiError("x", 499))).toBe(true);
    expect(isClientError(apiError("x", 500))).toBe(false);
    expect(isClientError(apiError("x", undefined))).toBe(false);
    expect(isClientError(new Error("x"))).toBe(false);
  });
});
