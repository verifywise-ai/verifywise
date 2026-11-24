/**
 * /api/v1/llm-keys: the writes that check a key before saving. Auth (401),
 * the llmKeys.admin guard (403), the organization from the token, the happy
 * path, and parity: the legacy /api/llm-keys writes stay on the unchecked
 * handlers.
 */
import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

jest.mock("../../../utils/rolePermissions.utils", () => {
  const roleHasPermission = async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  return {
    roleHasPermission,
    requestHasPermission: async (req: any, key: string) =>
      roleHasPermission(req.organizationId ?? null, req.role, key),
  };
});

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

const calls: Array<{ handler: string; organizationId: number; body: unknown }> = [];
jest.mock("../../../controllers/llmKey.ctrl", () => {
  const record = (handler: string, status: number) => (req: any, res: any) => {
    calls.push({ handler, organizationId: req.organizationId, body: req.body });
    res.status(status).json({ handler });
  };
  return {
    createLLMKeyV1: record("createLLMKeyV1", 201),
    updateLLMKeyV1: record("updateLLMKeyV1", 200),
    createLLMKey: record("createLLMKey", 201),
    updateLLMKey: record("updateLLMKey", 200),
    deleteLLMKey: record("deleteLLMKey", 200),
    getLLMKey: record("getLLMKey", 200),
    getLLMKeys: record("getLLMKeys", 200),
    getLLMKeyStatus: record("getLLMKeyStatus", 200),
  };
});

import v1Routes from "../llmKeys.route";
import legacyRoutes from "../../llmKey.route";

const app = express();
app.use(express.json());
app.use("/api/v1/llm-keys", v1Routes);
app.use("/api/llm-keys", legacyRoutes);

const body = { name: "OpenAI", key: "sk-test", model: "gpt-4o" };

describe("/api/v1/llm-keys", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each([
    ["POST /", (r: any) => r.post("/api/v1/llm-keys").send(body)],
    ["PATCH /:id", (r: any) => r.patch("/api/v1/llm-keys/1").send(body)],
  ])("needs a token on %s", async (_label, send) => {
    const res = await send(request(app));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  describe.each(["Editor", "Reviewer", "Auditor"])("%s", (role) => {
    it.each([
      ["POST /", (r: any) => r.post("/api/v1/llm-keys").send(body)],
      ["PATCH /:id", (r: any) => r.patch("/api/v1/llm-keys/1").send(body)],
    ])("is refused on %s", async (_label, send) => {
      const res = await send(request(app)).set("authorization", "Bearer t").set("x-role", role);
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    });
  });

  it("lets an Admin create through the checking handler, in the token's organization", async () => {
    const res = await request(app)
      .post("/api/v1/llm-keys")
      .set("authorization", "Bearer t")
      .set("x-org", "5")
      .send({ ...body, skip_verification: true });
    expect(res.status).toBe(201);
    expect(calls).toEqual([
      { handler: "createLLMKeyV1", organizationId: 5, body: { ...body, skip_verification: true } },
    ]);
  });

  it("lets an Admin update through the checking handler, in the token's organization", async () => {
    const res = await request(app)
      .patch("/api/v1/llm-keys/3")
      .set("authorization", "Bearer t")
      .set("x-org", "6")
      .send(body);
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ handler: "updateLLMKeyV1", organizationId: 6 });
  });

  it("serves no reads or delete: those did not change and stay on /api/llm-keys", async () => {
    const list = await request(app).get("/api/v1/llm-keys").set("authorization", "Bearer t");
    const del = await request(app).delete("/api/v1/llm-keys/1").set("authorization", "Bearer t");
    expect(list.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it("keeps the legacy writes on the unchecked handlers (parity)", async () => {
    await request(app).post("/api/llm-keys").set("authorization", "Bearer t").send(body);
    await request(app).patch("/api/llm-keys/1").set("authorization", "Bearer t").send(body);
    expect(calls.map((c) => c.handler)).toEqual(["createLLMKey", "updateLLMKey"]);
  });
});
