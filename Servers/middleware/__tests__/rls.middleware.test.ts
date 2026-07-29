import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/logger/fileLogger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const mockTransaction = {
  commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};
const mockSequelizeQuery = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
const mockSequelizeTransaction = jest
  .fn<() => Promise<typeof mockTransaction>>()
  .mockResolvedValue(mockTransaction);

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: mockSequelizeTransaction,
    query: mockSequelizeQuery,
  },
}));

import { isRlsEnforcementEnabled, rlsEnforcement } from "../rls.middleware";

const buildRes = () => {
  const handlers: Record<string, () => void> = {};
  const res = {
    statusCode: 200,
    on: jest.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
      return res;
    }),
    emit: (event: string) => handlers[event]?.(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & { emit: (event: string) => void };
  return res;
};

describe("rls.middleware", () => {
  const originalEnv = process.env.RLS_ENFORCEMENT_ENABLED;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RLS_ENFORCEMENT_ENABLED;
    } else {
      process.env.RLS_ENFORCEMENT_ENABLED = originalEnv;
    }
  });

  describe("isRlsEnforcementEnabled", () => {
    it("is false when the flag is unset", () => {
      delete process.env.RLS_ENFORCEMENT_ENABLED;
      expect(isRlsEnforcementEnabled()).toBe(false);
    });

    it("is false for any value other than explicit 'true' (fail closed)", () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "1";
      expect(isRlsEnforcementEnabled()).toBe(false);
      process.env.RLS_ENFORCEMENT_ENABLED = "yes";
      expect(isRlsEnforcementEnabled()).toBe(false);
    });

    it("is true only for explicit 'true'", () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      expect(isRlsEnforcementEnabled()).toBe(true);
    });
  });

  describe("rlsEnforcement", () => {
    it("is a pass-through when the flag is off", async () => {
      delete process.env.RLS_ENFORCEMENT_ENABLED;
      const req = { organizationId: 42 } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSequelizeTransaction).not.toHaveBeenCalled();
    });

    it("fails closed (500) when enabled and a non-super-admin request has no org context", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = {} as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockSequelizeTransaction).not.toHaveBeenCalled();
    });

    it("exempts SuperAdmin requests without an org context", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { isSuperAdmin: true } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSequelizeTransaction).not.toHaveBeenCalled();
    });

    it("opens a transaction and binds SET LOCAL app.current_org when enabled with an org", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { organizationId: 42 } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);

      expect(mockSequelizeTransaction).toHaveBeenCalledTimes(1);
      expect(mockSequelizeQuery).toHaveBeenCalledWith(
        "SET LOCAL app.current_org = :orgId",
        expect.objectContaining({
          replacements: { orgId: 42 },
          transaction: mockTransaction,
        }),
      );
      expect((req as any).rlsTransaction).toBe(mockTransaction);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("commits the transaction when the response finishes successfully", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { organizationId: 7 } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);
      res.emit("finish");

      expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
      expect(mockTransaction.rollback).not.toHaveBeenCalled();
    });

    it("rolls back when the response finishes with an error status", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { organizationId: 7 } as unknown as Request;
      const res = buildRes();
      res.statusCode = 500;

      await rlsEnforcement(req, res, next as any);
      res.emit("finish");

      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("rolls back when the connection closes before finishing", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { organizationId: 7 } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);
      res.emit("close");

      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("settles the transaction only once (finish then close)", async () => {
      process.env.RLS_ENFORCEMENT_ENABLED = "true";
      const req = { organizationId: 7 } as unknown as Request;
      const res = buildRes();

      await rlsEnforcement(req, res, next as any);
      res.emit("finish");
      res.emit("close");

      expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
      expect(mockTransaction.rollback).not.toHaveBeenCalled();
    });
  });
});
