import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { validateTokenCreation, validateTokenDeletion } from "../tokens.middleware";

jest.mock("../../utils/tokens.utils", () => ({
  getNumberOfApiTokensQuery: jest.fn(),
}));

import { getNumberOfApiTokensQuery } from "../../utils/tokens.utils";

const mockGetNumberOfApiTokensQuery = getNumberOfApiTokensQuery as jest.MockedFunction<
  typeof getNumberOfApiTokensQuery
>;

function createMockReq(role?: string, organizationId?: number): Partial<Request> {
  return {
    role,
    organizationId,
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("tokens.middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe("validateTokenCreation", () => {
    it("should return 403 when user is not Admin", async () => {
      const req = createMockReq("Editor", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Only Admin users can create API tokens.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when token limit is reached", async () => {
      mockGetNumberOfApiTokensQuery.mockResolvedValue(10);
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(mockGetNumberOfApiTokensQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Token limit reached. Maximum 10 tokens allowed.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next() when user is Admin and under token limit", async () => {
      mockGetNumberOfApiTokensQuery.mockResolvedValue(3);
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("validateTokenDeletion", () => {
    it("should return 403 when user is not Admin", async () => {
      const req = createMockReq("Editor", 1) as Request;
      const res = createMockRes();

      await validateTokenDeletion(req, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Only Admin users can delete API tokens.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next() when user is Admin", async () => {
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenDeletion(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
