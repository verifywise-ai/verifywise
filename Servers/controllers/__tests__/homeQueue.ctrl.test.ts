jest.mock("../../services/homeQueue", () => ({ getHomeQueue: jest.fn() }));
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestEffectivePermissions: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { getHomeQueueHandler } from "../homeQueue.ctrl";
import { getHomeQueue } from "../../services/homeQueue";
import { requestEffectivePermissions } from "../../utils/rolePermissions.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides: Record<string, unknown> = {}) =>
  ({
    userId: 5,
    organizationId: 7,
    role: "Editor",
    t: (key: string) => key,
    ...overrides,
  }) as any;

describe("getHomeQueueHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-11-14T23:30:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("GET returns 200 with the service result for the token's org and user", async () => {
    const body = { items: [], sources: { tasks: { status: "ok", count: 0 } }, counts: {} };
    (getHomeQueue as jest.Mock).mockResolvedValueOnce(body);
    (requestEffectivePermissions as jest.Mock).mockResolvedValueOnce(new Set(["intakeForm.edit"]));
    const req = mockReq();
    const res = mockRes();

    await getHomeQueueHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: body });
    expect(requestEffectivePermissions).toHaveBeenCalledWith(req);

    const ctx = (getHomeQueue as jest.Mock).mock.calls[0][0];
    expect(ctx.organizationId).toBe(7);
    expect(ctx.userId).toBe(5);
    expect(ctx.today).toBe("2026-11-14");
    expect(ctx.can("intakeForm.edit")).toBe(true);
    expect(ctx.can("aiApproval.admin")).toBe(false);
    expect(ctx.isAdmin).toBe(false);
  });

  it("marks an Admin token as able to decide any intake lane", async () => {
    (getHomeQueue as jest.Mock).mockResolvedValueOnce({ items: [], sources: {}, counts: {} });
    (requestEffectivePermissions as jest.Mock).mockResolvedValueOnce(new Set(["intakeForm.edit"]));

    await getHomeQueueHandler(mockReq({ role: "Admin" }), mockRes());

    expect((getHomeQueue as jest.Mock).mock.calls[0][0].isAdmin).toBe(true);
  });

  it("answers an empty queue, without querying, when the token has no organization", async () => {
    const res = mockRes();

    await getHomeQueueHandler(mockReq({ organizationId: undefined }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { items: [], sources: {}, counts: {} },
    });
    expect(getHomeQueue).not.toHaveBeenCalled();
  });

  it("500 path logs and returns the standard error shape", async () => {
    (requestEffectivePermissions as jest.Mock).mockResolvedValueOnce(new Set());
    (getHomeQueue as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const res = mockRes();

    await getHomeQueueHandler(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error", error: "boom" });
    expect(logger.error).toHaveBeenCalled();
    expect(logStructured).toHaveBeenCalledWith(
      "error",
      expect.any(String),
      "getHomeQueueHandler",
      "homeQueue.ctrl.ts",
    );
  });
});
