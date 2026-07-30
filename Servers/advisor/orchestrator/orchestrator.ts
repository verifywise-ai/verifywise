import { streamText } from "ai";
import {
  runAdvisorAiSdk,
  getStreamTextResult,
  createModel,
  extractLatestUserContent,
  type AiSdkAdvisorParams,
} from "../aiSdkAgent";
import { planSubtasks } from "./planner";
import { logStructured } from "../../utils/logger/fileLogger";

export interface WorkerResult {
  subtask: string;
  result: string;
  status: "ok" | "error";
  error?: string;
}

/**
 * Run each subtask through a full advisor worker, at most `concurrency` at once.
 * A worker failure is captured (never rejects the batch). Each worker runs the
 * subtask as a fresh single-turn prompt (messages cleared so userPrompt wins).
 */
export async function runParallel(
  subtasks: string[],
  agentParams: AiSdkAdvisorParams,
  opts?: { concurrency?: number; runWorker?: (p: AiSdkAdvisorParams) => Promise<string> },
): Promise<WorkerResult[]> {
  const concurrency = Math.max(1, opts?.concurrency ?? 4);
  const runWorker = opts?.runWorker ?? runAdvisorAiSdk;
  const results: WorkerResult[] = new Array(subtasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= subtasks.length) return;
      const subtask = subtasks[i];
      try {
        const result = await runWorker({
          ...agentParams,
          userPrompt: subtask,
          messages: undefined,
        });
        results[i] = { subtask, result, status: "ok" };
      } catch (error) {
        results[i] = {
          subtask,
          result: "",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, subtasks.length) }, worker);
  await Promise.all(pool);
  return results;
}

const SYNTH_SYSTEM = `You are an AI governance assistant. You are given the user's original request and the results of several sub-tasks that were run in parallel. Merge them into ONE clear, coherent answer addressed to the user. Do not mention sub-tasks, agents, or that the work was split up. If a result indicates an error, use what succeeded and briefly note what could not be completed.`;

/**
 * Merge worker results into one streamed answer using the AI-SDK protocol,
 * so the caller can pipe it exactly like getStreamTextResult().
 * `streamImpl` is the injection seam for tests.
 */
export function synthesize(
  prompt: string,
  results: WorkerResult[],
  model: unknown,
  streamImpl: typeof streamText = streamText,
) {
  const body = results
    .map(
      (r, i) =>
        `## Result ${i + 1} (for: ${r.subtask})\n${r.status === "ok" ? r.result : `[failed: ${r.error}]`}`,
    )
    .join("\n\n");
  return streamImpl({
    model: model as Parameters<typeof streamText>[0]["model"],
    system: SYNTH_SYSTEM,
    messages: [
      {
        role: "user",
        content: `User's original request:\n${prompt}\n\nSub-task results:\n${body}`,
      },
    ],
    maxOutputTokens: 4096,
  });
}

export interface OrchestrateDeps {
  plan?: typeof planSubtasks;
  runWorkers?: typeof runParallel;
  synth?: typeof synthesize;
  singleStream?: typeof getStreamTextResult;
  makeModel?: typeof createModel;
}

/**
 * Decide single vs parallel and return a pipeable streamText result either way.
 * Both getStreamTextResult() and synthesize() return objects exposing
 * pipeUIMessageStreamToResponse(), so the controller pipes the result uniformly.
 */
export async function orchestrate(agentParams: AiSdkAdvisorParams, deps: OrchestrateDeps = {}) {
  const plan = deps.plan ?? planSubtasks;
  const runWorkers = deps.runWorkers ?? runParallel;
  const synth = deps.synth ?? synthesize;
  const singleStream = deps.singleStream ?? getStreamTextResult;
  const makeModel = deps.makeModel ?? createModel;

  const prompt = extractLatestUserContent(agentParams);
  const model = makeModel(agentParams);
  const decision = await plan(prompt, model);

  logStructured(
    "processing",
    `advisor plan: ${decision.mode} (${decision.subtasks.length} subtask(s))${
      decision.mode === "parallel" ? ` → [${decision.subtasks.join(" | ")}]` : ""
    }`,
    "orchestrate",
    "orchestrator.ts",
  );

  if (decision.mode === "single") {
    return singleStream(agentParams);
  }
  const results = await runWorkers(decision.subtasks, agentParams);
  return synth(prompt, results, model);
}
