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

// Built-in roles, so `authorize` reads the real permission matrix without a database.
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_organizationId: number, name: string) => ({
    id: 1,
    name,
    organizationId: null,
  })),
}));

// Each handler answers with the identity it was called with, so these tests
// can show the route carries the token's organization through.
jest.mock("../../../controllers/biasAudit.ctrl", () => {
  const handler = (req: any, res: any) =>
    res.status(200).json({ organizationId: req.organizationId, userId: req.userId });
  return {
    DATASET_MAX_BYTES: 30 * 1024 * 1024,
    handleDatasetUploadError: (err: any, _req: any, _res: any, next: any) => next(err),
    attestProfile: jest.fn(handler),
    confirmDerivedBasis: jest.fn(handler),
    createRun: jest.fn(handler),
    downloadStance: jest.fn(handler),
    generateProfileStance: jest.fn(handler),
    generateStance: jest.fn(handler),
    getProfile: jest.fn(handler),
    getQuestions: jest.fn(handler),
    getRun: jest.fn(handler),
    getRunTrend: jest.fn(handler),
    listRuns: jest.fn(handler),
    saveProfileAnswers: jest.fn(handler),
  };
});

import routes from "../biasAudit.route";
import * as ctrl from "../../../controllers/biasAudit.ctrl";

const app = express();
app.use(express.json());
app.use("/api/v1/bias-audit", routes);

const authed = (method: "get" | "post" | "put", path: string, role = "Admin") =>
  request(app)
    [method](`/api/v1/bias-audit${path}`)
    .set("Authorization", "Bearer t")
    .set("x-role", role);

describe("/api/v1/bias-audit", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["get", "/questions/15"],
    ["get", "/profiles/7/15"],
    ["put", "/profiles/7/15"],
    ["post", "/profiles/7/15/attest"],
    ["post", "/profiles/7/15/stance"],
    ["post", "/runs"],
    ["get", "/runs"],
    ["get", "/runs/trend"],
    ["get", "/runs/1"],
    ["post", "/runs/1/derived-basis/confirm"],
    ["post", "/runs/1/stance"],
    ["get", "/stances/1/download"],
  ] as const)("answers 401 without a token on %s %s", async (method, path) => {
    const res = await request(app)[method](`/api/v1/bias-audit${path}`);
    expect(res.status).toBe(401);
  });

  it.each(["Admin", "Reviewer", "Editor", "Auditor"])("lets %s read", async (role) => {
    expect((await authed("get", "/questions/15", role)).status).toBe(200);
    expect((await authed("get", "/runs", role)).status).toBe(200);
  });

  it.each(["Reviewer", "Auditor"])("refuses %s drafting answers or a run", async (role) => {
    expect((await authed("put", "/profiles/7/15", role).send({})).status).toBe(403);
    expect((await authed("post", "/runs/1/stance", role)).status).toBe(403);
    expect(ctrl.saveProfileAnswers).not.toHaveBeenCalled();
    expect(ctrl.generateStance).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Editor", "Auditor"])("refuses %s attesting", async (role) => {
    expect((await authed("post", "/profiles/7/15/attest", role)).status).toBe(403);
    expect((await authed("post", "/runs/1/derived-basis/confirm", role)).status).toBe(403);
    expect(ctrl.attestProfile).not.toHaveBeenCalled();
    expect(ctrl.confirmDerivedBasis).not.toHaveBeenCalled();
  });

  it("lets an Editor draft and generate, and an Admin attest", async () => {
    expect((await authed("put", "/profiles/7/15", "Editor").send({})).status).toBe(200);
    expect((await authed("post", "/profiles/7/15/stance", "Editor")).status).toBe(200);
    expect((await authed("post", "/profiles/7/15/attest", "Admin")).status).toBe(200);
  });

  it("passes the token's organization to the controller", async () => {
    const res = await authed("get", "/runs/1").set("x-org", "7").set("x-user", "5");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: 7, userId: 5 });
  });

  it("accepts a CSV dataset upload", async () => {
    const res = await authed("post", "/runs")
      .field("projectId", "7")
      .attach("file", Buffer.from("a,b\n1,2\n"), {
        filename: "data.csv",
        contentType: "text/csv",
      });
    expect(res.status).toBe(200);
    expect(ctrl.createRun).toHaveBeenCalledTimes(1);
  });
});
