/**
 * Phase 5 — command executor tests (issue 3812).
 *
 * Verifies executeCommandSteps (async generator) drives an ordered
 * CommandStep[] through execution + approval, emitting StepStatusEvent in
 * the correct sequence:
 *   - every step yields {executing} first
 *   - a read step (requiresApproval=false) runs its tool executor directly
 *   - a write step (requiresApproval=true) calls submitForApproval; when the
 *     outcome is "pending" it yields {awaiting_approval, approvalId} and stops
 *     that step (no {completed})
 *   - an auto-approved write step ("completed") captures the execution result
 *   - prior step result is chained into the next step's inputs
 *   - a thrown step yields {failed, error} and halts the remaining steps
 *
 * submitForApproval (the approval gateway) is mocked. The tool executor is a
 * fake injected via ctx.resolveToolExecutor — no DB / LLM / HTTP.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../approval/approvalGateway", () => ({
  submitForApproval: jest.fn(),
}));

import { executeCommandSteps } from "../executor";
import type { CommandStep, StepStatusEvent } from "../types";
import { submitForApproval } from "../../approval/approvalGateway";

const mockSubmit = submitForApproval as unknown as jest.Mock;

function step(partial: Partial<CommandStep> & { order: number }): CommandStep {
  return {
    description: `step ${partial.order}`,
    intent: "read",
    agent: "coordinator",
    requiresApproval: false,
    inputs: {},
    ...partial,
  };
}

async function drain(
  gen: AsyncGenerator<StepStatusEvent>,
): Promise<StepStatusEvent[]> {
  const events: StepStatusEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

beforeEach(() => {
  mockSubmit.mockReset();
});

describe("commandEngine / executeCommandSteps", () => {
  it("runs a read step without approval and emits executing then completed", async () => {
    const toolExec = jest.fn(async () => ({ count: 2 }));
    const ctx = {
      organizationId: 1,
      userId: 7,
      resolveToolExecutor: () => toolExec as any,
    };

    const steps = [step({ order: 1, toolName: "get_risks", requiresApproval: false })];

    const events = await drain(executeCommandSteps(steps, ctx));

    expect(events.map((e) => [e.stepOrder, e.status])).toEqual([
      [1, "executing"],
      [1, "completed"],
    ]);
    expect(events[1].result).toEqual({ count: 2 });

    // read step never touches the approval gateway
    expect(mockSubmit).not.toHaveBeenCalled();
    // tool executor invoked with (inputs, organizationId, userId)
    expect(toolExec).toHaveBeenCalledTimes(1);
    expect(toolExec).toHaveBeenCalledWith(expect.any(Object), 1, 7);
  });

  it("calls submitForApproval for a write step and yields awaiting_approval when pending (stops that step)", async () => {
    mockSubmit.mockResolvedValue({ outcome: "pending", approvalId: "appr-123" });

    const toolExec = jest.fn(async () => ({ id: 99 }));
    const ctx = {
      organizationId: 5,
      userId: 3,
      resolveToolExecutor: () => toolExec as any,
    };

    const steps = [
      step({
        order: 1,
        intent: "create",
        agent: "task-agent",
        toolName: "agent_create_task",
        requiresApproval: true,
        inputs: { title: "Mitigate" },
      }),
    ];

    const events = await drain(executeCommandSteps(steps, ctx));

    expect(events.map((e) => [e.stepOrder, e.status])).toEqual([
      [1, "executing"],
      [1, "awaiting_approval"],
    ]);
    expect(events[1].approvalId).toBe("appr-123");

    // pending → the tool executor must NOT have been called directly
    expect(toolExec).not.toHaveBeenCalled();

    // submitForApproval received the tool name + inputs + org/user
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const cfg = mockSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg.toolName).toBe("agent_create_task");
    expect(cfg.organizationId).toBe(5);
    expect(cfg.userId).toBe(3);
    expect(cfg.inputParams).toMatchObject({ title: "Mitigate" });
  });

  it("captures the execution result for an auto-approved (completed) write step", async () => {
    mockSubmit.mockResolvedValue({
      outcome: "completed",
      approvalId: "appr-ok",
      executionResult: { id: 42, created: true },
    });

    const ctx = {
      organizationId: 1,
      userId: 1,
      resolveToolExecutor: () => undefined, // never used on the auto-approve path
    };

    const steps = [
      step({
        order: 1,
        intent: "create",
        toolName: "agent_create_risk",
        requiresApproval: true,
      }),
    ];

    const events = await drain(executeCommandSteps(steps, ctx));

    expect(events.map((e) => [e.stepOrder, e.status])).toEqual([
      [1, "executing"],
      [1, "completed"],
    ]);
    expect(events[1].result).toEqual({ id: 42, created: true });
  });

  it("chains step N result into step N+1 inputs", async () => {
    const firstResult = { riskId: 555, name: "Data leak" };
    const exec1 = jest.fn(async () => firstResult);
    const exec2 = jest.fn(async () => ({ ok: true }));

    const ctx = {
      organizationId: 2,
      userId: 9,
      resolveToolExecutor: (toolName: string) =>
        (toolName === "get_risks" ? exec1 : exec2) as any,
    };

    const steps = [
      step({ order: 1, toolName: "get_risks", requiresApproval: false }),
      step({
        order: 2,
        toolName: "agent_create_task",
        requiresApproval: false,
        inputs: { title: "follow up" },
      }),
    ];

    const events = await drain(executeCommandSteps(steps, ctx));

    expect(events.map((e) => [e.stepOrder, e.status])).toEqual([
      [1, "executing"],
      [1, "completed"],
      [2, "executing"],
      [2, "completed"],
    ]);

    // step 2 executor was called with its own inputs PLUS the chained prior
    // results keyed by step order.
    expect(exec2).toHaveBeenCalledTimes(1);
    const passedInputs = exec2.mock.calls[0][0] as Record<string, unknown>;
    expect(passedInputs.title).toBe("follow up");
    expect(passedInputs._priorResults).toEqual({ 1: firstResult });
  });

  it("yields failed and halts remaining steps when a step throws", async () => {
    const boom = jest.fn(async () => {
      throw new Error("executor exploded");
    });
    const later = jest.fn(async () => ({ unreached: true }));

    const ctx = {
      organizationId: 1,
      userId: 1,
      resolveToolExecutor: (toolName: string) =>
        (toolName === "get_risks" ? boom : later) as any,
    };

    const steps = [
      step({ order: 1, toolName: "get_risks", requiresApproval: false }),
      step({ order: 2, toolName: "get_vendors", requiresApproval: false }),
    ];

    const events = await drain(executeCommandSteps(steps, ctx));

    expect(events.map((e) => [e.stepOrder, e.status])).toEqual([
      [1, "executing"],
      [1, "failed"],
    ]);
    expect(events[1].error).toContain("executor exploded");

    // step 2 must never run after step 1 fails
    expect(later).not.toHaveBeenCalled();
  });
});
