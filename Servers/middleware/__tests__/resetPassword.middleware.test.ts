import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/jwt.utils", () => ({
  getTokenPayload: jest.fn(),
}));

import resetPassword from "../resetPassword.middleware";
import { getTokenPayload } from "../../utils/jwt.utils";

const mockGetTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;

function createMockReq(token?: string, body?: Record<string, unknown>): Partial<Request> {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body || {},
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("resetPassword middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 400 when no token is provided", async () => {
    const req = createMockReq(undefined, { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token is invalid", async () => {
    mockGetTokenPayload.mockReturnValue(null as any);
    const req = createMockReq("invalid", { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 406 when token is expired", async () => {
    mockGetTokenPayload.mockReturnValue({
      expire: Date.now() - 1000,
      email: "user@test.com",
    } as any);
    const req = createMockReq("expired", { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(406);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when email is missing in token payload", async () => {
    mockGetTokenPayload.mockReturnValue({
      expire: Date.now() + 3600000,
    } as any);
    const req = createMockReq("noemail", { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when token email does not match request email", async () => {
    mockGetTokenPayload.mockReturnValue({
      expire: Date.now() + 3600000,
      email: "token@test.com",
    } as any);
    const req = createMockReq("mismatch", { email: "request@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when token is valid and emails match", async () => {
    mockGetTokenPayload.mockReturnValue({
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    const req = createMockReq("valid", { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 500 on unexpected error", async () => {
    mockGetTokenPayload.mockImplementation(() => {
      throw new Error("Unexpected failure");
    });
    const req = createMockReq("crash", { email: "user@test.com" }) as Request;
    const res = createMockRes();

    await resetPassword(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
