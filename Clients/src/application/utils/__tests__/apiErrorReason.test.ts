import { describe, expect, it } from "vitest";
import { getApiErrorReason } from "../apiErrorReason";

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
