import { describe, expect, it } from "@jest/globals";
import { planSubtasks, MAX_SUBTASKS } from "../planner";
import type { GenerateObjectImpl } from "../../llmSelfCorrect";

// A GenerateObjectImpl stub that always resolves to the given object.
const impl =
  (object: unknown): GenerateObjectImpl =>
  async () =>
    ({ object }) as any;

describe("planSubtasks", () => {
  it("returns parallel with the subtasks when the model finds independent tasks", async () => {
    const plan = await planSubtasks(
      "count risks and count vendors",
      {},
      impl({
        mode: "parallel",
        subtasks: ["count risks", "count vendors"],
        reasoning: "independent",
      }),
    );
    expect(plan.mode).toBe("parallel");
    expect(plan.subtasks).toEqual(["count risks", "count vendors"]);
  });

  it("collapses to single when the model returns parallel with fewer than 2 subtasks", async () => {
    const plan = await planSubtasks(
      "count risks",
      {},
      impl({ mode: "parallel", subtasks: ["count risks"], reasoning: "x" }),
    );
    expect(plan.mode).toBe("single");
    expect(plan.subtasks).toEqual(["count risks"]);
  });

  it("returns single unchanged when the model says single", async () => {
    const plan = await planSubtasks(
      "hello",
      {},
      impl({ mode: "single", subtasks: ["hello"], reasoning: "greeting" }),
    );
    expect(plan.mode).toBe("single");
    expect(plan.subtasks).toEqual(["hello"]);
  });

  it("clamps subtasks to MAX_SUBTASKS", async () => {
    const many = Array.from({ length: MAX_SUBTASKS + 3 }, (_, i) => `task ${i}`);
    const plan = await planSubtasks(
      "many",
      {},
      impl({ mode: "parallel", subtasks: many, reasoning: "x" }),
    );
    expect(plan.subtasks).toHaveLength(MAX_SUBTASKS);
  });

  it("falls back to single when the model impl throws", async () => {
    const throwing: GenerateObjectImpl = (async () => {
      throw new Error("llm down");
    }) as any;
    const plan = await planSubtasks("count risks and vendors", {}, throwing);
    expect(plan.mode).toBe("single");
    expect(plan.subtasks).toEqual(["count risks and vendors"]);
  });
});
