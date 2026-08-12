import { z } from "zod";
import { generateObjectWithSelfCorrection, type GenerateObjectImpl } from "../llmSelfCorrect";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "planner.ts";

/** Upper bound on parallel workers spawned from one prompt. */
export const MAX_SUBTASKS = 6;

export interface AdvisorPlan {
  mode: "single" | "parallel";
  subtasks: string[];
  reasoning: string;
}

const PlanSchema = z.object({
  mode: z.enum(["single", "parallel"]),
  subtasks: z.array(z.string().min(1)),
  reasoning: z.string(),
});

const PLANNER_SYSTEM = `You are a task planner for an AI governance assistant.
Decide whether the user's request contains MULTIPLE INDEPENDENT tasks that can run in parallel.
Rules:
- Return mode "parallel" ONLY when there are 2 or more tasks with NO data dependency between them (no task needs another task's result).
- If the tasks depend on each other ("do X then use its result for Y"), or there is only one task, return mode "single".
- For "parallel", "subtasks" is the list of independent, self-contained instructions (each runnable on its own).
- For "single", set "subtasks" to a single element containing the original request unchanged.`;

/**
 * Classify a prompt into a single-agent or parallel-workers plan.
 * Never throws — any planner/LLM failure degrades to a safe single plan.
 * @param model  A LanguageModel built via createModel (opaque here).
 * @param generateImpl Injection seam for tests; defaults to the real SDK.
 */
export async function planSubtasks(
  prompt: string,
  model: unknown,
  generateImpl?: GenerateObjectImpl,
): Promise<AdvisorPlan> {
  try {
    const { object } = await generateObjectWithSelfCorrection<AdvisorPlan>(
      { model, schema: PlanSchema, system: PLANNER_SYSTEM, prompt, temperature: 0 },
      generateImpl,
    );
    const subtasks = (object.subtasks ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_SUBTASKS);
    if (object.mode !== "parallel" || subtasks.length < 2) {
      return { mode: "single", subtasks: [prompt], reasoning: object.reasoning ?? "single" };
    }
    return { mode: "parallel", subtasks, reasoning: object.reasoning ?? "parallel" };
  } catch (error) {
    logStructured(
      "error",
      `planner failed, falling back to single: ${error}`,
      "planSubtasks",
      fileName,
    );
    return { mode: "single", subtasks: [prompt], reasoning: "planner error → single" };
  }
}
