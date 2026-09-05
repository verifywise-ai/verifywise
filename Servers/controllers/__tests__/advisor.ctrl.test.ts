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

import {
  adminClearAgentMemory,
  adminListAgentMessages,
  availableTools,
  createConversation,
  deleteConversation,
  deleteMyMemory,
  getConversationById,
  getMemorySummary,
  getToolsRoadmap,
  listConversations,
  updateConversation,
} from "../advisor.ctrl";
import {
  createConversationQuery,
  deleteConversationQuery,
  getConversationByIdQuery,
  listConversationsQuery,
  updateConversationMessagesQuery,
} from "../../utils/advisorConversation.utils";
import {
  clearAgentMemory,
  clearSession,
  clearUserMemory,
  getAgentMessages,
  getUserMemorySummary,
} from "../../advisor/memory/memoryService";
import { buildToolsRoadmap } from "../../advisor/roadmap/roadmapService";
import { ROADMAP_MANIFEST } from "../../advisor/roadmap/manifest";
import type { IAdvisorMessage } from "../../domain.layer/interfaces/i.advisorConversation";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockListConversationsQuery = listConversationsQuery as jest.MockedFunction<
  typeof listConversationsQuery
>;
const mockGetConversationByIdQuery = getConversationByIdQuery as jest.MockedFunction<
  typeof getConversationByIdQuery
>;
const mockCreateConversationQuery = createConversationQuery as jest.MockedFunction<
  typeof createConversationQuery
>;
const mockUpdateConversationMessagesQuery = updateConversationMessagesQuery as jest.MockedFunction<
  typeof updateConversationMessagesQuery
>;
const mockDeleteConversationQuery = deleteConversationQuery as jest.MockedFunction<
  typeof deleteConversationQuery
>;
const mockClearAgentMemory = clearAgentMemory as jest.MockedFunction<typeof clearAgentMemory>;
const mockClearSession = clearSession as jest.MockedFunction<typeof clearSession>;
const mockClearUserMemory = clearUserMemory as jest.MockedFunction<typeof clearUserMemory>;
const mockGetAgentMessages = getAgentMessages as jest.MockedFunction<typeof getAgentMessages>;
const mockGetUserMemorySummary = getUserMemorySummary as jest.MockedFunction<
  typeof getUserMemorySummary
>;
const mockedBuild = buildToolsRoadmap as jest.Mock;

/** A stored conversation row, as the query layer would return it. */
const conversationRow = (overrides: Record<string, any> = {}) => ({
  id: 7,
  domain: "risks",
  title: "A title",
  messages: [{ role: "user", content: "hi" }],
  last_message_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/** The serialized shape the CRUD handlers echo back (raw, not wrapped). */
const conversationBody = (row: ReturnType<typeof conversationRow>) => ({
  domain: row.domain,
  conversation: {
    id: row.id,
    title: row.title,
    messages: row.messages,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  },
});

/** Values that must all fail `getIdParam` and yield a 400. */
const BAD_IDS = ["abc", "0", "-1", "1.5"];

const boom = new Error("boom");

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

    it("returns 400 when the request carries no user context", async () => {
      const req = createMockReq({ userId: undefined, params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await listConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "User context is required",
      });
      expect(mockListConversationsQuery).not.toHaveBeenCalled();
    });

    it("returns 400 when :domain is absent", async () => {
      const req = createMockReq({ params: {} }) as Request;
      const res = createMockRes() as Response;

      await listConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Domain is required" });
    });

    it("returns 500 when the query throws", async () => {
      mockListConversationsQuery.mockRejectedValue(boom);

      const req = createMockReq({ params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await listConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error", data: "boom" });
    });
  });

  describe("getConversationById", () => {
    it("returns 200 with the serialized conversation", async () => {
      const row = conversationRow();
      mockGetConversationByIdQuery.mockResolvedValue(row as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(mockGetConversationByIdQuery).toHaveBeenCalledWith(1, 1, 7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(conversationBody(row));
    });

    it("returns 400 when the request carries no user context", async () => {
      const req = createMockReq({
        userId: undefined,
        params: { domain: "risks", id: "7" },
      }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "User context is required",
      });
    });

    it("returns 400 when :domain is absent", async () => {
      const req = createMockReq({ params: { id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Domain is required" });
    });

    it.each(BAD_IDS)("returns 400 when :id is %p", async (badId) => {
      const req = createMockReq({ params: { domain: "risks", id: badId } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Valid conversation id is required",
      });
      expect(mockGetConversationByIdQuery).not.toHaveBeenCalled();
    });

    it("returns 404 when the row does not exist under this org + user", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(null as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: "Conversation not found",
      });
    });

    it("returns 404 when the row exists but belongs to another domain", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow({ domain: "vendors" }) as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      // Cross-domain reads are refused even though the row is the caller's.
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 500 when the query throws", async () => {
      mockGetConversationByIdQuery.mockRejectedValue(boom);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error", data: "boom" });
    });
  });

  describe("createConversation", () => {
    it("returns 201 with the created conversation", async () => {
      const row = conversationRow({ title: null, messages: [] });
      mockCreateConversationQuery.mockResolvedValue(row as any);

      const req = createMockReq({ params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await createConversation(req, res);

      expect(mockCreateConversationQuery).toHaveBeenCalledWith(1, 1, "risks");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(conversationBody(row));
    });

    it("returns 400 when the request carries no user context", async () => {
      const req = createMockReq({ userId: undefined, params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreateConversationQuery).not.toHaveBeenCalled();
    });

    it("returns 400 when :domain is absent", async () => {
      const req = createMockReq({ params: {} }) as Request;
      const res = createMockRes() as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Domain is required" });
    });

    it("returns 500 when the query throws", async () => {
      mockCreateConversationQuery.mockRejectedValue(boom);

      const req = createMockReq({ params: { domain: "risks" } }) as Request;
      const res = createMockRes() as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateConversation", () => {
    const messages: IAdvisorMessage[] = [
      { id: "m1", role: "user", content: "hello", createdAt: "2026-01-01T00:00:00.000Z" },
    ];

    it("returns 200 with the updated conversation", async () => {
      const updated = conversationRow({ messages });
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow() as any);
      mockUpdateConversationMessagesQuery.mockResolvedValue(updated as any);

      const req = createMockReq({
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(mockUpdateConversationMessagesQuery).toHaveBeenCalledWith(1, 1, 7, messages);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(conversationBody(updated));
    });

    it("returns 400 when the request carries no user context", async () => {
      const req = createMockReq({
        userId: undefined,
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when :domain is absent", async () => {
      const req = createMockReq({ params: { id: "7" }, body: { messages } }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Domain is required" });
    });

    it.each(BAD_IDS)("returns 400 when :id is %p", async (badId) => {
      const req = createMockReq({
        params: { domain: "risks", id: badId },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it.each([[undefined], [null], ["not-an-array"]])(
      "returns 400 when body.messages is %p",
      async (bad) => {
        const req = createMockReq({
          params: { domain: "risks", id: "7" },
          body: { messages: bad },
        }) as Request;
        const res = createMockRes() as Response;

        await updateConversation(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          message: "Bad Request",
          data: "Messages array is required",
        });
        expect(mockUpdateConversationMessagesQuery).not.toHaveBeenCalled();
      },
    );

    it("returns 404 when the conversation does not exist", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(null as any);

      const req = createMockReq({
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockUpdateConversationMessagesQuery).not.toHaveBeenCalled();
    });

    it("returns 404 without writing when the row belongs to another domain", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow({ domain: "vendors" }) as any);

      const req = createMockReq({
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      // The cross-domain guard must reject BEFORE the UPDATE runs.
      expect(mockUpdateConversationMessagesQuery).not.toHaveBeenCalled();
    });

    it("returns 404 when the update itself matches no row", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow() as any);
      mockUpdateConversationMessagesQuery.mockResolvedValue(null as any);

      const req = createMockReq({
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 500 when the query throws", async () => {
      mockGetConversationByIdQuery.mockRejectedValue(boom);

      const req = createMockReq({
        params: { domain: "risks", id: "7" },
        body: { messages },
      }) as Request;
      const res = createMockRes() as Response;

      await updateConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteConversation", () => {
    it("returns 204 with an empty body", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow() as any);
      mockDeleteConversationQuery.mockResolvedValue(true as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(mockDeleteConversationQuery).toHaveBeenCalledWith(1, 1, 7);
      expect(res.status).toHaveBeenCalledWith(204);
      // 204 goes out via send(), not json() - asserting json() here would pass
      // vacuously against a handler that had stopped sending anything at all.
      expect(res.send).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it("returns 400 when the request carries no user context", async () => {
      const req = createMockReq({
        userId: undefined,
        params: { domain: "risks", id: "7" },
      }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when :domain is absent", async () => {
      const req = createMockReq({ params: { id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Bad Request", data: "Domain is required" });
    });

    it.each(BAD_IDS)("returns 400 when :id is %p", async (badId) => {
      const req = createMockReq({ params: { domain: "risks", id: badId } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 404 without deleting when the row belongs to another domain", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow({ domain: "vendors" }) as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockDeleteConversationQuery).not.toHaveBeenCalled();
    });

    it("returns 404 when the delete itself matches no row", async () => {
      mockGetConversationByIdQuery.mockResolvedValue(conversationRow() as any);
      mockDeleteConversationQuery.mockResolvedValue(false as any);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 500 when the query throws", async () => {
      mockGetConversationByIdQuery.mockRejectedValue(boom);

      const req = createMockReq({ params: { domain: "risks", id: "7" } }) as Request;
      const res = createMockRes() as Response;

      await deleteConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getMemorySummary", () => {
    const summary = {
      total_messages: 3,
      by_agent: [{ agent_name: "advisor", message_count: 3, oldest: null, newest: null }],
      by_session: [],
    };

    it("returns 200 with a STATUS_CODE-wrapped summary", async () => {
      mockGetUserMemorySummary.mockResolvedValue(summary as any);

      const req = createMockReq() as Request;
      const res = createMockRes() as Response;

      await getMemorySummary(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Unlike the CRUD handlers above, the memory handlers DO wrap success.
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: summary });
    });

    it("returns 400 when organizationId is missing", async () => {
      const req = createMockReq({ organizationId: undefined }) as Request;
      const res = createMockRes() as Response;

      await getMemorySummary(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Auth context required",
      });
    });

    it("returns 400 when userId is missing", async () => {
      const req = createMockReq({ userId: undefined }) as Request;
      const res = createMockRes() as Response;

      await getMemorySummary(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 500 with the raw error message when the lookup throws", async () => {
      mockGetUserMemorySummary.mockRejectedValue(boom);

      const req = createMockReq() as Request;
      const res = createMockRes() as Response;

      await getMemorySummary(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      // This handler bypasses translateError and surfaces error.message directly.
      expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error", data: "boom" });
    });
  });

  describe("deleteMyMemory", () => {
    it("purges the whole user history when no sessionId is given", async () => {
      mockClearUserMemory.mockResolvedValue(5 as any);

      const req = createMockReq({ query: {} }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      expect(mockClearUserMemory).toHaveBeenCalledWith(1, 1, undefined);
      expect(mockClearSession).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { removed_rows: 5, agent_name: null, session_id: null },
      });
    });

    it("scopes the purge to one agent when agentName is given", async () => {
      mockClearUserMemory.mockResolvedValue(2 as any);

      const req = createMockReq({ query: { agentName: "advisor" } }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      expect(mockClearUserMemory).toHaveBeenCalledWith(1, 1, "advisor");
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { removed_rows: 2, agent_name: "advisor", session_id: null },
      });
    });

    it("clears a single session and reports the -1 sentinel", async () => {
      const req = createMockReq({ query: { sessionId: "sess-1" } }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      // clearSession returns no count, so the handler reports -1 rather than 0 -
      // 0 would read as "nothing was deleted", which is a different outcome.
      expect(mockClearSession).toHaveBeenCalledWith(1, "advisor", "sess-1");
      expect(mockClearUserMemory).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { removed_rows: -1, agent_name: null, session_id: "sess-1" },
      });
    });

    it("treats whitespace-only query params as absent", async () => {
      mockClearUserMemory.mockResolvedValue(0 as any);

      const req = createMockReq({ query: { agentName: "   ", sessionId: "  " } }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      expect(mockClearSession).not.toHaveBeenCalled();
      expect(mockClearUserMemory).toHaveBeenCalledWith(1, 1, undefined);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { removed_rows: 0, agent_name: null, session_id: null },
      });
    });

    it("returns 400 when auth context is missing", async () => {
      const req = createMockReq({ userId: undefined }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockClearUserMemory).not.toHaveBeenCalled();
    });

    it("returns 500 when the purge throws", async () => {
      mockClearUserMemory.mockRejectedValue(boom);

      const req = createMockReq({ query: {} }) as Request;
      const res = createMockRes() as Response;

      await deleteMyMemory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("adminClearAgentMemory", () => {
    it("clears the agent and returns 200 for an Admin", async () => {
      const req = createMockReq({ params: { agentName: "advisor" } }) as Request;
      const res = createMockRes() as Response;

      await adminClearAgentMemory(req, res);

      expect(mockClearAgentMemory).toHaveBeenCalledWith(1, "advisor");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { cleared: true, agent_name: "advisor" },
      });
    });

    it("returns 403 for a non-Admin role", async () => {
      const req = createMockReq({ role: "Editor", params: { agentName: "advisor" } }) as Request;
      const res = createMockRes() as Response;

      await adminClearAgentMemory(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Admin role required to clear agent memory",
      });
      expect(mockClearAgentMemory).not.toHaveBeenCalled();
    });

    it("returns 400 - not 403 - when a non-Admin also has no org context", async () => {
      const req = createMockReq({
        role: "Editor",
        organizationId: undefined,
        params: { agentName: "advisor" },
      }) as Request;
      const res = createMockRes() as Response;

      await adminClearAgentMemory(req, res);

      // Guard order matters: the org check runs first. A 403 assertion written
      // without an organizationId would pass against the WRONG branch.
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Auth context required",
      });
    });

    it.each([[""], ["   "]])("returns 400 when :agentName is %p", async (agentName) => {
      const req = createMockReq({ params: { agentName } }) as Request;
      const res = createMockRes() as Response;

      await adminClearAgentMemory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "agentName is required",
      });
    });

    it("returns 500 when the clear throws", async () => {
      mockClearAgentMemory.mockRejectedValue(boom);

      const req = createMockReq({ params: { agentName: "advisor" } }) as Request;
      const res = createMockRes() as Response;

      await adminClearAgentMemory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error", data: "boom" });
    });
  });

  describe("adminListAgentMessages", () => {
    it("returns 200 with the rows and a default limit of 50", async () => {
      const rows = [{ id: 1, content: "hi" }];
      mockGetAgentMessages.mockResolvedValue(rows as any);

      const req = createMockReq({ params: { agentName: "advisor" }, query: {} }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(mockGetAgentMessages).toHaveBeenCalledWith(1, "advisor", 50);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: rows });
    });

    it.each([
      ["1000", 500],
      ["abc", 50],
      ["0", 50],
      ["-5", 1],
      ["25", 25],
    ])("clamps ?limit=%s to %i", async (raw, expected) => {
      mockGetAgentMessages.mockResolvedValue([] as any);

      const req = createMockReq({
        params: { agentName: "advisor" },
        query: { limit: raw },
      }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(mockGetAgentMessages).toHaveBeenCalledWith(1, "advisor", expected);
    });

    it("returns 403 for a non-Admin role", async () => {
      const req = createMockReq({
        role: "Editor",
        params: { agentName: "advisor" },
        query: {},
      }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      // Note: a DIFFERENT string from adminClearAgentMemory's 403.
      expect(res.json).toHaveBeenCalledWith({ message: "Forbidden", data: "Admin role required" });
      expect(mockGetAgentMessages).not.toHaveBeenCalled();
    });

    it("returns 400 when organizationId is missing", async () => {
      const req = createMockReq({
        organizationId: undefined,
        params: { agentName: "advisor" },
        query: {},
      }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when :agentName is empty", async () => {
      const req = createMockReq({ params: { agentName: "  " }, query: {} }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "agentName is required",
      });
    });

    it("returns 500 when the lookup throws", async () => {
      mockGetAgentMessages.mockRejectedValue(boom);

      const req = createMockReq({ params: { agentName: "advisor" }, query: {} }) as Request;
      const res = createMockRes() as Response;

      await adminListAgentMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
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
