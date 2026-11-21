import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/fileUpload.utils", () => ({
  canUserAccessFile: jest.fn(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
}));

import { requireFileAccess } from "../fileAccess.middleware";
import { canUserAccessFile } from "../../utils/fileUpload.utils";
import { logFailure } from "../../utils/logger/logHelper";

const mockCanAccess = canUserAccessFile as jest.MockedFunction<any>;

/** req.t marks each message so the test can see it was translated. */
function createReq(overrides: Partial<Request> = {}): Request {
  return {
    params: { fileId: "5" },
    userId: 2,
    role: "Editor",
    organizationId: 1,
    t: (key: string) => `t:${key}`,
    ...overrides,
  } as unknown as Request;
}

function createRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as Response;
}

describe("requireFileAccess", () => {
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it("answers 400 with the translated message for a bad file id", async () => {
    const res = createRes();
    await requireFileAccess("fileId")(createReq({ params: { fileId: "abc" } } as any), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "t:Invalid file ID" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 with the translated message without a user", async () => {
    const res = createRes();
    await requireFileAccess("fileId")(createReq({ userId: undefined } as any), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "t:Unauthenticated" }));
  });

  it("answers 403 with the translated message and logs the denial", async () => {
    mockCanAccess.mockResolvedValue(false);
    const res = createRes();
    await requireFileAccess("fileId")(createReq(), res, next);
    expect(mockCanAccess).toHaveBeenCalledWith(5, 2, "Editor", 1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "t:Access denied" }));
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Read",
        functionName: "requireFileAccess",
        userId: 2,
        organizationId: 1,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes an allowed caller on without logging a failure", async () => {
    mockCanAccess.mockResolvedValue(true);
    const res = createRes();
    await requireFileAccess("fileId")(createReq(), res, next);
    expect(next).toHaveBeenCalledWith();
    expect(logFailure).not.toHaveBeenCalled();
  });
});
