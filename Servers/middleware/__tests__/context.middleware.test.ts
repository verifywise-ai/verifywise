import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import contextMiddleware from "../context.middleware";

jest.mock("../../utils/context/context", () => ({
  asyncLocalStorage: {
    run: jest.fn((_ctx: unknown, cb: () => void) => cb()),
  },
}));

import { asyncLocalStorage } from "../../utils/context/context";

const mockRun = asyncLocalStorage.run as jest.MockedFunction<typeof asyncLocalStorage.run>;

function createMockReq(partial: Partial<Request> = {}): Partial<Request> {
  return {
    t: (key: string) => key,
    ...partial,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  return {} as Partial<Response>;
}

describe("context.middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should store userId, tenantId, and organizationId in asyncLocalStorage", () => {
    const req = createMockReq({ userId: 42, tenantId: "abc123", organizationId: 10 }) as Request;
    const res = createMockRes();

    contextMiddleware(req, res as Response, next);

    expect(mockRun).toHaveBeenCalledWith(
      { userId: 42, tenantId: "abc123", organizationId: 10 },
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should set userId to undefined when not a number", () => {
    const req = createMockReq({
      userId: "not-a-number" as unknown as number,
      tenantId: "abc",
    }) as Request;
    const res = createMockRes();

    contextMiddleware(req, res as Response, next);

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should call next() inside asyncLocalStorage.run callback", () => {
    const req = createMockReq({ userId: 1 }) as Request;
    const res = createMockRes();

    contextMiddleware(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
