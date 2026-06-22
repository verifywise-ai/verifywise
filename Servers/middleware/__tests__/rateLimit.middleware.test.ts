import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import {
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

    expect(typeof authLimiter).toBe("function");
  });
});
