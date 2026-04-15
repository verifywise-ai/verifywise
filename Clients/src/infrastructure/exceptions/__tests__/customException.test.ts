import { describe, it, expect } from "vitest";
import CustomException from "../customeException";

describe("CustomException", () => {
  it("sets message, status, and response", () => {
    const error = new CustomException("Something went wrong", 400, {
      error: "Bad request",
    });
    expect(error.message).toBe("Something went wrong");
    expect(error.status).toBe(400);
    expect(error.response).toEqual({ error: "Bad request" });
  });

  it("has name set to 'CustomException'", () => {
    const error = new CustomException("test", 500, null);
    expect(error.name).toBe("CustomException");
  });

  it("is an instance of Error", () => {
    const error = new CustomException("test", 404, undefined);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CustomException);
  });

  it("handles undefined status and response", () => {
    const error = new CustomException("test", undefined, undefined);
    expect(error.status).toBeUndefined();
    expect(error.response).toBeUndefined();
  });

  it("has a stack trace", () => {
    const error = new CustomException("test", 500, null);
    expect(error.stack).toBeDefined();
  });
});
