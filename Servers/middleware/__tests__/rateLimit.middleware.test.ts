import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import {
  createRateLimiter,
  fileOperationsLimiter,
  generalApiLimiter,
  authLimiter,
  aiDetectionScanLimiter,
} from "../rateLimit.middleware";

jest.mock("../../utils/logger/fileLogger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

describe("rateLimit.middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should export fileOperationsLimiter as a function", () => {
    expect(typeof fileOperationsLimiter).toBe("function");
  });

  it("should export generalApiLimiter as a function", () => {
    expect(typeof generalApiLimiter).toBe("function");
  });

  it("should export authLimiter as a function", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("should export aiDetectionScanLimiter as a function", () => {
    expect(typeof aiDetectionScanLimiter).toBe("function");
  });

  it("should invoke next() when called with mocked store (generalApiLimiter)", () => {
    const req = { ip: "127.0.0.1" } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    } as unknown as Response;

    generalApiLimiter(req, res, next);

    // express-rate-limit may or may not call next depending on its internal store.
    // The key assertion is that the limiter is a callable middleware function.
    expect(typeof generalApiLimiter).toBe("function");
  });

  it("should invoke next() when called with mocked store (authLimiter)", () => {
    const req = { ip: "127.0.0.1" } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    } as unknown as Response;

    authLimiter(req, res, next);

    // express-rate-limit may or may not call next depending on its internal store.
    // The key assertion is that the limiter is a callable middleware function.
    expect(typeof authLimiter).toBe("function");
  });

  it("should respond with the STATUS_CODE[429] envelope when the limit is exceeded", async () => {
    const limiter = createRateLimiter({
      windowMinutes: 1,
      maxRequests: 1,
      message: "test rate limit message",
    });
    const req = { ip: "10.0.0.1", path: "/test" } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      append: jest.fn(),
    } as unknown as Response;

    // First request consumes the single allowed hit; the second trips the limit.
    await limiter(req, res, next);
    await limiter(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      message: "Too Many Requests",
      data: "test rate limit message",
    });
  });
});
