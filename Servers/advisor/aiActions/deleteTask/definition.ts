/**
 * LLM-facing tool definition for `agent_delete_task`.
 */

import type { AiActionToolDefinition } from "../types";

export const deleteTaskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_delete_task",
    description:
      "Propose soft-deleting a task. Files an approval request. The task's status is set to 'Deleted' — it stays in the DB for audit but disappears from the active task list.\n\nTarget resolution: if the user didn't specify an id, call fetch_tasks first. ALWAYS confirm before calling: 'I will delete task \"X\" (ID: N). Proceed?'",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "Id of the task to delete. Required. Resolve via fetch_tasks.",
        },
        reason: {
          type: "string",
          description: "Optional reason for deletion. Max 512 characters.",
        },
      },
      required: ["task_id"],
    },
  },
};
