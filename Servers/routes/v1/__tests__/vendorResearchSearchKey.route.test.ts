import request from "supertest";
import express from "express";

// The search routes of the vendor research under /api/v1: the search status and the organization's
// Brave Search key (read, save, remove). Each needs a token (401 without one) and llmKeys.admin
// (403 for the built-in roles that do not manage the LLM keys), and each answers for the
// organization of the token, never one the request names. The database side of the tenant
// isolation is in tests/integration/vendor-research-settings.test.ts.

// The token decides who and which organization: x-role / x-org stand in for its claims; no
// Authorization header is a 401, as with the real middleware.
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
// Every handler answers with the organization it was given, so the tests can see whose data it is.
jest.mock("../../../controllers/vendorResearch.ctrl", () => {
  const answer = (name: string) =>
    jest.fn((req: any, res: any) =>
      res.status(200).json({ handler: name, org: req.organizationId }),
    );
  return {
    getResearchConfig: answer("getResearchConfig"),
    getDecisionStats: answer("getDecisionStats"),
    getResearchSettings: answer("getResearchSettings"),
    saveResearchSettings: answer("saveResearchSettings"),
    getResearchSearchStatus: answer("getResearchSearchStatus"),
    getResearchSearchKey: answer("getResearchSearchKey"),
    saveResearchSearchKey: answer("saveResearchSearchKey"),
    deleteResearchSearchKey: answer("deleteResearchSearchKey"),
  };
});
// authorize("llmKeys.admin") runs the real permission matrix for the built-in roles.
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(async () => []) },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../vendorResearch.route";
import {
  deleteResearchSearchKey,
  getResearchSearchKey,
  getResearchSearchStatus,
  saveResearchSearchKey,
} from "../../../controllers/vendorResearch.ctrl";

const app = express();
app.use(express.json());
app.use("/api/v1/vendor-research", routes);

const BASE = "/api/v1/vendor-research";

type Method = "get" | "put" | "delete";
const ROUTES: Array<[Method, string, jest.Mock, string]> = [
  ["get", "/search-status", getResearchSearchStatus as jest.Mock, "getResearchSearchStatus"],
  ["get", "/search-key", getResearchSearchKey as jest.Mock, "getResearchSearchKey"],
  ["put", "/search-key", saveResearchSearchKey as jest.Mock, "saveResearchSearchKey"],
  ["delete", "/search-key", deleteResearchSearchKey as jest.Mock, "deleteResearchSearchKey"],
];

const send = (method: Method, path: string) => {
  const req = request(app)[method](`${BASE}${path}`);
  return method === "put" ? req.send({ key: "BSAexampleKey00000000" }) : req;
};

describe("/api/v1/vendor-research search routes", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(ROUTES)("%s %s answers 401 without a token", async (method, path, handler) => {
    const res = await send(method, path);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  describe.each(["Editor", "Reviewer", "Auditor"])("for an %s", (role) => {
    it.each(ROUTES)("%s %s answers 403", async (method, path, handler) => {
      const res = await send(method, path).set("Authorization", "Bearer t").set("x-role", role);
      expect(res.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it.each(ROUTES)(
    "%s %s reaches its handler for an Admin, for the organization of the token",
    async (method, path, handler, name) => {
      const res = await send(method, path)
        .set("Authorization", "Bearer t")
        .set("x-role", "Admin")
        .set("x-org", "7");
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(res.body).toEqual({ handler: name, org: 7 });
    },
  );

  it("answers for the organization of the token, not one the request names", async () => {
    const res = await request(app)
      .put(`${BASE}/search-key?organizationId=99`)
      .set("Authorization", "Bearer t")
      .set("x-org", "7")
      .send({ key: "BSAexampleKey00000000", organizationId: 99 });
    expect(res.status).toBe(200);
    expect(res.body.org).toBe(7);
  });
});
