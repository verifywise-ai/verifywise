import { useCallback, useState } from "react";
import {
  postCommandPlan,
  executeCommand,
  type CommandStep,
  type StepStatusEvent,
} from "../repository/commandPlane.repository";

/**
 * React state hook for the advisor command plane: plan a natural-language
 * command into ordered steps, then execute them as an SSE stream, surfacing
 * per-step status updates as they arrive.
 *
 * @param llmKeyId Optional LLM key to plan/execute with (mirrors the advisor
 *   chat's selected key).
 */
export const useCommandPlane = (llmKeyId?: number) => {
  const [steps, setSteps] = useState<CommandStep[]>([]);
  const [statuses, setStatuses] = useState<Record<number, StepStatusEvent>>({});
  const [isRunning, setIsRunning] = useState(false);

  /** Plan a command into ordered steps. Resets any prior statuses. */
  const plan = useCallback(
    async (command: string): Promise<CommandStep[]> => {
      const { steps: planned } = await postCommandPlan(command, llmKeyId);
      setSteps(planned);
      setStatuses({});
      return planned;
    },
    [llmKeyId],
  );

  /**
   * Execute the currently-planned steps, streaming status events. Each event
   * is merged into `statuses` keyed by `stepOrder` so the latest status for a
   * step always wins.
   */
  const run = useCallback(async (): Promise<void> => {
    if (steps.length === 0) return;

    setIsRunning(true);
    try {
      await executeCommand(
        steps,
        (event) => {
          setStatuses((prev) => ({ ...prev, [event.stepOrder]: event }));
        },
        { llmKeyId },
      );
    } finally {
      setIsRunning(false);
    }
  }, [steps, llmKeyId]);

  return { steps, statuses, plan, run, isRunning };
};
