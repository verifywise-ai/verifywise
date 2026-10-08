import { describe, expect, it } from "vitest";
import { getApiErrorReason, getClientErrorReason } from "../apiErrorReason";
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

describe("getClientErrorReason", () => {
  it("returns the server's reason for a 4xx", () => {
    const error = new CustomException("LLM key not found", 400, {
      message: "Bad Request",
      data: "LLM key not found",
    });
    expect(getClientErrorReason(error)).toBe("LLM key not found");
  });

  it("never returns the text of a 5xx", () => {
    const error = new CustomException("relation does not exist", 500, {
      message: "Internal Server Error",
      error: "relation does not exist",
    });
    expect(getClientErrorReason(error)).toBeNull();
  });

  it("is null without a status or a string reason", () => {
    expect(
      getClientErrorReason(new CustomException("Network Error", undefined, undefined)),
    ).toBeNull();
    expect(
      getClientErrorReason(
        new CustomException("Not Found", 404, { message: "Not Found", data: { message: "x" } }),
      ),
    ).toBeNull();
    expect(getClientErrorReason(new Error("boom"))).toBeNull();
  });
});
