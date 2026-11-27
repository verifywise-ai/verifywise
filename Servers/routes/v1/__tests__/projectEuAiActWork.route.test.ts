import request from "supertest";
import express from "express";

// x-role / x-org stand in for the token's claims; no Authorization header is a
// 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../utils/project.utils", () => ({
  ...jest.requireActual("../../../utils/project.utils"),
  getProjectAccessQuery: jest.fn(async () => "allowed"),
  getProjectReadAccessQuery: jest.fn(async () => "allowed"),
  getEuAiActWorkQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../projects.route";
import { getEuAiActWorkQuery, getProjectReadAccessQuery } from "../../../utils/project.utils";

const readAccessQuery = getProjectReadAccessQuery as jest.Mock;
const workQuery = getEuAiActWorkQuery as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/projects", routes);

const ROUTE = "/api/v1/projects/12/eu-ai-act-work";
const get = (role = "Editor", org = "42") =>
  request(app).get(ROUTE).set("Authorization", "Bearer t").set("x-role", role).set("x-org", org);

describe("GET /api/v1/projects/:id/eu-ai-act-work", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readAccessQuery.mockResolvedValue("allowed");
  });

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect(workQuery).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a positive integer", async () => {
    const res = await request(app)
      .get("/api/v1/projects/abc/eu-ai-act-work")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
    expect(workQuery).not.toHaveBeenCalled();
  });

  it("refuses someone who may not read the use case", async () => {
    readAccessQuery.mockResolvedValue("denied");
    const res = await get("Editor");
    expect(res.status).toBe(403);
    expect(readAccessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 42);
    expect(workQuery).not.toHaveBeenCalled();
  });

  it("lets an Auditor who can read the use case have it", async () => {
    workQuery.mockResolvedValue({ fria: false, ce_marking: false });
    const res = await get("Auditor");
    expect(res.status).toBe(200);
  });

  it("answers 404 for a use case in another organization", async () => {
    readAccessQuery.mockResolvedValue("not_found");
    workQuery.mockResolvedValue(null);
    const res = await get("Admin", "7");
    expect(res.status).toBe(404);
    expect(workQuery).toHaveBeenCalledWith(12, 7);
  });

  it("returns the two flags, scoped to the caller's organization", async () => {
    workQuery.mockResolvedValue({ fria: true, ce_marking: false });
    const res = await get("Editor", "7");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ fria: true, ce_marking: false });
    expect(workQuery).toHaveBeenCalledWith(12, 7);
  });

  it("answers 500 when the query fails", async () => {
    workQuery.mockRejectedValue(new Error("db down"));
    expect((await get()).status).toBe(500);
  });
});
