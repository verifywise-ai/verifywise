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
}));
jest.mock("../../../utils/risk.utils", () => ({
  ...jest.requireActual("../../../utils/risk.utils"),
  getRisksLinkedOnlyToProjectQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../projects.route";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../../../utils/project.utils";
import { getRisksLinkedOnlyToProjectQuery } from "../../../utils/risk.utils";

const accessQuery = getProjectAccessQuery as jest.Mock;
const readAccessQuery = getProjectReadAccessQuery as jest.Mock;
const risksQuery = getRisksLinkedOnlyToProjectQuery as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/projects", routes);

const ROUTE = "/api/v1/projects/12/risks-linked-only-here";

describe("GET /api/v1/projects/:id/risks-linked-only-here", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessQuery.mockResolvedValue("allowed");
    readAccessQuery.mockResolvedValue("allowed");
  });

  it("answers 401 without a token", async () => {
    expect((await request(app).get(ROUTE)).status).toBe(401);
    expect(risksQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("refuses a %s, who cannot delete a use case", async (role) => {
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t").set("x-role", role);
    expect(res.status).toBe(403);
    expect(risksQuery).not.toHaveBeenCalled();
  });

  it("applies the delete route's write rule, not the read rule", async () => {
    accessQuery.mockResolvedValue("denied");
    const res = await request(app)
      .get(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor");
    expect(res.status).toBe(403);
    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 9, role: "Editor" }, 42);
    expect(readAccessQuery).not.toHaveBeenCalled();
    expect(risksQuery).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a positive integer", async () => {
    const res = await request(app)
      .get("/api/v1/projects/abc/risks-linked-only-here")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(400);
    expect(risksQuery).not.toHaveBeenCalled();
  });

  it("returns the count and the risks, scoped to the caller's organization", async () => {
    risksQuery.mockResolvedValue([
      { id: 3, risk_name: "Bias" },
      { id: 5, risk_name: "Drift" },
    ]);
    const res = await request(app)
      .get(ROUTE)
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      count: 2,
      risks: [
        { id: 3, risk_name: "Bias" },
        { id: 5, risk_name: "Drift" },
      ],
    });
    expect(risksQuery).toHaveBeenCalledWith(12, 7);
  });

  it("answers 404 for a use case outside the organization", async () => {
    risksQuery.mockResolvedValue(null);
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(404);
  });

  it("answers 500 when the query fails", async () => {
    risksQuery.mockRejectedValue(new Error("db down"));
    const res = await request(app).get(ROUTE).set("Authorization", "Bearer t");
    expect(res.status).toBe(500);
  });
});
