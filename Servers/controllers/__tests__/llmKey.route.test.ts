import request from "supertest";
import express from "express";
import llmKeyRoutes from "../../routes/llmKey.route";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Back the route guard with the real static built-in matrix (no DB) so these
// tests assert the actual RBAC semantics for built-in roles.
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false,
}));

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] || "Editor";
    // i18nMiddleware runs before accessControl.middleware in the real stack.
    req.t = (key: string) => key;
    next();
  },
}));

jest.mock("../llmKey.ctrl", () => ({
  createLLMKey: (_req: any, res: any) => res.status(201).json({ ok: true }),
  updateLLMKey: (_req: any, res: any) => res.status(200).json({ ok: true }),
  deleteLLMKey: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getLLMKey: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getLLMKeys: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getLLMKeyStatus: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/api/llm-keys", llmKeyRoutes);

const writes: Array<[string, (r: ReturnType<typeof request>) => request.Test]> = [
  ["POST /", (r) => r.post("/api/llm-keys").send({ name: "OpenAI", key: "sk-test" })],
  ["PATCH /:id", (r) => r.patch("/api/llm-keys/1").send({ key: "sk-new" })],
  ["DELETE /:id", (r) => r.delete("/api/llm-keys/1")],
];

describe("llm-keys route guards", () => {
  describe.each(["Editor", "Reviewer", "Auditor"])("%s", (role) => {
    it.each(writes)("is refused on %s", async (_label, send) => {
      const res = await send(request(app)).set("x-test-role", role);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Forbidden");
      expect(res.body.data).toBe("Access denied");
    });
  });

  it.each(writes)("allows an Admin on %s", async (_label, send) => {
    const res = await send(request(app)).set("x-test-role", "Admin");
    expect([200, 201]).toContain(res.status);
  });

  it.each(["/api/llm-keys", "/api/llm-keys/status", "/api/llm-keys/OpenAI"])(
    "leaves read endpoint %s open to an Auditor",
    async (path) => {
      const res = await request(app).get(path).set("x-test-role", "Auditor");
      expect(res.status).toBe(200);
    },
  );
});
