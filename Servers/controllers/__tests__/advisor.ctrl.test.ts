import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the heavy module graph pulled in by advisor.ctrl.ts so the controller
// can be unit-tested without a database, LLM provider, or Redis.
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

// Keep the real roadmapService (pure function over the static manifest) but
// wrap buildToolsRoadmap so the error path can be forced.
jest.mock("../../advisor/roadmap/roadmapService", () => {
  const actual = jest.requireActual("../../advisor/roadmap/roadmapService") as any;
  return { ...actual, buildToolsRoadmap: jest.fn(actual.buildToolsRoadmap) };
});

import { getToolsRoadmap, availableTools } from "../advisor.ctrl";
import { buildToolsRoadmap } from "../../advisor/roadmap/roadmapService";
import { ROADMAP_MANIFEST } from "../../advisor/roadmap/manifest";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockedBuild = buildToolsRoadmap as jest.Mock;

describe("advisor.ctrl getToolsRoadmap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with the versioned roadmap envelope", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await getToolsRoadmap(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toBe("OK");
    const data = payload.data;
    expect(data.version).toBe(1);
    expect(typeof data.generatedAt).toBe("string");
    expect(data.sources).toEqual({
      plan: "AI Implementation Plan.md",
      catalog: "tool_list_.md",
      plannedTotal: 263,
      manifestEntries: 265,
    });
    expect(data.summary).toMatchObject({
      planned: 265,
      extraImplemented: expect.any(Number),
      percentComplete: expect.any(Number),
    });
    expect(Array.isArray(data.domains)).toBe(true);
    expect(Array.isArray(data.phases)).toBe(true);
    expect(Array.isArray(data.tools)).toBe(true);
    expect(Array.isArray(data.extraTools)).toBe(true);
    expect(data.tools).toHaveLength(265);
  });

  it("derives implemented status from the live tool registry keys", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await getToolsRoadmap(req as any, res as any);
    const data = res.json.mock.calls[0][0].data;

    const byName = new Map(data.tools.map((t: any) => [t.name, t]));
    // Every catalogued tool that exists in the live registry must read as
    // implemented — spot-check both a legacy read tool and a write tool.
    expect(Object.keys(availableTools)).toContain("fetch_risks");
    expect(byName.get("fetch_risks").status).toBe("implemented");
    expect(byName.get("agent_create_risk").status).toBe("implemented");
    // The native generate_chart tool has no filer entry but is implemented.
    expect(byName.get("generate_chart").status).toBe("implemented");
    // The known plan/code rename is surfaced, not silently resolved.
    expect(byName.get("agent_update_finding_governance")).toMatchObject({
      status: "renamed",
      implementedAs: "agent_update_finding_governance_status",
    });
    // Sanity: statuses only come from the closed set.
    for (const tool of data.tools) {
      expect(["implemented", "planned", "renamed"]).toContain(tool.status);
      expect(tool).toMatchObject({
        name: expect.any(String),
        domain: expect.any(String),
        category: expect.any(String),
        phase: expect.any(Number),
        kind: expect.stringMatching(/^(read|write)$/),
      });
    }
  });

  it("never leaks write-tool implementation details", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await getToolsRoadmap(req as any, res as any);
    const data = res.json.mock.calls[0][0].data;

    const forbiddenKeys = [
      "schema",
      "parameters",
      "toolDefinition",
      "handler",
      "execute",
      "file",
      "input_params",
      "inputParams",
    ];
    const scan = (value: any) => {
      if (Array.isArray(value)) return value.forEach(scan);
      if (value && typeof value === "object") {
        for (const key of Object.keys(value)) {
          expect(forbiddenKeys).not.toContain(key);
          scan(value[key]);
        }
      }
    };
    scan(data);

    // Extras are names only.
    for (const extra of data.extraTools) {
      expect(Object.keys(extra).sort()).toEqual(["name", "status"]);
    }
  });

  it("returns 500 when roadmap construction fails", async () => {
    mockedBuild.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const req = createMockReq();
    const res = createMockRes();

    await getToolsRoadmap(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("covers every manifest entry exactly once", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await getToolsRoadmap(req as any, res as any);
    const data = res.json.mock.calls[0][0].data;

    expect(data.tools.map((t: any) => t.name).sort()).toEqual(
      ROADMAP_MANIFEST.map((e) => e.name).sort(),
    );
  });
});
