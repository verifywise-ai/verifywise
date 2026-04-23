import { describe, it, expect } from "vitest";
import { APIError } from "../error";

describe("APIError", () => {
  it("creates an error with message and status", () => {
    const error = new APIError("Not found", 404);
    expect(error.message).toBe("Not found");
    expect(error.status).toBe(404);
    expect(error.name).toBe("APIError_404");
  });

  it("sets name to APIError_Unknown when no status provided", () => {
    const error = new APIError("Something went wrong");
    expect(error.name).toBe("APIError_Unknown");
  });

  it("is an instance of Error", () => {
    const error = new APIError("test", 500);
    expect(error).toBeInstanceOf(Error);
  });

  it("stores the original error", () => {
    const originalError = new TypeError("network failure");
    const error = new APIError("Request failed", 500, originalError);
    expect(error.originalError).toBe(originalError);
  });
});
