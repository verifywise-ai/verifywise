/**
 * Render a short human-readable preview of the proposed task — shown to
 * the approver in the Pending Approvals UI so they can decide without
 * digging into the raw JSON payload.
 *
 * Pure function, no I/O. Safe to call at file-time (when we stash the
 * string in `entity_data.preview`) and at display-time.
 */

import type { AgentCreateTaskInput } from "./schema";

export function renderCreateTaskPreview(input: AgentCreateTaskInput): string {
  const details: string[] = [];
  details.push(`${input.priority} priority`);
  details.push(`status: ${input.status}`);
  details.push(`due ${input.due_date}`);
  details.push(
    `${input.assignees.length} assignee${input.assignees.length === 1 ? "" : "s"}`,
  );
  return `Create task "${input.title}" (${details.join("; ")})`;
}
