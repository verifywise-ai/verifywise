import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../repository/commandPlane.repository", () => ({
  postCommandPlan: vi.fn(),
  executeCommand: vi.fn(),
}));

import { useCommandPlane } from "../useCommandPlane";
import {
  postCommandPlan,
  executeCommand,
  type CommandStep,
  type StepStatusEvent,
} from "../../repository/commandPlane.repository";

const steps: CommandStep[] = [
  {
    order: 1,
    description: "Register the model",
    intent: "register_model",
    agent: "model-inventory",
    requiresApproval: false,
    inputs: {},
  },
  {
    order: 2,
    description: "Create the model risk",
    intent: "create_model_risk",
    agent: "model-risk",
    requiresApproval: true,
    inputs: {},
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCommandPlane", () => {
  it("starts empty and not running", () => {
    const { result } = renderHook(() => useCommandPlane());

    expect(result.current.steps).toEqual([]);
    expect(result.current.statuses).toEqual({});
    expect(result.current.isRunning).toBe(false);
  });

  it("plan() populates steps from the repository", async () => {
    vi.mocked(postCommandPlan).mockResolvedValue({ steps });

    const { result } = renderHook(() => useCommandPlane());

    await act(async () => {
      await result.current.plan("register fraud detector and flag risk");
    });

    expect(postCommandPlan).toHaveBeenCalledWith(
      "register fraud detector and flag risk",
      undefined,
    );
    expect(result.current.steps).toEqual(steps);
  });

  it("plan() forwards the llmKeyId when provided", async () => {
    vi.mocked(postCommandPlan).mockResolvedValue({ steps });

    const { result } = renderHook(() => useCommandPlane(99));

    await act(async () => {
      await result.current.plan("do the thing");
    });

    expect(postCommandPlan).toHaveBeenCalledWith("do the thing", 99);
  });

  it("execute() streams events and updates statuses keyed by step order", async () => {
    vi.mocked(postCommandPlan).mockResolvedValue({ steps });

    // executeCommand drives the onEvent callback with a sequence of events,
    // mirroring the SSE stream the backend emits.
    vi.mocked(executeCommand).mockImplementation(
      async (_steps, onEvent: (e: StepStatusEvent) => void) => {
        onEvent({ stepOrder: 1, status: "executing" });
        onEvent({ stepOrder: 1, status: "completed", result: { id: 1 } });
        onEvent({ stepOrder: 2, status: "awaiting_approval", approvalId: "appr-2" });
      },
    );

    const { result } = renderHook(() => useCommandPlane());

    await act(async () => {
      await result.current.plan("register and flag");
    });

    await act(async () => {
      await result.current.run();
    });

    await waitFor(() => {
      expect(result.current.statuses[1]?.status).toBe("completed");
    });
    expect(result.current.statuses[1]?.result).toEqual({ id: 1 });
    expect(result.current.statuses[2]?.status).toBe("awaiting_approval");
    expect(result.current.statuses[2]?.approvalId).toBe("appr-2");
    expect(result.current.isRunning).toBe(false);
  });

  it("run() does nothing when there are no planned steps", async () => {
    const { result } = renderHook(() => useCommandPlane());

    await act(async () => {
      await result.current.run();
    });

    expect(executeCommand).not.toHaveBeenCalled();
  });
});
