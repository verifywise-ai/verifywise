/**
 * Diff-aware preview rendering for `agent_update_task`.
 * Same pattern as updateRisk/preview.ts.
 */

import type { ITask } from "../../../domain.layer/interfaces/i.task";
import type { AgentUpdateTaskInput } from "./schema";
import { AGENT_UPDATE_TASK_UPDATABLE_FIELDS } from "./schema";

export function renderUpdateTaskDiffPreview(
  input: AgentUpdateTaskInput,
  currentTask: ITask | null,
): string {
  if (!currentTask) {
    return `Update task #${input.task_id} (task not found — the update will fail when approved)`;
  }

  const name = currentTask.title ?? `#${input.task_id}`;
  const changes: string[] = [];

  for (const { inputKey, dbKey } of AGENT_UPDATE_TASK_UPDATABLE_FIELDS) {
    const newValue = input[inputKey as keyof AgentUpdateTaskInput];
    if (newValue === undefined) continue;

    const currentValue = currentTask[dbKey as keyof ITask];
    if (valuesEqual(currentValue, newValue)) continue;

    changes.push(
      `${inputKey.replace(/_/g, " ")}: ${formatValue(currentValue)} -> ${formatValue(newValue)}`,
    );
  }

  if (input.assignees !== undefined) {
    changes.push(`assignees replaced with [${input.assignees.join(", ")}]`);
  }

  if (changes.length === 0) {
    return `Update task "${name}" (no effective changes)`;
  }

  return `Update task "${name}": ${changes.join("; ")}`;
}

export function renderUpdateTaskPreview(input: AgentUpdateTaskInput): string {
  const touched: string[] = [];
  for (const { inputKey } of AGENT_UPDATE_TASK_UPDATABLE_FIELDS) {
    if (input[inputKey as keyof AgentUpdateTaskInput] !== undefined) {
      touched.push(inputKey.replace(/_/g, " "));
    }
  }
  if (input.assignees !== undefined) touched.push("assignees");

  if (touched.length === 0) {
    return `Update task #${input.task_id} (no fields)`;
  }
  return `Update task #${input.task_id}: ${touched.join(", ")}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "string") {
    return value.length > 60 ? `"${value.slice(0, 57)}..."` : `"${value}"`;
  }
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && typeof b === "string") {
    return a.toISOString().slice(0, 10) === b.slice(0, 10);
  }
  if (b instanceof Date && typeof a === "string") {
    return b.toISOString().slice(0, 10) === a.slice(0, 10);
  }
  return false;
}
