import request from "supertest";
import express from "express";

// x-user / x-org stand in for the token's claims; no Authorization header is a
// 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Auditor";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../services/homeQueue", () => ({
  getHomeQueue: jest.fn(async () => ({ items: [], sources: {}, counts: {} })),
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  requestEffectivePermissions: jest.fn(async () => new Set<string>()),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../homeQueue.route";
import { getHomeQueue } from "../../../services/homeQueue";

const app = express();
app.use("/api/v1/home", routes);

const ROUTE = "/api/v1/home/queue";

describe("/api/v1/home/queue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect(getHomeQueue).not.toHaveBeenCalled();
  });

  it("serves every role, read-only roles included", async () => {
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], sources: {}, counts: {} });
  });

  it("scopes to the token's organization and user, whatever the query string says", async () => {
    const res = await request(app)
      .get(`${ROUTE}?organizationId=99&userId=99`)
      .set("Authorization", "Bearer t")
      .set("x-user", "5")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    const ctx = (getHomeQueue as jest.Mock).mock.calls[0][0];
    expect(ctx.organizationId).toBe(7);
    expect(ctx.userId).toBe(5);
  });
});
