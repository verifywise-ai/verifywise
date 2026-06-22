import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { aiContentTrackerMiddleware, trackAIContent } from "../aiContentTracker.middleware";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

import { sequelize } from "../../database/db";

const mockSequelizeQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

function createMockReq(partial: Partial<Request> = {}): Partial<Request> {
  return {
    organizationId: 1,
    userId: 42,
    t: (key: string) => key,
    ...partial,
  } as Partial<Request>;
}

function createMockRes(statusCode = 200): Partial<Response> {
  const res: Partial<Response> = {};
  res.statusCode = statusCode;
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("aiContentTracker middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSequelizeQuery.mockResolvedValue([[], {}] as any);
  });

  describe("trackAIContent", () => {
    it("should insert AI content metadata and return the created row", async () => {
      mockSequelizeQuery.mockResolvedValue([[{ id: 1 }], {}] as any);
      const result = await trackAIContent(1, "risk", 101, {
        badgeType: "ai-generated",
        toolName: "risk-summarizer",
      });

      expect(result).toEqual({ id: 1 });
      expect(mockSequelizeQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO ai_content_metadata"),
        expect.objectContaining({
          replacements: expect.objectContaining({
            entityType: "risk",
            entityId: 101,
            badgeType: "ai-generated",
            toolName: "risk-summarizer",
            organizationId: 1,
          }),
        }),
      );
    });

    it("should return null on DB error without throwing", async () => {
      mockSequelizeQuery.mockRejectedValue(new Error("DB failure"));
      const result = await trackAIContent(1, "risk", 101, {
        badgeType: "ai-generated",
      });

      expect(result).toBeNull();
    });
  });

  describe("aiContentTrackerMiddleware", () => {
    it("should call next() immediately", () => {
      const next = jest.fn();
      const middleware = aiContentTrackerMiddleware({
        entityType: "risk",
        badgeType: "ai-generated",
        getEntityId: () => 101,
      });
      const req = createMockReq() as Request;
      const res = createMockRes() as Response;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should track AI content when res.json is called with 2xx status", () => {
      const next = jest.fn();
      const middleware = aiContentTrackerMiddleware({
        entityType: "risk",
        badgeType: "ai-generated",
        toolName: "summarizer",
        getEntityId: () => 101,
      });
      const req = createMockReq() as Request;
      const res = createMockRes(200) as Response;

      middleware(req, res, next);
      res.json({ success: true });

      expect(mockSequelizeQuery).toHaveBeenCalled();
    });

    it("should not track AI content when res.json is called with non-2xx status", () => {
      const next = jest.fn();
      const middleware = aiContentTrackerMiddleware({
        entityType: "risk",
        badgeType: "ai-generated",
        getEntityId: () => 101,
      });
      const req = createMockReq() as Request;
      const res = createMockRes(400) as Response;

      middleware(req, res, next);
      res.json({ error: "bad request" });

      expect(mockSequelizeQuery).not.toHaveBeenCalled();
    });

    it("should not track when getEntityId returns null", () => {
      const next = jest.fn();
      const middleware = aiContentTrackerMiddleware({
        entityType: "risk",
        badgeType: "ai-generated",
        getEntityId: () => null,
      });
      const req = createMockReq() as Request;
      const res = createMockRes(200) as Response;

      middleware(req, res, next);
      res.json({ success: true });

      expect(mockSequelizeQuery).not.toHaveBeenCalled();
    });

    it("should not track when organizationId is missing", () => {
      const next = jest.fn();
      const middleware = aiContentTrackerMiddleware({
        entityType: "risk",
        badgeType: "ai-generated",
        getEntityId: () => 101,
      });
      const req = createMockReq({ organizationId: undefined }) as Request;
      const res = createMockRes(200) as Response;

      middleware(req, res, next);
      res.json({ success: true });

      expect(mockSequelizeQuery).not.toHaveBeenCalled();
    });
  });
});
