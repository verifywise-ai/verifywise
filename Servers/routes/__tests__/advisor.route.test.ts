/**
 * Route-level authorization tests for GET /api/advisor/tools/roadmap.
 *
 * Verifies that role isolation is enforced server-side by the middleware
 * chain (authenticateJWT -> authorize(ADVISOR_ROADMAP_READ_ROLES)), not
 * merely hidden in the UI. authenticateJWT is mocked to inject a role from
 * the `x-test-role` header so the real `authorize` middleware decides.
 */

import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock the heavy module graph pulled in via advisor.ctrl.ts so the router
// loads without a database, LLM provider, or Redis.
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(),
    query: jest.fn(),
  },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../advisor/aiSdkAgent", () => ({
  streamAdvisorAiSdk: jest.fn(),
  runAdvisorAiSdk: jest.fn(),
  getStreamTextResult: jest.fn(),
}));
jest.mock("../../advisor/orchestrator", () => ({
  orchestrate: jest.fn(),
}));
jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(),
}));
jest.mock("../../utils/advisorConversation.utils", () => ({
  listConversationsQuery: jest.fn(),
  getConversationByIdQuery: jest.fn(),
  createConversationQuery: jest.fn(),
  updateConversationMessagesQuery: jest.fn(),
  deleteConversationQuery: jest.fn(),
}));
jest.mock("../../advisor/memory/memoryService", () => ({
  clearAgentMemory: jest.fn(),
  clearSession: jest.fn(),
  clearUserMemory: jest.fn(),
  getUserMemorySummary: jest.fn(),
  getAgentMessages: jest.fn(),
}));

// Replace JWT verification with a test double that trusts the x-test-role
// header; the real authorize middleware (the unit under test) still runs.
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    const role = req.headers["x-test-role"];
    if (typeof role === "string" && role.length > 0) {
      req.role = role;
      req.userId = 1;
      req.organizationId = 1;
    }
    next();
  },
}));

import advisorRouter from "../advisor.route";
import { ADVISOR_ROADMAP_READ_ROLES } from "../../advisor/roadmap/roadmapService";

const app = express();
app.use(express.json());
// authorize() translates its denial messages via req.t.
app.use((req: any, _res, next) => {
  req.t = (key: string) => key;
  next();
});
app.use("/api/advisor", advisorRouter);

describe("GET /api/advisor/tools/roadmap authorization", () => {
  it.each(ADVISOR_ROADMAP_READ_ROLES)("allows role %s (200)", async (role) => {
    const res = await request(app).get("/api/advisor/tools/roadmap").set("x-test-role", role);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OK");
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.tools).toHaveLength(265);
  });

  it.each(["Viewer", "SuperAdmin", "user", ""])(
    "rejects disallowed role '%s' (401 without a role, 403 otherwise)",
    async (role) => {
      const reqBuilder = request(app).get("/api/advisor/tools/roadmap");
      if (role) reqBuilder.set("x-test-role", role);
      const res = await reqBuilder;
      expect(res.status).toBe(role ? 403 : 401);
      // The roadmap payload must not be present on rejections.
      expect(res.body.message).not.toBe("OK");
      expect(res.body.data?.tools).toBeUndefined();
    },
  );

  it("only allows exactly the four intended roles", () => {
    expect([...ADVISOR_ROADMAP_READ_ROLES].sort()).toEqual([
      "Admin",
      "Auditor",
      "Editor",
      "Reviewer",
    ]);
  });

  it("exposes no write-action implementation details over HTTP", async () => {
    const res = await request(app).get("/api/advisor/tools/roadmap").set("x-test-role", "Auditor");
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    for (const key of [
      "schema",
      "parameters",
      "toolDefinition",
      "handler",
      "execute",
      "input_params",
      "inputParams",
    ]) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });
});
