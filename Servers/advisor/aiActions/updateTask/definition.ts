/**
 * LLM-facing tool definition for `agent_update_task`.
 */

import type { AiActionToolDefinition } from "../types";

const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["Open", "In Progress", "Completed"];

export const updateTaskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_update_task",
    description:
      "Propose updating fields on an existing task. This is a WRITE action — files an approval request. Use this for status changes, priority changes, reassignment, deadline changes, title/description edits — any field change on a task goes through this tool.\n\nIMPORTANT — target resolution:\n1. If the user did NOT provide a task id, call fetch_tasks FIRST to find candidates. If one match, confirm with user. If multiple, list them and ask.\n2. Include ONLY fields the user wants to change.\n3. For assignees: pass the FULL replacement array (not just additions). If adding someone, first fetch current assignees and merge.\n4. For user-id fields: call list_users to resolve names to ids.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "Id of the task to update. Required. Resolve via fetch_tasks if needed.",
        },
        title: {
          type: "string",
          description: "New task title. Optional. 1-255 characters.",
        },
        description: {
          type: "string",
          description: "New description. Optional. Max 256 characters.",
        },
        priority: {
          type: "string",
          enum: PRIORITIES,
          description: "New priority. Optional.",
        },
        status: {
          type: "string",
          enum: STATUSES,
          description: "New status. Optional. Open -> In Progress -> Completed.",
        },
        due_date: {
          type: "string",
          description: "New due date. Optional. ISO date (YYYY-MM-DD).",
        },
        assignees: {
          type: "array",
          items: { type: "number" },
          description:
            "Replacement assignee list (user ids). Optional. Replaces all current assignees.",
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description: "Replacement category tags. Optional. Up to 10 items, each 1-50 chars.",
        },
      },
      required: ["task_id"],
    },
  },
};
