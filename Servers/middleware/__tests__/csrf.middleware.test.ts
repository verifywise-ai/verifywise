import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import crypto from "crypto";
import { Request, Response } from "express";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfProtection,
  generateCsrfToken,
} from "../csrf.middleware";

jest.mock("../../utils/jwt.utils", () => ({
  THIRTY_DAYS_MS: 30 * 24 * 3600 * 1000,
}));

describe("csrf.middleware", () => {
  let next: jest.Mock;

  function createReq(overrides: Partial<Request> = {}): Request {
    return {
      method: "GET",
      cookies: {},
      headers: {},
      ...overrides,
    } as unknown as Request;
  }

  function createRes(): Response {
    const res: any = {};
    res.status = jest.fn<any>().mockReturnValue(res);
    res.json = jest.fn<any>().mockReturnValue(res);
    res.cookie = jest.fn<any>().mockReturnValue(res);
    return res as Response;
  }

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should export the cookie and header names", () => {
    expect(CSRF_COOKIE_NAME).toBe("csrfToken");
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
  });

  describe("generateCsrfToken", () => {
    it("should set a non-httpOnly cookie mirroring the refresh cookie semantics", () => {
      process.env.NODE_ENV = "development";
      const res = createRes();
      const token = generateCsrfToken(res);

      expect(typeof token).toBe("string");
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(res.cookie).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        token,
        expect.objectContaining({
          httpOnly: false,
          path: "/api/users",
          sameSite: "lax",
          secure: false,
        }),
      );
    });

    it("should use SameSite=None and Secure in production", () => {
      process.env.NODE_ENV = "production";
      const res = createRes();
      generateCsrfToken(res);

      expect(res.cookie).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ sameSite: "none", secure: true }),
      );
      process.env.NODE_ENV = "development";
    });
  });

  describe("csrfProtection", () => {
    it("should pass through requests without the refresh_token cookie (Bearer clients)", () => {
      const req = createReq({ method: "POST", cookies: {} });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should pass through safe methods even with the refresh_token cookie", () => {
      const req = createReq({ method: "GET", cookies: { refresh_token: "abc" } });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should reject state-changing requests with a missing CSRF header", () => {
      const req = createReq({
        method: "POST",
        cookies: { refresh_token: "abc", [CSRF_COOKIE_NAME]: "token-123" },
        headers: {},
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject state-changing requests with a missing CSRF cookie", () => {
      const req = createReq({
        method: "POST",
        cookies: { refresh_token: "abc" },
        headers: { [CSRF_HEADER_NAME]: "token-123" },
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject state-changing requests with a mismatched CSRF token", () => {
      const req = createReq({
        method: "POST",
        cookies: { refresh_token: "abc", [CSRF_COOKIE_NAME]: "a".repeat(64) },
        headers: { [CSRF_HEADER_NAME]: "b".repeat(64) },
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject tokens of different lengths without throwing (length guard)", () => {
      const req = createReq({
        method: "DELETE",
        cookies: { refresh_token: "abc", [CSRF_COOKIE_NAME]: "short" },
        headers: { [CSRF_HEADER_NAME]: "much-longer-token-value" },
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should pass when the header matches the cookie", () => {
      const token = crypto.randomBytes(32).toString("hex");
      const req = createReq({
        method: "POST",
        cookies: { refresh_token: "abc", [CSRF_COOKIE_NAME]: token },
        headers: { [CSRF_HEADER_NAME]: token },
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should compare tokens using crypto.timingSafeEqual", () => {
      const spy = jest.spyOn(crypto, "timingSafeEqual");
      const token = crypto.randomBytes(32).toString("hex");
      const req = createReq({
        method: "POST",
        cookies: { refresh_token: "abc", [CSRF_COOKIE_NAME]: token },
        headers: { [CSRF_HEADER_NAME]: token },
      });
      const res = createRes();

      csrfProtection(req, res, next);

      expect(spy).toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
