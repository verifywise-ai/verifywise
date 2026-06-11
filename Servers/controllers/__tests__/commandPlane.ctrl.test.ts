/**
 * Phase 5 — Command Plane controller tests (issue 3812).
 *
 * Covers the two endpoints that wire the planner + executor to HTTP:
 *
 *   - planCommand   (POST /command-plan)    -> { steps }
 *   - executeCommand(POST /command-execute) -> SSE stream of StepStatusEvent
 *
 * The planner, executor, LLM-key lookup, logger and statusCode helpers are
 * all mocked — no DB, no LLM, no real HTTP. We assert the controller's wiring:
 * the planner result is returned as { steps }; the executor's yielded events
 * are each written as one `data: {json}\n\n` SSE frame and the response ends.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import type { CommandStep, StepStatusEvent } from "../../advisor/commandEngine/types";

jest.mock("../../advisor/commandPlanner/planner", () => ({
  planMultiStepCommand: jest.fn(),
}));

jest.mock("../../advisor/commandEngine/executor", () => ({
  executeCommandSteps: jest.fn(),
}));

// The command-plane controller imports the canonical tool registry from the
// advisor controller. Stub it so this unit test does not pull the entire
// advisor tool graph (DB-touching modules) at import time.
jest.mock("../advisor.ctrl", () => ({
  availableTools: { fetch_risks: jest.fn() },
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(() => "https://api.anthropic.com/v1"),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_req: unknown, err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    400: (data: unknown) => ({ message: "Bad Request", data }),
    500: (data: unknown) => ({ message: "Internal Server Error", data }),
  },
}));

import { planCommand, executeCommand } from "../commandPlane.ctrl";
import { planMultiStepCommand } from "../../advisor/commandPlanner/planner";
import { executeCommandSteps } from "../../advisor/commandEngine/executor";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";

const mockPlan = planMultiStepCommand as jest.MockedFunction<typeof planMultiStepCommand>;
const mockExecute = executeCommandSteps as jest.MockedFunction<typeof executeCommandSteps>;
const mockGetKeys = getLLMKeysWithKeyQuery as jest.MockedFunction<typeof getLLMKeysWithKeyQuery>;

function createReq(overrides?: Record<string, unknown>): any {
  return {
    userId: 7,
    organizationId: 42,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    headers: {},
    on: jest.fn(),
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.headersSent = false;
  res.setHeader = jest.fn().mockReturnValue(res);
  res.flushHeaders = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.write = jest.fn().mockReturnValue(true);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

const sampleSteps: CommandStep[] = [
  {
    order: 1,
    description: "List all high-severity risks",
    intent: "read",
    agent: "risk-manager",
    toolName: "fetch_risks",
    requiresApproval: false,
    inputs: { severity: "Major" },
  },
];

/** Build an async generator that yields the given events, for the executor mock. */
async function* yieldEvents(events: StepStatusEvent[]): AsyncGenerator<StepStatusEvent> {
  for (const e of events) {
    yield e;
  }
}

describe("commandPlane controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: one LLM key configured for the org.
    mockGetKeys.mockResolvedValue([
      { id: 9, name: "Anthropic", url: "", model: "claude", key: "sk-test", custom_headers: null },
    ] as any);
  });

  describe("planCommand", () => {
    it("returns { steps } from the planner", async () => {
      mockPlan.mockResolvedValue(sampleSteps);
      const req = createReq({ body: { command: "show my risks", llmKeyId: 9 } });
      const res = createRes();

      await planCommand(req as Request, res as Response);

      expect(mockPlan).toHaveBeenCalledTimes(1);
      // First arg is the raw command string.
      expect((mockPlan.mock.calls[0] as any[])[0]).toBe("show my risks");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ steps: sampleSteps });
    });

    it("400s when command is missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      await planCommand(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPlan).not.toHaveBeenCalled();
    });

    it("400s when no LLM keys are configured", async () => {
      mockGetKeys.mockResolvedValue([] as any);
      const req = createReq({ body: { command: "show my risks" } });
      const res = createRes();

      await planCommand(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPlan).not.toHaveBeenCalled();
    });
  });

  describe("executeCommand", () => {
    it("sets SSE headers and writes one data frame per yielded event, then ends", async () => {
      const events: StepStatusEvent[] = [
        { stepOrder: 1, status: "executing" },
        { stepOrder: 1, status: "completed", result: { ok: true } },
      ];
      mockExecute.mockReturnValue(yieldEvents(events));

      const req = createReq({
        body: { steps: sampleSteps, conversationId: "conv-1", llmKeyId: 9 },
      });
      const res = createRes();

      await executeCommand(req as Request, res as Response);

      // SSE headers set.
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");

      // Executor invoked with the steps and a context carrying org/user/conversation.
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const execCall = mockExecute.mock.calls[0] as any[];
      expect(execCall[0]).toEqual(sampleSteps);
      expect(execCall[1]).toMatchObject({
        organizationId: 42,
        userId: 7,
        conversationId: "conv-1",
      });

      // One data frame per yielded event.
      const frames = res.write.mock.calls.map((c: any[]) => c[0] as string);
      expect(frames).toEqual([
        `data: ${JSON.stringify(events[0])}\n\n`,
        `data: ${JSON.stringify(events[1])}\n\n`,
      ]);

      // Stream terminated.
      expect(res.end).toHaveBeenCalledTimes(1);
    });

    it("400s when steps is not an array", async () => {
      const req = createReq({ body: { steps: "nope" } });
      const res = createRes();

      await executeCommand(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
