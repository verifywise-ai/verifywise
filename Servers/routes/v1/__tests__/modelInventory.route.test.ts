import request from "supertest";
import express from "express";

// No Authorization header is a 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(async (req: any) => req.role !== "Auditor"),
}));
jest.mock("../../../utils/project.utils", () => ({
  ...jest.requireActual("../../../utils/project.utils"),
  getProjectAccessQuery: jest.fn(async () => "denied"),
  getProjectReadAccessQuery: jest.fn(async () => "denied"),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
  logRollbackFailure: jest.fn(async () => undefined),
}));
const mockCreate = jest.fn((_req: any, res: any) => res.status(201).json({}));
const mockUpdate = jest.fn((_req: any, res: any) => res.status(200).json({}));
const mockByProject = jest.fn((_req: any, res: any) => res.status(200).json([]));
jest.mock("../../../controllers/modelInventory.ctrl", () => ({
  createNewModelInventoryV1: (req: any, res: any) => mockCreate(req, res),
  updateModelInventoryByIdV1: (req: any, res: any) => mockUpdate(req, res),
  getModelByProjectId: (req: any, res: any) => mockByProject(req, res),
}));

import routes from "../modelInventory.route";

const app = express();
app.use(express.json());
app.use("/api/v1/model-inventory", routes);

describe("/api/v1/model-inventory", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["get", "/api/v1/model-inventory/by-project/3"],
    ["post", "/api/v1/model-inventory"],
    ["patch", "/api/v1/model-inventory/5"],
  ])("%s %s needs authentication", async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each([
    ["post", "/api/v1/model-inventory"],
    ["patch", "/api/v1/model-inventory/5"],
  ])("%s %s refuses a role without model.edit", async (method, path) => {
    const res = await (request(app) as any)
      [method](path)
      .set("authorization", "Bearer x")
      .set("x-role", "Auditor")
      .send({});
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses the model list of a use case the caller cannot open", async () => {
    const res = await request(app)
      .get("/api/v1/model-inventory/by-project/3")
      .set("authorization", "Bearer x")
      .set("x-role", "Editor");
    expect(res.status).toBe(403);
    expect(mockByProject).not.toHaveBeenCalled();
  });

  it("refuses a malformed use case id", async () => {
    const res = await request(app)
      .get("/api/v1/model-inventory/by-project/3abc")
      .set("authorization", "Bearer x");
    expect(res.status).toBe(400);
  });
});
