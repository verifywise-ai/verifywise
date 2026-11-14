import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId =
      req.headers["x-org"] === "none" ? undefined : Number(req.headers["x-org"] ?? 42);
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../services/changeNotice", () => ({
  viewNotice: jest.fn(async () => ({ show: true })),
  setDismissed: jest.fn(async (i: any) => ({ dismissed: i.dismissed })),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../changeNotice.route";
import { setDismissed, viewNotice } from "../../../services/changeNotice";

const app = express();
app.use(express.json());
app.use("/api/v1/change-notices", routes);

const BASE = "/api/v1/change-notices";
const auth = { Authorization: "Bearer t" };

describe("/api/v1/change-notices", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).post(`${BASE}/ai-detection/view`)).status).toBe(401);
    expect(
      (await request(app).put(`${BASE}/ai-detection/dismissed`).send({ dismissed: true })).status,
    ).toBe(401);
    expect(viewNotice).not.toHaveBeenCalled();
  });

  it("answers 400 for an invalid id on both endpoints", async () => {
    expect((await request(app).post(`${BASE}/Bad_ID/view`).set(auth)).status).toBe(400);
    const res = await request(app)
      .put(`${BASE}/Bad_ID/dismissed`)
      .set(auth)
      .send({ dismissed: true });
    expect(res.status).toBe(400);
    expect(viewNotice).not.toHaveBeenCalled();
    expect(setDismissed).not.toHaveBeenCalled();
  });

  it("answers 400 when dismissed is not a boolean", async () => {
    const res = await request(app)
      .put(`${BASE}/ai-detection/dismissed`)
      .set(auth)
      .send({ dismissed: "yes" });
    expect(res.status).toBe(400);
    const missing = await request(app).put(`${BASE}/ai-detection/dismissed`).set(auth).send({});
    expect(missing.status).toBe(400);
    expect(setDismissed).not.toHaveBeenCalled();
  });

  it("returns { show } for a view, scoped to the token's user and organization", async () => {
    const res = await request(app)
      .post(`${BASE}/ai-detection/view?userId=99&organizationId=99`)
      .set(auth)
      .set("x-user", "5")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ show: true });
    expect((viewNotice as jest.Mock).mock.calls[0][0]).toMatchObject({
      userId: 5,
      organizationId: 7,
      id: "ai-detection",
    });
  });

  it("returns { dismissed } for both true and false (Undo)", async () => {
    const yes = await request(app)
      .put(`${BASE}/ai-detection/dismissed`)
      .set(auth)
      .send({ dismissed: true });
    expect(yes.status).toBe(200);
    expect(yes.body.data).toEqual({ dismissed: true });
    const no = await request(app)
      .put(`${BASE}/ai-detection/dismissed`)
      .set(auth)
      .send({ dismissed: false });
    expect(no.body.data).toEqual({ dismissed: false });
  });

  it("answers { show: false } without calling the service when the token has no organization", async () => {
    const res = await request(app).post(`${BASE}/ai-detection/view`).set(auth).set("x-org", "none");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ show: false });
    expect(viewNotice).not.toHaveBeenCalled();
  });
});
