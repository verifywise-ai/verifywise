import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = "Editor";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../modelLifecycle.service", () => ({
  detachFile: jest.fn(async () => true),
  attachFile: jest.fn(),
  deletePhase: jest.fn(),
  deleteItem: jest.fn(),
  removeApprover: jest.fn(),
  createItem: jest.fn(),
  updatePhase: jest.fn(),
  removePerson: jest.fn(),
  updateApprovalStatus: jest.fn(),
}));

import * as svc from "../modelLifecycle.service";
import lifecycleRoutes from "../modelLifecycle.route";

const app = express();
app.use(express.json());
app.use("/api/extensions/model-lifecycle", lifecycleRoutes);

const detachPath = (id: string, itemId: string, fileId: string) =>
  `/api/extensions/model-lifecycle/models/${id}/lifecycle/items/${itemId}/files/${fileId}`;

describe("DELETE .../lifecycle/items/:itemId/files/:fileId validation", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["a non-numeric model id", "abc", "20", "99"],
    ["a non-numeric item id", "10", "abc", "99"],
    ["a non-numeric file id", "10", "20", "abc"],
    ["a zero file id", "10", "20", "0"],
    ["a file id beyond INTEGER", "10", "20", "2147483648"],
  ])("answers 400 for %s and detaches nothing", async (_label, id, itemId, fileId) => {
    const res = await request(app).delete(detachPath(id, itemId, fileId));

    expect(res.status).toBe(400);
    expect(svc.detachFile).not.toHaveBeenCalled();
  });

  it("passes valid ids to the service", async () => {
    const res = await request(app).delete(detachPath("10", "20", "99"));

    expect(res.status).toBe(200);
    expect(svc.detachFile).toHaveBeenCalledWith(42, 10, 20, 99, 9);
  });
});

// The bound used to cover only the detach route; its siblings sent an
// oversized id to Postgres and answered 500.
describe("id bounds on every lifecycle route", () => {
  beforeEach(() => jest.clearAllMocks());

  const base = "/api/extensions/model-lifecycle";
  const tooBig = "2147483648";

  it.each([
    ["attach (model id)", "post", `${base}/models/${tooBig}/lifecycle/items/1/files`, "attachFile"],
    ["attach (item id)", "post", `${base}/models/1/lifecycle/items/${tooBig}/files`, "attachFile"],
    ["phase delete", "delete", `${base}/phases/${tooBig}`, "deletePhase"],
    ["item delete", "delete", `${base}/items/abc`, "deleteItem"],
    [
      "approver removal (user id)",
      "delete",
      `${base}/models/1/lifecycle/items/1/approvals/${tooBig}`,
      "removeApprover",
    ],
    ["phase update", "put", `${base}/phases/${tooBig}`, "updatePhase"],
    ["item create (phase id)", "post", `${base}/phases/${tooBig}/items`, "createItem"],
    [
      "person removal (user id)",
      "delete",
      `${base}/models/1/lifecycle/items/1/people/${tooBig}`,
      "removePerson",
    ],
    [
      "approval status (user id)",
      "put",
      `${base}/models/1/lifecycle/items/1/approvals/${tooBig}`,
      "updateApprovalStatus",
    ],
  ] as const)("answers 400 for %s and calls nothing", async (_label, method, path, fn) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(400);
    expect((svc as any)[fn]).not.toHaveBeenCalled();
  });
});

describe("POST .../lifecycle/items/:itemId/files body", () => {
  beforeEach(() => jest.clearAllMocks());

  const attachPath = "/api/extensions/model-lifecycle/models/1/lifecycle/items/2/files";

  it.each([
    ["a missing file id", {}],
    ["a non-numeric file id", { fileId: "abc" }],
    ["a negative file id", { fileId: -1 }],
    ["a file id beyond INTEGER", { fileId: 2147483648 }],
  ])("answers 400 for %s and attaches nothing", async (_label, body) => {
    const res = await request(app).post(attachPath).send(body);

    expect(res.status).toBe(400);
    expect(svc.attachFile).not.toHaveBeenCalled();
  });

  it("answers 404 when the file is not in the organization", async () => {
    (svc.attachFile as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app).post(attachPath).send({ fileId: 99 });

    expect(res.status).toBe(404);
    expect(svc.attachFile).toHaveBeenCalledWith(42, 1, 2, 9, 99);
  });
});
