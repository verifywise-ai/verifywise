/**
 * LLM-facing tool definition for `agent_create_task`.
 *
 * Mirrors `./schema.ts` (the strict Zod schema). The two are kept in sync
 * by hand because they serve different consumers (LLM vs TS runtime) and
 * the shapes don't round-trip cleanly.
 *
 * Required fields here match the UI's CreateTask modal. The LLM is told
 * NOT to call this tool until every required field is filled — see the
 * description below and the "AI write tools" carve-out in
 * `Servers/advisor/prompts.ts`.
 */

import type { AiActionToolDefinition } from "../types";

const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["Open", "In Progress", "Completed"];

export const createTaskToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_create_task",
    description:
      "Propose creating a new task. This is a WRITE action — it does NOT execute immediately. Instead, it files an approval request and returns a pending_approval status. A human Admin must approve before the task is actually created.\n\nIMPORTANT — collecting required fields:\n1. Use this tool ONLY when the user explicitly asks to create, add, or log a new task.\n2. Parse the user's first prompt for every required field listed below. Do NOT invent or default values you cannot derive from what the user actually said.\n3. If ANY required field is missing after parsing, do NOT call this tool. Instead, send ONE message listing every missing field and asking the user to provide them all in their next reply.\n4. For `assignees`: the user will mention people by name or email. You MUST call `list_users` first to resolve each mention to a numeric user id, then pass the ids in the `assignees` array. Never guess ids.\n5. For `due_date`: tasks with status 'Open' must have a future due date — the backend will reject past dates. If the user says 'tomorrow' or 'next Friday', convert to an ISO date (YYYY-MM-DD).\n6. Once you have ALL required fields, call this tool exactly once. Then tell the user to open Pending Approvals.\n\nIf this tool returns a validation_failed error, read the error messages, ask the user for the specific values that failed, and retry — do not loop.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short, specific task title (e.g., 'Review ISO 42001 policy draft'). Required. 1–255 characters.",
        },
        description: {
          type: "string",
          description: "Optional free-text description of the task. Max 256 characters.",
        },
        priority: {
          type: "string",
          enum: PRIORITIES,
          description:
            "Task priority. Required. Default 'Medium' in the UI — only pick another value if the user gave a clear hint (e.g., 'urgent', 'critical' → 'High'; 'minor', 'nice to have' → 'Low').",
        },
        status: {
          type: "string",
          enum: STATUSES,
          description:
            "Initial status for the task. Required. Use 'Open' for brand-new tasks unless the user explicitly says otherwise.",
        },
        due_date: {
          type: "string",
          description:
            "Target completion date as an ISO date string (YYYY-MM-DD). Required. Must be a future date when status is 'Open' — the backend rejects past dates for open tasks.",
        },
        assignees: {
          type: "array",
          items: { type: "number" },
          description:
            "Array of user ids (numbers) to assign the task to. Required — at least one. If the user mentions people by name, call `list_users` first to resolve each name to an id, then include the numeric ids here. Never guess ids.",
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description: "Optional category tags. Up to 10 items, each 1–50 characters.",
        },
      },
      required: ["title", "priority", "status", "due_date", "assignees"],
    },
  },
};
