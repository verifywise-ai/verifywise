import request from "supertest";
import express from "express";

// The role comes from the x-role header so one app can walk the role matrix;
// Editor is the default so the id-validation tests below keep their caller.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-role"] ?? "Editor";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: () => (_req: any, _res: any, next: any) => next(),
}));
// Built-in roles resolve against the static permission matrix, so authorize()
// runs for real; only the roles table lookup is stubbed.
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
jest.mock("../modelLifecycle.service", () => ({
  listPhases: jest.fn(async () => []),
  createPhase: jest.fn(async () => ({})),
  updatePhase: jest.fn(),
  deletePhase: jest.fn(),
  reorderPhases: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(async () => ({})),
  deleteItem: jest.fn(),
  reorderItems: jest.fn(),
  getLifecycleForModel: jest.fn(async () => []),
  getProgressForModel: jest.fn(async () => ({})),
  upsertValue: jest.fn(async () => ({})),
  detachFile: jest.fn(async () => true),
  attachFile: jest.fn(),
  addPerson: jest.fn(async () => ({})),
  removePerson: jest.fn(),
  addApprover: jest.fn(async () => ({})),
  removeApprover: jest.fn(),
  updateApprovalStatus: jest.fn(),
  modelInOrganization: jest.fn(async () => true),
  itemInOrganization: jest.fn(async () => true),
}));

import * as svc from "../modelLifecycle.service";
import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";
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

describe("role checks on lifecycle routes", () => {
  beforeEach(() => jest.clearAllMocks());

  const base = "/api/extensions/model-lifecycle";
  const item = `${base}/models/1/lifecycle/items/2`;

  type Method = "get" | "post" | "put" | "delete";
  type Route = readonly [label: string, method: Method, path: string, fn: string, body?: object];

  // Lifecycle setup: phases and items. extension.admin (Admin only).
  const configWrites: Route[] = [
    ["phase create", "post", `${base}/phases`, "createPhase", { name: "Build" }],
    ["phase reorder", "put", `${base}/phases/reorder`, "reorderPhases", { orderedIds: [2, 1] }],
    ["phase update", "put", `${base}/phases/3`, "updatePhase", { name: "Run" }],
    ["phase delete", "delete", `${base}/phases/3`, "deletePhase"],
    ["item create", "post", `${base}/phases/3/items`, "createItem", { name: "Owner" }],
    [
      "item reorder",
      "put",
      `${base}/phases/3/items/reorder`,
      "reorderItems",
      { orderedIds: [2, 1] },
    ],
    ["item update", "put", `${base}/items/4`, "updateItem", { name: "Owner" }],
    ["item delete", "delete", `${base}/items/4`, "deleteItem"],
  ];

  // Per-model answers, files, people and approvers. model.edit (Admin, Editor).
  const modelWrites: Route[] = [
    ["value upsert", "put", item, "upsertValue", { value_text: "x" }],
    ["file attach", "post", `${item}/files`, "attachFile", { fileId: 5 }],
    ["file detach", "delete", `${item}/files/5`, "detachFile"],
    ["person add", "post", `${item}/people`, "addPerson", { userId: 3 }],
    ["person remove", "delete", `${item}/people/3`, "removePerson"],
    ["approver add", "post", `${item}/approvals`, "addApprover", { userId: 3 }],
    ["approver remove", "delete", `${item}/approvals/3`, "removeApprover"],
  ];

  // Reads stay open to every member.
  const reads: Route[] = [
    ["config read", "get", `${base}/config`, "listPhases"],
    ["lifecycle read", "get", `${base}/models/1/lifecycle`, "getLifecycleForModel"],
    ["progress read", "get", `${base}/models/1/lifecycle/progress`, "getProgressForModel"],
  ];

  const send = (role: string, [, method, path, , body]: Route) => {
    const req = request(app)[method](path).set("x-role", role);
    return body ? req.send(body) : req;
  };

  const denied = (roles: string[], routes: Route[]) =>
    roles.flatMap((role) => routes.map((route) => [role, route[0], route] as const));

  it.each(denied(["Editor", "Reviewer", "Auditor"], configWrites))(
    "answers 403 to %s on %s and changes nothing",
    async (role, _label, route) => {
      const res = await send(role, route);

      expect(res.status).toBe(403);
      expect((svc as any)[route[3]]).not.toHaveBeenCalled();
    },
  );

  it.each(configWrites.map((route) => [route[0], route] as const))(
    "lets an Admin through on %s",
    async (_label, route) => {
      const res = await send("Admin", route);

      expect(res.status).not.toBe(403);
      expect((svc as any)[route[3]]).toHaveBeenCalled();
    },
  );

  it.each(denied(["Reviewer", "Auditor"], modelWrites))(
    "answers 403 to %s on %s and changes nothing",
    async (role, _label, route) => {
      const res = await send(role, route);

      expect(res.status).toBe(403);
      expect((svc as any)[route[3]]).not.toHaveBeenCalled();
    },
  );

  it.each(
    ["Admin", "Editor"].flatMap((role) =>
      modelWrites.map((route) => [role, route[0], route] as const),
    ),
  )("lets %s through on %s", async (role, _label, route) => {
    const res = await send(role, route);

    expect(res.status).not.toBe(403);
    expect((svc as any)[route[3]]).toHaveBeenCalled();
  });

  it.each(
    ["Admin", "Editor", "Reviewer", "Auditor"].flatMap((role) =>
      reads.map((route) => [role, route[0], route] as const),
    ),
  )("lets %s through on %s", async (role, _label, route) => {
    const res = await send(role, route);

    expect(res.status).toBe(200);
    expect((svc as any)[route[3]]).toHaveBeenCalled();
  });

  describe("approval decisions", () => {
    const decide = (role: string, userId: number) =>
      request(app)
        .put(`${item}/approvals/${userId}`)
        .set("x-role", role)
        .send({ status: "approved" });

    it.each(["Admin", "Editor", "Reviewer", "Auditor"])(
      "lets a %s record a decision on their own approval row",
      async (role) => {
        (svc.updateApprovalStatus as jest.Mock).mockResolvedValueOnce({ id: 1 });

        const res = await decide(role, 9);

        expect(res.status).toBe(200);
        expect(svc.updateApprovalStatus).toHaveBeenCalledWith(42, 1, 2, 9, "approved", 9);
      },
    );

    it.each(["Admin", "Editor", "Reviewer", "Auditor"])(
      "answers 403 to a %s deciding for another approver",
      async (role) => {
        const res = await decide(role, 10);

        expect(res.status).toBe(403);
        expect(svc.updateApprovalStatus).not.toHaveBeenCalled();
      },
    );
  });
});

// A model or item id from another organization (or no organization) must
// answer 404 before any read or write, never reach the service, and never
// surface the foreign-key error as a 500.
describe("same-organization model and item ids", () => {
  beforeEach(() => jest.clearAllMocks());

  const base = "/api/extensions/model-lifecycle";
  const item = `${base}/models/1/lifecycle/items/2`;

  type Method = "get" | "post" | "put" | "delete";
  type Route = readonly [label: string, method: Method, path: string, fn: string, body?: object];

  const itemRoutes: Route[] = [
    ["value upsert", "put", item, "upsertValue", { value_text: "x" }],
    ["file attach", "post", `${item}/files`, "attachFile", { fileId: 5 }],
    ["file detach", "delete", `${item}/files/5`, "detachFile"],
    ["person add", "post", `${item}/people`, "addPerson", { userId: 3 }],
    ["person remove", "delete", `${item}/people/3`, "removePerson"],
    ["approver add", "post", `${item}/approvals`, "addApprover", { userId: 3 }],
    ["approver remove", "delete", `${item}/approvals/3`, "removeApprover"],
    // The caller is user 9, so this reaches the service when ids are in scope.
    [
      "approval decision",
      "put",
      `${item}/approvals/9`,
      "updateApprovalStatus",
      { status: "approved" },
    ],
  ];
  const modelRoutes: Route[] = [
    ["lifecycle read", "get", `${base}/models/1/lifecycle`, "getLifecycleForModel"],
    ["progress read", "get", `${base}/models/1/lifecycle/progress`, "getProgressForModel"],
    ...itemRoutes,
  ];

  const send = ([, method, path, , body]: Route) => {
    const req = request(app)[method](path).set("x-role", "Admin");
    return body ? req.send(body) : req;
  };

  it.each(modelRoutes.map((route) => [route[0], route] as const))(
    "answers 404 on %s when the model is not in the organization",
    async (_label, route) => {
      (svc.modelInOrganization as jest.Mock).mockResolvedValueOnce(false);

      const res = await send(route);

      expect(res.status).toBe(404);
      expect(res.body.data).toBe("Model not found");
      expect(svc.modelInOrganization).toHaveBeenCalledWith(42, 1);
      expect((svc as any)[route[3]]).not.toHaveBeenCalled();
    },
  );

  it.each(itemRoutes.map((route) => [route[0], route] as const))(
    "answers 404 on %s when the item is not in the organization",
    async (_label, route) => {
      (svc.itemInOrganization as jest.Mock).mockResolvedValueOnce(false);

      const res = await send(route);

      expect(res.status).toBe(404);
      expect(res.body.data).toBe("Lifecycle item not found");
      expect(svc.itemInOrganization).toHaveBeenCalledWith(42, 2);
      expect((svc as any)[route[3]]).not.toHaveBeenCalled();
    },
  );

  it("checks the model once per request on an item route", async () => {
    await send(itemRoutes[0]);

    expect(svc.modelInOrganization).toHaveBeenCalledTimes(1);
    expect(svc.itemInOrganization).toHaveBeenCalledTimes(1);
    expect(svc.upsertValue).toHaveBeenCalled();
  });

  it("leaves the setup routes alone", async () => {
    await request(app).get(`${base}/config`).set("x-role", "Admin");
    await request(app).put(`${base}/items/4`).set("x-role", "Admin").send({ name: "Owner" });

    expect(svc.modelInOrganization).not.toHaveBeenCalled();
    expect(svc.itemInOrganization).not.toHaveBeenCalled();
  });

  it("answers 400 when a person is not a member of the organization", async () => {
    (svc.addPerson as jest.Mock).mockRejectedValueOnce(
      new ValidationException("Every person must be a member of this organization", "userId", 3),
    );

    const res = await send(itemRoutes[3]);

    expect(res.status).toBe(400);
    expect(res.body.data).toBe("Every person must be a member of this organization");
  });

  it("answers 400 when an approver is not a member of the organization", async () => {
    (svc.addApprover as jest.Mock).mockRejectedValueOnce(
      new ValidationException("Every approver must be a member of this organization", "userId", 3),
    );

    const res = await send(itemRoutes[5]);

    expect(res.status).toBe(400);
    expect(res.body.data).toBe("Every approver must be a member of this organization");
  });
});
