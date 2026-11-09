import request from "supertest";
import express from "express";

// The token decides who and which organization: x-user / x-org stand in for
// its claims; no Authorization header is a 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../utils/dashboardPreferences.utils", () => ({
  getDashboardPreferences: jest.fn(async () => null),
  upsertDashboardPreferences: jest.fn(async (_userId: number, _orgId: number, layout: object) => ({
    layout,
    updated_at: "2026-11-08T00:00:00.000Z",
  })),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../dashboardPreferences.route";
import {
  getDashboardPreferences,
  upsertDashboardPreferences,
} from "../../../utils/dashboardPreferences.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/dashboard", routes);

const ROUTE = "/api/v1/dashboard/preferences";
const entry = (position: number, widgetKey = `operations.widget-${position}`) => ({
  widgetKey,
  visible: true,
  position,
});

const put = (body: unknown) =>
  request(app)
    .put(ROUTE)
    .set("Authorization", "Bearer t")
    .send(body as object);

describe("/api/v1/dashboard/preferences", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect((await request(app).put(ROUTE).send({ layout: [] })).status).toBe(401);
    expect(getDashboardPreferences).not.toHaveBeenCalled();
    expect(upsertDashboardPreferences).not.toHaveBeenCalled();
  });

  it("answers null when the user has not saved a layout", async () => {
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ layout: null, updated_at: null });
    expect(getDashboardPreferences).toHaveBeenCalledWith(9, 42);
  });

  it("returns the saved layout of the token's user and organization", async () => {
    (getDashboardPreferences as jest.Mock).mockResolvedValueOnce({
      layout: [entry(0)],
      updated_at: "2026-11-08T00:00:00.000Z",
    });
    const res = await request(app)
      .get(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-user", "5")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    expect(res.body.data.layout).toEqual([entry(0)]);
    expect(getDashboardPreferences).toHaveBeenCalledWith(5, 7);
  });

  it.each(["Reviewer", "Editor", "Auditor"])("lets an %s save their own layout", async (role) => {
    const res = await request(app)
      .put(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", role)
      .send({ layout: [entry(0)] });
    expect(res.status).toBe(200);
    expect(upsertDashboardPreferences).toHaveBeenCalledWith(9, 42, [entry(0)]);
  });

  it("writes only to the token's user and organization, whatever the body says", async () => {
    const res = await request(app)
      .put(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-user", "5")
      .set("x-org", "7")
      .send({ layout: [entry(0)], user_id: 99, organization_id: 99 });
    expect(res.status).toBe(200);
    expect(upsertDashboardPreferences).toHaveBeenCalledWith(5, 7, [entry(0)]);
  });

  it("accepts an empty layout", async () => {
    const res = await put({ layout: [] });
    expect(res.status).toBe(200);
    expect(upsertDashboardPreferences).toHaveBeenCalledWith(9, 42, []);
  });

  it("accepts the largest allowed layout", async () => {
    const layout = Array.from({ length: 200 }, (_, i) => entry(i));
    expect((await put({ layout })).status).toBe(200);
  });

  it.each([
    ["no body", {}],
    ["layout is null", { layout: null }],
    ["layout is an object", { layout: { widgetKey: "a" } }],
    ["layout is a string", { layout: "[]" }],
    ["too many entries", { layout: Array.from({ length: 201 }, (_, i) => entry(i)) }],
    ["entry is not an object", { layout: [5] }],
    ["entry is null", { layout: [null] }],
    ["entry is an array", { layout: [[entry(0)]] }],
    ["entry has an unknown field", { layout: [{ ...entry(0), extra: 1 }] }],
    ["widgetKey missing", { layout: [{ visible: true, position: 0 }] }],
    ["widgetKey not a string", { layout: [{ ...entry(0), widgetKey: 7 }] }],
    ["widgetKey empty", { layout: [{ ...entry(0), widgetKey: "" }] }],
    ["widgetKey too long", { layout: [{ ...entry(0), widgetKey: "a".repeat(101) }] }],
    ["widgetKey with markup", { layout: [{ ...entry(0), widgetKey: "<script>" }] }],
    ["visible missing", { layout: [{ widgetKey: "a", position: 0 }] }],
    ["visible a string", { layout: [{ ...entry(0), visible: "true" }] }],
    ["position missing", { layout: [{ widgetKey: "a", visible: true }] }],
    ["position a string", { layout: [{ ...entry(0), position: "0" }] }],
    ["position negative", { layout: [{ ...entry(0), position: -1 }] }],
    ["position a fraction", { layout: [{ ...entry(0), position: 1.5 }] }],
    ["position too large", { layout: [{ ...entry(0), position: 200 }] }],
    ["duplicate widgetKey", { layout: [entry(0, "a"), entry(1, "a")] }],
    ["duplicate position", { layout: [entry(0, "a"), entry(0, "b")] }],
  ])("refuses a malformed body: %s", async (_name, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
    expect(upsertDashboardPreferences).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails", async () => {
    (getDashboardPreferences as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(500);
  });
});
