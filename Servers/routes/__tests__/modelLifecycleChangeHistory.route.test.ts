import request from "supertest";
import express from "express";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.t = (key: string) => key;
    next();
  },
}));
// The real middleware answers 403 when the org has the extension off.
jest.mock("../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: jest.fn(
    (key: string) => (req: any, res: any, next: any) =>
      key === "model-lifecycle" && req.headers["x-extension-off"]
        ? res.status(403).json({ message: "Extension disabled" })
        : next(),
  ),
}));
jest.mock("../../controllers/modelLifecycleChangeHistory.ctrl", () => ({
  getModelLifecycleChangeHistoryById: jest.fn((_req: any, res: any) => res.status(200).json({})),
}));

import routes from "../modelLifecycleChangeHistory.route";
import { getModelLifecycleChangeHistoryById } from "../../controllers/modelLifecycleChangeHistory.ctrl";

const app = express();
app.use("/api/model-lifecycle-change-history", routes);

describe("GET /api/model-lifecycle-change-history/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is gated on the model-lifecycle extension like every other lifecycle route", async () => {
    const res = await request(app)
      .get("/api/model-lifecycle-change-history/10")
      .set("x-extension-off", "1");

    expect(res.status).toBe(403);
    expect(getModelLifecycleChangeHistoryById).not.toHaveBeenCalled();
  });

  it("reaches the controller when the extension is on", async () => {
    const res = await request(app).get("/api/model-lifecycle-change-history/10");

    expect(res.status).toBe(200);
    expect(getModelLifecycleChangeHistoryById).toHaveBeenCalled();
  });
});
