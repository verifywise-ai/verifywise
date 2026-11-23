import request from "supertest";
import express from "express";

// x-role stands in for the token's role; no Authorization header is a 401.
jest.mock("../../middleware/auth.middleware", () => ({
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
jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../controllers/aiApprovalRules.ctrl", () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    listRulesCtrl: jest.fn(ok),
    createRuleCtrl: jest.fn(ok),
    updateRuleCtrl: jest.fn(ok),
    deleteRuleCtrl: jest.fn(ok),
    testRuleCtrl: jest.fn(ok),
  };
});

import routes from "../aiApprovalRules.route";
import * as controllers from "../../controllers/aiApprovalRules.ctrl";

const app = express();
app.use(express.json());
app.use("/api/ai-approval-rules", routes);

const send = (method: "post" | "put" | "delete", path: string, role: string) =>
  request(app)
    [method](`/api/ai-approval-rules${path}`)
    .set("Authorization", "Bearer t")
    .set("x-role", role);

const writes: ["post" | "put" | "delete", string, jest.Mock][] = [
  ["post", "/", controllers.createRuleCtrl as jest.Mock],
  ["put", "/3", controllers.updateRuleCtrl as jest.Mock],
  ["delete", "/3", controllers.deleteRuleCtrl as jest.Mock],
];

describe("/api/ai-approval-rules writes need aiConfirmation.admin", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(writes)("%s %s answers 401 without a token", async (method, path, ctrl) => {
    expect((await request(app)[method](`/api/ai-approval-rules${path}`)).status).toBe(401);
    expect(ctrl).not.toHaveBeenCalled();
  });

  it.each(["Auditor", "Editor", "Reviewer"])(
    "refuses a %s on every write, so a rule can't be overridden from below",
    async (role) => {
      for (const [method, path, ctrl] of writes) {
        expect((await send(method, path, role)).status).toBe(403);
        expect(ctrl).not.toHaveBeenCalled();
      }
    },
  );

  it.each(writes)("%s %s lets an Admin through", async (method, path, ctrl) => {
    expect((await send(method, path, "Admin")).status).toBe(200);
    expect(ctrl).toHaveBeenCalled();
  });

  it("keeps listing and the dry run open to signed-in users", async () => {
    const list = await request(app)
      .get("/api/ai-approval-rules")
      .set("Authorization", "Bearer t")
      .set("x-role", "Auditor");
    expect(list.status).toBe(200);
    expect((await send("post", "/test", "Auditor")).status).toBe(200);
  });
});
