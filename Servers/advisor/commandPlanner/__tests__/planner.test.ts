/**
 * Phase 5 — command planner tests (issue 3812).
 *
 * Verifies planMultiStepCommand decomposes one NL command into an ordered
 * CommandStep[], assigns each step an agent via classifyIntent, and sets
 * requiresApproval=true only for create/update/delete intents.
 *
 * The LLM call (generateObject) is injected via the optional `generateImpl`
 * arg — no real model is hit. classifyIntent is mocked so the agent
 * assignment is deterministic.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// Mock the routing engine so classifyIntent returns a deterministic agent per
// step description. The planner is only allowed to read `.agents` / `.intent`.
jest.mock("../../network/routingEngine", () => ({
  classifyIntent: jest.fn(),
}));

import { planMultiStepCommand } from "../planner";
import { classifyIntent } from "../../network/routingEngine";
import type { GenerateObjectImpl } from "../../llmSelfCorrect";

const mockClassify = classifyIntent as unknown as jest.Mock;

const llmKey = {
  apiKey: "sk-test",
  baseURL: "",
  model: "claude-test",
  provider: "Anthropic" as const,
};

beforeEach(() => {
  mockClassify.mockReset();
});

describe("commandPlanner / planMultiStepCommand", () => {
  it("parses a 3-step command into ordered CommandStep[] with intents, agents, and approval flags", async () => {
    // The LLM proposes three raw steps. The planner enriches each with
    // agent + final requiresApproval.
    const rawSteps = [
      {
        description: "Find the high risks for the chatbot project",
        intent: "read",
        toolName: "get_risks",
        inputs: { severity: "high" },
      },
      {
        description: "Create a mitigation task for each high risk",
        intent: "create",
        toolName: "agent_create_task",
        inputs: {},
      },
      {
        description: "Notify the risk owner about the new tasks",
        intent: "update",
        toolName: "agent_send_notification",
        inputs: {},
      },
    ];

    const generateImpl: GenerateObjectImpl = jest.fn(async () => ({
      object: { steps: rawSteps },
    })) as unknown as GenerateObjectImpl;

    // classifyIntent returns a domain-specific agent per description, in order.
    mockClassify
      .mockReturnValueOnce({
        agents: ["risk-agent"],
        intent: "risk",
        isMultiAgent: false,
        confidence: 0.9,
        reasoning: "risk",
      })
      .mockReturnValueOnce({
        agents: ["task-agent"],
        intent: "task",
        isMultiAgent: false,
        confidence: 0.9,
        reasoning: "task",
      })
      .mockReturnValueOnce({
        agents: ["notification-agent"],
        intent: "notification",
        isMultiAgent: false,
        confidence: 0.9,
        reasoning: "notification",
      });

    const steps = await planMultiStepCommand(
      "Find high risks, create mitigation tasks, notify the owner",
      { llmKey },
      generateImpl,
    );

    expect(steps).toHaveLength(3);

    // order is 1..N, monotonically increasing
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);

    // descriptions preserved from the LLM
    expect(steps[0].description).toBe(rawSteps[0].description);
    expect(steps[1].description).toBe(rawSteps[1].description);

    // agent assigned from classifyIntent (first agent in the decision)
    expect(steps[0].agent).toBe("risk-agent");
    expect(steps[1].agent).toBe("task-agent");
    expect(steps[2].agent).toBe("notification-agent");

    // toolName carried through
    expect(steps[0].toolName).toBe("get_risks");
    expect(steps[1].toolName).toBe("agent_create_task");

    // inputs carried through
    expect(steps[0].inputs).toEqual({ severity: "high" });

    // requiresApproval: read=false, create=true, update=true
    expect(steps[0].requiresApproval).toBe(false);
    expect(steps[1].requiresApproval).toBe(true);
    expect(steps[2].requiresApproval).toBe(true);

    // classifyIntent called once per step, with the step description
    expect(mockClassify).toHaveBeenCalledTimes(3);
    expect(mockClassify).toHaveBeenNthCalledWith(1, rawSteps[0].description);
    expect(mockClassify).toHaveBeenNthCalledWith(2, rawSteps[1].description);
  });

  it("flags delete-intent steps as requiresApproval and read-only steps as not", async () => {
    const rawSteps = [
      { description: "List all archived vendors", intent: "read", inputs: {} },
      { description: "Delete vendor 42", intent: "delete", toolName: "agent_delete_vendor", inputs: { id: 42 } },
    ];

    const generateImpl: GenerateObjectImpl = jest.fn(async () => ({
      object: { steps: rawSteps },
    })) as unknown as GenerateObjectImpl;

    mockClassify.mockReturnValue({
      agents: ["vendor-agent"],
      intent: "vendor",
      isMultiAgent: false,
      confidence: 0.8,
      reasoning: "vendor",
    });

    const steps = await planMultiStepCommand("clean up vendors", { llmKey }, generateImpl);

    expect(steps).toHaveLength(2);
    expect(steps[0].requiresApproval).toBe(false);
    expect(steps[1].requiresApproval).toBe(true);
    expect(steps[1].agent).toBe("vendor-agent");
  });

  it("defaults agent to coordinator when classifyIntent yields no agents", async () => {
    const rawSteps = [{ description: "Say hello", intent: "read", inputs: {} }];

    const generateImpl: GenerateObjectImpl = jest.fn(async () => ({
      object: { steps: rawSteps },
    })) as unknown as GenerateObjectImpl;

    mockClassify.mockReturnValue({
      agents: [],
      intent: "general",
      isMultiAgent: false,
      confidence: 0.1,
      reasoning: "none",
    });

    const steps = await planMultiStepCommand("hi", { llmKey }, generateImpl);
    expect(steps[0].agent).toBe("coordinator");
  });
});
