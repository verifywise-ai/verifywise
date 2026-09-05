/**
 * advisor.ctrl unit tests.
 *
 * Scope: the nine conversation-CRUD, memory and admin handlers.
 *
 * NOT covered — `runAdvisor`, `streamAdvisor`, `streamAdvisorV2`. Those are SSE
 * endpoints driven by the `ai` SDK; faithfully mocking `streamText` /
 * `convertToModelMessages` costs more than it proves, so they are deliberately
 * excluded rather than accidentally missed. Read the coverage number for this
 * file with that in mind.
 *
 * Note on mocking style: every `jest.mock` below passes an explicit factory.
 * Bare auto-mocking would still require the real module to introspect its
 * shape, and this controller transitively pulls ~43 `advisor/functions/*` tool
 * modules plus the DB layer — factories keep the suite hermetic and fast.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
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

import { listConversations } from "../advisor.ctrl";
import { listConversationsQuery } from "../../utils/advisorConversation.utils";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockListConversationsQuery = listConversationsQuery as jest.MockedFunction<
  typeof listConversationsQuery
>;

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
