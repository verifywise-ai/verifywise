import { describe, it, expect, jest } from "@jest/globals";
import { openAIError } from "../openAIErrorResponse";
import { Response } from "express";

describe("openAIErrorResponse", () => {
  const createMockResponse = () => {
    const jsonFn = jest.fn();
    const statusFn = jest
      .fn<(code: number) => { json: typeof jsonFn }>()
      .mockReturnValue({ json: jsonFn });
    return {
      res: { status: statusFn, json: jsonFn } as unknown as Response,
      statusFn,
      jsonFn,
    };
  };

  it("should call res.status with the provided status code", () => {
    const { res, statusFn } = createMockResponse();
    openAIError(res, 400, "Bad request", "invalid_request_error", "bad_request");
    expect(statusFn).toHaveBeenCalledTimes(1);
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("should call res.json with the correct error object shape", () => {
    const { res, jsonFn } = createMockResponse();
    openAIError(res, 400, "Bad request", "invalid_request_error", "bad_request");
    expect(jsonFn).toHaveBeenCalledTimes(1);
    expect(jsonFn).toHaveBeenCalledWith({
      error: {
        message: "Bad request",
        type: "invalid_request_error",
        code: "bad_request",
      },
    });
  });

  it("should work with status code 400", () => {
    const { res, statusFn, jsonFn } = createMockResponse();
    openAIError(res, 400, "Invalid request", "invalid_request_error", "invalid_request");
    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith({
      error: { message: "Invalid request", type: "invalid_request_error", code: "invalid_request" },
    });
  });

  it("should work with status code 401", () => {
    const { res, statusFn, jsonFn } = createMockResponse();
    openAIError(res, 401, "Unauthorized", "authentication_error", "unauthorized");
    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: { message: "Unauthorized", type: "authentication_error", code: "unauthorized" },
    });
  });

  it("should work with status code 429", () => {
    const { res, statusFn, jsonFn } = createMockResponse();
    openAIError(res, 429, "Rate limit exceeded", "rate_limit_error", "rate_limit_exceeded");
    expect(statusFn).toHaveBeenCalledWith(429);
    expect(jsonFn).toHaveBeenCalledWith({
      error: {
        message: "Rate limit exceeded",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
  });

  it("should work with status code 500", () => {
    const { res, statusFn, jsonFn } = createMockResponse();
    openAIError(res, 500, "Internal server error", "api_error", "internal_error");
    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith({
      error: { message: "Internal server error", type: "api_error", code: "internal_error" },
    });
  });
});
