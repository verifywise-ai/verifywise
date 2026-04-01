import { describe, it, expect, jest, beforeAll, beforeEach } from "@jest/globals";

// Mock dependencies
jest.mock("../jwt.utils", () => ({
  generateToken: jest.fn(),
  generateRefreshToken: jest.fn(),
}));

import { generateUserTokens } from "../auth.utils";
import { generateToken, generateRefreshToken } from "../jwt.utils";

const mockGenerateToken = generateToken as jest.MockedFunction<typeof generateToken>;
const mockGenerateRefreshToken = generateRefreshToken as jest.MockedFunction<typeof generateRefreshToken>;

describe("auth.utils", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "development";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateToken.mockReturnValue("access-token-123");
    mockGenerateRefreshToken.mockReturnValue("refresh-token-456");
  });

  describe("generateUserTokens", () => {
    const userData = {
      id: 1,
      email: "user@test.com",
      roleName: "Admin",
      organizationId: 10,
    };

    function createMockRes() {
      const res: any = {};
      res.cookie = jest.fn<any>();
      return res;
    }

    it("should generate both access and refresh tokens", () => {
      const res = createMockRes();
      const result = generateUserTokens(userData, res);

      expect(result.accessToken).toBe("access-token-123");
      expect(result.refreshToken).toBe("refresh-token-456");
    });

    it("should include organizationId in token payload", () => {
      const res = createMockRes();
      generateUserTokens(userData, res);

      expect(mockGenerateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          email: "user@test.com",
          roleName: "Admin",
          organizationId: 10,
        })
      );
    });

    it("should set refresh token as httpOnly cookie", () => {
      const res = createMockRes();
      generateUserTokens(userData, res);

      expect(res.cookie).toHaveBeenCalledWith(
        "refresh_token",
        "refresh-token-456",
        expect.objectContaining({
          httpOnly: true,
          path: "/api/users",
        })
      );
    });

    it("should set sameSite to lax in development", () => {
      process.env.NODE_ENV = "development";
      const res = createMockRes();
      generateUserTokens(userData, res);

      expect(res.cookie).toHaveBeenCalledWith(
        "refresh_token",
        "refresh-token-456",
        expect.objectContaining({
          sameSite: "lax",
          secure: false,
        })
      );
    });

    it("should set cookie expiration ~30 days in the future", () => {
      const res = createMockRes();
      const before = Date.now();
      generateUserTokens(userData, res);

      const cookieCall = res.cookie.mock.calls[0];
      const cookieOptions = cookieCall[2];
      const thirtyDaysMs = 30 * 24 * 3600 * 1000;

      expect(cookieOptions.expires.getTime()).toBeGreaterThanOrEqual(
        before + thirtyDaysMs - 1000
      );
    });
  });
});
