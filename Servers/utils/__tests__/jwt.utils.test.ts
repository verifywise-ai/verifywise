import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  getTokenPayload,
  generateToken,
  generateInviteToken,
  getRefreshTokenPayload,
  generateRefreshToken,
  generateApiToken,
} from "../jwt.utils";

// Set up required env vars for testing
beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
  process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-key-for-testing";
});

const testPayload = {
  id: 1,
  email: "user@example.com",
  roleName: "Admin",
  organizationId: 10,
};

describe("jwt.utils", () => {
  describe("generateToken + getTokenPayload", () => {
    it("should generate a valid JWT that can be decoded", () => {
      const token = generateToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const decoded = getTokenPayload(token!);
      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe(1);
      expect(decoded.email).toBe("user@example.com");
      expect(decoded.roleName).toBe("Admin");
    });

    it("should include an expire timestamp ~1 hour from now", () => {
      const before = Date.now();
      const token = generateToken(testPayload);
      const decoded = getTokenPayload(token!);
      const after = Date.now();

      const oneHourMs = 3600 * 1000;
      expect(decoded.expire).toBeGreaterThanOrEqual(before + oneHourMs - 100);
      expect(decoded.expire).toBeLessThanOrEqual(after + oneHourMs + 100);
    });
  });

  describe("generateRefreshToken + getRefreshTokenPayload", () => {
    it("should generate a refresh token decodable with refresh secret", () => {
      const token = generateRefreshToken(testPayload);
      expect(token).toBeDefined();

      const decoded = getRefreshTokenPayload(token!);
      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe(1);
    });

    it("should NOT be decodable with access token secret", () => {
      const refreshToken = generateRefreshToken(testPayload);
      // getTokenPayload uses JWT_SECRET, not REFRESH_TOKEN_SECRET
      const decoded = getTokenPayload(refreshToken!);
      expect(decoded).toBeNull();
    });

    it("access token should NOT be decodable with refresh secret", () => {
      const accessToken = generateToken(testPayload);
      const decoded = getRefreshTokenPayload(accessToken!);
      expect(decoded).toBeNull();
    });
  });

  describe("generateInviteToken", () => {
    it("should generate a token with ~1 week expiration", () => {
      const before = Date.now();
      const token = generateInviteToken(testPayload);
      const decoded = getTokenPayload(token!);

      const oneWeekMs = 7 * 24 * 3600 * 1000;
      expect(decoded.expire).toBeGreaterThanOrEqual(before + oneWeekMs - 100);
    });
  });

  describe("generateApiToken", () => {
    it("should default to 30-day expiration when no days specified", () => {
      const before = Date.now();
      const token = generateApiToken(testPayload);
      const decoded = getTokenPayload(token!);

      const thirtyDaysMs = 30 * 24 * 3600 * 1000;
      expect(decoded.expire).toBeGreaterThanOrEqual(before + thirtyDaysMs - 100);
    });

    it("should use custom expiration in days", () => {
      const before = Date.now();
      const token = generateApiToken(testPayload, 7);
      const decoded = getTokenPayload(token!);

      const sevenDaysMs = 7 * 24 * 3600 * 1000;
      expect(decoded.expire).toBeGreaterThanOrEqual(before + sevenDaysMs - 100);
      expect(decoded.expire).toBeLessThanOrEqual(before + sevenDaysMs + 1000);
    });
  });

  describe("getTokenPayload edge cases", () => {
    it("should return null for malformed token", () => {
      expect(getTokenPayload("not.a.jwt")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(getTokenPayload("")).toBeNull();
    });

    it("should return null for token signed with wrong secret", () => {
      // Manually create a token with different secret
      const Jwt = require("jsonwebtoken");
      const wrongToken = Jwt.sign(testPayload, "wrong-secret");
      expect(getTokenPayload(wrongToken)).toBeNull();
    });
  });
});
