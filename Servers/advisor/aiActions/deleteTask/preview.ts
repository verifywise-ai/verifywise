/**
 * Preview rendering for `agent_delete_task`.
 */

import type { AgentDeleteTaskInput } from "./schema";

export interface CurrentTaskForDelete {
  title?: string;
  status?: string;
  priority?: string;
}

export function renderDeleteTaskDetailedPreview(
  input: AgentDeleteTaskInput,
  currentTask: CurrentTaskForDelete | null,
): string {
  if (!currentTask) {
    return `Delete task #${input.task_id} (task not found)`;
  }

  const name = currentTask.title ?? `#${input.task_id}`;
  const details: string[] = [];
  if (currentTask.status) details.push(currentTask.status);
  if (currentTask.priority) details.push(currentTask.priority);
  const detailText = details.length ? ` (${details.join("; ")})` : "";
  const reasonText = input.reason ? ` -- reason: "${input.reason}"` : "";

  return `Delete task "${name}"${detailText}${reasonText}`;
}

export function renderDeleteTaskPreview(input: AgentDeleteTaskInput): string {
  const reasonText = input.reason ? ` -- reason: "${input.reason}"` : "";
  return `Delete task #${input.task_id}${reasonText}`;
}
