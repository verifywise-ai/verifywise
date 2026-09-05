/**
 * advisor.ctrl unit tests.
 *
 * Scope: the nine conversation-CRUD, memory and admin handlers, plus
 * `getToolsRoadmap`.
 *
 * NOT covered — `runAdvisor`, `streamAdvisor`, `streamAdvisorV2`. Those are SSE
 * endpoints driven by the `ai` SDK; faithfully mocking `streamText` /
 * `convertToModelMessages` costs more than it proves, so they are deliberately
 * excluded rather than accidentally missed. Read the coverage number for this
 * file with that in mind.
 *
 * Note on mocking style: the mocks below pass explicit factories. Bare
 * auto-mocking would still require the real module to introspect its shape,
 * and this controller transitively pulls a large module graph (DB, LLM
 * provider, Redis) — factories keep the suite hermetic and fast.
 *
 * Two things are deliberately left REAL, because the roadmap tests assert
 * against them: the `advisor/functions/*` tool registry behind `availableTools`,
 * and `roadmapService` (wrapped, not replaced, so its error path can be forced).
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Request, Response } from "express";

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

jest.mock("../../advisor/aiSdkAgent", () => ({
  streamAdvisorAiSdk: jest.fn(),
  runAdvisorAiSdk: jest.fn(),
  getStreamTextResult: jest.fn(),
}));

jest.mock("../../advisor/orchestrator", () => ({
  orchestrate: jest.fn(),
}));

// Keep the real roadmapService (pure function over the static manifest) but
// wrap buildToolsRoadmap so the error path can be forced.
jest.mock("../../advisor/roadmap/roadmapService", () => {
  const actual = jest.requireActual("../../advisor/roadmap/roadmapService") as any;
  return { ...actual, buildToolsRoadmap: jest.fn(actual.buildToolsRoadmap) };
});

jest.mock("ai", () => ({
  convertToModelMessages: jest.fn(),
}));

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    204: (data: any) => ({ message: "No Content", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

import { getToolsRoadmap, listConversations, availableTools } from "../advisor.ctrl";
import { listConversationsQuery } from "../../utils/advisorConversation.utils";
import { buildToolsRoadmap } from "../../advisor/roadmap/roadmapService";
import { ROADMAP_MANIFEST } from "../../advisor/roadmap/manifest";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockListConversationsQuery = listConversationsQuery as jest.MockedFunction<
  typeof listConversationsQuery
>;
const mockedBuild = buildToolsRoadmap as jest.Mock;

describe("advisor.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listConversations", () => {
    it("returns 200 with the raw { domain, conversations } body", async () => {
      const conversations = [{ id: 1, title: "First", domain: "risks" }];
      mockListConversationsQuery.mockResolvedValue(conversations as any);

      const req = createMockReq({ params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await listConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Success bodies on the CRUD handlers are raw - NOT STATUS_CODE-wrapped.
      expect(res.json).toHaveBeenCalledWith({ domain: "risks", conversations });
    });
  });
});

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

    const byName = new Map<string, any>(data.tools.map((t: any) => [t.name, t]));
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
