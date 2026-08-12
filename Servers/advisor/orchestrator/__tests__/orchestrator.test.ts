import { describe, expect, it, jest } from "@jest/globals";
import { runParallel, synthesize, orchestrate } from "../orchestrator";
import type { AiSdkAdvisorParams } from "../../aiSdkAgent";

const baseParams = {
  userPrompt: "",
  messages: [{ role: "user", content: "x" }],
} as unknown as AiSdkAdvisorParams;

describe("runParallel", () => {
  it("returns one ok result per subtask, passing each subtask as userPrompt", async () => {
    const seen: string[] = [];
    const runWorker = async (p: AiSdkAdvisorParams) => {
      seen.push(p.userPrompt);
      return `answer:${p.userPrompt}`;
    };
    const out = await runParallel(["a", "b", "c"], baseParams, { runWorker, concurrency: 2 });
    expect(out.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(out.map((r) => r.result)).toEqual(["answer:a", "answer:b", "answer:c"]);
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("never exceeds the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const runWorker = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return "ok";
    };
    await runParallel(["a", "b", "c", "d", "e"], baseParams, { runWorker, concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("captures a worker failure as an error result without failing the batch", async () => {
    const runWorker = async (p: AiSdkAdvisorParams) => {
      if (p.userPrompt === "b") throw new Error("boom");
      return "ok";
    };
    const out = await runParallel(["a", "b"], baseParams, { runWorker });
    expect(out[0]).toMatchObject({ status: "ok" });
    expect(out[1]).toMatchObject({ status: "error", error: "boom" });
  });
});

describe("synthesize", () => {
  it("passes a prompt containing every worker result to streamText", () => {
    const streamImpl = jest.fn(() => ({ piped: true }) as any);
    synthesize(
      "original request",
      [
        { subtask: "a", result: "RES_A", status: "ok" },
        { subtask: "b", result: "", status: "error", error: "boom" },
      ],
      {},
      streamImpl as any,
    );
    expect(streamImpl).toHaveBeenCalledTimes(1);
    const arg = (streamImpl as any).mock.calls[0][0];
    const userContent = arg.messages[0].content as string;
    expect(userContent).toContain("original request");
    expect(userContent).toContain("RES_A");
    expect(userContent).toContain("boom");
  });
});

describe("orchestrate", () => {
  it("routes to the single stream when the plan is single", async () => {
    const singleStream = jest.fn(async () => ({ single: true }) as any);
    const runWorkers = jest.fn();
    const result = await orchestrate(baseParams, {
      plan: async () => ({ mode: "single", subtasks: ["x"], reasoning: "" }),
      singleStream: singleStream as any,
      runWorkers: runWorkers as any,
      makeModel: () => ({}) as any,
    });
    expect(singleStream).toHaveBeenCalledTimes(1);
    expect(runWorkers).not.toHaveBeenCalled();
    expect(result).toEqual({ single: true });
  });

  it("runs workers then synthesizes when the plan is parallel", async () => {
    const runWorkers = jest.fn(async () => [{ subtask: "a", result: "R", status: "ok" as const }]);
    const synth = jest.fn(() => ({ synth: true }) as any);
    const result = await orchestrate(baseParams, {
      plan: async () => ({ mode: "parallel", subtasks: ["a", "b"], reasoning: "" }),
      runWorkers: runWorkers as any,
      synth: synth as any,
      makeModel: () => ({}) as any,
    });
    expect(runWorkers).toHaveBeenCalledTimes(1);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synth: true });
  });
});
